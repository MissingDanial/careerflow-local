const ui = {
  pageStatus: document.getElementById("pageStatus"),
  autoSync: document.getElementById("autoSync"),
  backendUrl: document.getElementById("backendUrl"),
  syncPath: document.getElementById("syncPath"),
  token: document.getElementById("token"),
  crawlDelayMs: document.getElementById("crawlDelayMs"),
  crawlMaxJobs: document.getElementById("crawlMaxJobs"),
  startCollection: document.getElementById("startCollection"),
  pauseCollection: document.getElementById("pauseCollection"),
  retryCollection: document.getElementById("retryCollection"),
  capture: document.getElementById("capture"),
  sync: document.getElementById("sync"),
  autoCrawl: document.getElementById("autoCrawl"),
  stopAutoCrawl: document.getElementById("stopAutoCrawl"),
  queueVisibleDetails: document.getElementById("queueVisibleDetails"),
  runBrowserTask: document.getElementById("runBrowserTask"),
  runCurrentPageQueue: document.getElementById("runCurrentPageQueue"),
  processVisibleDetails: document.getElementById("processVisibleDetails"),
  clearCache: document.getElementById("clearCache"),
  openOptions: document.getElementById("openOptions"),
  openOptionsSecondary: document.getElementById("openOptionsSecondary"),
  jobCount: document.getElementById("jobCount"),
  descCount: document.getElementById("descCount"),
  pageCount: document.getElementById("pageCount"),
  crawlProgressText: document.getElementById("crawlProgressText"),
  crawlProgressCount: document.getElementById("crawlProgressCount"),
  crawlProgressBar: document.getElementById("crawlProgressBar"),
  crawlVisibleTargets: document.getElementById("crawlVisibleTargets"),
  crawlPendingTargets: document.getElementById("crawlPendingTargets"),
  crawlSkippedTargets: document.getElementById("crawlSkippedTargets"),
  crawlScrollCount: document.getElementById("crawlScrollCount"),
  crawlLastAction: document.getElementById("crawlLastAction"),
  crawlLastJobTitle: document.getElementById("crawlLastJobTitle"),
  browserTaskStatus: document.getElementById("browserTaskStatus"),
  browserTaskCount: document.getElementById("browserTaskCount"),
  browserTaskDetail: document.getElementById("browserTaskDetail"),
  browserTaskQueued: document.getElementById("browserTaskQueued"),
  browserTaskRunning: document.getElementById("browserTaskRunning"),
  browserTaskSucceeded: document.getElementById("browserTaskSucceeded"),
  browserTaskFailed: document.getElementById("browserTaskFailed"),
  browserTaskFailures: document.getElementById("browserTaskFailures"),
  refreshQuality: document.getElementById("refreshQuality"),
  qualityDescriptionCoverage: document.getElementById("qualityDescriptionCoverage"),
  qualityRequiredCoverage: document.getElementById("qualityRequiredCoverage"),
  qualityInvalidJobs: document.getElementById("qualityInvalidJobs"),
  qualityStatus: document.getElementById("qualityStatus"),
  qualityEvents: document.getElementById("qualityEvents"),
  recentEventCount: document.getElementById("recentEventCount"),
  recentEvents: document.getElementById("recentEvents"),
  missingDescriptionCount: document.getElementById("missingDescriptionCount"),
  missingDescriptions: document.getElementById("missingDescriptions"),
  preview: document.getElementById("preview"),
  status: document.getElementById("status")
};

let progressTimer = null;
let collectionStopRequested = false;

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("unload", () => clearInterval(progressTimer));

async function init() {
  bindEvents();
  await loadSettings();
  await refreshCache();
  await refreshQuality({ silent: true });
  await refreshPageStatus();
  startProgressPolling();
}

