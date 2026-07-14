#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { createJobStore, SCHEMA_VERSION } = require("../server/src/sqlite-store");
const { loadMigrations } = require("../server/src/sqlite-migrations");

const ROOT = path.join(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "server", "migrations");

main();

function main() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m13-migrations-"));
  try {
    const upgrade = runUpgradeScenario(path.join(rootDir, "upgrade"));
    const bootstrap = runCurrentVersionBootstrapScenario(path.join(rootDir, "bootstrap"));
    const recovery = runRecoveryScenario(path.join(rootDir, "recovery"));
    const lineEndings = runLineEndingPortabilityScenario(path.join(rootDir, "line-endings"));
    const checks = {
      upgradesVersionSevenToCurrent: upgrade.finalVersion === SCHEMA_VERSION
        && upgrade.currentVersion === 7
        && upgrade.appliedVersions.join(",") === Array.from(
          { length: SCHEMA_VERSION - 7 },
          (_, index) => index + 8
        ).join(","),
      createsPreMigrationBackup: upgrade.backupCreated
        && upgrade.backupExists
        && upgrade.backupVersion === 7,
      preservesLegacyData: upgrade.jobCount === 1
        && upgrade.backupJobCount === 1,
      recordsAuditableMigrationHistory: upgrade.historyCount === SCHEMA_VERSION
        && upgrade.baselinedVersions.join(",") === "1,2,3,4,5,6,7",
      createsNewerSchemaTables: upgrade.hasWorkflowEvents
        && upgrade.hasResumeFitEvaluations
        && upgrade.hasResumeClaimVerifications
        && upgrade.hasProfileSnapshots
        && upgrade.hasWorkflowRuns
        && upgrade.hasWorkflowInputSnapshots
        && upgrade.hasApplicationEventIdempotency
        && upgrade.hasBrowserTaskExpiry
        && upgrade.hasBrowserTaskClaimToken
        && upgrade.hasRealActionPolicies
        && upgrade.hasRealActionAuthorizations
        && upgrade.hasProfileDialogSessions
        && upgrade.hasProfileDialogMessages
        && upgrade.hasProfileContextVersions
        && upgrade.hasProfileEntityRevisions
        && upgrade.hasAgentRunModelTelemetry
        && upgrade.hasAgentEvaluationRuns
        && upgrade.hasAgentShadowRuns
        && upgrade.hasAgentShadowItems
        && upgrade.hasAgentShadowSamples
        && upgrade.hasAgentShadowReviews
        && upgrade.hasApplicationQueues
        && upgrade.hasApplicationQueueItems
        && upgrade.hasManualApplicationStatus
        && upgrade.hasQueueTrustMarker,
      bootstrapsHistoryForCurrentLegacyDatabase: bootstrap.currentVersion === SCHEMA_VERSION
        && bootstrap.finalVersion === SCHEMA_VERSION
        && bootstrap.appliedCount === 0
        && bootstrap.baselinedCount === SCHEMA_VERSION
        && bootstrap.historyCount === SCHEMA_VERSION,
      backsUpCurrentLegacyDatabaseBeforeMetadataChange: bootstrap.backupCreated
        && bootstrap.backupVersion === SCHEMA_VERSION
        && bootstrap.jobCount === 1
        && bootstrap.backupJobCount === 1,
      failureReturnsMigrationContext: recovery.errorCode === "SQLITE_MIGRATION_FAILED"
        && recovery.failedMigration === "012_application_transition_invariants.sql"
        && recovery.failedMigrationVersion === 12,
      failureRestoresOriginalDatabase: recovery.restored
        && recovery.restoredVersion === 11
        && recovery.restoredJobCount === 1,
      failureRemovesPartialSchema: recovery.hasWorkflowRunTable
        && !recovery.hasPartialTable
        && !recovery.hasMigrationHistory,
      failureKeepsBackupForInspection: recovery.backupExists
        && recovery.backupVersion === 11,
      acceptsPortableLineEndingChecksums: lineEndings.reopenedVersion === SCHEMA_VERSION
        && lineEndings.storedLfChecksum !== lineEndings.legacyCrlfChecksum,
      acceptsLegacyLineEndingChecksums: lineEndings.acceptedLegacyCrlfChecksum,
      rejectsSemanticMigrationChanges: lineEndings.semanticErrorCode === "SQLITE_MIGRATION_CHECKSUM_MISMATCH"
        && lineEndings.semanticErrorVersion === SCHEMA_VERSION
    };

    console.log(JSON.stringify({
      ok: Object.values(checks).every(Boolean),
      checks,
      upgrade,
      bootstrap,
      recovery
    }, null, 2));
    process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

function runUpgradeScenario(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "boss_find.sqlite3");
  createLegacyDatabase(dbPath, 7);

  const store = createJobStore({ dataDir });
  try {
    const status = store.getMigrationStatus();
    const historyCount = Number(store.database.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count);
    const backup = inspectBackup(status.backupPath);
    return {
      currentVersion: status.currentVersion,
      finalVersion: status.finalVersion,
      appliedVersions: status.applied.map((migration) => migration.version),
      baselinedVersions: status.baselined.map((migration) => migration.version),
      backupCreated: status.backupCreated,
      backupExists: backup.exists,
      backupVersion: backup.version,
      backupJobCount: backup.jobCount,
      jobCount: store.countJobs(),
      historyCount,
      hasWorkflowEvents: tableExists(store.database, "workflow_events"),
      hasResumeFitEvaluations: tableExists(store.database, "resume_fit_evaluations"),
      hasResumeClaimVerifications: tableExists(store.database, "resume_claim_verifications"),
      hasProfileSnapshots: tableExists(store.database, "profile_snapshots"),
      hasWorkflowRuns: tableExists(store.database, "workflow_runs"),
      hasWorkflowInputSnapshots: tableExists(store.database, "workflow_input_snapshots"),
      hasApplicationEventIdempotency: columnExists(store.database, "application_events", "idempotency_key"),
      hasBrowserTaskExpiry: columnExists(store.database, "browser_tasks", "expires_at"),
      hasBrowserTaskClaimToken: columnExists(store.database, "browser_tasks", "claim_token"),
      hasRealActionPolicies: tableExists(store.database, "real_action_policies"),
      hasRealActionAuthorizations: tableExists(store.database, "real_action_authorizations"),
      hasProfileDialogSessions: tableExists(store.database, "profile_dialog_sessions"),
      hasProfileDialogMessages: tableExists(store.database, "profile_dialog_messages"),
      hasProfileContextVersions: tableExists(store.database, "profile_context_versions"),
      hasProfileEntityRevisions: tableExists(store.database, "profile_entity_revisions"),
      hasAgentRunModelTelemetry: columnExists(store.database, "agent_runs", "model_telemetry_json"),
      hasAgentEvaluationRuns: tableExists(store.database, "agent_evaluation_runs"),
      hasAgentShadowRuns: tableExists(store.database, "agent_shadow_runs"),
      hasAgentShadowItems: tableExists(store.database, "agent_shadow_items"),
      hasAgentShadowSamples: tableExists(store.database, "agent_shadow_samples"),
      hasAgentShadowReviews: tableExists(store.database, "agent_shadow_reviews"),
      hasApplicationQueues: tableExists(store.database, "application_queues"),
      hasApplicationQueueItems: tableExists(store.database, "application_queue_items"),
      hasManualApplicationStatus: columnExists(store.database, "applications", "manual_status"),
      hasQueueTrustMarker: columnExists(store.database, "application_queue_items", "trusted_at")
    };
  } finally {
    store.close();
  }
}

