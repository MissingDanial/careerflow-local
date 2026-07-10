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
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m10-workflow-"));
  let serverProcess = null;
  try {
    const port = await findFreePort();
    serverProcess = spawn(process.execPath, ["server/src/server.js"], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        BOSS_DATA_DIR: dataDir,
        BOSS_SKIP_LEGACY_IMPORT: "1"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let serverOutput = "";
    serverProcess.stdout.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
    serverProcess.stderr.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
    await waitForHealth(port, serverProcess, () => serverOutput);
    const apiResult = await runApiChecks(port);
    const wiring = runWiringChecks();
    const checks = {
      ...apiResult.checks,
      ...wiring.checks
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({ ok, checks, apiResult: apiResult.summary }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    if (serverProcess) {
      serverProcess.kill();
      await waitForExit(serverProcess).catch(() => {});
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function runApiChecks(port) {
  await seedProfile(port);
  await requestJson(port, "POST", "/api/jobs/sync", createPayload());
  const applications = await requestJson(port, "GET", "/api/applications?limit=5");
  const application = applications.applications[0];
  const firstPlan = await requestJson(port, "GET", `/api/applications/${application.id}/workflow-plan`);
  await requestJson(port, "POST", `/api/applications/${application.id}/screen`, { mode: "rules" });
  const screenedPlan = await requestJson(port, "GET", `/api/applications/${application.id}/workflow-plan`);
  const prepared = await requestJson(port, "POST", `/api/applications/${application.id}/prepare-resume`, {
    mode: "rules",
    renderDocx: false
  });
  const draftedPlan = await requestJson(port, "GET", `/api/applications/${application.id}/workflow-plan`);
  await requestJson(port, "POST", `/api/resume-versions/${prepared.resumeVersion.id}/evaluate-fit`, { mode: "rules" });
  const fitPlan = await requestJson(port, "GET", `/api/applications/${application.id}/workflow-plan`);
  await requestJson(port, "POST", `/api/resume-versions/${prepared.resumeVersion.id}/verify-claims`, { mode: "rules" });
  const claimPlan = await requestJson(port, "GET", `/api/applications/${application.id}/workflow-plan`);
  await requestJson(port, "POST", `/api/resume-versions/${prepared.resumeVersion.id}/audit`, { mode: "rules" });
  const auditedPlan = await requestJson(port, "GET", `/api/applications/${application.id}/workflow-plan`);
  await requestJson(port, "POST", `/api/resume-versions/${prepared.resumeVersion.id}/approve-local`, {
    approver: "m10-smoke"
  });
  const approvedPlan = await requestJson(port, "GET", `/api/applications/${application.id}/workflow-plan`);
  await requestJson(port, "POST", `/api/applications/${application.id}/prepare-greeting`, { mode: "rules" });
  const greetingPlan = await requestJson(port, "GET", `/api/applications/${application.id}/workflow-plan`);
  const beforeTasks = await requestJson(port, "GET", "/api/browser-tasks?limit=50");
  const sendGreetingTask = beforeTasks.tasks.find((task) => task.taskType === "SEND_GREETING");
  await claimAndSucceedTask(port, "SEND_GREETING", application.detailUrl, sendGreetingTask.id, createSendGreetingResult(application));
  const greetingDryRunPlan = await requestJson(port, "GET", `/api/applications/${application.id}/workflow-plan`);
  const refreshTask = await requestJson(port, "POST", "/api/browser-tasks", {
    applicationId: application.id,
    taskType: "REFRESH_CONVERSATION",
    payload: createTaskPayload(application)
  });
  await claimAndSucceedTask(port, "REFRESH_CONVERSATION", application.detailUrl, refreshTask.id, createConversationRefreshResult(application));
  const conversationPlan = await requestJson(port, "GET", `/api/applications/${application.id}/workflow-plan`);
  const uploadTask = await requestJson(port, "POST", "/api/browser-tasks", {
    applicationId: application.id,
    taskType: "UPLOAD_RESUME",
    payload: createTaskPayload(application)
  });
  await claimAndSucceedTask(port, "UPLOAD_RESUME", application.detailUrl, uploadTask.id, createUploadDryRunResult(application));
  const uploadPlan = await requestJson(port, "GET", `/api/applications/${application.id}/workflow-plan`);
  const submitTask = await requestJson(port, "POST", "/api/browser-tasks", {
    applicationId: application.id,
    taskType: "SUBMIT_APPLICATION",
    payload: createTaskPayload(application)
  });
  await claimAndSucceedTask(port, "SUBMIT_APPLICATION", application.detailUrl, submitTask.id, createSubmitDryRunResult(application));
  const readinessPlan = await requestJson(port, "GET", `/api/applications/${application.id}/workflow-plan`);
  await requestJson(port, "POST", `/api/submission-readiness/${application.id}/review`, {
    decision: "APPROVED_FOR_MANUAL_EXECUTION",
    reviewer: "m10-smoke"
  });
  const finalReadOnlyPlan = await requestJson(port, "GET", `/api/applications/${application.id}/workflow-plan`);
  const tasksBeforePersist = await requestJson(port, "GET", "/api/browser-tasks?limit=100");
  const applicationsBeforePersist = await requestJson(port, "GET", "/api/applications?limit=5");
  const persistedPlan = await requestJson(port, "POST", `/api/applications/${application.id}/workflow-plan`, {
    provider: "rules",
    requestedBy: "m10-smoke"
  });
  const tasksAfterPersist = await requestJson(port, "GET", "/api/browser-tasks?limit=100");
  const applicationsAfterPersist = await requestJson(port, "GET", "/api/applications?limit=5");
  const agentRuns = await requestJson(port, "GET", `/api/agent-runs?applicationId=${application.id}&limit=20`);

  return {
    checks: {
      apiFirstPlanRecommendsScreening: firstPlan.plan.nextAction.action === "SCREEN_APPLICATION"
        && stageStatus(firstPlan.plan, "JOB_READY") === "COMPLETE"
        && firstPlan.plan.noRealBossAction === true,
      apiAfterScreeningRecommendsResume: screenedPlan.plan.nextAction.action === "PREPARE_RESUME"
        && stageStatus(screenedPlan.plan, "SCREENING") === "COMPLETE",
      apiAfterResumeRecommendsFitEvaluation: draftedPlan.plan.nextAction.action === "EVALUATE_RESUME_FIT"
        && stageStatus(draftedPlan.plan, "RESUME_DRAFT") === "COMPLETE",
      apiAfterFitRecommendsClaimVerification: fitPlan.plan.nextAction.action === "VERIFY_RESUME_CLAIMS"
        && stageStatus(fitPlan.plan, "RESUME_FIT_EVALUATION") === "COMPLETE",
      apiAfterClaimsRecommendsAudit: claimPlan.plan.nextAction.action === "AUDIT_RESUME"
        && stageStatus(claimPlan.plan, "RESUME_CLAIM_VERIFICATION") === "COMPLETE",
      apiAfterAuditRecommendsLocalApproval: auditedPlan.plan.nextAction.action === "APPROVE_RESUME_LOCAL"
        && stageStatus(auditedPlan.plan, "RESUME_AUDIT") === "COMPLETE",
      apiAfterLocalApprovalRecommendsGreeting: approvedPlan.plan.nextAction.action === "PREPARE_GREETING"
        && stageStatus(approvedPlan.plan, "LOCAL_APPROVAL") === "COMPLETE",
      apiAfterGreetingWaitsForDryRun: greetingPlan.plan.nextAction.action === "RUN_SEND_GREETING_DRY_RUN"
        && stageStatus(greetingPlan.plan, "GREETING_DRAFT") === "COMPLETE",
      apiAfterGreetingDryRunRecommendsConversationRefresh: greetingDryRunPlan.plan.nextAction.action === "QUEUE_REFRESH_CONVERSATION"
        && stageStatus(greetingDryRunPlan.plan, "GREETING_DRAFT") === "COMPLETE",
      apiAfterConversationRecommendsUploadDryRun: conversationPlan.plan.nextAction.action === "QUEUE_UPLOAD_RESUME_DRY_RUN"
        && stageStatus(conversationPlan.plan, "CONVERSATION_REFRESH") === "COMPLETE",
      apiAfterUploadRecommendsSubmitDryRun: uploadPlan.plan.nextAction.action === "QUEUE_SUBMIT_APPLICATION_DRY_RUN"
        && stageStatus(uploadPlan.plan, "UPLOAD_DRY_RUN") === "COMPLETE",
      apiAfterSubmitRecommendsReadinessReview: readinessPlan.plan.nextAction.action === "REVIEW_SUBMISSION_READINESS"
        && stageStatus(readinessPlan.plan, "SUBMISSION_READINESS") === "COMPLETE",
      apiFinalPlanPreparesManualPackageOnly: finalReadOnlyPlan.plan.nextAction.action === "PREPARE_MANUAL_EXECUTION_PACKAGE"
        && stageStatus(finalReadOnlyPlan.plan, "LOCAL_READINESS_REVIEW") === "COMPLETE"
        && finalReadOnlyPlan.plan.realBossActionsBlocked.includes("SUBMIT_APPLICATION_REAL"),
      apiPersistedPlanCreatesOnlyAgentRun: persistedPlan.persisted === true
        && persistedPlan.agentRun.agentName === "WorkflowOrchestrator"
        && tasksAfterPersist.totalTasks === tasksBeforePersist.totalTasks
        && currentApplication(applicationsAfterPersist, application.id).status === currentApplication(applicationsBeforePersist, application.id).status,
      apiAgentRunRecordsPlan: agentRuns.runs.some((run) => run.agentName === "WorkflowOrchestrator"
        && run.step === "plan_application_workflow"
        && run.output?.plan?.nextAction?.action === "PREPARE_MANUAL_EXECUTION_PACKAGE")
    },
    summary: {
      applicationId: application.id,
      firstNextAction: firstPlan.plan.nextAction.action,
      finalNextAction: finalReadOnlyPlan.plan.nextAction.action,
      taskCountBeforePersist: tasksBeforePersist.totalTasks,
      taskCountAfterPersist: tasksAfterPersist.totalTasks,
      finalApplicationStatus: currentApplication(applicationsAfterPersist, application.id).status,
      workflowAgentRunCount: agentRuns.runs.filter((run) => run.agentName === "WorkflowOrchestrator").length
    }
  };
}

function runWiringChecks() {
  const packageJson = read("package.json");
  const serverJs = read("server/src/server.js");
  const storeJs = read("server/src/sqlite-store.js");
  const orchestratorJs = read("server/src/workflow-orchestrator.js");
  const readme = read("README.md");
  const docsWorkflow = read("docs/03_AGENT_WORKFLOW.md");
  const docsPlan = read("docs/04_DEVELOPMENT_PLAN.md");
  const docsReuse = read("docs/05_OPEN_SOURCE_REUSE.md");
  const docsBoss = read("docs/06_BOSS_PLATFORM_LOGIC.md");
  return {
    checks: {
      serverExposesWorkflowPlanEndpoint: serverJs.includes("/workflow-plan")
        && serverJs.includes("WorkflowOrchestrator")
        && serverJs.includes("planApplicationWorkflow"),
      storeBuildsWorkflowSnapshot: storeJs.includes("getApplicationWorkflowSnapshot")
        && storeJs.includes("getLatestResumeAuditForResumeVersion")
        && storeJs.includes("getLatestBrowserTasksForApplication"),
      orchestratorKeepsNoRealActionBoundary: orchestratorJs.includes("noRealBossAction: true")
        && orchestratorJs.includes("noBrowserTaskCreated: true")
        && orchestratorJs.includes("SUBMIT_APPLICATION_REAL"),
      packageRunsM10SmokeAndCheck: packageJson.includes("m10-workflow-orchestrator-smoke.js")
        && packageJson.includes("m10:workflow-orchestrator:smoke")
        && packageJson.includes("check:syntax"),
      docsRecordM10: readme.includes("M10.1")
        && docsWorkflow.includes("M10.1")
        && docsPlan.includes("M10.1")
        && docsReuse.includes("M10.1")
        && docsBoss.includes("M10.1")
    }
  };
}

async function seedProfile(port) {
  await requestJson(port, "PUT", "/api/profile", {
    displayName: "M10 Candidate",
    headline: "AI Product Engineer",
    target: {
      roles: ["AI Product Engineer", "Agent Workflow"],
      cities: ["Nanning"]
    }
  });
  await requestJson(port, "POST", "/api/profile/skills", {
    name: "Node.js",
    category: "engineering",
    proficiency: "proficient"
  });
  await requestJson(port, "POST", "/api/profile/skills", {
    name: "SQLite",
    category: "database",
    proficiency: "proficient"
  });
  await requestJson(port, "POST", "/api/profile/skills", {
    name: "Agent Workflow",
    category: "product",
    proficiency: "proficient"
  });
  await requestJson(port, "POST", "/api/profile/experiences", {
    kind: "project",
    title: "Boss Find local workflow",
    organization: "Local Project",
    role: "Product engineer",
    facts: [
      "Built a Chrome Extension and local Node.js backend for BOSS job capture.",
      "Designed a SQLite application workflow with browser task dry-runs.",
      "Implemented resume generation, audit, local approval, and readiness review gates."
    ],
    skills: ["Node.js", "SQLite", "Agent Workflow"],
    evidenceText: "Confirmed local project experience for smoke testing.",
    confidence: "user_confirmed"
  });
}

function createPayload() {
  return {
    source: "m10-workflow-orchestrator-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId: "m10-workflow-one",
        title: "AI Product Engineer Agent Workflow",
        company: "Workflow Co",
        salary: "25-40K",
        location: "Nanning",
        experience: "1-3 years",
        education: "Bachelor",
        tags: ["Node.js", "SQLite", "Agent Workflow"],
        detailUrl: "https://www.zhipin.com/job_detail/m10-workflow-one.html",
        sourceUrl: "https://www.zhipin.com/web/geek/jobs?query=agent-workflow",
        description: [
          "Build local-first job application agent workflows with Node.js, SQLite, and browser extension task queues.",
          "Own resume generation, audit gates, dry-run browser execution, and manual readiness review.",
          "Candidates should understand safe automation boundaries, structured state machines, and product workflow design."
        ].join(" ")
      }
    ]
  };
}

function createTaskPayload(application) {
  return {
    jobId: application.bossJobId,
    title: application.title,
    company: application.company,
    detailUrl: application.detailUrl,
    sourceUrl: application.detailUrl,
    dryRun: true,
    readOnly: true,
    noRealBossAction: true
  };
}

function createSendGreetingResult(application) {
  return {
    ok: true,
    taskType: "SEND_GREETING",
    statusReason: "SEND_GREETING_DRY_RUN_READY",
    dryRun: {
      noRealBossAction: true,
      filled: true,
      clickedSend: false,
      sent: false
    },
    conversation: {
      status: "RESUME_REQUESTED",
      chatOpened: true,
      messages: [
        {
          direction: "OUTBOUND",
          text: "您好，我对这个岗位感兴趣。",
          timestamp: "2026-07-07T10:00:00.000Z"
        },
        {
          direction: "INBOUND",
          text: "可以发一份简历看看。",
          timestamp: "2026-07-07T10:01:00.000Z"
        }
      ]
    },
    resumeUnlock: {
      status: "RESUME_UNLOCKED",
      unlocked: true
    },
    page: {
      url: application.detailUrl,
      title: "BOSS greeting dry run"
    }
  };
}

function createConversationRefreshResult(application) {
  return {
    ok: true,
    taskType: "REFRESH_CONVERSATION",
    statusReason: "REFRESH_CONVERSATION_READY",
    conversation: {
      status: "RESUME_REQUESTED",
      chatOpened: true,
      messages: [
        {
          direction: "OUTBOUND",
          text: "您好，我对这个岗位感兴趣。",
          timestamp: "2026-07-07T10:00:00.000Z"
        },
        {
          direction: "INBOUND",
          text: "可以发一份简历看看。",
          timestamp: "2026-07-07T10:01:00.000Z"
        }
      ]
    },
    resumeUnlock: {
      status: "RESUME_UNLOCKED",
      unlocked: true
    },
    readOnly: {
      noRealBossAction: true,
      clicked: false,
      uploaded: false,
      submitted: false
    },
    page: {
      url: application.detailUrl,
      title: "BOSS conversation refresh"
    }
  };
}

function createUploadDryRunResult(application) {
  return {
    ok: true,
    taskType: "UPLOAD_RESUME",
    statusReason: "UPLOAD_RESUME_DRY_RUN_READY",
    conversation: { status: "RESUME_REQUESTED", chatOpened: true, messages: [] },
    resumeUnlock: { status: "RESUME_UNLOCKED", unlocked: true },
    uploadDryRun: {
      status: "UPLOAD_DRY_RUN_READY",
      fileInputUsable: true,
      uploadActionVisible: true,
      noRealBossAction: true,
      fileSelected: false,
      uploaded: false,
      submitted: false,
      confidence: 0.9
    },
    dryRun: {
      noRealBossAction: true,
      fileSelected: false,
      clickedUpload: false,
      uploaded: false,
      submitted: false
    },
    page: { url: application.detailUrl, title: "BOSS upload dry run" }
  };
}

function createSubmitDryRunResult(application) {
  return {
    ok: true,
    taskType: "SUBMIT_APPLICATION",
    statusReason: "SUBMIT_APPLICATION_DRY_RUN_READY",
    conversation: { status: "RESUME_REQUESTED", chatOpened: true, messages: [] },
    resumeUnlock: { status: "RESUME_UNLOCKED", unlocked: true },
    submitDryRun: {
      status: "SUBMIT_DRY_RUN_READY",
      submitActionVisible: true,
      lockedSignalVisible: false,
      confirmationVisible: true,
      noRealBossAction: true,
      clickedSubmit: false,
      confirmed: false,
      submitted: false,
      uploaded: false,
      confidence: 0.85
    },
    dryRun: {
      noRealBossAction: true,
      clickedSubmit: false,
      confirmed: false,
      submitted: false,
      uploaded: false
    },
    page: { url: application.detailUrl, title: "BOSS submit dry run" }
  };
}

async function claimAndSucceedTask(port, taskType, sourceUrl, taskId, result) {
  await requestJson(port, "POST", "/api/browser-tasks/claim", {
    taskTypes: [taskType],
    sourceUrl
  });
  await requestJson(port, "POST", `/api/browser-tasks/${taskId}/transition`, {
    toStatus: "SUCCEEDED",
    result
  });
}

function stageStatus(plan, stageId) {
  return plan.stages.find((stage) => stage.id === stageId)?.status || "";
}

function currentApplication(applications, applicationId) {
  return applications.applications.find((application) => application.id === applicationId) || {};
}

function requestJson(port, method, pathname, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method,
      headers: payload ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      } : {}
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        text += chunk;
      });
      response.on("end", () => {
        let data = null;
        try {
          data = text ? JSON.parse(text) : {};
        } catch (error) {
          reject(error);
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(data?.error || `HTTP ${response.statusCode}`));
          return;
        }
        resolve(data);
      });
    });
    request.on("error", reject);
    if (payload) {
      request.write(payload);
    }
    request.end();
  });
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForHealth(port, child, getOutput) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before health check: ${getOutput()}`);
    }
    try {
      const health = await requestJson(port, "GET", "/health");
      if (health?.ok) {
        return;
      }
    } catch {
      await sleep(150);
    }
  }
  throw new Error(`Timed out waiting for server health: ${getOutput()}`);
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("exit", () => resolve());
    child.once("error", reject);
    setTimeout(resolve, 2000);
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
