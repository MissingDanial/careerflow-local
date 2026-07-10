#!/usr/bin/env node
"use strict";

const path = require("path");
const {
  loadAgentEvaluationDataset,
  runAgentEvaluation,
  writeAgentEvaluationReport
} = require("../server/src/agent-evaluation-runner");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    code: error.code || "AGENT_EVALUATION_FAILED",
    message: error.message || String(error)
  }, null, 2));
  process.exitCode = 1;
});

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const datasetPath = path.resolve(ROOT, options.dataset || "evaluation/fixtures/m13-agent-evaluation.v1.json");
  const outputDirectory = path.resolve(ROOT, options.outputDirectory || process.env.BOSS_FIND_AGENT_EVAL_DIR || "server/data/agent-evaluation");
  const loaded = loadAgentEvaluationDataset(datasetPath);
  const report = await runAgentEvaluation(loaded.dataset, { datasetFile: loaded.fileName });
  const paths = writeAgentEvaluationReport(report, outputDirectory, { basename: options.basename });

  console.log(JSON.stringify({
    ok: report.ok,
    evaluationId: report.evaluationId,
    datasetSha256: report.inputSnapshot.datasetSha256,
    summary: report.summary,
    metrics: Object.fromEntries(Object.entries(report.metrics).map(([name, metric]) => [name, {
      value: metric.value,
      threshold: metric.threshold,
      passed: metric.passed
    }])),
    reports: paths
  }, null, 2));

  if (!report.ok && options.failOnThreshold) {
    process.exitCode = 1;
  }
}

function parseArguments(args) {
  const options = {
    dataset: "",
    outputDirectory: "",
    basename: "",
    failOnThreshold: true
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dataset") {
      options.dataset = requireValue(args, ++index, argument);
    } else if (argument === "--output-dir") {
      options.outputDirectory = requireValue(args, ++index, argument);
    } else if (argument === "--basename") {
      options.basename = requireValue(args, ++index, argument);
    } else if (argument === "--no-fail") {
      options.failOnThreshold = false;
    } else {
      const error = new Error(`Unknown argument: ${argument}`);
      error.code = "AGENT_EVALUATION_ARGUMENT_INVALID";
      throw error;
    }
  }
  return options;
}

function requireValue(args, index, option) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    const error = new Error(`${option} requires a value`);
    error.code = "AGENT_EVALUATION_ARGUMENT_INVALID";
    throw error;
  }
  return value;
}
