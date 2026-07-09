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
  const apiDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m8-greeting-api-"));
  try {
    const apiResult = await runApiChecks(apiDataDir);
    const wiring = runWiringChecks();
    const checks = {
      ...apiResult.checks,
      ...wiring.checks
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({ ok, checks, apiResult: apiResult.summary }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    fs.rmSync(apiDataDir, { recursive: true, force: true });
  }
}

async function runApiChecks(dataDir) {
  const port = 30000 + Math.floor(Math.random() * 1000);
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
    const audited = await requestJson(port, "POST", `/api/resume-versions/${prepared.resumeVersion.id}/audit`, {
      mode: "rules"
    });
    await requestJson(port, "POST", `/api/resume-versions/${audited.resumeVersion.id}/approve-local`, {
      approver: "smoke",
      note: "ready for greeting dry-run"
    });
    const greeting = await requestJson(port, "POST", `/api/applications/${applicationId}/prepare-greeting`, {
      mode: "rules",
      resumeVersionId: audited.resumeVersion.id,
      dryRun: true
    });
    const messages = await requestJson(port, "GET", `/api/messages?applicationId=${applicationId}&limit=10`);
    const tasks = await requestJson(port, "GET", "/api/browser-tasks?limit=20");
    const claimed = await requestJson(port, "POST", "/api/browser-tasks/claim", {
      taskTypes: ["SEND_GREETING"]
    });
    const diagnostics = await requestJson(port, "GET", "/api/browser-tasks/diagnostics?limit=20");
    const events = await requestJson(port, "GET", "/api/application-events?limit=20");
    const after = await requestJson(port, "GET", "/api/applications?limit=10");
    const stats = await requestJson(port, "GET", "/api/stats");

    return {
      checks: {
        apiPreparesGreetingDraft: greeting.ok
          && greeting.message.messageText.includes("您好")
          && greeting.message.status === "DRAFT"
          && greeting.message.channel === "boss_greeting",
        apiCreatesConversationAndMessage: greeting.conversation.id > 0
          && messages.totalMessages === 1
          && messages.messages[0]?.id === greeting.message.id,
        apiCreatesOnlyDryRunSendGreetingTask: greeting.browserTask.taskType === "SEND_GREETING"
          && greeting.browserTask.payload.dryRun === true
          && greeting.browserTask.payload.messageId === greeting.message.id,
        apiKeepsApplicationAtGreetingReady: after.applications[0]?.status === "GREETING_READY",
        apiDoesNotCreateUploadOrSubmitTasks: tasks.tasks.every((task) => !["UPLOAD_RESUME", "SUBMIT_APPLICATION"].includes(task.taskType)),
        apiCanClaimSendGreetingDryRun: claimed.claimed === true
          && claimed.task.id === greeting.browserTask.id
          && claimed.task.status === "RUNNING",
        apiDiagnosticsIncludeSendGreeting: diagnostics.recentTasks.some((task) => task.taskType === "SEND_GREETING"),
        apiRecordsGreetingDraftEvent: events.events.some((event) => event.eventType === "GREETING_DRAFTED"
          && event.metadata?.messageId === greeting.message.id
          && event.metadata?.dryRun === true),
        apiStatsExposeM8Counts: stats.conversationCount === 1 && stats.messageCount === 1
      },
      summary: {
        applicationId,
        resumeVersionId: audited.resumeVersion.id,
        messageId: greeting.message.id,
        browserTaskId: greeting.browserTask.id,
        finalStatus: after.applications[0]?.status,
        browserTaskTypes: tasks.tasks.map((task) => task.taskType)
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
  const optionsHtml = read("extension/src/options.html");
  const optionsJs = read("extension/src/options.js");
  const packageJson = read("package.json");
  return {
    checks: {
      serverExposesGreetingEndpoints: serverJs.includes("/prepare-greeting")
        && serverJs.includes('url.pathname === "/api/messages"')
        && serverJs.includes("runMessageAgent"),
      storePersistsConversationsAndMessages: storeJs.includes("CREATE TABLE IF NOT EXISTS conversations")
        && storeJs.includes("CREATE TABLE IF NOT EXISTS messages")
        && storeJs.includes("createGreetingDraft"),
      storeCreatesSendGreetingDryRunTask: storeJs.includes('taskType: "SEND_GREETING"')
        && storeJs.includes("dryRun: true")
        && storeJs.includes("noRealBossAction"),
      extensionProxiesGreetingMessages: backgroundJs.includes('case "GET_MESSAGES"')
        && backgroundJs.includes('case "PREPARE_GREETING"')
        && backgroundJs.includes("/api/messages")
        && backgroundJs.includes("/prepare-greeting"),
      optionsHasGreetingDryRunPanel: optionsHtml.includes("打招呼 dry-run")
        && optionsHtml.includes('id="prepareGreetingDryRun"')
        && optionsHtml.includes('id="greetingMessages"')
        && optionsJs.includes("prepareGreetingDryRun")
        && optionsJs.includes("PREPARE_GREETING"),
      packageRunsThisSmoke: packageJson.includes("m8-greeting-dry-run-smoke.js")
        && packageJson.includes("m8:greeting-dry-run:smoke")
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
      "Implemented local-first resume fact library, screening workflow, and resume audit flow."
    ],
    skills: ["Node.js", "SQLite", "Chrome Extension"],
    evidenceText: "Confirmed project facts from local resume source.",
    confidence: "user_confirmed"
  });
}

function createPayload() {
  return {
    source: "m8-greeting-dry-run-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId: "m8-greeting-one",
        title: "AI Product Manager Node.js",
        company: "Greeting Co",
        salary: "20-30K",
        location: "Nanning",
        experience: "1-3 years",
        education: "Bachelor",
        recruiter: "李经理",
        tags: ["Node.js", "SQLite", "Chrome Extension", "AI Agent"],
        welfare: ["Remote friendly"],
        detailUrl: "https://www.zhipin.com/job_detail/m8-greeting-one.html",
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
