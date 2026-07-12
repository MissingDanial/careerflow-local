"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { runAuditAgent } = require("./audit-agent");
const { runClaimVerifier } = require("./claim-verifier");
const { loadModelConfig } = require("./model-client");
const { runResumeAgent } = require("./resume-agent");
const { runResumeFitEvaluator } = require("./resume-fit-evaluator");
const { runScreeningAgent } = require("./screening-agent");

const REPORT_SCHEMA_VERSION = "m16.real-model-evaluation.v1";
const DEFAULT_THRESHOLDS = Object.freeze({
  structuredOutputSuccessRate: 0.95,
  successfulSampleRate: 0.9,
  riskGateRecall: 1,
  riskGatePrecision: 1,
  rankingPairAccuracy: 0.9,
  screeningRecommendationAccuracy: 0.75,
  jdMustHaveStatusAccuracy: 0.8,
  generatedClaimSupportRate: 0.95,
  auditConsistency: 0.8,
  maxScreeningScoreStdDev: 8,
  unsupportedClaimCount: 0
});

async function runRealModelEvaluation(dataset, options = {}) {
  validateDataset(dataset);
  const mode = normalizeMode(options.mode || "hybrid");
  const samplesPerCase = Math.max(1, Math.min(10, Number(options.samplesPerCase) || 3));
  const modelConfig = loadModelConfig(options.modelConfig || {});
  const requestDelayMs = Math.max(
    0,
    Math.min(30000, Number(options.requestDelayMs ?? process.env.BOSS_MODEL_EVAL_DELAY_MS ?? 1000) || 0)
  );
  if (mode !== "rules" && !modelConfig.configured) {
    throw evaluationError("LLM_CONFIG_INVALID", "Real-model evaluation requires configured model credentials");
  }
  const selectedCaseIds = new Set(normalizeStringArray(options.caseIds));
  const cases = dataset.jobCases.filter((item) => !selectedCaseIds.size || selectedCaseIds.has(item.id));
  if (!cases.length) {
    throw evaluationError("EVAL_CASES_EMPTY", "No matching job cases were selected for real-model evaluation");
  }
  const profiles = new Map(dataset.profiles.map((profile) => [profile.id, profile]));
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const startedAt = new Date().toISOString();
  const outcomes = [];
  const modelStageStats = { attempted: 0, succeeded: 0, schemaFailures: 0, transportFailures: 0, fallbackCount: 0 };
  const telemetry = [];
  const pacing = { requestDelayMs, lastStartedAt: 0 };

  for (const fixture of cases) {
    const profile = profiles.get(fixture.profileId);
    if (!profile) {
      throw evaluationError("EVAL_DATASET_INVALID", `Unknown profile ${fixture.profileId} for ${fixture.id}`);
    }
    for (let sampleIndex = 0; sampleIndex < samplesPerCase; sampleIndex += 1) {
      outcomes.push(await runEvaluationSample({
        fixture,
        profile,
        sampleIndex,
        mode,
        modelConfig,
        requestStructuredCompletion: options.requestStructuredCompletion,
        modelStageStats,
        telemetry,
        pacing
      }));
    }
  }

  const metricValues = calculateMetrics(cases, outcomes, modelStageStats);
  const metrics = Object.fromEntries(Object.entries(metricValues).map(([name, value]) => {
    const maximumMetric = name === "maxScreeningScoreStdDev" || name === "unsupportedClaimCount";
    const threshold = Number(thresholds[name]);
    return [name, {
      value,
      threshold,
      comparison: maximumMetric ? "<=" : ">=",
      passed: maximumMetric ? value <= threshold : value >= threshold
    }];
  }));
  const finishedAt = new Date().toISOString();
  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    evaluationId: hashValue({
      datasetId: dataset.id,
      datasetVersion: dataset.version,
      mode,
      samplesPerCase,
      model: modelConfig.model,
      outcomes: outcomes.map(compactOutcomeIdentity)
    }).slice(0, 16),
    dataset: {
      id: dataset.id,
      version: dataset.version,
      sha256: hashValue(dataset),
      selectedCaseIds: cases.map((item) => item.id),
      profileCount: new Set(cases.map((item) => item.profileId)).size,
      jobCaseCount: cases.length
    },
    mode,
    samplesPerCase,
    requestDelayMs,
    modelConfig: publicModelConfig(modelConfig),
    startedAt,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
    passed: Object.values(metrics).every((metric) => metric.passed),
    metrics,
    telemetry: summarizeTelemetry(telemetry, modelStageStats),
    cases: summarizeCases(cases, outcomes),
    failures: outcomes.flatMap((outcome) => outcome.errors.map((error) => ({
      caseId: outcome.caseId,
      sampleIndex: outcome.sampleIndex,
      ...error
    })))
  };
  return report;
}

