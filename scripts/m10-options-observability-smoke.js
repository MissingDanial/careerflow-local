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
  const packageJson = read("package.json");

  const optionIds = [
    "refreshWorkflow",
    "workflowStatus",
    "workflowOpenErrorCount",
    "workflowEventCount",
    "workflowTimelineApplicationId",
    "workflowErrors",
    "workflowEvents",
    "workflowTimelineStatus",
    "workflowTimeline"
  ];

  const messageTypes = [
    "GET_WORKFLOW_EVENTS",
    "GET_WORKFLOW_ERRORS",
    "GET_APPLICATION_TIMELINE",
    "RESOLVE_WORKFLOW_ERROR"
  ];

  const checks = {
    optionsHasWorkflowCard: optionsHtml.includes("Workflow progress")
      && optionIds.every((id) => optionsHtml.includes(`id="${id}"`)),
    optionsReadsWorkflowIds: optionIds.every((id) => optionsJs.includes(`getElementById("${id}")`)),
    optionsRequestsWorkflowMessages: messageTypes.every((type) => optionsJs.includes(`type: "${type}"`)),
    optionsLoadsAndRendersWorkflowDiagnostics: optionsJs.includes("loadWorkflowDiagnostics")
      && optionsJs.includes("renderWorkflowDiagnostics")
      && optionsJs.includes("refreshWorkflowDiagnostics")
      && optionsJs.includes("workflowResult"),
    optionsSupportsTimelineAndErrorResolution: optionsJs.includes("viewWorkflowTimeline")
      && optionsJs.includes("renderWorkflowTimeline")
      && optionsJs.includes("resolveWorkflowErrorFromOptions")
      && optionsJs.includes("options_workflow_errors")
      && optionsJs.includes('"RESOLVED"')
      && optionsJs.includes('"IGNORED"'),
    backgroundHandlesWorkflowMessages: messageTypes.every((type) => backgroundJs.includes(`case "${type}"`)),
    backgroundCallsWorkflowEndpoints: backgroundJs.includes("/api/workflow-events")
      && backgroundJs.includes("/api/workflow-errors")
      && backgroundJs.includes("/api/applications/${id}/timeline")
      && backgroundJs.includes("/api/workflow-errors/${id}/resolve"),
    serverStillExposesWorkflowEndpoints: serverJs.includes("/api/workflow-events")
      && serverJs.includes("/api/workflow-errors")
      && serverJs.includes("/timeline"),
    resolveDoesNotCreateOrRetryTasks: !backgroundJs.slice(
      backgroundJs.indexOf("async function resolveWorkflowError"),
      backgroundJs.indexOf("async function screenApplicationBatch")
    ).includes("CREATE_BROWSER_TASK"),
    cssHasWorkflowLayout: optionsCss.includes(".workflow-grid")
      && optionsCss.includes(".timeline-list"),
    packageRunsThisSmoke: packageJson.includes("m10-options-observability-smoke.js")
      && packageJson.includes("m10:options-observability:smoke")
  };

  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ ok, checks }, null, 2));
  process.exitCode = ok ? 0 : 1;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
