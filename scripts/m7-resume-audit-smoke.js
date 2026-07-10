#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createJobStore } = require("../server/src/sqlite-store");
const { runScreeningAgent } = require("../server/src/screening-agent");
const { runResumeAgent } = require("../server/src/resume-agent");
const { runAuditAgent } = require("../server/src/audit-agent");
const { renderResumeDocx } = require("../server/src/document-renderer");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const storeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m7-store-"));
  const apiDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m7-api-"));
  try {
    const storeResult = await runStoreChecks(storeDataDir);
    const apiResult = await runApiChecks(apiDataDir);
    const wiring = runWiringChecks();
    const checks = {
      ...storeResult.checks,
      ...apiResult.checks,
      ...wiring.checks
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      storeResult: storeResult.summary,
      apiResult: apiResult.summary
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    fs.rmSync(storeDataDir, { recursive: true, force: true });
    fs.rmSync(apiDataDir, { recursive: true, force: true });
  }
}

async function runStoreChecks(dataDir) {
  const store = createJobStore({ dataDir });
  try {
    seedProfile(store);
    store.syncJobs(createPayload());
    const application = store.getApplications().applications[0];
    const screeningInput = store.getApplicationScreeningInput(application.id);
    const screeningAgent = await runScreeningAgent(screeningInput, { mode: "rules" });
    const screeningRun = store.finishAgentRun(store.startAgentRun({
      agentName: "ScreeningAgent",
      applicationId: application.id,
      step: "score_job",
      provider: "rules",
      input: screeningInput
    }).id, {
      status: "SUCCEEDED",
      provider: "rules",
      output: screeningAgent.result
    });
    const screening = store.createScreening({
      applicationId: application.id,
      agentRunId: screeningRun.id,
      provider: "rules",
      result: screeningAgent.result
    }).screening;
    const resumeCandidatesBefore = store.getResumeCandidates({ limit: 10 });

    const resumeInput = store.getApplicationResumeInput(application.id);
    const resumeAgent = runResumeAgent(resumeInput, { mode: "rules" });
    const resumeRun = store.finishAgentRun(store.startAgentRun({
      agentName: "ResumeAgent",
      applicationId: application.id,
      step: "prepare_resume",
      provider: "rules",
      input: resumeInput
    }).id, {
      status: "SUCCEEDED",
      provider: resumeAgent.provider,
      output: resumeAgent.result
    });
    let resumeVersion = store.createResumeVersion({
      applicationId: application.id,
      screeningId: screening.id,
      agentRunId: resumeRun.id,
      provider: resumeAgent.provider,
      result: resumeAgent.result
    }).resumeVersion;
    const rendered = await renderResumeDocx(resumeVersion, {
      outputDir: path.join(dataDir, "generated_resumes")
    });
    resumeVersion = store.attachResumeFile(resumeVersion.id, rendered);
    const auditAgent = runAuditAgent({
      resumeVersionId: resumeVersion.id,
      job: resumeInput.job,
      screening,
      profile: resumeInput.profile,
      resumeFields: resumeVersion.resumeFields,
      sourceMapping: resumeVersion.sourceMapping,
      unsupportedClaims: resumeVersion.unsupportedClaims,
      renderMetadata: resumeVersion.renderMetadata
    }, { mode: "rules" });
    const auditRun = store.finishAgentRun(store.startAgentRun({
      agentName: "AuditAgent",
      applicationId: application.id,
      step: "audit_resume",
      provider: "rules",
      input: { resumeVersionId: resumeVersion.id }
    }).id, {
      status: "SUCCEEDED",
      provider: auditAgent.provider,
      output: auditAgent.result
    });
    const auditResult = store.createResumeAudit({
      resumeVersionId: resumeVersion.id,
      agentRunId: auditRun.id,
      provider: auditAgent.provider,
      result: auditAgent.result
    });
    const audit = auditResult.resumeAudit;
    resumeVersion = auditResult.resumeVersion;
    const resumeCandidatesAfter = store.getResumeCandidates({ limit: 10 });
    const stats = store.getStats();
    const applications = store.getApplications();
    const versions = store.getResumeVersions({ applicationId: application.id });
    const audits = store.getResumeAudits({ applicationId: application.id });

    return {
      checks: {
        storeRunsResumeAgent: resumeAgent.result.resumeFields.projects.length >= 1
          && resumeAgent.result.sourceMapping.length >= 3
          && resumeAgent.result.unsupportedClaims.length === 0,
        storePersistsResumeVersion: versions.totalResumeVersions === 1
          && resumeVersion.status === "APPROVED"
          && resumeVersion.fileFormat === "docx",
        storeRendersDocx: fs.existsSync(resumeVersion.filePath)
          && fs.statSync(resumeVersion.filePath).size > 1000,
        storeRunsAuditAgent: audit.recommendation === "approve"
          && audit.truthfulnessPassed
          && audit.pageLimitPassed,
        storePersistsResumeAudit: audits.totalResumeAudits === 1
          && stats.resumeAuditCount === 1
          && stats.resumeVersionCount === 1,
        storeAdvancesOnlyToResumeAudited: applications.applications[0]?.status === "RESUME_AUDITED",
        storeListsResumeCandidatesBeforeDraft: resumeCandidatesBefore.totalCandidates === 1
          && resumeCandidatesBefore.candidates[0]?.id === application.id
          && resumeCandidatesBefore.candidates[0]?.screeningId === screening.id,
        storeExcludesResumeCandidatesAfterDraft: resumeCandidatesAfter.totalCandidates === 0
      },
      summary: {
        finalStatus: applications.applications[0]?.status,
        resumeVersionId: resumeVersion.id,
        auditStatus: audit.status,
        docxBytes: fs.statSync(resumeVersion.filePath).size,
        resumeCandidatesBefore: resumeCandidatesBefore.totalCandidates,
        resumeCandidatesAfter: resumeCandidatesAfter.totalCandidates
      }
    };
  } finally {
    store.close();
  }
}

