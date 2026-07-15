"use strict";

const APPLICATION_STATUSES = new Set([
  "LIST_CAPTURED",
  "DETAIL_CAPTURED",
  "SCORED",
  "SHORTLISTED",
  "RESUME_DRAFTED",
  "RESUME_AUDITED",
  "GREETING_READY",
  "GREETING_SENT",
  "CHAT_OPENED",
  "RESUME_UNLOCKED",
  "SUBMISSION_READY",
  "SUBMITTED",
  "SKIPPED",
  "NEEDS_USER_REVIEW",
  "NEEDS_MANUAL_ACTION",
  "FAILED"
]);

const APPLICATION_TRANSITIONS = {
  LIST_CAPTURED: new Set(["DETAIL_CAPTURED", "SKIPPED", "NEEDS_USER_REVIEW", "NEEDS_MANUAL_ACTION", "FAILED"]),
  DETAIL_CAPTURED: new Set(["SCORED", "SHORTLISTED", "SKIPPED", "NEEDS_USER_REVIEW", "NEEDS_MANUAL_ACTION", "FAILED"]),
  SCORED: new Set(["SHORTLISTED", "SKIPPED", "NEEDS_USER_REVIEW", "NEEDS_MANUAL_ACTION", "FAILED"]),
  SHORTLISTED: new Set(["RESUME_DRAFTED", "GREETING_READY", "SKIPPED", "NEEDS_USER_REVIEW", "NEEDS_MANUAL_ACTION", "FAILED"]),
  RESUME_DRAFTED: new Set(["RESUME_AUDITED", "NEEDS_USER_REVIEW", "NEEDS_MANUAL_ACTION", "FAILED"]),
  RESUME_AUDITED: new Set(["GREETING_READY", "NEEDS_USER_REVIEW", "NEEDS_MANUAL_ACTION", "FAILED"]),
  GREETING_READY: new Set(["GREETING_SENT", "CHAT_OPENED", "NEEDS_USER_REVIEW", "NEEDS_MANUAL_ACTION", "FAILED"]),
  GREETING_SENT: new Set(["CHAT_OPENED", "RESUME_UNLOCKED", "NEEDS_USER_REVIEW", "NEEDS_MANUAL_ACTION", "FAILED"]),
  CHAT_OPENED: new Set(["RESUME_UNLOCKED", "NEEDS_USER_REVIEW", "NEEDS_MANUAL_ACTION", "FAILED"]),
  RESUME_UNLOCKED: new Set(["SUBMISSION_READY", "NEEDS_USER_REVIEW", "NEEDS_MANUAL_ACTION", "FAILED"]),
  SUBMISSION_READY: new Set(["SUBMITTED", "NEEDS_USER_REVIEW", "NEEDS_MANUAL_ACTION", "FAILED"]),
  NEEDS_USER_REVIEW: new Set(["SCORED", "SHORTLISTED", "RESUME_DRAFTED", "RESUME_AUDITED", "GREETING_READY", "NEEDS_MANUAL_ACTION", "SKIPPED", "FAILED"]),
  NEEDS_MANUAL_ACTION: new Set(["LIST_CAPTURED", "DETAIL_CAPTURED", "SCORED", "SHORTLISTED", "GREETING_READY", "GREETING_SENT", "CHAT_OPENED", "RESUME_UNLOCKED", "SUBMISSION_READY", "SKIPPED", "FAILED"]),
  FAILED: new Set(["LIST_CAPTURED", "DETAIL_CAPTURED", "NEEDS_MANUAL_ACTION"]),
  SKIPPED: new Set(["DETAIL_CAPTURED"]),
  SUBMITTED: new Set()
};

const TARGET_EVIDENCE_TYPES = {
  LIST_CAPTURED: new Set(["job_sync", "operator_override"]),
  DETAIL_CAPTURED: new Set(["job_sync", "operator_override"]),
  SCORED: new Set(["screening", "operator_override"]),
  SHORTLISTED: new Set(["screening", "operator_override"]),
  SKIPPED: new Set(["screening", "operator_override"]),
  RESUME_DRAFTED: new Set(["resume_version", "operator_override"]),
  RESUME_AUDITED: new Set(["resume_audit", "operator_override"]),
  GREETING_READY: new Set(["local_resume_approval", "operator_override"]),
  GREETING_SENT: new Set(["message_sent"]),
  CHAT_OPENED: new Set(["browser_task_result", "operator_override"]),
  RESUME_UNLOCKED: new Set(["browser_task_result", "operator_override"]),
  SUBMISSION_READY: new Set(["submission_readiness_review"]),
  SUBMITTED: new Set(["submission_evidence"]),
  NEEDS_USER_REVIEW: new Set(["failure", "operator_override"]),
  NEEDS_MANUAL_ACTION: new Set(["failure", "operator_override"]),
  FAILED: new Set(["failure", "operator_override"])
};

