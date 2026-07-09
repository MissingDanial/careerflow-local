#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

main();

function main() {
  const popupHtml = read("extension/src/popup.html");
  const popupJs = read("extension/src/popup.js");
  const optionsHtml = read("extension/src/options.html");
  const optionsJs = read("extension/src/options.js");
  const backgroundJs = read("extension/src/background.js");
  const popupCss = read("extension/src/popup.css");
  const optionsCss = read("extension/src/options.css");

  const popupCompatibilityIds = [
    "crawlVisibleTargets",
    "crawlPendingTargets",
    "crawlSkippedTargets",
    "crawlScrollCount",
    "crawlLastAction",
    "crawlLastJobTitle",
    "refreshQuality",
  ];
  const optionsDetailIds = [
    "qualityDescriptionCoverage",
    "qualityRequiredCoverage",
    "qualityInvalidJobs",
    "qualityStatus",
    "qualityEvents",
    "recentEventCount",
    "recentEvents",
    "missingDescriptionCount",
    "missingDescriptions"
  ];

  const checks = {
    popupIsSimplifiedCollectionUi: ["startCollection", "pauseCollection", "retryCollection"].every((id) => popupHtml.includes(`id="${id}"`))
      && popupHtml.includes("开始岗位信息采集")
      && !popupHtml.includes("采集质量</span>"),
    popupStartPauseRetryWired: popupJs.includes("startJobCollection")
      && popupJs.includes("pauseJobCollection")
      && popupJs.includes("retryJobCollection"),
    popupKeepsInternalCompatibilityIds: popupCompatibilityIds.every((id) => popupHtml.includes(`id="${id}"`)),
    optionsHasQualityIds: optionsDetailIds.every((id) => optionsHtml.includes(`id="${id}"`)),
    optionsQueriesQualityIds: optionsDetailIds.every((id) => optionsJs.includes(`getElementById("${id}")`)),
    popupCallsQualityMessage: popupJs.includes('type: "GET_QUALITY"'),
    popupCallsEventsMessage: popupJs.includes('type: "GET_EVENTS"'),
    popupCallsMissingMessage: popupJs.includes('type: "GET_MISSING_DESCRIPTIONS"'),
    optionsCallsQualityMessages: optionsJs.includes('type: "GET_QUALITY"')
      && optionsJs.includes('type: "GET_EVENTS"')
      && optionsJs.includes('type: "GET_MISSING_DESCRIPTIONS"'),
    popupCallsJobKeysMessage: popupJs.includes('type: "GET_JOB_KEYS"') && popupJs.includes("getBackendDescribedJobKeys"),
    popupFormatsAutoCrawlDiagnostics: popupJs.includes("formatCrawlAction") && popupJs.includes("state?.visibleTargets") && popupJs.includes("state?.scrollCount"),
    popupShowsBlockedAutoCrawlState: popupJs.includes('state.status === "blocked"') && popupJs.includes("state?.blocked") && popupJs.includes("selector_changed"),
    backgroundHandlesQualityMessage: backgroundJs.includes('case "GET_QUALITY"'),
    backgroundHandlesEventsMessage: backgroundJs.includes('case "GET_EVENTS"'),
    backgroundHandlesMissingMessage: backgroundJs.includes('case "GET_MISSING_DESCRIPTIONS"'),
    backgroundHandlesJobKeysMessage: backgroundJs.includes('case "GET_JOB_KEYS"') && backgroundJs.includes("/api/jobs/keys?described="),
    backgroundCallsQualityEndpoint: backgroundJs.includes("/api/quality?limit=1"),
    backgroundCallsEventsEndpoint: backgroundJs.includes("/api/events?limit="),
    backgroundCallsMissingEndpoint: backgroundJs.includes("/api/jobs/missing-descriptions?limit="),
    popupSeedsAutoCrawlProgress: popupJs.includes("completedJobKeys: mergeUniqueStrings(getDescribedJobKeys(cache), backendKeys)"),
    cssHasSimplifiedPopup: popupCss.includes(".summary-grid") && popupCss.includes(".visually-hidden"),
    optionsHasDiagnosticsLayout: optionsCss.includes(".metric-grid") && optionsCss.includes(".list-item") && optionsCss.includes(".preview"),
    optionsMovesEventAndMissingLists: optionsHtml.includes("最近异常")
      && optionsHtml.includes("待补 JD")
      && optionsHtml.includes("这里是数据库缺 JD 提示")
  };

  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ ok, checks }, null, 2));
  process.exitCode = ok ? 0 : 1;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
