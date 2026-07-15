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
  const readme = read("README.zh-CN.md");
  const planDoc = read("docs/04_DEVELOPMENT_PLAN.md");

  const backgroundFactSlice = sliceSource(
    backgroundJs,
    "async function fetchProfileFactDrafts",
    "async function fetchWorkflowEvents"
  );
  const optionsFactSlice = sliceSource(
    optionsJs,
    "async function refreshProfileFactDrafts",
    "async function refreshResumeDiagnostics"
  );

  const ids = [
    "generateProfileFactDrafts",
    "refreshProfileFactDrafts",
    "regenerateCareerContextAfterFacts",
    "profileFactDraftStatus",
    "careerContextFreshnessStatus",
    "profileFactDrafts"
  ];
  const messageTypes = [
    "GET_PROFILE_FACT_DRAFTS",
    "GENERATE_PROFILE_FACT_DRAFTS",
    "CONFIRM_PROFILE_FACT_DRAFT",
    "REJECT_PROFILE_FACT_DRAFT"
  ];

  const checks = {
    optionsHasFactDraftPanel: optionsHtml.includes("待确认事实草稿")
      && ids.every((id) => optionsHtml.includes(`id="${id}"`))
      && optionsHtml.includes("确认后才进入事实库"),
    optionsReadsAndBindsFactDraftPanel: ids.every((id) => optionsJs.includes(`getElementById("${id}")`))
      && optionsJs.includes("ui.generateProfileFactDrafts.addEventListener")
      && optionsJs.includes("ui.refreshProfileFactDrafts.addEventListener"),
    optionsLoadsFactDraftsWithCareerContext: optionsJs.includes("GET_PROFILE_FACT_DRAFTS")
      && optionsJs.includes("factDrafts: draftResult.response")
      && optionsJs.includes("renderProfileFactDrafts(diagnostics?.factDrafts"),
    optionsGeneratesDraftsFromAnswers: optionsJs.includes("generateProfileFactDraftsFromAnswers")
      && optionsJs.includes("readCareerContextAnswers()")
      && optionsJs.includes('type: "GENERATE_PROFILE_FACT_DRAFTS"')
      && optionsJs.includes("新增 ${payload.created || 0}，跳过 ${payload.skipped || 0}"),
    optionsCanConfirmAndRejectDrafts: optionsJs.includes("confirmProfileFactDraftFromOptions")
      && optionsJs.includes("rejectProfileFactDraftFromOptions")
      && optionsJs.includes('type: "CONFIRM_PROFILE_FACT_DRAFT"')
      && optionsJs.includes('type: "REJECT_PROFILE_FACT_DRAFT"')
      && optionsJs.includes("options_profile_fact_rejected"),
    optionsCanEditDraftBeforeConfirm: optionsJs.includes("createProfileFactDraftEditor")
      && optionsJs.includes("readProfileFactDraftEdit")
      && optionsJs.includes("splitEditableList")
      && optionsJs.includes("content: readProfileFactDraftEdit(draft)")
      && optionsCss.includes(".fact-draft-editor"),
    optionsMarksContextStaleAfterFactActions: optionsJs.includes("careerContextNeedsRegeneration")
      && optionsJs.includes("updateCareerContextFreshnessStatus")
      && optionsJs.includes("事实库已变更，建议重新生成")
      && optionsJs.includes("regenerateCareerContextAfterFacts.addEventListener"),
    optionsRefreshesWorkflowAfterFactActions: optionsFactSlice.includes("refreshWorkflowDiagnostics")
      && optionsFactSlice.includes("refreshProfileFactDrafts"),
    backgroundHandlesFactDraftMessages: messageTypes.every((type) => backgroundJs.includes(`case "${type}"`)),
    backgroundCallsFactDraftEndpoints: backgroundFactSlice.includes("/api/profile/fact-drafts")
      && backgroundFactSlice.includes("/api/profile/career-context/fact-drafts")
      && backgroundFactSlice.includes("/confirm")
      && backgroundFactSlice.includes("/reject")
      && backgroundFactSlice.includes("status\", String(normalizedOptions.status || \"PENDING\")"),
    serverStillExposesFactDraftEndpoints: serverJs.includes("/api/profile/career-context/fact-drafts")
      && serverJs.includes("/api/profile/fact-drafts")
      && serverJs.includes("confirmProfileFactDraft")
      && serverJs.includes("rejectProfileFactDraft"),
    factDraftUiDoesNotCreateBossActions: !optionsFactSlice.includes("CREATE_BROWSER_TASK")
      && !optionsFactSlice.includes("CLAIM_BROWSER_TASK")
      && !backgroundFactSlice.includes("/api/browser-tasks")
      && !backgroundFactSlice.includes("/api/applications/"),
    cssKeepsFactDraftPanelScoped: optionsCss.includes("#profileFactDrafts"),
    packageRunsThisSmoke: packageJson.includes("m10-options-profile-facts-smoke.js")
      && packageJson.includes("m10:options-profile-facts:smoke"),
    packageRunsUiSmoke: packageJson.includes("m10-options-profile-facts-ui-smoke.js")
      && packageJson.includes("m10:options-profile-facts-ui:smoke"),
    docsMentionOptionsFactDrafts: readme.includes("M10.2f Profile Fact Confirmation")
      && readme.includes("settings page")
      && planDoc.includes("M10.2f Profile Fact Confirmation")
      && planDoc.includes("ProfileAgent settings UI")
  };

  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ ok, checks }, null, 2));
  process.exitCode = ok ? 0 : 1;
}

function sliceSource(source, startMarker, endMarker) {
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