async function runEvaluationSample(options) {
  const {
    fixture,
    profile,
    sampleIndex,
    mode,
    modelConfig,
    requestStructuredCompletion,
    modelStageStats,
    telemetry,
    pacing
  } = options;
  const outcome = {
    caseId: fixture.id,
    profileId: fixture.profileId,
    sampleIndex,
    labels: fixture.labels,
    success: false,
    screening: null,
    fit: null,
    claims: null,
    audit: null,
    errors: []
  };
  try {
    const screening = await runModelStage("ScreeningAgent", modelStageStats, telemetry, pacing, () => runScreeningAgent({
      job: fixture.job,
      profile,
      userRules: {}
    }, {
      mode,
      modelConfig,
      requestStructuredCompletion
    }));
    outcome.screening = screening.result;
    outcome.screeningProvider = screening.provider;
    outcome.screeningFallbackUsed = Boolean(screening.fallbackUsed);
    if (screening.provider === "risk_gate" || screening.result.recommendation === "skip") {
      outcome.success = true;
      return outcome;
    }

    const resume = await runModelStage("ResumeAgent", modelStageStats, telemetry, pacing, () => runResumeAgent({
      application: { id: sampleIndex + 1 },
      job: fixture.job,
      screening: screening.result,
      profile,
      userRules: {}
    }, {
      mode,
      modelConfig,
      requestStructuredCompletion
    }));
    const resumeVersion = {
      id: sampleIndex + 1,
      applicationId: sampleIndex + 1,
      screeningId: sampleIndex + 1,
      ...resume.result,
      renderMetadata: {
        maxPages: 2,
        template: resume.result.renderHints?.template || "resume-to-word-campus-product-v1",
        renderQuality: { ok: true }
      }
    };
    const fit = await runModelStage("ResumeFitEvaluator", modelStageStats, telemetry, pacing, () => runResumeFitEvaluator({
      application: { id: sampleIndex + 1 },
      job: fixture.job,
      resumeVersion
    }, {
      mode,
      modelConfig,
      requestStructuredCompletion
    }));
    outcome.fit = fit.result;
    const claims = runClaimVerifier({
      application: { id: sampleIndex + 1 },
      profile,
      resumeVersion,
      sourceMapping: resumeVersion.sourceMapping
    }, { mode: "rules" });
    outcome.claims = claims.result;
    const audit = await runModelStage("AuditAgent", modelStageStats, telemetry, pacing, () => runAuditAgent({
      resumeVersionId: resumeVersion.id,
      job: fixture.job,
      screening: screening.result,
      profile,
      resumeFields: resumeVersion.resumeFields,
      sourceMapping: resumeVersion.sourceMapping,
      unsupportedClaims: resumeVersion.unsupportedClaims,
      renderMetadata: resumeVersion.renderMetadata
    }, {
      mode,
      modelConfig,
      requestStructuredCompletion
    }));
    outcome.audit = audit.result;
    outcome.success = true;
    return outcome;
  } catch (error) {
    outcome.errors.push({
      agent: error.agent || "unknown",
      code: error.code || "EVALUATION_SAMPLE_FAILED",
      message: cleanText(error.message || String(error)).slice(0, 1000)
    });
    return outcome;
  }
}

