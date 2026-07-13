"use strict";

const crypto = require("crypto");

const SEND_GREETING_REAL = "SEND_GREETING_REAL";
const REAL_ACTION_TYPES = new Set([SEND_GREETING_REAL]);
const ACTIVE_AUTHORIZATION_STATUSES = new Set(["ARMED", "QUEUED"]);
const FINAL_AUTHORIZATION_STATUSES = new Set(["CONSUMED", "EXPIRED", "REVOKED", "UNCERTAIN"]);
const DEFAULT_POLICY_DURATION_MINUTES = 15;
const MAX_POLICY_DURATION_MINUTES = 30;
const DEFAULT_AUTHORIZATION_DURATION_MINUTES = 5;
const MAX_AUTHORIZATION_DURATION_MINUTES = 10;
const DEFAULT_COOLDOWN_SECONDS = 300;
const CANARY_DAILY_LIMIT = 1;

class RealActionAuthorizationService {
  constructor(options = {}) {
    if (!options.database) {
      throw new Error("RealActionAuthorizationService requires a database");
    }
    if (typeof options.insertWorkflowEvent !== "function") {
      throw new Error("RealActionAuthorizationService requires insertWorkflowEvent");
    }
    if (typeof options.createBrowserTaskWithinTransaction !== "function") {
      throw new Error("RealActionAuthorizationService requires createBrowserTaskWithinTransaction");
    }
    if (typeof options.getBrowserTask !== "function") {
      throw new Error("RealActionAuthorizationService requires getBrowserTask");
    }
    if (typeof options.transitionApplicationWithinTransaction !== "function") {
      throw new Error("RealActionAuthorizationService requires transitionApplicationWithinTransaction");
    }
    this.database = options.database;
    this.insertWorkflowEvent = options.insertWorkflowEvent;
    this.createBrowserTaskWithinTransaction = options.createBrowserTaskWithinTransaction;
    this.getBrowserTask = options.getBrowserTask;
    this.transitionApplicationWithinTransaction = options.transitionApplicationWithinTransaction;
  }

