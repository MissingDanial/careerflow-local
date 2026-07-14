"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { runAuditAgent } = require("./audit-agent");
const { runClaimVerifier } = require("./claim-verifier");
const { evaluateJobRiskGate } = require("./job-risk-gate");
const { runResumeAgent } = require("./resume-agent");
const { runResumeFitEvaluator } = require("./resume-fit-evaluator");
const {
  AGENT_VERSION,
  GRAPH_VERSION,
  PROMPT_VERSION,
  applyResumeRenderPolicy
} = require("./resume-workflow-graph");
const { runScreeningAgent } = require("./screening-agent");

const REPORT_SCHEMA_VERSION = "m13.agent-evaluation-report.v1";
const DEFAULT_REPORT_BASENAME = "m13-agent-evaluation-report";

function loadAgentEvaluationDataset(datasetPath) {
  const absolutePath = path.resolve(datasetPath);
  const dataset = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  validateDataset(dataset);
  return {
    dataset,
    absolutePath,
    fileName: path.basename(absolutePath),
    sha256: hashValue(dataset)
  };
}

async function runAgentEvaluation(datasetInput, options = {}) {
  const loaded = normalizeDatasetInput(datasetInput, options);
  const dataset = loaded.dataset;
  validateDataset(dataset);

  const profiles = new Map(dataset.profiles.map((profile) => [profile.id, profile]));
  const jobCases = [];
  for (const fixture of dataset.jobCases) {
    jobCases.push(await evaluateJobCase(fixture, profiles));
  }
  const claimCases = dataset.claimCases.map((fixture) => evaluateClaimCase(fixture, profiles));
  const auditCases = dataset.auditCases.map((fixture) => evaluateAuditCase(fixture, profiles));
  const metrics = calculateMetrics({ dataset, jobCases, claimCases, auditCases });
  const failures = Object.values(metrics).flatMap((metric) => metric.failures);
  const providers = collectProviders(jobCases, claimCases, auditCases);
  const generatedAt = new Date().toISOString();
  const inputSnapshot = {
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    datasetFile: loaded.fileName,
    datasetSha256: loaded.sha256,
    profileCount: dataset.profiles.length,
    jobCaseCount: dataset.jobCases.length,
    claimCaseCount: dataset.claimCases.length,
    auditCaseCount: dataset.auditCases.length
  };
  const versions = {
    graphVersion: GRAPH_VERSION,
    promptVersion: PROMPT_VERSION,
    agentVersion: AGENT_VERSION,
    datasetVersion: dataset.version
  };
  const evaluationId = hashValue({
    inputSnapshot,
    versions,
    mode: "rules"
  }).slice(0, 16);

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    evaluationId,
    generatedAt,
    ok: Object.values(metrics).every((metric) => metric.passed),
    inputSnapshot,
    execution: {
      mode: "rules",
      providers,
      model: {
        provider: "local_rules",
        model: "none",
        externalCallMade: false
      },
      runtime: {
        node: process.version,
        platform: process.platform
      }
    },
    versions,
    thresholds: { ...dataset.thresholds },
    summary: {
      metricCount: Object.keys(metrics).length,
      passedMetricCount: Object.values(metrics).filter((metric) => metric.passed).length,
      failedMetricCount: Object.values(metrics).filter((metric) => !metric.passed).length,
      failureCount: failures.length
    },
    metrics,
    failures,
    cases: {
      jobs: jobCases,
      claims: claimCases,
      audits: auditCases
    }
  };
}

