"use strict";

const crypto = require("crypto");
const { loadModelConfig } = require("../model-client");
const { runScreeningAgent } = require("../screening-agent");

const SHADOW_RUN_STATUSES = new Set(["QUEUED", "RUNNING", "SUCCEEDED", "PARTIAL", "FAILED"]);
const SHADOW_REVIEW_LABELS = new Set([
  "CORRECT",
  "FALSE_POSITIVE",
  "FALSE_NEGATIVE",
  "BAD_REASON",
  "RISK_MISSED"
]);
const SCREENING_RECOMMENDATIONS = new Set(["auto_prepare", "review_needed", "skip"]);

class AgentShadowService {
  constructor(options = {}) {
    if (!options.store?.database) {
      throw new Error("AgentShadowService requires a SQLite job store");
    }
    this.store = options.store;
    this.database = options.database || options.store.database;
    this.screeningRunner = options.screeningRunner || runScreeningAgent;
    this.modelConfigLoader = options.modelConfigLoader || loadModelConfig;
    this.schedule = options.schedule || ((callback) => setTimeout(callback, 0));
    this.activeRuns = new Map();
  }

  recoverInterruptedRuns() {
    const now = new Date().toISOString();
    const result = this.database.prepare(`
      UPDATE agent_shadow_runs
      SET status = 'FAILED', error_code = 'AGENT_SHADOW_RUN_INTERRUPTED',
          error_message = 'Backend stopped before the Shadow run reached a terminal state.',
          finished_at = ?, updated_at = ?
      WHERE status IN ('QUEUED', 'RUNNING')
    `).run(now, now);
    return Number(result.changes || 0);
  }

  startRun(input = {}) {
    const prepared = this.prepareRun(input);
    const run = this.createRun(prepared);
    const execution = new Promise((resolve) => this.schedule(resolve))
      .then(() => this.executeRun(run.id, prepared))
      .finally(() => this.activeRuns.delete(run.id));
    this.activeRuns.set(run.id, execution);
    execution.catch(() => {});
    return {
      ok: true,
      storage: "sqlite",
      accepted: true,
      run: this.getRun(run.id).run
    };
  }

  async runNow(input = {}) {
    const prepared = this.prepareRun(input);
    const run = this.createRun(prepared);
    return this.executeRun(run.id, prepared);
  }

  async waitForRun(runId) {
    const id = positiveInteger(runId);
    if (!id) {
      throw shadowError(400, "AGENT_SHADOW_RUN_INVALID", "Valid Shadow run id is required");
    }
    if (this.activeRuns.has(id)) {
      await this.activeRuns.get(id);
    }
    return this.getRun(id);
  }

  prepareRun(input = {}) {
    const mode = normalizeMode(input.mode || "hybrid");
    const limit = clampInteger(input.limit, 1, 30, 20);
    const topK = clampInteger(input.topK, 1, Math.min(10, limit), Math.min(5, limit));
    const samplesPerTopJob = clampInteger(input.samplesPerTopJob || input.samples, 1, 5, 3);
    const defaultDelay = mode === "rules" ? 0 : 2500;
    const requestDelayMs = clampInteger(
      input.requestDelayMs ?? process.env.BOSS_MODEL_EVAL_DELAY_MS,
      0,
      30000,
      defaultDelay
    );
    const minDescriptionLength = clampInteger(input.minDescriptionLength, 80, 5000, 80);
    const applicationIds = uniquePositiveIntegers(input.applicationIds).slice(0, 30);
    const plannedSampleCount = limit + (topK * Math.max(0, samplesPerTopJob - 1));
    if (plannedSampleCount > 50) {
      throw shadowError(422, "AGENT_SHADOW_BUDGET_EXCEEDED", "Shadow run exceeds the 50-sample hard limit");
    }
    const modelConfig = this.modelConfigLoader(input.modelConfig || {});
    if (new Set(["hybrid", "llm"]).has(mode) && !modelConfig.configured) {
      throw shadowError(422, "LLM_CONFIG_INVALID", "Shadow run requires configured model credentials in hybrid or llm mode");
    }
    return {
      mode,
      limit,
      topK,
      samplesPerTopJob,
      requestDelayMs,
      minDescriptionLength,
      applicationIds,
      plannedSampleCount,
      userRules: objectValue(input.userRules),
      modelConfig
    };
  }