  getPolicy(input = {}) {
    const actionType = normalizeActionType(input.actionType || input.type || SEND_GREETING_REAL);
    const now = new Date().toISOString();
    const row = this.database.prepare("SELECT * FROM real_action_policies WHERE action_type = ?").get(actionType);
    const policy = rowToPolicy(row, actionType, now);
    const quotaDay = resolveQuotaDay(now);
    const usedToday = Number(this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM real_action_authorizations
      WHERE action_type = ?
        AND quota_day = ?
        AND status IN ('QUEUED', 'CONSUMED', 'UNCERTAIN')
    `).get(actionType, quotaDay)?.count || 0);
    const activeRow = this.database.prepare(`
      SELECT *
      FROM real_action_authorizations
      WHERE action_type = ? AND status IN ('ARMED', 'QUEUED')
      ORDER BY id DESC
      LIMIT 1
    `).get(actionType);
    return {
      storage: "sqlite",
      ok: true,
      policy: {
        ...policy,
        quotaDay,
        usedToday,
        remainingToday: Math.max(0, policy.dailyLimit - usedToday)
      },
      activeAuthorization: activeRow ? rowToAuthorization(activeRow) : null
    };
  }

  updatePolicy(input = {}) {
    const actionType = normalizeActionType(input.actionType || input.type || SEND_GREETING_REAL);
    const actor = cleanText(input.actor || input.updatedBy || "");
    const rationale = cleanText(input.rationale || input.reason || "");
    if (!actor || !rationale) {
      throw realActionError(422, "REAL_ACTION_POLICY_JUSTIFICATION_REQUIRED", "Real-action policy changes require actor and rationale.");
    }
    const enabled = normalizeBoolean(input.enabled, false);
    const now = new Date().toISOString();
    const durationMinutes = clampInteger(
      input.durationMinutes,
      1,
      MAX_POLICY_DURATION_MINUTES,
      DEFAULT_POLICY_DURATION_MINUTES
    );
    const enabledUntil = enabled
      ? resolveBoundedFutureTimestamp(input.enabledUntil, now, durationMinutes, MAX_POLICY_DURATION_MINUTES)
      : null;
    const cooldownSeconds = clampInteger(
      input.cooldownSeconds,
      60,
      3600,
      DEFAULT_COOLDOWN_SECONDS
    );

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.database.prepare("SELECT created_at FROM real_action_policies WHERE action_type = ?").get(actionType);
      this.database.prepare(`
        INSERT INTO real_action_policies (
          action_type, enabled, enabled_until, daily_limit, cooldown_seconds,
          actor, rationale, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(action_type) DO UPDATE SET
          enabled = excluded.enabled,
          enabled_until = excluded.enabled_until,
          daily_limit = excluded.daily_limit,
          cooldown_seconds = excluded.cooldown_seconds,
          actor = excluded.actor,
          rationale = excluded.rationale,
          updated_at = excluded.updated_at
      `).run(
        actionType,
        enabled ? 1 : 0,
        enabledUntil,
        CANARY_DAILY_LIMIT,
        cooldownSeconds,
        actor,
        rationale,
        existing?.created_at || now,
        now
      );

      let revokedCount = 0;
      let canceledTaskCount = 0;
      let runningTaskCount = 0;
      if (!enabled) {
        const active = this.database.prepare(`
          SELECT real_action_authorizations.*, browser_tasks.status AS task_status
          FROM real_action_authorizations
          LEFT JOIN browser_tasks ON browser_tasks.id = real_action_authorizations.browser_task_id
          WHERE real_action_authorizations.action_type = ?
            AND real_action_authorizations.status IN ('ARMED', 'QUEUED')
          ORDER BY real_action_authorizations.id ASC
        `).all(actionType);
        for (const authorization of active) {
          if (authorization.task_status === "RUNNING") {
            runningTaskCount += 1;
            continue;
          }
          if (authorization.task_status === "QUEUED") {
            this.database.prepare(`
              UPDATE browser_tasks
              SET status = 'CANCELED', error_message = 'REAL_ACTION_POLICY_DISABLED', claim_token = '', updated_at = ?
              WHERE id = ? AND status = 'QUEUED'
            `).run(now, authorization.browser_task_id);
            canceledTaskCount += 1;
          }
          this.database.prepare(`
            UPDATE real_action_authorizations
            SET status = 'REVOKED', error_code = 'REAL_ACTION_POLICY_DISABLED', updated_at = ?
            WHERE id = ?
          `).run(now, authorization.id);
          revokedCount += 1;
        }
      }

      this.insertWorkflowEvent({
        applicationId: null,
        sourceType: "api",
        sourceId: null,
        eventType: enabled ? "REAL_ACTION_POLICY_ENABLED" : "REAL_ACTION_POLICY_DISABLED",
        severity: runningTaskCount ? "warning" : "info",
        status: enabled ? "ENABLED" : "DISABLED",
        progressCurrent: 1,
        progressTotal: 1,
        message: `${actionType} real-action policy ${enabled ? "enabled" : "disabled"}.`,
        metadata: {
          actionType,
          enabled,
          enabledUntil,
          dailyLimit: CANARY_DAILY_LIMIT,
          cooldownSeconds,
          actor,
          rationale,
          revokedCount,
          canceledTaskCount,
          runningTaskCount
        }
      }, now);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return this.getPolicy({ actionType });
  }

  armAuthorization(input = {}) {
    const actionType = normalizeActionType(input.actionType || input.type || SEND_GREETING_REAL);
    const applicationId = normalizePositiveInteger(input.applicationId);
    const requestedMessageId = normalizePositiveInteger(input.messageId);
    const actor = cleanText(input.actor || input.authorizedBy || "");
    const rationale = cleanText(input.rationale || input.reason || "");
    if (!applicationId) {
      throw realActionError(400, "REAL_ACTION_APPLICATION_REQUIRED", "Valid application id is required.");
    }
    if (!actor || !rationale) {
      throw realActionError(422, "REAL_ACTION_AUTHORIZATION_JUSTIFICATION_REQUIRED", "Real-action authorization requires actor and rationale.");
    }
    const now = new Date().toISOString();
    const durationMinutes = clampInteger(
      input.durationMinutes,
      1,
      MAX_AUTHORIZATION_DURATION_MINUTES,
      DEFAULT_AUTHORIZATION_DURATION_MINUTES
    );

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.expireArmedAuthorizationsWithinTransaction(now);
      const policy = this.requireActivePolicyWithinTransaction(actionType, now);
      const active = this.database.prepare(`
        SELECT id, application_id, status
        FROM real_action_authorizations
        WHERE action_type = ? AND status IN ('ARMED', 'QUEUED')
        LIMIT 1
      `).get(actionType);
      if (active) {
        throw realActionError(
          409,
          "REAL_ACTION_AUTHORIZATION_ALREADY_ACTIVE",
          `Authorization #${active.id} is already ${active.status} for application ${active.application_id}.`
        );
      }

      const application = this.getApplicationTargetWithinTransaction(applicationId);
      if (!application) {
        throw realActionError(404, "REAL_ACTION_APPLICATION_NOT_FOUND", `Application not found: ${applicationId}`);
      }
      if (application.status !== "GREETING_READY") {
        throw realActionError(
          409,
          "REAL_ACTION_APPLICATION_NOT_READY",
          `Application ${applicationId} must be GREETING_READY, found ${application.status}.`
        );
      }
      const message = requestedMessageId
        ? this.database.prepare(`
          SELECT * FROM messages WHERE id = ? AND application_id = ?
        `).get(requestedMessageId, applicationId)
        : this.database.prepare(`
          SELECT *
          FROM messages
          WHERE application_id = ? AND direction = 'OUTBOUND' AND status = 'DRAFT'
          ORDER BY id DESC
          LIMIT 1
        `).get(applicationId);
      if (!message || message.direction !== "OUTBOUND" || message.status !== "DRAFT") {
        throw realActionError(422, "REAL_ACTION_GREETING_DRAFT_REQUIRED", "A DRAFT outbound greeting message owned by the application is required.");
      }
      const messageText = cleanMultiline(message.message_text);
      if (!messageText) {
        throw realActionError(422, "REAL_ACTION_GREETING_EMPTY", "Greeting message is empty.");
      }

      const target = normalizeTarget(application);
      if (!target.jobId && !target.detailUrl) {
        throw realActionError(422, "REAL_ACTION_JOB_IDENTITY_REQUIRED", "A strict BOSS job id or detail URL is required for a real action.");
      }
      const token = crypto.randomBytes(32).toString("base64url");
      const tokenHash = sha256(token);
      const messageHash = hashGreetingMessage(messageText);
      const targetJobHash = hashTargetJob(target);
      const targetPageHash = hashTargetPage(target);
      const requestedExpiry = new Date(Date.parse(now) + durationMinutes * 60 * 1000).toISOString();
      const expiresAt = earlierTimestamp(requestedExpiry, policy.enabledUntil);
      const inserted = this.database.prepare(`
        INSERT INTO real_action_authorizations (
          application_id, action_type, message_id, browser_task_id, status,
          token_hash, message_hash, target_job_hash, target_page_hash,
          target_job_id, target_detail_url, authorized_by, rationale,
          quota_day, queued_at, consumed_at, expires_at, result_json,
          error_code, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, 'ARMED', ?, ?, ?, ?, ?, ?, ?, ?, '', NULL, NULL, ?, 'null', '', ?, ?)
      `).run(
        applicationId,
        actionType,
        message.id,
        tokenHash,
        messageHash,
        targetJobHash,
        targetPageHash,
        target.jobId,
        target.detailUrl,
        actor,
        rationale,
        expiresAt,
        now,
        now
      );
      const authorizationId = Number(inserted.lastInsertRowid);
      this.insertWorkflowEvent({
        applicationId,
        sourceType: "api",
        sourceId: authorizationId,
        eventType: "REAL_ACTION_AUTHORIZATION_ARMED",
        severity: "warning",
        status: "ARMED",
        progressCurrent: 0,
        progressTotal: 1,
        message: `${actionType} authorization armed for application ${applicationId}.`,
        metadata: {
          authorizationId,
          actionType,
          messageId: Number(message.id),
          messageHash,
          targetJobHash,
          targetPageHash,
          targetJobId: target.jobId,
          targetDetailUrl: target.detailUrl,
          authorizedBy: actor,
          rationale,
          expiresAt,
          tokenReturnedOnce: true,
          rawTokenPersisted: false
        }
      }, now);
      this.database.exec("COMMIT");
      return {
        storage: "sqlite",
        ok: true,
        authorization: this.getAuthorization(authorizationId),
        authorizationToken: token,
        tokenReturnedOnce: true
      };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  queueAuthorization(authorizationId, input = {}) {
    const id = normalizePositiveInteger(authorizationId);
    const token = cleanText(input.authorizationToken || input.token || "");
    if (!id) {
      throw realActionError(400, "REAL_ACTION_AUTHORIZATION_REQUIRED", "Valid authorization id is required.");
    }
    if (!token) {
      throw realActionError(401, "REAL_ACTION_TOKEN_REQUIRED", "One-time real-action token is required.");
    }
    const now = new Date().toISOString();

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.expireArmedAuthorizationsWithinTransaction(now);
      const authorization = this.database.prepare("SELECT * FROM real_action_authorizations WHERE id = ?").get(id);
      if (!authorization) {
        throw realActionError(404, "REAL_ACTION_AUTHORIZATION_NOT_FOUND", `Real-action authorization not found: ${id}`);
      }
      if (authorization.status !== "ARMED") {
        throw realActionError(409, "REAL_ACTION_TOKEN_ALREADY_USED", `Authorization ${id} is ${authorization.status}; its token cannot be reused.`);
      }
      if (!secureHashMatches(token, authorization.token_hash)) {
        throw realActionError(401, "REAL_ACTION_TOKEN_INVALID", "Real-action authorization token is invalid.");
      }
      if (Date.parse(authorization.expires_at) <= Date.parse(now)) {
        throw realActionError(410, "REAL_ACTION_AUTHORIZATION_EXPIRED", "Real-action authorization has expired.");
      }
      const policy = this.requireActivePolicyWithinTransaction(authorization.action_type, now);
      const application = this.getApplicationTargetWithinTransaction(authorization.application_id);
      const message = this.database.prepare("SELECT * FROM messages WHERE id = ? AND application_id = ?")
        .get(authorization.message_id, authorization.application_id);
      if (!application || application.status !== "GREETING_READY") {
        throw realActionError(409, "REAL_ACTION_APPLICATION_NOT_READY", "Application is no longer GREETING_READY.");
      }
      if (!message || message.status !== "DRAFT" || message.direction !== "OUTBOUND") {
        throw realActionError(409, "REAL_ACTION_GREETING_CHANGED", "Authorized greeting draft is missing or no longer DRAFT.");
      }
      const target = normalizeTarget(application);
      const messageText = cleanMultiline(message.message_text);
      if (
        hashGreetingMessage(messageText) !== authorization.message_hash
        || hashTargetJob(target) !== authorization.target_job_hash
        || hashTargetPage(target) !== authorization.target_page_hash
      ) {
        throw realActionError(409, "REAL_ACTION_AUTHORIZED_INPUT_CHANGED", "Job, page, or greeting content changed after authorization.");
      }

      const quotaDay = resolveQuotaDay(now);
      const usedToday = Number(this.database.prepare(`
        SELECT COUNT(*) AS count
        FROM real_action_authorizations
        WHERE action_type = ?
          AND quota_day = ?
          AND status IN ('QUEUED', 'CONSUMED', 'UNCERTAIN')
          AND id != ?
      `).get(authorization.action_type, quotaDay, id)?.count || 0);
      if (usedToday >= policy.dailyLimit) {
        throw realActionError(429, "REAL_ACTION_DAILY_LIMIT_REACHED", `Daily real-action limit ${policy.dailyLimit} has been reached.`);
      }
      const lastQueued = this.database.prepare(`
        SELECT queued_at
        FROM real_action_authorizations
        WHERE action_type = ? AND queued_at IS NOT NULL AND id != ?
        ORDER BY queued_at DESC
        LIMIT 1
      `).get(authorization.action_type, id);
      if (lastQueued?.queued_at) {
        const nextAllowedAt = Date.parse(lastQueued.queued_at) + policy.cooldownSeconds * 1000;
        if (nextAllowedAt > Date.parse(now)) {
          throw realActionError(
            429,
            "REAL_ACTION_COOLDOWN_ACTIVE",
            `Real-action cooldown is active until ${new Date(nextAllowedAt).toISOString()}.`
          );
        }
      }

      const taskExpiresAt = earlierTimestamp(authorization.expires_at, policy.enabledUntil);
      const browserTask = this.createBrowserTaskWithinTransaction({
        applicationId: Number(authorization.application_id),
        taskType: authorization.action_type,
        realActionAuthorizationId: id,
        expiresAt: taskExpiresAt,
        maxAttempts: 1,
        payload: {
          authorizationId: id,
          actionType: authorization.action_type,
          messageId: Number(message.id),
          conversationId: Number(message.conversation_id),
          messageText,
          messageHash: authorization.message_hash,
          targetJobHash: authorization.target_job_hash,
          targetPageHash: authorization.target_page_hash,
          jobId: target.jobId,
          title: target.title,
          company: target.company,
          detailUrl: target.detailUrl,
          sourceUrl: target.detailUrl,
          authorizationExpiresAt: taskExpiresAt,
          requiresExplicitAuthorization: true,
          actionMode: "real_canary",
          maxClickCount: 1,
          noAutomaticRetry: true
        }
      }, now);
      this.database.prepare(`
        UPDATE real_action_authorizations
        SET status = 'QUEUED', browser_task_id = ?, quota_day = ?, queued_at = ?, updated_at = ?
        WHERE id = ? AND status = 'ARMED'
      `).run(browserTask.id, quotaDay, now, now, id);
      this.insertWorkflowEvent({
        applicationId: Number(authorization.application_id),
        sourceType: "browser_task",
        sourceId: Number(browserTask.id),
        eventType: "REAL_ACTION_AUTHORIZATION_QUEUED",
        severity: "warning",
        status: "QUEUED",
        progressCurrent: 0,
        progressTotal: 1,
        message: `${authorization.action_type} authorization queued as browser task ${browserTask.id}.`,
        metadata: {
          authorizationId: id,
          browserTaskId: Number(browserTask.id),
          applicationId: Number(authorization.application_id),
          messageId: Number(message.id),
          messageHash: authorization.message_hash,
          targetJobHash: authorization.target_job_hash,
          targetPageHash: authorization.target_page_hash,
          quotaDay,
          dailyLimit: policy.dailyLimit,
          maxAttempts: 1,
          noAutomaticRetry: true,
          expiresAt: taskExpiresAt
        }
      }, now);
      this.database.exec("COMMIT");
      return {
        storage: "sqlite",
        ok: true,
        authorization: this.getAuthorization(id),
        browserTask: this.getBrowserTask(Number(browserTask.id))
      };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  revokeAuthorization(authorizationId, input = {}) {
    const id = normalizePositiveInteger(authorizationId);
    const actor = cleanText(input.actor || input.revokedBy || "");
    const rationale = cleanText(input.rationale || input.reason || "");
    if (!id) {
      throw realActionError(400, "REAL_ACTION_AUTHORIZATION_REQUIRED", "Valid authorization id is required.");
    }
    if (!actor || !rationale) {
      throw realActionError(422, "REAL_ACTION_REVOCATION_JUSTIFICATION_REQUIRED", "Revocation requires actor and rationale.");
    }
    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const authorization = this.database.prepare(`
        SELECT real_action_authorizations.*, browser_tasks.status AS task_status
        FROM real_action_authorizations
        LEFT JOIN browser_tasks ON browser_tasks.id = real_action_authorizations.browser_task_id
        WHERE real_action_authorizations.id = ?
      `).get(id);
      if (!authorization) {
        throw realActionError(404, "REAL_ACTION_AUTHORIZATION_NOT_FOUND", `Real-action authorization not found: ${id}`);
      }
      if (FINAL_AUTHORIZATION_STATUSES.has(authorization.status)) {
        this.database.exec("COMMIT");
        return { storage: "sqlite", ok: true, changed: false, authorization: rowToAuthorization(authorization) };
      }
      if (authorization.task_status === "RUNNING") {
        throw realActionError(409, "REAL_ACTION_ALREADY_RUNNING", "A running real action cannot be revoked safely; wait for its terminal callback.");
      }
      if (authorization.task_status === "QUEUED") {
        this.database.prepare(`
          UPDATE browser_tasks
          SET status = 'CANCELED', error_message = 'REAL_ACTION_AUTHORIZATION_REVOKED', claim_token = '', updated_at = ?
          WHERE id = ? AND status = 'QUEUED'
        `).run(now, authorization.browser_task_id);
      }
      this.database.prepare(`
        UPDATE real_action_authorizations
        SET status = 'REVOKED', error_code = 'REAL_ACTION_AUTHORIZATION_REVOKED', updated_at = ?
        WHERE id = ?
      `).run(now, id);
      this.insertWorkflowEvent({
        applicationId: Number(authorization.application_id),
        sourceType: "api",
        sourceId: id,
        eventType: "REAL_ACTION_AUTHORIZATION_REVOKED",
        severity: "warning",
        status: "REVOKED",
        progressCurrent: 1,
        progressTotal: 1,
        message: `Real-action authorization ${id} revoked by ${actor}.`,
        metadata: { authorizationId: id, actor, rationale, browserTaskId: authorization.browser_task_id || null }
      }, now);
      this.database.exec("COMMIT");
      return { storage: "sqlite", ok: true, changed: true, authorization: this.getAuthorization(id) };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getAuthorization(authorizationId) {
    const id = normalizePositiveInteger(authorizationId);
    if (!id) {
      throw realActionError(400, "REAL_ACTION_AUTHORIZATION_REQUIRED", "Valid authorization id is required.");
    }
    const row = this.database.prepare("SELECT * FROM real_action_authorizations WHERE id = ?").get(id);
    if (!row) {
      throw realActionError(404, "REAL_ACTION_AUTHORIZATION_NOT_FOUND", `Real-action authorization not found: ${id}`);
    }
    return rowToAuthorization(row);
  }

  listAuthorizations(input = {}) {
    const applicationId = normalizePositiveInteger(input.applicationId);
    const actionType = input.actionType ? normalizeActionType(input.actionType) : "";
    const limit = clampInteger(input.limit, 1, 100, 20);
    const where = [];
    const params = [];
    if (applicationId) {
      where.push("application_id = ?");
      params.push(applicationId);
    }
    if (actionType) {
      where.push("action_type = ?");
      params.push(actionType);
    }
    params.push(limit);
    const rows = this.database.prepare(`
      SELECT *
      FROM real_action_authorizations
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY id DESC
      LIMIT ?
    `).all(...params);
    return {
      storage: "sqlite",
      ok: true,
      authorizations: rows.map(rowToAuthorization)
    };
  }

  validateTaskClaimWithinTransaction(taskRow, now = new Date().toISOString()) {
    const taskType = normalizeOptionalActionType(taskRow?.task_type || taskRow?.taskType || "");
    if (!taskType) {
      return { ok: true, realAction: false };
    }
    const authorization = this.database.prepare(`
      SELECT * FROM real_action_authorizations WHERE browser_task_id = ?
    `).get(taskRow.id);
    if (!authorization || authorization.status !== "QUEUED") {
      return claimValidationFailure("REAL_ACTION_AUTHORIZATION_NOT_QUEUED", "Real-action task has no queued authorization.");
    }
    if (Number(authorization.application_id) !== Number(taskRow.application_id)) {
      return claimValidationFailure("REAL_ACTION_APPLICATION_MISMATCH", "Real-action task application does not match its authorization.");
    }
    if (Date.parse(authorization.expires_at) <= Date.parse(now)) {
      return claimValidationFailure("REAL_ACTION_AUTHORIZATION_EXPIRED", "Real-action authorization expired before task claim.");
    }
    const policyRow = this.database.prepare("SELECT * FROM real_action_policies WHERE action_type = ?").get(taskType);
    const policy = rowToPolicy(policyRow, taskType, now);
    if (!policy.enabled) {
      return claimValidationFailure("REAL_ACTION_POLICY_DISABLED", "Real-action policy is disabled or expired.");
    }
    const payload = parseJson(taskRow.payload_json, {});
    if (
      Number(payload.authorizationId || 0) !== Number(authorization.id)
      || cleanText(payload.messageHash) !== authorization.message_hash
      || cleanText(payload.targetJobHash) !== authorization.target_job_hash
      || cleanText(payload.targetPageHash) !== authorization.target_page_hash
      || Number(taskRow.max_attempts || 0) !== 1
    ) {
      return claimValidationFailure("REAL_ACTION_TASK_EVIDENCE_MISMATCH", "Real-action task payload does not match its authorization.");
    }
    return { ok: true, realAction: true, authorizationId: Number(authorization.id) };
  }

  rejectTaskBeforeClaimWithinTransaction(taskRow, validation, now = new Date().toISOString()) {
    const errorCode = cleanText(validation?.errorCode || "REAL_ACTION_CLAIM_REJECTED");
    const nextStatus = /EXPIRED/.test(errorCode) ? "EXPIRED" : "REVOKED";
    this.database.prepare(`
      UPDATE real_action_authorizations
      SET status = ?, error_code = ?, result_json = ?, updated_at = ?
      WHERE browser_task_id = ? AND status = 'QUEUED'
    `).run(nextStatus, errorCode, stringifyJson({ claimRejected: true, ...validation }), now, taskRow.id);
    this.insertWorkflowEvent({
      applicationId: Number(taskRow.application_id || 0) || null,
      sourceType: "browser_task",
      sourceId: Number(taskRow.id),
      eventType: "REAL_ACTION_CLAIM_REJECTED",
      severity: "error",
      status: nextStatus,
      progressCurrent: 1,
      progressTotal: 1,
      message: validation?.message || "Real-action task claim rejected.",
      errorCode,
      errorMessage: validation?.message || "Real-action task claim rejected.",
      metadata: { taskType: taskRow.task_type, authorizationStatus: nextStatus }
    }, now);
  }

  applyBrowserTaskResultWithinTransaction(taskRow, result = {}, toStatus, now = new Date().toISOString()) {
    const taskType = normalizeOptionalActionType(taskRow?.task_type || "");
    if (!taskType) {
      return { handled: false };
    }
    const authorization = this.database.prepare(`
      SELECT * FROM real_action_authorizations WHERE browser_task_id = ?
    `).get(taskRow.id);
    if (!authorization) {
      throw realActionError(422, "REAL_ACTION_AUTHORIZATION_NOT_FOUND", "Real-action browser task has no authorization record.");
    }
    if (toStatus === "SUCCEEDED") {
      return this.confirmSuccessfulGreetingWithinTransaction(taskRow, authorization, result, now);
    }

    const realAction = result?.realAction && typeof result.realAction === "object" ? result.realAction : {};
    const clickedSend = realAction.clickedSend === true;
    const errorCode = cleanText(result?.errorCode || (toStatus === "CANCELED" ? "REAL_ACTION_CANCELED" : "REAL_ACTION_FAILED"));
    const authorizationStatus = clickedSend
      ? "UNCERTAIN"
      : /EXPIRED/.test(errorCode)
        ? "EXPIRED"
        : "REVOKED";
    this.database.prepare(`
      UPDATE real_action_authorizations
      SET status = ?, result_json = ?, error_code = ?, consumed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      authorizationStatus,
      stringifyJson(result),
      errorCode,
      clickedSend ? now : null,
      now,
      authorization.id
    );
    this.insertWorkflowEvent({
      applicationId: Number(authorization.application_id),
      sourceType: "browser_task",
      sourceId: Number(taskRow.id),
      eventType: clickedSend ? "REAL_ACTION_OUTCOME_UNCERTAIN" : "REAL_ACTION_ABORTED_BEFORE_CLICK",
      severity: clickedSend ? "error" : "warning",
      status: authorizationStatus,
      progressCurrent: 1,
      progressTotal: 1,
      message: clickedSend
        ? "Send was clicked once, but post-send DOM readback did not confirm the greeting."
        : "Real greeting stopped before the send click.",
      errorCode,
      errorMessage: cleanText(result?.message || errorCode),
      metadata: {
        authorizationId: Number(authorization.id),
        browserTaskId: Number(taskRow.id),
        clickedSend,
        noAutomaticRetry: true,
        result: summarizeResult(result)
      }
    }, now);
    if (clickedSend) {
      this.transitionApplicationWithinTransaction(Number(authorization.application_id), {
        toStatus: "NEEDS_USER_REVIEW",
        eventType: "REAL_ACTION_OUTCOME_UNCERTAIN",
        reason: "real_greeting_outcome_uncertain",
        evidence: {
          type: "failure",
          sourceType: "browser_task",
          sourceId: Number(taskRow.id),
          errorCode: errorCode || "REAL_ACTION_OUTCOME_UNCERTAIN"
        },
        metadata: {
          authorizationId: Number(authorization.id),
          browserTaskId: Number(taskRow.id),
          clickedSend: true,
          noAutomaticRetry: true
        },
        now
      });
    }
    return { handled: true, authorizationStatus, clickedSend };
  }

  expireArmedAuthorizationsWithinTransaction(now = new Date().toISOString()) {
    const rows = this.database.prepare(`
      SELECT *
      FROM real_action_authorizations
      WHERE status = 'ARMED' AND expires_at <= ?
      ORDER BY id ASC
    `).all(now);
    for (const row of rows) {
      this.database.prepare(`
        UPDATE real_action_authorizations
        SET status = 'EXPIRED', error_code = 'REAL_ACTION_AUTHORIZATION_EXPIRED', updated_at = ?
        WHERE id = ? AND status = 'ARMED'
      `).run(now, row.id);
      this.insertWorkflowEvent({
        applicationId: Number(row.application_id),
        sourceType: "api",
        sourceId: Number(row.id),
        eventType: "REAL_ACTION_AUTHORIZATION_EXPIRED",
        severity: "warning",
        status: "EXPIRED",
        progressCurrent: 1,
        progressTotal: 1,
        message: `Real-action authorization ${row.id} expired before queueing.`,
        errorCode: "REAL_ACTION_AUTHORIZATION_EXPIRED",
        errorMessage: "Authorization expired before queueing.",
        metadata: { authorizationId: Number(row.id), expiresAt: row.expires_at }
      }, now);
    }
    return rows.length;
  }

  requireActivePolicyWithinTransaction(actionType, now) {
    const row = this.database.prepare("SELECT * FROM real_action_policies WHERE action_type = ?").get(actionType);
    const policy = rowToPolicy(row, actionType, now);
    if (!policy.enabled) {
      throw realActionError(403, "REAL_ACTION_POLICY_DISABLED", `${actionType} real-action policy is disabled or expired.`);
    }
    return policy;
  }

  getApplicationTargetWithinTransaction(applicationId) {
    return this.database.prepare(`
      SELECT
        applications.id,
        applications.status,
        jobs.job_id AS boss_job_id,
        jobs.title,
        jobs.company_name,
        jobs.detail_url
      FROM applications
      JOIN jobs ON jobs.id = applications.job_id
      WHERE applications.id = ?
    `).get(applicationId);
  }

  confirmSuccessfulGreetingWithinTransaction(taskRow, authorization, result, now) {
    const message = this.database.prepare("SELECT * FROM messages WHERE id = ? AND application_id = ?")
      .get(authorization.message_id, authorization.application_id);
    if (!message || message.status !== "DRAFT" || message.direction !== "OUTBOUND") {
      throw realActionError(422, "REAL_ACTION_GREETING_STATE_INVALID", "Authorized greeting is not an outbound DRAFT at confirmation time.");
    }
    const realAction = result?.realAction && typeof result.realAction === "object" ? result.realAction : {};
    const observedMessageText = cleanMultiline(realAction.observedMessageText || "");
    const observedMessageHash = hashGreetingMessage(observedMessageText);
    const evidenceValid = realAction.outcome === "CONFIRMED"
      && realAction.preflightValidated === true
      && realAction.clickedSend === true
      && Number(realAction.clickCount || 0) === 1
      && realAction.postSendReadback === true
      && cleanText(realAction.messageHash) === authorization.message_hash
      && cleanText(realAction.observedMessageHash) === authorization.message_hash
      && observedMessageHash === authorization.message_hash
      && cleanText(realAction.targetJobHash) === authorization.target_job_hash
      && cleanText(realAction.targetPageHash) === authorization.target_page_hash;
    if (!evidenceValid) {
      throw realActionError(
        422,
        "REAL_ACTION_CONFIRMATION_EVIDENCE_INVALID",
        "Real greeting success requires one click plus matching page, job, message, and DOM readback hashes."
      );
    }
    const metadata = parseJson(message.metadata_json, {});
    this.database.prepare(`
      UPDATE messages
      SET status = 'SENT', metadata_json = ?, updated_at = ?
      WHERE id = ? AND status = 'DRAFT'
    `).run(stringifyJson({
      ...metadata,
      realAction: {
        authorizationId: Number(authorization.id),
        browserTaskId: Number(taskRow.id),
        outcome: "CONFIRMED",
        messageHash: authorization.message_hash,
        targetJobHash: authorization.target_job_hash,
        targetPageHash: authorization.target_page_hash,
        clickedSend: true,
        clickCount: 1,
        postSendReadback: true,
        confirmedAt: now
      }
    }), now, message.id);
    this.database.prepare(`
      UPDATE real_action_authorizations
      SET status = 'CONSUMED', result_json = ?, error_code = '', consumed_at = ?, updated_at = ?
      WHERE id = ? AND status = 'QUEUED'
    `).run(stringifyJson(result), now, now, authorization.id);
    this.insertWorkflowEvent({
      applicationId: Number(authorization.application_id),
      sourceType: "browser_task",
      sourceId: Number(taskRow.id),
      eventType: "REAL_GREETING_CONFIRMED",
      severity: "info",
      status: "CONSUMED",
      progressCurrent: 1,
      progressTotal: 1,
      message: "Real greeting was confirmed by post-send DOM readback.",
      metadata: {
        authorizationId: Number(authorization.id),
        browserTaskId: Number(taskRow.id),
        messageId: Number(message.id),
        messageHash: authorization.message_hash,
        targetJobHash: authorization.target_job_hash,
        targetPageHash: authorization.target_page_hash,
        clickCount: 1,
        postSendReadback: true
      }
    }, now);
    const transition = this.transitionApplicationWithinTransaction(Number(authorization.application_id), {
      toStatus: "GREETING_SENT",
      eventType: "REAL_GREETING_SENT",
      reason: "real_greeting_dom_readback_confirmed",
      evidence: {
        type: "message_sent",
        sourceType: "message",
        sourceId: Number(message.id),
        observedAt: now
      },
      metadata: {
        authorizationId: Number(authorization.id),
        browserTaskId: Number(taskRow.id),
        messageId: Number(message.id),
        messageHash: authorization.message_hash,
        targetJobHash: authorization.target_job_hash,
        targetPageHash: authorization.target_page_hash,
        postSendDomReadback: true
      },
      now
    });
    return { handled: true, authorizationStatus: "CONSUMED", transition };
  }
}

function normalizeTarget(row = {}) {
  return {
    jobId: cleanText(row.boss_job_id || row.jobId || "") || extractJobId(row.detail_url || row.detailUrl || ""),
    title: cleanText(row.title || ""),
    company: cleanText(row.company_name || row.company || ""),
    detailUrl: canonicalTargetUrl(row.detail_url || row.detailUrl || "")
  };
}

function hashGreetingMessage(value) {
  return sha256(cleanMultiline(value));
}

function hashTargetJob(target = {}) {
  const normalized = normalizeTarget(target);
  const identity = normalized.jobId
    ? `job:${normalized.jobId.toLowerCase()}`
    : normalized.detailUrl
      ? `url:${normalized.detailUrl}`
      : `title_company:${normalized.title.toLowerCase()}|${normalized.company.toLowerCase()}`;
  return sha256(identity);
}

function hashTargetPage(target = {}) {
  const normalized = normalizeTarget(target);
  const identity = normalized.detailUrl || (normalized.jobId ? `job:${normalized.jobId.toLowerCase()}` : "");
  return sha256(identity);
}

function canonicalTargetUrl(value) {
  const text = cleanText(value);
  if (!text) {
    return "";
  }
  try {
    const url = new URL(text);
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return text.replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

function extractJobId(value) {
  const match = String(value || "").match(/\/job_detail\/([^/?#]+?)(?:\.html)?(?:[?#]|$)/i);
  return match ? cleanText(match[1]) : "";
}

function rowToPolicy(row, actionType, now) {
  const configuredEnabled = Boolean(row?.enabled);
  const enabledUntil = cleanText(row?.enabled_until || "");
  const enabled = configuredEnabled && Boolean(enabledUntil) && Date.parse(enabledUntil) > Date.parse(now);
  return {
    actionType,
    configuredEnabled,
    enabled,
    enabledUntil,
    dailyLimit: Number(row?.daily_limit || CANARY_DAILY_LIMIT),
    cooldownSeconds: Number(row?.cooldown_seconds || DEFAULT_COOLDOWN_SECONDS),
    actor: row?.actor || "",
    rationale: row?.rationale || "",
    createdAt: row?.created_at || "",
    updatedAt: row?.updated_at || "",
    defaultsOff: !row
  };
}

function rowToAuthorization(row) {
  return {
    id: Number(row.id || 0),
    applicationId: Number(row.application_id || 0),
    actionType: row.action_type || "",
    messageId: Number(row.message_id || 0),
    browserTaskId: row.browser_task_id === null || row.browser_task_id === undefined
      ? null
      : Number(row.browser_task_id || 0),
    status: row.status || "",
    messageHash: row.message_hash || "",
    targetJobHash: row.target_job_hash || "",
    targetPageHash: row.target_page_hash || "",
    targetJobId: row.target_job_id || "",
    targetDetailUrl: row.target_detail_url || "",
    authorizedBy: row.authorized_by || "",
    rationale: row.rationale || "",
    quotaDay: row.quota_day || "",
    queuedAt: row.queued_at || "",
    consumedAt: row.consumed_at || "",
    expiresAt: row.expires_at || "",
    result: parseJson(row.result_json, null),
    errorCode: row.error_code || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    tokenStoredAsHashOnly: true
  };
}

function normalizeActionType(value) {
  const actionType = cleanText(value).toUpperCase();
  if (!REAL_ACTION_TYPES.has(actionType)) {
    throw realActionError(400, "REAL_ACTION_TYPE_INVALID", `Unsupported real action type: ${actionType || "missing"}`);
  }
  return actionType;
}

function normalizeOptionalActionType(value) {
  const actionType = cleanText(value).toUpperCase();
  return REAL_ACTION_TYPES.has(actionType) ? actionType : "";
}

function isRealActionType(value) {
  return Boolean(normalizeOptionalActionType(value));
}

function resolveBoundedFutureTimestamp(value, now, fallbackMinutes, maxMinutes) {
  const fallback = new Date(Date.parse(now) + fallbackMinutes * 60 * 1000).toISOString();
  const candidate = cleanText(value) || fallback;
  const parsed = Date.parse(candidate);
  const max = Date.parse(now) + maxMinutes * 60 * 1000;
  if (!Number.isFinite(parsed) || parsed <= Date.parse(now) || parsed > max) {
    throw realActionError(422, "REAL_ACTION_POLICY_EXPIRY_INVALID", `Enabled-until must be within the next ${maxMinutes} minutes.`);
  }
  return new Date(parsed).toISOString();
}

function resolveQuotaDay(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.BOSS_REAL_ACTION_TIMEZONE || "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(now));
}

function earlierTimestamp(left, right) {
  return Date.parse(left) <= Date.parse(right) ? left : right;
}

function secureHashMatches(rawToken, expectedHash) {
  const actual = Buffer.from(sha256(rawToken), "hex");
  const expected = Buffer.from(cleanText(expectedHash), "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
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

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function normalizeBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return Boolean(fallback);
  }
  return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
}

function parseJson(value, fallback) {
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

function stringifyJson(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function summarizeResult(result = {}) {
  const realAction = result?.realAction && typeof result.realAction === "object" ? result.realAction : {};
  return {
    ok: result?.ok === true,
    errorCode: cleanText(result?.errorCode || ""),
    statusReason: cleanText(result?.statusReason || ""),
    clickedSend: realAction.clickedSend === true,
    clickCount: Number(realAction.clickCount || 0),
    preflightValidated: realAction.preflightValidated === true,
    postSendReadback: realAction.postSendReadback === true,
    outcome: cleanText(realAction.outcome || "")
  };
}

function claimValidationFailure(errorCode, message) {
  return { ok: false, realAction: true, errorCode, message };
}

function realActionError(statusCode, code, message, context = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.context = context;
  return error;
}

module.exports = {
  SEND_GREETING_REAL,
  REAL_ACTION_TYPES,
  RealActionAuthorizationService,
  hashGreetingMessage,
  hashTargetJob,
  hashTargetPage,
  isRealActionType,
  normalizeTarget
};
