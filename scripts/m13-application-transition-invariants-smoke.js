#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createJobStore, SCHEMA_VERSION } = require("../server/src/sqlite-store");

const ROOT = path.join(__dirname, "..");

main();

function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m13-transitions-"));
  const store = createJobStore({ dataDir });
  try {
    store.syncJobs(createPayload());
    const application = getApplicationBySourceKey(store, "m13-transition-job");
    const applicationId = application.id;
    const ownedCaptureBatchId = getLatestCaptureBatchId(store);
    store.syncJobs(createPayload({
      source: "m13-foreign-capture",
      jobId: "m13-foreign-job",
      title: "Foreign Evidence Fixture",
      company: "Foreign Evidence Labs"
    }));
    const foreignApplication = getApplicationBySourceKey(store, "m13-foreign-job");
    const foreignCaptureBatchId = getLatestCaptureBatchId(store);

    const illegalJumpRejected = captureError(() => store.transitionApplication(applicationId, {
      toStatus: "RESUME_AUDITED",
      eventType: "SMOKE_ILLEGAL_JUMP",
      reason: "m13_illegal_jump",
      idempotencyKey: "m13:illegal-jump",
      evidence: operatorEvidence("illegal jump must still fail")
    }));
    const missingEvidenceRejected = captureError(() => store.transitionApplication(applicationId, {
      toStatus: "SCORED",
      eventType: "SMOKE_MISSING_EVIDENCE",
      reason: "m13_missing_evidence",
      idempotencyKey: "m13:missing-evidence"
    }));
    const missingOperatorIdempotencyRejected = captureError(() => store.transitionApplication(applicationId, {
      toStatus: "SCORED",
      eventType: "SMOKE_OPERATOR_WITHOUT_IDEMPOTENCY",
      reason: "m13_operator_override",
      evidence: operatorEvidence("operator transition must supply an explicit idempotency key")
    }));
    const afterRejected = getApplication(store, applicationId);

    store.transitionApplication(applicationId, {
      toStatus: "NEEDS_MANUAL_ACTION",
      eventType: "SMOKE_OPERATOR_MANUAL_ACTION",
      reason: "m13_operator_override",
      idempotencyKey: "m13:operator-manual-action",
      evidence: operatorEvidence("seed job sync evidence checks")
    });
    const foreignJobSyncRejected = captureError(() => store.transitionApplication(applicationId, {
      toStatus: "LIST_CAPTURED",
      eventType: "SMOKE_FOREIGN_JOB_SYNC",
      reason: "job_sync",
      idempotencyKey: "m13:foreign-job-sync",
      evidence: {
        type: "job_sync",
        sourceType: "capture_batch",
        sourceId: foreignCaptureBatchId
      }
    }));
    const listCaptured = store.transitionApplication(applicationId, {
      toStatus: "LIST_CAPTURED",
      eventType: "SMOKE_OWNED_JOB_SYNC_LIST",
      reason: "job_sync",
      idempotencyKey: "m13:owned-job-sync-list",
      evidence: {
        type: "job_sync",
        sourceType: "capture_batch",
        sourceId: ownedCaptureBatchId
      }
    });
    const detailCaptured = store.transitionApplication(applicationId, {
      toStatus: "DETAIL_CAPTURED",
      eventType: "SMOKE_OWNED_JOB_SYNC_DETAIL",
      reason: "job_sync",
      idempotencyKey: "m13:owned-job-sync-detail",
      evidence: {
        type: "job_sync",
        sourceType: "capture_batch",
        sourceId: ownedCaptureBatchId
      }
    });

    const autoPrepareScreening = store.createScreening({
      applicationId,
      provider: "m13-smoke",
      skipApplicationTransition: true,
      result: screeningResult("auto_prepare")
    }).screening;
    const mismatchedScreeningRejected = captureError(() => store.transitionApplication(applicationId, {
      toStatus: "SCORED",
      eventType: "SMOKE_MISMATCHED_SCREENING",
      reason: "screening_completed",
      evidence: {
        type: "screening",
        sourceId: autoPrepareScreening.id
      }
    }));
    const matchingScreening = store.createScreening({
      applicationId: foreignApplication.id,
      provider: "m13-smoke",
      skipApplicationTransition: true,
      result: screeningResult("auto_prepare")
    }).screening;
    const matchingScreeningTransition = store.transitionApplication(foreignApplication.id, {
      toStatus: "SHORTLISTED",
      eventType: "SMOKE_MATCHING_SCREENING",
      reason: "screening_completed",
      evidence: {
        type: "screening",
        sourceId: matchingScreening.id
      }
    });

    const scored = store.transitionApplication(applicationId, {
      toStatus: "SCORED",
      eventType: "SMOKE_OPERATOR_SCORED",
      reason: "m13_operator_override",
      idempotencyKey: "m13:operator-scored",
      evidence: operatorEvidence("seed scored state for transition invariant smoke")
    });
    const shortlisted = store.transitionApplication(applicationId, {
      toStatus: "SHORTLISTED",
      eventType: "SMOKE_OPERATOR_SHORTLISTED",
      reason: "m13_operator_override",
      idempotencyKey: "m13:operator-shortlisted",
      evidence: operatorEvidence("seed shortlist state for transition invariant smoke")
    });

    const approvedOwnedAuditId = insertResumeAudit(store, applicationId, "APPROVED");
    const blockedOwnedAuditId = insertResumeAudit(store, applicationId, "BLOCKED");
    const blockedForeignAuditId = insertResumeAudit(store, foreignApplication.id, "BLOCKED");
    const unknownFailureSourceRejected = captureError(() => store.transitionApplication(applicationId, {
      toStatus: "NEEDS_USER_REVIEW",
      eventType: "SMOKE_UNKNOWN_FAILURE_SOURCE",
      reason: "m13_unknown_failure_source",
      idempotencyKey: "m13:unknown-failure-source",
      evidence: {
        type: "failure",
        sourceType: "unknown_fixture",
        sourceId: blockedOwnedAuditId,
        errorCode: "SMOKE_UNKNOWN_FAILURE_SOURCE"
      }
    }));
    const approvedAuditFailureRejected = captureError(() => store.transitionApplication(applicationId, {
      toStatus: "NEEDS_USER_REVIEW",
      eventType: "SMOKE_APPROVED_AUDIT_FAILURE",
      reason: "m13_approved_audit_failure",
      idempotencyKey: "m13:approved-audit-failure",
      evidence: {
        type: "failure",
        sourceType: "resume_audit",
        sourceId: approvedOwnedAuditId,
        errorCode: "SMOKE_APPROVED_AUDIT_FAILURE"
      }
    }));
    const foreignAuditFailureRejected = captureError(() => store.transitionApplication(applicationId, {
      toStatus: "NEEDS_USER_REVIEW",
      eventType: "SMOKE_FOREIGN_AUDIT_FAILURE",
      reason: "m13_foreign_audit_failure",
      idempotencyKey: "m13:foreign-audit-failure",
      evidence: {
        type: "failure",
        sourceType: "resume_audit",
        sourceId: blockedForeignAuditId,
        errorCode: "SMOKE_FOREIGN_AUDIT_FAILURE"
      }
    }));
    const ownedAuditFailure = store.transitionApplication(applicationId, {
      toStatus: "NEEDS_USER_REVIEW",
      eventType: "SMOKE_OWNED_AUDIT_FAILURE",
      reason: "m13_owned_audit_failure",
      idempotencyKey: "m13:owned-audit-failure",
      evidence: {
        type: "failure",
        sourceType: "resume_audit",
        sourceId: blockedOwnedAuditId,
        errorCode: "SMOKE_OWNED_AUDIT_FAILURE"
      }
    });
    const restoredShortlist = store.transitionApplication(applicationId, {
      toStatus: "SHORTLISTED",
      eventType: "SMOKE_OPERATOR_RESTORE_SHORTLIST",
      reason: "m13_operator_override",
      idempotencyKey: "m13:operator-restore-shortlist",
      evidence: operatorEvidence("restore shortlist after validating owned audit failure")
    });

    const applicationEventCountBeforeReplay = countRows(store, "application_events");
    const workflowEventCountBeforeReplay = countRows(store, "workflow_events");
    const replayedShortlist = store.transitionApplication(applicationId, {
      toStatus: "SHORTLISTED",
      eventType: "SMOKE_OPERATOR_SHORTLISTED",
      reason: "m13_operator_override",
      idempotencyKey: "m13:operator-shortlisted",
      evidence: operatorEvidence("seed shortlist state for transition invariant smoke")
    });
    const applicationEventCountAfterReplay = countRows(store, "application_events");
    const workflowEventCountAfterReplay = countRows(store, "workflow_events");
    const idempotencyConflict = captureError(() => store.transitionApplication(applicationId, {
      toStatus: "NEEDS_USER_REVIEW",
      eventType: "SMOKE_OPERATOR_REVIEW",
      reason: "m13_operator_override",
      idempotencyKey: "m13:operator-shortlisted",
      evidence: operatorEvidence("conflicting reuse must fail")
    }));

    store.transitionApplication(applicationId, {
      toStatus: "GREETING_READY",
      eventType: "SMOKE_OPERATOR_GREETING_READY",
      reason: "m13_operator_override",
      idempotencyKey: "m13:operator-greeting-ready",
      evidence: operatorEvidence("seed read-only browser callback state")
    });
    const refreshTask = store.createBrowserTask({
      applicationId,
      taskType: "REFRESH_CONVERSATION",
      payload: {
        detailUrl: application.detailUrl,
        sourceUrl: application.detailUrl,
        dryRun: true
      }
    });
    const claimedRefresh = store.claimBrowserTask({
      taskTypes: ["REFRESH_CONVERSATION"],
      sourceUrl: application.detailUrl
    });
    const refreshResult = {
      ok: true,
      conversation: {
        status: "CHAT_OPENED",
        chatOpened: true,
        recentMessages: []
      },
      resumeUnlock: {
        status: "LOCKED",
        unlocked: false
      },
      page: {
        url: application.detailUrl,
        title: "BOSS smoke"
      }
    };
    const firstRefresh = store.transitionBrowserTask(refreshTask.id, {
      toStatus: "SUCCEEDED",
      claimToken: claimedRefresh.task.claimToken,
      result: refreshResult
    });
    const countsBeforeDuplicateCallback = countTransitionSideEffects(store);
    const duplicateRefresh = store.transitionBrowserTask(refreshTask.id, {
      toStatus: "SUCCEEDED",
      claimToken: claimedRefresh.task.claimToken,
      result: refreshResult
    });
    const countsAfterDuplicateCallback = countTransitionSideEffects(store);

    const unlockTask = store.createBrowserTask({
      applicationId,
      taskType: "CHECK_RESUME_UNLOCK",
      payload: {
        detailUrl: application.detailUrl,
        sourceUrl: application.detailUrl,
        dryRun: true
      }
    });
    const claimedUnlock = store.claimBrowserTask({
      taskTypes: ["CHECK_RESUME_UNLOCK"],
      sourceUrl: application.detailUrl
    });
    store.transitionBrowserTask(unlockTask.id, {
      toStatus: "SUCCEEDED",
      claimToken: claimedUnlock.task.claimToken,
      result: {
        ok: true,
        conversation: {
          status: "CHAT_OPENED",
          chatOpened: true,
          recentMessages: []
        },
        resumeUnlock: {
          status: "RESUME_UNLOCKED",
          unlocked: true
        },
        page: {
          url: application.detailUrl,
          title: "BOSS smoke"
        }
      }
    });
    const duplicateOldRefresh = store.transitionBrowserTask(refreshTask.id, {
      toStatus: "SUCCEEDED",
      claimToken: claimedRefresh.task.claimToken,
      result: refreshResult
    });
    const afterOldCallback = getApplication(store, applicationId);

    const retryTask = store.createBrowserTask({
      applicationId,
      taskType: "CAPTURE_DETAIL",
      maxAttempts: 2,
      payload: {
        detailUrl: application.detailUrl,
        sourceUrl: application.detailUrl
      }
    });
    const firstRetryClaim = store.claimBrowserTask({
      taskTypes: ["CAPTURE_DETAIL"],
      sourceUrl: application.detailUrl
    });
    store.transitionBrowserTask(retryTask.id, {
      toStatus: "FAILED",
      claimToken: firstRetryClaim.task.claimToken,
      errorMessage: "SMOKE_RETRY_ONE",
      result: {
        ok: false,
        errorCode: "SMOKE_RETRY_ONE"
      }
    });
    const firstRequeue = store.requeueBrowserTasks({
      taskTypes: ["CAPTURE_DETAIL"],
      statuses: ["FAILED"],
      sourceUrl: application.detailUrl,
      reason: "M13_RETRY"
    });
    const secondRetryClaim = store.claimBrowserTask({
      taskTypes: ["CAPTURE_DETAIL"],
      sourceUrl: application.detailUrl
    });
    const staleRetryCallback = captureError(() => store.transitionBrowserTask(retryTask.id, {
      toStatus: "SUCCEEDED",
      claimToken: firstRetryClaim.task.claimToken,
      result: {
        ok: true,
        descriptionLength: 300
      }
    }));
    const afterStaleRetry = store.getBrowserTask(retryTask.id);
    store.transitionBrowserTask(retryTask.id, {
      toStatus: "FAILED",
      claimToken: secondRetryClaim.task.claimToken,
      errorMessage: "SMOKE_RETRY_TWO",
      result: {
        ok: false,
        errorCode: "SMOKE_RETRY_TWO"
      }
    });
    const exhaustedRequeue = store.requeueBrowserTasks({
      taskTypes: ["CAPTURE_DETAIL"],
      statuses: ["FAILED"],
      sourceUrl: application.detailUrl,
      reason: "M13_RETRY_EXHAUSTED"
    });

    const expiredTask = store.createBrowserTask({
      applicationId,
      taskType: "UPLOAD_RESUME",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      payload: {
        detailUrl: application.detailUrl,
        sourceUrl: application.detailUrl,
        dryRun: true
      }
    });
    const expiredClaim = store.claimBrowserTask({
      taskTypes: ["UPLOAD_RESUME"],
      sourceUrl: application.detailUrl
    });
    const expiredAfterClaim = store.getBrowserTask(expiredTask.id);

    const sqliteStoreSource = read("server/src/sqlite-store.js");
    const transitionServiceSource = read("server/src/services/application-transition-service.js");
    const updateApplicationMatches = [
      ...sqliteStoreSource.matchAll(/UPDATE\s+applications/gi),
      ...transitionServiceSource.matchAll(/UPDATE\s+applications/gi)
    ];
    const checks = {
      schemaVersionIsCurrent: SCHEMA_VERSION >= 16
        && Number(store.database.prepare("PRAGMA user_version").get().user_version) === SCHEMA_VERSION,
      rejectsIllegalJump: illegalJumpRejected?.code === "APPLICATION_TRANSITION_INVALID",
      rejectsMissingEvidence: missingEvidenceRejected?.code === "APPLICATION_TRANSITION_EVIDENCE_REQUIRED",
      requiresExplicitOperatorIdempotency: missingOperatorIdempotencyRejected?.code === "APPLICATION_TRANSITION_EVIDENCE_REQUIRED",
      rejectedTransitionsAreAtomic: afterRejected.status === "DETAIL_CAPTURED",
      validatesJobSyncBatchOwnership: foreignJobSyncRejected?.code === "APPLICATION_TRANSITION_EVIDENCE_REQUIRED"
        && listCaptured.changed === true
        && detailCaptured.changed === true,
      validatesScreeningRecommendationTarget: mismatchedScreeningRejected?.code === "APPLICATION_TRANSITION_EVIDENCE_REQUIRED"
        && matchingScreeningTransition.changed === true
        && getApplication(store, foreignApplication.id).status === "SHORTLISTED",
      validatesFailureEvidenceSourceAndOwnership: unknownFailureSourceRejected?.code === "APPLICATION_TRANSITION_EVIDENCE_REQUIRED"
        && approvedAuditFailureRejected?.code === "APPLICATION_TRANSITION_EVIDENCE_REQUIRED"
        && foreignAuditFailureRejected?.code === "APPLICATION_TRANSITION_EVIDENCE_REQUIRED"
        && ownedAuditFailure.changed === true
        && restoredShortlist.changed === true,
      acceptsAuditedOperatorOverride: scored.changed === true
        && shortlisted.changed === true
        && getApplication(store, applicationId).status === "RESUME_UNLOCKED",
      replaysApplicationTransitionIdempotently: replayedShortlist.idempotent === true
        && replayedShortlist.applicationEventId === shortlisted.applicationEventId
        && applicationEventCountAfterReplay === applicationEventCountBeforeReplay
        && workflowEventCountAfterReplay === workflowEventCountBeforeReplay,
      rejectsIdempotencyKeyConflict: idempotencyConflict?.code === "APPLICATION_TRANSITION_IDEMPOTENCY_CONFLICT",
      duplicateBrowserCallbackHasNoSideEffects: firstRefresh.changed === true
        && duplicateRefresh.idempotent === true
        && JSON.stringify(countsBeforeDuplicateCallback) === JSON.stringify(countsAfterDuplicateCallback),
      oldCallbackCannotRegressApplication: duplicateOldRefresh.idempotent === true
        && afterOldCallback.status === "RESUME_UNLOCKED",
      rejectsStaleRetryClaimToken: staleRetryCallback?.code === "BROWSER_TASK_CALLBACK_CONFLICT"
        && afterStaleRetry.status === "RUNNING"
        && afterStaleRetry.attemptCount === 2,
      enforcesRetryLimit: firstRequeue.changed === 1
        && exhaustedRequeue.changed === 0
        && exhaustedRequeue.retryExhausted === 1,
      expiresQueuedTasksBeforeClaim: expiredClaim.claimed === false
        && expiredClaim.expiredCount === 1
        && expiredAfterClaim.status === "FAILED"
        && expiredAfterClaim.errorMessage === "TASK_EXPIRED",
      singleApplicationUpdateOwner: updateApplicationMatches.length === 1
        && transitionServiceSource.includes("UPDATE applications")
        && !sqliteStoreSource.match(/UPDATE\s+applications/i)
    };

    console.log(JSON.stringify({
      ok: Object.values(checks).every(Boolean),
      checks,
      summary: {
        applicationId,
        finalApplicationStatus: afterOldCallback.status,
        applicationEventCount: countRows(store, "application_events"),
        workflowEventCount: countRows(store, "workflow_events"),
        retryTask: store.getBrowserTask(retryTask.id),
        expiredTask: expiredAfterClaim
      }
    }, null, 2));
    process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
  } finally {
    store.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

function operatorEvidence(rationale) {
  return {
    type: "operator_override",
    actor: "m13-transition-smoke",
    rationale
  };
}

function captureError(callback) {
  try {
    callback();
    return null;
  } catch (error) {
    return {
      code: error.code || "",
      message: error.message || String(error),
      statusCode: error.statusCode || 0
    };
  }
}

function getApplication(store, applicationId) {
  return store.getApplications({ limit: 100 }).applications.find((item) => item.id === applicationId);
}

function getApplicationBySourceKey(store, sourceKey) {
  const row = store.database.prepare(`
    SELECT applications.id
    FROM applications
    JOIN jobs ON jobs.id = applications.job_id
    WHERE jobs.source_key = ?
  `).get(sourceKey);
  if (!row) {
    throw new Error(`Application fixture not found: ${sourceKey}`);
  }
  return getApplication(store, Number(row.id));
}

function getLatestCaptureBatchId(store) {
  return Number(store.database.prepare(`
    SELECT id
    FROM capture_batches
    ORDER BY id DESC
    LIMIT 1
  `).get()?.id || 0);
}

function screeningResult(recommendation) {
  return {
    matchScore: recommendation === "auto_prepare" ? 85 : 50,
    riskScore: recommendation === "skip" ? 100 : 10,
    recommendation,
    hardConditions: [],
    matchedPoints: ["M13 transition fixture"],
    riskPoints: [],
    resumeStrategy: [],
    requiresUserConfirmation: recommendation === "review_needed",
    confidence: "high"
  };
}

function insertResumeAudit(store, applicationId, status) {
  const now = new Date().toISOString();
  const versionInsert = store.database.prepare(`
    INSERT INTO resume_versions (
      application_id, screening_id, agent_run_id, version_number, status, provider,
      resume_fields_json, source_mapping_json, diff_summary_json, compression_notes_json,
      unsupported_claims_json, render_metadata_json, file_path, file_format, metadata_json,
      created_at, updated_at
    ) VALUES (?, NULL, NULL, 1, ?, 'm13-smoke', '{}', '[]', '[]', '[]', '[]', '{}', NULL, NULL, '{}', ?, ?)
  `).run(applicationId, status, now, now);
  const recommendation = status === "APPROVED" ? "approve" : status === "NEEDS_REVISION" ? "revise" : "block";
  const auditInsert = store.database.prepare(`
    INSERT INTO resume_audits (
      resume_version_id, agent_run_id, status, provider, truthfulness_passed,
      format_passed, page_limit_passed, unsupported_claims_json, source_issues_json,
      exaggeration_risk, job_fit_review, risk_score_adjustment, recommendation,
      requires_user_confirmation, render_metadata_json, risk_flags_json, metadata_json, created_at
    ) VALUES (?, NULL, ?, 'm13-smoke', ?, ?, ?, '[]', '[]', 'low', 'fixture', 0, ?, 0, '{}', '[]', '{}', ?)
  `).run(
    Number(versionInsert.lastInsertRowid),
    status,
    status === "APPROVED" ? 1 : 0,
    status === "APPROVED" ? 1 : 0,
    status === "APPROVED" ? 1 : 0,
    recommendation,
    now
  );
  return Number(auditInsert.lastInsertRowid);
}

function countRows(store, tableName) {
  const allowed = new Set(["application_events", "workflow_events", "messages", "conversations", "browser_tasks"]);
  if (!allowed.has(tableName)) {
    throw new Error(`Unsupported count table: ${tableName}`);
  }
  return Number(store.database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count || 0);
}

function countTransitionSideEffects(store) {
  return {
    applicationEvents: countRows(store, "application_events"),
    workflowEvents: countRows(store, "workflow_events"),
    messages: countRows(store, "messages"),
    conversations: countRows(store, "conversations"),
    browserTasks: countRows(store, "browser_tasks")
  };
}

function createPayload(options = {}) {
  const jobId = options.jobId || "m13-transition-job";
  return {
    source: options.source || "m13-application-transition-invariants-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId,
        title: options.title || "Workflow Product Manager",
        company: options.company || "Invariant Labs",
        salary: "20-30K",
        location: "Shanghai",
        detailUrl: `https://www.zhipin.com/job_detail/${jobId}.html`,
        description: "Own workflow product delivery, user research, metrics, and cross-functional execution. ".repeat(4)
      }
    ]
  };
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
