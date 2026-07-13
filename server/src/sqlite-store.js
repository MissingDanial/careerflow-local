const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { runSqliteMigrations } = require("./sqlite-migrations");
const {
  ApplicationTransitionService,
  canTransitionApplication,
  normalizeApplicationStatus
} = require("./services/application-transition-service");
const {
  RealActionAuthorizationService,
  isRealActionType
} = require("./services/real-action-authorization-service");

let DatabaseSync;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch (error) {
  throw new Error("SQLite storage requires Node.js with node:sqlite support. Use Node.js 24 or newer for this project.");
}

const SCHEMA_VERSION = 14;
const DEFAULT_DB_NAME = "boss_find.sqlite3";

function createJobStore(options = {}) {
  const dataDir = path.resolve(options.dataDir || path.join(__dirname, "..", "data"));
  const dbPath = path.resolve(options.dbPath || process.env.BOSS_DB_PATH || path.join(dataDir, DEFAULT_DB_NAME));
  const legacyStorePath = path.resolve(options.legacyStorePath || path.join(dataDir, "jobs.json"));
  const migrationsDir = path.resolve(options.migrationsDir || path.join(__dirname, "..", "migrations"));
  const backupDir = path.resolve(options.backupDir || path.join(path.dirname(dbPath), "backups"));
  const databaseExisted = fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const database = new DatabaseSync(dbPath);
  try {
    const store = new SqliteJobStore(database, {
      dbPath,
      legacyStorePath,
      migrationsDir,
      backupDir,
      databaseExisted
    });
    store.init();
    return store;
  } catch (error) {
    try {
      database.close();
    } catch {
      // Migration recovery may already have closed the database.
    }
    throw error;
  }
}

class SqliteJobStore {
  constructor(database, options) {
    this.database = database;
    this.dbPath = options.dbPath;
    this.legacyStorePath = options.legacyStorePath;
    this.migrationsDir = options.migrationsDir;
    this.backupDir = options.backupDir;
    this.databaseExisted = options.databaseExisted;
    this.migrationStatus = null;
    this.applicationTransitionService = new ApplicationTransitionService({
      database: this.database,
      insertApplicationEvent: (event) => this.insertApplicationEvent(event),
      insertWorkflowEvent: (event, now) => this.insertWorkflowEvent(event, now)
    });
    this.realActionAuthorizationService = new RealActionAuthorizationService({
      database: this.database,
      insertWorkflowEvent: (event, now) => this.insertWorkflowEvent(event, now),
      createBrowserTaskWithinTransaction: (input, now) => this.createBrowserTaskWithinTransaction(input, now),
      getBrowserTask: (taskId) => this.getBrowserTask(taskId),
      transitionApplicationWithinTransaction: (applicationId, transition) => (
        this.transitionApplicationWithinTransaction(applicationId, transition)
      )
    });
  }

  init() {
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec("PRAGMA journal_mode = WAL");
    this.migrationStatus = runSqliteMigrations({
      database: this.database,
      dbPath: this.dbPath,
      migrationsDir: this.migrationsDir,
      backupDir: this.backupDir,
      targetVersion: SCHEMA_VERSION,
      databaseExisted: this.databaseExisted
    });
    this.importLegacyJsonIfNeeded();
    this.backfillApplicationsIfNeeded();
  }

  close() {
    this.database.close();
  }

  getMigrationStatus() {
    return this.migrationStatus ? structuredClone(this.migrationStatus) : null;
  }

  syncJobs(payload) {
    if (!payload || !Array.isArray(payload.jobs)) {
      throw validationError("Request body must include jobs[]");
    }

    const now = new Date().toISOString();
    const incoming = payload.jobs.map((job) => normalizeJob(job, payload, now)).filter(isValidJob);

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const batchId = this.insertCaptureBatch(payload, incoming.length, now);
      for (const job of incoming) {
        this.upsertJob(job, batchId, now);
      }
      this.insertCaptureQuality(batchId, payload, incoming, now);
      this.insertBrowserEvents(batchId, payload, now);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }

