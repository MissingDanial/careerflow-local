#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createJobStore } = require("../server/src/sqlite-store");

const ROOT = path.join(__dirname, "..");

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m9-readiness-"));
  try {
    const storeResult = runStoreChecks(dataDir);
    const wiring = runWiringChecks();
    const checks = {
      ...storeResult.checks,
      ...wiring.checks
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({ ok, checks, storeResult: storeResult.summary }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

function runStoreChecks(dataDir) {
  const store = createJobStore({ dataDir });
  try {
    store.syncJobs(createPayload());
    const application = store.getApplications().applications[0];
    seedResumeUnlocked(store, application.id);

    const uploadTask = store.createBrowserTask({
      applicationId: application.id,
      taskType: "UPLOAD_RESUME",
      payload: createTaskPayload(application)
    });
    store.claimBrowserTask({ taskTypes: ["UPLOAD_RESUME"], sourceUrl: application.detailUrl });
    store.transitionBrowserTask(uploadTask.id, {
      toStatus: "SUCCEEDED",
      result: createUploadDryRunResult(application)
    });
    const afterUploadConversation = store.getConversations({ applicationId: application.id }).conversations[0];

    const submitTask = store.createBrowserTask({
      applicationId: application.id,
      taskType: "SUBMIT_APPLICATION",
      payload: {
        ...createTaskPayload(application),
        noSubmit: true
      }
    });
    store.claimBrowserTask({ taskTypes: ["SUBMIT_APPLICATION"], sourceUrl: application.detailUrl });
    store.transitionBrowserTask(submitTask.id, {
      toStatus: "SUCCEEDED",
      result: createSubmitDryRunResult(application)
    });

    const after = store.getApplications().applications.find((item) => item.id === application.id);
    const conversation = store.getConversations({ applicationId: application.id }).conversations[0];
    const events = store.getApplicationEvents(30);
    const tasks = store.getBrowserTasks({ limit: 30 });
    const readiness = conversation.metadata?.submissionReadiness || {};
    const nextAction = conversation.metadata?.nextActionRecommendation || {};

    return {
      checks: {
        storeMarksReadinessInsufficientAfterUploadOnly: afterUploadConversation.metadata?.submissionReadiness?.status === "INSUFFICIENT_EVIDENCE"
          && afterUploadConversation.metadata.submissionReadiness.missingEvidence?.includes("submit_dry_run_ready"),
        storeMarksReadinessReadyAfterBothDryRuns: readiness.status === "READY_FOR_MANUAL_REVIEW"
          && readiness.reason === "upload_and_submit_dry_run_ready"
          && readiness.noRealBossAction === true,
        storeNextActionUsesSubmissionReadiness: nextAction.action === "REVIEW_SUBMISSION_READINESS"
          && nextAction.noRealBossAction === true
          && nextAction.blockedTaskTypes?.includes("SUBMIT_APPLICATION_REAL"),
        storeRecordsReadinessEvents: events.events.filter((event) => event.eventType === "SUBMISSION_READINESS_ASSESSED").length >= 2
          && events.events.some((event) => event.eventType === "SUBMISSION_READINESS_ASSESSED"
            && event.metadata?.submissionReadiness?.status === "READY_FOR_MANUAL_REVIEW"),
        storeKeepsApplicationAtResumeUnlocked: after.status === "RESUME_UNLOCKED",
        storeDoesNotCreateRealSubmissionTask: tasks.tasks.every((task) => task.taskType !== "UPLOAD_RESUME_REAL" && task.taskType !== "SUBMIT_APPLICATION_REAL")
          && tasks.tasks.every((task) => task.result?.dryRun?.submitted !== true)
      },
      summary: {
        applicationId: application.id,
        uploadTaskId: uploadTask.id,
        submitTaskId: submitTask.id,
        finalStatus: after.status,
        readinessStatus: readiness.status,
        nextAction: nextAction.action,
        eventTypes: events.events.map((event) => event.eventType)
      }
    };
  } finally {
    store.close();
  }
}

function runWiringChecks() {
  const optionsJs = read("extension/src/options.js");
  const storeJs = read("server/src/sqlite-store.js");
  const packageJson = read("package.json");
  const readme = read("README.md");
  const docsWorkflow = read("docs/03_AGENT_WORKFLOW.md");
  const docsPlan = read("docs/04_DEVELOPMENT_PLAN.md");
  const docsReuse = read("docs/05_OPEN_SOURCE_REUSE.md");
  const docsBoss = read("docs/06_BOSS_PLATFORM_LOGIC.md");
  return {
    checks: {
      storeAssessesSubmissionReadiness: storeJs.includes("assessSubmissionReadiness")
        && storeJs.includes("SUBMISSION_READINESS_ASSESSED")
        && storeJs.includes("READY_FOR_MANUAL_REVIEW")
        && storeJs.includes("INSUFFICIENT_EVIDENCE")
        && storeJs.includes("SUBMIT_APPLICATION_REAL"),
      optionsDisplaysSubmissionReadiness: optionsJs.includes("formatSubmissionReadiness")
        && optionsJs.includes("REVIEW_SUBMISSION_READINESS")
        && optionsJs.includes("RESOLVE_SUBMISSION_BLOCKER"),
      packageRunsThisSmoke: packageJson.includes("m9-submission-readiness-smoke.js")
        && packageJson.includes("m9:submission-readiness:smoke"),
      docsRecordM93Boundary: readme.includes("submissionReadiness")
        && docsWorkflow.includes("submissionReadiness")
        && docsPlan.includes("submissionReadiness")
        && docsReuse.includes("submissionReadiness")
        && docsBoss.includes("submissionReadiness")
    }
  };
}

function seedResumeUnlocked(store, applicationId) {
  store.transitionApplication(applicationId, { toStatus: "SCORED", eventType: "SCREENING_COMPLETED", reason: "m9_seed" });
  store.transitionApplication(applicationId, { toStatus: "SHORTLISTED", eventType: "SCREENING_SHORTLISTED", reason: "m9_seed" });
  store.transitionApplication(applicationId, { toStatus: "GREETING_READY", eventType: "GREETING_READY", reason: "m9_seed" });
  store.transitionApplication(applicationId, { toStatus: "CHAT_OPENED", eventType: "REFRESH_CONVERSATION", reason: "m9_seed" });
  store.transitionApplication(applicationId, { toStatus: "RESUME_UNLOCKED", eventType: "CHECK_RESUME_UNLOCK", reason: "m9_seed" });
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

function createUploadDryRunResult(application) {
  return {
    ok: true,
    taskType: "UPLOAD_RESUME",
    statusReason: "UPLOAD_RESUME_DRY_RUN_READY",
    conversation: {
      status: "CHAT_OPENED",
      chatOpened: true,
      messages: []
    },
    resumeUnlock: {
      status: "RESUME_UNLOCKED",
      unlocked: true
    },
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
    page: {
      url: application.detailUrl,
      title: "BOSS upload"
    }
  };
}

function createSubmitDryRunResult(application) {
  return {
    ok: true,
    taskType: "SUBMIT_APPLICATION",
    statusReason: "SUBMIT_APPLICATION_DRY_RUN_READY",
    conversation: {
      status: "CHAT_OPENED",
      chatOpened: true,
      messages: []
    },
    resumeUnlock: {
      status: "RESUME_UNLOCKED",
      unlocked: true
    },
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
    page: {
      url: application.detailUrl,
      title: "BOSS submit"
    }
  };
}

function createPayload() {
  return {
    source: "m9-submission-readiness-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId: "m9-readiness-one",
        title: "Submission Readiness Engineer",
        company: "Readiness DryRun Co",
        salary: "30-45K",
        location: "Nanning",
        detailUrl: "https://www.zhipin.com/job_detail/m9-readiness-one.html",
        sourceUrl: "https://www.zhipin.com/web/geek/jobs?query=readiness",
        description: "Build conservative application submission readiness gates using browser task evidence, audit events, and local-first workflow controls. ".repeat(3)
      }
    ]
  };
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
