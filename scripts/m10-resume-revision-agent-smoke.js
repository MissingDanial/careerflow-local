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
const { runClaimVerifier } = require("../server/src/claim-verifier");
const { runResumeRevisionAgent } = require("../server/src/resume-revision-agent");
const { planApplicationWorkflow } = require("../server/src/workflow-orchestrator");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const storeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m10-revision-store-"));
  const apiDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m10-revision-api-"));
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
    const seeded = await seedApplicationWithChecks(store);
    const beforeApplication = store.getApplications().applications[0];
    const beforeBrowserTasks = store.countBrowserTasks();
    const revisionAgent = runResumeRevisionAgent({
      application: seeded.application,
      job: seeded.resumeInput.job,
      profile: store.getProfile(),
      resumeVersion: seeded.resumeVersion,
      resumeFitEvaluation: seeded.fitEvaluation,
      resumeClaimVerification: seeded.claimVerification
    }, { mode: "rules" });
    const revisionRun = store.finishAgentRun(store.startAgentRun({
      agentName: "ResumeRevisionAgent",
      applicationId: seeded.application.id,
      step: "revise_resume_from_checks",
      provider: "rules",
      input: { resumeVersionId: seeded.resumeVersion.id }
    }).id, {
      status: "SUCCEEDED",
      provider: revisionAgent.provider,
      output: revisionAgent.result
    });
    const created = store.createResumeVersion({
      applicationId: seeded.application.id,
      screeningId: seeded.resumeVersion.screeningId || "",
      agentRunId: revisionRun.id,
      provider: revisionAgent.provider,
      result: revisionAgent.result,
      skipApplicationTransition: true,
      metadata: {
        generatedBy: "ResumeRevisionAgent",
        revisedFromVersionId: seeded.resumeVersion.id
      }
    }).resumeVersion;
    store.recordWorkflowEvent({
      applicationId: seeded.application.id,
      sourceType: "agent_run",
      sourceId: revisionRun.id,
      eventType: "RESUME_REVISION_PREPARED",
      severity: "info",
      status: "SUCCEEDED",
      progressCurrent: 1,
      progressTotal: 1,
      message: "Store smoke revision prepared.",
      metadata: {
        baseResumeVersionId: seeded.resumeVersion.id,
        resumeVersionId: created.id,
        noRealBossAction: true,
        noApplicationStatusChange: true,
        noBrowserTaskCreated: true
      }
    });
    const afterApplication = store.getApplications().applications[0];
    const plan = planApplicationWorkflow(store.getApplicationWorkflowSnapshot(seeded.application.id));
    const events = store.getWorkflowEvents({ applicationId: seeded.application.id, limit: 50 }).events;
    const original = store.getResumeVersion(seeded.resumeVersion.id);
    return {
      checks: {
        revisionAgentKeepsPolicyBoundary: revisionAgent.result.metadata.policy.noRealBossAction === true
          && revisionAgent.result.metadata.policy.noBrowserTaskCreated === true
          && revisionAgent.result.metadata.policy.noApplicationStatusChange === true,
        revisionAgentProducesVersionPayload: revisionAgent.result.resumeFields
          && Array.isArray(revisionAgent.result.sourceMapping)
          && Array.isArray(revisionAgent.result.diffSummary),
        storeCreatesNewVersionWithoutMutatingOld: created.id !== seeded.resumeVersion.id
          && created.versionNumber === seeded.resumeVersion.versionNumber + 1
          && original.id === seeded.resumeVersion.id,
        storeDoesNotAdvanceApplicationStatus: afterApplication.status === beforeApplication.status,
        storeDoesNotCreateBrowserTasks: store.countBrowserTasks() === beforeBrowserTasks,
        storeRecordsRevisionRunAndEvent: store.countAgentRuns({ applicationId: seeded.application.id }) >= 5
          && events.some((event) => event.eventType === "RESUME_REVISION_PREPARED"),
        workflowReEvaluationNeededForNewVersion: plan.eligibleActions.some((action) => action.action === "EVALUATE_RESUME_FIT")
      },
      summary: {
        baseResumeVersionId: seeded.resumeVersion.id,
        revisedResumeVersionId: created.id,
        finalStatus: afterApplication.status,
        browserTaskCount: store.countBrowserTasks()
      }
    };
  } finally {
    store.close();
  }
}

