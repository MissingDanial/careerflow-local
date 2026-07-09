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
  const graphJs = read("server/src/resume-workflow-graph.js");
  const packageJson = read("package.json");

  const handlerFunction = sliceFunction(backgroundJs, "async function runResumeWorkflowGraph", "async function fetchMessages");
  const optionsFunction = sliceFunction(optionsJs, "async function runResumeWorkflowForSelectedApplication", "async function evaluateSelectedResumeFit");

  const checks = {
    optionsHasOneClickButton: optionsHtml.includes('id="runSelectedResumeWorkflow"')
      && optionsHtml.includes("一键跑简历闭环"),
    optionsReadsAndBindsButton: optionsJs.includes('runSelectedResumeWorkflow: document.getElementById("runSelectedResumeWorkflow")')
      && optionsJs.includes("runResumeWorkflowForSelectedApplication"),
    optionsCallsGraphMessage: optionsJs.includes('type: "RUN_RESUME_WORKFLOW_GRAPH"')
      && optionsJs.includes("renderDocx: true")
      && optionsJs.includes("maxRevisions: 1"),
    optionsSupportsSelectedJobActions: countOccurrences(optionsJs, "一键简历闭环") >= 3
      && optionsJs.includes("runResumeWorkflowForSelectedApplication(candidate.id)")
      && optionsJs.includes("runResumeWorkflowForSelectedApplication(screening.applicationId)"),
    optionsRefreshesDiagnosticsAndTimeline: optionsFunction.includes("refreshResumeDiagnostics")
      && optionsFunction.includes("refreshWorkflowDiagnostics")
      && optionsFunction.includes("refreshScreeningDiagnostics")
      && optionsFunction.includes("showResumeVersionDetail")
      && optionsFunction.includes("viewWorkflowTimeline"),
    backgroundHandlesGraphMessage: backgroundJs.includes('case "RUN_RESUME_WORKFLOW_GRAPH"')
      && backgroundJs.includes("return runResumeWorkflowGraph(message.applicationId, message.options || {})"),
    backgroundCallsGraphEndpoint: handlerFunction.includes("/api/applications/${id}/resume-workflow-graph")
      && handlerFunction.includes('method: "POST"')
      && handlerFunction.includes("renderDocx: options.renderDocx !== false")
      && handlerFunction.includes("maxRevisions: options.maxRevisions ?? 1"),
    graphCoversRequestedClosedLoop: graphJs.includes('addNode("screen_application"')
      && graphJs.includes('addNode("prepare_resume"')
      && graphJs.includes('addNode("evaluate_fit"')
      && graphJs.includes("renderResumeDocx")
      && graphJs.includes("RESUME_WORKFLOW_GRAPH_NODE_FAILED")
      && graphJs.includes("RESUME_WORKFLOW_GRAPH_FAILED"),
    serverExposesGraphEndpoint: serverJs.includes("/resume-workflow-graph")
      && serverJs.includes("runResumeWorkflowGraph"),
    oneClickDoesNotCreateBrowserTask: !handlerFunction.includes("CREATE_BROWSER_TASK")
      && !handlerFunction.includes("/api/browser-tasks")
      && !optionsFunction.includes("CREATE_BROWSER_TASK")
      && !optionsFunction.includes("CLAIM_BROWSER_TASK"),
    packageRunsThisSmoke: packageJson.includes("m10-options-resume-workflow-smoke.js")
      && packageJson.includes("m10:options-resume-workflow:smoke")
  };

  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ ok, checks }, null, 2));
  process.exitCode = ok ? 0 : 1;
}

function countOccurrences(source, value) {
  return source.split(value).length - 1;
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
