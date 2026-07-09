#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const apiDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m7-approval-api-"));
  try {
    const result = await runApiChecks(apiDataDir);
    const wiring = runWiringChecks();
    const checks = {
      ...result.checks,
      ...wiring.checks
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({ ok, checks, apiResult: result.summary }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    fs.rmSync(apiDataDir, { recursive: true, force: true });
  }
}

async function runApiChecks(dataDir) {
  const port = 29000 + Math.floor(Math.random() * 1000);
  const server = spawn(process.execPath, ["server/src/server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      BOSS_DATA_DIR: dataDir,
      BOSS_SKIP_LEGACY_IMPORT: "1",
      PORT: String(port)
    },
    stdio: ["ignore", "ignore", "ignore"]
  });

  try {
    await waitForHealth(port);
    await seedProfileViaApi(port);
    await requestJson(port, "POST", "/api/jobs/sync", createPayload());
    const applications = await requestJson(port, "GET", "/api/applications?limit=10");
    const applicationId = applications.applications[0]?.id;
    await requestJson(port, "POST", `/api/applications/${applicationId}/screen`, { mode: "rules" });
    const prepared = await requestJson(port, "POST", `/api/applications/${applicationId}/prepare-resume`, {
      mode: "rules",
      renderDocx: true
    });
    const revised = await requestJson(port, "POST", `/api/resume-versions/${prepared.resumeVersion.id}/revise`, {
      resumeFields: {
        summary: "用户确认后的本地修订摘要，突出 Node.js、SQLite、Chrome Extension 和 Agent 工作流。",
        skills: ["Node.js", "SQLite", "Chrome Extension", "Agent Workflow"],
        projects: [
          {
            bullets: [
              "将岗位采集、筛选、简历生成和审核串联为本地闭环。",
              "保留证据映射和版本历史，便于投递前复盘。"
            ]
          }
        ],
        awards: ["Local-first workflow validation"]
      },
      reason: "smoke_revision",
      renderDocx: true
    });
    const audited = await requestJson(port, "POST", `/api/resume-versions/${revised.resumeVersion.id}/audit`, {
      mode: "rules"
    });
    const approved = await requestJson(port, "POST", `/api/resume-versions/${audited.resumeVersion.id}/approve-local`, {
      approver: "smoke",
      note: "approved for greeting dry-run"
    });
    const versions = await requestJson(port, "GET", `/api/resume-versions?applicationId=${applicationId}&limit=10`);
    const tasks = await requestJson(port, "GET", "/api/browser-tasks?limit=20");
    const events = await requestJson(port, "GET", "/api/application-events?limit=20");
    const after = await requestJson(port, "GET", "/api/applications?limit=10");

    return {
      checks: {
        apiRevisesResumeAsNewVersion: revised.ok
          && revised.baseResumeVersion.id === prepared.resumeVersion.id
          && revised.resumeVersion.id !== prepared.resumeVersion.id
          && revised.resumeVersion.versionNumber === 2
          && revised.resumeVersion.metadata.revisedFromVersionId === prepared.resumeVersion.id,
        apiRerendersRevisedDocx: revised.resumeVersion.fileFormat === "docx"
          && fs.existsSync(revised.resumeVersion.filePath)
          && fs.statSync(revised.resumeVersion.filePath).size > 1000,
        apiAuditsRevisedVersion: audited.resumeAudit.recommendation === "approve"
          && audited.resumeVersion.status === "APPROVED",
        apiApprovesLocally: approved.ok
          && approved.resumeVersion.metadata.localApproval.approved
          && approved.transition.toStatus === "GREETING_READY",
        apiKeepsVersionHistory: versions.totalResumeVersions === 2,
        apiDoesNotCreateBrowserTasks: tasks.tasks.length === 0,
        apiRecordsApprovalEvent: events.events.some((event) => event.eventType === "RESUME_LOCALLY_APPROVED"),
        apiAdvancesOnlyToGreetingReady: after.applications[0]?.status === "GREETING_READY"
      },
      summary: {
        applicationId,
        baseVersionId: prepared.resumeVersion.id,
        revisedVersionId: revised.resumeVersion.id,
        finalStatus: after.applications[0]?.status,
        browserTaskCount: tasks.tasks.length
      }
    };
  } finally {
    server.kill();
    await waitForExit(server);
  }
}

