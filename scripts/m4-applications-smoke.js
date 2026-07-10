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
  const storeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m4-store-"));
  const apiDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m4-api-"));
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
  const backfillDataDir = path.join(dataDir, "backfill");
  const activeDataDir = path.join(dataDir, "active");
  const backfillResult = runBackfillCheck(backfillDataDir);
  const store = createJobStore({ dataDir: activeDataDir });
  try {
    store.syncJobs(createPayload({ description: "" }));
    const firstApplications = store.getApplications();
    const firstEvents = store.getApplicationEvents();

    store.syncJobs(createPayload({
      description: "Complete job description with responsibilities and requirements. ".repeat(4)
    }));
    const secondApplications = store.getApplications();
    const secondEvents = store.getApplicationEvents();
    const applicationId = secondApplications.applications[0]?.id;
    const transition = store.transitionApplication(applicationId, {
      toStatus: "SCORED",
      eventType: "SCREENING_COMPLETED",
      reason: "m4_smoke",
      idempotencyKey: "m4:store:scored",
      evidence: operatorEvidence("m4 store transition smoke"),
      metadata: { score: 82 }
    });
    const transitionedApplications = store.getApplications();
    const transitionedEvents = store.getApplicationEvents();
    let invalidTransitionRejected = false;
    try {
      store.transitionApplication(applicationId, {
        toStatus: "LIST_CAPTURED",
        reason: "invalid_backwards"
      });
    } catch {
      invalidTransitionRejected = true;
    }
    const stats = store.getStats();

    const checks = {
      createsApplicationOnListCapture: firstApplications.totalApplications === 1 && firstApplications.applications[0]?.status === "LIST_CAPTURED",
      advancesToDetailCaptured: secondApplications.totalApplications === 1 && secondApplications.applications[0]?.status === "DETAIL_CAPTURED",
      recordsApplicationEvents: firstEvents.events.length === 1 && secondEvents.events.length === 2,
      transitionsApplicationStatus: transition.toStatus === "SCORED" && transitionedApplications.applications[0]?.status === "SCORED",
      recordsTransitionEvent: transitionedEvents.events[0]?.eventType === "SCREENING_COMPLETED" && transitionedEvents.events[0]?.toStatus === "SCORED",
      rejectsInvalidBackwardsTransition: invalidTransitionRejected,
      statsExposeApplicationCounts: stats.applicationCount === 1 && stats.applicationEventCount === 3,
      backfillsExistingJobs: backfillResult.ok
    };
    return {
      checks,
      summary: {
        firstStatus: firstApplications.applications[0]?.status,
        finalStatus: transitionedApplications.applications[0]?.status,
        eventCount: transitionedEvents.events.length,
        backfillStatus: backfillResult.status,
        statsApplicationCount: stats.applicationCount
      }
    };
  } finally {
    store.close();
  }
}

function runBackfillCheck(dataDir) {
  const store = createJobStore({ dataDir });
  try {
    store.syncJobs(createPayload({
      jobId: "m4-backfill-existing",
      title: "Backfill Existing",
      detailUrl: "https://www.zhipin.com/job_detail/m4-backfill-existing.html",
      description: "Backfill description with responsibilities and requirements. ".repeat(4)
    }));
    store.database.prepare("DELETE FROM application_events").run();
    store.database.prepare("DELETE FROM applications").run();
    store.backfillApplicationsIfNeeded();
    const backfilled = store.getApplications();
    return {
      ok: backfilled.totalApplications === 1 && backfilled.applications[0]?.status === "DETAIL_CAPTURED",
      status: backfilled.applications[0]?.status
    };
  } finally {
    store.close();
  }
}

async function runApiChecks(dataDir) {
  const port = 21000 + Math.floor(Math.random() * 1000);
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
    await requestJson(port, "POST", "/api/jobs/sync", createPayload({ description: "" }));
    await requestJson(port, "POST", "/api/jobs/sync", createPayload({
      description: "Complete job description with responsibilities and requirements. ".repeat(4)
    }));
    const applications = await requestJson(port, "GET", "/api/applications?limit=10");
    const applicationId = applications.applications[0]?.id;
    const transition = await requestJson(port, "POST", `/api/applications/${applicationId}/transition`, {
      toStatus: "SCORED",
      eventType: "SCREENING_COMPLETED",
      reason: "api_smoke",
      idempotencyKey: "m4:api:scored",
      evidence: operatorEvidence("m4 api transition smoke"),
      metadata: { score: 88 }
    });
    const transitionedApplications = await requestJson(port, "GET", "/api/applications?limit=10");
    const events = await requestJson(port, "GET", "/api/application-events?limit=10");
    let invalidTransitionRejected = false;
    try {
      await requestJson(port, "POST", `/api/applications/${applicationId}/transition`, {
        toStatus: "LIST_CAPTURED",
        reason: "invalid_backwards"
      });
    } catch {
      invalidTransitionRejected = true;
    }
    const checks = {
      apiReturnsApplications: applications.totalApplications === 1 && applications.applications[0]?.status === "DETAIL_CAPTURED",
      apiTransitionsApplication: transition.toStatus === "SCORED" && transitionedApplications.applications[0]?.status === "SCORED",
      apiRejectsInvalidTransition: invalidTransitionRejected,
      apiReturnsApplicationEvents: events.events.length === 3 && events.events[0]?.toStatus === "SCORED",
      apiKeepsJobContext: Boolean(applications.applications[0]?.title && applications.applications[0]?.detailUrl)
    };
    return {
      checks,
      summary: {
        totalApplications: applications.totalApplications,
        finalStatus: transitionedApplications.applications[0]?.status,
        eventCount: events.events.length
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
  const migrationSql = read("server/migrations/003_applications.sql");
  const packageJson = read("package.json");
  return {
    checks: {
      serverExposesApplicationsEndpoint: serverJs.includes('url.pathname === "/api/applications"'),
      serverExposesApplicationEventsEndpoint: serverJs.includes('url.pathname === "/api/application-events"'),
      serverExposesTransitionEndpoint: serverJs.includes('/api/applications') && serverJs.includes('/transition'),
      storeDefinesApplicationTables: migrationSql.includes("CREATE TABLE IF NOT EXISTS applications")
        && migrationSql.includes("CREATE TABLE IF NOT EXISTS application_events"),
      storeAdvancesStatus: storeJs.includes("advanceApplicationStatus") && storeJs.includes("DETAIL_CAPTURED"),
      storeDefinesTransitionService: storeJs.includes("transitionApplication(applicationId") && storeJs.includes("canTransitionApplication"),
      packageRunsThisSmoke: packageJson.includes("m4-applications-smoke.js")
    }
  };
}

function createPayload({ jobId = "m4-application-one", title = "Workflow PM", detailUrl = "https://www.zhipin.com/job_detail/m4-application-one.html", description }) {
  return {
    source: "m4-applications-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId,
        title,
        company: "Alpha",
        salary: "20-30K",
        location: "Nanning",
        detailUrl,
        description
      }
    ]
  };
}

function operatorEvidence(rationale) {
  return {
    type: "operator_override",
    actor: "m4-applications-smoke",
    rationale
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