function bindEvents() {
  ui.startCollection.addEventListener("click", () => runWithStatus("正在开始岗位信息采集", startJobCollection));
  ui.pauseCollection.addEventListener("click", () => runWithStatus("正在暂停采集", pauseJobCollection));
  ui.retryCollection.addEventListener("click", () => runWithStatus("正在重试采集", retryJobCollection));
  ui.capture.addEventListener("click", () => runWithStatus("正在采集当前页", captureCurrentPage));
  ui.sync.addEventListener("click", () => runWithStatus("正在同步到后端", syncCache));
  ui.autoCrawl.addEventListener("click", () => runWithStatus("正在启动自动补齐", startAutoCrawl));
  ui.stopAutoCrawl.addEventListener("click", () => runWithStatus("正在停止自动补齐", stopAutoCrawl));
  ui.queueVisibleDetails.addEventListener("click", () => runWithStatus("正在生成当前页补 JD 任务", queueVisibleDetailTasks));
  ui.runBrowserTask.addEventListener("click", () => runWithStatus("正在处理后端任务", runOneBrowserTask));
  ui.runCurrentPageQueue.addEventListener("click", () => runWithStatus("正在处理当前页队列", runCurrentPageQueue));
  ui.processVisibleDetails.addEventListener("click", () => runWithStatus("正在生成并处理当前页队列", processVisibleDetailQueue));
  ui.clearCache.addEventListener("click", () => runWithStatus("正在清空缓存", clearCache));
  ui.refreshQuality.addEventListener("click", () => runWithStatus("正在读取质量报告", refreshQuality));
  ui.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
  ui.openOptionsSecondary.addEventListener("click", () => chrome.runtime.openOptionsPage());

  for (const input of [ui.autoSync, ui.backendUrl, ui.syncPath, ui.token, ui.crawlDelayMs, ui.crawlMaxJobs]) {
    input.addEventListener("change", () => runWithStatus("正在保存设置", saveSettings));
  }
}

async function startJobCollection() {
  collectionStopRequested = false;
  ui.autoSync.checked = true;
  await saveSettings();
  return processVisibleDetailQueue();
}

async function pauseJobCollection() {
  collectionStopRequested = true;
  try {
    return await stopAutoCrawl();
  } catch (error) {
    return "已请求暂停当前采集队列";
  }
}

async function retryJobCollection() {
  collectionStopRequested = false;
  const tab = await getActiveTab();
  ensureBossTab(tab);
  await rememberBossPage(tab);
  const recovered = await requeueCurrentPageFailedTasks(tab.url);
  if (recovered.changed > 0) {
    const processedMessage = await runCurrentPageQueue();
    return `已恢复当前页 ${recovered.changed} 个失败/取消任务；${processedMessage}`;
  }
  return processVisibleDetailQueue();
}

async function loadSettings() {
  const settings = await runtimeMessage({ type: "GET_SETTINGS" });
  ui.autoSync.checked = Boolean(settings.autoSync);
  ui.backendUrl.value = settings.backendUrl || "";
  ui.syncPath.value = settings.syncPath || "";
  ui.token.value = settings.token || "";
  ui.crawlDelayMs.value = settings.crawlDelayMs || 1600;
  ui.crawlMaxJobs.value = settings.crawlMaxJobs || 30;
}

async function saveSettings() {
  const settings = await runtimeMessage({
    type: "SAVE_SETTINGS",
    settings: readSettingsFromUi()
  });
  ui.autoSync.checked = Boolean(settings.autoSync);
  ui.backendUrl.value = settings.backendUrl;
  ui.syncPath.value = settings.syncPath;
  ui.token.value = settings.token;
  ui.crawlDelayMs.value = settings.crawlDelayMs;
  ui.crawlMaxJobs.value = settings.crawlMaxJobs;
  return "设置已保存";
}

function readSettingsFromUi() {
  return {
    autoSync: ui.autoSync.checked,
    backendUrl: ui.backendUrl.value,
    syncPath: ui.syncPath.value,
    token: ui.token.value,
    crawlDelayMs: ui.crawlDelayMs.value,
    crawlMaxJobs: ui.crawlMaxJobs.value
  };
}

async function captureCurrentPage() {
  await saveSettings();
  const tab = await getActiveTab();
  ensureBossTab(tab);
  const capture = await tabMessage(tab.id, { type: "EXTRACT_PAGE" });
  const summary = await runtimeMessage({ type: "CACHE_CAPTURE", capture });
  renderCapture(capture, summary);
  return ui.autoSync.checked
    ? `采集完成：${summary.jobCount} 个岗位，正在自动同步`
    : `采集完成：${summary.jobCount} 个岗位，${summary.describedJobCount} 个已有描述`;
}