function runCurrentVersionBootstrapScenario(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "boss_find.sqlite3");
  createLegacyDatabase(dbPath, SCHEMA_VERSION);

  const store = createJobStore({ dataDir });
  try {
    const status = store.getMigrationStatus();
    const historyCount = Number(store.database.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count);
    const backup = inspectBackup(status.backupPath);
    return {
      currentVersion: status.currentVersion,
      finalVersion: status.finalVersion,
      appliedCount: status.applied.length,
      baselinedCount: status.baselined.length,
      historyCount,
      backupCreated: status.backupCreated,
      backupVersion: backup.version,
      backupJobCount: backup.jobCount,
      jobCount: store.countJobs()
    };
  } finally {
    store.close();
  }
}

function runRecoveryScenario(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "boss_find.sqlite3");
  const brokenMigrationsDir = path.join(dataDir, "broken-migrations");
  createLegacyDatabase(dbPath, 11);
  fs.cpSync(MIGRATIONS_DIR, brokenMigrationsDir, { recursive: true });
  fs.writeFileSync(path.join(brokenMigrationsDir, "012_application_transition_invariants.sql"), [
    "CREATE TABLE migration_should_rollback (id INTEGER PRIMARY KEY);",
    "INSERT INTO table_that_does_not_exist (id) VALUES (1);"
  ].join("\n"), "utf8");

  let failure;
  try {
    createJobStore({
      dataDir,
      migrationsDir: brokenMigrationsDir
    });
  } catch (error) {
    failure = error;
  }
  if (!failure) {
    throw new Error("Expected broken migration to fail.");
  }

  const restored = new DatabaseSync(dbPath);
  try {
    const backup = inspectBackup(failure.backupPath);
    return {
      errorCode: failure.code,
      failedMigration: failure.failedMigration,
      failedMigrationVersion: failure.failedMigrationVersion,
      restored: failure.restored === true,
      restoredVersion: readUserVersion(restored),
      restoredJobCount: Number(restored.prepare("SELECT COUNT(*) AS count FROM jobs").get().count),
      hasWorkflowRunTable: tableExists(restored, "workflow_runs"),
      hasPartialTable: tableExists(restored, "migration_should_rollback"),
      hasMigrationHistory: tableExists(restored, "schema_migrations"),
      backupExists: backup.exists,
      backupVersion: backup.version
    };
  } finally {
    restored.close();
  }
}

