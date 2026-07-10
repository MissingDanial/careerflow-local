"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MIGRATION_FILE_PATTERN = /^(\d{3})_([a-z0-9][a-z0-9_-]*)\.sql$/i;

function runSqliteMigrations(options) {
  const {
    database,
    dbPath,
    migrationsDir,
    targetVersion,
    databaseExisted = false,
    backupDir = path.join(path.dirname(dbPath), "backups")
  } = options;
  const startedAt = Date.now();
  const migrations = loadMigrations(migrationsDir, targetVersion);
  const currentVersion = readUserVersion(database);

  if (currentVersion > targetVersion) {
    throw migrationError(
      "SQLITE_SCHEMA_NEWER_THAN_RUNTIME",
      `Database schema version ${currentVersion} is newer than supported version ${targetVersion}.`,
      { currentVersion, targetVersion }
    );
  }

  const history = readMigrationHistory(database);
  validateMigrationHistory(history, migrations, currentVersion);
  const historyByVersion = new Map(history.map((row) => [Number(row.version), row]));
  const baselines = migrations.filter((migration) => migration.version <= currentVersion && !historyByVersion.has(migration.version));
  const pending = migrations.filter((migration) => migration.version > currentVersion);
  const needsMetadataBootstrap = !migrationHistoryTableExists(database) || baselines.length > 0;
  const needsMutation = needsMetadataBootstrap || pending.length > 0;
  const backupPath = databaseExisted && needsMutation
    ? createMigrationBackup(database, dbPath, backupDir, currentVersion, targetVersion)
    : "";

  try {
    if (needsMetadataBootstrap) {
      bootstrapMigrationHistory(database, baselines);
    }
    for (const migration of pending) {
      applyMigration(database, migration);
    }
  } catch (cause) {
    const recovery = recoverDatabase({
      database,
      dbPath,
      backupPath,
      databaseExisted
    });
    throw migrationError(
      "SQLITE_MIGRATION_FAILED",
      `SQLite migration failed and ${recovery.restored ? "the original database was restored" : "the incomplete database was removed"}.`,
      {
        currentVersion,
        targetVersion,
        backupPath,
        restored: recovery.restored,
        databaseClosed: recovery.databaseClosed,
        failedMigration: cause.migrationFile || "",
        failedMigrationVersion: Number(cause.migrationVersion || 0),
        cause: cause.message
      },
      cause
    );
  }

  return {
    currentVersion,
    targetVersion,
    finalVersion: readUserVersion(database),
    applied: pending.map(toMigrationSummary),
    baselined: baselines.map(toMigrationSummary),
    backupCreated: Boolean(backupPath),
    backupPath,
    migrationsDir,
    durationMs: Date.now() - startedAt
  };
}

function loadMigrations(migrationsDir, targetVersion) {
  const directory = path.resolve(migrationsDir);
  if (!fs.existsSync(directory)) {
    throw migrationError("SQLITE_MIGRATIONS_MISSING", `Migration directory does not exist: ${directory}`);
  }

  const migrations = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => {
      const match = entry.name.match(MIGRATION_FILE_PATTERN);
      if (!match) {
        throw migrationError("SQLITE_MIGRATION_NAME_INVALID", `Invalid migration file name: ${entry.name}`);
      }
      const sql = fs.readFileSync(path.join(directory, entry.name), "utf8").trim();
      if (!sql) {
        throw migrationError("SQLITE_MIGRATION_EMPTY", `Migration file is empty: ${entry.name}`);
      }
      if (/\b(?:BEGIN|COMMIT|ROLLBACK)\b/i.test(sql) || /PRAGMA\s+user_version/i.test(sql)) {
        throw migrationError(
          "SQLITE_MIGRATION_TRANSACTION_INVALID",
          `Migration must not manage transactions or user_version directly: ${entry.name}`
        );
      }
      return {
        version: Number(match[1]),
        name: match[2],
        fileName: entry.name,
        sql,
        checksum: checksum(sql)
      };
    })
    .sort((left, right) => left.version - right.version);

  const versions = migrations.map((migration) => migration.version);
  const expected = Array.from({ length: targetVersion }, (_, index) => index + 1);
  if (versions.length !== expected.length || versions.some((version, index) => version !== expected[index])) {
    throw migrationError(
      "SQLITE_MIGRATION_SEQUENCE_INVALID",
      `Expected contiguous migrations 001-${String(targetVersion).padStart(3, "0")}, found: ${versions.join(", ")}.`
    );
  }
  return migrations;
}