async function syncCache() {
  await saveSettings();
  const result = await runtimeMessage({ type: "SYNC_CACHE" });
  await refreshCache();
  await refreshQuality({ silent: true });
  return `同步完成：已发送 ${result.sent} 个岗位`;
}

async function startAutoCrawl() {
  await saveSettings();
  const tab = await getActiveTab();
  ensureBossTab(tab);
  const settings = readSettingsFromUi();
  const cache = await runtimeMessage({ type: "GET_CACHE" });
  const backendKeys = await getBackendDescribedJobKeys();
  const state = await tabMessage(tab.id, {
    type: "START_AUTO_CRAWL",
    options: {
      delayMs: settings.crawlDelayMs,
      maxJobs: settings.crawlMaxJobs,
      completedJobKeys: mergeUniqueStrings(getDescribedJobKeys(cache), backendKeys)
    }
  });
  renderAutoCrawlState(state);
  startProgressPolling();
  return "已开始自动补齐描述，页面会逐个打开当前列表岗位详情";
}

async function stopAutoCrawl() {
  const tab = await getActiveTab();
  ensureBossTab(tab);
  const state = await tabMessage(tab.id, { type: "STOP_AUTO_CRAWL" });
  renderAutoCrawlState(state);
  return "已请求停止自动补齐";
}

async function queueVisibleDetailTasks() {
  await saveSettings();
  const tab = await getActiveTab();
  ensureBossTab(tab);
  await rememberBossPage(tab);
  const capture = await tabMessage(tab.id, { type: "EXTRACT_PAGE" });
  const summary = await runtimeMessage({ type: "CACHE_CAPTURE", capture });
  await runtimeMessage({ type: "SYNC_CACHE" });
  const candidates = getVisibleJobsMissingDescription(capture);
  if (!candidates.length) {
    renderCapture(capture, summary);
    renderBrowserTaskStatus("当前已加载岗位没有待补 JD", { count: 0 });
    return "当前已加载岗位没有待补 JD";
  }

  let created = 0;
  let duplicates = 0;
  for (const job of candidates) {
    const response = await runtimeMessage({
      type: "CREATE_BROWSER_TASK",
      task: {
        taskType: "CAPTURE_DETAIL",
        payload: {
          jobId: job.jobId || extractJobId(job.detailUrl),
          title: job.title || "",
          company: job.company || "",
          salary: job.salary || "",
          location: job.location || "",
          detailUrl: job.detailUrl || "",
          sourceUrl: capture?.page?.url || ""
        }
      }
    });
    if (response?.response?.duplicate) {
      duplicates += 1;
    } else {
      created += 1;
    }
  }

  renderCapture(capture, summary);
  renderBrowserTaskStatus(`已生成 ${created} 个补 JD 任务，跳过 ${duplicates} 个重复任务`, {
    count: created
  });
  return `已生成 ${created} 个补 JD 任务，跳过 ${duplicates} 个重复任务`;
}

async function runOneBrowserTask() {
  await saveSettings();
  const tab = await getActiveTab();
  ensureBossTab(tab);
  await rememberBossPage(tab);
  renderBrowserTaskStatus("正在领取后端任务", { count: 0 });

  const result = await claimAndRunCurrentPageTask(tab);
  if (!result.claimed) {
    renderBrowserTaskStatus("当前页暂无可处理的后端任务", { count: 0 });
    return "当前页暂无可处理的后端任务";
  }
  renderBrowserTaskStatus(result.message, {
    count: 1,
    task: result.task,
    result: result.result,
    warn: !result.ok
  });
  return result.ok ? "后端任务已处理并回写" : `后端任务处理失败：${result.message || "未知错误"}`;
}