  createRun(prepared) {
    const active = this.database.prepare(`
      SELECT id FROM agent_shadow_runs
      WHERE status IN ('QUEUED', 'RUNNING')
      ORDER BY id DESC LIMIT 1
    `).get();
    if (active) {
      throw shadowError(409, "AGENT_SHADOW_RUN_ACTIVE", `Shadow run ${active.id} is still active`);
    }

    const applicationIds = prepared.applicationIds.length
      ? this.validateExplicitCandidates(prepared.applicationIds, prepared.minDescriptionLength)
      : this.selectRecentCandidates(prepared.limit, prepared.minDescriptionLength);
    if (!applicationIds.length) {
      throw shadowError(422, "AGENT_SHADOW_CANDIDATES_EMPTY", "No jobs with complete JD are available for Shadow review");
    }
    const selectedIds = applicationIds.slice(0, prepared.limit);
    const inputs = selectedIds.map((applicationId) => this.store.getApplicationScreeningInput(applicationId, {
      userRules: prepared.userRules
    }));
    const profile = inputs[0]?.profile || this.store.getProfile();
    if (!(profile.experiences || []).length && !(profile.skills || []).length) {
      throw shadowError(
        422,
        "AGENT_SHADOW_PROFILE_INCOMPLETE",
        "Confirm at least one experience or skill before running real-job Shadow review"
      );
    }

    const profileHash = hashValue(profile);
    const datasetHash = hashValue({
      profileHash,
      jobs: inputs.map((item) => ({ applicationId: item.application.id, hash: hashValue(item.job) })),
      userRules: prepared.userRules
    });
    const now = new Date().toISOString();
    const options = {
      limit: prepared.limit,
      topK: Math.min(prepared.topK, inputs.length),
      samplesPerTopJob: prepared.samplesPerTopJob,
      requestDelayMs: prepared.requestDelayMs,
      minDescriptionLength: prepared.minDescriptionLength,
      plannedSampleCount: inputs.length + (Math.min(prepared.topK, inputs.length) * Math.max(0, prepared.samplesPerTopJob - 1)),
      userRules: prepared.userRules,
      applicationIds: inputs.map((item) => item.application.id)
    };

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const profileSnapshot = this.database.prepare(`
        INSERT INTO profile_snapshots (profile_id, content_hash, payload_json, created_at)
        VALUES (?, ?, ?, ?)
      `).run(
        positiveInteger(profile.profile?.id),
        profileHash,
        stringifyJson(profile),
        now
      );
      const runResult = this.database.prepare(`
        INSERT INTO agent_shadow_runs (
          status, mode, profile_snapshot_id, dataset_hash, model_config_json,
          options_json, selected_count, created_at, updated_at
        ) VALUES ('QUEUED', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        prepared.mode,
        Number(profileSnapshot.lastInsertRowid),
        datasetHash,
        stringifyJson(publicModelConfig(prepared.modelConfig)),
        stringifyJson(options),
        inputs.length,
        now,
        now
      );
      const runId = Number(runResult.lastInsertRowid);
      const insertJobSnapshot = this.database.prepare(`
        INSERT INTO job_snapshots (
          job_id, batch_id, source_key, title, company_name, detail_url,
          description_length, payload_json, captured_at, created_at
        ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertItem = this.database.prepare(`
        INSERT INTO agent_shadow_items (
          shadow_run_id, application_id, job_snapshot_id, status, created_at, updated_at
        ) VALUES (?, ?, ?, 'PENDING', ?, ?)
      `);
      for (const input of inputs) {
        const job = input.job || {};
        const jobSnapshot = insertJobSnapshot.run(
          positiveInteger(job.id),
          cleanText(job.sourceKey || job.source_key),
          cleanText(job.title),
          cleanText(job.company || job.companyName || job.company_name),
          cleanText(job.detailUrl || job.detail_url),
          cleanMultiline(job.description).length,
          stringifyJson(job),
          now,
          now
        );
        insertItem.run(
          runId,
          input.application.id,
          Number(jobSnapshot.lastInsertRowid),
          now,
          now
        );
      }
      this.database.exec("COMMIT");
      return this.getRun(runId).run;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async executeRun(runId, prepared) {
    const id = positiveInteger(runId);
    const now = new Date().toISOString();
    this.database.prepare(`
      UPDATE agent_shadow_runs
      SET status = 'RUNNING', started_at = ?, error_code = '', error_message = '', updated_at = ?
      WHERE id = ? AND status = 'QUEUED'
    `).run(now, now, id);
    const pacing = { delayMs: prepared.requestDelayMs, lastStartedAt: 0 };
    try {
      let snapshot = this.getRun(id);
      for (const item of snapshot.items) {
        await this.executeSample(snapshot, item, 0, prepared, pacing);
      }

      snapshot = this.getRun(id);
      const topItems = snapshot.items
        .filter((item) => item.successCount > 0 && item.recommendation !== "skip")
        .sort(compareShadowItems)
        .slice(0, Math.min(prepared.topK, snapshot.items.length));
      for (const item of topItems) {
        for (let sampleIndex = 1; sampleIndex < prepared.samplesPerTopJob; sampleIndex += 1) {
          await this.executeSample(snapshot, item, sampleIndex, prepared, pacing);
        }
      }

      this.rankItems(id);
      this.refreshRunProgress(id);
      const completed = this.getRun(id);
      const allSamples = completed.items.flatMap((item) => item.samples);
      const successfulItems = completed.items.filter((item) => item.successCount > 0).length;
      const failedSamples = allSamples.filter((sample) => sample.status === "FAILED").length;
      const status = successfulItems === 0 ? "FAILED" : failedSamples > 0 ? "PARTIAL" : "SUCCEEDED";
      const finishedAt = new Date().toISOString();
      this.database.prepare(`
        UPDATE agent_shadow_runs
        SET status = ?, telemetry_json = ?, error_code = ?, error_message = ?,
            finished_at = ?, updated_at = ?
        WHERE id = ?
      `).run(
        status,
        stringifyJson(summarizeSampleTelemetry(allSamples)),
        status === "FAILED" ? "AGENT_SHADOW_ALL_SAMPLES_FAILED" : "",
        status === "FAILED" ? "All Shadow screening samples failed." : "",
        finishedAt,
        finishedAt,
        id
      );
      return this.getRun(id);
    } catch (error) {
      const finishedAt = new Date().toISOString();
      this.database.prepare(`
        UPDATE agent_shadow_runs
        SET status = 'FAILED', error_code = ?, error_message = ?, finished_at = ?, updated_at = ?
        WHERE id = ?
      `).run(
        cleanText(error.code || "AGENT_SHADOW_RUN_FAILED"),
        cleanMultiline(error.message || String(error)).slice(0, 4000),
        finishedAt,
        finishedAt,
        id
      );
      return this.getRun(id);
    }
  }

  async executeSample(snapshot, item, sampleIndex, prepared, pacing) {
    await waitForPacing(pacing);
    const startedAt = new Date().toISOString();
    try {
      const result = await this.screeningRunner({
        application: item.application,
        job: item.job,
        profile: snapshot.profile,
        userRules: snapshot.run.options.userRules || {}
      }, {
        mode: prepared.mode,
        modelConfig: prepared.modelConfig
      });
      const finishedAt = new Date().toISOString();
      this.insertSample(item.id, {
        sampleIndex,
        status: "SUCCEEDED",
        provider: result.provider,
        result: result.result,
        telemetry: result.telemetry || {},
        startedAt,
        finishedAt
      });
    } catch (error) {
      const finishedAt = new Date().toISOString();
      this.insertSample(item.id, {
        sampleIndex,
        status: "FAILED",
        provider: prepared.mode,
        telemetry: error.telemetry || {},
        errorCode: error.code || "SCREENING_AGENT_FAILED",
        errorMessage: error.message || String(error),
        startedAt,
        finishedAt
      });
    }
    this.recalculateItem(item.id);
    this.refreshRunProgress(snapshot.run.id);
  }

  insertSample(itemId, input) {
    const now = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO agent_shadow_samples (
        shadow_item_id, sample_index, status, provider, result_json, telemetry_json,
        error_code, error_message, started_at, finished_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      positiveInteger(itemId),
      Math.max(0, Number(input.sampleIndex || 0)),
      cleanText(input.status),
      cleanText(input.provider),
      stringifyJson(objectValue(input.result)),
      stringifyJson(objectValue(input.telemetry)),
      cleanText(input.errorCode),
      cleanMultiline(input.errorMessage).slice(0, 4000),
      input.startedAt,
      input.finishedAt,
      now
    );
  }

  recalculateItem(itemId) {
    const id = positiveInteger(itemId);
    const rows = this.database.prepare(`
      SELECT * FROM agent_shadow_samples
      WHERE shadow_item_id = ?
      ORDER BY sample_index ASC, id ASC
    `).all(id);
    const samples = rows.map(rowToShadowSample);
    const succeeded = samples.filter((sample) => sample.status === "SUCCEEDED");
    const scores = succeeded.map((sample) => Number(sample.result.matchScore)).filter(Number.isFinite);
    const riskScores = succeeded.map((sample) => Number(sample.result.riskScore)).filter(Number.isFinite);
    const recommendation = chooseConservativeMajority(succeeded.map((sample) => sample.result.recommendation));
    const status = succeeded.length === 0
      ? "FAILED"
      : succeeded.length === samples.length
        ? "SUCCEEDED"
        : "PARTIAL";
    const errors = samples.filter((sample) => sample.status === "FAILED").map((sample) => ({
      sampleIndex: sample.sampleIndex,
      code: sample.errorCode,
      message: sample.errorMessage
    }));
    const result = {
      recommendations: countValues(succeeded.map((sample) => sample.result.recommendation || "unknown")),
      providers: countValues(succeeded.map((sample) => sample.provider || "unknown")),
      matchedPoints: uniqueStrings(succeeded.flatMap((sample) => sample.result.matchedPoints || [])).slice(0, 20),
      riskPoints: uniqueStrings(succeeded.flatMap((sample) => sample.result.riskPoints || [])).slice(0, 20),
      resumeStrategy: uniqueStrings(succeeded.flatMap((sample) => sample.result.resumeStrategy || [])).slice(0, 20)
    };
    const telemetry = summarizeSampleTelemetry(samples);
    const now = new Date().toISOString();
    this.database.prepare(`
      UPDATE agent_shadow_items
      SET status = ?, sample_count = ?, success_count = ?, average_match_score = ?,
          screening_score_stddev = ?, max_risk_score = ?, recommendation = ?,
          result_json = ?, telemetry_json = ?, error_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      status,
      samples.length,
      succeeded.length,
      scores.length ? average(scores) : null,
      scores.length ? standardDeviation(scores) : null,
      riskScores.length ? Math.max(...riskScores) : null,
      recommendation,
      stringifyJson(result),
      stringifyJson(telemetry),
      stringifyJson(errors),
      now,
      id
    );
  }

  rankItems(runId) {
    const items = this.database.prepare(`
      SELECT id, average_match_score, max_risk_score, recommendation, success_count
      FROM agent_shadow_items
      WHERE shadow_run_id = ?
    `).all(positiveInteger(runId));
    const ranked = items.filter((item) => Number(item.success_count || 0) > 0).sort((left, right) => compareShadowItems({
      averageMatchScore: left.average_match_score,
      maxRiskScore: left.max_risk_score,
      recommendation: left.recommendation,
      id: left.id
    }, {
      averageMatchScore: right.average_match_score,
      maxRiskScore: right.max_risk_score,
      recommendation: right.recommendation,
      id: right.id
    }));
    const update = this.database.prepare("UPDATE agent_shadow_items SET rank = ?, updated_at = ? WHERE id = ?");
    const now = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("UPDATE agent_shadow_items SET rank = NULL, updated_at = ? WHERE shadow_run_id = ?").run(now, runId);
      ranked.forEach((item, index) => update.run(index + 1, now, item.id));
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  refreshRunProgress(runId) {
    const id = positiveInteger(runId);
    const items = this.database.prepare(`
      SELECT sample_count, success_count FROM agent_shadow_items WHERE shadow_run_id = ?
    `).all(id);
    const samples = this.database.prepare(`
      SELECT agent_shadow_samples.*
      FROM agent_shadow_samples
      JOIN agent_shadow_items ON agent_shadow_items.id = agent_shadow_samples.shadow_item_id
      WHERE agent_shadow_items.shadow_run_id = ?
    `).all(id).map(rowToShadowSample);
    const completedCount = items.filter((item) => Number(item.sample_count || 0) > 0).length;
    const failedCount = items.filter((item) => Number(item.sample_count || 0) > 0 && Number(item.success_count || 0) === 0).length;
    const modelInvocationCount = samples.filter(isModelInvocation).length;
    this.database.prepare(`
      UPDATE agent_shadow_runs
      SET completed_count = ?, failed_count = ?, sample_count = ?, model_invocation_count = ?,
          telemetry_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      completedCount,
      failedCount,
      samples.length,
      modelInvocationCount,
      stringifyJson(summarizeSampleTelemetry(samples)),
      new Date().toISOString(),
      id
    );
  }

  listRuns(options = {}) {
    const limit = clampInteger(options.limit, 1, 100, 20);
    const rows = this.database.prepare(`
      SELECT * FROM agent_shadow_runs
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);
    return {
      ok: true,
      storage: "sqlite",
      totalRuns: Number(this.database.prepare("SELECT COUNT(*) AS count FROM agent_shadow_runs").get().count || 0),
      runs: rows.map(rowToShadowRun)
    };
  }

  getRun(runId) {
    const id = positiveInteger(runId);
    if (!id) {
      throw shadowError(400, "AGENT_SHADOW_RUN_INVALID", "Valid Shadow run id is required");
    }
    const row = this.database.prepare(`
      SELECT agent_shadow_runs.*, profile_snapshots.content_hash AS profile_hash,
             profile_snapshots.payload_json AS profile_payload_json
      FROM agent_shadow_runs
      JOIN profile_snapshots ON profile_snapshots.id = agent_shadow_runs.profile_snapshot_id
      WHERE agent_shadow_runs.id = ?
    `).get(id);
    if (!row) {
      throw shadowError(404, "AGENT_SHADOW_RUN_NOT_FOUND", `Shadow run not found: ${id}`);
    }
    const itemRows = this.database.prepare(`
      SELECT agent_shadow_items.*, job_snapshots.payload_json AS job_payload_json,
             applications.status AS application_status
      FROM agent_shadow_items
      JOIN job_snapshots ON job_snapshots.id = agent_shadow_items.job_snapshot_id
      JOIN applications ON applications.id = agent_shadow_items.application_id
      WHERE agent_shadow_items.shadow_run_id = ?
      ORDER BY COALESCE(agent_shadow_items.rank, 999999), agent_shadow_items.id
    `).all(id);
    const sampleStatement = this.database.prepare(`
      SELECT * FROM agent_shadow_samples WHERE shadow_item_id = ? ORDER BY sample_index, id
    `);
    const reviewStatement = this.database.prepare(`
      SELECT * FROM agent_shadow_reviews WHERE shadow_item_id = ? ORDER BY id DESC
    `);
    const items = itemRows.map((itemRow) => {
      const samples = sampleStatement.all(itemRow.id).map(rowToShadowSample);
      const reviews = reviewStatement.all(itemRow.id).map(rowToShadowReview);
      const job = parseJson(itemRow.job_payload_json, {});
      return {
        ...rowToShadowItem(itemRow),
        application: {
          id: Number(itemRow.application_id || 0),
          status: itemRow.application_status || ""
        },
        job,
        samples,
        reviews,
        latestReview: reviews[0] || null
      };
    });
    return {
      ok: true,
      storage: "sqlite",
      run: {
        ...rowToShadowRun(row),
        profileHash: row.profile_hash || ""
      },
      profile: parseJson(row.profile_payload_json, {}),
      items
    };
  }

  addReview(itemId, input = {}) {
    const id = positiveInteger(itemId);
    const item = this.database.prepare(`
      SELECT agent_shadow_items.id, agent_shadow_runs.status AS run_status
      FROM agent_shadow_items
      JOIN agent_shadow_runs ON agent_shadow_runs.id = agent_shadow_items.shadow_run_id
      WHERE agent_shadow_items.id = ?
    `).get(id);
    if (!item) {
      throw shadowError(404, "AGENT_SHADOW_ITEM_NOT_FOUND", `Shadow item not found: ${id}`);
    }
    if (new Set(["QUEUED", "RUNNING"]).has(item.run_status)) {
      throw shadowError(409, "AGENT_SHADOW_REVIEW_RUN_ACTIVE", "Wait for the Shadow run to finish before reviewing results");
    }
    const label = cleanText(input.label).toUpperCase();
    if (!SHADOW_REVIEW_LABELS.has(label)) {
      throw shadowError(422, "AGENT_SHADOW_REVIEW_LABEL_INVALID", "Valid Shadow review label is required");
    }
    const correctedRecommendation = cleanText(input.correctedRecommendation).toLowerCase();
    if (correctedRecommendation && !SCREENING_RECOMMENDATIONS.has(correctedRecommendation)) {
      throw shadowError(422, "AGENT_SHADOW_RECOMMENDATION_INVALID", "Corrected recommendation is invalid");
    }
    const reviewer = cleanText(input.reviewer || "local-user");
    const note = cleanMultiline(input.note).slice(0, 2000);
    if (new Set(["BAD_REASON", "RISK_MISSED"]).has(label) && !note) {
      throw shadowError(422, "AGENT_SHADOW_REVIEW_NOTE_REQUIRED", `${label} requires a correction note`);
    }
    const now = new Date().toISOString();
    const result = this.database.prepare(`
      INSERT INTO agent_shadow_reviews (
        shadow_item_id, label, corrected_recommendation, reviewer, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, label, correctedRecommendation, reviewer, note, now);
    return {
      ok: true,
      storage: "sqlite",
      review: rowToShadowReview(this.database.prepare("SELECT * FROM agent_shadow_reviews WHERE id = ?")
        .get(Number(result.lastInsertRowid)))
    };
  }

  listFailureCandidates(options = {}) {
    const limit = clampInteger(options.limit, 1, 200, 50);
    const rows = this.database.prepare(`
      WITH latest_reviews AS (
        SELECT shadow_item_id, MAX(id) AS review_id
        FROM agent_shadow_reviews
        GROUP BY shadow_item_id
      )
      SELECT agent_shadow_reviews.*, agent_shadow_items.shadow_run_id,
             agent_shadow_items.application_id, agent_shadow_items.rank,
             agent_shadow_items.average_match_score, agent_shadow_items.recommendation,
             job_snapshots.payload_json AS job_payload_json
      FROM latest_reviews
      JOIN agent_shadow_reviews ON agent_shadow_reviews.id = latest_reviews.review_id
      JOIN agent_shadow_items ON agent_shadow_items.id = agent_shadow_reviews.shadow_item_id
      JOIN job_snapshots ON job_snapshots.id = agent_shadow_items.job_snapshot_id
      WHERE agent_shadow_reviews.label != 'CORRECT'
      ORDER BY agent_shadow_reviews.id DESC
      LIMIT ?
    `).all(limit);
    return {
      ok: true,
      storage: "sqlite",
      failureCandidates: rows.map((row) => ({
        review: rowToShadowReview(row),
        shadowRunId: Number(row.shadow_run_id || 0),
        applicationId: Number(row.application_id || 0),
        rank: row.rank === null ? null : Number(row.rank),
        averageMatchScore: nullableNumber(row.average_match_score),
        recommendation: row.recommendation || "",
        job: parseJson(row.job_payload_json, {})
      }))
    };
  }

  validateExplicitCandidates(applicationIds, minDescriptionLength) {
    return applicationIds.filter((applicationId) => {
      const row = this.database.prepare(`
        SELECT LENGTH(TRIM(COALESCE(jobs.description, ''))) AS description_length
        FROM applications JOIN jobs ON jobs.id = applications.job_id
        WHERE applications.id = ?
      `).get(applicationId);
      return row && Number(row.description_length || 0) >= minDescriptionLength;
    });
  }

  selectRecentCandidates(limit, minDescriptionLength) {
    return this.database.prepare(`
      SELECT applications.id
      FROM applications
      JOIN jobs ON jobs.id = applications.job_id
      WHERE LENGTH(TRIM(COALESCE(jobs.description, ''))) >= ?
      ORDER BY datetime(jobs.updated_at) DESC, applications.id DESC
      LIMIT ?
    `).all(minDescriptionLength, limit).map((row) => Number(row.id));
  }
}

function createAgentShadowService(options = {}) {
  return new AgentShadowService(options);
}

function rowToShadowRun(row) {
  const status = cleanText(row.status).toUpperCase();
  return {
    id: Number(row.id || 0),
    status: SHADOW_RUN_STATUSES.has(status) ? status : "FAILED",
    mode: row.mode || "",
    profileSnapshotId: Number(row.profile_snapshot_id || 0),
    datasetHash: row.dataset_hash || "",
    modelConfig: parseJson(row.model_config_json, {}),
    options: parseJson(row.options_json, {}),
    selectedCount: Number(row.selected_count || 0),
    completedCount: Number(row.completed_count || 0),
    failedCount: Number(row.failed_count || 0),
    sampleCount: Number(row.sample_count || 0),
    modelInvocationCount: Number(row.model_invocation_count || 0),
    telemetry: parseJson(row.telemetry_json, {}),
    errorCode: row.error_code || "",
    errorMessage: row.error_message || "",
    startedAt: row.started_at || "",
    finishedAt: row.finished_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function rowToShadowItem(row) {
  return {
    id: Number(row.id || 0),
    shadowRunId: Number(row.shadow_run_id || 0),
    applicationId: Number(row.application_id || 0),
    jobSnapshotId: Number(row.job_snapshot_id || 0),
    status: row.status || "",
    rank: row.rank === null || row.rank === undefined ? null : Number(row.rank),
    sampleCount: Number(row.sample_count || 0),
    successCount: Number(row.success_count || 0),
    averageMatchScore: nullableNumber(row.average_match_score),
    screeningScoreStddev: nullableNumber(row.screening_score_stddev),
    maxRiskScore: nullableNumber(row.max_risk_score),
    recommendation: row.recommendation || "",
    result: parseJson(row.result_json, {}),
    telemetry: parseJson(row.telemetry_json, {}),
    errors: parseJson(row.error_json, []),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function rowToShadowSample(row) {
  return {
    id: Number(row.id || 0),
    shadowItemId: Number(row.shadow_item_id || 0),
    sampleIndex: Number(row.sample_index || 0),
    status: row.status || "",
    provider: row.provider || "",
    result: parseJson(row.result_json, {}),
    telemetry: parseJson(row.telemetry_json, {}),
    errorCode: row.error_code || "",
    errorMessage: row.error_message || "",
    startedAt: row.started_at || "",
    finishedAt: row.finished_at || "",
    createdAt: row.created_at || ""
  };
}

function rowToShadowReview(row) {
  return {
    id: Number(row.id || 0),
    shadowItemId: Number(row.shadow_item_id || 0),
    label: row.label || "",
    correctedRecommendation: row.corrected_recommendation || "",
    reviewer: row.reviewer || "",
    note: row.note || "",
    createdAt: row.created_at || ""
  };
}

function compareShadowItems(left, right) {
  const scoreDifference = Number(right.averageMatchScore || 0) - Number(left.averageMatchScore || 0);
  if (scoreDifference !== 0) {
    return scoreDifference;
  }
  const riskDifference = Number(left.maxRiskScore ?? 100) - Number(right.maxRiskScore ?? 100);
  if (riskDifference !== 0) {
    return riskDifference;
  }
  return Number(left.id || 0) - Number(right.id || 0);
}

function chooseConservativeMajority(values) {
  const counts = countValues(values.filter((value) => SCREENING_RECOMMENDATIONS.has(value)));
  const priority = { skip: 3, review_needed: 2, auto_prepare: 1 };
  return Object.keys(counts).sort((left, right) => (
    counts[right] - counts[left] || priority[right] - priority[left]
  ))[0] || "";
}

function summarizeSampleTelemetry(samples) {
  const entries = samples.filter((sample) => sample.telemetry && Object.keys(sample.telemetry).length);
  const durations = entries.map((sample) => Number(sample.telemetry.durationMs || 0)).filter((value) => value > 0);
  const usage = entries.reduce((summary, sample) => {
    const item = sample.telemetry.usage || {};
    summary.inputTokens += Number(item.inputTokens || 0);
    summary.outputTokens += Number(item.outputTokens || 0);
    summary.reasoningTokens += Number(item.reasoningTokens || 0);
    summary.totalTokens += Number(item.totalTokens || 0);
    summary.estimatedCostUsd += Number(sample.telemetry.estimatedCostUsd || 0);
    summary.attempts += Number(sample.telemetry.attemptCount || 0);
    return summary;
  }, {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    attempts: 0
  });
  usage.estimatedCostUsd = Number(usage.estimatedCostUsd.toFixed(8));
  return {
    invocationCount: entries.length,
    usage,
    latencyMs: {
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      max: durations.length ? Math.max(...durations) : 0
    },
    providerCounts: countValues(samples.map((sample) => sample.provider || "unknown")),
    failedSampleCount: samples.filter((sample) => sample.status === "FAILED").length
  };
}

function isModelInvocation(sample) {
  return Boolean(
    sample.telemetry?.model
    || sample.telemetry?.requestHash
    || Number(sample.telemetry?.attemptCount || 0) > 0
    || new Set(["hybrid", "llm"]).has(sample.provider)
  );
}

async function waitForPacing(pacing) {
  const delayMs = Math.max(0, Number(pacing.delayMs || 0));
  const elapsed = Date.now() - Number(pacing.lastStartedAt || 0);
  if (delayMs > 0 && pacing.lastStartedAt && elapsed < delayMs) {
    await new Promise((resolve) => setTimeout(resolve, delayMs - elapsed));
  }
  pacing.lastStartedAt = Date.now();
}

function normalizeMode(value) {
  const mode = cleanText(value).toLowerCase();
  return new Set(["rules", "auto", "llm", "hybrid"]).has(mode) ? mode : "hybrid";
}

function publicModelConfig(config = {}) {
  return {
    configured: Boolean(config.configured),
    baseUrl: config.baseUrl || "",
    model: config.model || "",
    wireApi: config.wireApi || "",
    reasoningEffort: config.reasoningEffort || "",
    timeoutMs: Number(config.timeoutMs || 0),
    maxRetries: Number(config.maxRetries || 0),
    inputCostPerMillion: Number(config.inputCostPerMillion || 0),
    outputCostPerMillion: Number(config.outputCostPerMillion || 0),
    source: config.source || ""
  };
}

function hashValue(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stringifyJson(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function uniquePositiveIntegers(value) {
  return Array.from(new Set((Array.isArray(value) ? value : []).map(Number)
    .filter((item) => Number.isInteger(item) && item > 0)));
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).map(cleanText).filter(Boolean)));
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  const resolved = Number.isFinite(number) ? Math.trunc(number) : fallback;
  return Math.max(min, Math.min(max, resolved));
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanMultiline(value) {
  return String(value || "").replace(/\r\n?/g, "\n").trim();
}

function countValues(values) {
  const result = {};
  for (const value of values || []) {
    const key = cleanText(value || "unknown") || "unknown";
    result[key] = Number(result[key] || 0) + 1;
  }
  return result;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values) {
  if (values.length <= 1) {
    return 0;
  }
  const mean = average(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length);
}

function percentile(values, quantile) {
  const sorted = values.slice().sort((left, right) => left - right);
  if (!sorted.length) {
    return 0;
  }
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))];
}

function shadowError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

module.exports = {
  AgentShadowService,
  SHADOW_REVIEW_LABELS,
  createAgentShadowService
};