function runLineEndingPortabilityScenario(rootDir) {
  const dataDir = path.join(rootDir, "data");
  const lfMigrationsDir = path.join(rootDir, "migrations-lf");
  const crlfMigrationsDir = path.join(rootDir, "migrations-crlf");
  const changedMigrationsDir = path.join(rootDir, "migrations-changed");
  fs.mkdirSync(dataDir, { recursive: true });
  writeMigrationVariant(lfMigrationsDir, "\n");
  writeMigrationVariant(crlfMigrationsDir, "\r\n");

  const initialStore = createJobStore({ dataDir, migrationsDir: lfMigrationsDir });
  let storedLfChecksum;
  try {
    storedLfChecksum = initialStore.database.prepare(`
      SELECT checksum FROM schema_migrations WHERE version = 1
    `).get().checksum;
  } finally {
    initialStore.close();
  }

  const firstMigration = fs.readdirSync(crlfMigrationsDir)
    .find((fileName) => fileName.startsWith("001_"));
  const legacyCrlfChecksum = checksum(fs.readFileSync(
    path.join(crlfMigrationsDir, firstMigration),
    "utf8"
  ));
  const database = new DatabaseSync(path.join(dataDir, "boss_find.sqlite3"));
  try {
    database.prepare(`
      UPDATE schema_migrations SET checksum = ? WHERE version = 1
    `).run(legacyCrlfChecksum);
  } finally {
    database.close();
  }

  const reopenedStore = createJobStore({ dataDir, migrationsDir: crlfMigrationsDir });
  let reopenedVersion;
  let acceptedLegacyCrlfChecksum;
  try {
    reopenedVersion = readUserVersion(reopenedStore.database);
    acceptedLegacyCrlfChecksum = reopenedStore.database.prepare(`
      SELECT checksum FROM schema_migrations WHERE version = 1
    `).get().checksum === legacyCrlfChecksum;
  } finally {
    reopenedStore.close();
  }

  fs.cpSync(lfMigrationsDir, changedMigrationsDir, { recursive: true });
  const latestMigration = fs.readdirSync(changedMigrationsDir)
    .find((fileName) => fileName.startsWith(`${String(SCHEMA_VERSION).padStart(3, "0")}_`));
  fs.appendFileSync(
    path.join(changedMigrationsDir, latestMigration),
    "\nCREATE TABLE checksum_semantic_change (id INTEGER PRIMARY KEY);\n",
    "utf8"
  );
  let semanticFailure;
  try {
    createJobStore({ dataDir, migrationsDir: changedMigrationsDir });
  } catch (error) {
    semanticFailure = error;
  }
  if (!semanticFailure) {
    throw new Error("Expected a semantic migration change to fail checksum validation.");
  }

  return {
    storedLfChecksum,
    legacyCrlfChecksum,
    reopenedVersion,
    acceptedLegacyCrlfChecksum,
    semanticErrorCode: semanticFailure.code,
    semanticErrorVersion: semanticFailure.version
  };
}