async function runCurrentPageQueue() {
  await saveSettings();
  const tab = await getActiveTab();
  ensureBossTab(tab);
  await rememberBossPage(tab);
  const limit = 10;
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  while (processed < limit) {
    if (collectionStopRequested) {
      break;
    }
    renderBrowserTaskStatus(`正在处理当前页队列 ${processed}/${limit}`, { count: processed });
    const result = await claimAndRunCurrentPageTask(tab);
    if (!result.claimed) {
      break;
    }
    processed += 1;
    if (result.ok) {
      succeeded += 1;
    } else {
      failed += 1;
    }
    if (!result.ok) {
      break;
    }
  }

  const message = processed
    ? `当前页队列处理${collectionStopRequested ? "已暂停" : "完成"}：成功 ${succeeded}，失败 ${failed}`
    : collectionStopRequested
      ? "当前页采集已暂停"
    : "当前页暂无可处理的后端任务";
  renderBrowserTaskStatus(message, {
    count: processed,
    warn: failed > 0
  });
  await refreshBrowserTaskDiagnostics({ silent: true });
  return message;
}

async function processVisibleDetailQueue() {
  const queuedMessage = await queueVisibleDetailTasks();
  const processedMessage = await runCurrentPageQueue();
  return `${queuedMessage}；${processedMessage}`;
}

async function claimAndRunCurrentPageTask(tab) {
  await rememberBossPage(tab);
  const claim = await runtimeMessage({
    type: "CLAIM_BROWSER_TASK",
    options: {
      taskTypes: ["CAPTURE_DETAIL"],
      sourceUrl: tab.url || ""
    }
  });
  const task = claim?.response?.task;
  if (!claim?.response?.claimed || !task) {
    return {
      claimed: false,
      ok: true,
      message: "当前页暂无可处理的后端任务"
    };
  }

  renderBrowserTaskStatus("已领取任务，正在页面执行", {
    count: 1,
    task
  });

  try {
    const result = await tabMessage(tab.id, {
      type: "RUN_BROWSER_TASK",
      task
    });
    const toStatus = result?.ok ? "SUCCEEDED" : "FAILED";
    await runtimeMessage({
      type: "TRANSITION_BROWSER_TASK",
      taskId: task.id,
      transition: {
        toStatus,
        result,
        claimToken: task.claimToken || "",
        errorMessage: result?.ok ? "" : result?.errorCode || result?.message || "browser_task_failed"
      }
    });
    await refreshCache();
    await refreshQuality({ silent: true });
    return {
      claimed: true,
      ok: Boolean(result?.ok),
      task,
      result,
      message: result?.message || "任务已处理"
    };
  } catch (error) {
    await runtimeMessage({
      type: "TRANSITION_BROWSER_TASK",
      taskId: task.id,
      transition: {
        toStatus: "FAILED",
        claimToken: task.claimToken || "",
        result: {
          ok: false,
          errorCode: "BROWSER_TASK_FAILED",
          message: error.message || String(error),
          pageUrl: tab.url
        },
        errorMessage: error.message || String(error)
      }
    }).catch(() => {});
    return {
      claimed: true,
      ok: false,
      task,
      result: null,
      message: error.message || String(error)
    };
  }
}

async function requeueCurrentPageFailedTasks(sourceUrl) {
  const result = await runtimeMessage({
    type: "REQUEUE_BROWSER_TASKS",
    options: {
      taskTypes: ["CAPTURE_DETAIL"],
      statuses: ["FAILED", "CANCELED"],
      sourceUrl,
      reason: "POPUP_RETRY"
    }
  });
  return result.response || result;
}

function getVisibleJobsMissingDescription(capture) {
  const jobs = Array.isArray(capture?.jobs) ? capture.jobs : [];
  const selectedKey = getJobKey(capture?.selectedDetail || {});
  return jobs.filter((job) => {
    if (!job?.detailUrl && !job?.jobId) {
      return false;
    }
    if (String(job.description || "").trim().length >= 50) {
      return false;
    }
    const key = getJobKey(job);
    if (selectedKey && key && key === selectedKey && String(capture?.selectedDetail?.description || "").trim().length >= 50) {
      return false;
    }
    return true;
  });
}

async function clearCache() {
  await runtimeMessage({ type: "CLEAR_CACHE" });
  await refreshCache();
  return "缓存已清空";
}