    return {
      ok: true,
      received: incoming.length,
      stored: this.countJobs(),
      updatedAt: now,
      storage: "sqlite"
    };
  }

  readStore() {
    const rows = this.database.prepare(`
      SELECT
        jobs.*,
        companies.name AS company_table_name
      FROM jobs
      LEFT JOIN companies ON companies.id = jobs.company_id
      ORDER BY datetime(jobs.last_seen_at) DESC, jobs.id DESC
    `).all();
    const lastBatch = this.getLastBatch();

    return {
      version: 2,
      storage: "sqlite",
      updatedAt: rows[0]?.last_seen_at || lastBatch?.receivedAt || null,
      totalJobs: rows.length,
      lastBatch,
      jobs: rows.map(rowToJob)
    };
  }

  getStats() {
    const jobStats = this.database.prepare(`
      SELECT
        COUNT(*) AS totalJobs,
        SUM(CASE WHEN LENGTH(COALESCE(description, '')) >= 80 THEN 1 ELSE 0 END) AS describedJobCount,
        SUM(CASE WHEN LENGTH(TRIM(COALESCE(description, ''))) < 80 THEN 1 ELSE 0 END) AS missingDescriptionCount,
        COUNT(DISTINCT company_id) AS companyCount
      FROM jobs
    `).get();
    const batchCount = this.database.prepare("SELECT COUNT(*) AS count FROM capture_batches").get().count;
    const applicationCount = this.database.prepare("SELECT COUNT(*) AS count FROM applications").get().count;
    const applicationEventCount = this.database.prepare("SELECT COUNT(*) AS count FROM application_events").get().count;
    const browserTaskCount = this.database.prepare("SELECT COUNT(*) AS count FROM browser_tasks").get().count;
    const conversationCount = this.database.prepare("SELECT COUNT(*) AS count FROM conversations").get().count;
    const messageCount = this.database.prepare("SELECT COUNT(*) AS count FROM messages").get().count;
    const snapshotCount = this.database.prepare("SELECT COUNT(*) AS count FROM job_snapshots").get().count;
    const tagCount = this.database.prepare("SELECT COUNT(*) AS count FROM job_tags").get().count;
    const welfareCount = this.database.prepare("SELECT COUNT(*) AS count FROM job_welfare").get().count;
    const qualityCount = this.database.prepare("SELECT COUNT(*) AS count FROM capture_quality").get().count;
    const browserEventCount = this.database.prepare("SELECT COUNT(*) AS count FROM browser_events").get().count;
    const profileCount = this.database.prepare("SELECT COUNT(*) AS count FROM candidate_profiles").get().count;
    const resumeSourceCount = this.database.prepare("SELECT COUNT(*) AS count FROM resume_sources").get().count;
    const experienceCount = this.database.prepare("SELECT COUNT(*) AS count FROM profile_experiences").get().count;
    const skillCount = this.database.prepare("SELECT COUNT(*) AS count FROM profile_skills").get().count;
    const constraintCount = this.database.prepare("SELECT COUNT(*) AS count FROM profile_constraints").get().count;
    const factDraftCount = this.database.prepare("SELECT COUNT(*) AS count FROM profile_fact_drafts").get().count;
    const pendingFactDraftCount = this.database.prepare("SELECT COUNT(*) AS count FROM profile_fact_drafts WHERE status = 'PENDING'").get().count;
    const profileDialogSessionCount = this.database.prepare("SELECT COUNT(*) AS count FROM profile_dialog_sessions").get().count;
    const profileDialogMessageCount = this.database.prepare("SELECT COUNT(*) AS count FROM profile_dialog_messages").get().count;
    const profileContextVersionCount = this.database.prepare("SELECT COUNT(*) AS count FROM profile_context_versions").get().count;
    const profileEntityRevisionCount = this.database.prepare("SELECT COUNT(*) AS count FROM profile_entity_revisions").get().count;
    const agentRunCount = this.database.prepare("SELECT COUNT(*) AS count FROM agent_runs").get().count;
    const screeningCount = this.database.prepare("SELECT COUNT(*) AS count FROM screenings").get().count;
    const resumeVersionCount = this.database.prepare("SELECT COUNT(*) AS count FROM resume_versions").get().count;
    const resumeAuditCount = this.database.prepare("SELECT COUNT(*) AS count FROM resume_audits").get().count;
    const resumeFitEvaluationCount = this.database.prepare("SELECT COUNT(*) AS count FROM resume_fit_evaluations").get().count;
    const resumeClaimVerificationCount = this.database.prepare("SELECT COUNT(*) AS count FROM resume_claim_verifications").get().count;
    const workflowEventCount = this.database.prepare("SELECT COUNT(*) AS count FROM workflow_events").get().count;
    const profileSnapshotCount = this.database.prepare("SELECT COUNT(*) AS count FROM profile_snapshots").get().count;
    const workflowRunCount = this.database.prepare("SELECT COUNT(*) AS count FROM workflow_runs").get().count;
    const workflowInputSnapshotCount = this.database.prepare("SELECT COUNT(*) AS count FROM workflow_input_snapshots").get().count;
    const openWorkflowErrorCount = this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM workflow_events
      WHERE resolution_status = 'OPEN'
        AND (severity IN ('warning', 'error') OR error_code != '' OR error_message != '')
    `).get().count;

    return {
      storage: "sqlite",
      databasePath: this.dbPath,
      schemaVersion: this.database.prepare("PRAGMA user_version").get().user_version,
      migrationStatus: this.getMigrationStatus(),
      totalJobs: Number(jobStats.totalJobs || 0),
      describedJobCount: Number(jobStats.describedJobCount || 0),
      missingDescriptionCount: Number(jobStats.missingDescriptionCount || 0),
      companyCount: Number(jobStats.companyCount || 0),
      applicationCount: Number(applicationCount || 0),
      applicationEventCount: Number(applicationEventCount || 0),
      browserTaskCount: Number(browserTaskCount || 0),
      conversationCount: Number(conversationCount || 0),
      messageCount: Number(messageCount || 0),
      batchCount: Number(batchCount || 0),
      snapshotCount: Number(snapshotCount || 0),
      tagCount: Number(tagCount || 0),
      welfareCount: Number(welfareCount || 0),
      qualityCount: Number(qualityCount || 0),
      browserEventCount: Number(browserEventCount || 0),
      profileCount: Number(profileCount || 0),
      resumeSourceCount: Number(resumeSourceCount || 0),
      experienceCount: Number(experienceCount || 0),
      skillCount: Number(skillCount || 0),
      constraintCount: Number(constraintCount || 0),
      factDraftCount: Number(factDraftCount || 0),
      pendingFactDraftCount: Number(pendingFactDraftCount || 0),
      profileDialogSessionCount: Number(profileDialogSessionCount || 0),
      profileDialogMessageCount: Number(profileDialogMessageCount || 0),
      profileContextVersionCount: Number(profileContextVersionCount || 0),
      profileEntityRevisionCount: Number(profileEntityRevisionCount || 0),
      agentRunCount: Number(agentRunCount || 0),
      screeningCount: Number(screeningCount || 0),
      resumeVersionCount: Number(resumeVersionCount || 0),
      resumeAuditCount: Number(resumeAuditCount || 0),
      resumeFitEvaluationCount: Number(resumeFitEvaluationCount || 0),
      resumeClaimVerificationCount: Number(resumeClaimVerificationCount || 0),
      workflowEventCount: Number(workflowEventCount || 0),
      profileSnapshotCount: Number(profileSnapshotCount || 0),
      workflowRunCount: Number(workflowRunCount || 0),
      workflowInputSnapshotCount: Number(workflowInputSnapshotCount || 0),
      openWorkflowErrorCount: Number(openWorkflowErrorCount || 0),
      latestQuality: this.getLatestQuality(),
      lastBatch: this.getLastBatch()
    };
  }

  getQualityReport(limit = 20) {
    const latest = this.getLatestQuality();
    const rows = this.database.prepare(`
      SELECT
        capture_quality.*,
        capture_batches.source,
        capture_batches.exported_at,
        capture_batches.received_at
      FROM capture_quality
      JOIN capture_batches ON capture_batches.id = capture_quality.batch_id
      ORDER BY capture_quality.id DESC
      LIMIT ?
    `).all(Math.max(1, Math.min(100, Number(limit) || 20)));

    return {
      storage: "sqlite",
      latest,
      history: rows.map(rowToQuality)
    };
  }

  getBrowserEvents(limit = 20) {
    const rows = this.database.prepare(`
      SELECT
        browser_events.*,
        capture_batches.source,
        capture_batches.exported_at,
        capture_batches.received_at
      FROM browser_events
      LEFT JOIN capture_batches ON capture_batches.id = browser_events.batch_id
      ORDER BY browser_events.id DESC
      LIMIT ?
    `).all(Math.max(1, Math.min(100, Number(limit) || 20)));

    return {
      storage: "sqlite",
      events: rows.map(rowToBrowserEvent)
    };
  }

  getProfile() {
    const profile = this.getOrCreateProfile();
    return this.readProfileBundle(profile.id);
  }

  getProfileHash() {
    return stableJsonHash(this.getProfile());
  }

  createProfileDialogSession(input = {}) {
    const profile = this.getOrCreateProfile();
    const now = new Date().toISOString();
    const result = this.database.prepare(`
      INSERT INTO profile_dialog_sessions (
        profile_id, title, status, summary_json, open_questions_json,
        conflicts_json, model_config_json, last_message_at, created_at, updated_at
      ) VALUES (?, ?, 'OPEN', '{}', '[]', '[]', ?, NULL, ?, ?)
    `).run(
      profile.id,
      cleanText(input.title || "职业经历复盘") || "职业经历复盘",
      stringifyJson(input.modelConfig && typeof input.modelConfig === "object" ? input.modelConfig : {}),
      now,
      now
    );
    return this.getProfileDialogSession(Number(result.lastInsertRowid));
  }

  getProfileDialogSessions(options = {}) {
    const profile = this.getOrCreateProfile();
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
    const status = normalizeProfileDialogSessionStatus(options.status || "");
    if (options.status && !status) {
      throw validationError("Valid profile dialog session status is required");
    }
    const whereParts = ["profile_dialog_sessions.profile_id = ?"];
    const params = [profile.id];
    if (status) {
      whereParts.push("profile_dialog_sessions.status = ?");
      params.push(status);
    }
    params.push(limit);
    const rows = this.database.prepare(`
      SELECT
        profile_dialog_sessions.*,
        (SELECT COUNT(*) FROM profile_dialog_messages WHERE session_id = profile_dialog_sessions.id) AS message_count,
        (SELECT COUNT(*) FROM profile_fact_drafts
          WHERE source_session_id = profile_dialog_sessions.id AND status = 'PENDING') AS pending_draft_count
      FROM profile_dialog_sessions
      WHERE ${whereParts.join(" AND ")}
      ORDER BY datetime(COALESCE(last_message_at, updated_at)) DESC, id DESC
      LIMIT ?
    `).all(...params);
    return {
      storage: "sqlite",
      totalSessions: Number(this.database.prepare(
        "SELECT COUNT(*) AS count FROM profile_dialog_sessions WHERE profile_id = ?"
      ).get(profile.id).count || 0),
      sessions: rows.map(rowToProfileDialogSession)
    };
  }

  getProfileDialogSession(sessionId) {
    const id = normalizePositiveInteger(sessionId);
    if (!id) {
      throw validationError("Valid profile dialog session id is required");
    }
    const profile = this.getOrCreateProfile();
    const row = this.database.prepare(`
      SELECT
        profile_dialog_sessions.*,
        (SELECT COUNT(*) FROM profile_dialog_messages WHERE session_id = profile_dialog_sessions.id) AS message_count,
        (SELECT COUNT(*) FROM profile_fact_drafts
          WHERE source_session_id = profile_dialog_sessions.id AND status = 'PENDING') AS pending_draft_count
      FROM profile_dialog_sessions
      WHERE profile_dialog_sessions.id = ? AND profile_dialog_sessions.profile_id = ?
    `).get(id, profile.id);
    if (!row) {
      throw validationError(`Profile dialog session not found: ${id}`);
    }
    return rowToProfileDialogSession(row);
  }

  updateProfileDialogSession(sessionId, input = {}) {
    const session = this.getProfileDialogSession(sessionId);
    const status = input.status ? normalizeProfileDialogSessionStatus(input.status) : session.status;
    if (!status) {
      throw validationError("Valid profile dialog session status is required");
    }
    const summary = input.summary && typeof input.summary === "object" ? input.summary : session.summary;
    const questions = Array.isArray(input.openQuestions) ? input.openQuestions : session.openQuestions;
    const conflicts = Array.isArray(input.conflicts) ? input.conflicts : session.conflicts;
    const modelConfig = input.modelConfig && typeof input.modelConfig === "object" ? input.modelConfig : session.modelConfig;
    const now = new Date().toISOString();
    this.database.prepare(`
      UPDATE profile_dialog_sessions
      SET title = ?, status = ?, summary_json = ?, open_questions_json = ?,
          conflicts_json = ?, model_config_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      cleanText(input.title ?? session.title) || session.title,
      status,
      stringifyJson(summary),
      stringifyJson(questions),
      stringifyJson(conflicts),
      stringifyJson(modelConfig),
      now,
      session.id
    );
    return this.getProfileDialogSession(session.id);
  }

  createProfileDialogMessage(sessionId, input = {}) {
    const session = this.getProfileDialogSession(sessionId);
    const role = normalizeProfileDialogRole(input.role || "");
    const status = normalizeProfileDialogMessageStatus(input.status || "COMPLETED");
    const content = cleanMultiline(input.content || "").slice(0, 50000);
    if (!role || !status) {
      throw validationError("Profile dialog message role and status are required");
    }
    if (role === "user" && !content) {
      throw validationError("Profile dialog user message content is required");
    }
    const now = new Date().toISOString();
    const result = this.database.prepare(`
      INSERT INTO profile_dialog_messages (
        session_id, role, status, content, structured_json, error_code,
        error_message, retry_of_message_id, agent_run_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      role,
      status,
      content,
      stringifyJson(input.structured && typeof input.structured === "object" ? input.structured : {}),
      cleanText(input.errorCode || ""),
      cleanMultiline(input.errorMessage || "").slice(0, 4000),
      normalizePositiveInteger(input.retryOfMessageId) || null,
      normalizePositiveInteger(input.agentRunId) || null,
      now
    );
    this.database.prepare(`
      UPDATE profile_dialog_sessions
      SET last_message_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, session.id);
    return this.getProfileDialogMessage(Number(result.lastInsertRowid));
  }

  getProfileDialogMessage(messageId) {
    const id = normalizePositiveInteger(messageId);
    if (!id) {
      throw validationError("Valid profile dialog message id is required");
    }
    const row = this.database.prepare("SELECT * FROM profile_dialog_messages WHERE id = ?").get(id);
    if (!row) {
      throw validationError(`Profile dialog message not found: ${id}`);
    }
    this.getProfileDialogSession(row.session_id);
    return rowToProfileDialogMessage(row);
  }

  getProfileDialogMessages(sessionId, options = {}) {
    const session = this.getProfileDialogSession(sessionId);
    const limit = Math.max(1, Math.min(200, Number(options.limit) || 80));
    const rows = this.database.prepare(`
      SELECT *
      FROM profile_dialog_messages
      WHERE session_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(session.id, limit).reverse();
    return {
      storage: "sqlite",
      session,
      totalMessages: Number(this.database.prepare(
        "SELECT COUNT(*) AS count FROM profile_dialog_messages WHERE session_id = ?"
      ).get(session.id).count || 0),
      messages: rows.map(rowToProfileDialogMessage)
    };
  }

  createProfileContextVersion(input = {}) {
    const profile = this.getOrCreateProfile();
    const structured = input.structured && typeof input.structured === "object" ? input.structured : {};
    const markdown = String(input.markdown || "");
    if (!markdown.trim()) {
      throw validationError("Profile context markdown is required");
    }
    const profileHash = cleanText(input.profileHash || this.getProfileHash());
    const contentHash = stableJsonHash({ structured, markdown });
    const now = new Date().toISOString();
    const result = this.database.prepare(`
      INSERT INTO profile_context_versions (
        profile_id, source_session_id, source_message_id, profile_hash,
        content_hash, structured_json, markdown, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.id,
      normalizePositiveInteger(input.sourceSessionId) || null,
      normalizePositiveInteger(input.sourceMessageId) || null,
      profileHash,
      contentHash,
      stringifyJson(structured),
      markdown,
      now
    );
    return rowToProfileContextVersion(this.database.prepare(
      "SELECT * FROM profile_context_versions WHERE id = ?"
    ).get(Number(result.lastInsertRowid)));
  }

  getLatestProfileContextVersion() {
    const profile = this.getOrCreateProfile();
    const row = this.database.prepare(`
      SELECT * FROM profile_context_versions
      WHERE profile_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(profile.id);
    return row ? rowToProfileContextVersion(row) : null;
  }

  getProfileContextVersionFreshness(version = null) {
    const snapshot = this.getProfileFreshnessSnapshot();
    if (!version?.id) {
      return {
        status: "MISSING",
        isFresh: false,
        contextUpdatedAt: "",
        latestProfileChangedAt: snapshot.latestProfileChangedAt,
        latestProfileChangeSource: snapshot.latestProfileChangeSource,
        latestProfileChangeId: snapshot.latestProfileChangeId,
        staleReasons: ["career_context_version_missing"],
        snapshot
      };
    }
    const currentProfileHash = this.getProfileHash();
    const isFresh = currentProfileHash === version.profileHash;
    return {
      status: isFresh ? "FRESH" : "STALE",
      isFresh,
      contextUpdatedAt: version.createdAt,
      latestProfileChangedAt: snapshot.latestProfileChangedAt,
      latestProfileChangeSource: snapshot.latestProfileChangeSource,
      latestProfileChangeId: snapshot.latestProfileChangeId,
      staleReasons: isFresh ? [] : ["profile_hash_changed_after_context_version"],
      profileHash: version.profileHash,
      currentProfileHash,
      contextVersionId: version.id,
      snapshot
    };
  }

  getProfileEntityRevisions(options = {}) {
    const profile = this.getOrCreateProfile();
    const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));
    const entityType = normalizeProfileEntityType(options.entityType || options.type || "");
    const entityId = normalizePositiveInteger(options.entityId || options.id || 0);
    const whereParts = ["profile_id = ?"];
    const params = [profile.id];
    if (entityType) {
      whereParts.push("entity_type = ?");
      params.push(entityType);
    }
    if (entityId) {
      whereParts.push("entity_id = ?");
      params.push(entityId);
    }
    params.push(limit);
    const rows = this.database.prepare(`
      SELECT * FROM profile_entity_revisions
      WHERE ${whereParts.join(" AND ")}
      ORDER BY id DESC LIMIT ?
    `).all(...params);
    return {
      storage: "sqlite",
      revisions: rows.map(rowToProfileEntityRevision)
    };
  }

  getProfileFreshnessSnapshot() {
    const counts = {
      profiles: countRows(this.database, "candidate_profiles"),
      resumeSources: countRows(this.database, "resume_sources"),
      experiences: countRows(this.database, "profile_experiences"),
      skills: countRows(this.database, "profile_skills"),
      constraints: countRows(this.database, "profile_constraints"),
      factDrafts: countRows(this.database, "profile_fact_drafts"),
      pendingFactDrafts: Number(this.database.prepare("SELECT COUNT(*) AS count FROM profile_fact_drafts WHERE status = 'PENDING'").get().count || 0)
    };
    const candidates = [
      latestTableTimestamp(this.database, "candidate_profiles", "updated_at", "profile"),
      latestTableTimestamp(this.database, "resume_sources", "created_at", "resume_source"),
      latestTableTimestamp(this.database, "profile_experiences", "updated_at", "experience"),
      latestTableTimestamp(this.database, "profile_skills", "updated_at", "skill"),
      latestTableTimestamp(this.database, "profile_constraints", "updated_at", "constraint"),
      latestTableTimestamp(this.database, "profile_fact_drafts", "updated_at", "fact_draft")
    ].filter((item) => item && item.updatedAt);
    const latest = candidates
      .slice()
      .sort((left, right) => Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0))[0] || null;
    return {
      storage: "sqlite",
      counts,
      latestProfileChangedAt: latest?.updatedAt || "",
      latestProfileChangeSource: latest?.source || "",
      latestProfileChangeId: latest?.id || null,
      latestProfileChange: latest
    };
  }

  getCareerContextFreshness(contextUpdatedAt = "") {
    const snapshot = this.getProfileFreshnessSnapshot();
    const contextTime = Date.parse(contextUpdatedAt || 0);
    const latestProfileTime = Date.parse(snapshot.latestProfileChangedAt || 0);
    if (!contextUpdatedAt || !Number.isFinite(contextTime)) {
      return {
        status: "MISSING",
        isFresh: false,
        contextUpdatedAt: "",
        latestProfileChangedAt: snapshot.latestProfileChangedAt,
        latestProfileChangeSource: snapshot.latestProfileChangeSource,
        latestProfileChangeId: snapshot.latestProfileChangeId,
        staleReasons: ["career_context_missing"],
        snapshot
      };
    }
    const isStale = Number.isFinite(latestProfileTime) && latestProfileTime > contextTime;
    return {
      status: isStale ? "STALE" : "FRESH",
      isFresh: !isStale,
      contextUpdatedAt,
      latestProfileChangedAt: snapshot.latestProfileChangedAt,
      latestProfileChangeSource: snapshot.latestProfileChangeSource,
      latestProfileChangeId: snapshot.latestProfileChangeId,
      staleReasons: isStale ? ["profile_changed_after_career_context"] : [],
      snapshot
    };
  }

  updateProfile(input = {}) {
    const profile = this.getOrCreateProfile();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.updateProfileWithinTransaction(profile.id, input);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return this.readProfileBundle(profile.id);
  }

  updateProfileWithinTransaction(profileId, input = {}) {
    const profile = this.database.prepare("SELECT * FROM candidate_profiles WHERE id = ?").get(profileId);
    if (!profile) {
      throw validationError(`Profile not found: ${profileId}`);
    }
    const currentTarget = parseJsonValue(profile.target_json, {});
    const target = input.target && typeof input.target === "object"
      ? { ...currentTarget, ...input.target }
      : currentTarget;
    const now = new Date().toISOString();
    this.database.prepare(`
      UPDATE candidate_profiles
      SET display_name = ?, headline = ?, location = ?, target_json = ?, summary = ?, updated_at = ?
      WHERE id = ?
    `).run(
      cleanText(input.displayName ?? input.display_name ?? profile.display_name),
      cleanText(input.headline ?? profile.headline),
      cleanText(input.location ?? profile.location),
      stringifyJson(target),
      cleanMultiline(input.summary ?? profile.summary),
      now,
      profile.id
    );
    return rowToProfile(this.database.prepare("SELECT * FROM candidate_profiles WHERE id = ?").get(profile.id));
  }

  createResumeSource(input = {}) {
    const profile = this.getOrCreateProfile();
    const rawText = cleanMultiline(input.rawText || input.text || "");
    if (!rawText) {
      throw validationError("Resume source text is required");
    }
    const now = new Date().toISOString();
    const sourceType = normalizeResumeSourceType(input.sourceType || input.type || "text");
    const result = this.database.prepare(`
      INSERT INTO resume_sources (
        profile_id, source_type, file_name, file_path, raw_text, parsed_json, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.id,
      sourceType,
      cleanText(input.fileName || input.filename || ""),
      cleanText(input.filePath || input.path || ""),
      rawText.slice(0, 200000),
      stringifyJson(input.parsed && typeof input.parsed === "object" ? input.parsed : {}),
      stringifyJson(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      now
    );
    return this.getResumeSource(Number(result.lastInsertRowid));
  }

  getResumeSources(limit = 20) {
    const profile = this.getOrCreateProfile();
    const rows = this.database.prepare(`
      SELECT *
      FROM resume_sources
      WHERE profile_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(profile.id, Math.max(1, Math.min(100, Number(limit) || 20)));
    return {
      storage: "sqlite",
      totalResumeSources: Number(this.database.prepare("SELECT COUNT(*) AS count FROM resume_sources WHERE profile_id = ?").get(profile.id).count || 0),
      resumeSources: rows.map(rowToResumeSource)
    };
  }

  getResumeSource(sourceId) {
    const id = Number(sourceId);
    if (!Number.isInteger(id) || id <= 0) {
      throw validationError("Valid resume source id is required");
    }
    const row = this.database.prepare("SELECT * FROM resume_sources WHERE id = ?").get(id);
    if (!row) {
      throw validationError(`Resume source not found: ${id}`);
    }
    return rowToResumeSource(row);
  }

  createProfileFactDraftsFromResumeSource(resumeSourceId, generatorResult = {}) {
    const resumeSource = this.getResumeSource(resumeSourceId);
    return this.createProfileFactDrafts({
      resumeSourceId: resumeSource.id,
      drafts: Array.isArray(generatorResult.drafts) ? generatorResult.drafts : [],
      summary: generatorResult.summary || {},
      resumeSource
    });
  }

  createProfileFactDrafts(input = {}) {
    const resumeSourceId = normalizePositiveInteger(input.resumeSourceId || input.sourceId || 0);
    const sourceSessionId = normalizePositiveInteger(input.sourceSessionId || input.sessionId || 0);
    const sourceMessageId = normalizePositiveInteger(input.sourceMessageId || input.messageId || 0);
    const resumeSource = input.resumeSource || (resumeSourceId ? this.getResumeSource(resumeSourceId) : null);
    const drafts = Array.isArray(input.drafts) ? input.drafts : [];
    if (!drafts.length) {
      return {
        storage: "sqlite",
        resumeSource,
        created: 0,
        skipped: 0,
        drafts: [],
        summary: input.summary || {}
      };
    }

    const now = new Date().toISOString();
    const profile = this.getOrCreateProfile();
    let created = 0;
    let skipped = 0;
    const createdIds = [];

    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const draft of drafts) {
        const normalized = normalizeFactDraftInput(draft, {
          resumeSourceId: resumeSourceId || null,
          sourceSessionId: sourceSessionId || null,
          sourceMessageId: sourceMessageId || null
        });
        if (!normalized) {
          skipped += 1;
          continue;
        }
        const duplicate = resumeSourceId
          ? this.database.prepare(`
            SELECT id
            FROM profile_fact_drafts
            WHERE profile_id = ?
              AND resume_source_id = ?
              AND draft_type = ?
              AND operation = ?
              AND COALESCE(target_entity_type, '') = ?
              AND COALESCE(target_entity_id, 0) = ?
              AND title = ?
              AND evidence_text = ?
              AND status IN ('PENDING', 'CONFIRMED')
              LIMIT 1
            `).get(
              profile.id,
              resumeSourceId,
              normalized.draftType,
              normalized.operation,
              normalized.targetEntityType,
              normalized.targetEntityId || 0,
              normalized.title,
              normalized.evidenceText
            )
          : this.database.prepare(`
            SELECT id
            FROM profile_fact_drafts
            WHERE profile_id = ?
              AND resume_source_id IS NULL
              AND draft_type = ?
              AND operation = ?
              AND COALESCE(target_entity_type, '') = ?
              AND COALESCE(target_entity_id, 0) = ?
              AND title = ?
              AND evidence_text = ?
              AND status IN ('PENDING', 'CONFIRMED')
              LIMIT 1
            `).get(
              profile.id,
              normalized.draftType,
              normalized.operation,
              normalized.targetEntityType,
              normalized.targetEntityId || 0,
              normalized.title,
              normalized.evidenceText
            );
        if (duplicate) {
          skipped += 1;
          continue;
        }
        const result = this.database.prepare(`
          INSERT INTO profile_fact_drafts (
            profile_id, resume_source_id, draft_type, status, title, content_json,
            evidence_text, confidence, metadata_json, operation, target_entity_type,
            target_entity_id, source_session_id, source_message_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          profile.id,
          resumeSourceId || null,
          normalized.draftType,
          "PENDING",
          normalized.title,
          stringifyJson(normalized.content),
          normalized.evidenceText,
          normalized.confidence,
          stringifyJson(normalized.metadata),
          normalized.operation,
          normalized.targetEntityType || null,
          normalized.targetEntityId || null,
          normalized.sourceSessionId || null,
          normalized.sourceMessageId || null,
          now,
          now
        );
        created += 1;
        createdIds.push(Number(result.lastInsertRowid));
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }

    return {
      storage: "sqlite",
      resumeSource,
      created,
      skipped,
      summary: input.summary || {},
      drafts: createdIds.map((id) => this.getProfileFactDraft(id))
    };
  }

  getProfileFactDrafts(options = {}) {
    const profile = this.getOrCreateProfile();
    const limit = Math.max(1, Math.min(200, Number(options.limit) || 100));
    const status = normalizeFactDraftStatus(options.status || "");
    if (options.status && !status) {
      throw validationError("Valid fact draft status is required");
    }
    const draftType = normalizeFactDraftType(options.draftType || options.type || "");
    if ((options.draftType || options.type) && !draftType) {
      throw validationError("Valid fact draft type is required");
    }
    const resumeSourceId = normalizePositiveInteger(options.resumeSourceId || options.sourceId || 0);
    const sourceSessionId = normalizePositiveInteger(options.sourceSessionId || options.sessionId || 0);
    const whereParts = ["profile_id = ?"];
    const params = [profile.id];
    if (status) {
      whereParts.push("status = ?");
      params.push(status);
    }
    if (draftType) {
      whereParts.push("draft_type = ?");
      params.push(draftType);
    }
    if (resumeSourceId) {
      whereParts.push("resume_source_id = ?");
      params.push(resumeSourceId);
    }
    if (sourceSessionId) {
      whereParts.push("source_session_id = ?");
      params.push(sourceSessionId);
    }
    params.push(limit);
    const rows = this.database.prepare(`
      SELECT *
      FROM profile_fact_drafts
      WHERE ${whereParts.join(" AND ")}
      ORDER BY
        CASE status WHEN 'PENDING' THEN 0 WHEN 'CONFIRMED' THEN 1 WHEN 'REJECTED' THEN 2 ELSE 3 END,
        id ASC
      LIMIT ?
    `).all(...params);
    return {
      storage: "sqlite",
      totalDrafts: this.countProfileFactDrafts({ status, draftType, resumeSourceId, sourceSessionId }),
      drafts: rows.map(rowToProfileFactDraft)
    };
  }

  getProfileFactDraft(draftId) {
    const id = normalizePositiveInteger(draftId);
    if (!id) {
      throw validationError("Valid fact draft id is required");
    }
    const row = this.database.prepare("SELECT * FROM profile_fact_drafts WHERE id = ?").get(id);
    if (!row) {
      throw validationError(`Profile fact draft not found: ${id}`);
    }
    return rowToProfileFactDraft(row);
  }

  confirmProfileFactDraft(draftId, input = {}) {
    const draft = this.getProfileFactDraft(draftId);
    if (draft.status !== "PENDING") {
      throw validationError(`Only PENDING drafts can be confirmed: ${draft.status}`);
    }

    const now = new Date().toISOString();
    let resolvedEntity = null;
    let revision = null;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      if (draft.draftType === "question") {
        throw validationError("Question drafts cannot be confirmed into fact library");
      }
      const operation = normalizeFactDraftOperation(draft.operation);
      const content = {
        ...draft.content,
        ...(input.content && typeof input.content === "object" ? input.content : {})
      };
      const targetType = normalizeProfileEntityType(draft.targetEntityType || draft.draftType);
      const targetId = normalizePositiveInteger(draft.targetEntityId);
      if (operation === "UPDATE" && targetType !== draft.draftType) {
        throw validationError(`Profile draft target type must match draft type: ${draft.draftType}`);
      }
      const beforeEntity = operation === "UPDATE"
        ? this.getProfileEntityForRevision(targetType, targetId)
        : null;

      if (operation === "UPDATE") {
        resolvedEntity = this.updateProfileEntityWithinTransaction(targetType, targetId, {
          ...content,
          confidence: input.confidence || content.confidence || "user_confirmed"
        });
      } else if (draft.draftType === "profile") {
        const profile = this.getOrCreateProfile();
        resolvedEntity = this.updateProfileWithinTransaction(profile.id, content);
      } else if (draft.draftType === "experience") {
        resolvedEntity = this.createExperienceWithinTransaction({
          ...content,
          confidence: input.confidence || content.confidence || "user_confirmed"
        });
      } else if (draft.draftType === "skill") {
        resolvedEntity = this.createSkillWithinTransaction(content);
      } else if (draft.draftType === "constraint") {
        resolvedEntity = this.createConstraintWithinTransaction(content);
      } else {
        throw validationError(`Unsupported profile fact draft type: ${draft.draftType}`);
      }

      revision = this.insertProfileEntityRevisionWithinTransaction({
        entityType: draft.draftType,
        entityId: Number(resolvedEntity.id || 0),
        operation,
        sourceDraftId: draft.id,
        before: beforeEntity,
        after: resolvedEntity,
        now
      });

      this.database.prepare(`
        UPDATE profile_fact_drafts
        SET status = 'CONFIRMED', resolved_at = ?, resolved_entity_type = ?, resolved_entity_id = ?, updated_at = ?
        WHERE id = ?
      `).run(
        now,
        draft.draftType,
        Number(resolvedEntity.id || 0),
        now,
        draft.id
      );
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }

    return {
      storage: "sqlite",
      ok: true,
      action: "confirm",
      operation: normalizeFactDraftOperation(draft.operation),
      draft: this.getProfileFactDraft(draft.id),
      createdEntity: resolvedEntity,
      resolvedEntity,
      revision
    };
  }

  getProfileEntityForRevision(entityType, entityId) {
    const profile = this.getOrCreateProfile();
    if (entityType === "profile") {
      if (entityId !== profile.id) {
        throw validationError(`Profile draft target does not match active profile: ${entityId}`);
      }
      return rowToProfile(profile);
    }
    const tableByType = {
      experience: "profile_experiences",
      skill: "profile_skills",
      constraint: "profile_constraints"
    };
    const mapperByType = {
      experience: rowToExperience,
      skill: rowToSkill,
      constraint: rowToConstraint
    };
    const table = tableByType[entityType];
    if (!table || !entityId) {
      throw validationError("Profile draft update requires a valid target entity");
    }
    const row = this.database.prepare(`SELECT * FROM ${table} WHERE id = ? AND profile_id = ?`).get(entityId, profile.id);
    if (!row) {
      throw validationError(`Profile ${entityType} target not found: ${entityId}`);
    }
    return mapperByType[entityType](row);
  }

  updateProfileEntityWithinTransaction(entityType, entityId, input = {}) {
    const current = this.getProfileEntityForRevision(entityType, entityId);
    const now = new Date().toISOString();
    if (entityType === "profile") {
      return this.updateProfileWithinTransaction(entityId, input);
    }
    if (entityType === "experience") {
      const normalized = normalizeExperienceInput({
        ...current,
        ...input,
        facts: input.facts ?? current.facts,
        skills: input.skills ?? current.skills,
        allowedRewrites: input.allowedRewrites ?? current.allowedRewrites,
        forbiddenClaims: input.forbiddenClaims ?? current.forbiddenClaims
      });
      if (!normalized.title && !normalized.facts.length) {
        throw validationError("Experience title or facts are required");
      }
      this.database.prepare(`
        UPDATE profile_experiences
        SET kind = ?, title = ?, organization = ?, role = ?, start_date = ?, end_date = ?,
            facts_json = ?, skills_json = ?, evidence_text = ?, evidence_source = ?, confidence = ?,
            allowed_rewrites_json = ?, forbidden_claims_json = ?, updated_at = ?
        WHERE id = ?
      `).run(
        normalized.kind,
        normalized.title,
        normalized.organization,
        normalized.role,
        normalized.startDate,
        normalized.endDate,
        stringifyJson(normalized.facts),
        stringifyJson(normalized.skills),
        normalized.evidenceText,
        normalized.evidenceSource,
        normalized.confidence,
        stringifyJson(normalized.allowedRewrites),
        stringifyJson(normalized.forbiddenClaims),
        now,
        entityId
      );
      return this.getExperience(entityId);
    }
    if (entityType === "skill") {
      const name = cleanText(input.name ?? current.name);
      if (!name) {
        throw validationError("Skill name is required");
      }
      this.database.prepare(`
        UPDATE profile_skills
        SET name = ?, category = ?, proficiency = ?, evidence_json = ?, updated_at = ?
        WHERE id = ?
      `).run(
        name,
        cleanText(input.category ?? current.category),
        normalizeSkillProficiency(input.proficiency ?? current.proficiency),
        stringifyJson(normalizeArray(input.evidence ?? current.evidence)),
        now,
        entityId
      );
      return rowToSkill(this.database.prepare("SELECT * FROM profile_skills WHERE id = ?").get(entityId));
    }
    if (entityType === "constraint") {
      const ruleType = normalizeConstraintRuleType(input.ruleType ?? input.type ?? current.ruleType);
      const content = cleanMultiline(input.content ?? input.text ?? current.content);
      if (!ruleType || !content) {
        throw validationError("Constraint ruleType and content are required");
      }
      this.database.prepare(`
        UPDATE profile_constraints
        SET rule_type = ?, content = ?, severity = ?, metadata_json = ?, updated_at = ?
        WHERE id = ?
      `).run(
        ruleType,
        content,
        normalizeConstraintSeverity(input.severity ?? current.severity),
        stringifyJson(input.metadata && typeof input.metadata === "object" ? input.metadata : current.metadata),
        now,
        entityId
      );
      return rowToConstraint(this.database.prepare("SELECT * FROM profile_constraints WHERE id = ?").get(entityId));
    }
    throw validationError(`Unsupported profile entity type: ${entityType}`);
  }

  insertProfileEntityRevisionWithinTransaction(input = {}) {
    const profile = this.getOrCreateProfile();
    const result = this.database.prepare(`
      INSERT INTO profile_entity_revisions (
        profile_id, entity_type, entity_id, operation, source_draft_id,
        before_json, after_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.id,
      normalizeProfileEntityType(input.entityType),
      normalizePositiveInteger(input.entityId),
      normalizeFactDraftOperation(input.operation),
      normalizePositiveInteger(input.sourceDraftId) || null,
      stringifyJson(input.before ?? null),
      stringifyJson(input.after ?? null),
      input.now || new Date().toISOString()
    );
    return rowToProfileEntityRevision(this.database.prepare(
      "SELECT * FROM profile_entity_revisions WHERE id = ?"
    ).get(Number(result.lastInsertRowid)));
  }

  rejectProfileFactDraft(draftId, input = {}) {
    const draft = this.getProfileFactDraft(draftId);
    if (draft.status !== "PENDING") {
      throw validationError(`Only PENDING drafts can be rejected: ${draft.status}`);
    }
    const now = new Date().toISOString();
    const reason = cleanText(input.reason || "user_rejected");
    this.database.prepare(`
      UPDATE profile_fact_drafts
      SET status = 'REJECTED', resolved_at = ?, metadata_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      now,
      stringifyJson({ ...draft.metadata, rejectReason: reason }),
      now,
      draft.id
    );
    return {
      storage: "sqlite",
      ok: true,
      action: "reject",
      draft: this.getProfileFactDraft(draft.id)
    };
  }

  createExperience(input = {}) {
    const profile = this.getOrCreateProfile();
    const normalized = normalizeExperienceInput(input);
    if (!normalized.title && !normalized.facts.length) {
      throw validationError("Experience title or facts are required");
    }
    const now = new Date().toISOString();
    const result = this.database.prepare(`
      INSERT INTO profile_experiences (
        profile_id, kind, title, organization, role, start_date, end_date, facts_json, skills_json,
        evidence_text, evidence_source, confidence, allowed_rewrites_json, forbidden_claims_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.id,
      normalized.kind,
      normalized.title,
      normalized.organization,
      normalized.role,
      normalized.startDate,
      normalized.endDate,
      stringifyJson(normalized.facts),
      stringifyJson(normalized.skills),
      normalized.evidenceText,
      normalized.evidenceSource,
      normalized.confidence,
      stringifyJson(normalized.allowedRewrites),
      stringifyJson(normalized.forbiddenClaims),
      now,
      now
    );
    return this.getExperience(Number(result.lastInsertRowid));
  }

  createExperienceWithinTransaction(input = {}) {
    const profile = this.getOrCreateProfile();
    const normalized = normalizeExperienceInput(input);
    if (!normalized.title && !normalized.facts.length) {
      throw validationError("Experience title or facts are required");
    }
    const now = new Date().toISOString();
    const result = this.database.prepare(`
      INSERT INTO profile_experiences (
        profile_id, kind, title, organization, role, start_date, end_date, facts_json, skills_json,
        evidence_text, evidence_source, confidence, allowed_rewrites_json, forbidden_claims_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.id,
      normalized.kind,
      normalized.title,
      normalized.organization,
      normalized.role,
      normalized.startDate,
      normalized.endDate,
      stringifyJson(normalized.facts),
      stringifyJson(normalized.skills),
      normalized.evidenceText,
      normalized.evidenceSource,
      normalized.confidence,
      stringifyJson(normalized.allowedRewrites),
      stringifyJson(normalized.forbiddenClaims),
      now,
      now
    );
    return this.getExperience(Number(result.lastInsertRowid));
  }

  getExperiences() {
    const profile = this.getOrCreateProfile();
    const rows = this.database.prepare(`
      SELECT *
      FROM profile_experiences
      WHERE profile_id = ?
      ORDER BY id ASC
    `).all(profile.id);
    return {
      storage: "sqlite",
      experiences: rows.map(rowToExperience)
    };
  }

  getExperience(experienceId) {
    const id = Number(experienceId);
    if (!Number.isInteger(id) || id <= 0) {
      throw validationError("Valid experience id is required");
    }
    const row = this.database.prepare("SELECT * FROM profile_experiences WHERE id = ?").get(id);
    if (!row) {
      throw validationError(`Experience not found: ${id}`);
    }
    return rowToExperience(row);
  }

  createSkill(input = {}) {
    const profile = this.getOrCreateProfile();
    const name = cleanText(input.name || "");
    if (!name) {
      throw validationError("Skill name is required");
    }
    const now = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO profile_skills (
        profile_id, name, category, proficiency, evidence_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(profile_id, name) DO UPDATE SET
        category = excluded.category,
        proficiency = excluded.proficiency,
        evidence_json = excluded.evidence_json,
        updated_at = excluded.updated_at
    `).run(
      profile.id,
      name,
      cleanText(input.category || ""),
      normalizeSkillProficiency(input.proficiency || ""),
      stringifyJson(normalizeArray(input.evidence || input.evidenceIds || [])),
      now,
      now
    );
    return this.getSkills().skills.find((skill) => skill.name === name);
  }

  createSkillWithinTransaction(input = {}) {
    const profile = this.getOrCreateProfile();
    const name = cleanText(input.name || "");
    if (!name) {
      throw validationError("Skill name is required");
    }
    const now = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO profile_skills (
        profile_id, name, category, proficiency, evidence_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(profile_id, name) DO UPDATE SET
        category = excluded.category,
        proficiency = excluded.proficiency,
        evidence_json = excluded.evidence_json,
        updated_at = excluded.updated_at
    `).run(
      profile.id,
      name,
      cleanText(input.category || ""),
      normalizeSkillProficiency(input.proficiency || ""),
      stringifyJson(normalizeArray(input.evidence || input.evidenceIds || [])),
      now,
      now
    );
    return this.getSkills().skills.find((skill) => skill.name === name);
  }

  getSkills() {
    const profile = this.getOrCreateProfile();
    const rows = this.database.prepare(`
      SELECT *
      FROM profile_skills
      WHERE profile_id = ?
      ORDER BY name ASC
    `).all(profile.id);
    return {
      storage: "sqlite",
      skills: rows.map(rowToSkill)
    };
  }

  createConstraint(input = {}) {
    const profile = this.getOrCreateProfile();
    const ruleType = normalizeConstraintRuleType(input.ruleType || input.type || "");
    const content = cleanMultiline(input.content || input.text || "");
    if (!ruleType || !content) {
      throw validationError("Constraint ruleType and content are required");
    }
    const now = new Date().toISOString();
    const result = this.database.prepare(`
      INSERT INTO profile_constraints (
        profile_id, rule_type, content, severity, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.id,
      ruleType,
      content,
      normalizeConstraintSeverity(input.severity || ""),
      stringifyJson(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      now,
      now
    );
    return this.getConstraints().constraints.find((constraint) => constraint.id === Number(result.lastInsertRowid));
  }

  createConstraintWithinTransaction(input = {}) {
    const profile = this.getOrCreateProfile();
    const ruleType = normalizeConstraintRuleType(input.ruleType || input.type || "");
    const content = cleanMultiline(input.content || input.text || "");
    if (!ruleType || !content) {
      throw validationError("Constraint ruleType and content are required");
    }
    const now = new Date().toISOString();
    const result = this.database.prepare(`
      INSERT INTO profile_constraints (
        profile_id, rule_type, content, severity, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.id,
      ruleType,
      content,
      normalizeConstraintSeverity(input.severity || ""),
      stringifyJson(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      now,
      now
    );
    return this.getConstraints().constraints.find((constraint) => constraint.id === Number(result.lastInsertRowid));
  }

  getConstraints() {
    const profile = this.getOrCreateProfile();
    const rows = this.database.prepare(`
      SELECT *
      FROM profile_constraints
      WHERE profile_id = ?
      ORDER BY id ASC
    `).all(profile.id);
    return {
      storage: "sqlite",
      constraints: rows.map(rowToConstraint)
    };
  }

  getBrowserTaskDiagnostics(limitOrOptions = 20) {
    const options = typeof limitOrOptions === "object" && limitOrOptions !== null
      ? limitOrOptions
      : { limit: limitOrOptions };
    const sourceUrl = normalizeComparableUrl(options.sourceUrl || options.pageUrl || "");
    const boundedLimit = Math.max(1, Math.min(100, Number(options.limit) || 20));
    const allRows = this.selectBrowserTasksForScope({ sourceUrl });
    const failedRows = allRows.filter((row) => row.status === "FAILED");
    const recentRows = sortBrowserTaskRowsByUpdatedAt(allRows).slice(0, boundedLimit);
    const recentFailureRows = sortBrowserTaskRowsByUpdatedAt(failedRows).slice(0, Math.min(10, boundedLimit));

    return {
      storage: "sqlite",
      scope: sourceUrl ? "sourceUrl" : "all",
      sourceUrl: sourceUrl || null,
      counts: normalizeBrowserTaskCountsFromTasks(allRows),
      failuresByReason: summarizeBrowserTaskFailures(failedRows).slice(0, boundedLimit),
      recentTasks: recentRows.map(rowToBrowserTask),
      recentFailures: recentFailureRows.map(rowToBrowserTask)
    };
  }

  getApplications(options = {}) {
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    const rows = this.database.prepare(`
      SELECT
        applications.*,
        jobs.source_key,
        jobs.job_id AS boss_job_id,
        jobs.title,
        jobs.company_name,
        jobs.salary,
        jobs.location,
        jobs.detail_url,
        LENGTH(TRIM(COALESCE(jobs.description, ''))) AS description_length
      FROM applications
      JOIN jobs ON jobs.id = applications.job_id
      ORDER BY datetime(applications.updated_at) DESC, applications.id DESC
      LIMIT ?
    `).all(limit);

    return {
      storage: "sqlite",
      totalApplications: this.countApplications(),
      applications: rows.map(rowToApplication)
    };
  }

  getApplicationEvents(limit = 50) {
    const rows = this.database.prepare(`
      SELECT
        application_events.*,
        applications.status AS application_status,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM application_events
      JOIN applications ON applications.id = application_events.application_id
      JOIN jobs ON jobs.id = applications.job_id
      ORDER BY application_events.id DESC
      LIMIT ?
    `).all(Math.max(1, Math.min(500, Number(limit) || 50)));

    return {
      storage: "sqlite",
      events: rows.map(rowToApplicationEvent)
    };
  }

  getApplicationScreeningInput(applicationId, options = {}) {
    const id = normalizePositiveInteger(applicationId);
    if (!id) {
      throw validationError("Valid application id is required");
    }
    const row = this.database.prepare(`
      SELECT
        applications.id AS application_id,
        applications.job_id AS application_job_id,
        applications.status AS application_status,
        applications.status_reason AS application_status_reason,
        applications.created_at AS application_created_at,
        applications.updated_at AS application_updated_at,
        jobs.*,
        companies.name AS company_table_name,
        LENGTH(TRIM(COALESCE(jobs.description, ''))) AS description_length
      FROM applications
      JOIN jobs ON jobs.id = applications.job_id
      LEFT JOIN companies ON companies.id = jobs.company_id
      WHERE applications.id = ?
    `).get(id);
    if (!row) {
      throw validationError(`Application not found: ${id}`);
    }
    const profile = this.getProfile();
    return {
      storage: "sqlite",
      application: rowToApplication({
        id: row.application_id,
        job_id: row.application_job_id,
        source_key: row.source_key,
        boss_job_id: row.job_id,
        status: row.application_status,
        status_reason: row.application_status_reason,
        title: row.title,
        company_name: row.company_name,
        salary: row.salary,
        location: row.location,
        detail_url: row.detail_url,
        description_length: row.description_length,
        created_at: row.application_created_at,
        updated_at: row.application_updated_at
      }),
      job: {
        id: Number(row.id || 0),
        ...rowToJob(row)
      },
      profile: {
        profile: profile.profile,
        experiences: profile.experiences,
        skills: profile.skills,
        constraints: profile.constraints
      },
      userRules: options.userRules && typeof options.userRules === "object" ? options.userRules : {}
    };
  }

  getApplicationResumeInput(applicationId, options = {}) {
    const screeningInput = this.getApplicationScreeningInput(applicationId, {
      userRules: options.userRules || {}
    });
    const screening = options.screeningId
      ? this.getScreening(options.screeningId)
      : this.getLatestScreeningForApplication(applicationId);
    if (!screening) {
      throw validationError(`Screening is required before resume generation: ${applicationId}`);
    }
    return {
      ...screeningInput,
      screening
    };
  }

  getApplicationGreetingInput(applicationId, options = {}) {
    const screeningInput = this.getApplicationScreeningInput(applicationId, {
      userRules: options.userRules || {}
    });
    const resumeVersion = options.resumeVersionId
      ? this.getResumeVersion(options.resumeVersionId)
      : this.getLatestResumeVersionForApplication(applicationId);
    if (!resumeVersion) {
      throw validationError(`Approved resume version is required before greeting generation: ${applicationId}`);
    }
    if (resumeVersion.applicationId !== screeningInput.application.id) {
      throw validationError("Resume version does not belong to the application");
    }
    if (resumeVersion.status !== "APPROVED") {
      throw validationError(`Only APPROVED resume versions can be used for greeting generation: ${resumeVersion.status}`);
    }
    if (!resumeVersion.metadata?.localApproval?.approved) {
      throw validationError("Local resume approval is required before greeting generation");
    }
    const screening = resumeVersion.screeningId
      ? this.getScreening(resumeVersion.screeningId)
      : this.getLatestScreeningForApplication(applicationId);
    if (!screening) {
      throw validationError(`Screening is required before greeting generation: ${applicationId}`);
    }
    return {
      ...screeningInput,
      screening,
      resumeVersion
    };
  }

  getApplicationWorkflowSnapshot(applicationId) {
    const screeningInput = this.getApplicationScreeningInput(applicationId);
    const id = screeningInput.application.id;
    const latestScreening = this.getLatestScreeningForApplication(id);
    const latestResumeVersion = this.getLatestResumeVersionForApplication(id);
    const latestResumeFitEvaluation = latestResumeVersion
      ? this.getLatestResumeFitEvaluationForResumeVersion(latestResumeVersion.id)
      : null;
    const latestResumeClaimVerification = latestResumeVersion
      ? this.getLatestResumeClaimVerificationForResumeVersion(latestResumeVersion.id)
      : null;
    const latestResumeAudit = latestResumeVersion
      ? this.getLatestResumeAuditForResumeVersion(latestResumeVersion.id)
      : null;
    const latestConversation = this.getLatestConversationForApplication(id);
    const latestGreetingDraft = this.getLatestGreetingDraftForApplication(id);
    const latestBrowserTasks = this.getLatestBrowserTasksForApplication(id, 20);
    const profile = this.getProfile();
    return {
      storage: "sqlite",
      application: screeningInput.application,
      job: screeningInput.job,
      profile: {
        id: profile.profile.id,
        target: profile.profile.target,
        summary: profile.profile.summary,
        experienceCount: profile.experiences.length,
        confirmedExperienceCount: profile.experiences.length,
        skillCount: profile.skills.length,
        constraintCount: profile.constraints.length,
        pendingFactDraftCount: profile.pendingFactDrafts.length
      },
      latestScreening,
      latestResumeVersion,
      latestResumeFitEvaluation,
      latestResumeClaimVerification,
      latestResumeAudit,
      latestConversation,
      latestGreetingDraft,
      latestBrowserTasks
    };
  }

  startWorkflowRun(input = {}) {
    const applicationId = normalizePositiveInteger(input.applicationId);
    if (!applicationId) {
      throw validationError("Valid application id is required");
    }
    const workflowName = cleanText(input.workflowName || "ResumeWorkflowGraph");
    const graphVersion = cleanText(input.graphVersion || "");
    const promptVersion = cleanText(input.promptVersion || "");
    const agentVersion = cleanText(input.agentVersion || "");
    if (!workflowName || !graphVersion || !promptVersion || !agentVersion) {
      throw validationError("Workflow name, graph version, prompt version, and agent version are required");
    }
    const replayOfWorkflowRunId = normalizeOptionalPositiveInteger(input.replayOfWorkflowRunId);
    const mode = normalizeWorkflowRunMode(input.mode || "rules");
    const modelConfig = sanitizeModelConfig(input.modelConfig || {});
    const now = new Date().toISOString();

    let application;
    let profile;
    let job;
    let userRules;
    let executionOptions;
    let renderOptions;
    let profileSnapshotId;
    let jobSnapshotId;

    if (replayOfWorkflowRunId) {
      const replaySource = this.getWorkflowRun(replayOfWorkflowRunId);
      if (replaySource.workflowRun.applicationId !== applicationId) {
        throw validationError("Replay workflow run does not belong to the application");
      }
      application = replaySource.application;
      profile = replaySource.profile;
      job = replaySource.job;
      userRules = replaySource.inputSnapshot.userRules;
      executionOptions = replaySource.inputSnapshot.executionOptions;
      renderOptions = replaySource.inputSnapshot.renderOptions;
      profileSnapshotId = replaySource.inputSnapshot.profileSnapshotId;
      jobSnapshotId = replaySource.inputSnapshot.jobSnapshotId;
    } else {
      const current = this.getApplicationScreeningInput(applicationId, {
        userRules: input.userRules || {}
      });
      application = current.application;
      profile = current.profile;
      job = current.job;
      userRules = current.userRules;
      executionOptions = normalizeObject(input.executionOptions);
      renderOptions = normalizeObject(input.renderOptions);
    }

    const inputHash = stableJsonHash({
      application,
      profile,
      job,
      userRules,
      executionOptions,
      renderOptions,
      graphVersion,
      promptVersion,
      agentVersion,
      modelConfig
    });

    this.database.exec("BEGIN IMMEDIATE");
    try {
      if (!profileSnapshotId) {
        const profileRow = this.database.prepare(`
          INSERT INTO profile_snapshots (
            profile_id, content_hash, payload_json, created_at
          ) VALUES (?, ?, ?, ?)
        `).run(
          normalizePositiveInteger(profile.profile?.id),
          stableJsonHash(profile),
          stringifyJson(profile),
          now
        );
        profileSnapshotId = Number(profileRow.lastInsertRowid);
      }
      if (!jobSnapshotId) {
        const jobRow = this.database.prepare(`
          INSERT INTO job_snapshots (
            job_id, batch_id, source_key, title, company_name, detail_url,
            description_length, payload_json, captured_at, created_at
          ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          normalizePositiveInteger(job.id),
          cleanText(job.sourceKey || job.source_key || ""),
          cleanText(job.title || ""),
          cleanText(job.company || job.companyName || job.company_name || ""),
          cleanText(job.detailUrl || job.detail_url || ""),
          cleanMultiline(job.description || "").length,
          stringifyJson(job),
          now,
          now
        );
        jobSnapshotId = Number(jobRow.lastInsertRowid);
      }
      const runRow = this.database.prepare(`
        INSERT INTO workflow_runs (
          application_id, workflow_name, status, mode, replay_of_workflow_run_id,
          output_json, error_json, started_at, finished_at, created_at, updated_at
        ) VALUES (?, ?, 'RUNNING', ?, ?, 'null', 'null', ?, NULL, ?, ?)
      `).run(
        applicationId,
        workflowName,
        mode,
        replayOfWorkflowRunId || null,
        now,
        now,
        now
      );
      const workflowRunId = Number(runRow.lastInsertRowid);
      this.database.prepare(`
        INSERT INTO workflow_input_snapshots (
          workflow_run_id, profile_snapshot_id, job_snapshot_id, application_json,
          user_rules_json, execution_options_json, render_options_json, prompt_version, agent_version,
          model_config_json, graph_version, input_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        workflowRunId,
        profileSnapshotId,
        jobSnapshotId,
        stringifyJson(application),
        stringifyJson(userRules),
        stringifyJson(executionOptions),
        stringifyJson(renderOptions),
        promptVersion,
        agentVersion,
        stringifyJson(modelConfig),
        graphVersion,
        inputHash,
        now
      );
      this.database.exec("COMMIT");
      return this.getWorkflowRun(workflowRunId);
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  finishWorkflowRun(workflowRunId, input = {}) {
    const id = normalizePositiveInteger(workflowRunId);
    if (!id) {
      throw validationError("Valid workflow run id is required");
    }
    const existing = this.database.prepare("SELECT * FROM workflow_runs WHERE id = ?").get(id);
    if (!existing) {
      throw validationError(`Workflow run not found: ${id}`);
    }
    const status = normalizeWorkflowRunFinalStatus(input.status || "");
    if (!status) {
      throw validationError("Workflow run final status must be SUCCEEDED, FAILED, or STOPPED");
    }
    const now = new Date().toISOString();
    this.database.prepare(`
      UPDATE workflow_runs
      SET status = ?, output_json = ?, error_json = ?, finished_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      status,
      stringifyJson(input.output === undefined ? null : input.output),
      stringifyJson(input.error === undefined ? null : input.error),
      now,
      now,
      id
    );
    return this.getWorkflowRun(id);
  }

  getWorkflowRun(workflowRunId) {
    const id = normalizePositiveInteger(workflowRunId);
    if (!id) {
      throw validationError("Valid workflow run id is required");
    }
    const run = this.database.prepare(`
      SELECT
        workflow_runs.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM workflow_runs
      JOIN applications ON applications.id = workflow_runs.application_id
      JOIN jobs ON jobs.id = applications.job_id
      WHERE workflow_runs.id = ?
    `).get(id);
    if (!run) {
      throw validationError(`Workflow run not found: ${id}`);
    }
    const inputSnapshot = this.database.prepare(`
      SELECT *
      FROM workflow_input_snapshots
      WHERE workflow_run_id = ?
    `).get(id);
    if (!inputSnapshot) {
      throw validationError(`Workflow input snapshot not found: ${id}`);
    }
    const profileSnapshot = this.database.prepare(`
      SELECT *
      FROM profile_snapshots
      WHERE id = ?
    `).get(inputSnapshot.profile_snapshot_id);
    const jobSnapshot = this.database.prepare(`
      SELECT *
      FROM job_snapshots
      WHERE id = ?
    `).get(inputSnapshot.job_snapshot_id);
    if (!profileSnapshot || !jobSnapshot) {
      throw validationError(`Workflow snapshot references are incomplete: ${id}`);
    }
    const agentRuns = this.database.prepare(`
      SELECT
        agent_runs.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM agent_runs
      LEFT JOIN applications ON applications.id = agent_runs.application_id
      LEFT JOIN jobs ON jobs.id = applications.job_id
      WHERE agent_runs.workflow_run_id = ?
      ORDER BY agent_runs.id ASC
    `).all(id).map(rowToAgentRun);
    return {
      storage: "sqlite",
      workflowRun: rowToWorkflowRun(run),
      inputSnapshot: rowToWorkflowInputSnapshot(inputSnapshot),
      application: parseJsonValue(inputSnapshot.application_json, {}),
      profile: parseJsonValue(profileSnapshot.payload_json, {}),
      job: parseJsonValue(jobSnapshot.payload_json, {}),
      agentRuns
    };
  }

  getWorkflowRuns(options = {}) {
    const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));
    const applicationId = normalizePositiveInteger(options.applicationId || 0);
    const params = [];
    const where = applicationId ? "WHERE workflow_runs.application_id = ?" : "";
    if (applicationId) {
      params.push(applicationId);
    }
    params.push(limit);
    const rows = this.database.prepare(`
      SELECT
        workflow_runs.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM workflow_runs
      JOIN applications ON applications.id = workflow_runs.application_id
      JOIN jobs ON jobs.id = applications.job_id
      ${where}
      ORDER BY workflow_runs.id DESC
      LIMIT ?
    `).all(...params);
    return {
      storage: "sqlite",
      workflowRuns: rows.map(rowToWorkflowRun)
    };
  }

  getWorkflowRunInput(workflowRunId) {
    const snapshot = this.getWorkflowRun(workflowRunId);
    return {
      storage: "sqlite",
      workflowRun: snapshot.workflowRun,
      manifest: {
        workflowRunId: snapshot.workflowRun.id,
        inputSnapshotId: snapshot.inputSnapshot.id,
        profileSnapshotId: snapshot.inputSnapshot.profileSnapshotId,
        jobSnapshotId: snapshot.inputSnapshot.jobSnapshotId,
        promptVersion: snapshot.inputSnapshot.promptVersion,
        agentVersion: snapshot.inputSnapshot.agentVersion,
        modelConfig: snapshot.inputSnapshot.modelConfig,
        graphVersion: snapshot.inputSnapshot.graphVersion,
        inputHash: snapshot.inputSnapshot.inputHash
      },
      application: snapshot.application,
      profile: snapshot.profile,
      job: snapshot.job,
      userRules: snapshot.inputSnapshot.userRules,
      executionOptions: snapshot.inputSnapshot.executionOptions,
      renderOptions: snapshot.inputSnapshot.renderOptions
    };
  }

  getScreeningCandidates(options = {}) {
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 10));
    const minDescriptionLength = Math.max(1, Math.min(5000, Number(options.minDescriptionLength) || 80));
    const statuses = normalizeApplicationStatusList(options.statuses || options.status || ["DETAIL_CAPTURED"]);
    if (!statuses.length) {
      throw validationError("At least one valid application status is required");
    }
    const includeAlreadyScreened = Boolean(options.includeAlreadyScreened);
    const params = [...statuses, minDescriptionLength, limit];
    const rows = this.database.prepare(`
      SELECT
        applications.*,
        jobs.source_key,
        jobs.job_id AS boss_job_id,
        jobs.title,
        jobs.company_name,
        jobs.salary,
        jobs.location,
        jobs.detail_url,
        LENGTH(TRIM(COALESCE(jobs.description, ''))) AS description_length,
        (
          SELECT COUNT(*)
          FROM screenings
          WHERE screenings.application_id = applications.id
        ) AS screening_count
      FROM applications
      JOIN jobs ON jobs.id = applications.job_id
      WHERE applications.status IN (${statuses.map(() => "?").join(", ")})
        AND LENGTH(TRIM(COALESCE(jobs.description, ''))) >= ?
        ${includeAlreadyScreened ? "" : "AND NOT EXISTS (SELECT 1 FROM screenings WHERE screenings.application_id = applications.id)"}
      ORDER BY datetime(applications.updated_at) ASC, applications.id ASC
      LIMIT ?
    `).all(...params);
    return {
      storage: "sqlite",
      statuses,
      minDescriptionLength,
      includeAlreadyScreened,
      totalCandidates: rows.length,
      candidates: rows.map((row) => ({
        ...rowToApplication(row),
        screeningCount: Number(row.screening_count || 0)
      }))
    };
  }

  getResumeCandidates(options = {}) {
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 10));
    const minDescriptionLength = Math.max(1, Math.min(5000, Number(options.minDescriptionLength) || 80));
    const minMatchScore = Math.max(0, Math.min(100, Number(options.minMatchScore) || 0));
    const statuses = normalizeApplicationStatusList(options.statuses || options.status || ["SHORTLISTED"]);
    const recommendations = normalizeScreeningRecommendationList(
      options.recommendations || options.recommendation || ["auto_prepare"]
    );
    if (!statuses.length) {
      throw validationError("At least one valid application status is required");
    }
    if (!recommendations.length) {
      throw validationError("At least one valid screening recommendation is required");
    }
    const excludeExistingResume = options.excludeExistingResume !== false;
    const whereParts = [
      `applications.status IN (${statuses.map(() => "?").join(", ")})`,
      `latest_screenings.recommendation IN (${recommendations.map(() => "?").join(", ")})`,
      "latest_screenings.match_score >= ?",
      "LENGTH(TRIM(COALESCE(jobs.description, ''))) >= ?"
    ];
    const params = [...statuses, ...recommendations, minMatchScore, minDescriptionLength];
    if (excludeExistingResume) {
      whereParts.push("NOT EXISTS (SELECT 1 FROM resume_versions WHERE resume_versions.application_id = applications.id)");
    }
    const whereSql = whereParts.join(" AND ");
    const countRow = this.database.prepare(`
      WITH latest_screening_ids AS (
        SELECT application_id, MAX(id) AS screening_id
        FROM screenings
        GROUP BY application_id
      )
      SELECT COUNT(*) AS count
      FROM applications
      JOIN jobs ON jobs.id = applications.job_id
      JOIN latest_screening_ids ON latest_screening_ids.application_id = applications.id
      JOIN screenings AS latest_screenings ON latest_screenings.id = latest_screening_ids.screening_id
      WHERE ${whereSql}
    `).get(...params);
    const rows = this.database.prepare(`
      WITH latest_screening_ids AS (
        SELECT application_id, MAX(id) AS screening_id
        FROM screenings
        GROUP BY application_id
      )
      SELECT
        applications.*,
        jobs.source_key,
        jobs.job_id AS boss_job_id,
        jobs.title,
        jobs.company_name,
        jobs.salary,
        jobs.location,
        jobs.detail_url,
        LENGTH(TRIM(COALESCE(jobs.description, ''))) AS description_length,
        latest_screenings.id AS latest_screening_id,
        latest_screenings.match_score,
        latest_screenings.risk_score,
        latest_screenings.recommendation,
        latest_screenings.confidence,
        latest_screenings.provider,
        latest_screenings.created_at AS screening_created_at,
        (
          SELECT COUNT(*)
          FROM resume_versions
          WHERE resume_versions.application_id = applications.id
        ) AS resume_version_count
      FROM applications
      JOIN jobs ON jobs.id = applications.job_id
      JOIN latest_screening_ids ON latest_screening_ids.application_id = applications.id
      JOIN screenings AS latest_screenings ON latest_screenings.id = latest_screening_ids.screening_id
      WHERE ${whereSql}
      ORDER BY latest_screenings.match_score DESC,
        latest_screenings.risk_score ASC,
        datetime(latest_screenings.created_at) DESC,
        applications.id ASC
      LIMIT ?
    `).all(...params, limit);
    return {
      storage: "sqlite",
      statuses,
      recommendations,
      minDescriptionLength,
      minMatchScore,
      excludeExistingResume,
      totalCandidates: Number(countRow?.count || 0),
      candidates: rows.map((row) => ({
        ...rowToApplication(row),
        screeningId: Number(row.latest_screening_id || 0),
        matchScore: Number(row.match_score || 0),
        riskScore: Number(row.risk_score || 0),
        recommendation: row.recommendation || "",
        screeningConfidence: row.confidence || "",
        screeningProvider: row.provider || "",
        screeningCreatedAt: row.screening_created_at || "",
        resumeVersionCount: Number(row.resume_version_count || 0)
      }))
    };
  }

  getAgentRuns(options = {}) {
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    const applicationId = normalizePositiveInteger(options.applicationId || 0);
    const whereParts = [];
    const params = [];
    if (applicationId) {
      whereParts.push("agent_runs.application_id = ?");
      params.push(applicationId);
    }
    params.push(limit);
    const rows = this.database.prepare(`
      SELECT
        agent_runs.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM agent_runs
      LEFT JOIN applications ON applications.id = agent_runs.application_id
      LEFT JOIN jobs ON jobs.id = applications.job_id
      ${whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : ""}
      ORDER BY agent_runs.id DESC
      LIMIT ?
    `).all(...params);
    return {
      storage: "sqlite",
      totalAgentRuns: this.countAgentRuns({ applicationId }),
      runs: rows.map(rowToAgentRun)
    };
  }

  startAgentRun(input = {}) {
    const agentName = cleanText(input.agentName || input.agent || "");
    const step = cleanText(input.step || "");
    if (!agentName || !step) {
      throw validationError("Agent name and step are required");
    }
    const applicationId = normalizeOptionalPositiveInteger(input.applicationId);
    if (applicationId) {
      const application = this.database.prepare("SELECT id FROM applications WHERE id = ?").get(applicationId);
      if (!application) {
        throw validationError(`Application not found: ${applicationId}`);
      }
    }
    const workflowRunId = normalizeOptionalPositiveInteger(input.workflowRunId);
    let workflowInput = null;
    if (workflowRunId) {
      workflowInput = this.database.prepare(`
        SELECT
          workflow_runs.application_id,
          workflow_input_snapshots.profile_snapshot_id,
          workflow_input_snapshots.job_snapshot_id,
          workflow_input_snapshots.prompt_version,
          workflow_input_snapshots.agent_version,
          workflow_input_snapshots.model_config_json,
          workflow_input_snapshots.graph_version
        FROM workflow_runs
        JOIN workflow_input_snapshots
          ON workflow_input_snapshots.workflow_run_id = workflow_runs.id
        WHERE workflow_runs.id = ?
      `).get(workflowRunId);
      if (!workflowInput) {
        throw validationError(`Workflow run not found: ${workflowRunId}`);
      }
      if (applicationId && Number(workflowInput.application_id) !== applicationId) {
        throw validationError("Agent run application does not match workflow run");
      }
    }
    const now = new Date().toISOString();
    const result = this.database.prepare(`
      INSERT INTO agent_runs (
        agent_name, application_id, step, status, provider, input_json, output_json,
        error_code, error_message, fallback_used, started_at, finished_at, created_at, updated_at,
        workflow_run_id, profile_snapshot_id, job_snapshot_id, prompt_version, agent_version,
        model_config_json, graph_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      agentName,
      applicationId || null,
      step,
      "RUNNING",
      cleanText(input.provider || ""),
      stringifyJson(input.input || {}),
      stringifyJson(null),
      "",
      "",
      0,
      now,
      null,
      now,
      now,
      workflowRunId || null,
      workflowInput?.profile_snapshot_id || null,
      workflowInput?.job_snapshot_id || null,
      workflowInput?.prompt_version || cleanText(input.promptVersion || ""),
      workflowInput?.agent_version || cleanText(input.agentVersion || ""),
      workflowInput?.model_config_json || stringifyJson(sanitizeModelConfig(input.modelConfig || {})),
      workflowInput?.graph_version || cleanText(input.graphVersion || "")
    );
    const agentRunId = Number(result.lastInsertRowid);
    this.insertWorkflowEvent({
      applicationId: applicationId || null,
      sourceType: "agent_run",
      sourceId: agentRunId,
      eventType: "AGENT_RUN_STARTED",
      severity: "info",
      status: "RUNNING",
      progressCurrent: 0,
      progressTotal: 1,
      message: `${agentName} started ${step}.`,
      metadata: {
        agentName,
        step,
        provider: cleanText(input.provider || ""),
        workflowRunId: workflowRunId || null,
        profileSnapshotId: workflowInput?.profile_snapshot_id || null,
        jobSnapshotId: workflowInput?.job_snapshot_id || null,
        promptVersion: workflowInput?.prompt_version || cleanText(input.promptVersion || ""),
        agentVersion: workflowInput?.agent_version || cleanText(input.agentVersion || ""),
        graphVersion: workflowInput?.graph_version || cleanText(input.graphVersion || "")
      }
    }, now);
    return this.getAgentRun(agentRunId);
  }

  finishAgentRun(agentRunId, input = {}) {
    const id = normalizePositiveInteger(agentRunId);
    if (!id) {
      throw validationError("Valid agent run id is required");
    }
    const status = normalizeAgentRunStatus(input.status || "");
    if (!status || status === "RUNNING") {
      throw validationError("Final agent run status must be SUCCEEDED or FAILED");
    }
    const existing = this.database.prepare("SELECT * FROM agent_runs WHERE id = ?").get(id);
    if (!existing) {
      throw validationError(`Agent run not found: ${id}`);
    }
    const now = new Date().toISOString();
    this.database.prepare(`
      UPDATE agent_runs
      SET status = ?, provider = ?, output_json = ?, error_code = ?, error_message = ?,
        fallback_used = ?, prompt_version = ?, agent_version = ?, model_config_json = ?,
        graph_version = ?, finished_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      status,
      cleanText(input.provider || existing.provider || ""),
      stringifyJson(input.output === undefined ? null : input.output),
      cleanText(input.errorCode || input.code || ""),
      cleanText(input.errorMessage || input.error || ""),
      input.fallbackUsed ? 1 : 0,
      cleanText(input.promptVersion ?? existing.prompt_version ?? ""),
      cleanText(input.agentVersion ?? existing.agent_version ?? ""),
      input.modelConfig === undefined
        ? existing.model_config_json
        : stringifyJson(sanitizeModelConfig(input.modelConfig || {})),
      cleanText(input.graphVersion ?? existing.graph_version ?? ""),
      now,
      now,
      id
    );
    this.insertWorkflowEvent({
      applicationId: existing.application_id || null,
      sourceType: "agent_run",
      sourceId: id,
      eventType: status === "SUCCEEDED" ? "AGENT_RUN_SUCCEEDED" : "AGENT_RUN_FAILED",
      severity: status === "SUCCEEDED" ? "info" : "error",
      status,
      progressCurrent: 1,
      progressTotal: 1,
      message: status === "SUCCEEDED"
        ? `${existing.agent_name} finished ${existing.step}.`
        : `${existing.agent_name} failed ${existing.step}.`,
      errorCode: input.errorCode || input.code || "",
      errorMessage: input.errorMessage || input.error || "",
      metadata: {
        agentName: existing.agent_name,
        step: existing.step,
        provider: cleanText(input.provider || existing.provider || ""),
        fallbackUsed: Boolean(input.fallbackUsed),
        outputSummary: summarizeWorkflowEventPayload(input.output)
      }
    }, now);
    return this.getAgentRun(id);
  }

  getAgentRun(agentRunId) {
    const id = normalizePositiveInteger(agentRunId);
    if (!id) {
      throw validationError("Valid agent run id is required");
    }
    const row = this.database.prepare(`
      SELECT
        agent_runs.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM agent_runs
      LEFT JOIN applications ON applications.id = agent_runs.application_id
      LEFT JOIN jobs ON jobs.id = applications.job_id
      WHERE agent_runs.id = ?
    `).get(id);
    if (!row) {
      throw validationError(`Agent run not found: ${id}`);
    }
    return rowToAgentRun(row);
  }

  recordWorkflowEvent(input = {}) {
    return this.insertWorkflowEvent(input, new Date().toISOString());
  }

  insertWorkflowEvent(input = {}, now = new Date().toISOString()) {
    const event = normalizeWorkflowEventInput(input);
    if (event.applicationId) {
      const application = this.database.prepare("SELECT id FROM applications WHERE id = ?").get(event.applicationId);
      if (!application) {
        throw validationError(`Application not found: ${event.applicationId}`);
      }
    }
    const result = this.database.prepare(`
      INSERT INTO workflow_events (
        application_id, source_type, source_id, event_type, severity, status,
        progress_current, progress_total, message, error_code, error_message,
        metadata_json, resolution_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.applicationId || null,
      event.sourceType,
      event.sourceId || null,
      event.eventType,
      event.severity,
      event.status || "",
      event.progressCurrent,
      event.progressTotal,
      event.message,
      event.errorCode,
      event.errorMessage,
      stringifyJson(event.metadata),
      event.resolutionStatus,
      now,
      now
    );
    return this.getWorkflowEvent(Number(result.lastInsertRowid));
  }

  getWorkflowEvent(workflowEventId) {
    const id = normalizePositiveInteger(workflowEventId);
    if (!id) {
      throw validationError("Valid workflow event id is required");
    }
    const row = this.database.prepare(`
      SELECT
        workflow_events.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM workflow_events
      LEFT JOIN applications ON applications.id = workflow_events.application_id
      LEFT JOIN jobs ON jobs.id = applications.job_id
      WHERE workflow_events.id = ?
    `).get(id);
    if (!row) {
      throw validationError(`Workflow event not found: ${id}`);
    }
    return rowToWorkflowEvent(row);
  }

  getWorkflowEvents(options = {}) {
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    const applicationId = normalizeOptionalPositiveInteger(options.applicationId);
    const severity = options.severity ? normalizeWorkflowSeverity(options.severity) : "";
    const resolutionStatus = normalizeWorkflowResolutionStatus(options.resolutionStatus || options.status || "");
    const whereParts = [];
    const params = [];
    if (applicationId) {
      whereParts.push("workflow_events.application_id = ?");
      params.push(applicationId);
    }
    if (severity) {
      whereParts.push("workflow_events.severity = ?");
      params.push(severity);
    }
    if (resolutionStatus) {
      whereParts.push("workflow_events.resolution_status = ?");
      params.push(resolutionStatus);
    }
    params.push(limit);
    const rows = this.database.prepare(`
      SELECT
        workflow_events.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM workflow_events
      LEFT JOIN applications ON applications.id = workflow_events.application_id
      LEFT JOIN jobs ON jobs.id = applications.job_id
      ${whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : ""}
      ORDER BY workflow_events.id DESC
      LIMIT ?
    `).all(...params);
    return {
      storage: "sqlite",
      events: rows.map(rowToWorkflowEvent)
    };
  }

  getApplicationTimeline(applicationId, options = {}) {
    const id = normalizePositiveInteger(applicationId);
    if (!id) {
      throw validationError("Valid application id is required");
    }
    const application = this.database.prepare("SELECT id FROM applications WHERE id = ?").get(id);
    if (!application) {
      throw validationError(`Application not found: ${id}`);
    }
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 200));
    const workflowRows = this.database.prepare(`
      SELECT
        workflow_events.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM workflow_events
      LEFT JOIN applications ON applications.id = workflow_events.application_id
      LEFT JOIN jobs ON jobs.id = applications.job_id
      WHERE workflow_events.application_id = ?
      ORDER BY workflow_events.id DESC
      LIMIT ?
    `).all(id, limit);
    const legacyItems = [
      ...this.getApplicationEventTimelineRows(id),
      ...this.getAgentRunTimelineRows(id),
      ...this.getBrowserTaskTimelineRows(id)
    ];
    const workflowItems = workflowRows.map(rowToWorkflowEvent).map((event) => ({
      ...event,
      timelineSource: "workflow_events"
    }));
    const seen = new Set(workflowItems.map((item) => sourceKeyForTimeline(item.sourceType, item.sourceId)));
    const items = workflowItems
      .concat(legacyItems.filter((item) => !seen.has(sourceKeyForTimeline(item.sourceType, item.sourceId))))
      .sort(compareTimelineItemsDesc)
      .slice(0, limit);
    return {
      storage: "sqlite",
      applicationId: id,
      totalItems: items.length,
      items
    };
  }

  getWorkflowErrors(options = {}) {
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    const resolutionStatus = normalizeWorkflowResolutionStatus(options.status || options.resolutionStatus || "OPEN") || "OPEN";
    const applicationId = normalizeOptionalPositiveInteger(options.applicationId);
    const sourceType = normalizeWorkflowSourceType(options.sourceType || "");
    const whereParts = [
      "workflow_events.resolution_status = ?",
      "(workflow_events.severity IN ('warning', 'error') OR workflow_events.error_code != '' OR workflow_events.error_message != '')"
    ];
    const params = [resolutionStatus];
    if (applicationId) {
      whereParts.push("workflow_events.application_id = ?");
      params.push(applicationId);
    }
    if (sourceType) {
      whereParts.push("workflow_events.source_type = ?");
      params.push(sourceType);
    }
    params.push(limit);
    const rows = this.database.prepare(`
      SELECT
        workflow_events.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM workflow_events
      LEFT JOIN applications ON applications.id = workflow_events.application_id
      LEFT JOIN jobs ON jobs.id = applications.job_id
      WHERE ${whereParts.join(" AND ")}
      ORDER BY workflow_events.id DESC
      LIMIT ?
    `).all(...params);
    return {
      storage: "sqlite",
      resolutionStatus,
      totalErrors: rows.length,
      errors: rows.map(rowToWorkflowEvent)
    };
  }

  resolveWorkflowError(workflowEventId, input = {}) {
    const id = normalizePositiveInteger(workflowEventId);
    if (!id) {
      throw validationError("Valid workflow event id is required");
    }
    const resolutionStatus = normalizeWorkflowResolutionStatus(input.status || input.resolutionStatus || "RESOLVED");
    if (!resolutionStatus || resolutionStatus === "OPEN") {
      throw validationError("Resolution status must be RESOLVED or IGNORED");
    }
    const existing = this.database.prepare("SELECT * FROM workflow_events WHERE id = ?").get(id);
    if (!existing) {
      throw validationError(`Workflow event not found: ${id}`);
    }
    const now = new Date().toISOString();
    this.database.prepare(`
      UPDATE workflow_events
      SET resolution_status = ?, resolution_note = ?, resolved_by = ?, resolved_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      resolutionStatus,
      cleanMultiline(input.note || input.resolutionNote || ""),
      cleanText(input.resolvedBy || input.reviewer || "user"),
      now,
      now,
      id
    );
    return {
      ok: true,
      storage: "sqlite",
      event: this.getWorkflowEvent(id)
    };
  }

  getApplicationEventTimelineRows(applicationId) {
    const rows = this.database.prepare(`
      SELECT
        application_events.*,
        applications.status AS application_status,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM application_events
      JOIN applications ON applications.id = application_events.application_id
      JOIN jobs ON jobs.id = applications.job_id
      WHERE application_events.application_id = ?
      ORDER BY application_events.id DESC
      LIMIT 200
    `).all(applicationId);
    return rows.map((row) => timelineItemFromApplicationEvent(rowToApplicationEvent(row)));
  }

  getAgentRunTimelineRows(applicationId) {
    const rows = this.database.prepare(`
      SELECT
        agent_runs.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM agent_runs
      LEFT JOIN applications ON applications.id = agent_runs.application_id
      LEFT JOIN jobs ON jobs.id = applications.job_id
      WHERE agent_runs.application_id = ?
      ORDER BY agent_runs.id DESC
      LIMIT 200
    `).all(applicationId);
    return rows.map((row) => timelineItemFromAgentRun(rowToAgentRun(row)));
  }

  getBrowserTaskTimelineRows(applicationId) {
    const rows = this.database.prepare(`
      SELECT
        browser_tasks.*,
        jobs.source_key,
        jobs.job_id AS boss_job_id,
        jobs.title,
        jobs.company_name,
        jobs.salary,
        jobs.location,
        jobs.detail_url
      FROM browser_tasks
      LEFT JOIN applications ON applications.id = browser_tasks.application_id
      LEFT JOIN jobs ON jobs.id = applications.job_id
      WHERE browser_tasks.application_id = ?
      ORDER BY browser_tasks.id DESC
      LIMIT 200
    `).all(applicationId);
    return rows.map((row) => timelineItemFromBrowserTask(rowToBrowserTask(row)));
  }

  createScreening(input = {}) {
    const applicationId = normalizePositiveInteger(input.applicationId);
    if (!applicationId) {
      throw validationError("Valid application id is required");
    }
    const result = normalizeScreeningRecord(input.result || input.screening || {});
    const provider = cleanText(input.provider || "");
    const agentRunId = normalizeOptionalPositiveInteger(input.agentRunId);
    const inputMetadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
    const metadata = {
      ...(result.metadata || {}),
      ...inputMetadata
    };
    const requestedTransitionStatus = screeningRecommendationToStatus(result.recommendation);
    const now = new Date().toISOString();

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const application = this.database.prepare("SELECT * FROM applications WHERE id = ?").get(applicationId);
      if (!application) {
        throw validationError(`Application not found: ${applicationId}`);
      }
      if (agentRunId) {
        const agentRun = this.database.prepare("SELECT id FROM agent_runs WHERE id = ?").get(agentRunId);
        if (!agentRun) {
          throw validationError(`Agent run not found: ${agentRunId}`);
        }
      }
      const preserveOnInvalidTransition = Boolean(input.preserveApplicationStatusOnInvalidTransition);
      const skipApplicationTransition = Boolean(
        input.skipApplicationTransition
        || metadata.noApplicationStatusChange
        || (preserveOnInvalidTransition && !canTransitionApplication(application.status, requestedTransitionStatus))
      );
      const transitionStatus = skipApplicationTransition ? application.status : requestedTransitionStatus;
      const insert = this.database.prepare(`
        INSERT INTO screenings (
          application_id, agent_run_id, match_score, risk_score, recommendation,
          hard_conditions_json, matched_points_json, risk_points_json, resume_strategy_json,
          requires_user_confirmation, confidence, provider, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        applicationId,
        agentRunId || null,
        result.matchScore,
        result.riskScore,
        result.recommendation,
        stringifyJson(result.hardConditions),
        stringifyJson(result.matchedPoints),
        stringifyJson(result.riskPoints),
        stringifyJson(result.resumeStrategy),
        result.requiresUserConfirmation ? 1 : 0,
        result.confidence,
        provider,
        stringifyJson(metadata),
        now
      );
      const screeningId = Number(insert.lastInsertRowid);
      let transitionResult = {
        applicationId,
        fromStatus: application.status,
        toStatus: application.status,
        changed: false,
        idempotent: false
      };
      if (!skipApplicationTransition) {
        transitionResult = this.transitionApplicationWithinTransaction(applicationId, {
          toStatus: transitionStatus,
          eventType: "SCREENING_COMPLETED",
          reason: "screening_completed",
          evidence: {
            type: "screening",
            sourceId: screeningId
          },
          metadata: {
            screeningId,
            agentRunId: agentRunId || null,
            matchScore: result.matchScore,
            riskScore: result.riskScore,
            recommendation: result.recommendation,
            provider,
            fallbackUsed: Boolean(metadata.fallbackUsed)
          },
          now
        });
      }
      if (skipApplicationTransition || !transitionResult.changed) {
        this.insertApplicationEvent(
          applicationId,
          application.status,
          application.status,
          "SCREENING_COMPLETED",
          skipApplicationTransition ? "screening_completed_no_status_change" : "screening_completed_status_unchanged",
          {
            screeningId,
            agentRunId: agentRunId || null,
            matchScore: result.matchScore,
            riskScore: result.riskScore,
            recommendation: result.recommendation,
            provider,
            fallbackUsed: Boolean(metadata.fallbackUsed),
            noApplicationStatusChange: true
          },
          now,
          `screening:${screeningId}:fact`
        );
      }
      this.database.exec("COMMIT");
      return {
        storage: "sqlite",
        ok: true,
        screening: this.getScreening(screeningId),
        transition: transitionResult
      };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getScreening(screeningId) {
    const id = normalizePositiveInteger(screeningId);
    if (!id) {
      throw validationError("Valid screening id is required");
    }
    const row = this.database.prepare(`
      SELECT
        screenings.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM screenings
      JOIN applications ON applications.id = screenings.application_id
      JOIN jobs ON jobs.id = applications.job_id
      WHERE screenings.id = ?
    `).get(id);
    if (!row) {
      throw validationError(`Screening not found: ${id}`);
    }
    return rowToScreening(row);
  }

  getLatestScreeningForApplication(applicationId) {
    const id = normalizePositiveInteger(applicationId);
    if (!id) {
      throw validationError("Valid application id is required");
    }
    const row = this.database.prepare(`
      SELECT
        screenings.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM screenings
      JOIN applications ON applications.id = screenings.application_id
      JOIN jobs ON jobs.id = applications.job_id
      WHERE screenings.application_id = ?
      ORDER BY screenings.id DESC
      LIMIT 1
    `).get(id);
    return row ? rowToScreening(row) : null;
  }

  getScreenings(options = {}) {
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    const applicationId = normalizePositiveInteger(options.applicationId || 0);
    const whereParts = [];
    const params = [];
    if (applicationId) {
      whereParts.push("screenings.application_id = ?");
      params.push(applicationId);
    }
    params.push(limit);
    const rows = this.database.prepare(`
      SELECT
        screenings.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM screenings
      JOIN applications ON applications.id = screenings.application_id
      JOIN jobs ON jobs.id = applications.job_id
      ${whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : ""}
      ORDER BY screenings.id DESC
      LIMIT ?
    `).all(...params);
    return {
      storage: "sqlite",
      totalScreenings: this.countScreenings({ applicationId }),
      screenings: rows.map(rowToScreening)
    };
  }

  createResumeVersion(input = {}) {
    const applicationId = normalizePositiveInteger(input.applicationId);
    if (!applicationId) {
      throw validationError("Valid application id is required");
    }
    const resume = normalizeResumeVersionRecord(input.result || input.resume || {});
    const provider = cleanText(input.provider || "");
    const agentRunId = normalizeOptionalPositiveInteger(input.agentRunId);
    const screeningId = normalizeOptionalPositiveInteger(input.screeningId || resume.metadata.screeningId);
    const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
    const now = new Date().toISOString();

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const application = this.database.prepare("SELECT * FROM applications WHERE id = ?").get(applicationId);
      if (!application) {
        throw validationError(`Application not found: ${applicationId}`);
      }
      if (agentRunId && !this.database.prepare("SELECT id FROM agent_runs WHERE id = ?").get(agentRunId)) {
        throw validationError(`Agent run not found: ${agentRunId}`);
      }
      if (screeningId && !this.database.prepare("SELECT id FROM screenings WHERE id = ?").get(screeningId)) {
        throw validationError(`Screening not found: ${screeningId}`);
      }
      const versionNumber = this.countResumeVersions({ applicationId }) + 1;
      const insert = this.database.prepare(`
        INSERT INTO resume_versions (
          application_id, screening_id, agent_run_id, version_number, status, provider,
          resume_fields_json, source_mapping_json, diff_summary_json, compression_notes_json,
          unsupported_claims_json, render_metadata_json, file_path, file_format, metadata_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        applicationId,
        screeningId || null,
        agentRunId || null,
        versionNumber,
        resume.unsupportedClaims.length ? "NEEDS_AUDIT" : "DRAFTED",
        provider,
        stringifyJson(resume.resumeFields),
        stringifyJson(resume.sourceMapping),
        stringifyJson(resume.diffSummary),
        stringifyJson(resume.compressionNotes),
        stringifyJson(resume.unsupportedClaims),
        stringifyJson(resume.renderMetadata),
        "",
        "",
        stringifyJson({ ...resume.metadata, ...metadata }),
        now,
        now
      );
      const resumeVersionId = Number(insert.lastInsertRowid);
      const requestedStatus = "RESUME_DRAFTED";
      const skipApplicationTransition = Boolean(
        input.skipApplicationTransition
        || metadata.noApplicationStatusChange
        || !canTransitionApplication(application.status, requestedStatus)
      );
      let transitionResult = {
        applicationId,
        fromStatus: application.status,
        toStatus: application.status,
        changed: false,
        idempotent: false
      };
      if (!skipApplicationTransition) {
        transitionResult = this.transitionApplicationWithinTransaction(applicationId, {
          toStatus: requestedStatus,
          eventType: "RESUME_DRAFTED",
          reason: "resume_drafted",
          evidence: {
            type: "resume_version",
            sourceId: resumeVersionId
          },
          metadata: {
            resumeVersionId,
            screeningId: screeningId || null,
            agentRunId: agentRunId || null,
            provider
          },
          now
        });
      }
      if (skipApplicationTransition || !transitionResult.changed) {
        this.insertApplicationEvent(
          applicationId,
          application.status,
          application.status,
          "RESUME_VERSION_CREATED",
          "resume_version_created_no_status_change",
          {
            resumeVersionId,
            screeningId: screeningId || null,
            agentRunId: agentRunId || null,
            provider,
            noApplicationStatusChange: true
          },
          now,
          `resume-version:${resumeVersionId}:fact`
        );
      }
      this.database.exec("COMMIT");
      return {
        storage: "sqlite",
        ok: true,
        resumeVersion: this.getResumeVersion(resumeVersionId),
        transition: transitionResult
      };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  attachResumeFile(resumeVersionId, file = {}) {
    const id = normalizePositiveInteger(resumeVersionId);
    if (!id) {
      throw validationError("Valid resume version id is required");
    }
    const existing = this.getResumeVersion(id);
    const renderMetadata = {
      ...existing.renderMetadata,
      ...(file && typeof file === "object" ? file : {})
    };
    const now = new Date().toISOString();
    this.database.prepare(`
      UPDATE resume_versions
      SET file_path = ?, file_format = ?, render_metadata_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      cleanText(file.filePath || ""),
      cleanText(file.format || file.fileFormat || ""),
      stringifyJson(renderMetadata),
      now,
      id
    );
    return this.getResumeVersion(id);
  }

  reviseResumeVersion(resumeVersionId, input = {}) {
    const baseVersion = this.getResumeVersion(resumeVersionId);
    const fieldsPatch = input.resumeFields && typeof input.resumeFields === "object" ? input.resumeFields : {};
    const nextFields = mergeResumeFields(baseVersion.resumeFields, fieldsPatch);
    const revisionReason = cleanMultiline(input.reason || input.revisionReason || "user_revision");
    const now = new Date().toISOString();
    const result = this.createResumeVersion({
      applicationId: baseVersion.applicationId,
      screeningId: baseVersion.screeningId || "",
      agentRunId: "",
      provider: cleanText(input.provider || "user_edit"),
      result: {
        resumeFields: nextFields,
        sourceMapping: baseVersion.sourceMapping,
        diffSummary: [
          ...normalizeArray(baseVersion.diffSummary || []),
          `用户编辑基于版本 #${baseVersion.id}${revisionReason ? `：${revisionReason}` : ""}`
        ],
        compressionNotes: baseVersion.compressionNotes,
        unsupportedClaims: baseVersion.unsupportedClaims,
        renderMetadata: {
          ...baseVersion.renderMetadata,
          revisedFromVersionId: baseVersion.id,
          revisedAt: now
        },
        metadata: {
          ...baseVersion.metadata,
          revisedFromVersionId: baseVersion.id,
          revisionReason,
          revisionSource: "options_detail_editor",
          revisedAt: now
        }
      },
      metadata: {
        revisedFromVersionId: baseVersion.id,
        revisionReason,
        revisionSource: "options_detail_editor"
      }
    });
    return {
      storage: "sqlite",
      ok: true,
      baseResumeVersion: baseVersion,
      resumeVersion: result.resumeVersion
    };
  }

  approveResumeVersion(resumeVersionId, input = {}) {
    const resumeVersion = this.getResumeVersion(resumeVersionId);
    if (resumeVersion.status !== "APPROVED") {
      throw validationError(`Only APPROVED resume versions can be locally approved: ${resumeVersion.status}`);
    }
    const now = new Date().toISOString();
    const approver = cleanText(input.approver || "user");
    const approvalNote = cleanMultiline(input.note || input.approvalNote || "");
    const metadata = {
      ...resumeVersion.metadata,
      localApproval: {
        approved: true,
        approver,
        note: approvalNote,
        approvedAt: now,
        source: "options_detail_panel"
      }
    };
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`
        UPDATE resume_versions
        SET metadata_json = ?, updated_at = ?
        WHERE id = ?
      `).run(stringifyJson(metadata), now, resumeVersion.id);
      const application = this.database.prepare("SELECT * FROM applications WHERE id = ?").get(resumeVersion.applicationId);
      let transition = {
        applicationId: resumeVersion.applicationId,
        fromStatus: application?.status || "",
        toStatus: application?.status || "",
        changed: false,
        idempotent: false
      };
      if (application && canTransitionApplication(application.status, "GREETING_READY")) {
        transition = this.transitionApplicationWithinTransaction(resumeVersion.applicationId, {
          toStatus: "GREETING_READY",
          eventType: "RESUME_LOCALLY_APPROVED",
          reason: "resume_locally_approved",
          evidence: {
            type: "local_resume_approval",
            sourceId: resumeVersion.id
          },
          metadata: {
            resumeVersionId: resumeVersion.id,
            approver,
            approvalNote,
            noBrowserTaskCreated: true
          },
          now
        });
      }
      if (!transition.changed) {
        this.insertApplicationEvent(
          resumeVersion.applicationId,
          application?.status || "",
          application?.status || "",
          "RESUME_LOCALLY_APPROVED",
          "resume_locally_approved_no_status_change",
          {
            resumeVersionId: resumeVersion.id,
            approver,
            approvalNote,
            noBrowserTaskCreated: true,
            noApplicationStatusChange: true
          },
          now,
          `resume-local-approval:${resumeVersion.id}:fact`
        );
      }
      this.database.exec("COMMIT");
      return {
        storage: "sqlite",
        ok: true,
        resumeVersion: this.getResumeVersion(resumeVersion.id),
        transition
      };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getResumeVersion(resumeVersionId) {
    const id = normalizePositiveInteger(resumeVersionId);
    if (!id) {
      throw validationError("Valid resume version id is required");
    }
    const row = this.database.prepare(`
      SELECT
        resume_versions.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM resume_versions
      JOIN applications ON applications.id = resume_versions.application_id
      JOIN jobs ON jobs.id = applications.job_id
      WHERE resume_versions.id = ?
    `).get(id);
    if (!row) {
      throw validationError(`Resume version not found: ${id}`);
    }
    return rowToResumeVersion(row);
  }

  getResumeVersions(options = {}) {
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    const applicationId = normalizePositiveInteger(options.applicationId || 0);
    const whereParts = [];
    const params = [];
    if (applicationId) {
      whereParts.push("resume_versions.application_id = ?");
      params.push(applicationId);
    }
    params.push(limit);
    const rows = this.database.prepare(`
      SELECT
        resume_versions.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM resume_versions
      JOIN applications ON applications.id = resume_versions.application_id
      JOIN jobs ON jobs.id = applications.job_id
      ${whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : ""}
      ORDER BY resume_versions.id DESC
      LIMIT ?
    `).all(...params);
    return {
      storage: "sqlite",
      totalResumeVersions: this.countResumeVersions({ applicationId }),
      resumeVersions: rows.map(rowToResumeVersion)
    };
  }

  getLatestResumeVersionForApplication(applicationId) {
    const id = normalizePositiveInteger(applicationId);
    if (!id) {
      throw validationError("Valid application id is required");
    }
    const row = this.database.prepare(`
      SELECT
        resume_versions.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM resume_versions
      JOIN applications ON applications.id = resume_versions.application_id
      JOIN jobs ON jobs.id = applications.job_id
      WHERE resume_versions.application_id = ?
      ORDER BY resume_versions.id DESC
      LIMIT 1
    `).get(id);
    return row ? rowToResumeVersion(row) : null;
  }

  createResumeFitEvaluation(input = {}) {
    const resumeVersionId = normalizePositiveInteger(input.resumeVersionId);
    if (!resumeVersionId) {
      throw validationError("Valid resume version id is required");
    }
    const agentRunId = normalizeOptionalPositiveInteger(input.agentRunId);
    const provider = cleanText(input.provider || "");
    const evaluation = normalizeResumeFitEvaluationRecord(input.result || input.evaluation || {});
    const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
    const resumeVersion = this.getResumeVersion(resumeVersionId);
    const now = new Date().toISOString();
    if (agentRunId && !this.database.prepare("SELECT id FROM agent_runs WHERE id = ?").get(agentRunId)) {
      throw validationError(`Agent run not found: ${agentRunId}`);
    }
    const insert = this.database.prepare(`
      INSERT INTO resume_fit_evaluations (
        resume_version_id, application_id, agent_run_id, provider,
        coverage_score, fit_level, confidence, requirement_count,
        covered_count, weak_count, missing_count,
        jd_requirements_json, coverage_items_json, blockers_json,
        recommendations_json, policy_json, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      resumeVersionId,
      resumeVersion.applicationId,
      agentRunId || null,
      provider,
      evaluation.coverage.score,
      evaluation.coverage.fitLevel,
      evaluation.coverage.confidence,
      evaluation.coverage.total,
      evaluation.coverage.covered,
      evaluation.coverage.weak,
      evaluation.coverage.missing,
      stringifyJson(evaluation.jdRequirements),
      stringifyJson(evaluation.coverage.items),
      stringifyJson(evaluation.blockers),
      stringifyJson(evaluation.recommendations),
      stringifyJson(evaluation.policy),
      stringifyJson({ ...evaluation.metadata, ...metadata }),
      now
    );
    return {
      storage: "sqlite",
      ok: true,
      resumeFitEvaluation: this.getResumeFitEvaluation(Number(insert.lastInsertRowid))
    };
  }

  getResumeFitEvaluation(evaluationId) {
    const id = normalizePositiveInteger(evaluationId);
    if (!id) {
      throw validationError("Valid resume fit evaluation id is required");
    }
    const row = this.database.prepare(`
      SELECT
        resume_fit_evaluations.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM resume_fit_evaluations
      JOIN applications ON applications.id = resume_fit_evaluations.application_id
      JOIN jobs ON jobs.id = applications.job_id
      WHERE resume_fit_evaluations.id = ?
    `).get(id);
    if (!row) {
      throw validationError(`Resume fit evaluation not found: ${id}`);
    }
    return rowToResumeFitEvaluation(row);
  }

  getResumeFitEvaluations(options = {}) {
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    const resumeVersionId = normalizePositiveInteger(options.resumeVersionId || 0);
    const applicationId = normalizePositiveInteger(options.applicationId || 0);
    const whereParts = [];
    const params = [];
    if (resumeVersionId) {
      whereParts.push("resume_fit_evaluations.resume_version_id = ?");
      params.push(resumeVersionId);
    }
    if (applicationId) {
      whereParts.push("resume_fit_evaluations.application_id = ?");
      params.push(applicationId);
    }
    params.push(limit);
    const rows = this.database.prepare(`
      SELECT
        resume_fit_evaluations.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM resume_fit_evaluations
      JOIN applications ON applications.id = resume_fit_evaluations.application_id
      JOIN jobs ON jobs.id = applications.job_id
      ${whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : ""}
      ORDER BY resume_fit_evaluations.id DESC
      LIMIT ?
    `).all(...params);
    return {
      storage: "sqlite",
      totalResumeFitEvaluations: this.countResumeFitEvaluations({ resumeVersionId, applicationId }),
      resumeFitEvaluations: rows.map(rowToResumeFitEvaluation)
    };
  }

  getLatestResumeFitEvaluationForResumeVersion(resumeVersionId) {
    const id = normalizePositiveInteger(resumeVersionId);
    if (!id) {
      throw validationError("Valid resume version id is required");
    }
    const row = this.database.prepare(`
      SELECT
        resume_fit_evaluations.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM resume_fit_evaluations
      JOIN applications ON applications.id = resume_fit_evaluations.application_id
      JOIN jobs ON jobs.id = applications.job_id
      WHERE resume_fit_evaluations.resume_version_id = ?
      ORDER BY resume_fit_evaluations.id DESC
      LIMIT 1
    `).get(id);
    return row ? rowToResumeFitEvaluation(row) : null;
  }

  createResumeClaimVerification(input = {}) {
    const resumeVersionId = normalizePositiveInteger(input.resumeVersionId);
    if (!resumeVersionId) {
      throw validationError("Valid resume version id is required");
    }
    const agentRunId = normalizeOptionalPositiveInteger(input.agentRunId);
    const provider = cleanText(input.provider || "");
    const verification = normalizeResumeClaimVerificationRecord(input.result || input.verification || {});
    const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
    const resumeVersion = this.getResumeVersion(resumeVersionId);
    const now = new Date().toISOString();
    if (agentRunId && !this.database.prepare("SELECT id FROM agent_runs WHERE id = ?").get(agentRunId)) {
      throw validationError(`Agent run not found: ${agentRunId}`);
    }
    const insert = this.database.prepare(`
      INSERT INTO resume_claim_verifications (
        resume_version_id, application_id, agent_run_id, provider,
        total_claims, supported_count, weak_count, unsupported_count,
        needs_user_confirmation_count, truthfulness_passed, coverage_ratio,
        claims_json, unsupported_claims_json, needs_user_confirmation_json,
        recommendations_json, policy_json, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      resumeVersionId,
      resumeVersion.applicationId,
      agentRunId || null,
      provider,
      verification.summary.total,
      verification.summary.supported,
      verification.summary.weak,
      verification.summary.unsupported,
      verification.summary.needsUserConfirmation,
      verification.summary.truthfulnessPassed ? 1 : 0,
      verification.summary.coverageRatio,
      stringifyJson(verification.claims),
      stringifyJson(verification.unsupportedClaims),
      stringifyJson(verification.needsUserConfirmation),
      stringifyJson(verification.recommendations),
      stringifyJson(verification.policy),
      stringifyJson({ ...verification.metadata, ...metadata }),
      now
    );
    return {
      storage: "sqlite",
      ok: true,
      resumeClaimVerification: this.getResumeClaimVerification(Number(insert.lastInsertRowid))
    };
  }

  getResumeClaimVerification(verificationId) {
    const id = normalizePositiveInteger(verificationId);
    if (!id) {
      throw validationError("Valid resume claim verification id is required");
    }
    const row = this.database.prepare(`
      SELECT
        resume_claim_verifications.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM resume_claim_verifications
      JOIN applications ON applications.id = resume_claim_verifications.application_id
      JOIN jobs ON jobs.id = applications.job_id
      WHERE resume_claim_verifications.id = ?
    `).get(id);
    if (!row) {
      throw validationError(`Resume claim verification not found: ${id}`);
    }
    return rowToResumeClaimVerification(row);
  }

  getResumeClaimVerifications(options = {}) {
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    const resumeVersionId = normalizePositiveInteger(options.resumeVersionId || 0);
    const applicationId = normalizePositiveInteger(options.applicationId || 0);
    const whereParts = [];
    const params = [];
    if (resumeVersionId) {
      whereParts.push("resume_claim_verifications.resume_version_id = ?");
      params.push(resumeVersionId);
    }
    if (applicationId) {
      whereParts.push("resume_claim_verifications.application_id = ?");
      params.push(applicationId);
    }
    params.push(limit);
    const rows = this.database.prepare(`
      SELECT
        resume_claim_verifications.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM resume_claim_verifications
      JOIN applications ON applications.id = resume_claim_verifications.application_id
      JOIN jobs ON jobs.id = applications.job_id
      ${whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : ""}
      ORDER BY resume_claim_verifications.id DESC
      LIMIT ?
    `).all(...params);
    return {
      storage: "sqlite",
      totalResumeClaimVerifications: this.countResumeClaimVerifications({ resumeVersionId, applicationId }),
      resumeClaimVerifications: rows.map(rowToResumeClaimVerification)
    };
  }

  getLatestResumeClaimVerificationForResumeVersion(resumeVersionId) {
    const id = normalizePositiveInteger(resumeVersionId);
    if (!id) {
      throw validationError("Valid resume version id is required");
    }
    const row = this.database.prepare(`
      SELECT
        resume_claim_verifications.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM resume_claim_verifications
      JOIN applications ON applications.id = resume_claim_verifications.application_id
      JOIN jobs ON jobs.id = applications.job_id
      WHERE resume_claim_verifications.resume_version_id = ?
      ORDER BY resume_claim_verifications.id DESC
      LIMIT 1
    `).get(id);
    return row ? rowToResumeClaimVerification(row) : null;
  }

  createResumeAudit(input = {}) {
    const resumeVersionId = normalizePositiveInteger(input.resumeVersionId);
    if (!resumeVersionId) {
      throw validationError("Valid resume version id is required");
    }
    const audit = normalizeResumeAuditRecord(input.result || input.audit || {});
    const provider = cleanText(input.provider || "");
    const agentRunId = normalizeOptionalPositiveInteger(input.agentRunId);
    const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
    const resumeVersion = this.getResumeVersion(resumeVersionId);
    const now = new Date().toISOString();
    const auditStatus = audit.recommendation === "approve" ? "APPROVED" : audit.recommendation === "revise" ? "NEEDS_REVISION" : "BLOCKED";

    this.database.exec("BEGIN IMMEDIATE");
    try {
      if (agentRunId && !this.database.prepare("SELECT id FROM agent_runs WHERE id = ?").get(agentRunId)) {
        throw validationError(`Agent run not found: ${agentRunId}`);
      }
      const insert = this.database.prepare(`
        INSERT INTO resume_audits (
          resume_version_id, agent_run_id, status, provider, truthfulness_passed,
          format_passed, page_limit_passed, unsupported_claims_json, source_issues_json,
          exaggeration_risk, job_fit_review, risk_score_adjustment, recommendation,
          requires_user_confirmation, render_metadata_json, risk_flags_json, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        resumeVersionId,
        agentRunId || null,
        auditStatus,
        provider,
        audit.truthfulnessPassed ? 1 : 0,
        audit.formatPassed ? 1 : 0,
        audit.pageLimitPassed ? 1 : 0,
        stringifyJson(audit.unsupportedClaims),
        stringifyJson(audit.sourceIssues),
        audit.exaggerationRisk,
        audit.jobFitReview,
        audit.riskScoreAdjustment,
        audit.recommendation,
        audit.requiresUserConfirmation ? 1 : 0,
        stringifyJson(audit.renderMetadata),
        stringifyJson(audit.riskFlags),
        stringifyJson({ ...audit.metadata, ...metadata }),
        now
      );
      this.database.prepare(`
        UPDATE resume_versions
        SET status = ?, updated_at = ?
        WHERE id = ?
      `).run(auditStatus, now, resumeVersionId);
      const resumeAuditId = Number(insert.lastInsertRowid);
      const toStatus = auditStatus === "APPROVED" ? "RESUME_AUDITED" : "NEEDS_USER_REVIEW";
      const application = this.database.prepare("SELECT * FROM applications WHERE id = ?").get(resumeVersion.applicationId);
      let transitionResult = {
        applicationId: resumeVersion.applicationId,
        fromStatus: application?.status || "",
        toStatus: application?.status || "",
        changed: false,
        idempotent: false
      };
      if (application && canTransitionApplication(application.status, toStatus)) {
        transitionResult = this.transitionApplicationWithinTransaction(resumeVersion.applicationId, {
          toStatus,
          eventType: "RESUME_AUDITED",
          reason: auditStatus.toLowerCase(),
          evidence: auditStatus === "APPROVED"
            ? { type: "resume_audit", sourceId: resumeAuditId }
            : {
              type: "failure",
              sourceType: "resume_audit",
              sourceId: resumeAuditId,
              errorCode: `RESUME_AUDIT_${auditStatus}`
            },
          metadata: {
            resumeVersionId,
            resumeAuditId,
            agentRunId: agentRunId || null,
            recommendation: audit.recommendation,
            provider
          },
          now
        });
      }
      if (!transitionResult.changed) {
        this.insertApplicationEvent(
          resumeVersion.applicationId,
          application?.status || "",
          application?.status || "",
          "RESUME_AUDITED",
          `${auditStatus.toLowerCase()}_no_status_change`,
          {
            resumeVersionId,
            resumeAuditId,
            agentRunId: agentRunId || null,
            recommendation: audit.recommendation,
            provider,
            noApplicationStatusChange: true
          },
          now,
          `resume-audit:${resumeAuditId}:fact`
        );
      }
      this.database.exec("COMMIT");
      return {
        storage: "sqlite",
        ok: true,
        resumeAudit: this.getResumeAudit(resumeAuditId),
        resumeVersion: this.getResumeVersion(resumeVersionId),
        transition: transitionResult
      };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getResumeAudit(resumeAuditId) {
    const id = normalizePositiveInteger(resumeAuditId);
    if (!id) {
      throw validationError("Valid resume audit id is required");
    }
    const row = this.database.prepare(`
      SELECT
        resume_audits.*,
        resume_versions.application_id,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM resume_audits
      JOIN resume_versions ON resume_versions.id = resume_audits.resume_version_id
      JOIN applications ON applications.id = resume_versions.application_id
      JOIN jobs ON jobs.id = applications.job_id
      WHERE resume_audits.id = ?
    `).get(id);
    if (!row) {
      throw validationError(`Resume audit not found: ${id}`);
    }
    return rowToResumeAudit(row);
  }

  getResumeAudits(options = {}) {
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    const resumeVersionId = normalizePositiveInteger(options.resumeVersionId || 0);
    const applicationId = normalizePositiveInteger(options.applicationId || 0);
    const whereParts = [];
    const params = [];
    if (resumeVersionId) {
      whereParts.push("resume_audits.resume_version_id = ?");
      params.push(resumeVersionId);
    }
    if (applicationId) {
      whereParts.push("resume_versions.application_id = ?");
      params.push(applicationId);
    }
    params.push(limit);
    const rows = this.database.prepare(`
      SELECT
        resume_audits.*,
        resume_versions.application_id,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM resume_audits
      JOIN resume_versions ON resume_versions.id = resume_audits.resume_version_id
      JOIN applications ON applications.id = resume_versions.application_id
      JOIN jobs ON jobs.id = applications.job_id
      ${whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : ""}
      ORDER BY resume_audits.id DESC
      LIMIT ?
    `).all(...params);
    return {
      storage: "sqlite",
      totalResumeAudits: this.countResumeAudits({ resumeVersionId, applicationId }),
      resumeAudits: rows.map(rowToResumeAudit)
    };
  }

  getLatestResumeAuditForResumeVersion(resumeVersionId) {
    const id = normalizePositiveInteger(resumeVersionId);
    if (!id) {
      throw validationError("Valid resume version id is required");
    }
    const row = this.database.prepare(`
      SELECT
        resume_audits.*,
        resume_versions.application_id,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM resume_audits
      JOIN resume_versions ON resume_versions.id = resume_audits.resume_version_id
      JOIN applications ON applications.id = resume_versions.application_id
      JOIN jobs ON jobs.id = applications.job_id
      WHERE resume_audits.resume_version_id = ?
      ORDER BY resume_audits.id DESC
      LIMIT 1
    `).get(id);
    return row ? rowToResumeAudit(row) : null;
  }

  createGreetingDraft(input = {}) {
    const applicationId = normalizePositiveInteger(input.applicationId);
    const resumeVersionId = normalizePositiveInteger(input.resumeVersionId);
    const agentRunId = normalizeOptionalPositiveInteger(input.agentRunId);
    if (!applicationId) {
      throw validationError("Valid application id is required");
    }
    if (!resumeVersionId) {
      throw validationError("Valid resume version id is required");
    }
    const message = normalizeGreetingDraftRecord(input.result || input.message || {});
    const provider = cleanText(input.provider || "rules");
    const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
    const now = new Date().toISOString();

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const application = this.database.prepare("SELECT * FROM applications WHERE id = ?").get(applicationId);
      if (!application) {
        throw validationError(`Application not found: ${applicationId}`);
      }
      const resumeVersion = this.getResumeVersion(resumeVersionId);
      if (resumeVersion.applicationId !== applicationId) {
        throw validationError("Resume version does not belong to the application");
      }
      if (resumeVersion.status !== "APPROVED") {
        throw validationError(`Only APPROVED resume versions can be used for greeting drafts: ${resumeVersion.status}`);
      }
      if (!resumeVersion.metadata?.localApproval?.approved) {
        throw validationError("Local resume approval is required before greeting draft creation");
      }
      if (agentRunId && !this.database.prepare("SELECT id FROM agent_runs WHERE id = ?").get(agentRunId)) {
        throw validationError(`Agent run not found: ${agentRunId}`);
      }
      const conversationId = this.ensureConversationWithinTransaction(applicationId, {
        status: "GREETING_DRAFTED",
        metadata: {
          resumeVersionId,
          provider,
          actionMode: message.actionMode
        }
      }, now);
      const insertedMessage = this.database.prepare(`
        INSERT INTO messages (
          conversation_id, application_id, resume_version_id, agent_run_id,
          direction, channel, status, message_text, provider, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        conversationId,
        applicationId,
        resumeVersionId,
        agentRunId || null,
        "OUTBOUND",
        message.channel,
        "DRAFT",
        message.messageText,
        provider,
        stringifyJson({
          ...message.metadata,
          ...metadata,
          qualitySignals: message.qualitySignals,
          requiresUserConfirmation: message.requiresUserConfirmation,
          actionMode: message.actionMode
        }),
        now,
        now
      );
      const messageId = Number(insertedMessage.lastInsertRowid);
      const browserTask = this.createBrowserTaskWithinTransaction({
        applicationId,
        taskType: "SEND_GREETING",
        payload: {
          dryRun: true,
          messageId,
          conversationId,
          resumeVersionId,
          messageText: message.messageText,
          jobId: cleanText(input.jobId || ""),
          title: cleanText(input.title || ""),
          company: cleanText(input.company || ""),
          detailUrl: cleanText(input.detailUrl || ""),
          sourceUrl: cleanText(input.sourceUrl || ""),
          source: "MessageAgent",
          requiresUserConfirmation: true,
          actionMode: "dry_run"
        }
      });
      this.insertApplicationEvent(
        applicationId,
        application.status,
        application.status,
        "GREETING_DRAFTED",
        "message_agent_dry_run",
        {
          conversationId,
          messageId,
          resumeVersionId,
          agentRunId: agentRunId || null,
          browserTaskId: browserTask.id,
          noRealBossAction: true,
          dryRun: true
        },
        now
      );
      this.database.exec("COMMIT");
      return {
        storage: "sqlite",
        ok: true,
        conversation: this.getConversation(conversationId),
        message: this.getMessage(messageId),
        browserTask: this.getBrowserTask(browserTask.id)
      };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  ensureConversationWithinTransaction(applicationId, input = {}, now = new Date().toISOString()) {
    const existing = this.database.prepare("SELECT * FROM conversations WHERE application_id = ?").get(applicationId);
    const status = cleanText(input.status || "GREETING_DRAFTED").toUpperCase();
    const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
    if (existing) {
      const mergedMetadata = {
        ...parseJsonValue(existing.metadata_json, {}),
        ...metadata,
        updatedBy: "ensureConversation"
      };
      this.database.prepare(`
        UPDATE conversations
        SET status = ?, metadata_json = ?, updated_at = ?
        WHERE id = ?
      `).run(status || existing.status, stringifyJson(mergedMetadata), now, existing.id);
      return Number(existing.id);
    }
    const inserted = this.database.prepare(`
      INSERT INTO conversations (
        application_id, status, recruiter_name, conversation_url, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      applicationId,
      status || "GREETING_DRAFTED",
      cleanText(input.recruiterName || ""),
      cleanText(input.conversationUrl || ""),
      stringifyJson(metadata),
      now,
      now
    );
    return Number(inserted.lastInsertRowid);
  }

  getConversation(conversationId) {
    const id = normalizePositiveInteger(conversationId);
    if (!id) {
      throw validationError("Valid conversation id is required");
    }
    const row = this.database.prepare(`
      SELECT
        conversations.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM conversations
      JOIN applications ON applications.id = conversations.application_id
      JOIN jobs ON jobs.id = applications.job_id
      WHERE conversations.id = ?
    `).get(id);
    if (!row) {
      throw validationError(`Conversation not found: ${id}`);
    }
    return rowToConversation(row);
  }

  getMessage(messageId) {
    const id = normalizePositiveInteger(messageId);
    if (!id) {
      throw validationError("Valid message id is required");
    }
    const row = this.database.prepare(`
      SELECT
        messages.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM messages
      JOIN applications ON applications.id = messages.application_id
      JOIN jobs ON jobs.id = applications.job_id
      WHERE messages.id = ?
    `).get(id);
    if (!row) {
      throw validationError(`Message not found: ${id}`);
    }
    return rowToMessage(row);
  }

  getMessages(options = {}) {
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    const applicationId = normalizePositiveInteger(options.applicationId || 0);
    const whereParts = [];
    const params = [];
    if (applicationId) {
      whereParts.push("messages.application_id = ?");
      params.push(applicationId);
    }
    params.push(limit);
    const rows = this.database.prepare(`
      SELECT
        messages.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM messages
      JOIN applications ON applications.id = messages.application_id
      JOIN jobs ON jobs.id = applications.job_id
      ${whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : ""}
      ORDER BY messages.id DESC
      LIMIT ?
    `).all(...params);
    return {
      storage: "sqlite",
      totalMessages: this.countMessages({ applicationId }),
      messages: rows.map(rowToMessage)
    };
  }

  getLatestGreetingDraftForApplication(applicationId) {
    const id = normalizePositiveInteger(applicationId);
    if (!id) {
      throw validationError("Valid application id is required");
    }
    const row = this.database.prepare(`
      SELECT
        messages.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM messages
      JOIN applications ON applications.id = messages.application_id
      JOIN jobs ON jobs.id = applications.job_id
      WHERE messages.application_id = ?
        AND messages.channel = 'boss_greeting'
      ORDER BY messages.id DESC
      LIMIT 1
    `).get(id);
    return row ? rowToMessage(row) : null;
  }

  getConversations(options = {}) {
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    const applicationId = normalizePositiveInteger(options.applicationId || 0);
    const whereParts = [];
    const params = [];
    if (applicationId) {
      whereParts.push("conversations.application_id = ?");
      params.push(applicationId);
    }
    params.push(limit);
    const rows = this.database.prepare(`
      SELECT
        conversations.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM conversations
      JOIN applications ON applications.id = conversations.application_id
      JOIN jobs ON jobs.id = applications.job_id
      ${whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : ""}
      ORDER BY conversations.updated_at DESC, conversations.id DESC
      LIMIT ?
    `).all(...params);
    return {
      storage: "sqlite",
      totalConversations: this.countConversations({ applicationId }),
      conversations: rows.map(rowToConversation)
    };
  }

  getLatestConversationForApplication(applicationId) {
    const id = normalizePositiveInteger(applicationId);
    if (!id) {
      throw validationError("Valid application id is required");
    }
    const row = this.database.prepare(`
      SELECT
        conversations.*,
        jobs.source_key,
        jobs.title,
        jobs.company_name
      FROM conversations
      JOIN applications ON applications.id = conversations.application_id
      JOIN jobs ON jobs.id = applications.job_id
      WHERE conversations.application_id = ?
      ORDER BY conversations.updated_at DESC, conversations.id DESC
      LIMIT 1
    `).get(id);
    return row ? rowToConversation(row) : null;
  }

  getSubmissionReadinessQueue(options = {}) {
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    const requestedStatuses = normalizeReadinessStatusList(options.statuses || options.status || "READY_FOR_MANUAL_REVIEW");
    const includeAll = requestedStatuses.includes("ALL");
    const rows = this.database.prepare(`
      SELECT
        conversations.*,
        applications.status AS application_status,
        jobs.source_key,
        jobs.title,
        jobs.company_name,
        jobs.salary,
        jobs.location,
        jobs.detail_url
      FROM conversations
      JOIN applications ON applications.id = conversations.application_id
      JOIN jobs ON jobs.id = applications.job_id
      ORDER BY conversations.updated_at DESC, conversations.id DESC
      LIMIT ?
    `).all(Math.max(limit * 4, 50));
    const items = rows
      .map(rowToSubmissionReadinessItem)
      .filter((item) => {
        if (!item.submissionReadiness?.status) {
          return false;
        }
        return includeAll || requestedStatuses.includes(item.submissionReadiness.status);
      })
      .slice(0, limit);
    return {
      storage: "sqlite",
      statuses: includeAll ? ["ALL"] : requestedStatuses,
      totalItems: items.length,
      items
    };
  }

  reviewSubmissionReadiness(applicationId, input = {}) {
    const id = normalizePositiveInteger(applicationId);
    if (!id) {
      throw validationError("Valid application id is required");
    }
    const decision = normalizeSubmissionReadinessReviewDecision(input.decision || input.status || "");
    if (!decision) {
      throw validationError("Valid submission readiness review decision is required");
    }
    const reviewer = cleanText(input.reviewer || input.approver || "user");
    const note = cleanMultiline(input.note || input.reason || "");
    const now = new Date().toISOString();

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const application = this.database.prepare("SELECT * FROM applications WHERE id = ?").get(id);
      if (!application) {
        throw validationError(`Application not found: ${id}`);
      }
      const conversation = this.database.prepare("SELECT * FROM conversations WHERE application_id = ?").get(id);
      if (!conversation) {
        throw validationError(`Conversation not found for application: ${id}`);
      }
      const metadata = parseJsonValue(conversation.metadata_json, {});
      const submissionReadiness = metadata.submissionReadiness && typeof metadata.submissionReadiness === "object"
        ? metadata.submissionReadiness
        : null;
      if (!submissionReadiness?.status) {
        throw validationError("Submission readiness evidence is required before local review");
      }
      if (decision === "APPROVED_FOR_MANUAL_EXECUTION" && submissionReadiness.status !== "READY_FOR_MANUAL_REVIEW") {
        throw validationError(`Only READY_FOR_MANUAL_REVIEW can be approved locally: ${submissionReadiness.status}`);
      }
      const review = {
        decision,
        reviewer,
        note,
        reviewedAt: now,
        source: "submission_readiness_queue",
        noRealBossAction: true,
        noBrowserTaskCreated: true,
        applicationStatus: application.status,
        readinessStatus: submissionReadiness.status
      };
      const nextMetadata = {
        ...metadata,
        submissionReadinessReview: review,
        lastSubmissionReadinessReviewAt: now
      };
      this.database.prepare(`
        UPDATE conversations
        SET metadata_json = ?, updated_at = ?
        WHERE id = ?
      `).run(stringifyJson(nextMetadata), now, conversation.id);
      this.insertApplicationEvent(
        id,
        application.status,
        application.status,
        "SUBMISSION_READINESS_REVIEWED",
        decision.toLowerCase(),
        {
          conversationId: Number(conversation.id || 0),
          submissionReadiness,
          review,
          noRealBossAction: true,
          noBrowserTaskCreated: true
        },
        now
      );
      this.database.exec("COMMIT");
      return {
        storage: "sqlite",
        ok: true,
        applicationId: id,
        conversationId: Number(conversation.id || 0),
        decision,
        review,
        applicationStatus: application.status,
        changed: false,
        conversation: this.getConversation(Number(conversation.id || 0))
      };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  createBrowserTask(input = {}) {
    const taskType = normalizeTaskType(input.taskType || input.type);
    if (!taskType) {
      throw validationError("Valid browser task type is required");
    }
    if (isRealActionType(taskType)) {
      throw validationError(`${taskType} must be created through the real-action authorization API`);
    }

    const payload = input.payload && typeof input.payload === "object" ? input.payload : {};
    const applicationId = resolveBrowserTaskApplicationId(this.database, input, payload);
    if (applicationId !== null && (!Number.isInteger(applicationId) || applicationId <= 0)) {
      throw validationError("Valid application id is required when provided");
    }
    if (applicationId !== null) {
      const application = this.database.prepare("SELECT id FROM applications WHERE id = ?").get(applicationId);
      if (!application) {
        throw validationError(`Application not found: ${applicationId}`);
      }
    }

    const existingTask = this.findOpenBrowserTask({ applicationId, taskType, payload });
    if (existingTask) {
      return {
        ...existingTask,
        duplicate: true
      };
    }

    const now = new Date().toISOString();
    return this.createBrowserTaskWithinTransaction({
      applicationId,
      taskType,
      payload,
      expiresAt: input.expiresAt || input.expiry || "",
      maxAttempts: input.maxAttempts
    }, now);
  }

  createBrowserTaskWithinTransaction(input = {}, now = new Date().toISOString()) {
    const taskType = normalizeTaskType(input.taskType || input.type);
    if (!taskType) {
      throw validationError("Valid browser task type is required");
    }
    const payload = input.payload && typeof input.payload === "object" ? input.payload : {};
    const applicationId = resolveBrowserTaskApplicationId(this.database, input, payload);
    const expiresAt = resolveBrowserTaskExpiry(input.expiresAt || payload.expiresAt, taskType, now);
    const maxAttempts = normalizeBrowserTaskMaxAttempts(input.maxAttempts || payload.maxAttempts);
    if (isRealActionType(taskType)) {
      const authorizationId = normalizePositiveInteger(input.realActionAuthorizationId || payload.authorizationId);
      const authorization = authorizationId
        ? this.database.prepare(`
          SELECT id, application_id, action_type, status, browser_task_id
          FROM real_action_authorizations
          WHERE id = ?
        `).get(authorizationId)
        : null;
      if (
        !authorization
        || Number(authorization.application_id) !== Number(applicationId)
        || authorization.action_type !== taskType
        || authorization.status !== "ARMED"
        || authorization.browser_task_id !== null
        || maxAttempts !== 1
      ) {
        throw validationError(`${taskType} requires one matching ARMED authorization and maxAttempts = 1`);
      }
    }
    const existingTask = this.findOpenBrowserTask({ applicationId, taskType, payload });
    if (existingTask) {
      return {
        ...existingTask,
        duplicate: true
      };
    }
    const result = this.database.prepare(`
      INSERT INTO browser_tasks (
        application_id, task_type, status, payload_json, result_json, error_message,
        expires_at, attempt_count, max_attempts, last_attempt_at, claim_token,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      applicationId,
      taskType,
      "QUEUED",
      stringifyJson(payload),
      stringifyJson(null),
      "",
      expiresAt,
      0,
      maxAttempts,
      null,
      "",
      now,
      now
    );

    const browserTaskId = Number(result.lastInsertRowid);
    this.insertWorkflowEvent({
      applicationId: applicationId || null,
      sourceType: "browser_task",
      sourceId: browserTaskId,
      eventType: "BROWSER_TASK_QUEUED",
      severity: "info",
      status: "QUEUED",
      progressCurrent: 0,
      progressTotal: 1,
      message: `${taskType} queued for browser execution.`,
      metadata: {
        taskType,
        payloadSummary: summarizeWorkflowEventPayload(payload),
        noRealBossAction: browserTaskIsDryRunOnly(taskType),
        expiresAt,
        maxAttempts
      }
    }, now);
    return this.getBrowserTask(browserTaskId);
  }

  findOpenBrowserTask({ applicationId, taskType, payload = {} }) {
    const detailUrl = cleanText(payload.detailUrl || payload.url || "");
    const jobId = cleanText(payload.jobId || payload.bossJobId || extractJobId(detailUrl));
    const title = cleanText(payload.title || "");
    const company = cleanText(payload.company || "");
    const now = new Date().toISOString();

    if (applicationId !== null && applicationId !== undefined) {
      const row = this.database.prepare(`
        SELECT id
        FROM browser_tasks
        WHERE application_id = ?
          AND task_type = ?
          AND status IN ('QUEUED', 'RUNNING')
          AND (expires_at IS NULL OR expires_at = '' OR expires_at > ?)
          AND attempt_count < max_attempts
        ORDER BY id ASC
        LIMIT 1
      `).get(applicationId, taskType, now);
      return row ? this.getBrowserTask(Number(row.id)) : null;
    }

    const rows = this.database.prepare(`
      SELECT id, payload_json
      FROM browser_tasks
      WHERE application_id IS NULL
        AND task_type = ?
        AND status IN ('QUEUED', 'RUNNING')
        AND (expires_at IS NULL OR expires_at = '' OR expires_at > ?)
        AND attempt_count < max_attempts
      ORDER BY id ASC
    `).all(taskType, now);
    for (const row of rows) {
      const existingPayload = parseJsonValue(row.payload_json, {});
      const existingDetailUrl = cleanText(existingPayload.detailUrl || existingPayload.url || "");
      const existingJobId = cleanText(existingPayload.jobId || existingPayload.bossJobId || extractJobId(existingDetailUrl));
      const sameStrictKey = (jobId && existingJobId && jobId === existingJobId)
        || (detailUrl && existingDetailUrl && detailUrl === existingDetailUrl);
      const sameLooseKey = title
        && company
        && cleanText(existingPayload.title || "") === title
        && cleanText(existingPayload.company || "") === company;
      if (sameStrictKey || sameLooseKey) {
        return this.getBrowserTask(Number(row.id));
      }
    }
    return null;
  }

  getBrowserTasks(options = {}) {
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    const status = cleanText(options.status || "");
    const normalizedStatus = status ? normalizeBrowserTaskStatus(status) : "";
    if (status && !normalizedStatus) {
      throw validationError("Valid browser task status is required");
    }
    const sourceUrl = normalizeComparableUrl(options.sourceUrl || options.pageUrl || "");
    const rows = this.selectBrowserTasksForScope({ status: normalizedStatus, sourceUrl })
      .sort((left, right) => Number(right.id || 0) - Number(left.id || 0))
      .slice(0, limit);

    return {
      storage: "sqlite",
      status: normalizedStatus || null,
      scope: sourceUrl ? "sourceUrl" : "all",
      sourceUrl: sourceUrl || null,
      totalTasks: this.countBrowserTasks(normalizedStatus, { sourceUrl }),
      tasks: rows.map(rowToBrowserTask)
    };
  }

  getBrowserTask(taskId) {
    const id = Number(taskId);
    if (!Number.isInteger(id) || id <= 0) {
      throw validationError("Valid browser task id is required");
    }
    const row = this.database.prepare(`
      SELECT
        browser_tasks.*,
        jobs.source_key,
        jobs.job_id AS boss_job_id,
        jobs.title,
        jobs.company_name,
        jobs.salary,
        jobs.location,
        jobs.detail_url
      FROM browser_tasks
      LEFT JOIN applications ON applications.id = browser_tasks.application_id
      LEFT JOIN jobs ON jobs.id = applications.job_id
      WHERE browser_tasks.id = ?
    `).get(id);
    if (!row) {
      throw validationError(`Browser task not found: ${id}`);
    }
    return rowToBrowserTask(row);
  }

  getLatestBrowserTasksForApplication(applicationId, limit = 20) {
    const id = normalizePositiveInteger(applicationId);
    if (!id) {
      throw validationError("Valid application id is required");
    }
    const rows = this.database.prepare(`
      SELECT
        browser_tasks.*,
        jobs.source_key,
        jobs.job_id AS boss_job_id,
        jobs.title,
        jobs.company_name,
        jobs.salary,
        jobs.location,
        jobs.detail_url
      FROM browser_tasks
      LEFT JOIN applications ON applications.id = browser_tasks.application_id
      LEFT JOIN jobs ON jobs.id = applications.job_id
      WHERE browser_tasks.application_id = ?
      ORDER BY browser_tasks.id DESC
      LIMIT ?
    `).all(id, Math.max(1, Math.min(100, Number(limit) || 20)));
    return rows.map(rowToBrowserTask);
  }

  claimBrowserTask(options = {}) {
    const requestedTypes = normalizeTaskTypeList(options.taskTypes || options.types || options.taskType || options.type);
    const requestedTaskId = normalizeOptionalPositiveInteger(options.taskId || options.id);
    const hasTypeFilter = Array.isArray(options.taskTypes)
      || Array.isArray(options.types)
      || Boolean(options.taskType)
      || Boolean(options.type);
    if (hasTypeFilter && !requestedTypes.length) {
      throw validationError("At least one valid browser task type is required");
    }
    const requestedSourceUrl = normalizeComparableUrl(options.sourceUrl || options.pageUrl || "");

    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const expiredCount = this.expireBrowserTasksWithinTransaction(now, {
        taskTypes: requestedTypes
      });
      const whereParts = ["status = 'QUEUED'"];
      const params = [now];
      whereParts.push("(expires_at IS NULL OR expires_at = '' OR expires_at > ?)");
      whereParts.push("attempt_count < max_attempts");
      if (requestedTaskId) {
        whereParts.push("id = ?");
        params.push(requestedTaskId);
      }
      if (requestedTypes.length) {
        whereParts.push(`task_type IN (${requestedTypes.map(() => "?").join(", ")})`);
        params.push(...requestedTypes);
      }

      const rows = this.database.prepare(`
        SELECT id, payload_json
        FROM browser_tasks
        WHERE ${whereParts.join(" AND ")}
        ORDER BY id ASC
        LIMIT 100
      `).all(...params);
      const row = rows.find((candidate) => {
        if (!requestedSourceUrl) {
          return true;
        }
        const payload = parseJsonValue(candidate.payload_json, {});
        return taskPayloadMatchesSourceUrl(payload, requestedSourceUrl);
      });

      if (!row) {
        this.database.exec("COMMIT");
        return {
          storage: "sqlite",
          claimed: false,
          task: null,
          expiredCount
        };
      }

      const taskBeforeClaim = this.database.prepare("SELECT * FROM browser_tasks WHERE id = ?").get(row.id);
      const realActionClaim = this.realActionAuthorizationService.validateTaskClaimWithinTransaction(taskBeforeClaim, now);
      if (!realActionClaim.ok) {
        const rejectedResult = {
          ok: false,
          errorCode: realActionClaim.errorCode,
          message: realActionClaim.message,
          realAction: {
            clickedSend: false,
            clickCount: 0,
            preflightValidated: false,
            postSendReadback: false,
            outcome: "ABORTED"
          }
        };
        this.database.prepare(`
          UPDATE browser_tasks
          SET status = 'FAILED', result_json = ?, error_message = ?, claim_token = '', updated_at = ?
          WHERE id = ? AND status = 'QUEUED'
        `).run(stringifyJson(rejectedResult), realActionClaim.errorCode, now, row.id);
        this.insertBrowserTaskFailureEvent(taskBeforeClaim, rejectedResult, realActionClaim.errorCode, now);
        this.realActionAuthorizationService.rejectTaskBeforeClaimWithinTransaction(taskBeforeClaim, realActionClaim, now);
        this.database.exec("COMMIT");
        return {
          storage: "sqlite",
          claimed: false,
          rejected: true,
          task: this.getBrowserTask(Number(row.id)),
          errorCode: realActionClaim.errorCode,
          message: realActionClaim.message,
          expiredCount
        };
      }

      const claimToken = crypto.randomUUID();
      this.database.prepare(`
        UPDATE browser_tasks
        SET status = 'RUNNING',
            error_message = '',
            attempt_count = attempt_count + 1,
            last_attempt_at = ?,
            claim_token = ?,
            updated_at = ?
        WHERE id = ? AND status = 'QUEUED'
      `).run(now, claimToken, now, row.id);
      const claimedTask = this.database.prepare("SELECT * FROM browser_tasks WHERE id = ?").get(row.id);
      this.insertWorkflowEvent({
        applicationId: claimedTask?.application_id || null,
        sourceType: "browser_task",
        sourceId: Number(row.id),
        eventType: "BROWSER_TASK_CLAIMED",
        severity: "info",
        status: "RUNNING",
        progressCurrent: 0,
        progressTotal: 1,
        message: `${claimedTask?.task_type || "Browser task"} claimed by browser executor.`,
        metadata: {
          taskType: claimedTask?.task_type || "",
          sourceUrl: requestedSourceUrl || "",
          attemptCount: Number(claimedTask?.attempt_count || 0),
          maxAttempts: Number(claimedTask?.max_attempts || 0),
          expiresAt: claimedTask?.expires_at || ""
        }
      }, now);

      this.database.exec("COMMIT");
      return {
        storage: "sqlite",
        claimed: true,
        claimedAt: now,
        expiredCount,
        task: this.getBrowserTask(Number(row.id))
      };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  transitionBrowserTask(taskId, transition = {}) {
    const id = Number(taskId);
    if (!Number.isInteger(id) || id <= 0) {
      throw validationError("Valid browser task id is required");
    }

    const toStatus = normalizeBrowserTaskStatus(transition.toStatus || transition.status);
    if (!toStatus) {
      throw validationError("Target browser task status is required");
    }

    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.database.prepare("SELECT * FROM browser_tasks WHERE id = ?").get(id);
      if (!existing) {
        throw validationError(`Browser task not found: ${id}`);
      }
      const result = Object.prototype.hasOwnProperty.call(transition, "result")
        ? transition.result
        : parseJsonValue(existing.result_json, null);
      const errorMessage = cleanText(transition.errorMessage || transition.error || "");
      const claimToken = cleanText(transition.claimToken || transition.leaseToken || "");

      if (existing.status === toStatus) {
        const sameResult = stableStringify(parseJsonValue(existing.result_json, null)) === stableStringify(result);
        const sameError = cleanText(existing.error_message || "") === (errorMessage || cleanText(existing.error_message || ""));
        if (!sameResult || !sameError) {
          throw conflictError(`Browser task callback conflicts with terminal result: ${id}`);
        }
        this.database.exec("COMMIT");
        return {
          ok: true,
          taskId: id,
          fromStatus: existing.status,
          toStatus,
          changed: false,
          idempotent: true,
          updatedAt: existing.updated_at || now,
          task: this.getBrowserTask(id)
        };
      }
      if (!canTransitionBrowserTask(existing.status, toStatus)) {
        throw validationError(`Invalid browser task transition: ${existing.status} -> ${toStatus}`);
      }
      if (existing.status === "RUNNING" && Number(existing.attempt_count || 0) > 1 && !claimToken) {
        throw conflictError("Retry callback requires the current browser task claim token");
      }
      if (existing.status === "RUNNING" && isRealActionType(existing.task_type) && !claimToken) {
        throw conflictError("Real-action callback requires the current browser task claim token");
      }
      if (claimToken && claimToken !== cleanText(existing.claim_token || "")) {
        throw conflictError("Stale browser task callback claim token");
      }
      if (browserTaskIsExpired(existing, now) && !new Set(["FAILED", "CANCELED"]).has(toStatus)) {
        const expiredResult = {
          ok: false,
          errorCode: "TASK_EXPIRED",
          message: "Browser task expired before callback completion.",
          expiresAt: existing.expires_at || ""
        };
        this.markBrowserTaskExpiredWithinTransaction(existing, expiredResult, now);
        this.database.exec("COMMIT");
        return {
          ok: false,
          taskId: id,
          fromStatus: existing.status,
          toStatus: "FAILED",
          changed: true,
          expired: true,
          idempotent: false,
          updatedAt: now,
          task: this.getBrowserTask(id)
        };
      }

      this.database.prepare(`
        UPDATE browser_tasks
        SET status = ?, result_json = ?, error_message = ?, claim_token = '', updated_at = ?
        WHERE id = ?
      `).run(
        toStatus,
        stringifyJson(result),
        errorMessage || existing.error_message || "",
        now,
        id
      );

      if (toStatus === "FAILED") {
        this.insertBrowserTaskFailureEvent(existing, result, errorMessage, now);
      }
      if (isRealActionType(existing.task_type)) {
        this.realActionAuthorizationService.applyBrowserTaskResultWithinTransaction(existing, result, toStatus, now);
      } else if (toStatus === "SUCCEEDED") {
        this.applySuccessfulBrowserTaskResult(existing, result, now);
      }
      this.insertWorkflowEvent({
        applicationId: existing.application_id || null,
        sourceType: "browser_task",
        sourceId: id,
        eventType: toStatus === "FAILED" ? "BROWSER_TASK_FAILED" : `BROWSER_TASK_${toStatus}`,
        severity: toStatus === "FAILED" ? "error" : toStatus === "CANCELED" ? "warning" : "info",
        status: toStatus,
        progressCurrent: toStatus === "RUNNING" ? 0 : 1,
        progressTotal: 1,
        message: toStatus === "FAILED"
          ? `${existing.task_type} failed in browser executor.`
          : `${existing.task_type} moved to ${toStatus}.`,
        errorCode: toStatus === "FAILED" ? normalizeBrowserFailureCode(
          result?.errorCode
            || result?.reason
            || result?.statusReason
            || errorMessage
        ) : "",
        errorMessage: toStatus === "FAILED" ? (errorMessage || result?.message || `${existing.task_type} failed`) : "",
        metadata: {
          taskType: existing.task_type,
          fromStatus: existing.status,
          toStatus,
          resultSummary: summarizeWorkflowEventPayload(result),
          dryRunOnly: browserTaskIsDryRunOnly(existing.task_type)
        }
      }, now);

      this.database.exec("COMMIT");
      return {
        ok: true,
        taskId: id,
        fromStatus: existing.status,
        toStatus,
        changed: existing.status !== toStatus,
        idempotent: false,
        updatedAt: now,
        task: this.getBrowserTask(id)
      };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  expireBrowserTasksWithinTransaction(now = new Date().toISOString(), options = {}) {
    const taskTypes = normalizeTaskTypeList(options.taskTypes || options.taskType || []);
    const whereParts = [
      "status IN ('QUEUED', 'RUNNING')",
      "expires_at IS NOT NULL",
      "expires_at != ''",
      "expires_at <= ?"
    ];
    const params = [now];
    if (taskTypes.length) {
      whereParts.push(`task_type IN (${taskTypes.map(() => "?").join(", ")})`);
      params.push(...taskTypes);
    }
    const rows = this.database.prepare(`
      SELECT *
      FROM browser_tasks
      WHERE ${whereParts.join(" AND ")}
      ORDER BY id ASC
    `).all(...params);
    for (const row of rows) {
      this.markBrowserTaskExpiredWithinTransaction(row, {
        ok: false,
        errorCode: "TASK_EXPIRED",
        message: "Browser task expired before it was claimed or completed.",
        expiresAt: row.expires_at || ""
      }, now);
    }
    return rows.length;
  }

  markBrowserTaskExpiredWithinTransaction(taskRow, result, now) {
    this.database.prepare(`
      UPDATE browser_tasks
      SET status = 'FAILED', result_json = ?, error_message = 'TASK_EXPIRED', claim_token = '', updated_at = ?
      WHERE id = ?
    `).run(stringifyJson(result), now, taskRow.id);
    this.insertBrowserTaskFailureEvent(taskRow, result, "TASK_EXPIRED", now);
    if (isRealActionType(taskRow.task_type)) {
      this.realActionAuthorizationService.applyBrowserTaskResultWithinTransaction(taskRow, {
        ...result,
        realAction: {
          clickedSend: false,
          clickCount: 0,
          preflightValidated: false,
          postSendReadback: false,
          outcome: "ABORTED"
        }
      }, "FAILED", now);
    }
    this.insertWorkflowEvent({
      applicationId: taskRow.application_id || null,
      sourceType: "browser_task",
      sourceId: Number(taskRow.id),
      eventType: "BROWSER_TASK_EXPIRED",
      severity: "warning",
      status: "FAILED",
      progressCurrent: 1,
      progressTotal: 1,
      message: `${taskRow.task_type} expired before completion.`,
      errorCode: "TASK_EXPIRED",
      errorMessage: "Browser task expired before completion.",
      metadata: {
        taskType: taskRow.task_type,
        expiresAt: taskRow.expires_at || "",
        attemptCount: Number(taskRow.attempt_count || 0),
        maxAttempts: Number(taskRow.max_attempts || 0)
      }
    }, now);
  }

  applySuccessfulBrowserTaskResult(taskRow, result = {}, now = new Date().toISOString()) {
    const taskType = normalizeTaskType(taskRow.task_type || "");
    if (!new Set(["REFRESH_CONVERSATION", "CHECK_RESUME_UNLOCK", "UPLOAD_RESUME", "SUBMIT_APPLICATION"]).has(taskType)) {
      return;
    }
    const applicationId = Number(taskRow.application_id || 0);
    if (!applicationId) {
      return;
    }
    const application = this.database.prepare("SELECT * FROM applications WHERE id = ?").get(applicationId);
    if (!application) {
      return;
    }
    const payload = parseJsonValue(taskRow.payload_json, {});
    const conversation = result?.conversation && typeof result.conversation === "object" ? result.conversation : {};
    const resumeUnlock = result?.resumeUnlock && typeof result.resumeUnlock === "object" ? result.resumeUnlock : {};
    const uploadDryRun = result?.uploadDryRun && typeof result.uploadDryRun === "object" ? result.uploadDryRun : {};
    const submitDryRun = result?.submitDryRun && typeof result.submitDryRun === "object" ? result.submitDryRun : {};
    const status = cleanText(conversation.status || resumeUnlock.status || uploadDryRun.status || submitDryRun.status || taskType).toUpperCase();
    const nextConversationId = this.ensureConversationWithinTransaction(applicationId, {
      status: status || taskType,
      recruiterName: conversation.recruiterName || payload.recruiterName || "",
      conversationUrl: conversation.conversationUrl || result?.page?.url || payload.conversationUrl || "",
      metadata: {
        lastReadOnlyRefreshAt: now,
        lastBrowserTaskId: Number(taskRow.id || 0),
        lastBrowserTaskType: taskType,
        lastResult: {
          conversation,
          resumeUnlock,
          uploadDryRun,
          submitDryRun,
          page: result?.page || null,
          diagnostics: result?.diagnostics || null
        }
      }
    }, now);
    const archivedMessages = this.archiveConversationMessagesWithinTransaction({
      conversationId: nextConversationId,
      applicationId,
      provider: "browser_executor",
      browserTaskId: Number(taskRow.id || 0),
      messages: [
        ...(Array.isArray(conversation.messages) ? conversation.messages : []),
        ...(Array.isArray(conversation.recentMessages) ? conversation.recentMessages : [])
      ]
    }, now);
    const communicationAssessment = this.assessCommunicationWithinTransaction({
      conversationId: nextConversationId,
      applicationId,
      conversation,
      resumeUnlock
    });
    const existingConversationMetadata = parseJsonValue(
      this.database.prepare("SELECT metadata_json FROM conversations WHERE id = ?").get(nextConversationId)?.metadata_json,
      {}
    );
    const nextUploadDryRun = taskType === "UPLOAD_RESUME" ? uploadDryRun : existingConversationMetadata.lastUploadDryRun || null;
    const nextSubmitDryRun = taskType === "SUBMIT_APPLICATION" ? submitDryRun : existingConversationMetadata.lastSubmitDryRun || null;
    const submissionReadiness = assessSubmissionReadiness({
      applicationStatus: application.status,
      communicationAssessment,
      resumeUnlock,
      uploadDryRun: nextUploadDryRun,
      submitDryRun: nextSubmitDryRun
    });
    const nextActionRecommendation = recommendNextConversationAction({
      applicationStatus: application.status,
      communicationAssessment,
      resumeUnlock,
      submissionReadiness
    });
    this.database.prepare(`
      UPDATE conversations
      SET metadata_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      stringifyJson({
        ...existingConversationMetadata,
        communicationAssessment,
        nextActionRecommendation,
        submissionReadiness,
        lastUploadDryRun: nextUploadDryRun,
        lastSubmitDryRun: nextSubmitDryRun,
        lastSubmissionReadinessAt: now,
        lastCommunicationAssessmentAt: now
      }),
      now,
      nextConversationId
    );

    let toApplicationStatus = "";
    let reason = "";
    if (taskType === "REFRESH_CONVERSATION" && conversation.chatOpened) {
      toApplicationStatus = "CHAT_OPENED";
      reason = "conversation_read_only_refresh";
    }
    if ((taskType === "CHECK_RESUME_UNLOCK" || taskType === "REFRESH_CONVERSATION") && resumeUnlock.unlocked) {
      toApplicationStatus = "RESUME_UNLOCKED";
      reason = "resume_unlock_detected";
    }
    if (toApplicationStatus && canTransitionApplication(application.status, toApplicationStatus)) {
      this.transitionApplicationWithinTransaction(applicationId, {
        toStatus: toApplicationStatus,
        eventType: taskType,
        reason,
        evidence: {
          type: "browser_task_result",
          sourceId: Number(taskRow.id || 0)
        },
        metadata: {
          browserTaskId: Number(taskRow.id || 0),
          conversationId: nextConversationId,
          readOnly: true,
          archivedMessageCount: archivedMessages.inserted,
          communicationAssessment,
          nextActionRecommendation,
          conversation,
          resumeUnlock
        },
        now
      });
    }
    if (taskType === "UPLOAD_RESUME" || taskType === "SUBMIT_APPLICATION") {
      this.insertApplicationEvent(
        applicationId,
        application.status,
        application.status,
        "SUBMISSION_READINESS_ASSESSED",
        cleanText(submissionReadiness.reason || submissionReadiness.status || "submission_readiness_assessed").toLowerCase(),
        {
          browserTaskId: Number(taskRow.id || 0),
          conversationId: nextConversationId,
          readOnly: true,
          dryRun: true,
          noRealBossAction: true,
          submissionReadiness,
          uploadDryRun: nextUploadDryRun,
          submitDryRun: nextSubmitDryRun
        },
        now
      );
    }
    if (taskType === "UPLOAD_RESUME") {
      this.insertApplicationEvent(
        applicationId,
        application.status,
        application.status,
        "UPLOAD_RESUME_DRY_RUN",
        uploadDryRun.fileInputUsable || uploadDryRun.uploadActionVisible ? "upload_resume_dry_run_ready" : "upload_resume_dry_run_not_found",
        {
          browserTaskId: Number(taskRow.id || 0),
          conversationId: nextConversationId,
          readOnly: true,
          dryRun: true,
          noRealBossAction: true,
          fileSelected: false,
          uploaded: false,
          submitted: false,
          uploadDryRun
        },
        now
      );
    }
    if (taskType === "SUBMIT_APPLICATION") {
      const submitReady = Boolean(submitDryRun.submitActionVisible && !submitDryRun.lockedSignalVisible);
      this.insertApplicationEvent(
        applicationId,
        application.status,
        application.status,
        "SUBMIT_APPLICATION_DRY_RUN",
        submitReady ? "submit_application_dry_run_ready" : "submit_application_dry_run_not_ready",
        {
          browserTaskId: Number(taskRow.id || 0),
          conversationId: nextConversationId,
          readOnly: true,
          dryRun: true,
          noRealBossAction: true,
          clickedSubmit: false,
          confirmed: false,
          submitted: false,
          uploaded: false,
          submitDryRun
        },
        now
      );
    }
  }

  archiveConversationMessagesWithinTransaction(input = {}, now = new Date().toISOString()) {
    const conversationId = normalizePositiveInteger(input.conversationId);
    const applicationId = normalizePositiveInteger(input.applicationId);
    if (!conversationId || !applicationId) {
      return { inserted: 0, skipped: 0 };
    }
    const provider = cleanText(input.provider || "browser_executor");
    const browserTaskId = normalizeOptionalPositiveInteger(input.browserTaskId);
    const candidates = normalizeConversationMessageSnapshots(input.messages || []);
    if (!candidates.length) {
      return { inserted: 0, skipped: 0 };
    }
    const existingRows = this.database.prepare(`
      SELECT direction, message_text, metadata_json
      FROM messages
      WHERE conversation_id = ?
    `).all(conversationId);
    const seen = new Set(existingRows.map((row) => conversationMessageArchiveKey({
      direction: row.direction,
      text: row.message_text,
      timestamp: parseJsonValue(row.metadata_json, {}).sourceTimestamp || ""
    })));
    const insert = this.database.prepare(`
      INSERT INTO messages (
        conversation_id, application_id, resume_version_id, agent_run_id,
        direction, channel, status, message_text, provider, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let inserted = 0;
    let skipped = 0;
    for (const message of candidates) {
      const key = conversationMessageArchiveKey(message);
      if (!key || seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);
      insert.run(
        conversationId,
        applicationId,
        null,
        null,
        message.direction,
        "boss_chat",
        "CAPTURED",
        message.text,
        provider,
        stringifyJson({
          source: "REFRESH_CONVERSATION",
          browserTaskId: browserTaskId || null,
          sourceTimestamp: message.timestamp || "",
          confidence: message.confidence || null,
          readOnly: true
        }),
        now,
        now
      );
      inserted += 1;
    }
    return { inserted, skipped };
  }

  assessCommunicationWithinTransaction(input = {}) {
    const conversationId = normalizePositiveInteger(input.conversationId);
    const applicationId = normalizePositiveInteger(input.applicationId);
    if (!conversationId || !applicationId) {
      return assessCommunicationState([], input.conversation || {}, input.resumeUnlock || {});
    }
    const rows = this.database.prepare(`
      SELECT direction, status, channel, message_text, metadata_json, created_at
      FROM messages
      WHERE application_id = ?
        AND conversation_id = ?
        AND channel IN ('boss_chat', 'boss_greeting')
      ORDER BY datetime(created_at) ASC, id ASC
      LIMIT 80
    `).all(applicationId, conversationId);
    return assessCommunicationState(rows.map(rowToCommunicationMessage), input.conversation || {}, input.resumeUnlock || {});
  }

  cancelBrowserTasks(options = {}) {
    const taskTypes = normalizeTaskTypeList(options.taskTypes || options.types || options.taskType || options.type);
    const statuses = normalizeBrowserTaskStatusList(options.statuses || options.status || ["QUEUED", "RUNNING"]);
    const sourceUrl = normalizeComparableUrl(options.sourceUrl || options.pageUrl || "");
    const reason = cleanText(options.reason || "USER_CANCELED");
    if (!statuses.length) {
      throw validationError("At least one valid browser task status is required");
    }

    const candidates = this.selectBrowserTasksForScope({ statuses, taskTypes, sourceUrl });
    const cancelableRows = candidates.filter((row) => (
      canTransitionBrowserTask(row.status, "CANCELED")
      && !(isRealActionType(row.task_type) && row.status === "RUNNING")
    ));
    const now = new Date().toISOString();

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const stmt = this.database.prepare(`
        UPDATE browser_tasks
        SET status = 'CANCELED', error_message = ?, claim_token = '', updated_at = ?
        WHERE id = ?
      `);
      for (const row of cancelableRows) {
        stmt.run(reason, now, row.id);
        if (isRealActionType(row.task_type)) {
          this.realActionAuthorizationService.applyBrowserTaskResultWithinTransaction(row, {
            ok: false,
            errorCode: "REAL_ACTION_CANCELED",
            message: reason,
            realAction: {
              clickedSend: false,
              clickCount: 0,
              preflightValidated: false,
              postSendReadback: false,
              outcome: "ABORTED"
            }
          }, "CANCELED", now);
        }
        this.insertWorkflowEvent({
          applicationId: row.application_id || null,
          sourceType: "browser_task",
          sourceId: Number(row.id),
          eventType: "BROWSER_TASK_CANCELED",
          severity: "warning",
          status: "CANCELED",
          progressCurrent: 1,
          progressTotal: 1,
          message: `${row.task_type} canceled.`,
          errorCode: "BROWSER_TASK_CANCELED",
          errorMessage: reason,
          metadata: {
            taskType: row.task_type,
            reason,
            sourceUrl: sourceUrl || ""
          }
        }, now);
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }

    return {
      storage: "sqlite",
      ok: true,
      action: "cancel",
      scope: sourceUrl ? "sourceUrl" : "all",
      sourceUrl: sourceUrl || null,
      matched: candidates.length,
      changed: cancelableRows.length,
      skipped: candidates.length - cancelableRows.length,
      reason,
      updatedAt: now,
      counts: this.getBrowserTaskDiagnostics({ sourceUrl, limit: 10 }).counts,
      tasks: cancelableRows.slice(0, 20).map(rowToBrowserTask)
    };
  }

  requeueBrowserTasks(options = {}) {
    const taskTypes = normalizeTaskTypeList(options.taskTypes || options.types || options.taskType || options.type);
    const statuses = normalizeBrowserTaskStatusList(options.statuses || options.status || ["FAILED", "CANCELED"]);
    const sourceUrl = normalizeComparableUrl(options.sourceUrl || options.pageUrl || "");
    const reason = cleanText(options.reason || "USER_RETRY");
    const refreshExpiry = Boolean(options.refreshExpiry);
    if (!statuses.length) {
      throw validationError("At least one valid browser task status is required");
    }

    const candidates = this.selectBrowserTasksForScope({ statuses, taskTypes, sourceUrl });
    const now = new Date().toISOString();
    const requeueableRows = candidates.filter((row) => (
      canTransitionBrowserTask(row.status, "QUEUED")
      && !isRealActionType(row.task_type)
      && Number(row.attempt_count || 0) < Number(row.max_attempts || 3)
      && (!browserTaskIsExpired(row, now) || refreshExpiry)
    ));

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const stmt = this.database.prepare(`
        UPDATE browser_tasks
        SET status = 'QUEUED', error_message = '', expires_at = ?, claim_token = '', updated_at = ?
        WHERE id = ?
      `);
      for (const row of requeueableRows) {
        const expiresAt = refreshExpiry
          ? resolveBrowserTaskExpiry("", row.task_type, now)
          : row.expires_at || null;
        stmt.run(expiresAt, now, row.id);
        this.insertWorkflowEvent({
          applicationId: row.application_id || null,
          sourceType: "browser_task",
          sourceId: Number(row.id),
          eventType: "BROWSER_TASK_REQUEUED",
          severity: "info",
          status: "QUEUED",
          progressCurrent: 0,
          progressTotal: 1,
          message: `${row.task_type} requeued for retry.`,
          metadata: {
            taskType: row.task_type,
            previousStatus: row.status,
            reason,
            sourceUrl: sourceUrl || "",
            attemptCount: Number(row.attempt_count || 0),
            maxAttempts: Number(row.max_attempts || 0),
            expiresAt,
            refreshExpiry
          }
        }, now);
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }

    return {
      storage: "sqlite",
      ok: true,
      action: "requeue",
      scope: sourceUrl ? "sourceUrl" : "all",
      sourceUrl: sourceUrl || null,
      matched: candidates.length,
      changed: requeueableRows.length,
      skipped: candidates.length - requeueableRows.length,
      retryExhausted: candidates.filter((row) => Number(row.attempt_count || 0) >= Number(row.max_attempts || 3)).length,
      expired: candidates.filter((row) => browserTaskIsExpired(row, now)).length,
      reason,
      updatedAt: now,
      counts: this.getBrowserTaskDiagnostics({ sourceUrl, limit: 10 }).counts,
      tasks: requeueableRows.slice(0, 20).map(rowToBrowserTask)
    };
  }

  selectBrowserTasksForScope(options = {}) {
    const statuses = normalizeBrowserTaskStatusList(options.statuses || options.status || "");
    const taskTypes = normalizeTaskTypeList(options.taskTypes || options.taskType || "");
    const sourceUrl = normalizeComparableUrl(options.sourceUrl || options.pageUrl || "");
    const whereParts = [];
    const params = [];
    if (statuses.length) {
      whereParts.push(`browser_tasks.status IN (${statuses.map(() => "?").join(", ")})`);
      params.push(...statuses);
    }
    if (taskTypes.length) {
      whereParts.push(`browser_tasks.task_type IN (${taskTypes.map(() => "?").join(", ")})`);
      params.push(...taskTypes);
    }
    const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
    const rows = this.database.prepare(`
      SELECT
        browser_tasks.*,
        jobs.source_key,
        jobs.job_id AS boss_job_id,
        jobs.title,
        jobs.company_name,
        jobs.salary,
        jobs.location,
        jobs.detail_url
      FROM browser_tasks
      LEFT JOIN applications ON applications.id = browser_tasks.application_id
      LEFT JOIN jobs ON jobs.id = applications.job_id
      ${whereSql}
      ORDER BY browser_tasks.id ASC
    `).all(...params);
    if (!sourceUrl) {
      return rows;
    }
    return rows.filter((row) => taskPayloadMatchesSourceUrl(parseJsonValue(row.payload_json, {}), sourceUrl));
  }

  transitionApplication(applicationId, transition = {}) {
    return this.applicationTransitionService.transition(applicationId, transition);
  }

  transitionApplicationWithinTransaction(applicationId, transition = {}) {
    return this.applicationTransitionService.transitionWithinTransaction(applicationId, transition);
  }

  getRealActionPolicy(options = {}) {
    return this.realActionAuthorizationService.getPolicy(options);
  }

  updateRealActionPolicy(input = {}) {
    return this.realActionAuthorizationService.updatePolicy(input);
  }

  armRealActionAuthorization(input = {}) {
    return this.realActionAuthorizationService.armAuthorization(input);
  }

  queueRealActionAuthorization(authorizationId, input = {}) {
    return this.realActionAuthorizationService.queueAuthorization(authorizationId, input);
  }

  revokeRealActionAuthorization(authorizationId, input = {}) {
    return this.realActionAuthorizationService.revokeAuthorization(authorizationId, input);
  }

  getRealActionAuthorization(authorizationId) {
    return this.realActionAuthorizationService.getAuthorization(authorizationId);
  }

  getRealActionAuthorizations(options = {}) {
    return this.realActionAuthorizationService.listAuthorizations(options);
  }

  getMissingDescriptions(options = {}) {
    const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));
    const minDescriptionLength = Math.max(1, Math.min(2000, Number(options.minDescriptionLength) || 80));
    const total = this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM jobs
      WHERE LENGTH(TRIM(COALESCE(description, ''))) < ?
        AND LENGTH(TRIM(COALESCE(detail_url, ''))) > 0
    `).get(minDescriptionLength).count;
    const rows = this.database.prepare(`
      SELECT
        jobs.*,
        companies.name AS company_table_name,
        LENGTH(TRIM(COALESCE(jobs.description, ''))) AS description_length
      FROM jobs
      LEFT JOIN companies ON companies.id = jobs.company_id
      WHERE LENGTH(TRIM(COALESCE(jobs.description, ''))) < ?
        AND LENGTH(TRIM(COALESCE(jobs.detail_url, ''))) > 0
      ORDER BY
        CASE WHEN LENGTH(TRIM(COALESCE(jobs.description, ''))) = 0 THEN 0 ELSE 1 END,
        datetime(jobs.last_seen_at) DESC,
        jobs.id DESC
      LIMIT ?
    `).all(minDescriptionLength, limit);

    return {
      storage: "sqlite",
      minDescriptionLength,
      totalMissingDescriptions: Number(total || 0),
      jobs: rows.map(rowToMissingDescriptionJob)
    };
  }

  getJobKeys(options = {}) {
    const minDescriptionLength = Math.max(1, Math.min(2000, Number(options.minDescriptionLength) || 50));
    const describedOnly = Boolean(options.describedOnly);
    const rows = describedOnly
      ? this.database.prepare(`
        SELECT source_key, job_id, title, company_name, salary, location, detail_url,
          LENGTH(TRIM(COALESCE(description, ''))) AS description_length
        FROM jobs
        WHERE LENGTH(TRIM(COALESCE(description, ''))) >= ?
      `).all(minDescriptionLength)
      : this.database.prepare(`
        SELECT source_key, job_id, title, company_name, salary, location, detail_url,
          LENGTH(TRIM(COALESCE(description, ''))) AS description_length
        FROM jobs
      `).all();

    const keys = new Set();
    for (const row of rows) {
      for (const key of rowToJobKeys(row)) {
        keys.add(key);
      }
    }

    return {
      storage: "sqlite",
      describedOnly,
      minDescriptionLength,
      totalJobs: rows.length,
      keyCount: keys.size,
      keys: Array.from(keys)
    };
  }

  importLegacyJsonIfNeeded() {
    if (process.env.BOSS_SKIP_LEGACY_IMPORT === "1") {
      return;
    }
    if (this.countJobs() > 0 || !fs.existsSync(this.legacyStorePath)) {
      return;
    }

    const legacy = JSON.parse(fs.readFileSync(this.legacyStorePath, "utf8"));
    if (!Array.isArray(legacy.jobs) || !legacy.jobs.length) {
      return;
    }

    this.syncJobs({
      source: legacy.lastBatch?.source || "legacy-json-import",
      exportedAt: legacy.updatedAt || legacy.lastBatch?.exportedAt || new Date().toISOString(),
      stats: {
        legacyTotalJobs: legacy.jobs.length,
        legacyVersion: legacy.version || 1
      },
      pages: {},
      jobs: legacy.jobs
    });
  }

  insertCaptureBatch(payload, receivedJobs, now) {
    const pages = payload.pages && typeof payload.pages === "object" ? payload.pages : {};
    const result = this.database.prepare(`
      INSERT INTO capture_batches (
        source, exported_at, received_at, received_jobs, page_count, stats_json, pages_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cleanText(payload.source) || "unknown",
      cleanText(payload.exportedAt) || now,
      now,
      receivedJobs,
      Object.keys(pages).length,
      stringifyJson(payload.stats || {}),
      stringifyJson(pages),
      now
    );
    return Number(result.lastInsertRowid);
  }

  upsertJob(incoming, batchId, now) {
    const existingRow = this.database.prepare("SELECT * FROM jobs WHERE source_key = ?").get(incoming.sourceKey);
    const existing = existingRow ? rowToJob(existingRow) : null;
    const merged = existing ? mergeJob(existing, incoming, now) : incoming;
    const companyId = this.upsertCompany(merged.company, now);

    let jobPk;
    if (existingRow) {
      jobPk = existingRow.id;
      this.database.prepare(`
        UPDATE jobs SET
          job_id = ?,
          title = ?,
          salary = ?,
          company_id = ?,
          company_name = ?,
          location = ?,
          experience = ?,
          education = ?,
          recruiter = ?,
          tags_json = ?,
          welfare_json = ?,
          description = ?,
          detail_url = ?,
          source_url = ?,
          page_title = ?,
          raw_text = ?,
          first_seen_at = ?,
          last_seen_at = ?,
          captured_at = ?,
          sync_source = ?,
          updated_at = ?
        WHERE id = ?
      `).run(...jobColumns(merged, companyId, now), jobPk);
    } else {
      const result = this.database.prepare(`
        INSERT INTO jobs (
          source_key, job_id, title, salary, company_id, company_name, location, experience, education,
          recruiter, tags_json, welfare_json, description, detail_url, source_url, page_title, raw_text,
          first_seen_at, last_seen_at, captured_at, sync_source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        merged.sourceKey,
        ...jobColumns(merged, companyId, now),
        now
      );
      jobPk = Number(result.lastInsertRowid);
    }

    this.replaceListValues("job_tags", "tag", jobPk, merged.tags);
    this.replaceListValues("job_welfare", "welfare", jobPk, merged.welfare);
    this.insertJobSnapshot(jobPk, batchId, incoming, now);
    this.ensureApplication(jobPk, incoming, batchId, now);
    return jobPk;
  }

  ensureApplication(jobPk, job, batchId, now) {
    const targetStatus = hasUsableDescription(job) ? "DETAIL_CAPTURED" : "LIST_CAPTURED";
    const existing = this.database.prepare("SELECT * FROM applications WHERE job_id = ?").get(jobPk);
    if (!existing) {
      const result = this.database.prepare(`
        INSERT INTO applications (job_id, status, status_reason, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(jobPk, targetStatus, "job_sync", now, now);
      this.insertApplicationEvent(Number(result.lastInsertRowid), null, targetStatus, "JOB_SYNCED", "job_sync", {
        batchId,
        descriptionLength: String(job.description || "").length
      }, now);
      return;
    }

    const nextStatus = advanceApplicationStatus(existing.status, targetStatus);
    if (nextStatus === existing.status) {
      return;
    }

    this.transitionApplicationWithinTransaction(existing.id, {
      toStatus: nextStatus,
      eventType: "JOB_SYNCED",
      reason: "job_sync",
      evidence: {
        type: "job_sync",
        sourceType: "capture_batch",
        sourceId: batchId
      },
      metadata: {
        batchId,
        descriptionLength: String(job.description || "").length
      },
      idempotencyKey: `job-sync:${batchId}:${existing.id}:${nextStatus}`,
      now
    });
  }

  backfillApplicationsIfNeeded() {
    const rows = this.database.prepare(`
      SELECT
        jobs.id,
        jobs.description
      FROM jobs
      LEFT JOIN applications ON applications.job_id = jobs.id
      WHERE applications.id IS NULL
    `).all();
    if (!rows.length) {
      return;
    }

    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const row of rows) {
        const status = hasUsableDescription({ description: row.description }) ? "DETAIL_CAPTURED" : "LIST_CAPTURED";
        const result = this.database.prepare(`
          INSERT INTO applications (job_id, status, status_reason, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(row.id, status, "schema_backfill", now, now);
        this.insertApplicationEvent(Number(result.lastInsertRowid), null, status, "APPLICATION_BACKFILLED", "schema_backfill", {
          descriptionLength: String(row.description || "").length
        }, now);
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  insertApplicationEvent(applicationId, fromStatus, toStatus, eventType, reason, metadata, now, idempotencyKey = "") {
    if (applicationId && typeof applicationId === "object") {
      const event = applicationId;
      applicationId = event.applicationId;
      fromStatus = event.fromStatus;
      toStatus = event.toStatus;
      eventType = event.eventType;
      reason = event.reason;
      metadata = event.metadata;
      now = event.now;
      idempotencyKey = event.idempotencyKey;
    }
    const result = this.database.prepare(`
      INSERT INTO application_events (
        application_id, from_status, to_status, event_type, reason, metadata_json, idempotency_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      applicationId,
      fromStatus || null,
      toStatus,
      eventType,
      reason || "",
      stringifyJson(metadata || {}),
      cleanText(idempotencyKey || ""),
      now
    );
    return Number(result.lastInsertRowid);
  }

  upsertCompany(name, now) {
    const companyName = cleanText(name);
    if (!companyName) {
      return null;
    }

    const existing = this.database.prepare("SELECT id FROM companies WHERE name = ?").get(companyName);
    if (existing) {
      this.database.prepare("UPDATE companies SET updated_at = ? WHERE id = ?").run(now, existing.id);
      return existing.id;
    }

    const result = this.database.prepare(`
      INSERT INTO companies (name, created_at, updated_at)
      VALUES (?, ?, ?)
    `).run(companyName, now, now);
    return Number(result.lastInsertRowid);
  }

  replaceListValues(tableName, columnName, jobPk, values) {
    this.database.prepare(`DELETE FROM ${tableName} WHERE job_id = ?`).run(jobPk);
    const stmt = this.database.prepare(`INSERT OR IGNORE INTO ${tableName} (job_id, ${columnName}) VALUES (?, ?)`);
    for (const value of normalizeArray(values)) {
      stmt.run(jobPk, value);
    }
  }

  insertJobSnapshot(jobPk, batchId, job, now) {
    this.database.prepare(`
      INSERT INTO job_snapshots (
        job_id, batch_id, source_key, title, company_name, detail_url, description_length, payload_json, captured_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      jobPk,
      batchId,
      job.sourceKey,
      job.title,
      job.company,
      job.detailUrl,
      String(job.description || "").length,
      stringifyJson(job),
      job.capturedAt || now,
      now
    );
  }

  insertCaptureQuality(batchId, payload, incoming, now) {
    const pages = payload.pages && typeof payload.pages === "object" ? payload.pages : {};
    const pageValues = Object.values(pages);
    const storedJobs = this.countJobs();
    const describedJobs = incoming.filter(hasUsableDescription).length;
    const requiredCompleteJobs = incoming.filter(hasRequiredFields).length;
    const invalidJobs = Array.isArray(payload.jobs) ? payload.jobs.length - incoming.length : 0;
    const selectorCounts = mergeSelectorCounts(pageValues);
    const missingFields = summarizeMissingFields(incoming);
    const searchContext = summarizeSearchContext(pageValues);

    this.database.prepare(`
      INSERT INTO capture_quality (
        batch_id, page_count, received_jobs, valid_jobs, stored_jobs, described_jobs, description_coverage,
        required_complete_jobs, required_field_coverage, invalid_jobs, login_required_pages, captcha_required_pages,
        selector_counts_json, missing_fields_json, search_context_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      batchId,
      Object.keys(pages).length,
      Array.isArray(payload.jobs) ? payload.jobs.length : 0,
      incoming.length,
      storedJobs,
      describedJobs,
      ratio(describedJobs, incoming.length),
      requiredCompleteJobs,
      ratio(requiredCompleteJobs, incoming.length),
      Math.max(0, invalidJobs),
      pageValues.filter((page) => page?.loginRequired || page?.diagnostics?.loginRequired).length,
      pageValues.filter((page) => page?.captchaRequired || page?.diagnostics?.captchaRequired).length,
      stringifyJson(selectorCounts),
      stringifyJson(missingFields),
      stringifyJson(searchContext),
      now
    );
  }

  insertBrowserEvents(batchId, payload, now) {
    const pages = payload.pages && typeof payload.pages === "object" ? payload.pages : {};
    const stmt = this.database.prepare(`
      INSERT INTO browser_events (
        batch_id, event_type, severity, page_url, page_title, message, details_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const page of Object.values(pages)) {
      const diagnostics = page?.diagnostics || {};
      const pageUrl = cleanText(page?.url || diagnostics.url || "");
      const pageTitle = cleanText(page?.title || diagnostics.title || "");
      const selectorCounts = page?.selectorCounts || diagnostics.selectorCounts || {};
      const validJobCount = Number(page?.validJobCount || page?.visibleJobCount || 0);

      if (page?.loginRequired || diagnostics.loginRequired) {
        stmt.run(batchId, "LOGIN_REQUIRED", "warning", pageUrl, pageTitle, "BOSS page requires login.", stringifyJson(page), now);
      }
      if (page?.captchaRequired || diagnostics.captchaRequired) {
        stmt.run(batchId, "CAPTCHA_REQUIRED", "warning", pageUrl, pageTitle, "BOSS page requires captcha or security validation.", stringifyJson(page), now);
      }
      if (Number(selectorCounts.jobDetailLinks || 0) === 0 && validJobCount === 0) {
        stmt.run(batchId, "SELECTOR_CHANGED", "warning", pageUrl, pageTitle, "No job detail links were detected on the captured page.", stringifyJson(page), now);
      }
    }
  }

  insertBrowserTaskFailureEvent(taskRow, result, errorMessage, now) {
    const payload = parseJsonValue(taskRow.payload_json, {});
    const event = buildBrowserTaskFailureEvent(taskRow, payload, result, errorMessage);
    this.database.prepare(`
      INSERT INTO browser_events (
        batch_id, event_type, severity, page_url, page_title, message, details_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      null,
      event.eventType,
      event.severity,
      event.pageUrl,
      event.pageTitle,
      event.message,
      stringifyJson(event.details),
      now
    );
  }

  countJobs() {
    return Number(this.database.prepare("SELECT COUNT(*) AS count FROM jobs").get().count || 0);
  }

  countApplications() {
    return Number(this.database.prepare("SELECT COUNT(*) AS count FROM applications").get().count || 0);
  }

  countBrowserTasks(status = "", options = {}) {
    const sourceUrl = normalizeComparableUrl(options.sourceUrl || options.pageUrl || "");
    if (sourceUrl) {
      return this.selectBrowserTasksForScope({ status, sourceUrl }).length;
    }
    if (!status) {
      return Number(this.database.prepare("SELECT COUNT(*) AS count FROM browser_tasks").get().count || 0);
    }
    return Number(this.database.prepare("SELECT COUNT(*) AS count FROM browser_tasks WHERE status = ?").get(status).count || 0);
  }

  countAgentRuns(options = {}) {
    if (options.applicationId) {
      return Number(this.database.prepare("SELECT COUNT(*) AS count FROM agent_runs WHERE application_id = ?").get(options.applicationId).count || 0);
    }
    return Number(this.database.prepare("SELECT COUNT(*) AS count FROM agent_runs").get().count || 0);
  }

  countScreenings(options = {}) {
    if (options.applicationId) {
      return Number(this.database.prepare("SELECT COUNT(*) AS count FROM screenings WHERE application_id = ?").get(options.applicationId).count || 0);
    }
    return Number(this.database.prepare("SELECT COUNT(*) AS count FROM screenings").get().count || 0);
  }

  countResumeVersions(options = {}) {
    if (options.applicationId) {
      return Number(this.database.prepare("SELECT COUNT(*) AS count FROM resume_versions WHERE application_id = ?").get(options.applicationId).count || 0);
    }
    return Number(this.database.prepare("SELECT COUNT(*) AS count FROM resume_versions").get().count || 0);
  }

  countResumeAudits(options = {}) {
    if (options.resumeVersionId) {
      return Number(this.database.prepare("SELECT COUNT(*) AS count FROM resume_audits WHERE resume_version_id = ?").get(options.resumeVersionId).count || 0);
    }
    if (options.applicationId) {
      return Number(this.database.prepare(`
        SELECT COUNT(*) AS count
        FROM resume_audits
        JOIN resume_versions ON resume_versions.id = resume_audits.resume_version_id
        WHERE resume_versions.application_id = ?
      `).get(options.applicationId).count || 0);
    }
    return Number(this.database.prepare("SELECT COUNT(*) AS count FROM resume_audits").get().count || 0);
  }

  countResumeFitEvaluations(options = {}) {
    if (options.resumeVersionId) {
      return Number(this.database.prepare("SELECT COUNT(*) AS count FROM resume_fit_evaluations WHERE resume_version_id = ?").get(options.resumeVersionId).count || 0);
    }
    if (options.applicationId) {
      return Number(this.database.prepare("SELECT COUNT(*) AS count FROM resume_fit_evaluations WHERE application_id = ?").get(options.applicationId).count || 0);
    }
    return Number(this.database.prepare("SELECT COUNT(*) AS count FROM resume_fit_evaluations").get().count || 0);
  }

  countResumeClaimVerifications(options = {}) {
    if (options.resumeVersionId) {
      return Number(this.database.prepare("SELECT COUNT(*) AS count FROM resume_claim_verifications WHERE resume_version_id = ?").get(options.resumeVersionId).count || 0);
    }
    if (options.applicationId) {
      return Number(this.database.prepare("SELECT COUNT(*) AS count FROM resume_claim_verifications WHERE application_id = ?").get(options.applicationId).count || 0);
    }
    return Number(this.database.prepare("SELECT COUNT(*) AS count FROM resume_claim_verifications").get().count || 0);
  }

  countMessages(options = {}) {
    if (options.applicationId) {
      return Number(this.database.prepare("SELECT COUNT(*) AS count FROM messages WHERE application_id = ?").get(options.applicationId).count || 0);
    }
    return Number(this.database.prepare("SELECT COUNT(*) AS count FROM messages").get().count || 0);
  }

  countConversations(options = {}) {
    if (options.applicationId) {
      return Number(this.database.prepare("SELECT COUNT(*) AS count FROM conversations WHERE application_id = ?").get(options.applicationId).count || 0);
    }
    return Number(this.database.prepare("SELECT COUNT(*) AS count FROM conversations").get().count || 0);
  }

  getLastBatch() {
    const row = this.database.prepare(`
      SELECT source, exported_at, received_at, received_jobs, page_count
      FROM capture_batches
      ORDER BY id DESC
      LIMIT 1
    `).get();
    if (!row) {
      return null;
    }
    return {
      source: row.source || "unknown",
      exportedAt: row.exported_at || null,
      receivedAt: row.received_at || null,
      receivedJobs: Number(row.received_jobs || 0),
      pageCount: Number(row.page_count || 0)
    };
  }

  getLatestQuality() {
    const row = this.database.prepare(`
      SELECT
        capture_quality.*,
        capture_batches.source,
        capture_batches.exported_at,
        capture_batches.received_at
      FROM capture_quality
      JOIN capture_batches ON capture_batches.id = capture_quality.batch_id
      ORDER BY capture_quality.id DESC
      LIMIT 1
    `).get();
    return row ? rowToQuality(row) : null;
  }

  getOrCreateProfile() {
    const existing = this.database.prepare(`
      SELECT *
      FROM candidate_profiles
      ORDER BY id ASC
      LIMIT 1
    `).get();
    if (existing) {
      return existing;
    }
    const now = new Date().toISOString();
    const result = this.database.prepare(`
      INSERT INTO candidate_profiles (
        display_name, headline, location, target_json, summary, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("", "", "", stringifyJson({}), "", now, now);
    return this.database.prepare("SELECT * FROM candidate_profiles WHERE id = ?").get(Number(result.lastInsertRowid));
  }

  readProfileBundle(profileId) {
    const profile = this.database.prepare("SELECT * FROM candidate_profiles WHERE id = ?").get(profileId);
    if (!profile) {
      throw validationError(`Profile not found: ${profileId}`);
    }
    const resumeRows = this.database.prepare(`
      SELECT *
      FROM resume_sources
      WHERE profile_id = ?
      ORDER BY id DESC
      LIMIT 5
    `).all(profileId);
    const experienceRows = this.database.prepare(`
      SELECT *
      FROM profile_experiences
      WHERE profile_id = ?
      ORDER BY id ASC
    `).all(profileId);
    const skillRows = this.database.prepare(`
      SELECT *
      FROM profile_skills
      WHERE profile_id = ?
      ORDER BY name ASC
    `).all(profileId);
    const constraintRows = this.database.prepare(`
      SELECT *
      FROM profile_constraints
      WHERE profile_id = ?
      ORDER BY id ASC
    `).all(profileId);
    const draftRows = this.database.prepare(`
      SELECT *
      FROM profile_fact_drafts
      WHERE profile_id = ?
        AND status = 'PENDING'
      ORDER BY id ASC
      LIMIT 50
    `).all(profileId);

    return {
      storage: "sqlite",
      profile: rowToProfile(profile),
      resumeSources: resumeRows.map(rowToResumeSource),
      experiences: experienceRows.map(rowToExperience),
      skills: skillRows.map(rowToSkill),
      constraints: constraintRows.map(rowToConstraint),
      pendingFactDrafts: draftRows.map(rowToProfileFactDraft)
    };
  }

  countProfileFactDrafts(options = {}) {
    const whereParts = ["profile_id = ?"];
    const profile = this.getOrCreateProfile();
    const params = [profile.id];
    if (options.status) {
      whereParts.push("status = ?");
      params.push(options.status);
    }
    if (options.draftType) {
      whereParts.push("draft_type = ?");
      params.push(options.draftType);
    }
    if (options.resumeSourceId) {
      whereParts.push("resume_source_id = ?");
      params.push(options.resumeSourceId);
    }
    if (options.sourceSessionId) {
      whereParts.push("source_session_id = ?");
      params.push(options.sourceSessionId);
    }
    return Number(this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM profile_fact_drafts
      WHERE ${whereParts.join(" AND ")}
    `).get(...params).count || 0);
  }
}

function normalizeJob(job, payload, now) {
  const title = cleanText(job.title);
  const company = cleanText(job.company);
  const detailUrl = cleanText(job.detailUrl || job.url);
  const jobId = cleanText(job.jobId || extractJobId(detailUrl));
  const sourceKey = cleanText(job.cacheKey || job.sourceKey || jobId || detailUrl || stableKey([title, company, job.salary, job.location]));

  if (!sourceKey || (!title && !detailUrl)) {
    return null;
  }

  return {
    sourceKey,
    jobId,
    title,
    salary: cleanText(job.salary),
    company,
    location: cleanText(job.location),
    experience: cleanText(job.experience),
    education: cleanText(job.education),
    recruiter: cleanText(job.recruiter),
    tags: normalizeArray(job.tags),
    welfare: normalizeArray(job.welfare),
    description: cleanMultiline(job.description),
    detailUrl,
    sourceUrl: cleanText(job.sourceUrl),
    pageTitle: cleanText(job.pageTitle),
    rawText: cleanMultiline(job.rawText).slice(0, 4000),
    firstSeenAt: cleanText(job.firstSeenAt) || now,
    lastSeenAt: now,
    capturedAt: cleanText(job.capturedAt) || payload.exportedAt || now,
    syncSource: cleanText(payload.source) || "boss-find-extension"
  };
}

function isValidJob(job) {
  return Boolean(job?.jobId || /\/job_detail\//.test(String(job?.detailUrl || "")));
}

function mergeJob(existing, incoming, now) {
  return {
    ...existing,
    ...preferNonEmpty(existing, incoming),
    tags: union(existing.tags, incoming.tags),
    welfare: union(existing.welfare, incoming.welfare),
    description: chooseLonger(existing.description, incoming.description),
    rawText: chooseLonger(existing.rawText, incoming.rawText).slice(0, 4000),
    firstSeenAt: existing.firstSeenAt || incoming.firstSeenAt,
    lastSeenAt: now
  };
}

function preferNonEmpty(existing, incoming) {
  const result = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (Array.isArray(value)) {
      continue;
    }
    result[key] = value || existing[key] || "";
  }
  return result;
}

function jobColumns(job, companyId, now) {
  return [
    job.jobId,
    job.title,
    job.salary,
    companyId,
    job.company,
    job.location,
    job.experience,
    job.education,
    job.recruiter,
    stringifyJson(job.tags || []),
    stringifyJson(job.welfare || []),
    job.description,
    job.detailUrl,
    job.sourceUrl,
    job.pageTitle,
    String(job.rawText || "").slice(0, 4000),
    job.firstSeenAt,
    job.lastSeenAt || now,
    job.capturedAt,
    job.syncSource,
    now
  ];
}

function rowToJob(row) {
  return {
    sourceKey: row.source_key || "",
    jobId: row.job_id || "",
    title: row.title || "",
    salary: row.salary || "",
    company: row.company_name || row.company_table_name || "",
    location: row.location || "",
    experience: row.experience || "",
    education: row.education || "",
    recruiter: row.recruiter || "",
    tags: parseJsonArray(row.tags_json),
    welfare: parseJsonArray(row.welfare_json),
    description: row.description || "",
    detailUrl: row.detail_url || "",
    sourceUrl: row.source_url || "",
    pageTitle: row.page_title || "",
    rawText: row.raw_text || "",
    firstSeenAt: row.first_seen_at || "",
    lastSeenAt: row.last_seen_at || "",
    capturedAt: row.captured_at || "",
    syncSource: row.sync_source || ""
  };
}

function rowToQuality(row) {
  return {
    batchId: Number(row.batch_id || 0),
    source: row.source || "",
    exportedAt: row.exported_at || null,
    receivedAt: row.received_at || null,
    pageCount: Number(row.page_count || 0),
    receivedJobs: Number(row.received_jobs || 0),
    validJobs: Number(row.valid_jobs || 0),
    storedJobs: Number(row.stored_jobs || 0),
    describedJobs: Number(row.described_jobs || 0),
    descriptionCoverage: Number(row.description_coverage || 0),
    requiredCompleteJobs: Number(row.required_complete_jobs || 0),
    requiredFieldCoverage: Number(row.required_field_coverage || 0),
    invalidJobs: Number(row.invalid_jobs || 0),
    loginRequiredPages: Number(row.login_required_pages || 0),
    captchaRequiredPages: Number(row.captcha_required_pages || 0),
    selectorCounts: parseJsonObject(row.selector_counts_json),
    missingFields: parseJsonObject(row.missing_fields_json),
    searchContext: parseJsonValue(row.search_context_json, []),
    createdAt: row.created_at || null
  };
}

function rowToBrowserEvent(row) {
  return {
    id: Number(row.id || 0),
    batchId: row.batch_id === null || row.batch_id === undefined ? null : Number(row.batch_id || 0),
    source: row.source || "",
    exportedAt: row.exported_at || null,
    receivedAt: row.received_at || null,
    eventType: row.event_type || "",
    severity: row.severity || "",
    pageUrl: row.page_url || "",
    pageTitle: row.page_title || "",
    message: row.message || "",
    details: parseJsonValue(row.details_json, {}),
    createdAt: row.created_at || null
  };
}

function countRows(database, tableName) {
  return Number(database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count || 0);
}

function latestTableTimestamp(database, tableName, columnName, source) {
  const row = database.prepare(`
    SELECT id, ${columnName} AS updated_at
    FROM ${tableName}
    ORDER BY ${columnName} DESC, id DESC
    LIMIT 1
  `).get();
  if (!row?.updated_at) {
    return null;
  }
  return {
    source,
    id: Number(row.id || 0),
    updatedAt: row.updated_at
  };
}

function rowToProfile(row) {
  return {
    id: Number(row.id || 0),
    displayName: row.display_name || "",
    headline: row.headline || "",
    location: row.location || "",
    target: parseJsonValue(row.target_json, {}),
    summary: row.summary || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function rowToResumeSource(row) {
  return {
    id: Number(row.id || 0),
    profileId: Number(row.profile_id || 0),
    sourceType: row.source_type || "",
    fileName: row.file_name || "",
    filePath: row.file_path || "",
    rawText: row.raw_text || "",
    textLength: String(row.raw_text || "").length,
    parsed: parseJsonValue(row.parsed_json, {}),
    metadata: parseJsonValue(row.metadata_json, {}),
    createdAt: row.created_at || ""
  };
}

function rowToExperience(row) {
  return {
    id: Number(row.id || 0),
    profileId: Number(row.profile_id || 0),
    kind: row.kind || "",
    title: row.title || "",
    organization: row.organization || "",
    role: row.role || "",
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    facts: parseJsonArray(row.facts_json),
    skills: parseJsonArray(row.skills_json),
    evidenceText: row.evidence_text || "",
    evidenceSource: row.evidence_source || "",
    confidence: row.confidence || "",
    allowedRewrites: parseJsonArray(row.allowed_rewrites_json),
    forbiddenClaims: parseJsonArray(row.forbidden_claims_json),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function rowToSkill(row) {
  return {
    id: Number(row.id || 0),
    profileId: Number(row.profile_id || 0),
    name: row.name || "",
    category: row.category || "",
    proficiency: row.proficiency || "",
    evidence: parseJsonArray(row.evidence_json),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function rowToConstraint(row) {
  return {
    id: Number(row.id || 0),
    profileId: Number(row.profile_id || 0),
    ruleType: row.rule_type || "",
    content: row.content || "",
    severity: row.severity || "",
    metadata: parseJsonValue(row.metadata_json, {}),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function rowToProfileFactDraft(row) {
  return {
    id: Number(row.id || 0),
    profileId: Number(row.profile_id || 0),
    resumeSourceId: row.resume_source_id === null || row.resume_source_id === undefined ? null : Number(row.resume_source_id || 0),
    draftType: row.draft_type || "",
    status: row.status || "",
    title: row.title || "",
    content: parseJsonValue(row.content_json, {}),
    evidenceText: row.evidence_text || "",
    confidence: row.confidence || "",
    metadata: parseJsonValue(row.metadata_json, {}),
    operation: row.operation || "CREATE",
    targetEntityType: row.target_entity_type || "",
    targetEntityId: row.target_entity_id === null || row.target_entity_id === undefined ? null : Number(row.target_entity_id || 0),
    sourceSessionId: row.source_session_id === null || row.source_session_id === undefined ? null : Number(row.source_session_id || 0),
    sourceMessageId: row.source_message_id === null || row.source_message_id === undefined ? null : Number(row.source_message_id || 0),
    resolvedEntityType: row.resolved_entity_type || "",
    resolvedEntityId: row.resolved_entity_id === null || row.resolved_entity_id === undefined ? null : Number(row.resolved_entity_id || 0),
    resolvedAt: row.resolved_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function rowToProfileDialogSession(row) {
  return {
    id: Number(row.id || 0),
    profileId: Number(row.profile_id || 0),
    title: row.title || "",
    status: row.status || "",
    summary: parseJsonValue(row.summary_json, {}),
    openQuestions: parseJsonArray(row.open_questions_json),
    conflicts: parseJsonArray(row.conflicts_json),
    modelConfig: parseJsonValue(row.model_config_json, {}),
    messageCount: Number(row.message_count || 0),
    pendingDraftCount: Number(row.pending_draft_count || 0),
    lastMessageAt: row.last_message_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function rowToProfileDialogMessage(row) {
  return {
    id: Number(row.id || 0),
    sessionId: Number(row.session_id || 0),
    role: row.role || "",
    status: row.status || "",
    content: row.content || "",
    structured: parseJsonValue(row.structured_json, {}),
    errorCode: row.error_code || "",
    errorMessage: row.error_message || "",
    retryOfMessageId: row.retry_of_message_id === null || row.retry_of_message_id === undefined
      ? null
      : Number(row.retry_of_message_id || 0),
    agentRunId: row.agent_run_id === null || row.agent_run_id === undefined
      ? null
      : Number(row.agent_run_id || 0),
    createdAt: row.created_at || ""
  };
}

function rowToProfileContextVersion(row) {
  return {
    id: Number(row.id || 0),
    profileId: Number(row.profile_id || 0),
    sourceSessionId: row.source_session_id === null || row.source_session_id === undefined
      ? null
      : Number(row.source_session_id || 0),
    sourceMessageId: row.source_message_id === null || row.source_message_id === undefined
      ? null
      : Number(row.source_message_id || 0),
    profileHash: row.profile_hash || "",
    contentHash: row.content_hash || "",
    structured: parseJsonValue(row.structured_json, {}),
    markdown: row.markdown || "",
    createdAt: row.created_at || ""
  };
}

function rowToProfileEntityRevision(row) {
  return {
    id: Number(row.id || 0),
    profileId: Number(row.profile_id || 0),
    entityType: row.entity_type || "",
    entityId: Number(row.entity_id || 0),
    operation: row.operation || "",
    sourceDraftId: row.source_draft_id === null || row.source_draft_id === undefined
      ? null
      : Number(row.source_draft_id || 0),
    before: parseJsonValue(row.before_json, null),
    after: parseJsonValue(row.after_json, null),
    createdAt: row.created_at || ""
  };
}

function rowToApplication(row) {
  return {
    id: Number(row.id || 0),
    jobId: Number(row.job_id || 0),
    sourceKey: row.source_key || "",
    bossJobId: row.boss_job_id || "",
    status: row.status || "",
    statusReason: row.status_reason || "",
    title: row.title || "",
    company: row.company_name || "",
    salary: row.salary || "",
    location: row.location || "",
    detailUrl: row.detail_url || "",
    descriptionLength: Number(row.description_length || 0),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function rowToApplicationEvent(row) {
  return {
    id: Number(row.id || 0),
    applicationId: Number(row.application_id || 0),
    sourceKey: row.source_key || "",
    title: row.title || "",
    company: row.company_name || "",
    fromStatus: row.from_status || null,
    toStatus: row.to_status || "",
    eventType: row.event_type || "",
    reason: row.reason || "",
    idempotencyKey: row.idempotency_key || "",
    metadata: parseJsonValue(row.metadata_json, {}),
    createdAt: row.created_at || ""
  };
}

function rowToBrowserTask(row) {
  return {
    id: Number(row.id || 0),
    applicationId: row.application_id === null || row.application_id === undefined ? null : Number(row.application_id || 0),
    sourceKey: row.source_key || "",
    bossJobId: row.boss_job_id || "",
    title: row.title || "",
    company: row.company_name || "",
    salary: row.salary || "",
    location: row.location || "",
    detailUrl: row.detail_url || "",
    taskType: row.task_type || "",
    status: row.status || "",
    payload: parseJsonValue(row.payload_json, {}),
    result: parseJsonValue(row.result_json, null),
    errorMessage: row.error_message || "",
    expiresAt: row.expires_at || "",
    attemptCount: Number(row.attempt_count || 0),
    maxAttempts: Number(row.max_attempts || 0),
    lastAttemptAt: row.last_attempt_at || "",
    claimToken: row.claim_token || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function rowToAgentRun(row) {
  return {
    id: Number(row.id || 0),
    agentName: row.agent_name || "",
    applicationId: row.application_id === null || row.application_id === undefined ? null : Number(row.application_id || 0),
    sourceKey: row.source_key || "",
    title: row.title || "",
    company: row.company_name || "",
    step: row.step || "",
    status: row.status || "",
    provider: row.provider || "",
    input: parseJsonValue(row.input_json, {}),
    output: parseJsonValue(row.output_json, null),
    errorCode: row.error_code || "",
    errorMessage: row.error_message || "",
    fallbackUsed: Boolean(row.fallback_used),
    workflowRunId: row.workflow_run_id === null || row.workflow_run_id === undefined ? null : Number(row.workflow_run_id || 0),
    profileSnapshotId: row.profile_snapshot_id === null || row.profile_snapshot_id === undefined ? null : Number(row.profile_snapshot_id || 0),
    jobSnapshotId: row.job_snapshot_id === null || row.job_snapshot_id === undefined ? null : Number(row.job_snapshot_id || 0),
    promptVersion: row.prompt_version || "",
    agentVersion: row.agent_version || "",
    modelConfig: parseJsonValue(row.model_config_json, {}),
    graphVersion: row.graph_version || "",
    startedAt: row.started_at || "",
    finishedAt: row.finished_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function rowToWorkflowRun(row) {
  return {
    id: Number(row.id || 0),
    applicationId: Number(row.application_id || 0),
    sourceKey: row.source_key || "",
    title: row.title || "",
    company: row.company_name || "",
    workflowName: row.workflow_name || "",
    status: row.status || "",
    mode: row.mode || "",
    replayOfWorkflowRunId: row.replay_of_workflow_run_id === null || row.replay_of_workflow_run_id === undefined
      ? null
      : Number(row.replay_of_workflow_run_id || 0),
    output: parseJsonValue(row.output_json, null),
    error: parseJsonValue(row.error_json, null),
    startedAt: row.started_at || "",
    finishedAt: row.finished_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function rowToWorkflowInputSnapshot(row) {
  return {
    id: Number(row.id || 0),
    workflowRunId: Number(row.workflow_run_id || 0),
    profileSnapshotId: Number(row.profile_snapshot_id || 0),
    jobSnapshotId: Number(row.job_snapshot_id || 0),
    userRules: parseJsonValue(row.user_rules_json, {}),
    executionOptions: parseJsonValue(row.execution_options_json, {}),
    renderOptions: parseJsonValue(row.render_options_json, {}),
    promptVersion: row.prompt_version || "",
    agentVersion: row.agent_version || "",
    modelConfig: parseJsonValue(row.model_config_json, {}),
    graphVersion: row.graph_version || "",
    inputHash: row.input_hash || "",
    createdAt: row.created_at || ""
  };
}

function rowToWorkflowEvent(row) {
  return {
    id: Number(row.id || 0),
    applicationId: row.application_id === null || row.application_id === undefined ? null : Number(row.application_id || 0),
    sourceKey: row.source_key || "",
    title: row.title || "",
    company: row.company_name || "",
    sourceType: row.source_type || "",
    sourceId: row.source_id === null || row.source_id === undefined ? null : Number(row.source_id || 0),
    eventType: row.event_type || "",
    severity: row.severity || "",
    status: row.status || "",
    progress: {
      current: row.progress_current === null || row.progress_current === undefined ? null : Number(row.progress_current || 0),
      total: row.progress_total === null || row.progress_total === undefined ? null : Number(row.progress_total || 0)
    },
    message: row.message || "",
    errorCode: row.error_code || "",
    errorMessage: row.error_message || "",
    metadata: parseJsonValue(row.metadata_json, {}),
    resolutionStatus: row.resolution_status || "OPEN",
    resolutionNote: row.resolution_note || "",
    resolvedBy: row.resolved_by || "",
    resolvedAt: row.resolved_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function rowToScreening(row) {
  return {
    id: Number(row.id || 0),
    applicationId: Number(row.application_id || 0),
    agentRunId: row.agent_run_id === null || row.agent_run_id === undefined ? null : Number(row.agent_run_id || 0),
    sourceKey: row.source_key || "",
    title: row.title || "",
    company: row.company_name || "",
    matchScore: Number(row.match_score || 0),
    riskScore: Number(row.risk_score || 0),
    recommendation: row.recommendation || "",
    hardConditions: parseJsonValue(row.hard_conditions_json, []),
    matchedPoints: parseJsonArray(row.matched_points_json),
    riskPoints: parseJsonArray(row.risk_points_json),
    resumeStrategy: parseJsonArray(row.resume_strategy_json),
    requiresUserConfirmation: Boolean(row.requires_user_confirmation),
    confidence: row.confidence || "",
    provider: row.provider || "",
    metadata: parseJsonValue(row.metadata_json, {}),
    createdAt: row.created_at || ""
  };
}

function rowToResumeVersion(row) {
  return {
    id: Number(row.id || 0),
    applicationId: Number(row.application_id || 0),
    screeningId: row.screening_id === null || row.screening_id === undefined ? null : Number(row.screening_id || 0),
    agentRunId: row.agent_run_id === null || row.agent_run_id === undefined ? null : Number(row.agent_run_id || 0),
    sourceKey: row.source_key || "",
    title: row.title || "",
    company: row.company_name || "",
    versionNumber: Number(row.version_number || 0),
    status: row.status || "",
    provider: row.provider || "",
    resumeFields: parseJsonValue(row.resume_fields_json, {}),
    sourceMapping: parseJsonValue(row.source_mapping_json, []),
    diffSummary: parseJsonArray(row.diff_summary_json),
    compressionNotes: parseJsonArray(row.compression_notes_json),
    unsupportedClaims: parseJsonArray(row.unsupported_claims_json),
    renderMetadata: parseJsonValue(row.render_metadata_json, {}),
    filePath: row.file_path || "",
    fileFormat: row.file_format || "",
    metadata: parseJsonValue(row.metadata_json, {}),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function rowToResumeFitEvaluation(row) {
  return {
    id: Number(row.id || 0),
    resumeVersionId: Number(row.resume_version_id || 0),
    applicationId: Number(row.application_id || 0),
    agentRunId: row.agent_run_id === null || row.agent_run_id === undefined ? null : Number(row.agent_run_id || 0),
    sourceKey: row.source_key || "",
    title: row.title || "",
    company: row.company_name || "",
    provider: row.provider || "",
    coverageScore: Number(row.coverage_score || 0),
    fitLevel: row.fit_level || "",
    confidence: row.confidence || "",
    requirementCount: Number(row.requirement_count || 0),
    coveredCount: Number(row.covered_count || 0),
    weakCount: Number(row.weak_count || 0),
    missingCount: Number(row.missing_count || 0),
    jdRequirements: parseJsonValue(row.jd_requirements_json, {}),
    coverageItems: parseJsonArray(row.coverage_items_json),
    blockers: parseJsonArray(row.blockers_json),
    recommendations: parseJsonArray(row.recommendations_json),
    policy: parseJsonValue(row.policy_json, {}),
    metadata: parseJsonValue(row.metadata_json, {}),
    createdAt: row.created_at || ""
  };
}

function rowToResumeClaimVerification(row) {
  return {
    id: Number(row.id || 0),
    resumeVersionId: Number(row.resume_version_id || 0),
    applicationId: Number(row.application_id || 0),
    agentRunId: row.agent_run_id === null || row.agent_run_id === undefined ? null : Number(row.agent_run_id || 0),
    sourceKey: row.source_key || "",
    title: row.title || "",
    company: row.company_name || "",
    provider: row.provider || "",
    totalClaims: Number(row.total_claims || 0),
    supportedCount: Number(row.supported_count || 0),
    weakCount: Number(row.weak_count || 0),
    unsupportedCount: Number(row.unsupported_count || 0),
    needsUserConfirmationCount: Number(row.needs_user_confirmation_count || 0),
    truthfulnessPassed: Boolean(row.truthfulness_passed),
    coverageRatio: Number(row.coverage_ratio || 0),
    claims: parseJsonValue(row.claims_json, []),
    unsupportedClaims: parseJsonArray(row.unsupported_claims_json),
    needsUserConfirmation: parseJsonArray(row.needs_user_confirmation_json),
    recommendations: parseJsonValue(row.recommendations_json, []),
    policy: parseJsonValue(row.policy_json, {}),
    metadata: parseJsonValue(row.metadata_json, {}),
    createdAt: row.created_at || ""
  };
}

function rowToResumeAudit(row) {
  return {
    id: Number(row.id || 0),
    resumeVersionId: Number(row.resume_version_id || 0),
    agentRunId: row.agent_run_id === null || row.agent_run_id === undefined ? null : Number(row.agent_run_id || 0),
    applicationId: Number(row.application_id || 0),
    sourceKey: row.source_key || "",
    title: row.title || "",
    company: row.company_name || "",
    status: row.status || "",
    provider: row.provider || "",
    truthfulnessPassed: Boolean(row.truthfulness_passed),
    formatPassed: Boolean(row.format_passed),
    pageLimitPassed: Boolean(row.page_limit_passed),
    unsupportedClaims: parseJsonArray(row.unsupported_claims_json),
    sourceIssues: parseJsonArray(row.source_issues_json),
    exaggerationRisk: row.exaggeration_risk || "",
    jobFitReview: row.job_fit_review || "",
    riskScoreAdjustment: Number(row.risk_score_adjustment || 0),
    recommendation: row.recommendation || "",
    requiresUserConfirmation: Boolean(row.requires_user_confirmation),
    renderMetadata: parseJsonValue(row.render_metadata_json, {}),
    riskFlags: parseJsonArray(row.risk_flags_json),
    metadata: parseJsonValue(row.metadata_json, {}),
    createdAt: row.created_at || ""
  };
}

function rowToConversation(row) {
  return {
    id: Number(row.id || 0),
    applicationId: Number(row.application_id || 0),
    sourceKey: row.source_key || "",
    title: row.title || "",
    company: row.company_name || "",
    status: row.status || "",
    recruiterName: row.recruiter_name || "",
    conversationUrl: row.conversation_url || "",
    metadata: parseJsonValue(row.metadata_json, {}),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function rowToSubmissionReadinessItem(row) {
  const metadata = parseJsonValue(row.metadata_json, {});
  const submissionReadiness = metadata.submissionReadiness && typeof metadata.submissionReadiness === "object"
    ? metadata.submissionReadiness
    : null;
  const nextActionRecommendation = metadata.nextActionRecommendation && typeof metadata.nextActionRecommendation === "object"
    ? metadata.nextActionRecommendation
    : null;
  const submissionReadinessReview = metadata.submissionReadinessReview && typeof metadata.submissionReadinessReview === "object"
    ? metadata.submissionReadinessReview
    : null;
  return {
    conversationId: Number(row.id || 0),
    applicationId: Number(row.application_id || 0),
    applicationStatus: row.application_status || "",
    sourceKey: row.source_key || "",
    title: row.title || "",
    company: row.company_name || "",
    salary: row.salary || "",
    location: row.location || "",
    detailUrl: row.detail_url || "",
    conversationStatus: row.status || "",
    recruiterName: row.recruiter_name || "",
    conversationUrl: row.conversation_url || "",
    submissionReadiness,
    submissionReadinessReview,
    nextActionRecommendation,
    uploadDryRun: metadata.lastUploadDryRun || null,
    submitDryRun: metadata.lastSubmitDryRun || null,
    communicationAssessment: metadata.communicationAssessment || null,
    updatedAt: row.updated_at || ""
  };
}

function rowToMessage(row) {
  return {
    id: Number(row.id || 0),
    conversationId: Number(row.conversation_id || 0),
    applicationId: Number(row.application_id || 0),
    resumeVersionId: row.resume_version_id === null || row.resume_version_id === undefined ? null : Number(row.resume_version_id || 0),
    agentRunId: row.agent_run_id === null || row.agent_run_id === undefined ? null : Number(row.agent_run_id || 0),
    sourceKey: row.source_key || "",
    title: row.title || "",
    company: row.company_name || "",
    direction: row.direction || "",
    channel: row.channel || "",
    status: row.status || "",
    messageText: row.message_text || "",
    provider: row.provider || "",
    metadata: parseJsonValue(row.metadata_json, {}),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function rowToCommunicationMessage(row) {
  return {
    direction: row.direction || "UNKNOWN",
    status: row.status || "",
    channel: row.channel || "",
    text: row.message_text || "",
    metadata: parseJsonValue(row.metadata_json, {}),
    createdAt: row.created_at || ""
  };
}

function normalizeBrowserTaskCounts(rows = []) {
  const counts = {
    total: 0,
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    canceled: 0
  };
  for (const row of rows) {
    const status = cleanText(row.status).toLowerCase();
    const count = Number(row.count || 0);
    counts.total += count;
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] = count;
    }
  }
  return counts;
}

function normalizeBrowserTaskCountsFromTasks(rows = []) {
  const counts = {
    total: rows.length,
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    canceled: 0
  };
  for (const row of rows) {
    const status = cleanText(row.status).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] += 1;
    }
  }
  return counts;
}

function summarizeBrowserTaskFailures(rows = []) {
  const byReason = new Map();
  for (const row of rows) {
    const reason = cleanText(row.error_message || "") || "unknown";
    const current = byReason.get(reason) || { reason, count: 0, lastSeenAt: null };
    current.count += 1;
    if (!current.lastSeenAt || Date.parse(row.updated_at || 0) > Date.parse(current.lastSeenAt || 0)) {
      current.lastSeenAt = row.updated_at || null;
    }
    byReason.set(reason, current);
  }
  return Array.from(byReason.values())
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return Date.parse(right.lastSeenAt || 0) - Date.parse(left.lastSeenAt || 0);
    });
}

function sortBrowserTaskRowsByUpdatedAt(rows = []) {
  return rows.slice().sort((left, right) => {
    const updatedDiff = Date.parse(right.updated_at || 0) - Date.parse(left.updated_at || 0);
    return updatedDiff || Number(right.id || 0) - Number(left.id || 0);
  });
}

function rowToMissingDescriptionJob(row) {
  const job = rowToJob(row);
  return {
    sourceKey: job.sourceKey,
    jobId: job.jobId,
    title: job.title,
    company: job.company,
    salary: job.salary,
    location: job.location,
    detailUrl: job.detailUrl,
    sourceUrl: job.sourceUrl,
    pageTitle: job.pageTitle,
    descriptionLength: Number(row.description_length || 0),
    lastSeenAt: job.lastSeenAt,
    capturedAt: job.capturedAt
  };
}

function rowToJobKeys(row) {
  const detailUrl = cleanText(row.detail_url || "");
  return [
    row.source_key,
    row.job_id,
    extractJobId(detailUrl),
    detailUrl,
    stableKey([row.title, row.company_name, row.salary, row.location])
  ].map(cleanText).filter(Boolean);
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanMultiline(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(cleanText).filter(Boolean).slice(0, 50);
}

function union(left = [], right = []) {
  return Array.from(new Set([...normalizeArray(left), ...normalizeArray(right)]));
}

function chooseLonger(left = "", right = "") {
  return String(right || "").length > String(left || "").length ? right : left;
}

function stringifyJson(value) {
  return JSON.stringify(value ?? null);
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stableJsonHash(value) {
  return crypto.createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function sanitizeModelConfig(value) {
  const blocked = /(?:api[_-]?key|authorization|bearer|password|secret|token)/i;
  if (Array.isArray(value)) {
    return value.map(sanitizeModelConfig);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (!blocked.test(key)) {
      output[key] = sanitizeModelConfig(item);
    }
  }
  return output;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return normalizeArray(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonValue(value, fallback) {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function buildBrowserTaskFailureEvent(taskRow, payload = {}, result = null, errorMessage = "") {
  const normalizedResult = result && typeof result === "object" ? result : {};
  const errorCode = normalizeBrowserFailureCode(
    normalizedResult.errorCode
      || normalizedResult.reason
      || normalizedResult.statusReason
      || errorMessage
  );
  const page = normalizedResult.page || {};
  const pageUrl = cleanText(page.url || normalizedResult.pageUrl || payload.sourceUrl || payload.pageUrl || "");
  const pageTitle = cleanText(page.title || normalizedResult.pageTitle || "");
  const taskType = cleanText(taskRow.task_type || payload.taskType || "");
  const title = cleanText(payload.title || normalizedResult?.task?.title || "");
  const message = cleanText(normalizedResult.message || errorMessage || `${taskType || "Browser task"} failed`);
  return {
    eventType: errorCode,
    severity: failureCodeSeverity(errorCode),
    pageUrl,
    pageTitle,
    message,
    details: {
      taskId: Number(taskRow.id || 0),
      applicationId: taskRow.application_id === null || taskRow.application_id === undefined ? null : Number(taskRow.application_id || 0),
      taskType,
      errorCode,
      errorMessage: errorMessage || message,
      title,
      company: cleanText(payload.company || normalizedResult?.task?.company || ""),
      detailUrl: cleanText(payload.detailUrl || normalizedResult?.task?.detailUrl || ""),
      result: normalizedResult
    }
  };
}

function normalizeBrowserFailureCode(value) {
  const text = cleanText(value).toUpperCase();
  if (/LOGIN/.test(text)) {
    return "LOGIN_REQUIRED";
  }
  if (/CAPTCHA|SECURITY|VERIFY|VALIDATION/.test(text)) {
    return "SECURITY_CHECK";
  }
  if (/SELECTOR|DOM/.test(text)) {
    return "SELECTOR_CHANGED";
  }
  if (/NOT_VISIBLE|NOT_FOUND|NO_TARGET|TARGET/.test(text)) {
    return "JOB_NOT_VISIBLE";
  }
  if (/DETAIL_EMPTY|EMPTY|DESCRIPTION|JD/.test(text)) {
    return "DETAIL_EMPTY";
  }
  if (/PAGE_MISMATCH|SOURCE_URL|URL/.test(text)) {
    return "TASK_PAGE_MISMATCH";
  }
  return text && /^[A-Z0-9_]{3,80}$/.test(text) ? text : "BROWSER_TASK_FAILED";
}

function failureCodeSeverity(code) {
  return new Set(["LOGIN_REQUIRED", "CAPTCHA_REQUIRED", "SECURITY_CHECK", "SELECTOR_CHANGED"]).has(code)
    ? "warning"
    : "error";
}

function resolveBrowserTaskApplicationId(database, input = {}, payload = {}) {
  if (input.applicationId === null || input.applicationId === undefined || input.applicationId === "") {
    const detailUrl = cleanText(payload.detailUrl || payload.url || input.detailUrl || input.url || "");
    const jobId = cleanText(payload.jobId || payload.bossJobId || input.jobId || input.bossJobId || extractJobId(detailUrl));
    const sourceKey = cleanText(payload.sourceKey || input.sourceKey || "");

    const row = database.prepare(`
      SELECT applications.id
      FROM applications
      JOIN jobs ON jobs.id = applications.job_id
      WHERE (? != '' AND applications.id = CAST(? AS INTEGER))
        OR (? != '' AND jobs.source_key = ?)
        OR (? != '' AND jobs.job_id = ?)
        OR (? != '' AND jobs.detail_url = ?)
        OR (? != '' AND jobs.job_id = ?)
      ORDER BY applications.id ASC
      LIMIT 1
    `).get(
      "",
      "",
      sourceKey,
      sourceKey,
      jobId,
      jobId,
      detailUrl,
      detailUrl,
      extractJobId(detailUrl),
      extractJobId(detailUrl)
    );
    return row ? Number(row.id) : null;
  }
  return Number(input.applicationId);
}

function hasUsableDescription(job) {
  return String(job?.description || "").trim().length >= 80;
}

function normalizeResumeSourceType(value) {
  const type = cleanText(value).toLowerCase();
  return new Set(["text", "docx", "pdf", "markdown", "manual"]).has(type) ? type : "text";
}

function normalizeFactDraftInput(input = {}, source = {}) {
  const draftType = normalizeFactDraftType(input.draftType || input.type || "");
  const title = cleanText(input.title || input.name || "");
  const evidenceText = cleanMultiline(input.evidenceText || input.evidence || "");
  const content = input.content && typeof input.content === "object" ? input.content : {};
  const operation = normalizeFactDraftOperation(input.operation || (input.targetEntityId || input.target?.id ? "UPDATE" : "CREATE"));
  const targetEntityType = normalizeProfileEntityType(input.targetEntityType || input.target?.type || (operation === "UPDATE" ? draftType : ""));
  const targetEntityId = normalizePositiveInteger(input.targetEntityId || input.target?.id || 0);
  if (!draftType || (!title && !evidenceText)) {
    return null;
  }
  if (operation === "UPDATE" && (!targetEntityType || !targetEntityId)) {
    return null;
  }
  return {
    resumeSourceId: normalizePositiveInteger(source.resumeSourceId),
    sourceSessionId: normalizePositiveInteger(input.sourceSessionId || source.sourceSessionId),
    sourceMessageId: normalizePositiveInteger(input.sourceMessageId || source.sourceMessageId),
    draftType,
    operation,
    targetEntityType,
    targetEntityId,
    title: title || cleanText(content.title || content.name || draftType),
    content,
    evidenceText,
    confidence: normalizeFactConfidence(input.confidence || content.confidence || "needs_review"),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  };
}

function normalizeFactDraftType(value) {
  const draftType = cleanText(value).toLowerCase();
  return new Set(["profile", "experience", "skill", "constraint", "question"]).has(draftType) ? draftType : "";
}

function normalizeFactDraftOperation(value) {
  const operation = cleanText(value).toUpperCase();
  return new Set(["CREATE", "UPDATE"]).has(operation) ? operation : "CREATE";
}

function normalizeProfileEntityType(value) {
  const entityType = cleanText(value).toLowerCase();
  return new Set(["profile", "experience", "skill", "constraint"]).has(entityType) ? entityType : "";
}

function normalizeFactDraftStatus(value) {
  const status = cleanText(value).toUpperCase();
  return new Set(["PENDING", "CONFIRMED", "REJECTED"]).has(status) ? status : "";
}

function normalizeProfileDialogSessionStatus(value) {
  const status = cleanText(value).toUpperCase();
  return new Set(["OPEN", "ARCHIVED"]).has(status) ? status : "";
}

function normalizeProfileDialogRole(value) {
  const role = cleanText(value).toLowerCase();
  return new Set(["user", "assistant", "system"]).has(role) ? role : "";
}

function normalizeProfileDialogMessageStatus(value) {
  const status = cleanText(value).toUpperCase();
  return new Set(["COMPLETED", "FAILED"]).has(status) ? status : "";
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function normalizeOptionalPositiveInteger(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  return normalizePositiveInteger(value);
}

function normalizeAgentRunStatus(value) {
  const status = cleanText(value).toUpperCase();
  return new Set(["RUNNING", "SUCCEEDED", "FAILED"]).has(status) ? status : "";
}

function normalizeWorkflowRunMode(value) {
  const mode = cleanText(value).toLowerCase();
  return new Set(["rules", "auto", "llm"]).has(mode) ? mode : "rules";
}

function normalizeWorkflowRunFinalStatus(value) {
  const status = cleanText(value).toUpperCase();
  return new Set(["SUCCEEDED", "FAILED", "STOPPED"]).has(status) ? status : "";
}

function normalizeWorkflowEventInput(input = {}) {
  const sourceType = normalizeWorkflowSourceType(input.sourceType || input.source || "");
  const eventType = cleanText(input.eventType || input.type || "");
  const message = cleanMultiline(input.message || "");
  if (!sourceType || !eventType || !message) {
    throw validationError("Workflow event sourceType, eventType and message are required");
  }
  const severity = normalizeWorkflowSeverity(input.severity || "");
  const errorCode = cleanText(input.errorCode || input.code || "");
  const errorMessage = cleanMultiline(input.errorMessage || input.error || "");
  const hasError = severity === "warning" || severity === "error" || errorCode || errorMessage;
  return {
    applicationId: normalizeOptionalPositiveInteger(input.applicationId),
    sourceType,
    sourceId: normalizeOptionalPositiveInteger(input.sourceId),
    eventType,
    severity,
    status: cleanText(input.status || ""),
    progressCurrent: normalizeOptionalNonNegativeInteger(input.progressCurrent ?? input.progress?.current),
    progressTotal: normalizeOptionalNonNegativeInteger(input.progressTotal ?? input.progress?.total),
    message,
    errorCode,
    errorMessage,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    resolutionStatus: normalizeWorkflowResolutionStatus(input.resolutionStatus || input.statusResolution || "")
      || (hasError ? "OPEN" : "IGNORED")
  };
}

function normalizeWorkflowSourceType(value) {
  const sourceType = cleanText(value).toLowerCase();
  return new Set(["workflow", "agent_run", "browser_task", "application_event", "browser_event", "profile_dialog_session", "api"]).has(sourceType)
    ? sourceType
    : "";
}

function normalizeWorkflowSeverity(value) {
  const severity = cleanText(value).toLowerCase();
  return new Set(["debug", "info", "warning", "error"]).has(severity) ? severity : "info";
}

function normalizeWorkflowResolutionStatus(value) {
  const status = cleanText(value).toUpperCase();
  return new Set(["OPEN", "RESOLVED", "IGNORED"]).has(status) ? status : "";
}

function normalizeOptionalNonNegativeInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function summarizeWorkflowEventPayload(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      sample: value.slice(0, 3).map(summarizeWorkflowEventPayload)
    };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    const summary = {};
    for (const [key, item] of entries.slice(0, 12)) {
      if (item === null || item === undefined) {
        summary[key] = item;
      } else if (Array.isArray(item)) {
        summary[key] = { type: "array", length: item.length };
      } else if (typeof item === "object") {
        summary[key] = { type: "object", keys: Object.keys(item).slice(0, 12) };
      } else if (typeof item === "string") {
        summary[key] = item.length > 160 ? `${item.slice(0, 160)}...` : item;
      } else {
        summary[key] = item;
      }
    }
    return summary;
  }
  if (typeof value === "string") {
    return value.length > 160 ? `${value.slice(0, 160)}...` : value;
  }
  return value;
}

function browserTaskIsDryRunOnly(taskType) {
  return new Set(["SEND_GREETING", "UPLOAD_RESUME", "SUBMIT_APPLICATION"]).has(cleanText(taskType).toUpperCase());
}

function timelineItemFromApplicationEvent(event) {
  const errorLike = isErrorLikeEvent(event.eventType, event.reason);
  return {
    id: `application_event:${event.id}`,
    applicationId: event.applicationId,
    sourceKey: event.sourceKey,
    title: event.title,
    company: event.company,
    sourceType: "application_event",
    sourceId: event.id,
    eventType: event.eventType,
    severity: errorLike ? "error" : "info",
    status: event.toStatus,
    progress: {
      current: 1,
      total: 1
    },
    message: `Application moved from ${event.fromStatus || "none"} to ${event.toStatus}.`,
    errorCode: errorLike ? event.reason : "",
    errorMessage: errorLike ? cleanText(event.metadata?.error?.message || event.reason) : "",
    metadata: event.metadata,
    resolutionStatus: errorLike ? "OPEN" : "IGNORED",
    createdAt: event.createdAt,
    updatedAt: event.createdAt,
    timelineSource: "application_events"
  };
}

function timelineItemFromAgentRun(run) {
  return {
    id: `agent_run:${run.id}`,
    applicationId: run.applicationId,
    sourceKey: run.sourceKey,
    title: run.title,
    company: run.company,
    sourceType: "agent_run",
    sourceId: run.id,
    eventType: run.status === "FAILED" ? "AGENT_RUN_FAILED" : `AGENT_RUN_${run.status}`,
    severity: run.status === "FAILED" ? "error" : "info",
    status: run.status,
    progress: {
      current: run.status === "RUNNING" ? 0 : 1,
      total: 1
    },
    message: `${run.agentName} ${run.status.toLowerCase()} ${run.step}.`,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    metadata: {
      agentName: run.agentName,
      step: run.step,
      provider: run.provider,
      fallbackUsed: run.fallbackUsed
    },
    resolutionStatus: run.status === "FAILED" ? "OPEN" : "IGNORED",
    createdAt: run.startedAt || run.createdAt,
    updatedAt: run.finishedAt || run.updatedAt,
    timelineSource: "agent_runs"
  };
}

function timelineItemFromBrowserTask(task) {
  const failed = task.status === "FAILED";
  return {
    id: `browser_task:${task.id}`,
    applicationId: task.applicationId,
    sourceKey: task.sourceKey,
    title: task.title,
    company: task.company,
    sourceType: "browser_task",
    sourceId: task.id,
    eventType: failed ? "BROWSER_TASK_FAILED" : `BROWSER_TASK_${task.status}`,
    severity: failed ? "error" : task.status === "CANCELED" ? "warning" : "info",
    status: task.status,
    progress: {
      current: task.status === "QUEUED" || task.status === "RUNNING" ? 0 : 1,
      total: 1
    },
    message: `${task.taskType} is ${task.status}.`,
    errorCode: failed ? normalizeBrowserFailureCode(task.errorMessage || task.result?.errorCode || task.result?.reason || "") : "",
    errorMessage: failed ? (task.errorMessage || task.result?.message || "") : "",
    metadata: {
      taskType: task.taskType,
      dryRunOnly: browserTaskIsDryRunOnly(task.taskType),
      resultSummary: summarizeWorkflowEventPayload(task.result)
    },
    resolutionStatus: failed || task.status === "CANCELED" ? "OPEN" : "IGNORED",
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    timelineSource: "browser_tasks"
  };
}

function sourceKeyForTimeline(sourceType, sourceId) {
  return `${sourceType || ""}:${sourceId || ""}`;
}

function compareTimelineItemsDesc(left, right) {
  const leftTime = Date.parse(left.updatedAt || left.createdAt || 0);
  const rightTime = Date.parse(right.updatedAt || right.createdAt || 0);
  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }
  return String(right.id || "").localeCompare(String(left.id || ""));
}

function isErrorLikeEvent(eventType, reason = "") {
  const text = `${eventType || ""} ${reason || ""}`.toUpperCase();
  return /FAILED|ERROR|SECURITY|CAPTCHA|LOGIN_REQUIRED|SELECTOR_CHANGED|NEEDS_USER_REVIEW/.test(text);
}

function reasonSeverity(reason = "", metadata = {}) {
  if (isErrorLikeEvent("", reason) || metadata?.error) {
    return "error";
  }
  return "info";
}

function normalizeScreeningRecord(input = {}) {
  const recommendation = normalizeScreeningRecommendation(input.recommendation || "");
  if (!recommendation) {
    throw validationError("Valid screening recommendation is required");
  }
  return {
    matchScore: boundedInteger(input.matchScore ?? input.match_score, 0, 100),
    riskScore: boundedInteger(input.riskScore ?? input.risk_score, 0, 100),
    recommendation,
    hardConditions: normalizeHardConditions(input.hardConditions || input.hard_conditions || []),
    matchedPoints: normalizeArray(input.matchedPoints || input.matched_points || []),
    riskPoints: normalizeArray(input.riskPoints || input.risk_points || []),
    resumeStrategy: normalizeArray(input.resumeStrategy || input.resume_strategy || []),
    requiresUserConfirmation: Boolean(input.requiresUserConfirmation ?? input.requires_user_confirmation),
    confidence: normalizeScreeningConfidence(input.confidence || ""),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  };
}

function normalizeResumeVersionRecord(input = {}) {
  const resumeFields = input.resumeFields || input.resume_fields || {};
  if (!resumeFields || typeof resumeFields !== "object" || Array.isArray(resumeFields)) {
    throw validationError("Resume fields are required");
  }
  return {
    resumeFields,
    sourceMapping: normalizeSourceMapping(input.sourceMapping || input.source_mapping || []),
    diffSummary: normalizeArray(input.diffSummary || input.diff_summary || []),
    compressionNotes: normalizeArray(input.compressionNotes || input.compression_notes || []),
    unsupportedClaims: normalizeArray(input.unsupportedClaims || input.unsupported_claims || []),
    renderMetadata: input.renderMetadata && typeof input.renderMetadata === "object" ? input.renderMetadata : input.render_metadata && typeof input.render_metadata === "object" ? input.render_metadata : {},
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  };
}

function normalizeResumeFitEvaluationRecord(input = {}) {
  const coverage = input.coverage && typeof input.coverage === "object" ? input.coverage : {};
  const coverageItems = Array.isArray(coverage.items)
    ? coverage.items.map(normalizeResumeFitCoverageItem).filter((item) => item.requirement)
    : [];
  const fitLevel = cleanText(coverage.fitLevel || input.fitLevel || "");
  const confidence = cleanText(coverage.confidence || input.confidence || "");
  return {
    jdRequirements: input.jdRequirements && typeof input.jdRequirements === "object" ? input.jdRequirements : {},
    coverage: {
      score: boundedInteger(coverage.score ?? input.coverageScore, 0, 100),
      fitLevel: new Set(["strong", "mixed", "weak"]).has(fitLevel) ? fitLevel : "weak",
      confidence: confidence || "low",
      covered: Math.max(0, Number(coverage.covered || 0)),
      weak: Math.max(0, Number(coverage.weak || 0)),
      missing: Math.max(0, Number(coverage.missing || 0)),
      total: Math.max(0, Number(coverage.total || coverageItems.length || 0)),
      items: coverageItems
    },
    blockers: normalizeArray(input.blockers || []),
    recommendations: normalizeResumeFitRecommendations(input.recommendations || []),
    policy: input.policy && typeof input.policy === "object" ? input.policy : {},
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  };
}

function normalizeResumeClaimVerificationRecord(input = {}) {
  const summaryInput = input.summary && typeof input.summary === "object" ? input.summary : {};
  const claims = Array.isArray(input.claims)
    ? input.claims.map(normalizeResumeClaimVerificationClaim).filter((item) => item.claim)
    : [];
  const counted = summarizeResumeClaimStatuses(claims);
  const summary = {
    total: counted.total,
    supported: counted.supported,
    weak: counted.weak,
    unsupported: counted.unsupported,
    needsUserConfirmation: counted.needsUserConfirmation,
    truthfulnessPassed: counted.unsupported === 0 && counted.needsUserConfirmation === 0,
    coverageRatio: counted.total ? Number((counted.supported / counted.total).toFixed(4)) : 0
  };
  if (!claims.length) {
    summary.total = Math.max(0, Number(summaryInput.total || 0));
    summary.supported = Math.max(0, Number(summaryInput.supported || 0));
    summary.weak = Math.max(0, Number(summaryInput.weak || 0));
    summary.unsupported = Math.max(0, Number(summaryInput.unsupported || 0));
    summary.needsUserConfirmation = Math.max(0, Number(summaryInput.needsUserConfirmation || summaryInput.needs_user_confirmation || 0));
    summary.truthfulnessPassed = Boolean(summaryInput.truthfulnessPassed || summaryInput.truthfulness_passed);
    summary.coverageRatio = Number.isFinite(Number(summaryInput.coverageRatio ?? summaryInput.coverage_ratio))
      ? Math.max(0, Math.min(1, Number(summaryInput.coverageRatio ?? summaryInput.coverage_ratio)))
      : 0;
  }
  return {
    claims,
    summary,
    unsupportedClaims: normalizeArray(input.unsupportedClaims || input.unsupported_claims || []),
    needsUserConfirmation: normalizeArray(input.needsUserConfirmation || input.needs_user_confirmation || []),
    recommendations: normalizeResumeClaimRecommendations(input.recommendations || []),
    policy: input.policy && typeof input.policy === "object" ? input.policy : {},
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  };
}

function summarizeResumeClaimStatuses(claims) {
  const summary = {
    total: claims.length,
    supported: 0,
    weak: 0,
    unsupported: 0,
    needsUserConfirmation: 0
  };
  for (const claim of claims) {
    if (claim.status === "SUPPORTED") {
      summary.supported += 1;
    } else if (claim.status === "WEAK") {
      summary.weak += 1;
    } else if (claim.status === "NEEDS_USER_CONFIRMATION") {
      summary.needsUserConfirmation += 1;
    } else {
      summary.unsupported += 1;
    }
  }
  return summary;
}

function normalizeResumeClaimVerificationClaim(input = {}) {
  const status = cleanText(input.status || "");
  return {
    type: cleanText(input.type || ""),
    field: cleanText(input.field || input.resumeField || input.resume_field || ""),
    claim: cleanMultiline(input.claim || input.text || ""),
    criticality: cleanText(input.criticality || ""),
    status: new Set(["SUPPORTED", "WEAK", "UNSUPPORTED", "NEEDS_USER_CONFIRMATION"]).has(status) ? status : "UNSUPPORTED",
    confidence: cleanText(input.confidence || ""),
    evidence: input.evidence && typeof input.evidence === "object" ? input.evidence : null,
    sourceMappingCount: Math.max(0, Number(input.sourceMappingCount || input.source_mapping_count || 0)),
    reason: cleanMultiline(input.reason || "")
  };
}

function normalizeResumeClaimRecommendations(value) {
  const items = Array.isArray(value) ? value : [];
  return items.slice(0, 80).map((item) => {
    return item && typeof item === "object"
      ? item
      : { type: "note", reason: cleanText(item) };
  }).filter(Boolean);
}

function normalizeResumeFitRecommendations(value) {
  const items = Array.isArray(value) ? value : [];
  return items.slice(0, 50).map((item) => {
    return item && typeof item === "object"
      ? item
      : { type: "note", reason: cleanText(item) };
  }).filter(Boolean);
}

function normalizeResumeFitCoverageItem(input = {}) {
  const status = cleanText(input.status || "");
  return {
    type: cleanText(input.type || ""),
    requirement: cleanMultiline(input.requirement || ""),
    priority: cleanText(input.priority || ""),
    source: cleanText(input.source || ""),
    status: new Set(["covered", "weak", "missing"]).has(status) ? status : "missing",
    score: boundedInteger(input.score, 0, 100),
    evidenceField: cleanText(input.evidenceField || ""),
    evidenceText: cleanMultiline(input.evidenceText || "")
  };
}

function mergeResumeFields(base = {}, patch = {}) {
  const next = {
    ...normalizeResumeFieldsForRevision(base),
    ...normalizeResumeFieldsForRevision(patch)
  };
  if (Array.isArray(patch.projects)) {
    next.projects = patch.projects.slice(0, 8).map((project, index) => {
      const baseProject = Array.isArray(base.projects) && base.projects[index] && typeof base.projects[index] === "object"
        ? base.projects[index]
        : {};
      const patchProject = project && typeof project === "object" ? project : {};
      return {
        ...baseProject,
        ...patchProject,
        title: cleanText(hasOwn(patchProject, "title") ? patchProject.title : baseProject.title || ""),
        organization: cleanText(hasOwn(patchProject, "organization") ? patchProject.organization : baseProject.organization || ""),
        role: cleanText(hasOwn(patchProject, "role") ? patchProject.role : baseProject.role || ""),
        period: cleanText(hasOwn(patchProject, "period") ? patchProject.period : baseProject.period || ""),
        skills: normalizeArray(hasOwn(patchProject, "skills") ? patchProject.skills : baseProject.skills || []),
        bullets: normalizeArray(hasOwn(patchProject, "bullets") ? patchProject.bullets : baseProject.bullets || [])
      };
    }).filter((project) => project.title || project.organization || project.role || project.bullets.length);
  }
  if (Array.isArray(patch.education)) {
    next.education = patch.education.slice(0, 4).map((item, index) => {
      const baseItem = Array.isArray(base.education) && base.education[index] && typeof base.education[index] === "object"
        ? base.education[index]
        : {};
      const patchItem = item && typeof item === "object" ? item : {};
      return {
        ...baseItem,
        ...patchItem,
        title: cleanText(hasOwn(patchItem, "title") ? patchItem.title : baseItem.title || ""),
        organization: cleanText(hasOwn(patchItem, "organization") ? patchItem.organization : baseItem.organization || ""),
        role: cleanText(hasOwn(patchItem, "role") ? patchItem.role : baseItem.role || ""),
        period: cleanText(hasOwn(patchItem, "period") ? patchItem.period : baseItem.period || ""),
        bullets: normalizeArray(hasOwn(patchItem, "bullets") ? patchItem.bullets : baseItem.bullets || [])
      };
    }).filter((item) => item.title || item.organization || item.role || item.bullets.length);
  }
  return next;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeResumeFieldsForRevision(fields = {}) {
  const input = fields && typeof fields === "object" ? fields : {};
  const result = {};
  for (const key of ["name", "headline", "targetRole", "summary"]) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      result[key] = key === "summary" ? cleanMultiline(input[key]) : cleanText(input[key]);
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "skills")) {
    result.skills = normalizeArray(input.skills || []);
  }
  if (Object.prototype.hasOwnProperty.call(input, "awards")) {
    result.awards = normalizeArray(input.awards || []);
  }
  if (Array.isArray(input.projects)) {
    result.projects = input.projects;
  }
  if (Array.isArray(input.education)) {
    result.education = input.education;
  }
  return result;
}

function normalizeSourceMapping(value) {
  const items = Array.isArray(value) ? value : [];
  return items.slice(0, 200).map((item) => ({
    resumeField: cleanText(item?.resumeField || item?.resume_field || ""),
    sourceType: cleanText(item?.sourceType || item?.source_type || ""),
    sourceId: item?.sourceId === null || item?.source_id === null ? null : normalizeOptionalPositiveInteger(item?.sourceId || item?.source_id),
    sourceFact: cleanText(item?.sourceFact || item?.source_fact || "")
  })).filter((item) => item.resumeField || item.sourceFact);
}

function normalizeResumeAuditRecord(input = {}) {
  const recommendation = normalizeAuditRecommendation(input.recommendation || "");
  if (!recommendation) {
    throw validationError("Valid audit recommendation is required");
  }
  return {
    truthfulnessPassed: Boolean(input.truthfulnessPassed ?? input.truthfulness_passed),
    formatPassed: Boolean(input.formatPassed ?? input.format_passed),
    pageLimitPassed: Boolean(input.pageLimitPassed ?? input.page_limit_passed),
    unsupportedClaims: normalizeArray(input.unsupportedClaims || input.unsupported_claims || []),
    sourceIssues: normalizeArray(input.sourceIssues || input.source_issues || []),
    exaggerationRisk: normalizeAuditRisk(input.exaggerationRisk || input.exaggeration_risk || ""),
    jobFitReview: normalizeJobFitReview(input.jobFitReview || input.job_fit_review || ""),
    riskScoreAdjustment: boundedInteger(input.riskScoreAdjustment ?? input.risk_score_adjustment, -50, 50),
    recommendation,
    requiresUserConfirmation: Boolean(input.requiresUserConfirmation ?? input.requires_user_confirmation),
    renderMetadata: input.renderMetadata && typeof input.renderMetadata === "object" ? input.renderMetadata : input.render_metadata && typeof input.render_metadata === "object" ? input.render_metadata : {},
    riskFlags: normalizeArray(input.riskFlags || input.risk_flags || []),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  };
}

function normalizeGreetingDraftRecord(input = {}) {
  const messageText = cleanMultiline(input.messageText || input.message_text || input.text || "");
  if (!messageText) {
    throw validationError("Greeting message text is required");
  }
  return {
    messageText,
    channel: cleanText(input.channel || "boss_greeting"),
    actionMode: cleanText(input.actionMode || input.action_mode || "dry_run"),
    qualitySignals: normalizeArray(input.qualitySignals || input.quality_signals || []),
    requiresUserConfirmation: input.requiresUserConfirmation !== false && input.requires_user_confirmation !== false,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {}
  };
}

function normalizeConversationMessageSnapshots(messages = []) {
  const values = Array.isArray(messages) ? messages : [];
  return values
    .map((item) => {
      const text = cleanMultiline(item?.text || item?.messageText || item?.message_text || "");
      if (!text) {
        return null;
      }
      return {
        text: text.slice(0, 1000),
        direction: normalizeMessageDirection(item?.direction || ""),
        timestamp: cleanText(item?.timestamp || item?.time || item?.sentAt || item?.createdAt || ""),
        confidence: Number.isFinite(Number(item?.confidence)) ? Number(item.confidence) : null
      };
    })
    .filter(Boolean)
    .slice(-50);
}

function normalizeMessageDirection(value) {
  const direction = cleanText(value).toUpperCase();
  if (new Set(["OUTBOUND", "INBOUND", "SYSTEM"]).has(direction)) {
    return direction;
  }
  if (new Set(["SENT", "SELF", "ME", "MINE"]).has(direction)) {
    return "OUTBOUND";
  }
  if (new Set(["RECEIVED", "BOSS", "RECRUITER", "OTHER"]).has(direction)) {
    return "INBOUND";
  }
  return "UNKNOWN";
}

function conversationMessageArchiveKey(message = {}) {
  const text = cleanMultiline(message.text || message.messageText || "");
  if (!text) {
    return "";
  }
  return [
    normalizeMessageDirection(message.direction || ""),
    cleanText(message.timestamp || ""),
    text
  ].join("|");
}

function assessCommunicationState(messages = [], conversation = {}, resumeUnlock = {}) {
  const normalizedMessages = Array.isArray(messages)
    ? messages.map((message) => ({
      direction: normalizeMessageDirection(message.direction || ""),
      text: cleanMultiline(message.text || message.messageText || ""),
      channel: cleanText(message.channel || ""),
      status: cleanText(message.status || ""),
      createdAt: cleanText(message.createdAt || ""),
      metadata: message.metadata && typeof message.metadata === "object" ? message.metadata : {}
    })).filter((message) => message.text)
    : [];
  const inbound = normalizedMessages.filter((message) => message.direction === "INBOUND");
  const outbound = normalizedMessages.filter((message) => message.direction === "OUTBOUND");
  const allText = normalizedMessages.map((message) => message.text).join("\n");
  const inboundText = inbound.map((message) => message.text).join("\n");
  const resumeRequested = Boolean(resumeUnlock?.unlocked) || hasResumeRequestSignal(inboundText || allText);
  const recruiterReplied = inbound.length > 0;
  const waitingForReply = Boolean(conversation?.requiresReply)
    || (!recruiterReplied && outbound.some((message) => message.channel === "boss_greeting" || message.status === "DRAFT" || message.status === "CAPTURED"));
  let state = "CONVERSATION_UNKNOWN";
  const signals = [];
  if (resumeRequested) {
    state = "RESUME_REQUESTED";
    signals.push("resume_request_signal");
  } else if (recruiterReplied) {
    state = "RECRUITER_REPLIED";
    signals.push("inbound_message_seen");
  } else if (waitingForReply) {
    state = "WAITING_FOR_REPLY";
    signals.push("waiting_for_reply");
  } else if (conversation?.chatOpened) {
    state = "CHAT_OPENED_NO_MESSAGES";
    signals.push("chat_opened");
  }
  if (resumeUnlock?.unlocked) {
    signals.push("resume_unlock_visible");
  }
  return {
    state,
    recruiterReplied,
    resumeRequested,
    waitingForReply,
    inboundCount: inbound.length,
    outboundCount: outbound.length,
    messageCount: normalizedMessages.length,
    latestInboundText: inbound.length ? inbound[inbound.length - 1].text.slice(0, 240) : "",
    latestOutboundText: outbound.length ? outbound[outbound.length - 1].text.slice(0, 240) : "",
    signals: Array.from(new Set(signals))
  };
}

function hasResumeRequestSignal(text) {
  const value = cleanMultiline(text);
  if (!value) {
    return false;
  }
  return /发.{0,8}简历|投.{0,8}简历|传.{0,8}简历|附件简历|在线简历|请.{0,8}简历|send.{0,12}resume|resume/i.test(value);
}

function recommendNextConversationAction(input = {}) {
  const assessment = input.communicationAssessment && typeof input.communicationAssessment === "object"
    ? input.communicationAssessment
    : {};
  const resumeUnlock = input.resumeUnlock && typeof input.resumeUnlock === "object" ? input.resumeUnlock : {};
  const submissionReadiness = input.submissionReadiness && typeof input.submissionReadiness === "object" ? input.submissionReadiness : {};
  const applicationStatus = normalizeApplicationStatus(input.applicationStatus || "") || "UNKNOWN";
  const state = cleanText(assessment.state || "CONVERSATION_UNKNOWN").toUpperCase();
  const readinessStatus = cleanText(submissionReadiness.status || "").toUpperCase();
  const readinessHasDryRunEvidence = Boolean(submissionReadiness?.evidence?.uploadDryRunSeen || submissionReadiness?.evidence?.submitDryRunSeen);
  if (readinessHasDryRunEvidence && readinessStatus === "READY_FOR_MANUAL_REVIEW") {
    return {
      action: "REVIEW_SUBMISSION_READINESS",
      priority: "high",
      reason: "upload_and_submit_dry_run_ready",
      requiresUserConfirmation: true,
      noRealBossAction: true,
      allowedTaskTypes: ["UPLOAD_RESUME", "SUBMIT_APPLICATION"],
      blockedTaskTypes: ["UPLOAD_RESUME_REAL", "SUBMIT_APPLICATION_REAL"],
      applicationStatus,
      submissionReadiness
    };
  }
  if (readinessHasDryRunEvidence && readinessStatus === "BLOCKED") {
    return {
      action: "RESOLVE_SUBMISSION_BLOCKER",
      priority: "high",
      reason: submissionReadiness.reason || "submission_readiness_blocked",
      requiresUserConfirmation: true,
      noRealBossAction: true,
      allowedTaskTypes: ["REFRESH_CONVERSATION", "CHECK_RESUME_UNLOCK", "UPLOAD_RESUME", "SUBMIT_APPLICATION"],
      blockedTaskTypes: ["UPLOAD_RESUME_REAL", "SUBMIT_APPLICATION_REAL"],
      applicationStatus,
      submissionReadiness
    };
  }
  if (assessment.resumeRequested || resumeUnlock.unlocked || state === "RESUME_REQUESTED") {
    return {
      action: "PREPARE_RESUME_UPLOAD_DRY_RUN",
      priority: "high",
      reason: resumeUnlock.unlocked ? "resume_unlock_visible" : "resume_requested_by_recruiter",
      requiresUserConfirmation: true,
      noRealBossAction: true,
      allowedTaskTypes: ["CHECK_RESUME_UNLOCK"],
      blockedTaskTypes: ["UPLOAD_RESUME", "SUBMIT_APPLICATION"],
      applicationStatus
    };
  }
  if (state === "RECRUITER_REPLIED") {
    return {
      action: "REVIEW_RECRUITER_REPLY",
      priority: "medium",
      reason: "inbound_message_seen",
      requiresUserConfirmation: true,
      noRealBossAction: true,
      allowedTaskTypes: ["REFRESH_CONVERSATION", "CHECK_RESUME_UNLOCK"],
      blockedTaskTypes: ["UPLOAD_RESUME", "SUBMIT_APPLICATION"],
      applicationStatus
    };
  }
  if (state === "WAITING_FOR_REPLY") {
    return {
      action: "WAIT_FOR_REPLY",
      priority: "low",
      reason: "no_inbound_message_seen",
      requiresUserConfirmation: false,
      noRealBossAction: true,
      allowedTaskTypes: ["REFRESH_CONVERSATION"],
      blockedTaskTypes: ["UPLOAD_RESUME", "SUBMIT_APPLICATION"],
      applicationStatus
    };
  }
  if (state === "CHAT_OPENED_NO_MESSAGES") {
    return {
      action: "REFRESH_CONVERSATION_LATER",
      priority: "low",
      reason: "chat_opened_without_messages",
      requiresUserConfirmation: false,
      noRealBossAction: true,
      allowedTaskTypes: ["REFRESH_CONVERSATION"],
      blockedTaskTypes: ["UPLOAD_RESUME", "SUBMIT_APPLICATION"],
      applicationStatus
    };
  }
  return {
    action: "REFRESH_CONVERSATION",
    priority: "low",
    reason: "conversation_state_unknown",
    requiresUserConfirmation: false,
    noRealBossAction: true,
    allowedTaskTypes: ["REFRESH_CONVERSATION", "CHECK_RESUME_UNLOCK"],
    blockedTaskTypes: ["UPLOAD_RESUME", "SUBMIT_APPLICATION"],
    applicationStatus
  };
}

function assessSubmissionReadiness(input = {}) {
  const applicationStatus = normalizeApplicationStatus(input.applicationStatus || "") || "UNKNOWN";
  const assessment = input.communicationAssessment && typeof input.communicationAssessment === "object"
    ? input.communicationAssessment
    : {};
  const resumeUnlock = input.resumeUnlock && typeof input.resumeUnlock === "object" ? input.resumeUnlock : {};
  const uploadDryRun = input.uploadDryRun && typeof input.uploadDryRun === "object" ? input.uploadDryRun : null;
  const submitDryRun = input.submitDryRun && typeof input.submitDryRun === "object" ? input.submitDryRun : null;
  const uploadReady = Boolean(uploadDryRun && (
    uploadDryRun.fileInputUsable
    || uploadDryRun.uploadActionVisible
    || cleanText(uploadDryRun.status || "").toUpperCase() === "UPLOAD_DRY_RUN_READY"
  ));
  const uploadBlocked = Boolean(uploadDryRun && (
    uploadDryRun.uploaded === true
    || uploadDryRun.submitted === true
  ));
  const submitReady = Boolean(submitDryRun && submitDryRun.submitActionVisible && !submitDryRun.lockedSignalVisible);
  const submitBlocked = Boolean(submitDryRun && (
    submitDryRun.lockedSignalVisible
    || submitDryRun.clickedSubmit === true
    || submitDryRun.confirmed === true
    || submitDryRun.submitted === true
  ));
  const evidence = {
    applicationStatus,
    communicationState: cleanText(assessment.state || ""),
    resumeRequested: Boolean(assessment.resumeRequested),
    resumeUnlocked: Boolean(resumeUnlock.unlocked),
    uploadDryRunSeen: Boolean(uploadDryRun),
    uploadReady,
    submitDryRunSeen: Boolean(submitDryRun),
    submitReady
  };
  const blockers = [];
  if (!resumeUnlock.unlocked && !assessment.resumeRequested) {
    blockers.push("resume_not_requested_or_unlocked");
  }
  if (uploadBlocked) {
    blockers.push("upload_dry_run_reported_real_action");
  }
  if (submitBlocked) {
    blockers.push(submitDryRun?.lockedSignalVisible ? "submit_entry_locked" : "submit_dry_run_reported_real_action");
  }
  if (blockers.length) {
    return {
      status: "BLOCKED",
      reason: blockers[0],
      confidence: submitBlocked || uploadBlocked ? 0.9 : 0.7,
      requiresUserConfirmation: true,
      noRealBossAction: true,
      allowedTaskTypes: ["REFRESH_CONVERSATION", "CHECK_RESUME_UNLOCK", "UPLOAD_RESUME", "SUBMIT_APPLICATION"],
      blockedTaskTypes: ["UPLOAD_RESUME_REAL", "SUBMIT_APPLICATION_REAL"],
      evidence,
      blockers
    };
  }
  const missingEvidence = [];
  if (!uploadReady) {
    missingEvidence.push("upload_dry_run_ready");
  }
  if (!submitReady) {
    missingEvidence.push("submit_dry_run_ready");
  }
  if (missingEvidence.length) {
    return {
      status: "INSUFFICIENT_EVIDENCE",
      reason: `missing_${missingEvidence[0]}`,
      confidence: 0.45,
      requiresUserConfirmation: true,
      noRealBossAction: true,
      allowedTaskTypes: ["UPLOAD_RESUME", "SUBMIT_APPLICATION"],
      blockedTaskTypes: ["UPLOAD_RESUME_REAL", "SUBMIT_APPLICATION_REAL"],
      evidence,
      missingEvidence
    };
  }
  return {
    status: "READY_FOR_MANUAL_REVIEW",
    reason: "upload_and_submit_dry_run_ready",
    confidence: 0.8,
    requiresUserConfirmation: true,
    noRealBossAction: true,
    allowedTaskTypes: ["UPLOAD_RESUME", "SUBMIT_APPLICATION"],
    blockedTaskTypes: ["UPLOAD_RESUME_REAL", "SUBMIT_APPLICATION_REAL"],
    evidence,
    blockers: [],
    missingEvidence: []
  };
}

function normalizeAuditRecommendation(value) {
  const recommendation = cleanText(value).toLowerCase();
  return new Set(["approve", "revise", "block"]).has(recommendation) ? recommendation : "";
}

function normalizeAuditRisk(value) {
  const risk = cleanText(value).toLowerCase();
  return new Set(["low", "medium", "high"]).has(risk) ? risk : "medium";
}

function normalizeJobFitReview(value) {
  const review = cleanText(value).toLowerCase();
  return new Set(["good", "mixed", "weak"]).has(review) ? review : "mixed";
}

function normalizeHardConditions(value) {
  const items = Array.isArray(value) ? value : [];
  return items.slice(0, 30).map((item, index) => ({
    name: cleanText(item?.name || `condition_${index + 1}`),
    passed: Boolean(item?.passed),
    reason: cleanText(item?.reason || "")
  }));
}

function normalizeScreeningRecommendation(value) {
  const recommendation = cleanText(value).toLowerCase();
  return new Set(["auto_prepare", "review_needed", "skip"]).has(recommendation) ? recommendation : "";
}

function normalizeScreeningRecommendationList(value) {
  const values = Array.isArray(value) ? value : [value];
  return Array.from(new Set(values.map(normalizeScreeningRecommendation).filter(Boolean)));
}

function normalizeScreeningConfidence(value) {
  const confidence = cleanText(value).toLowerCase();
  return new Set(["low", "medium", "high"]).has(confidence) ? confidence : "low";
}

function screeningRecommendationToStatus(recommendation) {
  if (recommendation === "auto_prepare") {
    return "SHORTLISTED";
  }
  if (recommendation === "skip") {
    return "SKIPPED";
  }
  return "SCORED";
}

function boundedInteger(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeExperienceInput(input = {}) {
  return {
    kind: normalizeExperienceKind(input.kind || input.type || ""),
    title: cleanText(input.title || ""),
    organization: cleanText(input.organization || input.company || input.school || ""),
    role: cleanText(input.role || ""),
    startDate: cleanText(input.startDate || input.start_date || ""),
    endDate: cleanText(input.endDate || input.end_date || ""),
    facts: normalizeArray(input.facts || []),
    skills: normalizeArray(input.skills || []),
    evidenceText: cleanMultiline(input.evidenceText || input.evidence || ""),
    evidenceSource: cleanText(input.evidenceSource || input.source || ""),
    confidence: normalizeFactConfidence(input.confidence || ""),
    allowedRewrites: normalizeArray(input.allowedRewrites || input.allowed_rewrites || []),
    forbiddenClaims: normalizeArray(input.forbiddenClaims || input.forbidden_claims || [])
  };
}

function normalizeExperienceKind(value) {
  const kind = cleanText(value).toLowerCase();
  return new Set(["work", "project", "education", "award", "certification", "activity", "other"]).has(kind)
    ? kind
    : "project";
}

function normalizeFactConfidence(value) {
  const confidence = cleanText(value).toLowerCase();
  return new Set(["confirmed", "user_confirmed", "inferred", "needs_review"]).has(confidence)
    ? confidence
    : "user_confirmed";
}

function normalizeSkillProficiency(value) {
  const proficiency = cleanText(value).toLowerCase();
  return new Set(["aware", "basic", "familiar", "proficient", "expert"]).has(proficiency)
    ? proficiency
    : "familiar";
}

function normalizeConstraintRuleType(value) {
  const ruleType = cleanText(value).toLowerCase();
  return new Set(["forbidden_claim", "allowed_rewrite", "preference", "hard_limit", "risk_note", "excluded_direction"]).has(ruleType)
    ? ruleType
    : "";
}

function normalizeConstraintSeverity(value) {
  const severity = cleanText(value).toLowerCase();
  return new Set(["info", "warning", "blocker"]).has(severity) ? severity : "warning";
}

function normalizeApplicationStatusList(value) {
  const values = Array.isArray(value) ? value : [value];
  return Array.from(new Set(values.map(normalizeApplicationStatus).filter(Boolean)));
}

const BROWSER_TASK_TYPES = new Set([
  "CAPTURE_DETAIL",
  "SEND_GREETING",
  "SEND_GREETING_REAL",
  "REFRESH_CONVERSATION",
  "CHECK_RESUME_UNLOCK",
  "UPLOAD_RESUME",
  "SUBMIT_APPLICATION"
]);

function normalizeTaskType(value) {
  const taskType = cleanText(value).toUpperCase();
  return BROWSER_TASK_TYPES.has(taskType) ? taskType : "";
}

function normalizeTaskTypeList(value) {
  const values = Array.isArray(value) ? value : [value];
  return Array.from(new Set(values.map(normalizeTaskType).filter(Boolean)));
}

function normalizeReadinessStatusList(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  const allowed = new Set(["READY_FOR_MANUAL_REVIEW", "INSUFFICIENT_EVIDENCE", "BLOCKED", "ALL"]);
  const normalized = Array.from(new Set(values
    .map((item) => cleanText(item).toUpperCase())
    .filter((item) => allowed.has(item))));
  return normalized.length ? normalized : ["READY_FOR_MANUAL_REVIEW"];
}

function normalizeSubmissionReadinessReviewDecision(value) {
  const decision = cleanText(value).toUpperCase();
  return new Set(["APPROVED_FOR_MANUAL_EXECUTION", "BLOCKED", "REFRESH_REQUIRED"]).has(decision) ? decision : "";
}

function taskPayloadMatchesSourceUrl(payload = {}, requestedSourceUrl) {
  const sourceUrl = normalizeComparableUrl(payload.sourceUrl || payload.pageUrl || "");
  const detailUrl = normalizeComparableUrl(payload.detailUrl || payload.url || "");
  const requestedJobId = extractJobId(requestedSourceUrl);
  const detailJobId = extractJobId(detailUrl);
  if (!requestedSourceUrl) {
    return true;
  }
  return Boolean(
    (sourceUrl && sourceUrl === requestedSourceUrl)
    || (detailUrl && detailUrl === requestedSourceUrl)
    || (requestedJobId && detailJobId && requestedJobId === detailJobId)
  );
}

function normalizeComparableUrl(value) {
  const text = cleanText(value);
  if (!text) {
    return "";
  }
  try {
    const url = new URL(text);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}${url.search}`;
  } catch {
    return text.replace(/#.*$/, "").replace(/\/+([?]|$)/, "$1");
  }
}

const BROWSER_TASK_STATUSES = new Set([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELED"
]);

const BROWSER_TASK_TRANSITIONS = {
  QUEUED: new Set(["RUNNING", "SUCCEEDED", "FAILED", "CANCELED"]),
  RUNNING: new Set(["SUCCEEDED", "FAILED", "CANCELED"]),
  SUCCEEDED: new Set([]),
  FAILED: new Set(["QUEUED"]),
  CANCELED: new Set(["QUEUED"])
};

function normalizeBrowserTaskStatus(value) {
  const status = cleanText(value).toUpperCase();
  return BROWSER_TASK_STATUSES.has(status) ? status : "";
}

function normalizeBrowserTaskStatusList(value) {
  const values = Array.isArray(value) ? value : [value];
  return Array.from(new Set(values.map(normalizeBrowserTaskStatus).filter(Boolean)));
}

function canTransitionBrowserTask(fromStatus, toStatus) {
  const from = normalizeBrowserTaskStatus(fromStatus);
  const to = normalizeBrowserTaskStatus(toStatus);
  if (!from || !to) {
    return false;
  }
  if (from === to) {
    return true;
  }
  return Boolean(BROWSER_TASK_TRANSITIONS[from]?.has(to));
}

function resolveBrowserTaskExpiry(value, taskType, now = new Date().toISOString()) {
  const explicit = cleanText(value || "");
  if (explicit) {
    const parsed = Date.parse(explicit);
    if (!Number.isFinite(parsed)) {
      throw validationError("Valid browser task expiry timestamp is required");
    }
    return new Date(parsed).toISOString();
  }
  const configuredTtl = Number(process.env.BOSS_BROWSER_TASK_TTL_MS || 0);
  const ttlMs = Number.isFinite(configuredTtl) && configuredTtl > 0
    ? configuredTtl
    : browserTaskDefaultTtlMs(taskType);
  return new Date(Date.parse(now) + ttlMs).toISOString();
}

function browserTaskDefaultTtlMs(taskType) {
  if (isRealActionType(taskType)) {
    return 5 * 60 * 1000;
  }
  return new Set(["UPLOAD_RESUME", "SUBMIT_APPLICATION"]).has(normalizeTaskType(taskType))
    ? 10 * 60 * 1000
    : 30 * 60 * 1000;
}

function normalizeBrowserTaskMaxAttempts(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 3;
  }
  return Math.max(1, Math.min(10, Math.trunc(parsed)));
}

function browserTaskIsExpired(task, now = new Date().toISOString()) {
  const expiresAt = cleanText(task?.expires_at || task?.expiresAt || "");
  return Boolean(expiresAt && Date.parse(expiresAt) <= Date.parse(now));
}

function advanceApplicationStatus(currentStatus, candidateStatus) {
  const order = {
    LIST_CAPTURED: 10,
    DETAIL_CAPTURED: 20,
    SCORED: 30,
    SHORTLISTED: 40,
    RESUME_DRAFTED: 50,
    RESUME_AUDITED: 60,
    GREETING_READY: 70,
    GREETING_SENT: 80,
    CHAT_OPENED: 90,
    RESUME_UNLOCKED: 100,
    SUBMISSION_READY: 110,
    SUBMITTED: 120,
    SKIPPED: 1000,
    NEEDS_USER_REVIEW: 1000,
    NEEDS_MANUAL_ACTION: 1000,
    FAILED: 1000
  };
  return (order[candidateStatus] || 0) > (order[currentStatus] || 0)
    ? candidateStatus
    : currentStatus;
}

function hasRequiredFields(job) {
  return Boolean(cleanText(job?.title) && cleanText(job?.company) && cleanText(job?.detailUrl));
}

function summarizeMissingFields(jobs) {
  const fields = ["title", "company", "salary", "location", "detailUrl", "description"];
  const result = Object.fromEntries(fields.map((field) => [field, 0]));
  for (const job of jobs) {
    for (const field of fields) {
      if (!cleanText(job?.[field])) {
        result[field] += 1;
      }
    }
  }
  return result;
}

function mergeSelectorCounts(pages) {
  const counts = {};
  for (const page of pages) {
    const selectorCounts = page?.selectorCounts || page?.diagnostics?.selectorCounts || {};
    for (const [key, value] of Object.entries(selectorCounts)) {
      counts[key] = (counts[key] || 0) + Number(value || 0);
    }
  }
  return counts;
}

function summarizeSearchContext(pages) {
  return pages.map((page) => page?.searchContext || {
    url: page?.url || page?.diagnostics?.url || "",
    title: page?.title || page?.diagnostics?.title || ""
  }).filter((item) => item.url || item.title);
}

function ratio(part, total) {
  return total > 0 ? part / total : 0;
}

function extractJobId(url) {
  const match = String(url || "").match(/\/job_detail\/([^/?#]+?)(?:\.html)?(?:[?#]|$)/);
  return match ? match[1] : "";
}

function stableKey(parts) {
  return parts.map((part) => cleanText(part)).filter(Boolean).join("|").toLowerCase();
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function conflictError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  error.code = "BROWSER_TASK_CALLBACK_CONFLICT";
  return error;
}

module.exports = {
  SCHEMA_VERSION,
  createJobStore,
  normalizeJob,
  isValidJob
};
