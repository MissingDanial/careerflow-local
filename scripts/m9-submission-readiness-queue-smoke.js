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
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m9-readiness-queue-"));
  let serverProcess = null;
  try {
    const port = await findFreePort();
    serverProcess = spawn(process.execPath, ["server/src/server.js"], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        BOSS_DATA_DIR: dataDir
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
  await requestJson(port, "POST", "/api/jobs/sync", createPayload());
  const applications = await requestJson(port, "GET", "/api/applications?limit=5");
  const application = applications.applications[0];
  await seedResumeUnlocked(port, application.id);

  const uploadTask = await requestJson(port, "POST", "/api/browser-tasks", {
    applicationId: application.id,
    taskType: "UPLOAD_RESUME",
    payload: createTaskPayload(application)
  });
  await requestJson(port, "POST", "/api/browser-tasks/claim", {
    taskTypes: ["UPLOAD_RESUME"],
    sourceUrl: application.detailUrl
  });
  await requestJson(port, "POST", `/api/browser-tasks/${uploadTask.id}/transition`, {
    toStatus: "SUCCEEDED",
    result: createUploadDryRunResult(application)
  });

  const submitTask = await requestJson(port, "POST", "/api/browser-tasks", {
    applicationId: application.id,
    taskType: "SUBMIT_APPLICATION",
    payload: {
      ...createTaskPayload(application),
      noSubmit: true
    }
  });
  await requestJson(port, "POST", "/api/browser-tasks/claim", {
    taskTypes: ["SUBMIT_APPLICATION"],
    sourceUrl: application.detailUrl
  });
  await requestJson(port, "POST", `/api/browser-tasks/${submitTask.id}/transition`, {
    toStatus: "SUCCEEDED",
    result: createSubmitDryRunResult(application)
  });

  const readyQueue = await requestJson(port, "GET", "/api/submission-readiness?status=READY_FOR_MANUAL_REVIEW&limit=5");
  const blockedQueue = await requestJson(port, "GET", "/api/submission-readiness?status=BLOCKED&limit=5");
  const allQueue = await requestJson(port, "GET", "/api/submission-readiness?status=ALL&limit=5");
  const events = await requestJson(port, "GET", "/api/application-events?limit=30");
  const afterApplications = await requestJson(port, "GET", "/api/applications?limit=5");
  const after = afterApplications.applications.find((item) => item.id === application.id);

  return {
    checks: {
      apiReturnsReadySubmissionReadinessQueue: readyQueue.items?.length === 1
        && readyQueue.items[0].applicationId === application.id
        && readyQueue.items[0].submissionReadiness?.status === "READY_FOR_MANUAL_REVIEW",
      apiCanFilterBlockedQueue: Array.isArray(blockedQueue.items) && blockedQueue.items.length === 0,
      apiCanReturnAllReadinessStatuses: allQueue.items?.some((item) => item.applicationId === application.id),
      apiQueueIncludesDryRunEvidence: readyQueue.items[0]?.uploadDryRun?.status === "UPLOAD_DRY_RUN_READY"
        && readyQueue.items[0]?.submitDryRun?.status === "SUBMIT_DRY_RUN_READY"
        && readyQueue.items[0]?.nextActionRecommendation?.action === "REVIEW_SUBMISSION_READINESS",
      apiRecordsReadinessAssessedEvents: events.events.some((event) => event.eventType === "SUBMISSION_READINESS_ASSESSED"),
      apiDoesNotAdvanceSubmissionState: after.status === "RESUME_UNLOCKED"
    },
    summary: {
      applicationId: application.id,
      uploadTaskId: uploadTask.id,
      submitTaskId: submitTask.id,
      readyQueueCount: readyQueue.items?.length || 0,
      allQueueStatuses: (allQueue.items || []).map((item) => item.submissionReadiness?.status),
      finalStatus: after.status
    }
  };
}

function runWiringChecks() {
  const serverJs = read("server/src/server.js");
  const storeJs = read("server/src/sqlite-store.js");
  const backgroundJs = read("extension/src/background.js");
  const optionsJs = read("extension/src/options.js");
  const packageJson = read("package.json");
  const readme = read("README.md");
  const docsWorkflow = read("docs/03_AGENT_WORKFLOW.md");
  const docsPlan = read("docs/04_DEVELOPMENT_PLAN.md");
  const docsReuse = read("docs/05_OPEN_SOURCE_REUSE.md");
  const docsBoss = read("docs/06_BOSS_PLATFORM_LOGIC.md");
  return {
    checks: {
      serverExposesSubmissionReadinessEndpoint: serverJs.includes('url.pathname === "/api/submission-readiness"')
        && serverJs.includes("getSubmissionReadinessQueue"),
      storeProvidesSubmissionReadinessQueue: storeJs.includes("getSubmissionReadinessQueue")
        && storeJs.includes("rowToSubmissionReadinessItem")
        && storeJs.includes("normalizeReadinessStatusList"),
      extensionProxiesSubmissionReadinessQueue: backgroundJs.includes("GET_SUBMISSION_READINESS_QUEUE")
        && backgroundJs.includes("fetchSubmissionReadinessQueue")
        && backgroundJs.includes("/api/submission-readiness"),
      optionsDisplaysSubmissionReadinessQueue: optionsJs.includes("submissionReadinessQueue")
        && optionsJs.includes("投递准备复核队列")
        && optionsJs.includes("GET_SUBMISSION_READINESS_QUEUE"),
      packageRunsThisSmoke: packageJson.includes("m9-submission-readiness-queue-smoke.js")
        && packageJson.includes("m9:submission-readiness-queue:smoke"),
      docsRecordM94Boundary: readme.includes("submission-readiness")
        && docsWorkflow.includes("submission-readiness")
        && docsPlan.includes("submission-readiness")
        && docsReuse.includes("getSubmissionReadinessQueue")
        && docsBoss.includes("submission-readiness")
    }
  };
}

async function seedResumeUnlocked(port, applicationId) {
  const transitions = [
    ["SCORED", "SCREENING_COMPLETED"],
    ["SHORTLISTED", "SCREENING_SHORTLISTED"],
    ["GREETING_READY", "GREETING_READY"],
    ["CHAT_OPENED", "REFRESH_CONVERSATION"],
    ["RESUME_UNLOCKED", "CHECK_RESUME_UNLOCK"]
  ];
  for (const [toStatus, eventType] of transitions) {
    await requestJson(port, "POST", `/api/applications/${applicationId}/transition`, {
      toStatus,
      eventType,
      reason: "m9_queue_seed"
    });
  }
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
    source: "m9-submission-readiness-queue-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId: "m9-readiness-queue-one",
        title: "Submission Queue Engineer",
        company: "Readiness Queue Co",
        salary: "30-45K",
        location: "Nanning",
        detailUrl: "https://www.zhipin.com/job_detail/m9-readiness-queue-one.html",
        sourceUrl: "https://www.zhipin.com/web/geek/jobs?query=readiness-queue",
        description: "Build local review queues from submission readiness evidence, browser task dry-runs, and auditable application events. ".repeat(3)
      }
    ]
  };
}

function requestJson(port, method, pathname, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
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
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        text += chunk;
      });
      response.on("end", () => {
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
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

process.on("exit", () => {});

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
