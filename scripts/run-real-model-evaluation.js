#!/usr/bin/env node

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { loadModelConfig } = require("../server/src/model-client");
const {
  runRealModelEvaluation,
  writeRealModelEvaluationReport
} = require("../server/src/real-model-evaluation-runner");
const { createJobStore } = require("../server/src/sqlite-store");

const ROOT = path.resolve(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const datasetPath = path.resolve(ROOT, options.dataset || "evaluation/fixtures/m13-agent-evaluation.v1.json");
  const outputDirectory = path.resolve(
    ROOT,
    options.outputDirectory || process.env.BOSS_FIND_AGENT_EVAL_DIR || "server/data/agent-evaluation"
  );
  const dataDir = path.resolve(ROOT, options.dataDir || process.env.BOSS_DATA_DIR || "server/data");
  const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
  const modelConfig = loadModelConfig();
  const store = createJobStore({ dataDir });
  let evaluationRun = null;
  try {
    evaluationRun = store.startAgentEvaluationRun({
      evaluationType: "real_model_quality",
      mode: options.mode,
      datasetId: dataset.id,
      datasetHash: sha256(dataset),
      modelConfig
    });
    const report = await runRealModelEvaluation(dataset, {
      mode: options.mode,
      samplesPerCase: options.samples,
      caseIds: options.caseIds,
      requestDelayMs: options.delayMs,
      modelConfig
    });
    const files = writeRealModelEvaluationReport(report, outputDirectory);
    const failedMetrics = Object.entries(report.metrics)
      .filter(([, metric]) => !metric.passed)
      .map(([name]) => name);
    store.finishAgentEvaluationRun(evaluationRun.id, {
      status: report.passed ? "SUCCEEDED" : "FAILED",
      sampleCount: report.dataset.jobCaseCount * report.samplesPerCase,
      metrics: report.metrics,
      telemetry: report.telemetry,
      reportJsonPath: files.jsonPath,
      reportMarkdownPath: files.markdownPath,
      errorCode: report.passed ? "" : "AGENT_QUALITY_GATES_FAILED",
      errorMessage: report.passed ? "" : `Failed quality metrics: ${failedMetrics.join(", ")}`
    });
    console.log(JSON.stringify({
      ok: report.passed,
      evaluationId: report.evaluationId,
      evaluationRunId: evaluationRun.id,
      mode: report.mode,
      model: report.modelConfig.model,
      samplesPerCase: report.samplesPerCase,
      jobCaseCount: report.dataset.jobCaseCount,
      metrics: report.metrics,
      telemetry: report.telemetry,
      files
    }, null, 2));
    if (options.enforce && !report.passed) {
      process.exitCode = 1;
    }
  } catch (error) {
    if (evaluationRun?.id) {
      store.finishAgentEvaluationRun(evaluationRun.id, {
        status: "FAILED",
        errorCode: error.code || "REAL_MODEL_EVALUATION_FAILED",
        errorMessage: error.message || String(error)
      });
    }
    throw error;
  } finally {
    store.close();
  }
}

function parseArguments(args) {
  const options = {
    dataset: "",
    outputDirectory: "",
    dataDir: "",
    mode: "hybrid",
    samples: 3,
    delayMs: 1000,
    caseIds: [],
    enforce: true
  };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--dataset") {
      options.dataset = args[++index] || "";
    } else if (value === "--output-directory") {
      options.outputDirectory = args[++index] || "";
    } else if (value === "--data-dir") {
      options.dataDir = args[++index] || "";
    } else if (value === "--mode") {
      options.mode = args[++index] || "hybrid";
    } else if (value === "--samples") {
      options.samples = Math.max(1, Math.min(10, Number(args[++index]) || 3));
    } else if (value === "--delay-ms") {
      options.delayMs = Math.max(0, Math.min(30000, Number(args[++index]) || 0));
    } else if (value === "--cases") {
      options.caseIds = String(args[++index] || "").split(",").map((item) => item.trim()).filter(Boolean);
    } else if (value === "--no-enforce") {
      options.enforce = false;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return options;
}

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