async function runModelStage(agentName, stats, telemetry, pacing, operation) {
  await waitForEvaluationPacing(pacing);
  stats.attempted += 1;
  try {
    const result = await operation();
    if (result.provider === "rules" && result.fallbackUsed) {
      stats.fallbackCount += 1;
    } else if (result.provider !== "rules" && result.provider !== "risk_gate") {
      stats.succeeded += 1;
    } else if (result.provider === "risk_gate") {
      stats.attempted -= 1;
    }
    if (result.telemetry && Object.keys(result.telemetry).length) {
      telemetry.push({ agentName, ...result.telemetry });
    }
    return result;
  } catch (error) {
    if (error.code === "AGENT_OUTPUT_SCHEMA_INVALID" || error.code === "AGENT_OUTPUT_EVIDENCE_INVALID") {
      stats.schemaFailures += 1;
    } else {
      stats.transportFailures += 1;
    }
    if (error.telemetry && Object.keys(error.telemetry).length) {
      telemetry.push({ agentName, ...error.telemetry, failed: true });
    }
    throw error;
  }
}

async function waitForEvaluationPacing(pacing = {}) {
  const minimumDelay = Math.max(0, Number(pacing.requestDelayMs || 0));
  const elapsed = Date.now() - Number(pacing.lastStartedAt || 0);
  if (minimumDelay > 0 && pacing.lastStartedAt && elapsed < minimumDelay) {
    await new Promise((resolve) => setTimeout(resolve, minimumDelay - elapsed));
  }
  pacing.lastStartedAt = Date.now();
}

function calculateMetrics(cases, outcomes, modelStageStats) {
  const completed = outcomes.filter((item) => item.success);
  const riskOutcomes = outcomes.filter((item) => item.screening);
  const truePositive = riskOutcomes.filter((item) => item.labels.riskBlocked && item.screeningProvider === "risk_gate").length;
  const falseNegative = riskOutcomes.filter((item) => item.labels.riskBlocked && item.screeningProvider !== "risk_gate").length;
  const falsePositive = riskOutcomes.filter((item) => !item.labels.riskBlocked && item.screeningProvider === "risk_gate").length;
  const screeningAccuracy = ratio(
    riskOutcomes.filter((item) => item.screening.recommendation === item.labels.expectedScreeningRecommendation).length,
    riskOutcomes.length
  );
  const expectedAudit = outcomes.filter((item) => item.labels.expectedAuditRecommendation);
  const claimSummaries = outcomes.map((item) => item.claims?.summary).filter(Boolean);
  const supportedClaims = claimSummaries.reduce((sum, item) => sum + Number(item.supported || 0), 0);
  const totalClaims = claimSummaries.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const unsupportedClaims = claimSummaries.reduce((sum, item) => sum + Number(item.unsupported || 0), 0);
  const mustHaveChecks = [];
  for (const outcome of outcomes) {
    for (const expected of outcome.labels.mustHaveRequirements || []) {
      const actual = (outcome.fit?.coverage?.items || []).find((item) => containsLoose(item.requirement, expected.text));
      mustHaveChecks.push(Boolean(actual && actual.status === expected.expectedStatus));
    }
  }
  const caseSummaries = summarizeCases(cases, outcomes);
  return {
    structuredOutputSuccessRate: ratio(modelStageStats.succeeded, modelStageStats.attempted),
    successfulSampleRate: ratio(completed.length, outcomes.length),
    riskGateRecall: ratio(truePositive, truePositive + falseNegative),
    riskGatePrecision: ratio(truePositive, truePositive + falsePositive),
    rankingPairAccuracy: calculateRankingAccuracy(caseSummaries),
    screeningRecommendationAccuracy: screeningAccuracy,
    jdMustHaveStatusAccuracy: ratio(mustHaveChecks.filter(Boolean).length, mustHaveChecks.length),
    generatedClaimSupportRate: ratio(supportedClaims, totalClaims),
    auditConsistency: ratio(
      expectedAudit.filter((item) => item.audit?.recommendation === item.labels.expectedAuditRecommendation).length,
      expectedAudit.length
    ),
    maxScreeningScoreStdDev: Number(Math.max(0, ...caseSummaries.map((item) => item.screeningScoreStdDev)).toFixed(4)),
    unsupportedClaimCount: unsupportedClaims
  };
}

