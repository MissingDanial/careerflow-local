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
    "verifyResumeClaims",
    "resumeClaimVerificationCount",
    "resumeClaimVerifications",
    "resumeClaimDetail"
  ];
  const messageTypes = [
    "GET_RESUME_CLAIM_VERIFICATIONS",
    "VERIFY_RESUME_CLAIMS"
  ];

  const verifyFunction = sliceFunction(backgroundJs, "async function verifyResumeClaims", "async function auditResume");
  const fetchFunction = sliceFunction(backgroundJs, "async function fetchResumeClaimVerifications", "async function fetchResumeAudits");

  const checks = {
    optionsHasClaimDom: optionIds.every((id) => optionsHtml.includes(`id="${id}"`)),
    optionsReadsClaimDom: optionIds.every((id) => optionsJs.includes(`getElementById("${id}")`)),
    optionsRequestsClaimMessages: messageTypes.every((type) => optionsJs.includes(`type: "${type}"`)),
    optionsLoadsRendersAndRunsClaims: optionsJs.includes("loadResumeDiagnostics")
      && optionsJs.includes("renderResumeClaimDetail")
      && optionsJs.includes("verifySelectedResumeClaims")
      && optionsJs.includes("formatClaimPolicy")
      && optionsJs.includes("resumeClaimVerifications"),
    backgroundHandlesClaimMessages: messageTypes.every((type) => backgroundJs.includes(`case "${type}"`)),
    backgroundCallsClaimEndpoints: backgroundJs.includes("/api/resume-claim-verifications")
      && backgroundJs.includes("/api/resume-versions/${id}/verify-claims"),
    serverStillExposesClaimEndpoints: serverJs.includes("/api/resume-claim-verifications")
      && serverJs.includes("/verify-claims")
      && serverJs.includes("runClaimVerifier"),
    verifyDoesNotCreateBrowserTask: !verifyFunction.includes("CREATE_BROWSER_TASK")
      && !verifyFunction.includes("/api/browser-tasks")
      && !verifyFunction.includes("CLAIM_BROWSER_TASK"),
    fetchDoesNotMutateBackend: fetchFunction.includes('method: "GET"')
      && !fetchFunction.includes('method: "POST"'),
    packageRunsThisSmoke: packageJson.includes("m10-options-claim-verifier-smoke.js")
      && packageJson.includes("m10:options-claim-verifier:smoke")
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