function bootstrapMigrationHistory(database, baselines) {
  database.exec("BEGIN IMMEDIATE");
  try {
    ensureMigrationHistoryTable(database);
    const insert = database.prepare(`
      INSERT OR IGNORE INTO schema_migrations (
        version, name, checksum, status, execution_ms, applied_at
      ) VALUES (?, ?, ?, 'BASELINED', 0, ?)
    `);
    const now = new Date().toISOString();
    for (const migration of baselines) {
      insert.run(migration.version, migration.name, migration.checksum, now);
    }
    database.exec("COMMIT");
  } catch (error) {
    rollbackQuietly(database);
    throw error;
  }
}

function applyMigration(database, migration) {
  const startedAt = Date.now();
  database.exec("BEGIN IMMEDIATE");
  try {
    ensureMigrationHistoryTable(database);
    database.exec(migration.sql);
    database.prepare(`
      INSERT INTO schema_migrations (
        version, name, checksum, status, execution_ms, applied_at
      ) VALUES (?, ?, ?, 'APPLIED', ?, ?)
    `).run(
      migration.version,
      migration.name,
      migration.checksum,
      Date.now() - startedAt,
      new Date().toISOString()
    );
    database.exec(`PRAGMA user_version = ${migration.version}`);
    database.exec("COMMIT");
  } catch (error) {
    error.migrationVersion = migration.version;
    error.migrationFile = migration.fileName;
    rollbackQuietly(database);
    throw error;
  }
}

function ensureMigrationHistoryTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      status TEXT NOT NULL,
      execution_ms INTEGER NOT NULL DEFAULT 0,
      applied_at TEXT NOT NULL
    )
  `);
}

function readMigrationHistory(database) {
  if (!migrationHistoryTableExists(database)) {
    return [];
  }
  return database.prepare(`
    SELECT version, name, checksum, status, execution_ms, applied_at
    FROM schema_migrations
    ORDER BY version ASC
  `).all();
}

function migrationHistoryTableExists(database) {
  return Boolean(database.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'schema_migrations'
  `).get());
}

function validateMigrationHistory(history, migrations, currentVersion) {
  const migrationsByVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  for (const row of history) {
    const version = Number(row.version);
    const migration = migrationsByVersion.get(version);
    if (!migration || version > currentVersion) {
      throw migrationError(
        "SQLITE_MIGRATION_HISTORY_INVALID",
        `Migration history contains unexpected version ${version}.`,
        { currentVersion, historyVersion: version }
      );
    }
    if (row.checksum !== migration.checksum) {
      throw migrationError(
        "SQLITE_MIGRATION_CHECKSUM_MISMATCH",
        `Migration checksum mismatch for ${migration.fileName}.`,
        { version, expected: migration.checksum, actual: row.checksum }
      );
    }
  }
}

function createMigrationBackup(database, dbPath, backupDir, currentVersion, targetVersion) {
  fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const baseName = path.basename(dbPath);
  const backupPath = uniqueBackupPath(
    backupDir,
    `${baseName}.v${currentVersion}-to-v${targetVersion}.${timestamp}.backup.sqlite3`
  );
  database.exec(`VACUUM INTO '${escapeSqliteString(backupPath)}'`);
  return backupPath;
}

function uniqueBackupPath(directory, fileName) {
  const parsed = path.parse(fileName);
  let candidate = path.join(directory, fileName);
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${parsed.name}-${suffix}${parsed.ext}`);
    suffix += 1;
  }
  return candidate;
}

function recoverDatabase({ database, dbPath, backupPath, databaseExisted }) {
  let databaseClosed = false;
  try {
    database.close();
    databaseClosed = true;
  } catch {
    databaseClosed = true;
  }
  removeSqliteFiles(dbPath);

  if (backupPath && fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, dbPath);
    return { restored: true, databaseClosed };
  }
  if (!databaseExisted) {
    removeSqliteFiles(dbPath);
  }
  return { restored: false, databaseClosed };
}

function removeSqliteFiles(dbPath) {
  for (const filePath of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    fs.rmSync(filePath, { force: true });
  }
}

function rollbackQuietly(database) {
  try {
    database.exec("ROLLBACK");
  } catch {
    // The transaction may already be closed by SQLite after a hard failure.
  }
}

function readUserVersion(database) {
  return Number(database.prepare("PRAGMA user_version").get().user_version || 0);
}

function checksum(sql) {
  return crypto.createHash("sha256").update(sql, "utf8").digest("hex");
}

function escapeSqliteString(value) {
  return String(value).replaceAll("'", "''");
}

function toMigrationSummary(migration) {
  return {
    version: migration.version,
    name: migration.name,
    fileName: migration.fileName,
    checksum: migration.checksum
  };
}

function migrationError(code, message, details = {}, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  Object.assign(error, details);
  return error;
}

module.exports = {
  loadMigrations,
  runSqliteMigrations
};