function summarizeCases(cases, outcomes) {
  return cases.map((fixture) => {
    const samples = outcomes.filter((item) => item.caseId === fixture.id);
    const scores = samples.map((item) => Number(item.screening?.matchScore)).filter(Number.isFinite);
    const recommendations = countValues(samples.map((item) => item.screening?.recommendation || "error"));
    return {
      caseId: fixture.id,
      profileId: fixture.profileId,
      labels: fixture.labels,
      sampleCount: samples.length,
      successCount: samples.filter((item) => item.success).length,
      averageScreeningScore: average(scores),
      screeningScoreStdDev: standardDeviation(scores),
      recommendations,
      auditRecommendations: countValues(samples.map((item) => item.audit?.recommendation || "not_run")),
      unsupportedClaimCount: samples.reduce((sum, item) => sum + Number(item.claims?.summary?.unsupported || 0), 0),
      errorCount: samples.reduce((sum, item) => sum + item.errors.length, 0)
    };
  });
}

function calculateRankingAccuracy(caseSummaries) {
  const groups = new Map();
  for (const item of caseSummaries) {
    const group = item.labels.rankingGroup;
    const rank = Number(item.labels.expectedRank || 0);
    if (!group || !rank || !Number.isFinite(item.averageScreeningScore)) {
      continue;
    }
    const list = groups.get(group) || [];
    list.push({ rank, score: item.averageScreeningScore });
    groups.set(group, list);
  }
  let passed = 0;
  let total = 0;
  for (const items of groups.values()) {
    for (let left = 0; left < items.length; left += 1) {
      for (let right = left + 1; right < items.length; right += 1) {
        if (items[left].rank === items[right].rank) {
          continue;
        }
        total += 1;
        const expected = items[left].rank < items[right].rank ? items[left] : items[right];
        const other = expected === items[left] ? items[right] : items[left];
        if (expected.score > other.score) {
          passed += 1;
        }
      }
    }
  }
  return ratio(passed, total);
}

function summarizeTelemetry(entries, stats) {
  const durations = entries.map((item) => Number(item.durationMs || 0)).filter((value) => value > 0);
  const usage = entries.reduce((summary, item) => {
    summary.inputTokens += Number(item.usage?.inputTokens || 0);
    summary.outputTokens += Number(item.usage?.outputTokens || 0);
    summary.reasoningTokens += Number(item.usage?.reasoningTokens || 0);
    summary.totalTokens += Number(item.usage?.totalTokens || 0);
    summary.estimatedCostUsd += Number(item.estimatedCostUsd || 0);
    summary.attempts += Number(item.attemptCount || 0);
    return summary;
  }, { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, estimatedCostUsd: 0, attempts: 0 });
  usage.estimatedCostUsd = Number(usage.estimatedCostUsd.toFixed(8));
  return {
    modelStageStats: { ...stats },
    invocationCount: entries.length,
    usage,
    latencyMs: {
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      max: durations.length ? Math.max(...durations) : 0
    },
    agentCounts: countValues(entries.map((item) => item.agentName)),
    modelCounts: countValues(entries.map((item) => item.model || "unknown"))
  };
}

