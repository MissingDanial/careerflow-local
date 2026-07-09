#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

main();

function main() {
  const optionsHtml = read("extension/src/options.html");
  const optionsJs = read("extension/src/options.js");
  const backgroundJs = read("extension/src/background.js");
  const serverJs = read("server/src/server.js");
  const packageJson = read("package.json");

  const optionIds = [
    "reviseResumeFromChecks",
    "resumeFitDetail",
    "resumeClaimDetail"
  ];
  const reviseFunction = sliceFunction(backgroundJs, "async function reviseResumeFromChecks", "async function auditResume");
  const optionsFunction = sliceFunction(optionsJs, "async function reviseSelectedResumeFromChecks", "async function auditRulesResume");

  const checks = {
    optionsHasRevisionDom: optionIds.every((id) => optionsHtml.includes(`id="${id}"`)),
    optionsReadsRevisionDom: optionIds.every((id) => optionsJs.includes(`getElementById("${id}")`)),
    optionsRegistersRevisionButton: optionsJs.includes("ui.reviseResumeFromChecks.addEventListener")
      && optionsJs.includes("reviseSelectedResumeFromChecks"),
    optionsCallsRevisionMessage: optionsJs.includes('type: "REVISE_RESUME_FROM_CHECKS"')
      && optionsFunction.includes("refreshWorkflowDiagnostics")
      && optionsFunction.includes("showResumeVersionDetail(revision.id)"),
    backgroundHandlesRevisionMessage: backgroundJs.includes('case "REVISE_RESUME_FROM_CHECKS"')
      && backgroundJs.includes("reviseResumeFromChecks"),
    backgroundCallsRevisionEndpoint: reviseFunction.includes("/revise-from-checks")
      && reviseFunction.includes('method: "POST"'),
    revisionDoesNotCreateBrowserTask: !reviseFunction.includes("CREATE_BROWSER_TASK")
      && !reviseFunction.includes("/api/browser-tasks")
      && !reviseFunction.includes("CLAIM_BROWSER_TASK"),
    serverStillExposesRevisionEndpoint: serverJs.includes("/revise-from-checks")
      && serverJs.includes("ResumeRevisionAgent")
      && serverJs.includes("RESUME_REVISION_PREPARED"),
    packageRunsThisSmoke: packageJson.includes("m10-options-resume-revision-smoke.js")
      && packageJson.includes("m10:options-resume-revision:smoke")
  };

  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ ok, checks }, null, 2));
  process.exitCode = ok ? 0 : 1;
}

function sliceFunction(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) {
    return "";
  }
  const end = source.indexOf(endMarker, start + startMarker.length);
  return source.slice(start, end < 0 ? undefined : end);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