function writeMigrationVariant(targetDir, lineEnding) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const fileName of fs.readdirSync(MIGRATIONS_DIR)) {
    if (!fileName.endsWith(".sql")) {
      continue;
    }
    const source = fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), "utf8");
    const normalized = source.replace(/\r\n?|\n/g, "\n");
    const variant = lineEnding === "\n" ? normalized : normalized.replace(/\n/g, lineEnding);
    fs.writeFileSync(path.join(targetDir, fileName), variant, "utf8");
  }
}

function checksum(sql) {
  return crypto.createHash("sha256").update(sql.trim(), "utf8").digest("hex");
}

function createLegacyDatabase(dbPath, version) {
  const database = new DatabaseSync(dbPath);
  try {
    database.exec("PRAGMA foreign_keys = ON");
    const migrations = loadMigrations(MIGRATIONS_DIR, SCHEMA_VERSION)
      .filter((migration) => migration.version <= version);
    for (const migration of migrations) {
      database.exec(migration.sql);
      database.exec(`PRAGMA user_version = ${migration.version}`);
    }
    const now = "2026-07-10T00:00:00.000Z";
    const batchId = Number(database.prepare(`
      INSERT INTO capture_batches (
        source, exported_at, received_at, received_jobs, page_count, created_at
      ) VALUES ('m13-legacy', ?, ?, 1, 1, ?)
    `).run(now, now, now).lastInsertRowid);
    const companyId = Number(database.prepare(`
      INSERT INTO companies (name, created_at, updated_at)
      VALUES ('Legacy Company', ?, ?)
    `).run(now, now).lastInsertRowid);
    const jobId = Number(database.prepare(`
      INSERT INTO jobs (
        source_key, job_id, title, company_id, company_name, description,
        detail_url, first_seen_at, last_seen_at, captured_at, sync_source,
        created_at, updated_at
      ) VALUES (
        'legacy-job', 'legacy-job', 'Legacy Role', ?, 'Legacy Company',
        'Legacy description that must survive schema migration and recovery.',
        'https://www.zhipin.com/job_detail/legacy-job.html',
        ?, ?, ?, 'm13-legacy', ?, ?
      )
    `).run(companyId, now, now, now, now, now).lastInsertRowid);
    database.prepare(`
      INSERT INTO job_snapshots (
        job_id, batch_id, source_key, title, company_name, detail_url,
        description_length, payload_json, captured_at, created_at
      ) VALUES (?, ?, 'legacy-job', 'Legacy Role', 'Legacy Company',
        'https://www.zhipin.com/job_detail/legacy-job.html', 66, '{}', ?, ?)
    `).run(jobId, batchId, now, now);
  } finally {
    database.close();
  }
}

function inspectBackup(backupPath) {
  if (!backupPath || !fs.existsSync(backupPath)) {
    return { exists: false, version: -1, jobCount: -1 };
  }
  const backup = new DatabaseSync(backupPath, { readOnly: true });
  try {
    return {
      exists: true,
      version: readUserVersion(backup),
      jobCount: Number(backup.prepare("SELECT COUNT(*) AS count FROM jobs").get().count)
    };
  } finally {
    backup.close();
  }
}

function tableExists(database, tableName) {
  return Boolean(database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(tableName));
}

function columnExists(database, tableName, columnName) {
  return database.prepare(`PRAGMA table_info(${tableName})`).all()
    .some((column) => column.name === columnName);
}

function readUserVersion(database) {
  return Number(database.prepare("PRAGMA user_version").get().user_version || 0);
}