function runWiringChecks() {
  const serverJs = read("server/src/server.js");
  const storeJs = read("server/src/sqlite-store.js");
  const backgroundJs = read("extension/src/background.js");
  const optionsJs = read("extension/src/options.js");
  const packageJson = read("package.json");
  return {
    checks: {
      serverExposesRevisionAndApprovalEndpoints: serverJs.includes("/revise")
        && serverJs.includes("/approve-local")
        && serverJs.includes("reviseResume("),
      storePersistsRevisionAndApproval: storeJs.includes("reviseResumeVersion")
        && storeJs.includes("approveResumeVersion")
        && storeJs.includes("RESUME_LOCALLY_APPROVED"),
      extensionProxiesRevisionAndApproval: backgroundJs.includes('case "REVISE_RESUME"')
        && backgroundJs.includes('case "APPROVE_RESUME_LOCAL"'),
      optionsHasEditorActions: optionsJs.includes("saveResumeRevision")
        && optionsJs.includes("approveResumeLocal")
        && optionsJs.includes("readResumeRevisionFields"),
      packageRunsThisSmoke: packageJson.includes("m7-resume-approval-smoke.js")
        && packageJson.includes("m7:resume-approval:smoke")
    }
  };
}

async function seedProfileViaApi(port) {
  await requestJson(port, "PUT", "/api/profile", {
    displayName: "Candidate",
    headline: "AI Product / Node.js Workflow Builder",
    target: { roles: ["AI product manager", "Node.js"], cities: ["Nanning"] }
  });
  await requestJson(port, "POST", "/api/profile/skills", { name: "Node.js", category: "engineering", proficiency: "proficient" });
  await requestJson(port, "POST", "/api/profile/skills", { name: "SQLite", category: "database", proficiency: "proficient" });
  await requestJson(port, "POST", "/api/profile/skills", { name: "Chrome Extension", category: "browser", proficiency: "familiar" });
  await requestJson(port, "POST", "/api/profile/experiences", {
    kind: "project",
    title: "Boss Find local workflow",
    organization: "Personal project",
    role: "Product and engineering owner",
    facts: [
      "Built Chrome Extension and Node.js SQLite backend for BOSS job capture.",
      "Designed applications state machine and browser task queue for retryable JD capture.",
      "Implemented local-first resume fact library and screening workflow."
    ],
    skills: ["Node.js", "SQLite", "Chrome Extension"],
    evidenceText: "Confirmed project facts from local resume source.",
    confidence: "user_confirmed"
  });
}

function createPayload() {
  return {
    source: "m7-resume-approval-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId: "m7-approval-one",
        title: "AI Product Manager Node.js",
        company: "Approval Co",
        salary: "20-30K",
        location: "Nanning",
        experience: "1-3 years",
        education: "Bachelor",
        tags: ["Node.js", "SQLite", "Chrome Extension", "AI Agent"],
        welfare: ["Remote friendly"],
        detailUrl: "https://www.zhipin.com/job_detail/m7-approval-one.html",
        description: [
          "We need an AI product manager who can own local-first application workflow design.",
          "The role requires Node.js, SQLite, Chrome Extension, browser task queue, and agent screening workflow experience.",
          "Responsibilities include job capture quality analysis, applications state machine design, retryable browser tasks, and resume audit strategy."
        ].join(" ")
      }
    ]
  };
}

function requestJson(port, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : "";
    const request = http.request({
      host: "127.0.0.1",
      port,
      method,
      path: pathname,
      headers: data ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      } : {}
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = null;
        try {
          parsed = JSON.parse(text || "{}");
        } catch {
          parsed = { raw: text };
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(parsed.error || `HTTP ${response.statusCode}`));
          return;
        }
        resolve(parsed);
      });
    });
    request.on("error", reject);
    if (data) {
      request.write(data);
    }
    request.end();
  });
}

async function waitForHealth(port) {
  const deadline = Date.now() + 8000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await requestJson(port, "GET", "/health");
      return;
    } catch (error) {
      lastError = error;
      await sleep(150);
    }
  }
  throw lastError || new Error("Timed out waiting for server");
}

function waitForExit(processHandle) {
  return new Promise((resolve) => {
    processHandle.once("exit", resolve);
    setTimeout(resolve, 1500);
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
