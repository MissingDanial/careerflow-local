#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createJobStore, SCHEMA_VERSION } = require("../server/src/sqlite-store");

const ROOT = path.resolve(__dirname, "..");
const TOKEN = "m17-queue-smoke-token";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const direct = runDirectChecks();
  const api = await runApiChecks();
  const source = runSourceChecks();
  const checks = { ...direct.checks, ...api.checks, ...source };
  console.log(JSON.stringify({
    ok: Object.values(checks).every(Boolean),
    checks,
    summary: {
      direct: direct.summary,
      api: api.summary
    }
  }, null, 2));
  process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
}

function runDirectChecks() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m17-queues-direct-"));
  const store = createJobStore({ dataDir });
  try {
    const defaultQueue = store.getApplicationQueues().queues.find((queue) => queue.isDefault);
    const firstSync = store.syncJobs(capturePayload(defaultQueue.id, [
      jobFixture("queue-job-product", "产品经理", true),
      {
        ...jobFixture("queue-job-product", "产品经理（重复卡片）", true),
        cacheKey: "changed-card-cache-key"
      },
      jobFixture("queue-job-algorithm", "算法产品", false)
    ]));
    const defaultAfterFirstSync = store.getApplications({ queueId: defaultQueue.id, limit: 20 });
    const firstEventCount = count(store, "application_events");
    const repeatSync = store.syncJobs(capturePayload(defaultQueue.id, [
      jobFixture("queue-job-product", "产品经理更新", true),
      jobFixture("queue-job-algorithm", "算法产品", false)
    ]));

    const productQueue = store.createApplicationQueue({ name: "产品", description: "产品岗位" }).queue;
    const crossQueueSync = store.syncJobs(capturePayload(productQueue.id, [
      jobFixture("queue-job-product", "产品经理更新", true)
    ]));
    const productAfterCrossSync = store.getApplications({ queueId: productQueue.id });
    const productApplication = store.getApplications({ queueId: productQueue.id }).applications[0];
    const removeProduct = store.removeApplicationsFromQueue(productQueue.id, {
      applicationIds: [productApplication.id],
      removedBy: "queue-smoke"
    });
    const recaptureRemoved = store.syncJobs(capturePayload(productQueue.id, [
      jobFixture("queue-job-product", "产品经理再次采集", true)
    ]));

    const missingBefore = store.getMissingDescriptions({
      queueId: defaultQueue.id,
      minDescriptionLength: 80,
      limit: 20
    });
    const removeMissing = store.removeMissingDescriptionsFromQueue(defaultQueue.id, {
      minDescriptionLength: 80,
      removedBy: "queue-smoke"
    });
    const missingAfter = store.getMissingDescriptions({
      queueId: defaultQueue.id,
      minDescriptionLength: 80,
      limit: 20
    });
    const defaultAfterRemoval = store.getApplications({ queueId: defaultQueue.id, limit: 20 });
    const queueRows = store.getApplicationQueues().queues;
    const productAfterRemoval = store.getApplications({ queueId: productQueue.id, limit: 20 });
    const removedMembership = store.database.prepare(`
      SELECT state FROM application_queue_items WHERE queue_id = ? AND application_id = ?
    `).get(productQueue.id, productApplication.id);
    const eventCountAfterQueueRemoval = count(store, "application_events");
    const completeOnly = store.getApplications({
      queueId: defaultQueue.id,
      completeDescriptionOnly: true,
      limit: 20
    });
    const trustedApplication = completeOnly.applications[0];
    store.transitionApplication(trustedApplication.id, {
      toStatus: "SKIPPED",
      eventType: "QUEUE_SMOKE_FILTERED",
      reason: "queue_smoke_filter",
      idempotencyKey: `queue-smoke-filter-${trustedApplication.id}`,
      evidence: {
        type: "operator_override",
        actor: "queue-smoke",
        rationale: "exercise queue trust restore"
      }
    });
    const trusted = store.trustApplicationInQueue(defaultQueue.id, trustedApplication.id, {
      actor: "queue-smoke",
      reason: "user trusts this direction"
    });
    const manual = store.updateManualApplicationStatus(trustedApplication.id, {
      manualStatus: "GREETED",
      actor: "queue-smoke",
      note: "user completed greeting manually"
    });
    const trackedApplication = store.getApplications({ queueId: defaultQueue.id }).applications[0];
    const disposableQueue = store.createApplicationQueue({ name: "可删除意向" }).queue;
    const archived = store.archiveApplicationQueue(disposableQueue.id, { actor: "queue-smoke" });
    const recreatedQueue = store.createApplicationQueue({ name: "可删除意向" }).queue;

    return {
      checks: {
        schemaMigratedToApplicationQueues: SCHEMA_VERSION === 18
          && store.getStats().schemaVersion === 18,
        migrationCreatesDefaultQueue: Boolean(defaultQueue?.id),
        duplicateCardsMergeBeforeStorage: firstSync.receivedRaw === 3
          && firstSync.received === 2
          && firstSync.duplicatesSkipped === 1
          && count(store, "jobs") === 2
          && count(store, "applications") === 2,
        initialSyncAddsOnlyUniqueQueueItems: firstSync.queueItemsAdded === 2
          && defaultAfterFirstSync.totalApplications === 2,
        sameQueueRecaptureSkipsMembership: repeatSync.jobsUpdated === 2
          && repeatSync.queueDuplicatesSkipped === 2
          && repeatSync.queueItemsAdded === 0,
        crossQueueSharesGlobalApplication: crossQueueSync.jobsUpdated === 1
          && crossQueueSync.queueItemsAdded === 1
          && productAfterCrossSync.totalApplications === 1,
        bulkRemovalIsQueueScoped: removeProduct.removed === 1
          && productAfterRemoval.totalApplications === 0
          && defaultAfterRemoval.totalApplications === 1,
        removedMembershipStaysRemovedOnRecapture: recaptureRemoved.queueRemovedSkipped === 1
          && removedMembership.state === "REMOVED",
        missingJdRemovalIsQueueScoped: missingBefore.totalMissingDescriptions === 1
          && removeMissing.removed === 1
          && missingAfter.totalMissingDescriptions === 0,
        removalPreservesGlobalHistory: count(store, "jobs") === 2
          && count(store, "applications") === 2
          && eventCountAfterQueueRemoval === firstEventCount,
        queueCountsReflectActiveMemberships: queueRows.find((queue) => queue.id === defaultQueue.id)?.totalApplications === 1
          && queueRows.find((queue) => queue.id === productQueue.id)?.totalApplications === 0,
        completeOnlyExcludesPendingJd: completeOnly.totalApplications === 1
          && completeOnly.applications[0].descriptionLength >= 80,
        trustedFilteredApplicationRestoresForScreening: trusted.restoredToDetailCaptured
          && trackedApplication.trusted
          && trackedApplication.status === "DETAIL_CAPTURED",
        manualStatusIsIndependentAndPersisted: manual.changed
          && manual.manualStatus === "GREETED"
          && trackedApplication.manualStatus === "GREETED",
        queueArchiveIsSoftAndNameCanBeRecreated: archived.noDataDeleted
          && recreatedQueue.name === "可删除意向"
          && recreatedQueue.totalApplications === 0
      },
      summary: {
        defaultQueueId: defaultQueue.id,
        productQueueId: productQueue.id,
        jobs: count(store, "jobs"),
        applications: count(store, "applications"),
        activeDefaultItems: defaultAfterRemoval.totalApplications,
        activeProductItems: productAfterRemoval.totalApplications
      }
    };
  } finally {
    store.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function runApiChecks() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m17-queues-api-"));
  const port = await findFreePort();
  const server = spawn(process.execPath, ["server/src/server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      BOSS_DATA_DIR: dataDir,
      BOSS_SKIP_LEGACY_IMPORT: "1",
      BOSS_SYNC_TOKEN: TOKEN
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk.toString(); });
  server.stderr.on("data", (chunk) => { output += chunk.toString(); });
  try {
    await waitForHealth(port, server, () => output);
    const initialQueues = await requestJson(port, "GET", "/api/application-queues");
    const created = await requestJson(port, "POST", "/api/application-queues", {
      name: "算法",
      description: "算法和 AI 工程岗位"
    }, TOKEN);
    const synced = await requestJson(port, "POST", "/api/jobs/sync", capturePayload(created.queue.id, [
      jobFixture("queue-api-job", "算法工程师", false)
    ]), TOKEN);
    const scoped = await requestJson(
      port,
      "GET",
      `/api/applications?queueId=${created.queue.id}&limit=20`
    );
    const missing = await requestJson(
      port,
      "GET",
      `/api/jobs/missing-descriptions?queueId=${created.queue.id}&limit=20`
    );
    const removed = await requestJson(
      port,
      "POST",
      `/api/application-queues/${created.queue.id}/remove-applications`,
      { applicationIds: [scoped.applications[0].id], removedBy: "api-smoke" },
      TOKEN
    );
    const after = await requestJson(
      port,
      "GET",
      `/api/applications?queueId=${created.queue.id}&limit=20`
    );
    const manual = await requestJson(
      port,
      "POST",
      `/api/applications/${scoped.applications[0].id}/manual-status`,
      { manualStatus: "APPLIED", actor: "api-smoke", note: "manual application completed" },
      TOKEN
    );
    const archived = await requestJson(
      port,
      "DELETE",
      `/api/application-queues/${created.queue.id}`,
      null,
      TOKEN
    );
    const recreated = await requestJson(port, "POST", "/api/application-queues", {
      name: "算法",
      description: "重新创建的空队列"
    }, TOKEN);
    const queuesAfterArchive = await requestJson(port, "GET", "/api/application-queues");
    return {
      checks: {
        apiListsDefaultQueue: initialQueues.queues.length === 1 && initialQueues.queues[0].isDefault,
        apiCreatesNamedQueue: created.queue.name === "算法" && !created.queue.isDefault,
        apiSyncTargetsSelectedQueue: synced.queueId === created.queue.id
          && synced.queueItemsAdded === 1,
        apiScopesApplicationsAndMissingJd: scoped.totalApplications === 1
          && scoped.applications[0].queueId === created.queue.id
          && missing.totalMissingDescriptions === 1,
        apiBulkRemoveHidesOnlyMembership: removed.removed === 1 && after.totalApplications === 0,
        apiRecordsManualStatusWithoutBossAction: manual.manualStatus === "APPLIED"
          && manual.noRealBossAction === true,
        apiArchivesAndRecreatesEmptyQueue: archived.noDataDeleted === true
          && recreated.queue.name === "算法"
          && recreated.queue.totalApplications === 0
          && queuesAfterArchive.queues.some((queue) => queue.id === recreated.queue.id)
          && !queuesAfterArchive.queues.some((queue) => queue.id === created.queue.id)
      },
      summary: {
        queueId: created.queue.id,
        applicationId: scoped.applications[0].id,
        removed: removed.removed
      }
    };
  } finally {
    server.kill();
    await waitForExit(server);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

function runSourceChecks() {
  const migration = fs.readFileSync(path.join(ROOT, "server/migrations/017_application_queues.sql"), "utf8");
  const trackingMigration = fs.readFileSync(path.join(ROOT, "server/migrations/018_manual_application_tracking.sql"), "utf8");
  const serverSource = fs.readFileSync(path.join(ROOT, "server/src/server.js"), "utf8");
  return {
    migrationUsesMembershipSoftRemoval: migration.includes("application_queue_items")
      && migration.includes("CHECK(state IN ('ACTIVE', 'REMOVED'))")
      && migration.includes("INSERT OR IGNORE INTO application_queue_items"),
    serverExposesQueueContract: serverSource.includes("/api/application-queues")
      && serverSource.includes("remove-applications")
      && serverSource.includes("remove-missing-descriptions"),
    manualTrackingMigrationIsExplicit: trackingMigration.includes("manual_status")
      && trackingMigration.includes("trusted_at"),
    serverExposesManualOnlyContract: serverSource.includes("manual-status")
      && serverSource.includes("/trust")
  };
}

function capturePayload(queueId, jobs) {
  return {
    source: "m17-queue-smoke",
    queueId,
    exportedAt: new Date().toISOString(),
    pages: {},
    stats: {},
    jobs
  };
}

function jobFixture(jobId, title, described) {
  return {
    jobId,
    cacheKey: `card:${jobId}`,
    title,
    company: "Queue Fixture Ltd",
    salary: "20-30K",
    location: "上海",
    detailUrl: `https://www.zhipin.com/job_detail/${jobId}.html`,
    description: described
      ? "负责需求分析、产品设计、跨团队协作、数据复盘和 AI 能力落地，要求具备完整项目经验。".repeat(4)
      : ""
  };
}

function count(store, tableName) {
  return Number(store.database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count || 0);
}

async function requestJson(port, method, pathname, body = null, token = "") {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${method} ${pathname} failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForHealth(port, child, readOutput) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before health check: ${readOutput()}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the server binds its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for server health: ${readOutput()}`);
}

async function waitForExit(child) {
  if (child.exitCode !== null) {
    return;
  }
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 2000);
  });
}