async function refreshQuality(options = {}) {
  const [qualityResult, eventsResult, taskDiagnosticsResult, missingResult] = await Promise.allSettled([
    runtimeMessage({ type: "GET_QUALITY" }),
    runtimeMessage({ type: "GET_EVENTS", limit: 5 }),
    refreshBrowserTaskDiagnostics({ silent: true }),
    refreshMissingDescriptions()
  ]);

  const errors = [];
  if (qualityResult.status === "fulfilled") {
    renderQuality(qualityResult.value.report);
  } else {
    errors.push(qualityResult.reason);
    renderQuality(null, qualityResult.reason);
  }

  if (eventsResult.status === "fulfilled") {
    renderBrowserEvents(eventsResult.value.events || []);
  } else {
    errors.push(eventsResult.reason);
    renderBrowserEvents([], eventsResult.reason);
  }

  if (taskDiagnosticsResult.status === "rejected") {
    errors.push(taskDiagnosticsResult.reason);
  }

  if (missingResult.status === "rejected") {
    errors.push(missingResult.reason);
  }

  if (!errors.length) {
    return "质量报告已刷新";
  }

  if (options.silent) {
    return "";
  }
  throw errors[0];
}

async function refreshMissingDescriptions() {
  try {
    const result = await runtimeMessage({ type: "GET_MISSING_DESCRIPTIONS", limit: 5 });
    renderMissingDescriptions(result.jobs || [], result.totalMissingDescriptions || 0);
  } catch (error) {
    renderMissingDescriptions([], 0, error);
    throw error;
  }
}

async function refreshBrowserTaskDiagnostics(options = {}) {
  try {
    const result = await runtimeMessage({ type: "GET_BROWSER_TASK_DIAGNOSTICS", limit: 10 });
    renderBrowserTaskDiagnostics(result.diagnostics || {});
    return "浏览器任务诊断已刷新";
  } catch (error) {
    renderBrowserTaskDiagnostics(null, error);
    if (!options.silent) {
      throw error;
    }
    return "";
  }
}

async function refreshCache() {
  const cache = await runtimeMessage({ type: "GET_CACHE" });
  renderCache(cache);
}

async function refreshPageStatus() {
  try {
    const tab = await getActiveTab();
    if (!isBossUrl(tab.url)) {
      ui.pageStatus.textContent = "当前不是 BOSS 直聘页面";
      renderAutoCrawlState(null);
      return;
    }
    await rememberBossPage(tab);
    const status = await tabMessage(tab.id, { type: "WATCH_STATUS" });
    ui.pageStatus.textContent = status.watching ? "BOSS 页面已连接，正在监听" : "BOSS 页面已连接";
    renderAutoCrawlState(status.autoCrawl);
  } catch (error) {
    ui.pageStatus.textContent = error.message || "无法连接当前页面";
  }
}

function startProgressPolling() {
  clearInterval(progressTimer);
  progressTimer = setInterval(async () => {
    try {
      const tab = await getActiveTab();
      if (!isBossUrl(tab.url)) {
        return;
      }
      const state = await tabMessage(tab.id, { type: "AUTO_CRAWL_STATUS" });
      renderAutoCrawlState(state);
      if (!state.running && (state.status === "done" || state.status === "stopped" || state.status === "blocked")) {
        await refreshCache();
        await refreshQuality({ silent: true });
      }
    } catch {
      clearInterval(progressTimer);
    }
  }, 900);
}

function renderAutoCrawlState(state) {
  const current = Number(state?.current || 0);
  const total = Number(state?.total || 0);
  const percent = total ? Math.min(100, Math.round((current / total) * 100)) : 0;

  ui.crawlProgressText.textContent = state?.message || "自动补齐未开始";
  ui.crawlProgressText.classList.toggle("warn", Boolean(state?.blocked || state?.loginRequired || state?.captchaRequired || state?.selectorChanged));
  ui.crawlProgressCount.textContent = `${current}/${total}`;
  ui.crawlProgressBar.style.width = `${percent}%`;
  ui.crawlVisibleTargets.textContent = String(state?.visibleTargets ?? 0);
  ui.crawlPendingTargets.textContent = String(state?.pendingTargets ?? 0);
  ui.crawlSkippedTargets.textContent = String(state?.skipped ?? state?.visibleSkipped ?? 0);
  ui.crawlScrollCount.textContent = String(state?.scrollCount ?? 0);
  ui.crawlLastAction.textContent = formatCrawlAction(state?.lastAction);
  ui.crawlLastJobTitle.textContent = state?.lastJobTitle || "";
  ui.stopAutoCrawl.disabled = !state?.running;
}

