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
  const serverJs = read("server/src/server.js");
  const storeJs = read("server/src/sqlite-store.js");
  const packageJson = read("package.json");

  const optionIds = [
    "resumeStatus",
    "resumeCandidateCount",
    "resumeVersionCount",
    "resumeAuditCount",
    "resumeCandidates",
    "resumeVersions",
    "resumeAudits",
    "refreshResume",
    "prepareRulesResume",
    "auditRulesResume"
  ];

  const messageTypes = [
    "GET_RESUME_CANDIDATES",
    "GET_RESUME_VERSIONS",
    "GET_RESUME_AUDITS",
    "PREPARE_RESUME",
    "AUDIT_RESUME"
  ];

  const checks = {
    optionsHasResumeCard: optionsHtml.includes("简历定制与审核")
      && optionIds.every((id) => optionsHtml.includes(`id="${id}"`)),
    optionsReadsResumeIds: optionIds.every((id) => optionsJs.includes(`getElementById("${id}")`)),
    optionsRequestsResumeMessages: messageTypes.every((type) => optionsJs.includes(`type: "${type}"`)),
    optionsDefaultsResumeActionsToRules: optionsJs.includes('mode: "rules"')
      && optionsJs.includes("renderDocx: true")
      && optionsJs.includes("prepareRulesResume")
      && optionsJs.includes("auditRulesResume"),
    optionsRendersCandidatesVersionsAudits: optionsJs.includes("renderResumeDiagnostics")
      && optionsJs.includes("candidatePayload.candidates")
      && optionsJs.includes("versionPayload.resumeVersions")
      && optionsJs.includes("auditPayload.resumeAudits"),
    backgroundHandlesResumeMessages: messageTypes.every((type) => backgroundJs.includes(`case "${type}"`)),
    backgroundCallsResumeEndpoints: backgroundJs.includes("/api/resume-candidates")
      && backgroundJs.includes("/api/resume-versions")
      && backgroundJs.includes("/prepare-resume")
      && backgroundJs.includes("/audit"),
    backgroundForcesRulesAndDocx: backgroundJs.includes('mode: "rules"')
      && backgroundJs.includes("renderDocx: true"),
    serverHasResumeCandidatesEndpoint: serverJs.includes('/api/resume-candidates')
      && serverJs.includes("store.getResumeCandidates"),
    storeSelectsLatestScreeningAndExcludesExistingResume: storeJs.includes("getResumeCandidates")
      && storeJs.includes("latest_screening_ids")
      && storeJs.includes("excludeExistingResume")
      && storeJs.includes("resume_versions"),
    cssHasDiagnosticGrid: optionsCss.includes(".diagnostic-grid"),
    packageRunsThisSmoke: packageJson.includes("m7-options-resume-smoke.js")
      && packageJson.includes("m7:options-resume:smoke")
  };

  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ ok, checks }, null, 2));
  process.exitCode = ok ? 0 : 1;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
