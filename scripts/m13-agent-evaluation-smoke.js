#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  REPORT_SCHEMA_VERSION,
  loadAgentEvaluationDataset,
  runAgentEvaluation,
  writeAgentEvaluationReport
} = require("../server/src/agent-evaluation-runner");

const ROOT = path.join(__dirname, "..");
const DATASET_PATH = path.join(ROOT, "evaluation", "fixtures", "m13-agent-evaluation.v1.json");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m13-agent-eval-"));
  try {
    const loaded = loadAgentEvaluationDataset(DATASET_PATH);
    const report = await runAgentEvaluation(loaded.dataset, { datasetFile: loaded.fileName });
    const repeated = await runAgentEvaluation(loaded.dataset, { datasetFile: loaded.fileName });
    const reportPaths = writeAgentEvaluationReport(report, outputDirectory);
    const jsonReport = JSON.parse(fs.readFileSync(reportPaths.jsonPath, "utf8"));
    const markdownReport = fs.readFileSync(reportPaths.markdownPath, "utf8");
    const serializedReport = JSON.stringify(jsonReport);
    const negatedRiskCase = report.cases.jobs.find((item) => item.id === "job-product-negated-risk");
    const rankingMetric = report.metrics.rankingPairAccuracy;

    const driftedDataset = JSON.parse(JSON.stringify(loaded.dataset));
    driftedDataset.jobCases.find((item) => item.id === "job-sales-blocked").labels.riskBlocked = false;
    const driftedReport = await runAgentEvaluation(driftedDataset, { datasetFile: "drifted-in-memory.json" });
    const driftFailure = driftedReport.failures.find((item) => item.sampleId === "job-sales-blocked");

    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const testTiersSource = fs.readFileSync(path.join(ROOT, "scripts", "test-tiers.js"), "utf8");
    const checks = {
      baselineMeetsAllThresholds: report.ok
        && report.summary.failedMetricCount === 0
        && Object.values(report.metrics).every((metric) => metric.passed),
      reportUsesVersionedContract: Boolean(report.schemaVersion === REPORT_SCHEMA_VERSION
        && report.inputSnapshot.datasetVersion === loaded.dataset.version
        && report.inputSnapshot.datasetSha256 === loaded.sha256
        && report.versions.graphVersion
        && report.versions.promptVersion
        && report.versions.agentVersion),
      repeatedRunKeepsComparableIdentity: repeated.evaluationId === report.evaluationId
        && repeated.inputSnapshot.datasetSha256 === report.inputSnapshot.datasetSha256
        && JSON.stringify(repeated.metrics) === JSON.stringify(report.metrics),
      riskGateHandlesNegatedDirections: negatedRiskCase
        && negatedRiskCase.labels.riskBlocked === false
        && negatedRiskCase.actual.riskBlocked === false
        && negatedRiskCase.actual.screeningRecommendation === "auto_prepare",
      rankingUsesTwoIndependentGroups: rankingMetric.denominator === 6
        && rankingMetric.value === 1,
      jdAndClaimMetricsAreMeasured: report.metrics.jdMustHaveRecognition.denominator >= 10
        && report.metrics.generatedClaimSupportRate.denominator >= 20
        && report.metrics.claimVerdictAccuracy.denominator >= 6,
      auditCoversGeneratedAndProbeResults: report.metrics.auditConsistency.denominator >= 8
        && report.cases.audits.some((item) => item.actualRecommendation === "approve")
        && report.cases.audits.some((item) => item.actualRecommendation === "revise")
        && report.cases.audits.some((item) => item.actualRecommendation === "block"),
      jsonAndMarkdownReportsWritten: fs.existsSync(reportPaths.jsonPath)
        && fs.existsSync(reportPaths.markdownPath)
        && jsonReport.evaluationId === report.evaluationId
        && markdownReport.includes(report.evaluationId)
        && markdownReport.includes("No threshold or labeled-sample failures."),
      reportDoesNotLeakLocalSecrets: !serializedReport.includes("OPENAI_API_KEY")
        && !serializedReport.includes("gpt5.5.txt")
        && !serializedReport.includes("apiKey")
        && !serializedReport.includes("Administrator.BF-")
        && jsonReport.execution.model.externalCallMade === false,
      intentionalDriftFailsWithSampleId: driftedReport.ok === false
        && driftedReport.metrics.riskGatePrecision.passed === false
        && driftFailure?.metric === "riskGatePrecision",
      packageAndAgentTierAreWired: packageJson.scripts?.["agent:evaluate"]?.includes("run-agent-evaluation.js")
        && packageJson.scripts?.["m13:agent-evaluation:smoke"]?.includes("m13-agent-evaluation-smoke.js")
        && testTiersSource.includes('"m13:agent-evaluation:smoke"')
    };

    console.log(JSON.stringify({
      ok: Object.values(checks).every(Boolean),
      checks,
      summary: {
        evaluationId: report.evaluationId,
        datasetSha256: report.inputSnapshot.datasetSha256,
        metricCount: report.summary.metricCount,
        jobCaseCount: report.inputSnapshot.jobCaseCount,
        claimCaseCount: report.inputSnapshot.claimCaseCount,
        auditCaseCount: report.inputSnapshot.auditCaseCount,
        generatedClaimSupportRate: report.metrics.generatedClaimSupportRate.value,
        driftFailure: driftFailure?.sampleId || ""
      }
    }, null, 2));
    process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
  } finally {
    if (process.exitCode === 0) {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    } else {
      console.error(`Smoke output retained for debugging: ${outputDirectory}`);
    }
  }
}