async function runApiChecks(dataDir) {
  const port = 28000 + Math.floor(Math.random() * 1000);
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
    const resumeCandidatesBefore = await requestJson(port, "GET", "/api/resume-candidates?limit=10");
    const prepared = await requestJson(port, "POST", `/api/applications/${applicationId}/prepare-resume`, {
      mode: "rules",
      renderDocx: true
    });
    const resumeCandidatesAfter = await requestJson(port, "GET", "/api/resume-candidates?limit=10");
    const audited = await requestJson(port, "POST", `/api/resume-versions/${prepared.resumeVersion.id}/audit`, {
      mode: "rules"
    });
    const versions = await requestJson(port, "GET", `/api/resume-versions?applicationId=${applicationId}&limit=10`);
    const audits = await requestJson(port, "GET", `/api/resume-audits?applicationId=${applicationId}&limit=10`);
    const runs = await requestJson(port, "GET", `/api/agent-runs?applicationId=${applicationId}&limit=10`);
    const after = await requestJson(port, "GET", "/api/applications?limit=10");
    const stats = await requestJson(port, "GET", "/api/stats");

    return {
      checks: {
        apiPreparesResume: prepared.ok
          && prepared.resumeVersion.status === "DRAFTED"
          && prepared.resumeVersion.fileFormat === "docx"
          && fs.existsSync(prepared.resumeVersion.filePath),
        apiAuditsResume: audited.ok
          && audited.resumeAudit.recommendation === "approve"
          && audited.resumeVersion.status === "APPROVED",
        apiListsResumeVersionsAndAudits: versions.totalResumeVersions === 1
          && audits.totalResumeAudits === 1,
        apiRecordsResumeAndAuditRuns: runs.runs.some((run) => run.agentName === "ResumeAgent")
          && runs.runs.some((run) => run.agentName === "AuditAgent"),
        apiAdvancesOnlyToResumeAudited: after.applications[0]?.status === "RESUME_AUDITED",
        apiStatsExposeM7Counts: stats.schemaVersion >= 6
          && stats.resumeVersionCount === 1
          && stats.resumeAuditCount === 1,
        apiListsResumeCandidatesBeforeDraft: resumeCandidatesBefore.totalCandidates === 1
          && resumeCandidatesBefore.candidates[0]?.id === applicationId
          && resumeCandidatesBefore.candidates[0]?.recommendation === "auto_prepare",
        apiExcludesResumeCandidatesAfterDraft: resumeCandidatesAfter.totalCandidates === 0
      },
      summary: {
        finalStatus: after.applications[0]?.status,
        resumeVersionId: prepared.resumeVersion.id,
        auditStatus: audited.resumeAudit.status,
        runCount: runs.totalAgentRuns,
        resumeCandidatesBefore: resumeCandidatesBefore.totalCandidates,
        resumeCandidatesAfter: resumeCandidatesAfter.totalCandidates
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
  const migrationSql = read("server/migrations/007_resume_workflow.sql");
  const packageJson = read("package.json");
  return {
    checks: {
      serverExposesResumeEndpoints: serverJs.includes("/prepare-resume")
        && serverJs.includes("/api/resume-candidates")
        && serverJs.includes("/api/resume-versions")
        && serverJs.includes("/api/resume-audits")
        && serverJs.includes("/audit"),
      serverUsesResumeAuditAndRenderer: serverJs.includes("runResumeAgent")
        && serverJs.includes("runAuditAgent")
        && serverJs.includes("renderResumeDocx"),
      storeDefinesM7Tables: migrationSql.includes("CREATE TABLE IF NOT EXISTS resume_versions")
        && migrationSql.includes("CREATE TABLE IF NOT EXISTS resume_audits"),
      storeDefinesM7Persistence: storeJs.includes("createResumeVersion(input")
        && storeJs.includes("createResumeAudit(input")
        && storeJs.includes("getApplicationResumeInput")
        && storeJs.includes("getResumeCandidates(options"),
      packageRunsM7Smoke: packageJson.includes("m7:resume-audit:smoke")
        && packageJson.includes("check:syntax")
    }
  };
}

function seedProfile(store) {
  store.updateProfile({
    displayName: "Candidate",
    headline: "AI Product / Node.js Workflow Builder",
    target: {
      roles: ["AI product manager", "Node.js", "BOSS automation"],
      cities: ["Nanning"]
    }
  });
  store.createSkill({ name: "Node.js", category: "engineering", proficiency: "proficient" });
  store.createSkill({ name: "SQLite", category: "database", proficiency: "proficient" });
  store.createSkill({ name: "Chrome Extension", category: "browser", proficiency: "familiar" });
  store.createExperience({
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

async function seedProfileViaApi(port) {
  await requestJson(port, "PUT", "/api/profile", {
    displayName: "Candidate",
    headline: "AI Product / Node.js Workflow Builder",
    target: {
      roles: ["AI product manager", "Node.js", "BOSS automation"],
      cities: ["Nanning"]
    }
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
    source: "m7-resume-audit-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId: "m7-resume-one",
        title: "AI Product Manager Node.js",
        company: "Alpha",
        salary: "20-30K",
        location: "Nanning",
        experience: "1-3 years",
        education: "Bachelor",
        tags: ["Node.js", "SQLite", "Chrome Extension", "AI Agent"],
        welfare: ["Remote friendly"],
        detailUrl: "https://www.zhipin.com/job_detail/m7-resume-one.html",
        description: [
          "We need an AI product manager who can own BOSS automation workflow design.",
          "The role requires Node.js, SQLite, Chrome Extension, browser task queue, and local-first data workflow experience.",
          "Responsibilities include job capture quality analysis, applications state machine design, retryable browser tasks, and agent screening strategy.",
          "Candidates with hands-on resume fact library and screening workflow experience are preferred."
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
