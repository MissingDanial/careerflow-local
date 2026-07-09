#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createJobStore } = require("../server/src/sqlite-store");

const ROOT = path.join(__dirname, "..");
const PAGE_A = "https://www.zhipin.com/web/geek/jobs?city=101300100&query=pm";
const PAGE_B = "https://www.zhipin.com/web/geek/jobs?city=101010100&query=ops";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const storeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m4-hygiene-store-"));
  const apiDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m4-hygiene-api-"));
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
    const alpha = createTask(store, "m4-hygiene-alpha", PAGE_A);
    const beta = createTask(store, "m4-hygiene-beta", PAGE_A);
    const other = createTask(store, "m4-hygiene-other", PAGE_B);

    store.claimBrowserTask({ taskTypes: ["CAPTURE_DETAIL"], sourceUrl: PAGE_A });
    const failedAlpha = store.transitionBrowserTask(alpha.id, {
      toStatus: "FAILED",
      errorMessage: "LOGIN_REQUIRED",
      result: {
        ok: false,
        errorCode: "LOGIN_REQUIRED",
        page: { url: PAGE_A, title: "BOSS page A" }
      }
    });

    const pageADiagnosticsBefore = store.getBrowserTaskDiagnostics({ sourceUrl: PAGE_A, limit: 10 });
    const pageBDiagnosticsBefore = store.getBrowserTaskDiagnostics({ sourceUrl: PAGE_B, limit: 10 });
    const requeued = store.requeueBrowserTasks({
      sourceUrl: PAGE_A,
      taskTypes: ["CAPTURE_DETAIL"],
      statuses: ["FAILED"],
      reason: "SMOKE_RETRY"
    });
    const alphaAfterRequeue = store.getBrowserTask(failedAlpha.taskId);
    const canceled = store.cancelBrowserTasks({
      sourceUrl: PAGE_A,
      taskTypes: ["CAPTURE_DETAIL"],
      statuses: ["QUEUED"],
      reason: "SMOKE_CANCEL"
    });
    const pageADiagnosticsAfter = store.getBrowserTaskDiagnostics({ sourceUrl: PAGE_A, limit: 10 });
    const pageBDiagnosticsAfter = store.getBrowserTaskDiagnostics({ sourceUrl: PAGE_B, limit: 10 });
    const allDiagnosticsAfter = store.getBrowserTaskDiagnostics({ limit: 10 });

    const checks = {
      pageScopedDiagnosticsCountsOnlyMatchingSource: pageADiagnosticsBefore.counts.total === 2
        && pageADiagnosticsBefore.counts.failed === 1
        && pageBDiagnosticsBefore.counts.total === 1
        && pageBDiagnosticsBefore.counts.queued === 1,
      requeuesOnlyCurrentPageFailedTasks: requeued.changed === 1
        && requeued.matched === 1
        && alphaAfterRequeue.status === "QUEUED",
      cancelsOnlyCurrentPageQueuedTasks: canceled.changed === 2
        && canceled.matched === 2,
      leavesOtherPageQueuedTaskUntouched: store.getBrowserTask(other.id).status === "QUEUED"
        && pageBDiagnosticsAfter.counts.queued === 1,
      currentPageDiagnosticsReflectCancel: pageADiagnosticsAfter.counts.canceled === 2
        && pageADiagnosticsAfter.counts.queued === 0,
      globalDiagnosticsStillIncludeOtherPage: allDiagnosticsAfter.counts.total === 3
        && allDiagnosticsAfter.counts.queued === 1
        && allDiagnosticsAfter.counts.canceled === 2,
      cancelDoesNotDeleteHistory: Boolean(store.getBrowserTask(alpha.id).result?.errorCode)
        && store.getBrowserTask(beta.id).status === "CANCELED"
    };

    return {
      checks,
      summary: {
        pageABefore: pageADiagnosticsBefore.counts,
        pageAAfter: pageADiagnosticsAfter.counts,
        pageBAfter: pageBDiagnosticsAfter.counts,
        requeuedChanged: requeued.changed,
        canceledChanged: canceled.changed
      }
    };
  } finally {
    store.close();
  }
}