function renderBrowserTaskStatus(message, options = {}) {
  ui.browserTaskStatus.textContent = message || "浏览器任务未开始";
  ui.browserTaskStatus.classList.toggle("warn", Boolean(options.warn));
  ui.browserTaskCount.textContent = String(options.count ?? 0);
  ui.browserTaskDetail.classList.toggle("warn", Boolean(options.warn));

  const task = options.task;
  const result = options.result;
  if (!task && !result) {
    ui.browserTaskDetail.textContent = "";
    return;
  }

  const parts = [];
  if (task) {
    parts.push([
      `#${task.id}`,
      task.taskType,
      task.title || task.payload?.title || "",
      task.company || task.payload?.company || ""
    ].filter(Boolean).join(" · "));
  }
  if (result?.selectedDetail) {
    parts.push([
      result.selectedDetail.title,
      `${result.selectedDetail.descriptionLength || 0} 字 JD`
    ].filter(Boolean).join(" · "));
  } else if (result?.message) {
    parts.push(result.message);
  }
  ui.browserTaskDetail.textContent = parts.join("\n");
}

function renderBrowserTaskDiagnostics(diagnostics, error = null) {
  if (error) {
    ui.browserTaskQueued.textContent = "--";
    ui.browserTaskRunning.textContent = "--";
    ui.browserTaskSucceeded.textContent = "--";
    ui.browserTaskFailed.textContent = "--";
    ui.browserTaskFailures.textContent = error.message || "浏览器任务诊断不可用";
    ui.browserTaskFailures.classList.add("warn");
    return;
  }

  const counts = diagnostics?.counts || {};
  ui.browserTaskQueued.textContent = String(counts.queued ?? 0);
  ui.browserTaskRunning.textContent = String(counts.running ?? 0);
  ui.browserTaskSucceeded.textContent = String(counts.succeeded ?? 0);
  ui.browserTaskFailed.textContent = String(counts.failed ?? 0);
  ui.browserTaskFailures.classList.toggle("warn", Number(counts.failed || 0) > 0);

  const failures = Array.isArray(diagnostics?.failuresByReason) ? diagnostics.failuresByReason.slice(0, 2) : [];
  if (!failures.length) {
    ui.browserTaskFailures.textContent = "暂无失败任务";
    return;
  }
  ui.browserTaskFailures.textContent = failures
    .map((failure) => `${normalizeEventType(failure.reason)} ${failure.count}`)
    .join(" · ");
}

function renderCapture(capture, summary = null) {
  const jobs = capture?.jobs || [];
  const selected = capture?.selectedDetail;
  const preview = {
    page: capture?.page?.url || "",
    selectedDetail: selected ? pickJobPreview(selected) : null,
    jobs: jobs.slice(0, 5).map(pickJobPreview)
  };
  ui.preview.textContent = JSON.stringify(preview, null, 2);

  if (summary) {
    ui.jobCount.textContent = String(summary.jobCount);
    ui.descCount.textContent = String(summary.describedJobCount);
    ui.pageCount.textContent = String(summary.pageCount);
  }
}

function renderCache(cache) {
  const jobs = cache.jobs || [];
  ui.jobCount.textContent = String(jobs.length);
  ui.descCount.textContent = String(jobs.filter((job) => Boolean(job.description)).length);
  ui.pageCount.textContent = String(Object.keys(cache.pages || {}).length);
  ui.preview.textContent = jobs.length
    ? JSON.stringify(jobs.slice(0, 5).map(pickJobPreview), null, 2)
    : "暂无数据";
}

