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
    "evaluateResumeFit",
    "resumeFitEvaluationCount",
    "resumeFitEvaluations",
    "resumeFitDetail"
  ];
  const messageTypes = [
    "GET_RESUME_FIT_EVALUATIONS",
    "EVALUATE_RESUME_FIT"
  ];

  const evaluateFunction = sliceFunction(backgroundJs, "async function evaluateResumeFit", "async function auditResume");
  const fetchFunction = sliceFunction(backgroundJs, "async function fetchResumeFitEvaluations", "async function fetchResumeAudits");

  const checks = {
    optionsHasFitDom: optionIds.every((id) => optionsHtml.includes(`id="${id}"`)),
    optionsReadsFitDom: optionIds.every((id) => optionsJs.includes(`getElementById("${id}")`)),
    optionsRequestsFitMessages: messageTypes.every((type) => optionsJs.includes(`type: "${type}"`)),
    optionsLoadsRendersAndRunsFit: optionsJs.includes("loadResumeDiagnostics")
      && optionsJs.includes("renderResumeFitDetail")
      && optionsJs.includes("evaluateSelectedResumeFit")
      && optionsJs.includes("formatFitLevel")
      && optionsJs.includes("resumeFitEvaluations"),
    backgroundHandlesFitMessages: messageTypes.every((type) => backgroundJs.includes(`case "${type}"`)),
    backgroundCallsFitEndpoints: backgroundJs.includes("/api/resume-fit-evaluations")
      && backgroundJs.includes("/api/resume-versions/${id}/evaluate-fit"),
    serverStillExposesFitEndpoints: serverJs.includes("/api/resume-fit-evaluations")
      && serverJs.includes("/evaluate-fit")
      && serverJs.includes("runResumeFitEvaluator"),
    evaluateDoesNotCreateBrowserTask: !evaluateFunction.includes("CREATE_BROWSER_TASK")
      && !evaluateFunction.includes("/api/browser-tasks")
      && !evaluateFunction.includes("CLAIM_BROWSER_TASK"),
    fetchDoesNotMutateBackend: fetchFunction.includes('method: "GET"')
      && !fetchFunction.includes('method: "POST"'),
    packageRunsThisSmoke: packageJson.includes("m10-options-resume-fit-smoke.js")
      && packageJson.includes("m10:options-resume-fit:smoke")
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