async function runApiChecks(dataDir) {
  const port = 23000 + Math.floor(Math.random() * 1000);
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
    const alpha = await createTaskApi(port, "m4-hygiene-alpha", PAGE_A);
    const beta = await createTaskApi(port, "m4-hygiene-beta", PAGE_A);
    const other = await createTaskApi(port, "m4-hygiene-other", PAGE_B);

    await requestJson(port, "POST", "/api/browser-tasks/claim", {
      taskTypes: ["CAPTURE_DETAIL"],
      sourceUrl: PAGE_A
    });
    await requestJson(port, "POST", `/api/browser-tasks/${alpha.id}/transition`, {
      toStatus: "FAILED",
      errorMessage: "LOGIN_REQUIRED",
      result: {
        ok: false,
        errorCode: "LOGIN_REQUIRED",
        page: { url: PAGE_A, title: "BOSS page A" }
      }
    });

    const scopedBefore = await requestJson(port, "GET", `/api/browser-tasks/diagnostics?limit=10&sourceUrl=${encodeURIComponent(PAGE_A)}`);
    const requeued = await requestJson(port, "POST", "/api/browser-tasks/requeue", {
      sourceUrl: PAGE_A,
      taskTypes: ["CAPTURE_DETAIL"],
      statuses: ["FAILED"],
      reason: "SMOKE_RETRY"
    });
    const canceled = await requestJson(port, "POST", "/api/browser-tasks/cancel", {
      sourceUrl: PAGE_A,
      taskTypes: ["CAPTURE_DETAIL"],
      statuses: ["QUEUED"],
      reason: "SMOKE_CANCEL"
    });
    const pageAAfter = await requestJson(port, "GET", `/api/browser-tasks/diagnostics?limit=10&sourceUrl=${encodeURIComponent(PAGE_A)}`);
    const otherTask = await requestJson(port, "GET", `/api/browser-tasks/${other.id}`);
    const pageBTasks = await requestJson(port, "GET", `/api/browser-tasks?status=queued&limit=10&sourceUrl=${encodeURIComponent(PAGE_B)}`);

    const checks = {
      apiScopesDiagnosticsBySourceUrl: scopedBefore.counts.total === 2 && scopedBefore.counts.failed === 1,
      apiRequeuesCurrentPageFailures: requeued.changed === 1 && requeued.matched === 1,
      apiCancelsCurrentPageQueued: canceled.changed === 2 && canceled.matched === 2,
      apiDiagnosticsReflectQueueHygiene: pageAAfter.counts.canceled === 2 && pageAAfter.counts.queued === 0,
      apiKeepsOtherPageQueued: otherTask.status === "QUEUED"
        && pageBTasks.totalTasks === 1
        && pageBTasks.tasks[0]?.id === other.id,
      apiDoesNotDeleteTaskRows: Boolean(await requestJson(port, "GET", `/api/browser-tasks/${beta.id}`))
    };

    return {
      checks,
      summary: {
        pageABefore: scopedBefore.counts,
        pageAAfter: pageAAfter.counts,
        requeuedChanged: requeued.changed,
        canceledChanged: canceled.changed
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
  const popupJs = read("extension/src/popup.js");
  const optionsHtml = read("extension/src/options.html");
  const optionsJs = read("extension/src/options.js");
  const packageJson = read("package.json");
  return {
    checks: {
      serverExposesCancelEndpoint: serverJs.includes('url.pathname === "/api/browser-tasks/cancel"') && serverJs.includes("cancelBrowserTasks"),
      serverExposesRequeueEndpoint: serverJs.includes('url.pathname === "/api/browser-tasks/requeue"') && serverJs.includes("requeueBrowserTasks"),
      storeDefinesScopedDiagnostics: storeJs.includes("selectBrowserTasksForScope") && storeJs.includes("sourceUrl"),
      backgroundExposesQueueHygieneMessages: backgroundJs.includes("CANCEL_BROWSER_TASKS") && backgroundJs.includes("REQUEUE_BROWSER_TASKS"),
      popupRetryRequeuesBeforeFreshScan: popupJs.includes("requeueCurrentPageFailedTasks") && popupJs.includes("POPUP_RETRY"),
      optionsExposeCurrentPageControls: optionsHtml.includes("currentPageQueued") && optionsJs.includes("cancelCurrentPageTasks"),
      packageRunsThisSmoke: packageJson.includes("m4:queue-hygiene:smoke")
    }
  };
}

function createTask(store, jobId, sourceUrl) {
  return store.createBrowserTask({
    taskType: "CAPTURE_DETAIL",
    payload: {
      jobId,
      detailUrl: `https://www.zhipin.com/job_detail/${jobId}.html`,
      title: jobId,
      company: "Smoke",
      sourceUrl
    }
  });
}

async function createTaskApi(port, jobId, sourceUrl) {
  return requestJson(port, "POST", "/api/browser-tasks", {
    taskType: "CAPTURE_DETAIL",
    payload: {
      jobId,
      detailUrl: `https://www.zhipin.com/job_detail/${jobId}.html`,
      title: jobId,
      company: "Smoke",
      sourceUrl
    }
  });
}

function createPayload() {
  return {
    source: "m4-queue-hygiene-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      job("m4-hygiene-alpha"),
      job("m4-hygiene-beta"),
      job("m4-hygiene-other")
    ]
  };
}

function job(jobId) {
  return {
    jobId,
    title: jobId,
    company: "Smoke",
    salary: "10-20K",
    location: "Nanning",
    detailUrl: `https://www.zhipin.com/job_detail/${jobId}.html`,
    description: ""
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