function renderQuality(report, error = null) {
  if (error) {
    ui.qualityDescriptionCoverage.textContent = "--";
    ui.qualityRequiredCoverage.textContent = "--";
    ui.qualityInvalidJobs.textContent = "--";
    ui.qualityStatus.textContent = error.message || "质量报告不可用";
    ui.qualityStatus.classList.add("warn");
    ui.qualityEvents.textContent = "";
    return;
  }

  const latest = report?.latest;
  if (!latest) {
    ui.qualityDescriptionCoverage.textContent = "--";
    ui.qualityRequiredCoverage.textContent = "--";
    ui.qualityInvalidJobs.textContent = "--";
    ui.qualityStatus.textContent = "暂无质量报告";
    ui.qualityStatus.classList.remove("warn");
    ui.qualityEvents.textContent = "";
    return;
  }

  ui.qualityDescriptionCoverage.textContent = formatPercent(latest.descriptionCoverage);
  ui.qualityRequiredCoverage.textContent = formatPercent(latest.requiredFieldCoverage);
  ui.qualityInvalidJobs.textContent = String(latest.invalidJobs ?? 0);
  ui.qualityStatus.textContent = [
    `${latest.validJobs || 0}/${latest.receivedJobs || 0} 有效`,
    `${latest.describedJobs || 0} 条 JD`,
    latest.receivedAt ? formatTime(latest.receivedAt) : ""
  ].filter(Boolean).join(" · ");
  ui.qualityStatus.classList.toggle("warn", Boolean(latest.loginRequiredPages || latest.captchaRequiredPages || latest.invalidJobs));

  const alerts = [];
  if (latest.loginRequiredPages) {
    alerts.push(`登录页 ${latest.loginRequiredPages}`);
  }
  if (latest.captchaRequiredPages) {
    alerts.push(`验证页 ${latest.captchaRequiredPages}`);
  }
  const missingDescription = latest.missingFields?.description || 0;
  if (missingDescription) {
    alerts.push(`缺 JD ${missingDescription}`);
  }
  const selectorCounts = latest.selectorCounts || {};
  if (Object.keys(selectorCounts).length) {
    alerts.push(`详情链接 ${selectorCounts.jobDetailLinks || 0}`);
  }
  ui.qualityEvents.textContent = alerts.length ? alerts.join(" · ") : "无异常摘要";
}

function renderBrowserEvents(events, error = null) {
  if (error) {
    ui.recentEventCount.textContent = "--";
    ui.recentEvents.textContent = error.message || "事件日志不可用";
    ui.recentEvents.classList.add("warn");
    return;
  }

  ui.recentEvents.classList.remove("warn");
  ui.recentEventCount.textContent = String(events.length);
  ui.recentEvents.replaceChildren();
  if (!events.length) {
    ui.recentEvents.textContent = "暂无异常事件";
    return;
  }

  for (const event of events) {
    const item = document.createElement("div");
    item.className = `event-item ${event.severity === "error" ? "error" : "warning"}`;

    const meta = document.createElement("div");
    meta.className = "event-meta";
    meta.textContent = [
      normalizeEventType(event.eventType),
      event.createdAt ? formatTime(event.createdAt) : "",
      event.pageTitle || shortUrl(event.pageUrl)
    ].filter(Boolean).join(" · ");

    const message = document.createElement("div");
    message.className = "event-message";
    message.textContent = event.message || "未提供事件说明";

    item.append(meta, message);
    ui.recentEvents.appendChild(item);
  }
}

function renderMissingDescriptions(jobs, total, error = null) {
  if (error) {
    ui.missingDescriptionCount.textContent = "--";
    ui.missingDescriptions.textContent = error.message || "待补 JD 队列不可用";
    ui.missingDescriptions.classList.add("warn");
    return;
  }

  ui.missingDescriptions.classList.remove("warn");
  ui.missingDescriptionCount.textContent = String(total || jobs.length);
  ui.missingDescriptions.replaceChildren();
  if (!jobs.length) {
    ui.missingDescriptions.textContent = "暂无待补岗位";
    return;
  }

  for (const job of jobs) {
    const item = document.createElement("div");
    item.className = "job-gap-item";

    const title = document.createElement("div");
    title.className = "job-gap-title";
    title.textContent = job.title || "未命名岗位";

    const meta = document.createElement("div");
    meta.className = "job-gap-meta";
    meta.textContent = [
      job.company,
      job.salary,
      job.location,
      `${job.descriptionLength || 0} 字`
    ].filter(Boolean).join(" · ");

    item.append(title, meta);
    ui.missingDescriptions.appendChild(item);
  }
}

function pickJobPreview(job) {
  return {
    title: job.title || "",
    company: job.company || "",
    salary: job.salary || "",
    location: job.location || "",
    hasDescription: Boolean(job.description),
    detailUrl: job.detailUrl || ""
  };
}

