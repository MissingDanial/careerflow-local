#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createJobStore } = require("../server/src/sqlite-store");
const { runScreeningAgent } = require("../server/src/screening-agent");
const { runResumeAgent } = require("../server/src/resume-agent");
const { runResumeFitEvaluator } = require("../server/src/resume-fit-evaluator");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const storeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m10-fit-store-"));
  const apiDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m10-fit-api-"));
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
    const resumeVersion = store.createResumeVersion({
      applicationId: application.id,
      screeningId: screening.id,
      agentRunId: resumeRun.id,
      provider: resumeAgent.provider,
      result: resumeAgent.result
    }).resumeVersion;
    const fitAgent = runResumeFitEvaluator({
      application,
      job: resumeInput.job,
      resumeVersion
    }, { mode: "rules" });
    const fitRun = store.finishAgentRun(store.startAgentRun({
      agentName: "ResumeFitEvaluator",
      applicationId: application.id,
      step: "evaluate_resume_fit",
      provider: "rules",
      input: { resumeVersionId: resumeVersion.id }
    }).id, {
      status: "SUCCEEDED",
      provider: fitAgent.provider,
      output: fitAgent.result
    });
    const saved = store.createResumeFitEvaluation({
      resumeVersionId: resumeVersion.id,
      agentRunId: fitRun.id,
      provider: fitAgent.provider,
      result: fitAgent.result
    }).resumeFitEvaluation;
    const listed = store.getResumeFitEvaluations({ applicationId: application.id, limit: 10 });
    const snapshot = store.getApplicationWorkflowSnapshot(application.id);
    const planEligible = require("../server/src/workflow-orchestrator").planApplicationWorkflow(snapshot).eligibleActions;
    const stats = store.getStats();
    const after = store.getApplications().applications[0];
    return {
      checks: {
        evaluatorExtractsRequirements: fitAgent.result.jdRequirements.requirements.length >= 3,
        evaluatorScoresCoverage: fitAgent.result.coverage.score >= 50
          && fitAgent.result.coverage.items.length === fitAgent.result.jdRequirements.requirements.length,
        storePersistsFitEvaluation: saved.id > 0
          && saved.resumeVersionId === resumeVersion.id
          && saved.coverageItems.length >= 3
          && listed.totalResumeFitEvaluations === 1,
        storeStatsExposeFitEvaluationCount: stats.schemaVersion >= 9
          && stats.resumeFitEvaluationCount === 1,
        storeDoesNotAdvanceApplicationStatus: after.status === "RESUME_DRAFTED",
        workflowSnapshotIncludesFitEvaluation: snapshot.latestResumeFitEvaluation?.id === saved.id,
        workflowPlanCanMoveToAuditAfterFitGate: planEligible.some((action) => action.action === "VERIFY_RESUME_CLAIMS")
          || planEligible.some((action) => action.action === "AUDIT_RESUME")
          || planEligible.some((action) => action.action === "REVISE_RESUME_FOR_JD_FIT")
      },
      summary: {
        coverageScore: saved.coverageScore,
        fitLevel: saved.fitLevel,
        requirementCount: saved.requirementCount,
        finalStatus: after.status
      }
    };
  } finally {
    store.close();
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
      renderDocx: false
    });
    const evaluated = await requestJson(port, "POST", `/api/resume-versions/${prepared.resumeVersion.id}/evaluate-fit`, {
      mode: "rules"
    });
    const listed = await requestJson(port, "GET", `/api/resume-fit-evaluations?applicationId=${applicationId}&limit=10`);
    const fetched = await requestJson(port, "GET", `/api/resume-fit-evaluations/${evaluated.resumeFitEvaluation.id}`);
    const plan = await requestJson(port, "GET", `/api/applications/${applicationId}/workflow-plan`);
    const runs = await requestJson(port, "GET", `/api/agent-runs?applicationId=${applicationId}&limit=10`);
    const events = await requestJson(port, "GET", `/api/workflow-events?applicationId=${applicationId}&limit=50`);
    const after = await requestJson(port, "GET", "/api/applications?limit=10");
    const stats = await requestJson(port, "GET", "/api/stats");
    return {
      checks: {
        apiEvaluatesResumeFit: evaluated.ok
          && evaluated.resumeFitEvaluation.coverageScore >= 50
          && evaluated.resumeFitEvaluation.requirementCount >= 3,
        apiListsAndFetchesEvaluations: listed.totalResumeFitEvaluations === 1
          && fetched.id === evaluated.resumeFitEvaluation.id,
        apiRecordsFitAgentRun: runs.runs.some((run) => run.agentName === "ResumeFitEvaluator"),
        apiRecordsFitWorkflowEvent: events.events.some((event) => event.eventType === "RESUME_FIT_EVALUATED"),
        apiDoesNotAdvanceApplicationStatus: after.applications[0]?.status === "RESUME_DRAFTED",
        apiStatsExposeSchemaV9: stats.schemaVersion >= 9
          && stats.resumeFitEvaluationCount === 1,
        workflowPlanIncludesFitStage: plan.plan?.stages?.some((stage) => stage.id === "RESUME_FIT_EVALUATION")
      },
      summary: {
        coverageScore: evaluated.resumeFitEvaluation.coverageScore,
        finalStatus: after.applications[0]?.status,
        planNextAction: plan.plan?.nextAction?.action || ""
      }
    };
  } finally {
    server.kill();
  }
}

