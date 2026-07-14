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
  const resumeWorkflowServiceJs = read("server/src/services/resume-workflow-service.js");
  const graphJs = read("server/src/resume-workflow-graph.js");
  const packageJson = read("package.json");

  const handlerFunction = sliceFunction(backgroundJs, "async function runResumeWorkflowGraph", "async function fetchMessages");
  const optionsFunction = sliceFunction(optionsJs, "async function runResumeWorkflowForSelectedApplication", "async function evaluateSelectedResumeFit");
  const prepareFunction = sliceFunction(optionsJs, "async function prepareRulesResume", "async function runResumeWorkflowForSelectedApplication");
  const renderOptionsFunction = sliceFunction(optionsJs, "function getResumeRenderOptions", "async function saveResumeTemplateSelection");
  const detailFunction = sliceFunction(optionsJs, "function renderResumeDetail", "function clearResumeDetail");

  const checks = {
    optionsHasOneClickButton: optionsHtml.includes('id="runSelectedResumeWorkflow"')
      && optionsHtml.includes("一键跑简历闭环"),
    optionsHasTemplateSelector: optionsHtml.includes('id="resumeTemplateName"')
      && optionsHtml.includes("resume-to-word-campus-product-v1")
      && optionsHtml.includes("boss-find-fixed-docx-v1"),
    optionsReadsAndBindsButton: optionsJs.includes('runSelectedResumeWorkflow: document.getElementById("runSelectedResumeWorkflow")')
      && optionsJs.includes('resumeTemplateName: document.getElementById("resumeTemplateName")')
      && optionsJs.includes("runResumeWorkflowForSelectedApplication"),
    optionsLoadsTemplatesFromRegistry: optionsJs.includes('type: "GET_RESUME_TEMPLATES"')
      && optionsJs.includes("function renderResumeTemplateOptions")
      && optionsJs.includes("formatResumeTemplateOption")
      && optionsJs.includes("getSelectedResumeTemplateName")
      && optionsJs.includes("refreshResumeTemplates({ silent: true })"),
    optionsPersistsTemplateSelection: optionsJs.includes('ui.resumeTemplateName.addEventListener("change", saveResumeTemplateSelection)')
      && optionsJs.includes("function saveResumeTemplateSelection")
      && optionsJs.includes("resumeTemplateName: getSelectedResumeTemplateName()")
      && optionsJs.includes("dataset.pendingValue"),
    optionsPrepareResumeUsesTemplate: prepareFunction.includes('type: "PREPARE_RESUME"')
      && prepareFunction.includes("renderOptions")
      && prepareFunction.includes("getResumeRenderOptions()")
      && renderOptionsFunction.includes("templateName: getSelectedResumeTemplateName()"),
    optionsCallsGraphMessage: optionsJs.includes('type: "RUN_RESUME_WORKFLOW_GRAPH"')
      && optionsJs.includes("renderDocx: true")
      && optionsJs.includes("maxRevisions: 1")
      && optionsFunction.includes("renderOptions")
      && optionsFunction.includes("getResumeRenderOptions()")
      && renderOptionsFunction.includes("templateName: getSelectedResumeTemplateName()"),
    optionsDisplaysTemplateMetadata: detailFunction.includes("version.renderMetadata")
      && detailFunction.includes("appendTemplateMetadata")
      && detailFunction.includes("appendRenderQuality")
      && optionsJs.includes("function appendTemplateMetadata")
      && optionsJs.includes("function appendRenderQuality")
      && optionsJs.includes("metadata.templateOrder")
      && optionsJs.includes("DOCX QA"),
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
    backgroundFetchesTemplateRegistry: backgroundJs.includes('case "GET_RESUME_TEMPLATES"')
      && backgroundJs.includes("function fetchResumeTemplates")
      && backgroundJs.includes("/api/resume-templates"),
    backgroundPersistsTemplateSetting: backgroundJs.includes('resumeTemplateName: "resume-to-word-campus-product-v1"')
      && backgroundJs.includes("settings.resumeTemplateName ?? current.resumeTemplateName")
      && backgroundJs.includes("function normalizeResumeTemplateName"),
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
      && serverJs.includes("resumeWorkflowService.runGraph")
      && resumeWorkflowServiceJs.includes("runResumeWorkflowGraph")
      && resumeWorkflowServiceJs.includes("payload.renderOptions"),
    serverExposesTemplateRegistry: serverJs.includes("/api/resume-templates")
      && serverJs.includes("listResumeTemplates")
      && serverJs.includes("DEFAULT_RESUME_TEMPLATE"),
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