async function runApiChecks(dataDir) {
  const port = 31000 + Math.floor(Math.random() * 1000);
  const server = spawn(process.execPath, ["server/src/server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      BOSS_DATA_DIR: dataDir,
      BOSS_SKIP_LEGACY_IMPORT: "1",
      PORT: String(port)
    },
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true
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
    await requestJson(port, "POST", `/api/resume-versions/${prepared.resumeVersion.id}/evaluate-fit`, {
      mode: "rules"
    });
    await requestJson(port, "POST", `/api/resume-versions/${prepared.resumeVersion.id}/verify-claims`, {
      mode: "rules"
    });
    const beforeApplications = await requestJson(port, "GET", "/api/applications?limit=10");
    const beforeTasks = await requestJson(port, "GET", "/api/browser-tasks?limit=50");
    const revised = await requestJson(port, "POST", `/api/resume-versions/${prepared.resumeVersion.id}/revise-from-checks`, {
      mode: "rules",
      renderDocx: false
    });
    const afterApplications = await requestJson(port, "GET", "/api/applications?limit=10");
    const afterTasks = await requestJson(port, "GET", "/api/browser-tasks?limit=50");
    const versions = await requestJson(port, "GET", `/api/resume-versions?applicationId=${applicationId}&limit=10`);
    const runs = await requestJson(port, "GET", `/api/agent-runs?applicationId=${applicationId}&limit=20`);
    const events = await requestJson(port, "GET", `/api/workflow-events?applicationId=${applicationId}&limit=50`);
    const plan = await requestJson(port, "GET", `/api/applications/${applicationId}/workflow-plan`);
    return {
      checks: {
        apiRevisesFromChecks: revised.ok
          && revised.agentRun.agentName === "ResumeRevisionAgent"
          && revised.resumeVersion.id !== prepared.resumeVersion.id,
        apiKeepsBaseAndNewVersion: versions.totalResumeVersions === 2
          && versions.resumeVersions.some((version) => version.id === prepared.resumeVersion.id)
          && versions.resumeVersions.some((version) => version.id === revised.resumeVersion.id),
        apiDoesNotAdvanceApplicationStatus: afterApplications.applications[0]?.status === beforeApplications.applications[0]?.status,
        apiDoesNotCreateBrowserTasks: afterTasks.totalTasks === beforeTasks.totalTasks,
        apiRecordsAgentRunAndWorkflowEvent: runs.runs.some((run) => run.agentName === "ResumeRevisionAgent")
          && events.events.some((event) => event.eventType === "RESUME_REVISION_PREPARED"),
        apiNewVersionNeedsReEvaluation: plan.plan?.eligibleActions?.some((action) => action.action === "EVALUATE_RESUME_FIT"),
        apiRevisionPolicyIsLocalOnly: revised.resumeVersion.metadata?.policy?.noRealBossAction === true
          || revised.resumeVersion.metadata?.generatedBy === "ResumeRevisionAgent"
      },
      summary: {
        baseResumeVersionId: prepared.resumeVersion.id,
        revisedResumeVersionId: revised.resumeVersion.id,
        finalStatus: afterApplications.applications[0]?.status,
        taskCount: afterTasks.totalTasks,
        nextAction: plan.plan?.nextAction?.action || ""
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
  const revisionJs = read("server/src/resume-revision-agent.js");
  const workflowJs = read("server/src/workflow-orchestrator.js");
  return {
    checks: {
      packageChecksRevisionAgent: packageJson.includes("server/src/resume-revision-agent.js")
        && packageJson.includes("scripts/m10-resume-revision-agent-smoke.js")
        && packageJson.includes("m10:resume-revision:smoke"),
      serverExposesRevisionEndpoint: serverJs.includes("/revise-from-checks")
        && serverJs.includes("runResumeRevisionAgent")
        && serverJs.includes("RESUME_REVISION_PREPARED"),
      storeSupportsNoStatusChangeVersion: storeJs.includes("skipApplicationTransition")
        && storeJs.includes("RESUME_VERSION_CREATED"),
      revisionAgentKeepsNoBossBoundary: revisionJs.includes("noRealBossAction: true")
        && revisionJs.includes("noApplicationStatusChange: true")
        && revisionJs.includes("noBrowserTaskCreated: true"),
      workflowPointsRevisionActionsAtAgentEndpoint: workflowJs.includes("ResumeRevisionAgent")
        && workflowJs.includes("/revise-from-checks")
    }
  };
}

async function seedApplicationWithChecks(store) {
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
    provider: screeningAgent.provider,
    output: screeningAgent.result
  });
  const screening = store.createScreening({
    applicationId: application.id,
    agentRunId: screeningRun.id,
    provider: screeningAgent.provider,
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
    result: {
      ...resumeAgent.result,
      resumeFields: {
        ...resumeAgent.result.resumeFields,
        projects: [{
          ...(resumeAgent.result.resumeFields.projects[0] || {}),
          bullets: [
            "Built a Chrome Extension MV3 capture workflow with Node.js backend and SQLite storage.",
            "Owned a 999% revenue growth platform with no supporting evidence."
          ]
        }]
      },
      sourceMapping: resumeAgent.result.sourceMapping.filter((mapping) => mapping.resumeField !== "projects[0].bullets[1]")
    }
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
  const fitEvaluation = store.createResumeFitEvaluation({
    resumeVersionId: resumeVersion.id,
    agentRunId: fitRun.id,
    provider: fitAgent.provider,
    result: fitAgent.result
  }).resumeFitEvaluation;
  const claimAgent = runClaimVerifier({
    application,
    profile: store.getProfile(),
    resumeVersion,
    sourceMapping: resumeVersion.sourceMapping
  }, { mode: "rules" });
  const claimRun = store.finishAgentRun(store.startAgentRun({
    agentName: "ClaimVerifier",
    applicationId: application.id,
    step: "verify_resume_claims",
    provider: "rules",
    input: { resumeVersionId: resumeVersion.id }
  }).id, {
    status: "SUCCEEDED",
    provider: claimAgent.provider,
    output: claimAgent.result
  });
  const claimVerification = store.createResumeClaimVerification({
    resumeVersionId: resumeVersion.id,
    agentRunId: claimRun.id,
    provider: claimAgent.provider,
    result: claimAgent.result
  }).resumeClaimVerification;
  return {
    application,
    resumeInput,
    resumeVersion,
    fitEvaluation,
    claimVerification
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
    "Responsibilities: build Node.js services, SQLite data models, Chrome Extension MV3 capture flows, and browser task queues.",
    "Work with Playwright diagnostics, REST APIs, workflow events, agent workflow orchestration, and local-first data sync.",
    "Requirements: Node.js, SQLite, Chrome Extension, Playwright, REST API, Agent workflow, resume generation, and job matching experience."
  ].join("\n");
  return {
    source: "m10-resume-revision-smoke",
    page: {
      url: "https://www.zhipin.com/web/geek/jobs",
      title: "BOSS jobs"
    },
    exportedAt: new Date().toISOString(),
    jobs: [{
      jobId: "m10-revision-one",
      title: "Node.js Backend Engineer",
      company: "Local AI Workflow",
      salary: "20-30K",
      location: "Shanghai",
      experience: "3-5 years",
      education: "Bachelor",
      tags: ["Node.js", "SQLite", "Chrome Extension", "Playwright", "REST API", "Agent workflow"],
      welfare: ["weekends"],
      description,
      detailUrl: "https://www.zhipin.com/job_detail/m10-revision-one.html"
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
