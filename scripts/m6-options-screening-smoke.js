#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

main();

function main() {
  const optionsHtml = read("extension/src/options.html");
  const optionsJs = read("extension/src/options.js");
  const optionsCss = read("extension/src/options.css");
  const backgroundJs = read("extension/src/background.js");
  const packageJson = read("package.json");

  const optionIds = [
    "screeningStatus",
    "screeningCandidateCount",
    "screeningResultCount",
    "agentRunCount",
    "screeningCandidates",
    "screeningResults",
    "agentRuns",
    "refreshScreening",
    "runRulesBatchScreening",
    "riskGateEnabled",
    "excludedDirections",
    "runRiskGateRescreen"
  ];

  const messageTypes = [
    "GET_SCREENING_CANDIDATES",
    "GET_SCREENINGS",
    "GET_AGENT_RUNS",
    "SCREEN_APPLICATION_BATCH"
  ];

  const checks = {
    optionsHasScreeningCard: optionsHtml.includes("岗位筛选")
      && optionIds.every((id) => optionsHtml.includes(`id="${id}"`)),
    optionsReadsScreeningIds: optionIds.every((id) => optionsJs.includes(`getElementById("${id}")`)),
    optionsRequestsScreeningEndpoints: messageTypes.every((type) => optionsJs.includes(`type: "${type}"`)),
    optionsDefaultsBatchToRules: optionsJs.includes('mode: "rules"')
      && optionsJs.includes("continueOnError: true")
      && optionsJs.includes("runRulesBatchScreening"),
    optionsHasRiskGateRescreen: optionsHtml.includes("按新风险规则重筛")
      && optionsJs.includes("runRiskGateRescreen")
      && optionsJs.includes("riskGateEnabled")
      && optionsJs.includes("excludedDirections"),
    optionsSendsRiskGateRules: optionsJs.includes("riskGateOnly: true")
      && optionsJs.includes("includeAlreadyScreened: true")
      && optionsJs.includes('statuses: ["DETAIL_CAPTURED", "SCORED", "SHORTLISTED", "NEEDS_USER_REVIEW"]')
      && optionsJs.includes("userRules")
      && optionsJs.includes("excludedDirections"),
    optionsRendersCandidatesResultsAndRuns: optionsJs.includes("renderScreeningDiagnostics")
      && optionsJs.includes("candidatePayload.candidates")
      && optionsJs.includes("screeningPayload.screenings")
      && optionsJs.includes("runPayload.runs"),
    backgroundHandlesScreeningMessages: messageTypes.every((type) => backgroundJs.includes(`case "${type}"`)),
    backgroundCallsScreeningEndpoints: backgroundJs.includes("/api/screening-candidates")
      && backgroundJs.includes("/api/screenings")
      && backgroundJs.includes("/api/agent-runs")
      && backgroundJs.includes("/api/applications/screen-batch"),
    backgroundDefaultsBatchToRules: backgroundJs.includes('mode: options.mode || "rules"')
      && backgroundJs.includes("continueOnError: options.continueOnError !== false"),
    backgroundPersistsRiskGateSettings: backgroundJs.includes("riskGateEnabled")
      && backgroundJs.includes("excludedDirections")
      && backgroundJs.includes("normalizeDelimitedStringArray"),
    cssHasScreeningGrid: optionsCss.includes(".screening-grid")
      && optionsCss.includes(".list-heading")
      && optionsCss.includes("button:disabled"),
    packageRunsThisSmoke: packageJson.includes("m6-options-screening-smoke.js")
      && packageJson.includes("m6:options-screening:smoke")
  };

  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ ok, checks }, null, 2));
  process.exitCode = ok ? 0 : 1;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