function writeAgentEvaluationReport(report, outputDirectory, options = {}) {
  const directory = path.resolve(outputDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const basename = cleanText(options.basename || DEFAULT_REPORT_BASENAME) || DEFAULT_REPORT_BASENAME;
  const jsonPath = path.join(directory, `${basename}.json`);
  const markdownPath = path.join(directory, `${basename}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownPath, renderAgentEvaluationMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function renderAgentEvaluationMarkdown(report) {
  const lines = [
    "# M13 Agent Evaluation Report",
    "",
    `- Result: ${report.ok ? "PASS" : "FAIL"}`,
    `- Evaluation ID: \`${escapeMarkdown(report.evaluationId)}\``,
    `- Generated at: ${escapeMarkdown(report.generatedAt)}`,
    `- Dataset: \`${escapeMarkdown(report.inputSnapshot.datasetId)}@${escapeMarkdown(report.inputSnapshot.datasetVersion)}\``,
    `- Dataset SHA-256: \`${escapeMarkdown(report.inputSnapshot.datasetSha256)}\``,
    `- Execution: \`${escapeMarkdown(report.execution.mode)}\` / \`${escapeMarkdown(report.execution.model.provider)}\``,
    "",
    "## Versions",
    "",
    "| Graph | Prompt | Agent |",
    "| --- | --- | --- |",
    `| \`${escapeMarkdown(report.versions.graphVersion)}\` | \`${escapeMarkdown(report.versions.promptVersion)}\` | \`${escapeMarkdown(report.versions.agentVersion)}\` |`,
    "",
    "## Metrics",
    "",
    "| Metric | Value | Threshold | Result | Samples |",
    "| --- | ---: | ---: | --- | ---: |"
  ];
  for (const metric of Object.values(report.metrics)) {
    lines.push(`| ${escapeMarkdown(metric.label)} | ${formatRatio(metric.value)} | ${formatRatio(metric.threshold)} | ${metric.passed ? "PASS" : "FAIL"} | ${metric.denominator} |`);
  }

  lines.push("", "## Job Cases", "", "| Case | Risk | Match | Recommendation | Fit | Claim Support | Audit |", "| --- | --- | ---: | --- | ---: | ---: | --- |");
  for (const item of report.cases.jobs) {
    lines.push(`| \`${escapeMarkdown(item.id)}\` | ${item.actual.riskBlocked ? "blocked" : "clear"} | ${item.actual.matchScore} | ${escapeMarkdown(item.actual.screeningRecommendation)} | ${item.actual.fitScore === null ? "-" : item.actual.fitScore} | ${item.actual.generatedClaimSupportRatio === null ? "-" : formatRatio(item.actual.generatedClaimSupportRatio)} | ${escapeMarkdown(item.actual.auditRecommendation || "-")} |`);
  }

  lines.push("", "## Failures", "");
  if (!report.failures.length) {
    lines.push("No threshold or labeled-sample failures.");
  } else {
    lines.push("| Metric | Sample | Expected | Actual |", "| --- | --- | --- | --- |");
    for (const failure of report.failures) {
      lines.push(`| ${escapeMarkdown(failure.metric)} | \`${escapeMarkdown(failure.sampleId)}\` | ${escapeMarkdown(stringifyCell(failure.expected))} | ${escapeMarkdown(stringifyCell(failure.actual))} |`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function evaluateJobCase(fixture, profiles) {
  const profile = requireProfile(profiles, fixture.profileId, fixture.id);
  const input = {
    job: fixture.job,
    profile,
    userRules: fixture.userRules || {}
  };
  const riskGate = evaluateJobRiskGate(input);
  const screening = await runScreeningAgent(input, { mode: "rules" });
  let resume = null;
  let fit = null;
  let claims = null;
  let audit = null;

  if (screening.result.recommendation !== "skip") {
    const generatedResume = runResumeAgent({
      application: { id: 0 },
      job: fixture.job,
      profile,
      screening: screening.result,
      userRules: fixture.userRules || {}
    }, { mode: "rules" });
    resume = {
      ...generatedResume,
      result: applyResumeRenderPolicy(generatedResume.result, {})
    };
    const resumeVersion = {
      id: 0,
      applicationId: 0,
      resumeFields: resume.result.resumeFields,
      renderMetadata: resume.result.renderMetadata
    };
    fit = runResumeFitEvaluator({
      application: { id: 0 },
      job: fixture.job,
      resumeVersion
    }, { mode: "rules" });
    claims = runClaimVerifier({
      application: { id: 0 },
      profile,
      resumeVersion,
      sourceMapping: resume.result.sourceMapping
    }, { mode: "rules" });
    audit = runAuditAgent({
      resumeVersionId: 0,
      job: fixture.job,
      screening: screening.result,
      profile,
      resumeFields: resume.result.resumeFields,
      sourceMapping: resume.result.sourceMapping,
      unsupportedClaims: resume.result.unsupportedClaims,
      renderMetadata: {
        templateId: "m13-evaluation",
        renderQuality: { ok: true, warnings: [] }
      }
    }, { mode: "rules" });
  }

  const claimSummary = claims?.result?.summary || null;
  return {
    id: fixture.id,
    profileId: fixture.profileId,
    rankingGroup: cleanText(fixture.labels.rankingGroup),
    expectedRank: numberOrNull(fixture.labels.expectedRank),
    inputHash: hashValue({ profile, job: fixture.job, userRules: fixture.userRules || {} }),
    labels: {
      riskBlocked: Boolean(fixture.labels.riskBlocked),
      mustHaveRequirements: fixture.labels.mustHaveRequirements || [],
      expectedScreeningRecommendation: cleanText(fixture.labels.expectedScreeningRecommendation),
      expectedAuditRecommendation: cleanText(fixture.labels.expectedAuditRecommendation)
    },
    actual: {
      riskBlocked: riskGate.blocked,
      riskMatchedDirections: riskGate.matchedDirections,
      matchScore: screening.result.matchScore,
      riskScore: screening.result.riskScore,
      screeningRecommendation: screening.result.recommendation,
      fitScore: fit ? fit.result.coverage.score : null,
      fitItems: fit ? fit.result.coverage.items : [],
      generatedClaimSupportRatio: claimSummary ? claimSummary.coverageRatio : null,
      generatedClaimSummary: claimSummary,
      auditRecommendation: audit?.result?.recommendation || "",
      providers: unique([
        screening.provider,
        resume?.provider,
        fit?.provider,
        claims?.provider,
        audit?.provider
      ])
    }
  };
}

function evaluateClaimCase(fixture, profiles) {
  const profile = requireProfile(profiles, fixture.profileId, fixture.id);
  const resumeFields = materializeResumeFields(fixture.resumeFields);
  const result = runClaimVerifier({
    application: { id: 0 },
    profile,
    resumeVersion: {
      id: 0,
      applicationId: 0,
      resumeFields
    },
    sourceMapping: fixture.sourceMapping || []
  }, { mode: "rules" });
  const byField = new Map(result.result.claims.map((claim) => [claim.field, claim]));
  const labels = fixture.labels.map((label) => {
    const claim = byField.get(label.field);
    return {
      field: label.field,
      expectedStatuses: normalizeExpectedStatuses(label.expectedStatus),
      actualStatus: claim?.status || "MISSING_CLAIM",
      claim: claim?.claim || ""
    };
  });
  return {
    id: fixture.id,
    profileId: fixture.profileId,
    inputHash: hashValue({ profile, resumeFields, sourceMapping: fixture.sourceMapping || [] }),
    provider: result.provider,
    summary: result.result.summary,
    labels
  };
}

function evaluateAuditCase(fixture, profiles) {
  const profile = requireProfile(profiles, fixture.profileId, fixture.id);
  const resumeFields = materializeResumeFields(fixture.resumeFields);
  const result = runAuditAgent({
    resumeVersionId: 0,
    job: fixture.job || {},
    screening: fixture.screening || {},
    profile,
    resumeFields,
    sourceMapping: fixture.sourceMapping || [],
    unsupportedClaims: fixture.unsupportedClaims || [],
    renderMetadata: fixture.renderMetadata || {}
  }, { mode: "rules" });
  return {
    id: fixture.id,
    profileId: fixture.profileId,
    inputHash: hashValue(fixture),
    provider: result.provider,
    expectedRecommendation: fixture.expectedRecommendation,
    actualRecommendation: result.result.recommendation,
    riskFlags: result.result.riskFlags
  };
}

function calculateMetrics({ dataset, jobCases, claimCases, auditCases }) {
  const thresholds = dataset.thresholds;
  const riskPositive = jobCases.filter((item) => item.labels.riskBlocked);
  const riskPredictedPositive = jobCases.filter((item) => item.actual.riskBlocked);
  const riskTruePositive = riskPositive.filter((item) => item.actual.riskBlocked);
  const riskRecallFailures = riskPositive
    .filter((item) => !item.actual.riskBlocked)
    .map((item) => failure("riskGateRecall", item.id, true, false));
  const riskPrecisionFailures = riskPredictedPositive
    .filter((item) => !item.labels.riskBlocked)
    .map((item) => failure("riskGatePrecision", item.id, false, true));

  const ranking = calculateRankingMetric(jobCases, thresholds.rankingPairAccuracy);
  const jd = calculateJdMetrics(jobCases, thresholds);
  const generatedClaims = jobCases.filter((item) => item.actual.generatedClaimSummary);
  const generatedClaimSupported = generatedClaims.reduce((sum, item) => sum + item.actual.generatedClaimSummary.supported, 0);
  const generatedClaimTotal = generatedClaims.reduce((sum, item) => sum + item.actual.generatedClaimSummary.total, 0);
  const generatedClaimFailures = generatedClaims
    .filter((item) => item.actual.generatedClaimSupportRatio < thresholds.generatedClaimSupportRate)
    .map((item) => failure("generatedClaimSupportRate", item.id, `>=${thresholds.generatedClaimSupportRate}`, item.actual.generatedClaimSupportRatio));

  const claimLabels = claimCases.flatMap((item) => item.labels.map((label) => ({ ...label, caseId: item.id })));
  const correctClaimLabels = claimLabels.filter((label) => label.expectedStatuses.includes(label.actualStatus));
  const claimFailures = claimLabels
    .filter((label) => !label.expectedStatuses.includes(label.actualStatus))
    .map((label) => failure("claimVerdictAccuracy", `${label.caseId}:${label.field}`, label.expectedStatuses, label.actualStatus));

  const screeningLabels = jobCases.filter((item) => item.labels.expectedScreeningRecommendation);
  const correctScreeningLabels = screeningLabels.filter((item) => item.actual.screeningRecommendation === item.labels.expectedScreeningRecommendation);
  const screeningFailures = screeningLabels
    .filter((item) => item.actual.screeningRecommendation !== item.labels.expectedScreeningRecommendation)
    .map((item) => failure("screeningRecommendationAccuracy", item.id, item.labels.expectedScreeningRecommendation, item.actual.screeningRecommendation));

  const generatedAuditLabels = jobCases
    .filter((item) => item.labels.expectedAuditRecommendation)
    .map((item) => ({
      id: item.id,
      expectedRecommendation: item.labels.expectedAuditRecommendation,
      actualRecommendation: item.actual.auditRecommendation
    }));
  const allAuditLabels = [...generatedAuditLabels, ...auditCases];
  const correctAudits = allAuditLabels.filter((item) => item.actualRecommendation === item.expectedRecommendation);
  const auditFailures = allAuditLabels
    .filter((item) => item.actualRecommendation !== item.expectedRecommendation)
    .map((item) => failure("auditConsistency", item.id, item.expectedRecommendation, item.actualRecommendation));

  return {
    riskGateRecall: metric("riskGateRecall", "Risk gate recall", riskTruePositive.length, riskPositive.length, thresholds.riskGateRecall, riskRecallFailures),
    riskGatePrecision: metric("riskGatePrecision", "Risk gate precision", riskTruePositive.length, riskPredictedPositive.length, thresholds.riskGatePrecision, riskPrecisionFailures),
    rankingPairAccuracy: ranking,
    screeningRecommendationAccuracy: metric("screeningRecommendationAccuracy", "Screening recommendation accuracy", correctScreeningLabels.length, screeningLabels.length, thresholds.screeningRecommendationAccuracy, screeningFailures),
    jdMustHaveRecognition: jd.recognition,
    jdMustHaveStatusAccuracy: jd.statusAccuracy,
    generatedClaimSupportRate: metric("generatedClaimSupportRate", "Generated claim support rate", generatedClaimSupported, generatedClaimTotal, thresholds.generatedClaimSupportRate, generatedClaimFailures),
    claimVerdictAccuracy: metric("claimVerdictAccuracy", "Labeled claim verdict accuracy", correctClaimLabels.length, claimLabels.length, thresholds.claimVerdictAccuracy, claimFailures),
    auditConsistency: metric("auditConsistency", "Audit recommendation consistency", correctAudits.length, allAuditLabels.length, thresholds.auditConsistency, auditFailures)
  };
}

function calculateRankingMetric(jobCases, threshold) {
  const pairs = [];
  const groups = unique(jobCases.map((item) => item.rankingGroup).filter(Boolean));
  for (const group of groups) {
    const ranked = jobCases
      .filter((item) => item.rankingGroup === group && item.expectedRank !== null)
      .sort((left, right) => left.expectedRank - right.expectedRank);
    for (let leftIndex = 0; leftIndex < ranked.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < ranked.length; rightIndex += 1) {
        const left = ranked[leftIndex];
        const right = ranked[rightIndex];
        pairs.push({
          id: `${group}:${left.id}>${right.id}`,
          correct: left.actual.matchScore > right.actual.matchScore,
          expected: `${left.id}>${right.id}`,
          actual: `${left.actual.matchScore}>${right.actual.matchScore}`
        });
      }
    }
  }
  const failures = pairs
    .filter((pair) => !pair.correct)
    .map((pair) => failure("rankingPairAccuracy", pair.id, pair.expected, pair.actual));
  return metric("rankingPairAccuracy", "Pairwise job ranking accuracy", pairs.filter((pair) => pair.correct).length, pairs.length, threshold, failures);
}

function calculateJdMetrics(jobCases, thresholds) {
  const labels = [];
  for (const jobCase of jobCases) {
    for (const requirement of jobCase.labels.mustHaveRequirements) {
      const best = findBestRequirement(requirement.text, jobCase.actual.fitItems);
      labels.push({
        caseId: jobCase.id,
        text: requirement.text,
        expectedStatuses: normalizeExpectedStatuses(requirement.expectedStatus),
        recognized: Boolean(best),
        actualStatus: best?.status || "MISSING_REQUIREMENT"
      });
    }
  }
  const recognized = labels.filter((item) => item.recognized);
  const statusCorrect = labels.filter((item) => item.recognized && item.expectedStatuses.includes(item.actualStatus));
  const recognitionFailures = labels
    .filter((item) => !item.recognized)
    .map((item) => failure("jdMustHaveRecognition", `${item.caseId}:${item.text}`, "recognized", "missing"));
  const statusFailures = labels
    .filter((item) => !item.recognized || !item.expectedStatuses.includes(item.actualStatus))
    .map((item) => failure("jdMustHaveStatusAccuracy", `${item.caseId}:${item.text}`, item.expectedStatuses, item.actualStatus));
  return {
    recognition: metric("jdMustHaveRecognition", "JD must-have recognition", recognized.length, labels.length, thresholds.jdMustHaveRecognition, recognitionFailures),
    statusAccuracy: metric("jdMustHaveStatusAccuracy", "JD must-have status accuracy", statusCorrect.length, labels.length, thresholds.jdMustHaveStatusAccuracy, statusFailures)
  };
}

function findBestRequirement(label, items) {
  const normalizedLabel = comparableText(label);
  return items
    .map((item) => ({ item, score: requirementSimilarity(normalizedLabel, comparableText(item.requirement)) }))
    .filter((entry) => entry.score >= 0.6)
    .sort((left, right) => right.score - left.score)[0]?.item || null;
}

function requirementSimilarity(left, right) {
  if (!left || !right) {
    return 0;
  }
  if (left === right || left.includes(right) || right.includes(left)) {
    return 1;
  }
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
}

function metric(id, label, numerator, denominator, threshold, failures) {
  const value = denominator > 0 ? numerator / denominator : 1;
  const passed = value >= threshold;
  return {
    id,
    label,
    value: Number(value.toFixed(4)),
    numerator,
    denominator,
    threshold,
    passed,
    failures
  };
}

function failure(metricId, sampleId, expected, actual) {
  return {
    metric: metricId,
    sampleId,
    expected,
    actual
  };
}

function collectProviders(jobCases, claimCases, auditCases) {
  return unique([
    ...jobCases.flatMap((item) => item.actual.providers),
    ...claimCases.map((item) => item.provider),
    ...auditCases.map((item) => item.provider)
  ]);
}

function normalizeDatasetInput(datasetInput, options) {
  if (typeof datasetInput === "string") {
    return loadAgentEvaluationDataset(datasetInput);
  }
  const dataset = datasetInput && typeof datasetInput === "object" ? datasetInput : {};
  return {
    dataset,
    absolutePath: "",
    fileName: cleanText(options.datasetFile || "in-memory.json"),
    sha256: hashValue(dataset)
  };
}

function validateDataset(dataset) {
  if (!dataset || typeof dataset !== "object" || Array.isArray(dataset)) {
    throw evaluationError("EVAL_DATASET_INVALID", "Agent evaluation dataset must be an object");
  }
  for (const field of ["id", "version"]) {
    if (!cleanText(dataset[field])) {
      throw evaluationError("EVAL_DATASET_INVALID", `Dataset ${field} is required`);
    }
  }
  for (const field of ["profiles", "jobCases", "claimCases", "auditCases"]) {
    if (!Array.isArray(dataset[field]) || dataset[field].length === 0) {
      throw evaluationError("EVAL_DATASET_INVALID", `Dataset ${field} must be a non-empty array`);
    }
    assertUniqueIds(dataset[field], field);
  }
  const thresholdNames = [
    "riskGateRecall",
    "riskGatePrecision",
    "rankingPairAccuracy",
    "screeningRecommendationAccuracy",
    "jdMustHaveRecognition",
    "jdMustHaveStatusAccuracy",
    "generatedClaimSupportRate",
    "claimVerdictAccuracy",
    "auditConsistency"
  ];
  for (const name of thresholdNames) {
    const value = Number(dataset.thresholds?.[name]);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw evaluationError("EVAL_DATASET_INVALID", `Threshold ${name} must be between 0 and 1`);
    }
  }
  const profileIds = new Set(dataset.profiles.map((profile) => profile.id));
  for (const collection of [dataset.jobCases, dataset.claimCases, dataset.auditCases]) {
    for (const fixture of collection) {
      if (!profileIds.has(fixture.profileId)) {
        throw evaluationError("EVAL_DATASET_INVALID", `Fixture ${fixture.id} references unknown profile ${fixture.profileId}`);
      }
    }
  }
}

function assertUniqueIds(items, field) {
  const ids = new Set();
  for (const item of items) {
    const id = cleanText(item?.id);
    if (!id || ids.has(id)) {
      throw evaluationError("EVAL_DATASET_INVALID", `${field} contains a missing or duplicate id: ${id || "(empty)"}`);
    }
    ids.add(id);
  }
}

function requireProfile(profiles, profileId, fixtureId) {
  const profile = profiles.get(profileId);
  if (!profile) {
    throw evaluationError("EVAL_DATASET_INVALID", `Fixture ${fixtureId} references unknown profile ${profileId}`);
  }
  return profile;
}

function normalizeExpectedStatuses(value) {
  return (Array.isArray(value) ? value : [value]).map(cleanText).filter(Boolean);
}

function materializeResumeFields(input) {
  const fields = input && typeof input === "object" && !Array.isArray(input)
    ? JSON.parse(JSON.stringify(input))
    : {};
  const repeat = fields.__repeatSummary;
  delete fields.__repeatSummary;
  if (repeat && typeof repeat === "object") {
    const textValue = String(repeat.text || "");
    const times = Math.max(0, Math.min(500, Number(repeat.times) || 0));
    fields.summary = `${String(fields.summary || "")}${textValue.repeat(times)}`;
  }
  return fields;
}

function hashValue(value) {
  return crypto.createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

function canonicalStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function comparableText(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff+#.]+/gi, " ").trim();
}

function tokenSet(value) {
  return new Set(comparableText(value).split(/\s+/).filter((token) => token.length >= 2));
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function formatRatio(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function stringifyCell(value) {
  if (Array.isArray(value)) {
    return value.join(" or ");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value ?? "");
}

function escapeMarkdown(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function evaluationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = {
  DEFAULT_REPORT_BASENAME,
  REPORT_SCHEMA_VERSION,
  loadAgentEvaluationDataset,
  renderAgentEvaluationMarkdown,
  runAgentEvaluation,
  writeAgentEvaluationReport
};