function runWiringChecks() {
  const packageJson = read("package.json");
  const serverJs = read("server/src/server.js");
  const storeJs = read("server/src/sqlite-store.js");
  const evaluatorJs = read("server/src/resume-fit-evaluator.js");
  const workflowJs = read("server/src/workflow-orchestrator.js");
  return {
    checks: {
      packageChecksEvaluator: packageJson.includes("server/src/resume-fit-evaluator.js")
        && packageJson.includes("scripts/m10-resume-fit-evaluator-smoke.js")
        && packageJson.includes("m10:resume-fit:smoke"),
      serverExposesFitEndpoints: serverJs.includes("/api/resume-fit-evaluations")
        && serverJs.includes("/evaluate-fit")
        && serverJs.includes("runResumeFitEvaluator"),
      storeDefinesFitSchema: storeJs.includes("CREATE TABLE IF NOT EXISTS resume_fit_evaluations")
        && storeJs.includes("resumeFitEvaluationCount")
        && storeJs.includes("createResumeFitEvaluation"),
      evaluatorKeepsNoRealBossBoundary: evaluatorJs.includes("noRealBossAction: true")
        && evaluatorJs.includes("noApplicationStatusChange: true"),
      workflowIncludesFitGate: workflowJs.includes("RESUME_FIT_EVALUATION")
        && workflowJs.includes("EVALUATE_RESUME_FIT")
    }
  };
}

function seedProfile(store) {
  store.updateProfile({
    displayName: "Candidate",
    headline: "Full-stack automation engineer",
    target: { roles: ["Node.js Backend Engineer"] },
    summary: "Builds local-first browser automation and agent workflows."
  });
  store.createExperience({
    kind: "project",
    title: "Boss Find Local Workflow",
    organization: "Personal",
    role: "Full-stack developer",
    facts: [
      "Built a Chrome Extension MV3 capture workflow with Node.js backend and SQLite storage.",
      "Implemented browser task queues, workflow events, resume generation, audit, and local-first job application state machines.",
      "Used Playwright, REST APIs, DOCX rendering, and deterministic agent scoring for job matching."
    ],
    skills: ["Node.js", "SQLite", "Chrome Extension", "Playwright", "REST API", "Agent workflow"],
    evidenceText: "Local project evidence",
    confidence: "high"
  });
  for (const name of ["Node.js", "SQLite", "Chrome Extension", "Playwright", "REST API", "Agent workflow"]) {
    store.createSkill({
      name,
      category: "engineering",
      proficiency: "working",
      evidence: ["Boss Find Local Workflow"]
    });
  }
}

async function seedProfileViaApi(port) {
  await requestJson(port, "PUT", "/api/profile", {
    displayName: "Candidate",
    headline: "Full-stack automation engineer",
    target: { roles: ["Node.js Backend Engineer"] },
    summary: "Builds local-first browser automation and agent workflows."
  });
  await requestJson(port, "POST", "/api/profile/experiences", {
    kind: "project",
    title: "Boss Find Local Workflow",
    organization: "Personal",
    role: "Full-stack developer",
    facts: [
      "Built a Chrome Extension MV3 capture workflow with Node.js backend and SQLite storage.",
      "Implemented browser task queues, workflow events, resume generation, audit, and local-first job application state machines.",
      "Used Playwright, REST APIs, DOCX rendering, and deterministic agent scoring for job matching."
    ],
    skills: ["Node.js", "SQLite", "Chrome Extension", "Playwright", "REST API", "Agent workflow"],
    evidenceText: "Local project evidence",
    confidence: "high"
  });
  for (const name of ["Node.js", "SQLite", "Chrome Extension", "Playwright", "REST API", "Agent workflow"]) {
    await requestJson(port, "POST", "/api/profile/skills", {
      name,
      category: "engineering",
      proficiency: "working",
      evidence: ["Boss Find Local Workflow"]
    });
  }
}

function createPayload() {
  const description = [
    "岗位职责：负责 Node.js 后端服务、SQLite 数据建模、Chrome Extension MV3 页面采集和浏览器任务队列开发。",
    "参与 Playwright 自动化诊断、REST API 设计、workflow events 观测、Agent workflow 编排和本地优先数据同步。",
    "任职要求：熟悉 Node.js、SQLite、Chrome Extension、Playwright、REST API、Agent workflow，有岗位匹配和简历生成经验优先。"
  ].join("\n");
  return {
    source: "m10-resume-fit-smoke",
    page: {
      url: "https://www.zhipin.com/web/geek/jobs",
      title: "BOSS jobs"
    },
    exportedAt: new Date().toISOString(),
    jobs: [{
      jobId: "m10-fit-one",
      title: "Node.js Backend Engineer",
      company: "Local AI Workflow",
      salary: "20-30K",
      location: "Shanghai",
      experience: "3-5年",
      education: "本科",
      tags: ["Node.js", "SQLite", "Chrome Extension", "Playwright", "REST API", "Agent workflow"],
      welfare: ["双休"],
      description,
      detailUrl: "https://www.zhipin.com/job_detail/m10-fit-one.html"
    }]
  };
}

function requestJson(port, method, pathname, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? "" : JSON.stringify(body);
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    }, (response) => {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        data += chunk;
      });
      response.on("end", () => {
        const parsed = data ? JSON.parse(data) : null;
        if (response.statusCode >= 400) {
          reject(new Error(parsed?.error || `HTTP ${response.statusCode}`));
          return;
        }
        resolve(parsed);
      });
    });
    request.on("error", reject);
    request.end(payload);
  });
}

async function waitForHealth(port) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      const response = await requestJson(port, "GET", "/health");
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Timed out waiting for backend health");
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
