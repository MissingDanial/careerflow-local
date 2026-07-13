#!/usr/bin/env node

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  REPORT_SCHEMA_VERSION,
  runRealModelEvaluation,
  writeRealModelEvaluationReport
} = require("../server/src/real-model-evaluation-runner");
const { createJobStore } = require("../server/src/sqlite-store");

const ROOT = path.resolve(__dirname, "..");
const DATASET_PATH = path.join(ROOT, "evaluation", "fixtures", "m13-agent-evaluation.v1.json");
const CASE_IDS = [
  "job-product-ai-strong",
  "job-product-general-medium",
  "job-content-weak",
  "job-sales-blocked"
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m16-evaluation-"));
  const reportDir = path.join(dataDir, "reports");
  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, "utf8"));
  const store = createJobStore({ dataDir });
  try {
    const modelConfig = {
      configured: true,
      apiKey: "fixture-key",
      baseUrl: "http://127.0.0.1:1",
      model: "m16-evaluation-fixture",
      wireApi: "responses",
      maxRetries: 1,
      source: "fixture"
    };
    const evaluationRun = store.startAgentEvaluationRun({
      evaluationType: "real_model_quality",
      mode: "hybrid",
      datasetId: dataset.id,
      datasetHash: "fixture-dataset-hash",
      modelConfig
    });
    const report = await runRealModelEvaluation(dataset, {
      mode: "hybrid",
      samplesPerCase: 2,
      caseIds: CASE_IDS,
      requestDelayMs: 0,
      modelConfig,
      requestStructuredCompletion: fixtureCompletion
    });
    const files = writeRealModelEvaluationReport(report, reportDir);
    const persisted = store.finishAgentEvaluationRun(evaluationRun.id, {
      status: "SUCCEEDED",
      sampleCount: CASE_IDS.length * 2,
      metrics: report.metrics,
      telemetry: report.telemetry,
      reportJsonPath: files.jsonPath,
      reportMarkdownPath: files.markdownPath
    });
    const quality = store.getAgentModelQualitySummary({ limit: 20 });
    const serialized = JSON.stringify(report);
    const checks = {
      reportUsesM16Contract: report.schemaVersion === REPORT_SCHEMA_VERSION,
      repeatedSamplingCoversSelectedCases: report.samplesPerCase === 2
        && report.dataset.jobCaseCount === CASE_IDS.length
        && report.requestDelayMs === 0,
      allQualityGatesPass: report.passed === true
        && Object.values(report.metrics).every((metric) => metric.passed),
      rankingAndRiskMetricsPass: report.metrics.rankingPairAccuracy.value === 1
        && report.metrics.riskGateRecall.value === 1
        && report.metrics.riskGatePrecision.value === 1,
      evidenceAndAuditMetricsPass: report.metrics.generatedClaimSupportRate.value === 1
        && report.metrics.unsupportedClaimCount.value === 0
        && report.metrics.auditConsistency.value === 1,
      varianceAndSchemaMetricsPass: report.metrics.maxScreeningScoreStdDev.value === 0
        && report.metrics.structuredOutputSuccessRate.value === 1,
      runtimeTelemetryAggregates: report.telemetry.invocationCount > 0
        && report.telemetry.usage.totalTokens > 0
        && report.telemetry.latencyMs.p95 >= report.telemetry.latencyMs.p50,
      reportsWritten: fs.existsSync(files.jsonPath)
        && fs.existsSync(files.markdownPath)
        && fs.readFileSync(files.markdownPath, "utf8").includes("M16 Real-model Agent Evaluation"),
      evaluationRunPersists: persisted.status === "SUCCEEDED"
        && persisted.sampleCount === CASE_IDS.length * 2
        && store.getAgentEvaluationRuns({ limit: 10 }).totalRuns === 1,
      qualityEndpointSourceIncludesEvaluation: quality.evaluations.length === 1
        && quality.evaluations[0].id === evaluationRun.id,
      reportExcludesSecretsAndLocalPaths: !serialized.includes("fixture-key")
        && !serialized.includes(dataDir)
        && !serialized.includes("OPENAI_API_KEY")
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      summary: {
        evaluationId: report.evaluationId,
        evaluationRunId: evaluationRun.id,
        jobCaseCount: report.dataset.jobCaseCount,
        samplesPerCase: report.samplesPerCase,
        invocationCount: report.telemetry.invocationCount,
        totalTokens: report.telemetry.usage.totalTokens,
        metricCount: Object.keys(report.metrics).length
      }
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    store.close();
    if (process.exitCode === 0) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } else {
      console.error(`M16 evaluation smoke data retained for debugging: ${dataDir}`);
    }
  }
}

async function fixtureCompletion({ system, user }) {
  const input = JSON.parse(user || "{}");
  let data;
  if (system.includes("ScreeningAgent")) {
    const title = String(input.job?.title || "");
    const scores = title === "AI产品经理" ? 92 : title === "产品经理" ? 74 : 35;
    const recommendation = title === "内容运营" ? "skip" : "auto_prepare";
    data = {
      matchScore: scores,
      riskScore: recommendation === "skip" ? 45 : 10,
      recommendation,
      hardConditions: [{ name: "jd_complete", passed: true, reason: "JD is complete." }],
      matchedPoints: recommendation === "skip" ? [] : ["Confirmed product evidence."],
      riskPoints: recommendation === "skip" ? ["Weak target fit."] : [],
      resumeStrategy: recommendation === "skip" ? [] : ["Prioritize confirmed product evidence."],
      requiresUserConfirmation: false,
      confidence: "high"
    };
  } else if (system.includes("ResumeFitEvaluator")) {
    const evidence = input.resumeEvidence?.[0] || { field: "", text: "" };
    data = {
      items: (input.jdRequirements || []).map((requirement) => ({
        requirementIndex: requirement.index,
        status: "covered",
        evidenceField: evidence.field,
        evidenceText: evidence.text,
        reason: "Exact fixture evidence."
      })),
      recommendations: [],
      confidence: "high"
    };
  } else if (system.includes("AuditAgent")) {
    data = {
      jobFitReview: "good",
      recommendation: "approve",
      requiresUserConfirmation: false,
      confidence: "high",
      qualityIssues: [],
      recommendations: []
    };
  } else if (system.includes("ResumeAgent")) {
    const experiences = input.confirmedProfile?.experiences || [];
    const experience = experiences.find((item) => !["education", "award", "certification"].includes(item.kind));
    const skills = input.confirmedProfile?.skills || [];
    const sourceFact = experience?.facts?.[0] || experience?.evidenceText || "";
    data = {
      headline: input.job?.title || "Target Role",
      summary: "",
      selectedSkillIds: skills.slice(0, 2).map((skill) => skill.id),
      projects: [{
        sourceExperienceId: experience.id,
        skills: (experience.skills || []).slice(0, 4),
        bullets: [{ text: sourceFact, sourceFact }]
      }],
      diffSummary: ["按目标岗位重排已确认经历。"],
      compressionNotes: ["控制为两页。"]
    };
  } else {
    throw new Error("Unknown fixture Agent prompt");
  }
  return {
    data,
    telemetry: {
      schemaVersion: "m16.model-telemetry.fixture.v1",
      provider: "fixture",
      model: "m16-evaluation-fixture",
      wireApi: "responses",
      durationMs: 12,
      attemptCount: 1,
      attempts: [{ attempt: 1, status: "SUCCEEDED", durationMs: 12 }],
      usage: { inputTokens: 80, outputTokens: 40, reasoningTokens: 5, totalTokens: 120 },
      estimatedCostUsd: null
    }
  };
}
