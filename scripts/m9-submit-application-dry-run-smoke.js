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
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m9-submit-dry-run-"));
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
    store.transitionApplication(application.id, { toStatus: "SCORED", eventType: "SCREENING_COMPLETED", reason: "m9_seed" });
    store.transitionApplication(application.id, { toStatus: "SHORTLISTED", eventType: "SCREENING_SHORTLISTED", reason: "m9_seed" });
    store.transitionApplication(application.id, { toStatus: "GREETING_READY", eventType: "GREETING_READY", reason: "m9_seed" });
    store.transitionApplication(application.id, { toStatus: "CHAT_OPENED", eventType: "REFRESH_CONVERSATION", reason: "m9_seed" });
    store.transitionApplication(application.id, { toStatus: "RESUME_UNLOCKED", eventType: "CHECK_RESUME_UNLOCK", reason: "m9_seed" });

    const task = store.createBrowserTask({
      applicationId: application.id,
      taskType: "SUBMIT_APPLICATION",
      payload: {
        jobId: application.bossJobId,
        title: application.title,
        company: application.company,
        detailUrl: application.detailUrl,
        sourceUrl: application.detailUrl,
        dryRun: true,
        readOnly: true,
        noRealBossAction: true,
        noSubmit: true
      }
    });
    const claimed = store.claimBrowserTask({
      taskTypes: ["SUBMIT_APPLICATION"],
      sourceUrl: application.detailUrl
    });
    const transitioned = store.transitionBrowserTask(task.id, {
      toStatus: "SUCCEEDED",
      result: {
        ok: true,
        taskType: "SUBMIT_APPLICATION",
        statusReason: "SUBMIT_APPLICATION_DRY_RUN_READY",
        submitDryRun: {
          status: "SUBMIT_DRY_RUN_READY",
          submitActionVisible: true,
          lockedSignalVisible: false,
          confirmationVisible: true,
          actionCandidates: [
            { label: "投递简历", enabled: true, submitSignal: true }
          ],
          confirmationCandidates: [
            { label: "确认投递", enabled: true, confirmSignal: true }
          ],
          readyActions: [
            { label: "确认投递", enabled: true, submitSignal: true }
          ],
          lockedActions: [],
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
        readOnly: {
          noRealBossAction: true,
          clicked: false,
          uploaded: false,
          submitted: false
        },
        page: {
          url: application.detailUrl,
          title: "BOSS submit"
        }
      }
    });
    const after = store.getApplications().applications.find((item) => item.id === application.id);
    const conversation = store.getConversations({ applicationId: application.id }).conversations[0];
    const events = store.getApplicationEvents(20);
    const tasks = store.getBrowserTasks({ limit: 20 });

    return {
      checks: {
        storeCreatesSubmitApplicationDryRunTask: task.taskType === "SUBMIT_APPLICATION" && task.payload.dryRun === true && task.payload.noSubmit === true,
        storeClaimsSubmitApplicationDryRunTask: claimed.claimed === true && claimed.task.id === task.id,
        storeTransitionsSubmitApplicationDryRunSucceeded: transitioned.toStatus === "SUCCEEDED"
          && transitioned.task.result.submitDryRun.submitActionVisible === true,
        storeKeepsApplicationAtResumeUnlocked: after.status === "RESUME_UNLOCKED",
        storePersistsSubmitDryRunMetadata: conversation.metadata?.lastSubmitDryRun?.status === "SUBMIT_DRY_RUN_READY"
          && conversation.metadata.lastSubmitDryRun.clickedSubmit === false
          && conversation.metadata.lastSubmitDryRun.confirmed === false
          && conversation.metadata.lastSubmitDryRun.submitted === false,
        storeRecordsSubmitDryRunEvent: events.events.some((event) => event.eventType === "SUBMIT_APPLICATION_DRY_RUN"
          && event.fromStatus === "RESUME_UNLOCKED"
          && event.toStatus === "RESUME_UNLOCKED"
          && event.metadata?.dryRun === true
          && event.metadata?.clickedSubmit === false
          && event.metadata?.confirmed === false
          && event.metadata?.submitted === false),
        storeDoesNotCreateRealSubmissionState: after.status !== "SUBMISSION_READY"
          && after.status !== "SUBMITTED"
          && tasks.tasks.every((item) => item.result?.dryRun?.submitted !== true)
      },
      summary: {
        applicationId: application.id,
        taskId: task.id,
        finalStatus: after.status,
        submitStatus: conversation.metadata?.lastSubmitDryRun?.status,
        eventTypes: events.events.map((item) => item.eventType),
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
  const readme = read("README.md");
  const docsWorkflow = read("docs/03_AGENT_WORKFLOW.md");
  const docsPlan = read("docs/04_DEVELOPMENT_PLAN.md");
  const docsReuse = read("docs/05_OPEN_SOURCE_REUSE.md");
  const docsBoss = read("docs/06_BOSS_PLATFORM_LOGIC.md");
  return {
    checks: {
      contentHandlesSubmitApplicationDryRun: contentJs.includes('taskType === "SUBMIT_APPLICATION"')
        && contentJs.includes("runSubmitApplicationDryRunTask")
        && contentJs.includes("extractSubmitApplicationDryRunSnapshot")
        && contentJs.includes("clickedSubmit: false")
        && contentJs.includes("confirmed: false")
        && contentJs.includes("submitted: false"),
      optionsCanQueueAndRunSubmitApplicationDryRun: optionsJs.includes("queueSubmitApplicationDryRunTask")
        && optionsJs.includes('"SUBMIT_APPLICATION"')
        && optionsJs.includes("Queue SUBMIT_APPLICATION dry-run")
        && optionsJs.includes("noSubmit"),
      storePersistsSubmitApplicationDryRunOnly: storeJs.includes('"SUBMIT_APPLICATION"')
        && storeJs.includes("SUBMIT_APPLICATION_DRY_RUN")
        && storeJs.includes("lastSubmitDryRun")
        && storeJs.includes("clickedSubmit: false")
        && storeJs.includes("confirmed: false")
        && storeJs.includes("submitted: false"),
      packageRunsThisSmoke: packageJson.includes("m9-submit-application-dry-run-smoke.js")
        && packageJson.includes("m9:submit-application-dry-run:smoke"),
      docsRecordM92Boundary: readme.includes("SUBMIT_APPLICATION")
        && docsWorkflow.includes("SUBMIT_APPLICATION")
        && docsPlan.includes("SUBMIT_APPLICATION")
        && docsReuse.includes("SUBMIT_APPLICATION")
        && docsBoss.includes("SUBMIT_APPLICATION")
        && docsReuse.includes("SUBMIT_APPLICATION")
    }
  };
}

function createPayload() {
  return {
    source: "m9-submit-application-dry-run-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId: "m9-submit-one",
        title: "Agent Workflow Engineer",
        company: "Submit DryRun Co",
        salary: "30-45K",
        location: "Nanning",
        detailUrl: "https://www.zhipin.com/job_detail/m9-submit-one.html",
        sourceUrl: "https://www.zhipin.com/web/geek/jobs?query=agent",
        description: "Build local-first job application agents with browser task diagnostics, resume review, and conservative dry-run execution. ".repeat(3)
      }
    ]
  };
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
