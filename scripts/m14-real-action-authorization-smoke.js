#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createJobStore, SCHEMA_VERSION } = require("../server/src/sqlite-store");

main();

function main() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m14-real-action-"));
  try {
    const confirmed = runConfirmedScenario(path.join(rootDir, "confirmed"));
    const uncertain = runUncertainScenario(path.join(rootDir, "uncertain"));
    const checks = {
      schemaIncludesRealActionMigration: confirmed.schemaVersion === 15 && SCHEMA_VERSION === 15,
      policyDefaultsOff: confirmed.defaultPolicyEnabled === false && confirmed.defaultPolicyDefaultsOff === true,
      genericTaskCreationBlocked: confirmed.genericCreateError.includes("real-action authorization API"),
      disabledPolicyBlocksArming: confirmed.disabledArmError === "REAL_ACTION_POLICY_DISABLED",
      rawTokenReturnedOnceAndHashedAtRest: confirmed.tokenReturned
        && confirmed.rawTokenNotStored
        && confirmed.tokenHashLength === 64,
      oneActiveAuthorizationOnly: confirmed.secondArmError === "REAL_ACTION_AUTHORIZATION_ALREADY_ACTIVE",
      wrongTokenRejectedWithoutMutation: confirmed.wrongTokenError === "REAL_ACTION_TOKEN_INVALID"
        && confirmed.statusAfterWrongToken === "ARMED"
        && confirmed.taskCountAfterWrongToken === 0,
      queueConsumesTokenAndCreatesSingleAttemptTask: confirmed.queuedStatus === "QUEUED"
        && confirmed.taskType === "SEND_GREETING_REAL"
        && confirmed.taskMaxAttempts === 1
        && confirmed.taskAttemptCountBeforeClaim === 0,
      authorizationTokenCannotBeReused: confirmed.reusedTokenError === "REAL_ACTION_TOKEN_ALREADY_USED",
      realCallbackRequiresClaimToken: confirmed.missingClaimTokenError.includes("claim token")
        && confirmed.taskStatusAfterMissingToken === "RUNNING",
      invalidSuccessEvidenceRollsBack: confirmed.invalidEvidenceError === "REAL_ACTION_CONFIRMATION_EVIDENCE_INVALID"
        && confirmed.taskStatusAfterInvalidEvidence === "RUNNING"
        && confirmed.messageStatusAfterInvalidEvidence === "DRAFT"
        && confirmed.applicationStatusAfterInvalidEvidence === "GREETING_READY",
      confirmedReadbackClosesStateOnce: confirmed.finalTaskStatus === "SUCCEEDED"
        && confirmed.finalAuthorizationStatus === "CONSUMED"
        && confirmed.finalMessageStatus === "SENT"
        && confirmed.finalApplicationStatus === "GREETING_SENT"
        && confirmed.replayIdempotent
        && confirmed.sentTransitionCount === 1,
      dailyLimitEnforced: confirmed.dailyLimitError === "REAL_ACTION_DAILY_LIMIT_REACHED",
      uncertainClickRequiresManualReview: uncertain.taskStatus === "FAILED"
        && uncertain.authorizationStatus === "UNCERTAIN"
        && uncertain.applicationStatus === "NEEDS_USER_REVIEW"
        && uncertain.uncertainEventCount >= 1,
      uncertainTaskCannotRequeue: uncertain.requeueChanged === 0
        && uncertain.taskMaxAttempts === 1
        && uncertain.taskAttemptCount === 1
    };
    console.log(JSON.stringify({
      ok: Object.values(checks).every(Boolean),
      checks,
      confirmed,
      uncertain
    }, null, 2));
    process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

function runConfirmedScenario(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const store = createJobStore({ dataDir });
  try {
    const defaultPolicy = store.getRealActionPolicy().policy;
    const first = seedGreetingReadyApplication(store, "confirmed-one");
    const genericCreateError = captureError(() => store.createBrowserTask({
      applicationId: first.applicationId,
      taskType: "SEND_GREETING_REAL",
      payload: { authorizationId: 999 }
    }));
    const disabledArm = captureError(() => store.armRealActionAuthorization({
      applicationId: first.applicationId,
      actor: "m14-smoke",
      rationale: "policy must block before enable"
    }));
    store.updateRealActionPolicy({
      enabled: true,
      durationMinutes: 20,
      actor: "m14-smoke",
      rationale: "confirmed real-action fixture"
    });
    const armed = store.armRealActionAuthorization({
      applicationId: first.applicationId,
      messageId: first.messageId,
      durationMinutes: 8,
      actor: "m14-smoke",
      rationale: "single confirmed greeting fixture"
    });
    const authorizationId = armed.authorization.id;
    const storedAuthorization = store.database.prepare("SELECT * FROM real_action_authorizations WHERE id = ?")
      .get(authorizationId);
    const secondArm = captureError(() => store.armRealActionAuthorization({
      applicationId: first.applicationId,
      actor: "m14-smoke",
      rationale: "duplicate active authorization must fail"
    }));
    const wrongToken = captureError(() => store.queueRealActionAuthorization(authorizationId, {
      authorizationToken: "wrong-token"
    }));
    const afterWrongToken = store.getRealActionAuthorization(authorizationId);
    const taskCountAfterWrongToken = countRows(store, "browser_tasks", "task_type = 'SEND_GREETING_REAL'");
    const queued = store.queueRealActionAuthorization(authorizationId, {
      authorizationToken: armed.authorizationToken
    });
    const reusedToken = captureError(() => store.queueRealActionAuthorization(authorizationId, {
      authorizationToken: armed.authorizationToken
    }));
    const claimed = store.claimBrowserTask({
      taskId: queued.browserTask.id,
      taskTypes: ["SEND_GREETING_REAL"]
    });
    const confirmationResult = createConfirmedResult(queued.authorization, first.messageText);
    const missingClaimToken = captureError(() => store.transitionBrowserTask(claimed.task.id, {
      toStatus: "SUCCEEDED",
      result: confirmationResult
    }));
    const afterMissingToken = store.getBrowserTask(claimed.task.id);
    const invalidEvidence = captureError(() => store.transitionBrowserTask(claimed.task.id, {
      toStatus: "SUCCEEDED",
      claimToken: claimed.task.claimToken,
      result: {
        ...confirmationResult,
        realAction: {
          ...confirmationResult.realAction,
          postSendReadback: false
        }
      }
    }));
    const afterInvalidTask = store.getBrowserTask(claimed.task.id);
    const afterInvalidMessage = store.database.prepare("SELECT status FROM messages WHERE id = ?").get(first.messageId);
    const afterInvalidApplication = store.database.prepare("SELECT status FROM applications WHERE id = ?").get(first.applicationId);
    const completed = store.transitionBrowserTask(claimed.task.id, {
      toStatus: "SUCCEEDED",
      claimToken: claimed.task.claimToken,
      result: confirmationResult
    });
    const replay = store.transitionBrowserTask(claimed.task.id, {
      toStatus: "SUCCEEDED",
      result: confirmationResult
    });
    const finalAuthorization = store.getRealActionAuthorization(authorizationId);
    const finalMessage = store.database.prepare("SELECT status FROM messages WHERE id = ?").get(first.messageId);
    const finalApplication = store.database.prepare("SELECT status FROM applications WHERE id = ?").get(first.applicationId);

    const second = seedGreetingReadyApplication(store, "confirmed-two");
    const secondAuthorization = store.armRealActionAuthorization({
      applicationId: second.applicationId,
      messageId: second.messageId,
      actor: "m14-smoke",
      rationale: "daily quota fixture"
    });
    const dailyLimit = captureError(() => store.queueRealActionAuthorization(secondAuthorization.authorization.id, {
      authorizationToken: secondAuthorization.authorizationToken
    }));
    store.revokeRealActionAuthorization(secondAuthorization.authorization.id, {
      actor: "m14-smoke",
      rationale: "clean up quota fixture"
    });

    return {
      schemaVersion: Number(store.database.prepare("PRAGMA user_version").get().user_version || 0),
      defaultPolicyEnabled: defaultPolicy.enabled,
      defaultPolicyDefaultsOff: defaultPolicy.defaultsOff,
      genericCreateError: genericCreateError.message,
      disabledArmError: disabledArm.code,
      tokenReturned: Boolean(armed.authorizationToken) && armed.tokenReturnedOnce === true,
      rawTokenNotStored: storedAuthorization.token_hash !== armed.authorizationToken
        && !JSON.stringify(storedAuthorization).includes(armed.authorizationToken),
      tokenHashLength: String(storedAuthorization.token_hash || "").length,
      secondArmError: secondArm.code,
      wrongTokenError: wrongToken.code,
      statusAfterWrongToken: afterWrongToken.status,
      taskCountAfterWrongToken,
      queuedStatus: queued.authorization.status,
      taskType: queued.browserTask.taskType,
      taskMaxAttempts: queued.browserTask.maxAttempts,
      taskAttemptCountBeforeClaim: queued.browserTask.attemptCount,
      reusedTokenError: reusedToken.code,
      missingClaimTokenError: missingClaimToken.message,
      taskStatusAfterMissingToken: afterMissingToken.status,
      invalidEvidenceError: invalidEvidence.code,
      taskStatusAfterInvalidEvidence: afterInvalidTask.status,
      messageStatusAfterInvalidEvidence: afterInvalidMessage.status,
      applicationStatusAfterInvalidEvidence: afterInvalidApplication.status,
      finalTaskStatus: completed.task.status,
      finalAuthorizationStatus: finalAuthorization.status,
      finalMessageStatus: finalMessage.status,
      finalApplicationStatus: finalApplication.status,
      replayIdempotent: replay.idempotent === true && replay.changed === false,
      sentTransitionCount: countRows(
        store,
        "application_events",
        "application_id = ? AND to_status = 'GREETING_SENT'",
        [first.applicationId]
      ),
      dailyLimitError: dailyLimit.code
    };
  } finally {
    store.close();
  }
}

function runUncertainScenario(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const store = createJobStore({ dataDir });
  try {
    const fixture = seedGreetingReadyApplication(store, "uncertain");
    store.updateRealActionPolicy({
      enabled: true,
      durationMinutes: 20,
      actor: "m14-smoke",
      rationale: "uncertain real-action fixture"
    });
    const armed = store.armRealActionAuthorization({
      applicationId: fixture.applicationId,
      messageId: fixture.messageId,
      actor: "m14-smoke",
      rationale: "single uncertain greeting fixture"
    });
    const queued = store.queueRealActionAuthorization(armed.authorization.id, {
      authorizationToken: armed.authorizationToken
    });
    const claimed = store.claimBrowserTask({ taskId: queued.browserTask.id, taskType: "SEND_GREETING_REAL" });
    const uncertainResult = {
      ok: false,
      errorCode: "REAL_ACTION_OUTCOME_UNCERTAIN",
      statusReason: "REAL_ACTION_OUTCOME_UNCERTAIN",
      message: "Send clicked once but fixture omitted DOM readback.",
      realAction: {
        outcome: "UNCERTAIN",
        preflightValidated: true,
        clickedSend: true,
        clickCount: 1,
        postSendReadback: false,
        messageHash: queued.authorization.messageHash,
        observedMessageHash: "",
        observedMessageText: "",
        targetJobHash: queued.authorization.targetJobHash,
        targetPageHash: queued.authorization.targetPageHash,
        noAutomaticRetry: true
      }
    };
    const failed = store.transitionBrowserTask(claimed.task.id, {
      toStatus: "FAILED",
      claimToken: claimed.task.claimToken,
      result: uncertainResult,
      errorMessage: uncertainResult.errorCode
    });
    const authorization = store.getRealActionAuthorization(armed.authorization.id);
    const application = store.database.prepare("SELECT status FROM applications WHERE id = ?").get(fixture.applicationId);
    const requeue = store.requeueBrowserTasks({
      taskType: "SEND_GREETING_REAL",
      statuses: ["FAILED"],
      refreshExpiry: true,
      reason: "must never requeue real action"
    });
    return {
      taskStatus: failed.task.status,
      taskMaxAttempts: failed.task.maxAttempts,
      taskAttemptCount: failed.task.attemptCount,
      authorizationStatus: authorization.status,
      applicationStatus: application.status,
      uncertainEventCount: countRows(
        store,
        "workflow_events",
        "application_id = ? AND event_type = 'REAL_ACTION_OUTCOME_UNCERTAIN'",
        [fixture.applicationId]
      ),
      requeueChanged: requeue.changed
    };
  } finally {
    store.close();
  }
}

function seedGreetingReadyApplication(store, suffix) {
  const now = new Date().toISOString();
  const sourceKey = `m14-${suffix}`;
  const messageText = `您好，我关注到 ${suffix} 岗位，我的本地 Agent 工作流与岗位要求匹配，期待进一步沟通。`;
  store.syncJobs({
    source: "m14-real-action-smoke",
    exportedAt: now,
    pages: {},
    jobs: [{
      jobId: sourceKey,
      title: `AI Product Manager ${suffix}`,
      company: `M14 ${suffix} Co`,
      detailUrl: `https://www.zhipin.com/job_detail/${sourceKey}.html?securityId=fixture`,
      description: "Own AI product discovery, local workflow design, user research, data analysis, cross-functional delivery, and measurable iteration outcomes."
    }]
  });
  const application = store.database.prepare(`
    SELECT applications.id, applications.status
    FROM applications
    JOIN jobs ON jobs.id = applications.job_id
    WHERE jobs.source_key = ?
  `).get(sourceKey);
  if (application.status === "LIST_CAPTURED") {
    transitionWithOperator(store, application.id, "DETAIL_CAPTURED", `${suffix}:detail`);
  }
  transitionWithOperator(store, application.id, "SHORTLISTED", `${suffix}:shortlist`);
  transitionWithOperator(store, application.id, "GREETING_READY", `${suffix}:greeting-ready`);
  const conversationId = Number(store.database.prepare(`
    INSERT INTO conversations (
      application_id, status, recruiter_name, conversation_url, metadata_json, created_at, updated_at
    ) VALUES (?, 'GREETING_DRAFTED', 'Fixture Recruiter', '', '{}', ?, ?)
  `).run(application.id, now, now).lastInsertRowid);
  const messageId = Number(store.database.prepare(`
    INSERT INTO messages (
      conversation_id, application_id, resume_version_id, agent_run_id,
      direction, channel, status, message_text, provider, metadata_json, created_at, updated_at
    ) VALUES (?, ?, NULL, NULL, 'OUTBOUND', 'boss_greeting', 'DRAFT', ?, 'm14-smoke', '{}', ?, ?)
  `).run(conversationId, application.id, messageText, now, now).lastInsertRowid);
  return { applicationId: Number(application.id), conversationId, messageId, messageText };
}

function transitionWithOperator(store, applicationId, toStatus, key) {
  return store.transitionApplication(applicationId, {
    toStatus,
    eventType: "M14_SMOKE_FIXTURE_TRANSITION",
    reason: "m14_smoke_fixture",
    idempotencyKey: `m14-smoke:${applicationId}:${key}`,
    evidence: {
      type: "operator_override",
      actor: "m14-smoke",
      rationale: "Create isolated real-action smoke fixture"
    }
  });
}

function createConfirmedResult(authorization, messageText) {
  return {
    ok: true,
    errorCode: "",
    statusReason: "REAL_GREETING_DOM_CONFIRMED",
    message: "Fixture DOM readback confirmed the message.",
    realAction: {
      outcome: "CONFIRMED",
      preflightValidated: true,
      clickedSend: true,
      clickCount: 1,
      postSendReadback: true,
      messageHash: authorization.messageHash,
      observedMessageHash: authorization.messageHash,
      observedMessageText: messageText,
      targetJobHash: authorization.targetJobHash,
      targetPageHash: authorization.targetPageHash,
      noAutomaticRetry: true
    }
  };
}

function countRows(store, tableName, where = "", params = []) {
  const allowedTables = new Set(["browser_tasks", "application_events", "workflow_events"]);
  if (!allowedTables.has(tableName)) {
    throw new Error(`Unsupported smoke count table: ${tableName}`);
  }
  return Number(store.database.prepare(`
    SELECT COUNT(*) AS count FROM ${tableName} ${where ? `WHERE ${where}` : ""}
  `).get(...params)?.count || 0);
}

function captureError(callback) {
  try {
    callback();
    return { code: "", message: "" };
  } catch (error) {
    return {
      code: error.code || "",
      message: error.message || String(error),
      statusCode: error.statusCode || 0
    };
  }
}