function writeRealModelEvaluationReport(report, outputDirectory) {
  const directory = path.resolve(outputDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const jsonPath = path.join(directory, "m16-real-model-evaluation-report.json");
  const markdownPath = path.join(directory, "m16-real-model-evaluation-report.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownPath, renderRealModelEvaluationMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function renderRealModelEvaluationMarkdown(report) {
  const lines = [
    "# M16 Real-model Agent Evaluation",
    "",
    `- Evaluation: \`${report.evaluationId}\``,
    `- Dataset: \`${report.dataset.id}@${report.dataset.version}\``,
    `- Mode: \`${report.mode}\``,
    `- Model: \`${report.modelConfig.model || "unknown"}\``,
    `- Samples per case: ${report.samplesPerCase}`,
    `- Minimum request interval: ${report.requestDelayMs} ms`,
    `- Result: **${report.passed ? "PASS" : "FAIL"}**`,
    "",
    "## Metrics",
    "",
    "| Metric | Value | Gate | Result |",
    "|---|---:|---:|---|",
    ...Object.entries(report.metrics).map(([name, metric]) => (
      `| ${name} | ${formatMetric(metric.value)} | ${metric.comparison} ${formatMetric(metric.threshold)} | ${metric.passed ? "PASS" : "FAIL"} |`
    )),
    "",
    "## Runtime",
    "",
    `- Invocations: ${report.telemetry.invocationCount}`,
    `- Total tokens: ${report.telemetry.usage.totalTokens}`,
    `- Reasoning tokens: ${report.telemetry.usage.reasoningTokens}`,
    `- Estimated cost USD: ${report.telemetry.usage.estimatedCostUsd || "not configured"}`,
    `- Latency p50/p95: ${report.telemetry.latencyMs.p50} / ${report.telemetry.latencyMs.p95} ms`,
    `- Failures: ${report.failures.length}`,
    "",
    "## Cases",
    "",
    "| Case | Avg score | Std dev | Success | Errors |",
    "|---|---:|---:|---:|---:|",
    ...report.cases.map((item) => (
      `| ${item.caseId} | ${item.averageScreeningScore.toFixed(2)} | ${item.screeningScoreStdDev.toFixed(2)} | ${item.successCount}/${item.sampleCount} | ${item.errorCount} |`
    )),
    ""
  ];
  return lines.join("\n");
}

function compactOutcomeIdentity(outcome) {
  return {
    caseId: outcome.caseId,
    sampleIndex: outcome.sampleIndex,
    success: outcome.success,
    matchScore: outcome.screening?.matchScore ?? null,
    recommendation: outcome.screening?.recommendation || "",
    audit: outcome.audit?.recommendation || "",
    errors: outcome.errors.map((error) => error.code)
  };
}

function validateDataset(dataset) {
  if (!dataset || typeof dataset !== "object" || !dataset.id || !dataset.version) {
    throw evaluationError("EVAL_DATASET_INVALID", "Evaluation dataset id and version are required");
  }
  if (!Array.isArray(dataset.profiles) || !dataset.profiles.length || !Array.isArray(dataset.jobCases) || !dataset.jobCases.length) {
    throw evaluationError("EVAL_DATASET_INVALID", "Evaluation dataset profiles and jobCases are required");
  }
}

function publicModelConfig(config = {}) {
  return {
    configured: Boolean(config.configured),
    baseUrl: config.baseUrl || "",
    model: config.model || "",
    wireApi: config.wireApi || "",
    reasoningEffort: config.reasoningEffort || "",
    maxRetries: Number(config.maxRetries || 0),
    source: config.source || ""
  };
}

function normalizeMode(value) {
  const mode = cleanText(value).toLowerCase();
  return new Set(["rules", "auto", "llm", "hybrid"]).has(mode) ? mode : "hybrid";
}

function containsLoose(left, right) {
  const a = cleanText(left).toLowerCase();
  const b = cleanText(right).toLowerCase();
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

function ratio(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(6)) : 1;
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

function countValues(values) {
  const result = {};
  for (const value of values) {
    const key = cleanText(value || "unknown") || "unknown";
    result[key] = Number(result[key] || 0) + 1;
  }
  return result;
}

function normalizeStringArray(value) {
  return (Array.isArray(value) ? value : []).map(cleanText).filter(Boolean);
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hashValue(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function formatMetric(value) {
  return Number.isInteger(value) ? String(value) : Number(value || 0).toFixed(4);
}

function evaluationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = {
  DEFAULT_THRESHOLDS,
  REPORT_SCHEMA_VERSION,
  renderRealModelEvaluationMarkdown,
  runRealModelEvaluation,
  writeRealModelEvaluationReport
};
