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
  const profileServiceJs = read("server/src/services/profile-service.js");
  const packageJson = read("package.json");
  const workflowDoc = read("docs/03_AGENT_WORKFLOW.md");
  const planDoc = read("docs/04_DEVELOPMENT_PLAN.md");

  const getFunction = sliceFunction(backgroundJs, "async function fetchCareerContext", "async function generateCareerContext");
  const generateFunction = sliceFunction(backgroundJs, "async function generateCareerContext", "async function fetchWorkflowEvents");
  const optionsGenerateFunction = sliceFunction(optionsJs, "async function generateCareerContext", "async function refreshResumeDiagnostics");

  const ids = [
    "refreshCareerContext",
    "generateCareerContext",
    "generateCareerContextWithAnswers",
    "profileAgentPortal",
    "profileAgentUserUpdate",
    "stageProfileAgentUpdate",
    "clearProfileAgentUpdate",
    "profileAgentUpdateStatus",
    "careerContextStatus",
    "careerContextAnswerStatus",
    "careerContextExists",
    "careerContextBytes",
    "careerContextQuestionCount",
    "careerContextMeta",
    "careerContextQuestions",
    "careerContextAnswerForm",
    "careerContextPreview"
  ];

  const checks = {
    optionsHasProfileAgentPanel: (optionsHtml.includes("ProfileAgent 职业经历上下文")
      || optionsHtml.includes("ProfileAgent 画像入口"))
      && optionsHtml.includes("career_agent_context.md")
      && ids.every((id) => optionsHtml.includes(`id="${id}"`)),
    optionsReadsAndBindsPanel: ids.every((id) => optionsJs.includes(`getElementById("${id}")`))
      && optionsJs.includes("ui.refreshCareerContext.addEventListener")
      && optionsJs.includes("ui.generateCareerContext.addEventListener")
      && optionsJs.includes("ui.generateCareerContextWithAnswers.addEventListener"),
    optionsLoadsCareerContextInGlobalRefresh: optionsJs.includes("careerContextResult")
      && optionsJs.includes("loadCareerContextDiagnostics()")
      && optionsJs.includes("renderCareerContextDiagnostics(careerContextResult.value)"),
    optionsCallsCareerContextMessages: optionsJs.includes('type: "GET_CAREER_CONTEXT"')
      && optionsJs.includes('type: "GENERATE_CAREER_CONTEXT"')
      && optionsJs.includes("writeFile: true"),
    optionsShowsQuestionsAndPreview: optionsJs.includes("normalizeCareerContextQuestions")
      && optionsJs.includes("careerContextQuestionCount")
      && optionsJs.includes("careerContextPreview")
      && optionsJs.includes("truncateText(context.markdown"),
    optionsSupportsQuestionAnswers: optionsHtml.includes("ProfileAgent 追问回答")
      && optionsHtml.includes("根据回答重新整理")
      && optionsJs.includes("readCareerContextAnswers")
      && optionsJs.includes("renderCareerContextAnswerForm")
      && optionsJs.includes("includeAnswers")
      && optionsJs.includes("answers,")
      && optionsJs.includes("已回答问题会从待追问中移除"),
    optionsHasDedicatedProfilePortal: optionsHtml.includes('id="profileAgentPortal"')
      && (optionsHtml.includes("主动补充或修改画像") || optionsHtml.includes('id="profileDialogComposer"'))
      && optionsHtml.includes("生成待确认草稿")
      && optionsJs.includes("stageProfileAgentUserUpdate")
      && optionsJs.includes("readProfileAgentUserUpdateAnswer")
      && optionsJs.includes('id: "profile_user_update"')
      && optionsJs.includes("sendProfileDialogTurn"),
    optionsRefreshesWorkflowAfterGenerate: optionsGenerateFunction.includes("refreshWorkflowDiagnostics")
      && optionsGenerateFunction.includes("catch(() => {})"),
    backgroundHandlesCareerContextMessages: backgroundJs.includes('case "GET_CAREER_CONTEXT"')
      && backgroundJs.includes('case "GENERATE_CAREER_CONTEXT"')
      && backgroundJs.includes("fetchCareerContext()")
      && backgroundJs.includes("generateCareerContext(message.options || {})"),
    backgroundCallsCareerContextEndpoint: getFunction.includes("/api/profile/career-context")
      && getFunction.includes('method: "GET"')
      && generateFunction.includes("/api/profile/career-context")
      && generateFunction.includes('method: "POST"')
      && generateFunction.includes("writeFile: options.writeFile !== false"),
    serverStillExposesCareerContextEndpoint: serverJs.includes("/api/profile/career-context")
      && serverJs.includes("profileService.readCareerContext()")
      && serverJs.includes("profileService.generateCareerContext(payload)")
      && profileServiceJs.includes("buildCareerContext")
      && profileServiceJs.includes("readCareerContextFile")
      && profileServiceJs.includes("writeCareerContextFile"),
    profileContextDoesNotCreateBrowserTask: !getFunction.includes("/api/browser-tasks")
      && !generateFunction.includes("/api/browser-tasks")
      && !optionsGenerateFunction.includes("CREATE_BROWSER_TASK")
      && !optionsGenerateFunction.includes("CLAIM_BROWSER_TASK"),
    cssSupportsPanel: optionsCss.includes(".career-context-grid")
      && optionsCss.includes(".career-context-preview")
      && optionsCss.includes(".answer-form")
      && optionsCss.includes(".answer-row"),
    packageRunsThisSmoke: packageJson.includes("m10-options-profile-agent-smoke.js")
      && packageJson.includes("m10:options-profile-agent:smoke"),
    docsMentionOptionsEntry: workflowDoc.includes("M10.2e")
      && planDoc.includes("M10.2e")
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