const OPERATOR_OVERRIDE_BLOCKED_TARGETS = new Set([
  "GREETING_SENT",
  "SUBMISSION_READY",
  "SUBMITTED"
]);

const SCREENING_TARGETS = {
  auto_prepare: "SHORTLISTED",
  skip: "SKIPPED",
  review_needed: "SCORED"
};

const FAILURE_RESUME_AUDIT_STATUSES = new Set(["NEEDS_REVISION", "BLOCKED"]);

class ApplicationTransitionService {
  constructor(options = {}) {
    if (!options.database) {
      throw new Error("ApplicationTransitionService requires a database");
    }
    if (typeof options.insertApplicationEvent !== "function") {
      throw new Error("ApplicationTransitionService requires insertApplicationEvent");
    }
    if (typeof options.insertWorkflowEvent !== "function") {
      throw new Error("ApplicationTransitionService requires insertWorkflowEvent");
    }
    this.database = options.database;
    this.insertApplicationEvent = options.insertApplicationEvent;
    this.insertWorkflowEvent = options.insertWorkflowEvent;
  }

  transition(applicationId, transition = {}) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = this.transitionWithinTransaction(applicationId, transition);
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  transitionWithinTransaction(applicationId, transition = {}) {
    const id = normalizePositiveInteger(applicationId);
    if (!id) {
      throw validationError("Valid application id is required");
    }
    const toStatus = normalizeApplicationStatus(transition.toStatus || transition.status);
    if (!toStatus) {
      throw validationError("Target status is required");
    }

    const reason = cleanText(transition.reason || "application_transition");
    const eventType = cleanText(transition.eventType || "APPLICATION_TRANSITIONED");
    const metadata = transition.metadata && typeof transition.metadata === "object" ? transition.metadata : {};
    const evidence = normalizeEvidence(transition.evidence || metadata.transitionEvidence || {});
    const providedIdempotencyKey = normalizeIdempotencyKey(
      transition.idempotencyKey || metadata.idempotencyKey
    );
    const idempotencyKey = providedIdempotencyKey
      || normalizeIdempotencyKey(deriveIdempotencyKey(evidence, toStatus));
    const now = cleanText(transition.now || new Date().toISOString());

    if (evidence.type === "operator_override" && !providedIdempotencyKey) {
      throw evidenceError("Operator override requires an explicit idempotency key");
    }
    if (idempotencyKey) {
      const previous = this.database.prepare(`
        SELECT *
        FROM application_events
        WHERE application_id = ? AND idempotency_key = ?
        LIMIT 1
      `).get(id, idempotencyKey);
      if (previous) {
        if (previous.to_status !== toStatus || previous.event_type !== eventType) {
          throw conflictError(`Application transition idempotency conflict: ${idempotencyKey}`);
        }
        return transitionResultFromEvent(previous, {
          idempotent: true,
          changed: false
        });
      }
    }

    const application = this.database.prepare("SELECT * FROM applications WHERE id = ?").get(id);
    if (!application) {
      throw validationError(`Application not found: ${id}`);
    }
    if (application.status === toStatus) {
      return {
        ok: true,
        applicationId: id,
        fromStatus: application.status,
        toStatus,
        changed: false,
        idempotent: true,
        applicationEventId: null,
        eventType,
        reason,
        idempotencyKey,
        updatedAt: application.updated_at || now
      };
    }
    if (!canTransitionApplication(application.status, toStatus)) {
      throw validationError(`Invalid application transition: ${application.status} -> ${toStatus}`);
    }

    const validatedEvidence = this.validateEvidence(id, toStatus, evidence);
    this.database.prepare(`
      UPDATE applications
      SET status = ?, status_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(toStatus, reason, now, id);

    const eventMetadata = {
      ...metadata,
      transitionEvidence: validatedEvidence
    };
    const applicationEventId = this.insertApplicationEvent({
      applicationId: id,
      fromStatus: application.status,
      toStatus,
      eventType,
      reason,
      metadata: eventMetadata,
      idempotencyKey,
      now
    });
    this.insertWorkflowEvent({
      applicationId: id,
      sourceType: "application_event",
      sourceId: applicationEventId,
      eventType,
      severity: reasonSeverity(reason, eventMetadata),
      status: toStatus,
      progressCurrent: 1,
      progressTotal: 1,
      message: `Application moved from ${application.status} to ${toStatus}.`,
      errorCode: isErrorLikeEvent(eventType, reason) ? reason : "",
      errorMessage: isErrorLikeEvent(eventType, reason)
        ? cleanText(eventMetadata?.error?.message || eventMetadata?.message || reason)
        : "",
      metadata: {
        fromStatus: application.status,
        toStatus,
        reason,
        eventType,
        idempotencyKey,
        transitionEvidence: validatedEvidence,
        transitionMetadata: metadata
      }
    }, now);

    return {
      ok: true,
      applicationId: id,
      fromStatus: application.status,
      toStatus,
      changed: true,
      idempotent: false,
      applicationEventId,
      eventType,
      reason,
      idempotencyKey,
      updatedAt: now
    };
  }

  validateEvidence(applicationId, toStatus, evidence) {
    const allowedTypes = TARGET_EVIDENCE_TYPES[toStatus] || new Set();
    if (!evidence.type || !allowedTypes.has(evidence.type)) {
      throw evidenceError(`Transition to ${toStatus} requires evidence type: ${Array.from(allowedTypes).join(", ")}`);
    }

    if (evidence.type === "operator_override") {
      if (OPERATOR_OVERRIDE_BLOCKED_TARGETS.has(toStatus)) {
        throw evidenceError(`Operator override is not allowed for ${toStatus}`);
      }
      if (!evidence.actor || !evidence.rationale) {
        throw evidenceError("Operator override requires actor and rationale");
      }
      return evidence;
    }
    if (evidence.type === "job_sync") {
      const row = this.database.prepare(`
        SELECT
          capture_batches.id AS capture_batch_id,
          LENGTH(TRIM(COALESCE(jobs.description, ''))) AS description_length
        FROM applications
        JOIN jobs ON jobs.id = applications.job_id
        JOIN job_snapshots
          ON job_snapshots.job_id = jobs.id
          AND job_snapshots.batch_id = ?
        JOIN capture_batches ON capture_batches.id = job_snapshots.batch_id
        WHERE applications.id = ?
        LIMIT 1
      `).get(evidence.sourceId, applicationId);
      if (
        evidence.sourceType !== "capture_batch"
        || !evidence.sourceId
        || Number(row?.capture_batch_id || 0) !== evidence.sourceId
      ) {
        throw evidenceError("Job sync evidence must reference a capture batch containing this application's job");
      }
      if (toStatus === "DETAIL_CAPTURED" && Number(row?.description_length || 0) < 80) {
        throw evidenceError("DETAIL_CAPTURED requires a usable job description");
      }
      return evidence;
    }
    if (evidence.type === "screening") {
      const row = this.database.prepare(`
        SELECT recommendation
        FROM screenings
        WHERE id = ? AND application_id = ?
      `).get(evidence.sourceId, applicationId);
      if (!row) {
        throw evidenceError(`Evidence screenings#${evidence.sourceId || "missing"} does not belong to application ${applicationId}`);
      }
      const expectedStatus = SCREENING_TARGETS[cleanText(row.recommendation).toLowerCase()] || "";
      if (expectedStatus !== toStatus) {
        throw evidenceError(`Screening recommendation ${row.recommendation || "missing"} cannot transition to ${toStatus}`);
      }
      return evidence;
    }
    if (evidence.type === "resume_version") {
      assertOwnedRow(this.database, "resume_versions", evidence.sourceId, applicationId);
      return evidence;
    }
    if (evidence.type === "resume_audit") {
      const row = this.database.prepare(`
        SELECT resume_audits.status, resume_versions.application_id
        FROM resume_audits
        JOIN resume_versions ON resume_versions.id = resume_audits.resume_version_id
        WHERE resume_audits.id = ?
      `).get(evidence.sourceId);
      if (!row || Number(row.application_id) !== applicationId || row.status !== "APPROVED") {
        throw evidenceError("RESUME_AUDITED requires an approved resume audit for this application");
      }
      return evidence;
    }
    if (evidence.type === "local_resume_approval") {
      const row = this.database.prepare(`
        SELECT status, metadata_json
        FROM resume_versions
        WHERE id = ? AND application_id = ?
      `).get(evidence.sourceId, applicationId);
      const metadata = parseJsonValue(row?.metadata_json, {});
      if (!row || row.status !== "APPROVED" || metadata?.localApproval?.approved !== true) {
        throw evidenceError("GREETING_READY requires an approved and locally approved resume version");
      }
      return evidence;
    }
    if (evidence.type === "browser_task_result") {
      const row = this.database.prepare(`
        SELECT task_type, status, result_json
        FROM browser_tasks
        WHERE id = ? AND application_id = ?
      `).get(evidence.sourceId, applicationId);
      const result = parseJsonValue(row?.result_json, {});
      const chatOpened = row?.task_type === "REFRESH_CONVERSATION"
        && result?.conversation?.chatOpened === true;
      const resumeUnlocked = new Set(["REFRESH_CONVERSATION", "CHECK_RESUME_UNLOCK"]).has(row?.task_type)
        && result?.resumeUnlock?.unlocked === true;
      if (!row || row.status !== "SUCCEEDED") {
        throw evidenceError("Browser task evidence must reference a succeeded task");
      }
      if (toStatus === "CHAT_OPENED" && !chatOpened) {
        throw evidenceError("CHAT_OPENED requires a successful read-only chat-open signal");
      }
      if (toStatus === "RESUME_UNLOCKED" && !resumeUnlocked) {
        throw evidenceError("RESUME_UNLOCKED requires a successful resume-unlock signal");
      }
      return evidence;
    }
    if (evidence.type === "failure") {
      if (!evidence.sourceId && !evidence.errorCode) {
        throw evidenceError("Failure evidence requires sourceId or errorCode");
      }
      if (evidence.sourceType && !evidence.sourceId) {
        throw evidenceError("Failure evidence sourceType requires sourceId");
      }
      if (evidence.sourceId) {
        if (evidence.sourceType === "agent_run") {
          const run = this.database.prepare("SELECT status FROM agent_runs WHERE id = ? AND application_id = ?")
            .get(evidence.sourceId, applicationId);
          if (!run || run.status !== "FAILED") {
            throw evidenceError("Failure evidence must reference a failed agent run");
          }
          return evidence;
        }
        if (evidence.sourceType === "browser_task") {
          const task = this.database.prepare("SELECT status FROM browser_tasks WHERE id = ? AND application_id = ?")
            .get(evidence.sourceId, applicationId);
          if (!task || task.status !== "FAILED") {
            throw evidenceError("Failure evidence must reference a failed browser task");
          }
          return evidence;
        }
        if (evidence.sourceType === "resume_audit") {
          const audit = this.database.prepare(`
            SELECT resume_audits.status, resume_versions.application_id
            FROM resume_audits
            JOIN resume_versions ON resume_versions.id = resume_audits.resume_version_id
            WHERE resume_audits.id = ?
          `).get(evidence.sourceId);
          if (
            !audit
            || Number(audit.application_id || 0) !== applicationId
            || !FAILURE_RESUME_AUDIT_STATUSES.has(audit.status)
          ) {
            throw evidenceError("Failure evidence must reference a blocked or revision-required resume audit for this application");
          }
          return evidence;
        }
        throw evidenceError(`Unsupported failure evidence source type: ${evidence.sourceType || "missing"}`);
      }
      return evidence;
    }
    if (evidence.type === "message_sent") {
      const message = this.database.prepare(`
        SELECT status
        FROM messages
        WHERE id = ? AND application_id = ?
      `).get(evidence.sourceId, applicationId);
      if (!message || message.status !== "SENT") {
        throw evidenceError("GREETING_SENT requires a sent message record");
      }
      return evidence;
    }
    if (evidence.type === "submission_readiness_review") {
      assertWorkflowEvidence(this.database, applicationId, evidence.sourceId, "SUBMISSION_READINESS_REVIEWED");
      return evidence;
    }
    if (evidence.type === "submission_evidence") {
      assertWorkflowEvidence(this.database, applicationId, evidence.sourceId, "SUBMISSION_EVIDENCE_RECORDED");
      return evidence;
    }
    throw evidenceError(`Unsupported transition evidence: ${evidence.type}`);
  }
}