function getDescribedJobKeys(cache) {
  return (cache?.jobs || [])
    .filter((job) => String(job.description || "").trim().length >= 50)
    .map(getJobKey)
    .filter(Boolean);
}

async function getBackendDescribedJobKeys() {
  try {
    const result = await runtimeMessage({
      type: "GET_JOB_KEYS",
      options: {
        describedOnly: true,
        minDescriptionLength: 50
      }
    });
    return Array.isArray(result.keys) ? result.keys : [];
  } catch {
    return [];
  }
}

function mergeUniqueStrings(...groups) {
  return Array.from(new Set(groups.flat().map(cleanText).filter(Boolean)));
}

function getJobKey(job) {
  const detailUrl = normalizeUrl(job?.detailUrl || job?.url || "");
  return cleanText(job?.jobId || extractJobId(detailUrl))
    || detailUrl
    || [job?.title, job?.company, job?.salary, job?.location].map(cleanText).filter(Boolean).join("|").toLowerCase();
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "--";
  }
  return `${Math.round(number * 100)}%`;
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizeEventType(type) {
  const labels = {
    LOGIN_REQUIRED: "登录失效",
    CAPTCHA_REQUIRED: "安全验证",
    SECURITY_CHECK: "安全校验",
    SELECTOR_CHANGED: "选择器异常",
    JOB_NOT_VISIBLE: "岗位不可见",
    DETAIL_EMPTY: "JD 为空",
    TASK_PAGE_MISMATCH: "页面不匹配",
    BROWSER_TASK_FAILED: "任务失败"
  };
  return labels[type] || type || "事件";
}

function formatCrawlAction(action) {
  const labels = {
    idle: "未开始",
    preparing: "准备中",
    target_found: "发现目标",
    scan_empty: "暂无目标",
    scrolling: "滚动加载",
    clicking: "打开岗位",
    waiting_detail: "等待详情",
    capturing: "采集详情",
    captured: "采集完成",
    idle_limit: "停止扫描",
    login_required: "登录失效",
    captcha_required: "安全验证",
    selector_changed: "选择器异常",
    blocked: "已暂停",
    done: "已完成",
    error: "出现错误"
  };
  return labels[action] || action || "未开始";
}

function shortUrl(value) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return String(value || "");
  }
}

function normalizeUrl(value) {
  if (!value) {
    return "";
  }
  try {
    return new URL(value, "https://www.zhipin.com").toString();
  } catch {
    return String(value);
  }
}

function extractJobId(url) {
  const match = String(url || "").match(/\/job_detail\/([^/?#]+?)(?:\.html)?(?:[?#]|$)/);
  return match ? match[1] : "";
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function rememberBossPage(tab) {
  if (!tab || !isBossUrl(tab.url)) {
    return null;
  }
  try {
    return await runtimeMessage({
      type: "SET_LAST_BOSS_PAGE",
      page: {
        url: tab.url || "",
        title: tab.title || ""
      }
    });
  } catch {
    return null;
  }
}

async function runWithStatus(loadingText, action) {
  setBusy(true);
  setStatus(loadingText);
  try {
    const message = await action();
    setStatus(message || "完成");
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    setBusy(false);
    await refreshPageStatus();
  }
}

function setBusy(isBusy) {
  for (const button of [ui.startCollection, ui.retryCollection, ui.openOptions, ui.openOptionsSecondary]) {
    button.disabled = isBusy;
  }
  ui.pauseCollection.disabled = false;
}

function setStatus(message, isError = false) {
  ui.status.textContent = message;
  ui.status.classList.toggle("error", isError);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    throw new Error("找不到当前标签页");
  }
  return tab;
}

function ensureBossTab(tab) {
  if (!isBossUrl(tab.url)) {
    throw new Error("请先打开已登录的 BOSS 直聘页面");
  }
}

function isBossUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "www.zhipin.com" || parsed.hostname.endsWith(".zhipin.com");
  } catch {
    return false;
  }
}

async function runtimeMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "扩展后台无响应");
  }
  return response.result;
}

async function tabMessage(tabId, message) {
  const response = await chrome.tabs.sendMessage(tabId, message);
  if (!response?.ok) {
    throw new Error(response?.error || "页面脚本无响应，请刷新 BOSS 页面后重试");
  }
  return response.result;
}
