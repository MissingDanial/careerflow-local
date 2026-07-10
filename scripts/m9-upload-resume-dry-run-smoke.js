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
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m9-upload-dry-run-"));
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

    const task = store.createBrowserTask({
      applicationId: application.id,
      taskType: "UPLOAD_RESUME",
      payload: {
        jobId: application.bossJobId,
        title: application.title,
        company: application.company,
        detailUrl: application.detailUrl,
        sourceUrl: application.detailUrl,
        dryRun: true,
        noRealBossAction: true,
        noFileSelected: true
      }
    });
    const claimed = store.claimBrowserTask({
      taskTypes: ["UPLOAD_RESUME"],
      sourceUrl: application.detailUrl
    });
    const transitioned = store.transitionBrowserTask(task.id, {
      toStatus: "SUCCEEDED",
      result: {
        ok: true,
        taskType: "UPLOAD_RESUME",
        statusReason: "UPLOAD_RESUME_DRY_RUN_READY",
        uploadDryRun: {
          status: "UPLOAD_DRY_RUN_READY",
          fileInputUsable: true,
          uploadActionVisible: true,
          fileInputCount: 1,
          fileInputs: [
            { enabled: true, visible: false, accept: ".pdf,.doc,.docx", multiple: false, label: "上传简历" }
          ],
          uploadActions: [
            { label: "上传附件简历", enabled: true, unlockSignal: true }
          ],
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
        readOnly: {
          noRealBossAction: true,
          clicked: false,
          uploaded: false,
          submitted: false
        },
        page: {
          url: application.detailUrl,
          title: "BOSS upload"
        }
      }
    });
    const after = store.getApplications().applications.find((item) => item.id === application.id);
    const conversation = store.getConversations({ applicationId: application.id }).conversations[0];
    const events = store.getApplicationEvents(20);
    const tasks = store.getBrowserTasks({ limit: 20 });

    return {
      checks: {
        storeCreatesUploadResumeDryRunTask: task.taskType === "UPLOAD_RESUME" && task.payload.dryRun === true,
        storeClaimsUploadResumeDryRunTask: claimed.claimed === true && claimed.task.id === task.id,
        storeTransitionsUploadResumeDryRunSucceeded: transitioned.toStatus === "SUCCEEDED" && transitioned.task.result.uploadDryRun.fileInputUsable === true,
        storeKeepsApplicationAtResumeUnlocked: after.status === "RESUME_UNLOCKED",
        storePersistsUploadDryRunMetadata: conversation.metadata?.lastUploadDryRun?.status === "UPLOAD_DRY_RUN_READY"
          && conversation.metadata.lastUploadDryRun.fileSelected === false
          && conversation.metadata.lastUploadDryRun.uploaded === false,
        storeRecordsUploadDryRunEvent: events.events.some((event) => event.eventType === "UPLOAD_RESUME_DRY_RUN"
          && event.metadata?.dryRun === true
          && event.metadata?.uploaded === false
          && event.metadata?.submitted === false),
        storeDoesNotCreateSubmitTask: tasks.tasks.every((item) => item.taskType !== "SUBMIT_APPLICATION")
      },
      summary: {
        applicationId: application.id,
        taskId: task.id,
        finalStatus: after.status,
        uploadStatus: conversation.metadata?.lastUploadDryRun?.status,
        taskTypes: tasks.tasks.map((item) => item.taskType)
      }
    };
  } finally {
    store.close();
  }
}

function runWiringChecks() {
  const contentJs = read("extension/src/content.js");
  const optionsJs = read("extension/src/options.js");
  const storeJs = read("server/src/sqlite-store.js");
  const packageJson = read("package.json");
  const docsReuse = read("docs/05_OPEN_SOURCE_REUSE.md");
  return {
    checks: {
      contentHandlesUploadResumeDryRun: contentJs.includes('taskType === "UPLOAD_RESUME"')
        && contentJs.includes("runUploadResumeDryRunTask")
        && contentJs.includes("extractUploadResumeDryRunSnapshot")
        && contentJs.includes("fileSelected: false")
        && contentJs.includes("uploaded: false")
        && contentJs.includes("submitted: false"),
      optionsCanQueueAndRunUploadResumeDryRun: optionsJs.includes("queueResumeUploadDryRunTask")
        && optionsJs.includes('"UPLOAD_RESUME"')
        && optionsJs.includes("Queue UPLOAD_RESUME dry-run")
        && optionsJs.includes("noFileSelected"),
      storePersistsUploadResumeDryRunOnly: storeJs.includes('"UPLOAD_RESUME"')
        && storeJs.includes("UPLOAD_RESUME_DRY_RUN")
        && storeJs.includes("lastUploadDryRun")
        && storeJs.includes("fileSelected: false")
        && storeJs.includes("submitted: false"),
      packageRunsThisSmoke: packageJson.includes("m9-upload-resume-dry-run-smoke.js")
        && packageJson.includes("m9:upload-resume-dry-run:smoke"),
      docsRecordM91ReuseCheck: docsReuse.includes("M9.1")
        && docsReuse.includes("UPLOAD_RESUME")
        && docsReuse.includes("dry-run")
    }
  };
}

function createPayload() {
  return {
    source: "m9-upload-resume-dry-run-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId: "m9-upload-one",
        title: "AI Workflow Engineer",
        company: "Upload DryRun Co",
        salary: "25-35K",
        location: "Nanning",
        detailUrl: "https://www.zhipin.com/job_detail/m9-upload-one.html",
        sourceUrl: "https://www.zhipin.com/web/geek/jobs?query=upload",
        description: "Build application workflow with browser task diagnostics, resume handling, and local-first automation. ".repeat(3)
      }
    ]
  };
}

function seedResumeUnlocked(store, applicationId) {
  const transitions = [
    ["SCORED", "SCREENING_COMPLETED"],
    ["SHORTLISTED", "SCREENING_SHORTLISTED"],
    ["GREETING_READY", "GREETING_READY"],
    ["CHAT_OPENED", "REFRESH_CONVERSATION"],
    ["RESUME_UNLOCKED", "CHECK_RESUME_UNLOCK"]
  ];
  for (const [toStatus, eventType] of transitions) {
    store.transitionApplication(applicationId, {
      toStatus,
      eventType,
      reason: "m9_seed",
      idempotencyKey: `m9-upload:${applicationId}:${toStatus}`,
      evidence: {
        type: "operator_override",
        actor: "m9-upload-resume-dry-run-smoke",
        rationale: `Seed ${toStatus} for upload dry-run smoke`
      }
    });
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