function assertOwnedRow(database, tableName, sourceId, applicationId) {
  const allowedTables = new Set(["screenings", "resume_versions"]);
  if (!allowedTables.has(tableName)) {
    throw new Error(`Unsupported evidence table: ${tableName}`);
  }
  const row = database.prepare(`SELECT id FROM ${tableName} WHERE id = ? AND application_id = ?`)
    .get(sourceId, applicationId);
  if (!row) {
    throw evidenceError(`Evidence ${tableName}#${sourceId || "missing"} does not belong to application ${applicationId}`);
  }
}

function assertWorkflowEvidence(database, applicationId, sourceId, eventType) {
  const row = sourceId
    ? database.prepare("SELECT id FROM workflow_events WHERE id = ? AND application_id = ? AND event_type = ?")
      .get(sourceId, applicationId, eventType)
    : database.prepare(`
      SELECT id
      FROM workflow_events
      WHERE application_id = ? AND event_type = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(applicationId, eventType);
  if (!row) {
    throw evidenceError(`${eventType} evidence is required for this application`);
  }
}

function normalizeEvidence(input = {}) {
  const evidence = input && typeof input === "object" ? input : {};
  return {
    type: cleanText(evidence.type || evidence.evidenceType).toLowerCase(),
    sourceType: cleanText(evidence.sourceType || evidence.source).toLowerCase(),
    sourceId: normalizePositiveInteger(
      evidence.sourceId
      || evidence.id
      || evidence.screeningId
      || evidence.resumeVersionId
      || evidence.resumeAuditId
      || evidence.browserTaskId
      || evidence.agentRunId
      || evidence.workflowEventId
    ),
    actor: cleanText(evidence.actor || evidence.operator || evidence.reviewedBy),
    rationale: cleanText(evidence.rationale || evidence.reason || evidence.note),
    errorCode: cleanText(evidence.errorCode || evidence.code),
    observedAt: cleanText(evidence.observedAt || evidence.createdAt || "")
  };
}

function deriveIdempotencyKey(evidence, toStatus) {
  if (!evidence.type || !evidence.sourceId) {
    return "";
  }
  return `${evidence.type}:${evidence.sourceId}:${toStatus}`;
}

function transitionResultFromEvent(row, overrides = {}) {
  return {
    ok: true,
    applicationId: Number(row.application_id || 0),
    fromStatus: row.from_status || "",
    toStatus: row.to_status || "",
    changed: Boolean(overrides.changed),
    idempotent: Boolean(overrides.idempotent),
    applicationEventId: Number(row.id || 0),
    eventType: row.event_type || "",
    reason: row.reason || "",
    idempotencyKey: row.idempotency_key || "",
    updatedAt: row.created_at || ""
  };
}

function normalizeApplicationStatus(value) {
  const status = cleanText(value).toUpperCase();
  return APPLICATION_STATUSES.has(status) ? status : "";
}

function canTransitionApplication(fromStatus, toStatus) {
  const from = normalizeApplicationStatus(fromStatus);
  const to = normalizeApplicationStatus(toStatus);
  if (!from || !to) {
    return false;
  }
  if (from === to) {
    return true;
  }
  return Boolean(APPLICATION_TRANSITIONS[from]?.has(to));
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeIdempotencyKey(value) {
  return cleanText(value).slice(0, 200);
}

function parseJsonValue(value, fallback) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  if (typeof value === "object") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function reasonSeverity(reason, metadata = {}) {
  if (metadata?.severity) {
    return cleanText(metadata.severity).toLowerCase();
  }
  return isErrorLikeEvent("", reason) ? "error" : "info";
}

function isErrorLikeEvent(eventType, reason) {
  return /(FAILED|ERROR|BLOCKED|REJECTED)/i.test(`${eventType} ${reason}`);
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "APPLICATION_TRANSITION_INVALID";
  return error;
}

function evidenceError(message) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = "APPLICATION_TRANSITION_EVIDENCE_REQUIRED";
  return error;
}

function conflictError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  error.code = "APPLICATION_TRANSITION_IDEMPOTENCY_CONFLICT";
  return error;
}

module.exports = {
  APPLICATION_STATUSES,
  APPLICATION_TRANSITIONS,
  ApplicationTransitionService,
  canTransitionApplication,
  normalizeApplicationStatus
};
