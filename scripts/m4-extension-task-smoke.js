#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

main();

function main() {
  const background = read("extension/src/background.js");
  const content = read("extension/src/content.js");
  const popup = read("extension/src/popup.js");
  const popupHtml = read("extension/src/popup.html");
  const popupCss = read("extension/src/popup.css");
  const optionsHtml = read("extension/src/options.html");
  const optionsJs = read("extension/src/options.js");
  const optionsCss = read("extension/src/options.css");
  const packageJson = read("package.json");

  const checks = {
    backgroundCreatesBrowserTask: background.includes('case "CREATE_BROWSER_TASK"') && background.includes("/api/browser-tasks"),
    backgroundClaimsBrowserTask: background.includes('case "CLAIM_BROWSER_TASK"') && background.includes("/api/browser-tasks/claim"),
    backgroundTransitionsBrowserTask: background.includes('case "TRANSITION_BROWSER_TASK"') && background.includes("/transition"),
    contentRunsBrowserTask: content.includes('case "RUN_BROWSER_TASK"') && content.includes("runBrowserTask(message.task"),
    contentCapturesDetailTask: content.includes('taskType === "CAPTURE_DETAIL"') && content.includes("runCaptureDetailTask"),
    contentClassifiesTaskFailures: content.includes('errorCode: "JOB_NOT_VISIBLE"')
      && content.includes('errorCode: success ? "" : "DETAIL_EMPTY"')
      && content.includes("getAutoCrawlBlocker(scan"),
    contentKeepsRealActionsManual: content.includes("NEEDS_MANUAL_ACTION") && content.includes("尚未接入自动执行"),
    backgroundHandlesTaskDiagnostics: background.includes('case "GET_BROWSER_TASK_DIAGNOSTICS"')
      && background.includes('/api/browser-tasks/diagnostics')
      && background.includes("diagnosticsUrl.searchParams.set"),
    popupHasSimplifiedTaskButtons: popupHtml.includes('id="startCollection"')
      && popupHtml.includes('id="pauseCollection"')
      && popupHtml.includes('id="retryCollection"')
      && popupHtml.includes("开始岗位信息采集"),
    popupKeepsHiddenTaskCompatibilityIds: ["queueVisibleDetails", "runBrowserTask", "runCurrentPageQueue", "processVisibleDetails"]
      .every((id) => popupHtml.includes(`id="${id}"`)),
    popupHasTaskStatus: popupHtml.includes('id="browserTaskStatus"') && popupHtml.includes('id="browserTaskDetail"'),
    popupHasTaskDiagnostics: ["browserTaskQueued", "browserTaskRunning", "browserTaskSucceeded", "browserTaskFailed", "browserTaskFailures"]
      .every((id) => popupHtml.includes(`id="${id}"`)),
    optionsHasTaskDiagnostics: ["browserTaskQueued", "browserTaskRunning", "browserTaskSucceeded", "browserTaskFailed", "browserTaskFailures", "browserTaskRecent"]
      .every((id) => optionsHtml.includes(`id="${id}"`)),
    popupCreatesCurrentPageTasks: popup.includes("queueVisibleDetailTasks")
      && popup.includes('type: "CREATE_BROWSER_TASK"')
      && popup.includes("getVisibleJobsMissingDescription"),
    popupClaimsAndRunsTask: popup.includes('type: "CLAIM_BROWSER_TASK"')
      && popup.includes('type: "RUN_BROWSER_TASK"')
      && popup.includes("sourceUrl: tab.url"),
    popupRunsCurrentPageQueue: popup.includes("runCurrentPageQueue")
      && popup.includes("claimAndRunCurrentPageTask")
      && popup.includes("while (processed < limit)"),
    popupProcessesVisibleDetailQueue: popup.includes("processVisibleDetailQueue")
      && popup.includes("const queuedMessage = await queueVisibleDetailTasks()")
      && popup.includes("const processedMessage = await runCurrentPageQueue()"),
    popupStartPauseRetryUseTaskFlow: popup.includes("startJobCollection")
      && popup.includes("ui.autoSync.checked = true")
      && popup.includes("return processVisibleDetailQueue()")
      && popup.includes("pauseJobCollection")
      && popup.includes("retryJobCollection")
      && popup.includes("collectionStopRequested"),
    popupTransitionsTaskResult: popup.includes('type: "TRANSITION_BROWSER_TASK"')
      && popup.includes('result?.ok ? "SUCCEEDED" : "FAILED"')
      && popup.includes('toStatus: "FAILED"')
      && popup.includes('result?.errorCode || result?.message || "browser_task_failed"'),
    popupRendersTaskDiagnostics: popup.includes('type: "GET_BROWSER_TASK_DIAGNOSTICS"')
      && popup.includes("renderBrowserTaskDiagnostics")
      && popup.includes("JOB_NOT_VISIBLE")
      && popup.includes("DETAIL_EMPTY"),
    optionsRendersTaskDiagnostics: optionsJs.includes('type: "GET_BROWSER_TASK_DIAGNOSTICS"')
      && optionsJs.includes("renderTaskDiagnostics")
      && optionsJs.includes("browserTaskRecent"),
    popupStylesSimplifiedTaskPanel: popupCss.includes(".status-card")
      && popupCss.includes(".summary-grid")
      && popupCss.includes(".task-failures")
      && popupCss.includes(".visually-hidden"),
    optionsStylesDiagnostics: optionsCss.includes(".metric-grid") && optionsCss.includes(".compact-list"),
    packageRunsThisSmoke: packageJson.includes("m4-extension-task-smoke.js")
  };

  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    ok,
    checks
  }, null, 2));
  process.exitCode = ok ? 0 : 1;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
