#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createJobStore } = require("../server/src/sqlite-store");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const storeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m4-tasks-store-"));
  const apiDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m4-tasks-api-"));
  try {
    const storeResult = runStoreChecks(storeDataDir);
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

function runStoreChecks(dataDir) {
    const store = createJobStore({ dataDir });
  try {
    store.syncJobs(createPayload());
    const application = store.getApplications().applications.find((item) => item.bossJobId === "m4-browser-task-one");
    const task = store.createBrowserTask({
      applicationId: application.id,
      taskType: "CAPTURE_DETAIL",
      payload: {
        detailUrl: application.detailUrl,
        sourceUrl: "https://www.zhipin.com/web/geek/jobs?city=101300100",
        source: "m4-browser-tasks-smoke"
      }
    });
    const duplicateTask = store.createBrowserTask({
      applicationId: application.id,
      taskType: "CAPTURE_DETAIL",
      payload: {
        detailUrl: application.detailUrl,
        sourceUrl: "https://www.zhipin.com/web/geek/jobs?city=101300100",
        source: "m4-browser-tasks-smoke"
      }
    });
    const queued = store.getBrowserTasks({ status: "queued" });
    const fetched = store.getBrowserTask(task.id);
    const claimed = store.claimBrowserTask({
      taskTypes: ["CAPTURE_DETAIL"],
      sourceUrl: "https://www.zhipin.com/web/geek/jobs?city=101300100"
    });
    const emptyClaim = store.claimBrowserTask({
      taskTypes: ["CAPTURE_DETAIL"]
    });
    const succeeded = store.transitionBrowserTask(task.id, {
      toStatus: "SUCCEEDED",
      result: {
        descriptionLength: 180
      }
    });
    const succeededQueue = store.getBrowserTasks({ status: "SUCCEEDED" });
    const stats = store.getStats();
    const resolvedTask = store.createBrowserTask({
      taskType: "CAPTURE_DETAIL",
      payload: {
        jobId: "m4-browser-task-two",
        detailUrl: "https://www.zhipin.com/job_detail/m4-browser-task-two.html",
        title: "Workflow Designer",
        company: "Beta"
      }
    });
    const otherPageTask = store.createBrowserTask({
      taskType: "CAPTURE_DETAIL",
      payload: {
        detailUrl: "https://www.zhipin.com/job_detail/m4-browser-task-other.html",
        title: "Other Page",
        company: "Gamma",
        sourceUrl: "https://www.zhipin.com/web/geek/jobs?query=other"
      }
    });
    const noCrossPageClaim = store.claimBrowserTask({
      taskTypes: ["CAPTURE_DETAIL"],
      sourceUrl: "https://www.zhipin.com/web/geek/jobs?city=101300100"
    });
    const failingTask = store.createBrowserTask({
      taskType: "CAPTURE_DETAIL",
      payload: {
        jobId: "m4-browser-task-failure",
        detailUrl: "https://www.zhipin.com/job_detail/m4-browser-task-failure.html",
        title: "Failure Case",
        company: "Delta",
        sourceUrl: "https://www.zhipin.com/web/geek/jobs?city=101300100"
      }
    });
    store.claimBrowserTask({
      taskTypes: ["CAPTURE_DETAIL"],
      sourceUrl: "https://www.zhipin.com/web/geek/jobs?city=101300100"
    });
    const failedTask = store.transitionBrowserTask(failingTask.id, {
      toStatus: "FAILED",
      errorMessage: "JOB_NOT_VISIBLE",
      result: {
        ok: false,
        errorCode: "JOB_NOT_VISIBLE",
        message: "not visible",
        page: {
          url: "https://www.zhipin.com/web/geek/jobs?city=101300100",
          title: "BOSS jobs"
        }
      }
    });
    const taskDiagnostics = store.getBrowserTaskDiagnostics();
    const taskEvents = store.getBrowserEvents(5);

    let invalidTypeRejected = false;
    try {
      store.createBrowserTask({
        applicationId: application.id,
        taskType: "UNKNOWN_TASK"
      });
    } catch {
      invalidTypeRejected = true;
    }

    let invalidApplicationRejected = false;
    try {
      store.createBrowserTask({
        applicationId: 999999,
        taskType: "CAPTURE_DETAIL"
      });
    } catch {
      invalidApplicationRejected = true;
    }

    let invalidBackwardsRejected = false;
    try {
      store.transitionBrowserTask(task.id, {
        toStatus: "RUNNING"
      });
    } catch {
      invalidBackwardsRejected = true;
    }

    const checks = {
      createsBrowserTask: task.id > 0 && task.status === "QUEUED" && task.applicationId === application.id,
      returnsDuplicateOpenTask: duplicateTask.duplicate === true && duplicateTask.id === task.id,
      listsQueuedTasks: queued.totalTasks === 1 && queued.tasks[0]?.id === task.id,
      fetchesBrowserTask: fetched.id === task.id && fetched.title === application.title,
      claimsQueuedTask: claimed.claimed === true && claimed.task.id === task.id && claimed.task.status === "RUNNING",
      doesNotClaimRunningTaskAgain: emptyClaim.claimed === false && emptyClaim.task === null,
      transitionsToSucceeded: succeeded.toStatus === "SUCCEEDED" && succeeded.task.result.descriptionLength === 180,
      listsSucceededTasks: succeededQueue.totalTasks === 1 && succeededQueue.tasks[0]?.status === "SUCCEEDED",
      keepsTaskJobContext: succeeded.task.bossJobId === "m4-browser-task-one" && Boolean(succeeded.task.detailUrl),
      rejectsInvalidTaskType: invalidTypeRejected,
      rejectsInvalidApplicationId: invalidApplicationRejected,
      rejectsInvalidBackwardsTaskTransition: invalidBackwardsRejected,
      resolvesApplicationFromPayloadKeys: resolvedTask.applicationId > 0 && resolvedTask.title === "Workflow Designer",
      filtersClaimBySourceUrl: otherPageTask.id > 0 && noCrossPageClaim.claimed === false,
      recordsTaskFailureDiagnostics: failedTask.toStatus === "FAILED"
        && taskDiagnostics.counts.failed === 1
        && taskDiagnostics.failuresByReason[0]?.reason === "JOB_NOT_VISIBLE",
      recordsTaskFailureBrowserEvent: taskEvents.events.some((event) => event.eventType === "JOB_NOT_VISIBLE" && event.details?.taskId === failingTask.id),
      statsExposeBrowserTaskCount: stats.browserTaskCount === 1
    };

    return {
      checks,
      summary: {
        taskId: task.id,
        finalStatus: succeeded.task.status,
        queuedCount: queued.totalTasks,
        succeededCount: succeededQueue.totalTasks,
        statsBrowserTaskCount: stats.browserTaskCount,
        resolvedTaskApplicationId: resolvedTask.applicationId,
        taskFailureCount: taskDiagnostics.counts.failed
      }
    };
  } finally {
    store.close();
  }
}

async function runApiChecks(dataDir) {
  const port = 22000 + Math.floor(Math.random() * 1000);
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
    await requestJson(port, "POST", "/api/jobs/sync", createPayload());
    const applications = await requestJson(port, "GET", "/api/applications?limit=10");
    const application = applications.applications.find((item) => item.bossJobId === "m4-browser-task-one");
    const created = await requestJson(port, "POST", "/api/browser-tasks", {
      applicationId: application.id,
      taskType: "CAPTURE_DETAIL",
      payload: {
        detailUrl: application.detailUrl,
        sourceUrl: "https://www.zhipin.com/web/geek/jobs?city=101300100"
      }
    });
    const duplicateCreated = await requestJson(port, "POST", "/api/browser-tasks", {
      applicationId: application.id,
      taskType: "CAPTURE_DETAIL",
      payload: {
        detailUrl: application.detailUrl,
        sourceUrl: "https://www.zhipin.com/web/geek/jobs?city=101300100"
      }
    });
    const queued = await requestJson(port, "GET", "/api/browser-tasks?status=queued&limit=10");
    const fetched = await requestJson(port, "GET", `/api/browser-tasks/${created.id}`);
    const claimed = await requestJson(port, "POST", "/api/browser-tasks/claim", {
      taskTypes: ["CAPTURE_DETAIL"],
      sourceUrl: "https://www.zhipin.com/web/geek/jobs?city=101300100"
    });
    const emptyClaim = await requestJson(port, "POST", "/api/browser-tasks/claim", {
      taskTypes: ["CAPTURE_DETAIL"]
    });
    const failed = await requestJson(port, "POST", `/api/browser-tasks/${created.id}/transition`, {
      toStatus: "FAILED",
      errorMessage: "selector_changed",
      result: {
        ok: false,
        errorCode: "SELECTOR_CHANGED",
        selectorCounts: {},
        page: {
          url: "https://www.zhipin.com/web/geek/jobs?city=101300100",
          title: "BOSS jobs"
        }
      }
    });
    const failedQueue = await requestJson(port, "GET", "/api/browser-tasks?status=failed&limit=10");
    const taskDiagnostics = await requestJson(port, "GET", "/api/browser-tasks/diagnostics?limit=10");
    const taskEvents = await requestJson(port, "GET", "/api/events?limit=10");
    const stats = await requestJson(port, "GET", "/api/stats");

    let invalidTypeRejected = false;
    try {
      await requestJson(port, "POST", "/api/browser-tasks", {
        applicationId: application.id,
        taskType: "UNKNOWN_TASK"
      });
    } catch {
      invalidTypeRejected = true;
    }

    let invalidApplicationRejected = false;
    try {
      await requestJson(port, "POST", "/api/browser-tasks", {
        applicationId: 999999,
        taskType: "CAPTURE_DETAIL"
      });
    } catch {
      invalidApplicationRejected = true;
    }

    const checks = {
      apiCreatesBrowserTask: created.status === "QUEUED" && created.applicationId === application.id,
      apiReturnsDuplicateOpenTask: duplicateCreated.duplicate === true && duplicateCreated.id === created.id,
      apiListsQueuedTasks: queued.totalTasks === 1 && queued.tasks[0]?.id === created.id,
      apiFetchesBrowserTask: fetched.id === created.id && fetched.title === application.title,
      apiClaimsQueuedTask: claimed.claimed === true && claimed.task.id === created.id && claimed.task.status === "RUNNING",
      apiDoesNotClaimRunningTaskAgain: emptyClaim.claimed === false && emptyClaim.task === null,
      apiTransitionsToFailed: failed.toStatus === "FAILED" && failed.task.errorMessage === "selector_changed",
      apiListsFailedTasks: failedQueue.totalTasks === 1 && failedQueue.tasks[0]?.status === "FAILED",
      apiReadsTaskDiagnostics: taskDiagnostics.counts.failed === 1
        && taskDiagnostics.failuresByReason[0]?.reason === "selector_changed",
      apiRecordsTaskFailureEvent: taskEvents.events.some((event) => event.eventType === "SELECTOR_CHANGED" && event.details?.taskId === created.id),
      apiKeepsTaskJobContext: failed.task.bossJobId === "m4-browser-task-one" && Boolean(failed.task.detailUrl),
      apiRejectsInvalidTaskType: invalidTypeRejected,
      apiRejectsInvalidApplicationId: invalidApplicationRejected,
      apiStatsExposeBrowserTaskCount: stats.browserTaskCount === 1
    };

    return {
      checks,
      summary: {
        taskId: created.id,
        finalStatus: failed.task.status,
        failedCount: failedQueue.totalTasks,
        statsBrowserTaskCount: stats.browserTaskCount,
        diagnosticFailedCount: taskDiagnostics.counts.failed
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
  const migrationSql = read("server/migrations/004_browser_tasks.sql");
  const packageJson = read("package.json");
  return {
    checks: {
      serverExposesBrowserTasksCollection: serverJs.includes('url.pathname === "/api/browser-tasks"'),
      serverExposesBrowserTaskClaim: serverJs.includes('url.pathname === "/api/browser-tasks/claim"') && serverJs.includes("claimBrowserTask"),
      serverExposesBrowserTaskDiagnostics: serverJs.includes('url.pathname === "/api/browser-tasks/diagnostics"') && serverJs.includes("getBrowserTaskDiagnostics"),
      serverExposesBrowserTaskDetail: serverJs.includes('/api/browser-tasks') && serverJs.includes('browserTaskMatch'),
      serverExposesBrowserTaskTransition: serverJs.includes('browserTaskTransitionMatch') && serverJs.includes('transitionBrowserTask'),
      storeDefinesBrowserTaskTable: migrationSql.includes("CREATE TABLE IF NOT EXISTS browser_tasks"),
      storeDefinesBrowserTaskStateMachine: storeJs.includes("BROWSER_TASK_TRANSITIONS") && storeJs.includes("canTransitionBrowserTask"),
      storeDefinesBrowserTaskClaim: storeJs.includes("claimBrowserTask(options") && storeJs.includes("status = 'QUEUED'"),
      storeDefinesBrowserTaskDiagnostics: storeJs.includes("getBrowserTaskDiagnostics") && storeJs.includes("buildBrowserTaskFailureEvent"),
      packageRunsThisSmoke: packageJson.includes("m4-browser-tasks-smoke.js")
    }
  };
}

function createPayload() {
  return {
    source: "m4-browser-tasks-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId: "m4-browser-task-one",
        title: "Workflow Engineer",
        company: "Alpha",
        salary: "20-30K",
        location: "Nanning",
        detailUrl: "https://www.zhipin.com/job_detail/m4-browser-task-one.html",
        description: ""
      },
      {
        jobId: "m4-browser-task-two",
        title: "Workflow Designer",
        company: "Beta",
        salary: "18-25K",
        location: "Nanning",
        detailUrl: "https://www.zhipin.com/job_detail/m4-browser-task-two.html",
        description: ""
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
