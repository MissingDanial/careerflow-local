(() => {
  if (window.__bossFindContentLoaded) {
    return;
  }
  window.__bossFindContentLoaded = true;

  let observer = null;
  let observeTimer = null;
  let lastCaptureFingerprint = "";
  let autoCrawlState = createIdleCrawlState();
  let stopAutoCrawlRequested = false;
  let autoCrawlAttemptedKeys = new Set();
  let autoCrawlDescribedKeys = new Set();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  });

  async function handleMessage(message) {
    switch (message?.type) {
      case "EXTRACT_PAGE":
        return extractPage();
      case "START_WATCH":
        startWatch();
        return {
          watching: true,
          capture: await extractAndCache()
        };
      case "STOP_WATCH":
        stopWatch();
        return { watching: false };
      case "WATCH_STATUS":
        return {
          watching: Boolean(observer),
          autoCrawl: autoCrawlState
        };
      case "START_AUTO_CRAWL":
        return startAutoCrawl(message.options || {});
      case "STOP_AUTO_CRAWL":
        stopAutoCrawlRequested = true;
        if (autoCrawlState.running) {
          autoCrawlState.status = "stopping";
          autoCrawlState.message = "正在停止自动补齐";
        }
        return autoCrawlState;
      case "AUTO_CRAWL_STATUS":
        return autoCrawlState;
      case "RUN_BROWSER_TASK":
        return runBrowserTask(message.task || {});
      default:
        throw new Error(`Unsupported content message: ${message?.type}`);
    }
  }

  async function runBrowserTask(task) {
    const taskType = cleanText(task?.taskType || task?.type).toUpperCase();
    if (!taskType) {
      throw new Error("浏览器任务缺少 taskType");
    }

    if (taskType === "CAPTURE_DETAIL") {
      return runCaptureDetailTask(task);
    }
    if (taskType === "SEND_GREETING") {
      return runSendGreetingTask(task);
    }
    if (taskType === "REFRESH_CONVERSATION") {
      return runRefreshConversationTask(task);
    }
    if (taskType === "CHECK_RESUME_UNLOCK") {
      return runCheckResumeUnlockTask(task);
    }
    if (taskType === "UPLOAD_RESUME") {
      return runUploadResumeDryRunTask(task);
    }
    if (taskType === "SUBMIT_APPLICATION") {
      return runSubmitApplicationDryRunTask(task);
    }

    return {
      ok: false,
      status: "NEEDS_MANUAL_ACTION",
      taskType,
      message: `${taskType} 尚未接入自动执行；需要后续显式开发和确认`,
      page: {
        url: location.href,
        title: document.title
      }
    };
  }

  async function runSendGreetingTask(task) {
    const payload = getTaskPayload(task);
    const messageText = cleanMultiline(payload.messageText || task?.messageText || "");
    const diagnostics = getPageDiagnostics(findJobCards());
    const blocker = getGreetingPageBlocker(diagnostics);
    if (blocker) {
      return createGreetingTaskResult(task, {
        ok: false,
        errorCode: blocker.errorCode,
        message: blocker.message,
        diagnostics
      });
    }
    if (!messageText) {
      return createGreetingTaskResult(task, {
        ok: false,
        errorCode: "GREETING_INPUT_NOT_FOUND",
        message: "Greeting message text is empty; dry-run cannot stage anything.",
        diagnostics
      });
    }

    const pageReady = await ensureGreetingTaskTargetVisible(task);
    if (!pageReady.ok) {
      return pageReady;
    }

    let input = isCurrentPageChatContext() ? findGreetingInput() : null;
    let clickedEntry = null;
    if (!input) {
      const entry = findSafeGreetingEntry();
      if (!entry) {
        return createGreetingTaskResult(task, {
          ok: false,
          errorCode: "GREETING_ENTRY_NOT_FOUND",
          message: "No safe existing chat entry was found. The extension will not click first-contact or send-like buttons in dry-run mode.",
          diagnostics: {
            ...diagnostics,
            greeting: getGreetingDomDiagnostics()
          }
        });
      }
      clickedEntry = entry;
      await clickGreetingEntry(entry);
      input = await waitForGreetingInput(5000);
    }

    if (!input) {
      return createGreetingTaskResult(task, {
        ok: false,
        errorCode: "GREETING_INPUT_NOT_FOUND",
        message: "Greeting/chat input was not found after opening the safe chat entry.",
        diagnostics: {
          ...diagnostics,
          greeting: getGreetingDomDiagnostics()
        }
      });
    }

    stageGreetingMessage(input, messageText);
    await sleep(350);
    const sendButton = findGreetingSendButton(input);
    if (!sendButton) {
      markGreetingDryRunElement(input);
      return createGreetingTaskResult(task, {
        ok: false,
        errorCode: "GREETING_BUTTON_NOT_FOUND",
        message: "Greeting text was staged, but a visible send button was not found. No send action was performed.",
        diagnostics: {
          ...diagnostics,
          greeting: getGreetingDomDiagnostics()
        },
        dryRun: {
          staged: true,
          clickedEntry: Boolean(clickedEntry),
          messageLength: messageText.length
        }
      });
    }

    markGreetingDryRunElement(input);
    markGreetingDryRunElement(sendButton);
    return createGreetingTaskResult(task, {
      ok: true,
      errorCode: "",
      statusReason: "DRY_RUN_READY",
      message: "DRY_RUN_READY: greeting text is staged and the send button is visible. The extension did not click send.",
      diagnostics: {
        ...diagnostics,
        greeting: getGreetingDomDiagnostics()
      },
      dryRun: {
        staged: true,
        clickedEntry: Boolean(clickedEntry),
        messageLength: messageText.length,
        sendButtonText: getElementLabel(sendButton)
      }
    });
  }

  async function runRefreshConversationTask(task) {
    const diagnostics = getPageDiagnostics(findJobCards());
    const blocker = getReadOnlyBossTaskBlocker(diagnostics);
    if (blocker) {
      return createReadOnlyTaskResult(task, "REFRESH_CONVERSATION", {
        ok: false,
        errorCode: blocker.errorCode,
        message: blocker.message,
        diagnostics
      });
    }

    const pageReady = await ensureReadOnlyTaskTargetVisible(task);
    if (!pageReady.ok) {
      return pageReady;
    }

    const conversation = extractConversationSnapshot();
    const resumeUnlock = extractResumeUnlockSnapshot();
    const ok = conversation.chatOpened || conversation.messageCount > 0 || resumeUnlock.hasAnyResumeAction;
    return createReadOnlyTaskResult(task, "REFRESH_CONVERSATION", {
      ok,
      errorCode: ok ? "" : "CONVERSATION_NOT_FOUND",
      statusReason: ok ? "CONVERSATION_READ" : "CONVERSATION_NOT_FOUND",
      message: ok
        ? "Conversation state was read from the current BOSS page. No page action was performed."
        : "No conversation/chat state was found on the current BOSS page.",
      diagnostics: {
        ...diagnostics,
        conversationDom: getConversationDomDiagnostics()
      },
      conversation,
      resumeUnlock
    });
  }

  async function runCheckResumeUnlockTask(task) {
    const diagnostics = getPageDiagnostics(findJobCards());
    const blocker = getReadOnlyBossTaskBlocker(diagnostics);
    if (blocker) {
      return createReadOnlyTaskResult(task, "CHECK_RESUME_UNLOCK", {
        ok: false,
        errorCode: blocker.errorCode,
        message: blocker.message,
        diagnostics
      });
    }

    const pageReady = await ensureReadOnlyTaskTargetVisible(task);
    if (!pageReady.ok) {
      return pageReady;
    }

    const conversation = extractConversationSnapshot();
    const resumeUnlock = extractResumeUnlockSnapshot();
    return createReadOnlyTaskResult(task, "CHECK_RESUME_UNLOCK", {
      ok: true,
      errorCode: "",
      statusReason: resumeUnlock.unlocked ? "RESUME_UNLOCKED" : "RESUME_LOCKED_OR_UNKNOWN",
      message: resumeUnlock.unlocked
        ? "Resume/application action appears available on the current BOSS page. No click/upload/submit was performed."
        : "Resume/application unlock was not detected from the current BOSS page. No page action was performed.",
      diagnostics: {
        ...diagnostics,
        conversationDom: getConversationDomDiagnostics()
      },
      conversation,
      resumeUnlock
    });
  }

  async function runUploadResumeDryRunTask(task) {
    const diagnostics = getPageDiagnostics(findJobCards());
    const blocker = getReadOnlyBossTaskBlocker(diagnostics);
    if (blocker) {
      return createUploadResumeDryRunResult(task, {
        ok: false,
        errorCode: blocker.errorCode,
        message: blocker.message,
        diagnostics
      });
    }

    const pageReady = await ensureReadOnlyTaskTargetVisible(task);
    if (!pageReady.ok) {
      return createUploadResumeDryRunResult(task, {
        ok: false,
        errorCode: pageReady.errorCode || "PAGE_MISMATCH",
        message: pageReady.message || "Current BOSS page does not match the UPLOAD_RESUME dry-run task.",
        diagnostics: pageReady.diagnostics || diagnostics,
        captureSummary: pageReady.captureSummary || null
      });
    }

    const conversation = extractConversationSnapshot();
    const resumeUnlock = extractResumeUnlockSnapshot();
    const uploadDryRun = extractUploadResumeDryRunSnapshot();
    const ok = uploadDryRun.fileInputUsable || uploadDryRun.uploadActionVisible || resumeUnlock.unlocked;
    return createUploadResumeDryRunResult(task, {
      ok,
      errorCode: ok ? "" : "UPLOAD_ENTRY_NOT_FOUND",
      statusReason: ok ? "UPLOAD_RESUME_DRY_RUN_READY" : "UPLOAD_ENTRY_NOT_FOUND",
      message: ok
        ? "UPLOAD_RESUME dry-run found a possible resume upload/selection entry. No file was selected and no upload was performed."
        : "UPLOAD_RESUME dry-run did not find a usable resume upload/selection entry on the current page.",
      diagnostics: {
        ...diagnostics,
        conversationDom: getConversationDomDiagnostics()
      },
      conversation,
      resumeUnlock,
      uploadDryRun
    });
  }

  async function runSubmitApplicationDryRunTask(task) {
    const diagnostics = getPageDiagnostics(findJobCards());
    const blocker = getReadOnlyBossTaskBlocker(diagnostics);
    if (blocker) {
      return createSubmitApplicationDryRunResult(task, {
        ok: false,
        errorCode: blocker.errorCode,
        message: blocker.message,
        diagnostics
      });
    }

    const pageReady = await ensureReadOnlyTaskTargetVisible(task);
    if (!pageReady.ok) {
      return createSubmitApplicationDryRunResult(task, {
        ok: false,
        errorCode: pageReady.errorCode || "PAGE_MISMATCH",
        message: pageReady.message || "Current BOSS page does not match the SUBMIT_APPLICATION dry-run task.",
        diagnostics: pageReady.diagnostics || diagnostics,
        captureSummary: pageReady.captureSummary || null
      });
    }

    const conversation = extractConversationSnapshot();
    const resumeUnlock = extractResumeUnlockSnapshot();
    const submitDryRun = extractSubmitApplicationDryRunSnapshot();
    const ok = submitDryRun.submitActionVisible && !submitDryRun.lockedSignalVisible;
    return createSubmitApplicationDryRunResult(task, {
      ok,
      errorCode: ok ? "" : "SUBMIT_ENTRY_NOT_READY",
      statusReason: ok ? "SUBMIT_APPLICATION_DRY_RUN_READY" : "SUBMIT_ENTRY_NOT_READY",
      message: ok
        ? "SUBMIT_APPLICATION dry-run found a possible submit/apply entry. No click or confirmation was performed."
        : "SUBMIT_APPLICATION dry-run did not find a ready submit/apply entry on the current page.",
      diagnostics: {
        ...diagnostics,
        conversationDom: getConversationDomDiagnostics()
      },
      conversation,
      resumeUnlock,
      submitDryRun
    });
  }

  async function ensureReadOnlyTaskTargetVisible(task) {
    const taskType = cleanText(task?.taskType || task?.type || "").toUpperCase();
    if (!hasGreetingTaskIdentity(task)) {
      const conversation = extractConversationSnapshot();
      if (conversation.chatOpened || /\/chat|\/im|\/message/.test(location.href.toLowerCase())) {
        return { ok: true };
      }
      return createReadOnlyTaskResult(task, taskType, {
        ok: false,
        errorCode: "PAGE_MISMATCH",
        message: `${taskType} has no job identity and the current page is not a recognizable chat page.`,
        diagnostics: getPageDiagnostics(findJobCards())
      });
    }

    if (currentPageMatchesBrowserTask(task)) {
      return { ok: true };
    }

    const target = findBrowserTaskTarget(task);
    if (!target) {
      const capture = await extractAndCache();
      if (captureSelectedDetailMatchesTask(capture, task)) {
        return { ok: true };
      }
      return createReadOnlyTaskResult(task, taskType, {
        ok: false,
        errorCode: "PAGE_MISMATCH",
        message: "Current BOSS page does not show the browser task job.",
        diagnostics: capture.diagnostics,
        captureSummary: summarizeCaptureForTask(capture)
      });
    }

    const capture = await extractAndCache();
    if (captureSelectedDetailMatchesTask(capture, task) || currentPageMatchesBrowserTask(task)) {
      return { ok: true };
    }
    return createReadOnlyTaskResult(task, taskType, {
      ok: false,
      errorCode: "PAGE_MISMATCH",
      message: "The browser task job is visible, but the matching detail/chat page is not currently loaded. Open the matching BOSS detail/chat page before running this read-only task.",
      diagnostics: capture.diagnostics,
      captureSummary: summarizeCaptureForTask(capture)
    });
  }

  function getReadOnlyBossTaskBlocker(diagnostics = {}) {
    if (!/zhipin\.com$/i.test(location.hostname) && !/\.zhipin\.com$/i.test(location.hostname)) {
      return {
        errorCode: "PAGE_MISMATCH",
        message: "Current tab is not a BOSS/Zhipin page."
      };
    }
    if (diagnostics.captchaRequired) {
      return {
        errorCode: "SECURITY_CHECK",
        message: "BOSS security verification is visible; read-only task is paused for manual handling."
      };
    }
    if (diagnostics.loginRequired) {
      return {
        errorCode: "LOGIN_REQUIRED",
        message: "BOSS login state appears invalid; read-only task cannot inspect the page."
      };
    }
    return null;
  }

  function createReadOnlyTaskResult(task, taskType, options = {}) {
    const ok = Boolean(options.ok);
    return {
      ok,
      status: ok ? "SUCCEEDED" : "FAILED",
      taskType,
      errorCode: options.errorCode || "",
      statusReason: options.statusReason || options.errorCode || "",
      message: options.message || "",
      task: summarizeBrowserTask(task),
      diagnostics: options.diagnostics || getPageDiagnostics(findJobCards()),
      captureSummary: options.captureSummary || null,
      conversation: options.conversation || null,
      resumeUnlock: options.resumeUnlock || null,
      readOnly: {
        noRealBossAction: true,
        clicked: false,
        uploaded: false,
        submitted: false
      },
      page: {
        url: location.href,
        title: document.title
      }
    };
  }

  function createUploadResumeDryRunResult(task, options = {}) {
    const ok = Boolean(options.ok);
    return {
      ok,
      status: ok ? "SUCCEEDED" : "FAILED",
      taskType: "UPLOAD_RESUME",
      errorCode: options.errorCode || "",
      statusReason: options.statusReason || options.errorCode || "",
      message: options.message || "",
      task: summarizeBrowserTask(task),
      diagnostics: options.diagnostics || getPageDiagnostics(findJobCards()),
      captureSummary: options.captureSummary || null,
      conversation: options.conversation || null,
      resumeUnlock: options.resumeUnlock || null,
      uploadDryRun: options.uploadDryRun || extractUploadResumeDryRunSnapshot(),
      dryRun: {
        noRealBossAction: true,
        fileSelected: false,
        clickedUpload: false,
        uploaded: false,
        submitted: false
      },
      readOnly: {
        noRealBossAction: true,
        clicked: false,
        uploaded: false,
        submitted: false
      },
      page: {
        url: location.href,
        title: document.title
      }
    };
  }

  function createSubmitApplicationDryRunResult(task, options = {}) {
    const ok = Boolean(options.ok);
    return {
      ok,
      status: ok ? "SUCCEEDED" : "FAILED",
      taskType: "SUBMIT_APPLICATION",
      errorCode: options.errorCode || "",
      statusReason: options.statusReason || options.errorCode || "",
      message: options.message || "",
      task: summarizeBrowserTask(task),
      diagnostics: options.diagnostics || getPageDiagnostics(findJobCards()),
      captureSummary: options.captureSummary || null,
      conversation: options.conversation || null,
      resumeUnlock: options.resumeUnlock || null,
      submitDryRun: options.submitDryRun || extractSubmitApplicationDryRunSnapshot(),
      dryRun: {
        noRealBossAction: true,
        clickedSubmit: false,
        confirmed: false,
        submitted: false,
        uploaded: false
      },
      readOnly: {
        noRealBossAction: true,
        clicked: false,
        uploaded: false,
        submitted: false
      },
      page: {
        url: location.href,
        title: document.title
      }
    };
  }

  async function runCaptureDetailTask(task) {
    startWatch();
    const scan = scanAutoCrawlTargets({
      completedJobKeys: [],
      maxJobs: 1
    });
    const blocker = getAutoCrawlBlocker(scan, { idleScrolls: 2 });
    if (blocker) {
      return {
        ok: false,
        status: "FAILED",
        taskType: "CAPTURE_DETAIL",
        errorCode: blocker.reason || "BROWSER_TASK_FAILED",
        message: blocker.message || "BOSS 页面状态阻止任务执行",
        task: summarizeBrowserTask(task),
        diagnostics: blocker.diagnostics || scan.diagnostics,
        page: {
          url: location.href,
          title: document.title
        }
      };
    }

    const target = findBrowserTaskTarget(task);
    if (!target) {
      const capture = await extractAndCache();
      return {
        ok: false,
        status: "FAILED",
        taskType: "CAPTURE_DETAIL",
        errorCode: "JOB_NOT_VISIBLE",
        message: "当前页面未找到该任务对应的可点击岗位",
        task: summarizeBrowserTask(task),
        diagnostics: capture.diagnostics,
        captureSummary: summarizeCaptureForTask(capture),
        page: {
          url: location.href,
          title: document.title
        }
      };
    }

    await clickJobTarget(target);
    await waitForDetailChange(target.fingerprint, 4200);
    await sleep(1000);
    const capture = await extractAndCache();
    const selected = capture.selectedDetail || {};
    const matchedJob = findMatchingJob(capture.jobs || [], selected) || findJobFromCaptureForTask(capture, task);
    const description = selected.description || matchedJob?.description || "";
    const success = hasUsableDescription({ description });

    return {
      ok: success,
      status: success ? "SUCCEEDED" : "FAILED",
      taskType: "CAPTURE_DETAIL",
      errorCode: success ? "" : "DETAIL_EMPTY",
      message: success ? "岗位详情已采集" : "已打开岗位，但未采集到可用 JD",
      task: summarizeBrowserTask(task),
      target: {
        title: target.title || "",
        url: target.url || ""
      },
      selectedDetail: {
        jobId: selected.jobId || matchedJob?.jobId || "",
        title: selected.title || matchedJob?.title || "",
        company: selected.company || matchedJob?.company || "",
        detailUrl: selected.detailUrl || matchedJob?.detailUrl || "",
        descriptionLength: String(description || "").trim().length
      },
      captureSummary: summarizeCaptureForTask(capture),
      page: {
        url: location.href,
        title: document.title
      }
    };
  }

  async function ensureGreetingTaskTargetVisible(task) {
    if (!hasGreetingTaskIdentity(task)) {
      return createGreetingTaskResult(task, {
        ok: false,
        errorCode: "PAGE_MISMATCH",
        message: "SEND_GREETING dry-run has no job identity; refusing to stage text on an arbitrary BOSS page.",
        diagnostics: getPageDiagnostics(findJobCards())
      });
    }

    if (currentPageMatchesBrowserTask(task)) {
      return { ok: true };
    }

    const target = findBrowserTaskTarget(task);
    if (!target) {
      const capture = await extractAndCache();
      if (captureSelectedDetailMatchesTask(capture, task)) {
        return { ok: true };
      }
      return createGreetingTaskResult(task, {
        ok: false,
        errorCode: "PAGE_MISMATCH",
        message: "Current BOSS page does not show the SEND_GREETING job. Open the matching job detail/chat page before running dry-run.",
        diagnostics: capture.diagnostics,
        captureSummary: summarizeCaptureForTask(capture)
      });
    }

    await clickJobTarget(target);
    await waitForDetailChange(target.fingerprint, 4200);
    await sleep(1000);
    const capture = await extractAndCache();
    if (captureSelectedDetailMatchesTask(capture, task) || currentPageMatchesBrowserTask(task)) {
      return { ok: true };
    }

    return createGreetingTaskResult(task, {
      ok: false,
      errorCode: "PAGE_MISMATCH",
      message: "Clicked the visible job target, but the loaded detail did not match the SEND_GREETING task.",
      diagnostics: capture.diagnostics,
      captureSummary: summarizeCaptureForTask(capture)
    });
  }

  function currentPageMatchesBrowserTask(task) {
    const desired = getDesiredTaskKeys(task);
    const payload = getTaskPayload(task);
    const detailUrl = normalizeUrl(payload.detailUrl || task.detailUrl || "", location.href);
    const taskJobId = cleanText(payload.jobId || payload.bossJobId || task.bossJobId || extractJobId(detailUrl));
    const currentUrl = normalizeUrl(location.href, location.href);
    const currentJobId = extractJobId(currentUrl);
    if (taskJobId && currentJobId && taskJobId === currentJobId) {
      return true;
    }
    if (detailUrl && currentUrl && detailUrl === currentUrl) {
      return true;
    }
    const selected = extractSelectedDetail(location.href);
    if (!selected) {
      return false;
    }
    const keys = getJobCandidateKeys(selected);
    return keys.some((key) => desired.strict.has(key) || desired.loose.has(key));
  }

  function captureSelectedDetailMatchesTask(capture, task) {
    const selected = capture?.selectedDetail || null;
    if (!selected) {
      return false;
    }
    const desired = getDesiredTaskKeys(task);
    return getJobCandidateKeys(selected).some((key) => desired.strict.has(key) || desired.loose.has(key));
  }

  function hasGreetingTaskIdentity(task) {
    const payload = getTaskPayload(task);
    return Boolean(
      cleanText(payload.jobId || payload.bossJobId || task?.bossJobId || "")
      || cleanText(payload.detailUrl || task?.detailUrl || "")
      || (cleanText(payload.title || task?.title || "") && cleanText(payload.company || task?.company || ""))
    );
  }

  function getGreetingPageBlocker(diagnostics = {}) {
    if (!/zhipin\.com$/i.test(location.hostname) && !/\.zhipin\.com$/i.test(location.hostname)) {
      return {
        errorCode: "PAGE_MISMATCH",
        message: "Current tab is not a BOSS/Zhipin page."
      };
    }
    if (diagnostics.captchaRequired) {
      return {
        errorCode: "SECURITY_CHECK",
        message: "BOSS security verification is visible; dry-run is paused for manual handling."
      };
    }
    if (diagnostics.loginRequired) {
      return {
        errorCode: "LOGIN_REQUIRED",
        message: "BOSS login state appears invalid; dry-run cannot stage the greeting."
      };
    }
    return null;
  }

  function createGreetingTaskResult(task, options = {}) {
    const ok = Boolean(options.ok);
    return {
      ok,
      status: ok ? "SUCCEEDED" : "FAILED",
      taskType: "SEND_GREETING",
      errorCode: options.errorCode || "",
      statusReason: options.statusReason || options.errorCode || "",
      message: options.message || "",
      task: summarizeBrowserTask(task),
      diagnostics: options.diagnostics || getPageDiagnostics(findJobCards()),
      captureSummary: options.captureSummary || null,
      dryRun: {
        noRealBossAction: true,
        clickedSend: false,
        staged: Boolean(options.dryRun?.staged),
        clickedEntry: Boolean(options.dryRun?.clickedEntry),
        messageLength: Number(options.dryRun?.messageLength || 0),
        sendButtonText: options.dryRun?.sendButtonText || ""
      },
      page: {
        url: location.href,
        title: document.title
      }
    };
  }

  function findGreetingInput() {
    const selectors = [
      ".chat-input textarea",
      ".chat-input [contenteditable='true']",
      "[class*='chat'] textarea",
      "[class*='chat'] [contenteditable='true']",
      "[class*='message'] textarea",
      "[class*='message'] [contenteditable='true']",
      "[class*='im'] textarea",
      "[class*='im'] [contenteditable='true']",
      "[class*='dialog'] textarea",
      "[class*='dialog'] [contenteditable='true']",
      "[class*='input'] textarea",
      "[role='textbox']",
      "textarea",
      "input[type='text']",
      "[contenteditable='true']"
    ];

    const candidates = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (seen.has(element) || !isGreetingInputCandidate(element)) {
          continue;
        }
        seen.add(element);
        candidates.push({
          element,
          score: scoreGreetingInput(element)
        });
      }
    }

    candidates.sort((left, right) => right.score - left.score);
    return candidates[0]?.score >= 30 ? candidates[0].element : null;
  }

  function isGreetingInputCandidate(element) {
    if (!(element instanceof HTMLElement) || !isVisible(element)) {
      return false;
    }
    if (element.matches("input") && element.getAttribute("type") !== "text") {
      return false;
    }
    if (element.matches("input, textarea") && (element.disabled || element.readOnly)) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 18) {
      return false;
    }
    const label = getElementLabel(element).toLowerCase();
    if (/search|filter|query|keyword|city|salary/.test(label)) {
      return false;
    }
    return true;
  }

  function scoreGreetingInput(element) {
    const rect = element.getBoundingClientRect();
    const label = getElementLabel(element).toLowerCase();
    let score = 0;
    if (element.matches("textarea")) {
      score += 30;
    }
    if (element.getAttribute("contenteditable") === "true") {
      score += 24;
    }
    if (/chat|message|im|dialog|reply|input|textarea/.test(label)) {
      score += 18;
    }
    if (/\u8f93\u5165|\u6d88\u606f|\u804a/.test(label)) {
      score += 12;
    }
    if (rect.top > window.innerHeight * 0.45) {
      score += 8;
    }
    score += Math.min(10, Math.round(rect.width / 120));
    return score;
  }

  function isCurrentPageChatContext() {
    const url = location.href.toLowerCase();
    if (/\/chat|\/im|\/message/.test(url)) {
      return true;
    }
    const bodyText = document.body ? cleanText(document.body.innerText || "") : "";
    return Boolean(
      document.querySelector("[class*='chat'], [class*='message'], [class*='im']")
      && /[\u6d88\u606f\u804a\u53d1\u9001]/.test(bodyText)
    );
  }

  function findSafeGreetingEntry() {
    const selectors = [
      "a[href*='/web/geek/chat']",
      "a[href*='/chat']",
      "[data-url*='/web/geek/chat']",
      "[data-url*='/chat']"
    ];
    const candidates = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (seen.has(element) || !(element instanceof HTMLElement) || !isVisible(element)) {
          continue;
        }
        seen.add(element);
        const href = cleanText(element.getAttribute("href") || element.getAttribute("data-url") || "");
        const label = getElementLabel(element);
        if (!/\/chat/.test(href) || isUnsafeGreetingActionLabel(label)) {
          continue;
        }
        candidates.push(element);
      }
    }
    return candidates[0] || null;
  }

  function isUnsafeGreetingActionLabel(value) {
    const label = cleanText(value).toLowerCase();
    return /send|submit|apply|upload/.test(label)
      || /[\u53d1\u9001\u6295\u9012]/.test(label)
      || /\u7acb\u5373\u6c9f\u901a|\u5f00\u59cb\u6c9f\u901a/.test(label);
  }

  async function clickGreetingEntry(element) {
    element.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth"
    });
    await sleep(250);
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
    element.click();
  }

  async function waitForGreetingInput(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const input = findGreetingInput();
      if (input) {
        return input;
      }
      await sleep(180);
    }
    return null;
  }

  function stageGreetingMessage(input, messageText) {
    input.focus();
    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      setNativeInputValue(input, messageText);
      dispatchEditableEvents(input, messageText);
      return;
    }

    if (input.getAttribute("contenteditable") === "true") {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      selection.removeAllRanges();
      selection.addRange(range);
      let inserted = false;
      try {
        inserted = document.execCommand("insertText", false, messageText);
      } catch {
        inserted = false;
      }
      if (!inserted) {
        input.textContent = messageText;
      }
      dispatchEditableEvents(input, messageText);
    }
  }

  function setNativeInputValue(input, value) {
    const prototype = input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
  }

  function dispatchEditableEvents(element, value) {
    element.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: value
    }));
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: value
    }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findGreetingSendButton(input) {
    const roots = [
      input.closest("form"),
      input.closest("[class*='chat']"),
      input.closest("[class*='message']"),
      input.closest("[class*='im']"),
      input.closest("[class*='dialog']"),
      document.body
    ].filter(Boolean);
    const seen = new Set();
    const candidates = [];
    for (const root of roots) {
      for (const element of root.querySelectorAll("button, [role='button'], [class*='send']")) {
        if (seen.has(element) || !(element instanceof HTMLElement) || !isVisible(element)) {
          continue;
        }
        seen.add(element);
        if (element.matches("button") && element.disabled) {
          continue;
        }
        const label = getElementLabel(element);
        const lowerLabel = label.toLowerCase();
        const className = String(element.className || "").toLowerCase();
        const looksSend = /send|submit/.test(lowerLabel)
          || /send/.test(className)
          || /\u53d1\u9001/.test(label);
        if (!looksSend) {
          continue;
        }
        candidates.push({
          element,
          score: scoreSendButtonNearInput(element, input)
        });
      }
    }
    candidates.sort((left, right) => right.score - left.score);
    return candidates[0]?.element || null;
  }

  function scoreSendButtonNearInput(button, input) {
    const buttonRect = button.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const verticalDistance = Math.abs((buttonRect.top + buttonRect.height / 2) - (inputRect.top + inputRect.height / 2));
    const horizontalDistance = Math.abs((buttonRect.left + buttonRect.width / 2) - (inputRect.left + inputRect.width / 2));
    return 100 - Math.min(80, verticalDistance / 4) - Math.min(20, horizontalDistance / 80);
  }

  function markGreetingDryRunElement(element) {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    element.dataset.bossFindDryRun = "SEND_GREETING";
    element.style.outline = "2px solid #2563eb";
    element.style.outlineOffset = "2px";
  }

  function getGreetingDomDiagnostics() {
    return {
      inputCandidates: document.querySelectorAll("textarea, input[type='text'], [contenteditable='true']").length,
      safeEntryCandidates: document.querySelectorAll("a[href*='/chat'], [data-url*='/chat']").length,
      sendButtonCandidates: document.querySelectorAll("button, [role='button'], [class*='send']").length,
      currentUrl: location.href
    };
  }

  function extractConversationSnapshot() {
    const roots = findConversationRoots();
    const messages = extractConversationMessages(roots);
    const recruiterName = findRecruiterNameFromConversation(roots);
    const hasInput = Boolean(findGreetingInput());
    const chatOpened = isCurrentPageChatContext() || roots.length > 0 || messages.length > 0 || hasInput;
    const bodyText = document.body ? cleanText(document.body.innerText || "") : "";
    const requiresReply = /[\u5bf9\u65b9\u56de\u590d\u540e|\u7b49\u5f85\u5bf9\u65b9|\u7b49\u5f85\u56de\u590d]/.test(bodyText);
    return {
      status: chatOpened ? "CHAT_OPENED" : "CONVERSATION_UNKNOWN",
      chatOpened,
      messageCount: messages.length,
      recentMessages: messages.slice(-8),
      recruiterName,
      conversationUrl: location.href,
      inputVisible: hasInput,
      requiresReply,
      confidence: computeConversationConfidence({ chatOpened, messages, hasInput, roots })
    };
  }

  function extractResumeUnlockSnapshot() {
    const actionCandidates = findResumeActionCandidates();
    const uploadInputs = Array.from(document.querySelectorAll("input[type='file']"))
      .filter((element) => element instanceof HTMLInputElement && !element.disabled);
    const unlockedCandidates = actionCandidates.filter((item) => item.enabled && item.unlockSignal);
    const lockedCandidates = actionCandidates.filter((item) => item.lockSignal || !item.enabled);
    const unlocked = unlockedCandidates.length > 0 || uploadInputs.length > 0;
    return {
      status: unlocked ? "RESUME_UNLOCKED" : "RESUME_LOCKED_OR_UNKNOWN",
      unlocked,
      hasAnyResumeAction: actionCandidates.length > 0 || uploadInputs.length > 0,
      actionCandidates: actionCandidates.slice(0, 12),
      uploadInputCount: uploadInputs.length,
      lockedSignalCount: lockedCandidates.length,
      confidence: computeResumeUnlockConfidence({ unlockedCandidates, uploadInputs, lockedCandidates, actionCandidates })
    };
  }

  function extractUploadResumeDryRunSnapshot() {
    const fileInputs = findFileInputCandidates();
    const resumeActions = findResumeActionCandidates();
    const uploadActions = resumeActions.filter((item) => item.enabled && item.unlockSignal);
    const fileInputUsable = fileInputs.some((item) => item.enabled);
    const uploadActionVisible = uploadActions.length > 0;
    return {
      status: fileInputUsable || uploadActionVisible ? "UPLOAD_DRY_RUN_READY" : "UPLOAD_ENTRY_NOT_FOUND",
      fileInputUsable,
      uploadActionVisible,
      fileInputCount: fileInputs.length,
      fileInputs: fileInputs.slice(0, 8),
      uploadActions: uploadActions.slice(0, 8),
      actionCandidates: resumeActions.slice(0, 12),
      noRealBossAction: true,
      fileSelected: false,
      uploaded: false,
      submitted: false,
      confidence: computeUploadDryRunConfidence({ fileInputs, uploadActions, resumeActions })
    };
  }

  function extractSubmitApplicationDryRunSnapshot() {
    const actionCandidates = findSubmitActionCandidates();
    const confirmationCandidates = findSubmitConfirmationCandidates();
    const readyActions = actionCandidates.filter((item) => item.enabled && item.submitSignal);
    const lockedActions = actionCandidates.filter((item) => item.lockSignal || !item.enabled);
    const submitActionVisible = readyActions.length > 0;
    const lockedSignalVisible = lockedActions.length > 0 && !submitActionVisible;
    return {
      status: submitActionVisible && !lockedSignalVisible ? "SUBMIT_DRY_RUN_READY" : "SUBMIT_ENTRY_NOT_READY",
      submitActionVisible,
      lockedSignalVisible,
      confirmationVisible: confirmationCandidates.length > 0,
      actionCandidates: actionCandidates.slice(0, 12),
      confirmationCandidates: confirmationCandidates.slice(0, 8),
      readyActions: readyActions.slice(0, 8),
      lockedActions: lockedActions.slice(0, 8),
      noRealBossAction: true,
      clickedSubmit: false,
      confirmed: false,
      submitted: false,
      uploaded: false,
      confidence: computeSubmitDryRunConfidence({ readyActions, lockedActions, confirmationCandidates, actionCandidates })
    };
  }

  function findConversationRoots() {
    const selectors = [
      "[class*='chat']",
      "[class*='message']",
      "[class*='im']",
      "[class*='dialog']",
      "[class*='conversation']"
    ];
    const roots = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (seen.has(element) || !(element instanceof HTMLElement) || !isVisible(element)) {
          continue;
        }
        const text = getMultilineText(element);
        if (!text || text.length < 4) {
          continue;
        }
        seen.add(element);
        roots.push(element);
      }
    }
    return roots
      .sort((left, right) => getMultilineText(right).length - getMultilineText(left).length)
      .slice(0, 5);
  }

  function extractConversationMessages(roots) {
    const selectors = [
      "[class*='message']",
      "[class*='msg']",
      "[class*='bubble']",
      "[class*='item']",
      "li"
    ];
    const messages = [];
    const seen = new Set();
    for (const root of roots) {
      for (const selector of selectors) {
        for (const element of root.querySelectorAll(selector)) {
          if (seen.has(element) || !(element instanceof HTMLElement) || !isVisible(element)) {
            continue;
          }
          seen.add(element);
          const text = cleanMultiline(getMultilineText(element));
          if (!isConversationMessageText(text)) {
            continue;
          }
          messages.push({
            text: text.slice(0, 500),
            direction: inferMessageDirection(element),
            timestamp: inferMessageTimestamp(text)
          });
        }
      }
    }
    return dedupeConversationMessages(messages).slice(-20);
  }

  function isConversationMessageText(text) {
    if (!text || text.length < 2 || text.length > 800) {
      return false;
    }
    if (/job_detail|zhipin\.com|https?:\/\//i.test(text)) {
      return false;
    }
    if (/[\u804c\u4f4d\u63cf\u8ff0\u4efb\u804c\u8981\u6c42]/.test(text) && text.length > 120) {
      return false;
    }
    return /[\u4e00-\u9fffA-Za-z0-9]/.test(text);
  }

  function dedupeConversationMessages(messages) {
    const seen = new Set();
    const result = [];
    for (const message of messages) {
      const key = `${message.direction}|${message.text}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(message);
    }
    return result;
  }

  function inferMessageDirection(element) {
    const label = getElementLabel(element).toLowerCase();
    if (/self|mine|right|sent|out/.test(label) || /[\u6211]/.test(label)) {
      return "OUTBOUND";
    }
    if (/boss|recruiter|left|received|in/.test(label)) {
      return "INBOUND";
    }
    const rect = element.getBoundingClientRect();
    return rect.left > window.innerWidth * 0.45 ? "OUTBOUND" : "UNKNOWN";
  }

  function inferMessageTimestamp(text) {
    const match = String(text || "").match(/(?:\d{1,2}:\d{2}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/);
    return match ? match[0] : "";
  }

  function findRecruiterNameFromConversation(roots) {
    const candidates = [];
    for (const root of roots) {
      for (const selector of ["[class*='name']", "[class*='boss']", "[class*='recruiter']", "h1", "h2", "h3"]) {
        for (const element of root.querySelectorAll(selector)) {
          const text = cleanText(element.textContent || "");
          if (text && text.length >= 2 && text.length <= 30) {
            candidates.push(text);
          }
        }
      }
    }
    return candidates.find((item) => !/[\u804c\u4f4d\u85aa\u8d44]/.test(item)) || "";
  }

  function findResumeActionCandidates() {
    const selectors = [
      "button",
      "a",
      "[role='button']",
      "[class*='btn']",
      "[class*='upload']",
      "[class*='resume']"
    ];
    const candidates = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (seen.has(element) || !(element instanceof HTMLElement) || !isVisible(element)) {
          continue;
        }
        seen.add(element);
        const label = getElementLabel(element);
        if (!isResumeActionLabel(label)) {
          continue;
        }
        const enabled = isActionElementEnabled(element);
        candidates.push({
          label: label.slice(0, 120),
          enabled,
          unlockSignal: enabled && isResumeUnlockLabel(label),
          lockSignal: isResumeLockedLabel(label),
          selectorHint: getSelectorHint(element)
        });
      }
    }
    return candidates;
  }

  function findFileInputCandidates() {
    return Array.from(document.querySelectorAll("input[type='file']")).map((element) => {
      const input = element instanceof HTMLInputElement ? element : null;
      const label = findLabelForInput(input);
      return {
        enabled: Boolean(input && !input.disabled),
        visible: input ? isVisible(input) : false,
        accept: input ? cleanText(input.accept || "") : "",
        multiple: Boolean(input?.multiple),
        label: label.slice(0, 120),
        selectorHint: input ? getSelectorHint(input) : ""
      };
    });
  }

  function findLabelForInput(input) {
    if (!input) {
      return "";
    }
    const id = cleanText(input.id || "");
    if (id) {
      const label = document.querySelector(`label[for='${CSS.escape(id)}']`);
      if (label) {
        return getElementLabel(label);
      }
    }
    const parent = input.closest("label, [class*='upload'], [class*='resume'], [class*='file']");
    return parent ? getElementLabel(parent) : "";
  }

  function findSubmitActionCandidates() {
    const selectors = [
      "button",
      "a",
      "[role='button']",
      "[class*='btn']",
      "[class*='submit']",
      "[class*='apply']",
      "[class*='deliver']"
    ];
    const candidates = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (seen.has(element) || !(element instanceof HTMLElement) || !isVisible(element)) {
          continue;
        }
        seen.add(element);
        const label = getElementLabel(element);
        if (!isSubmitActionLabel(label)) {
          continue;
        }
        const enabled = isActionElementEnabled(element);
        candidates.push({
          label: label.slice(0, 120),
          enabled,
          submitSignal: enabled && isSubmitReadyLabel(label),
          lockSignal: isSubmitLockedLabel(label),
          selectorHint: getSelectorHint(element)
        });
      }
    }
    return candidates;
  }

  function findSubmitConfirmationCandidates() {
    const selectors = [
      "[role='dialog']",
      "[class*='dialog']",
      "[class*='modal']",
      "[class*='confirm']",
      ".toast",
      ".popover"
    ];
    const candidates = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (seen.has(element) || !(element instanceof HTMLElement) || !isVisible(element)) {
          continue;
        }
        seen.add(element);
        const label = getElementLabel(element);
        if (!/confirm|submit|apply|deliver|resume|确认|提交|投递|发送|简历/.test(label)) {
          continue;
        }
        candidates.push({
          label: label.slice(0, 200),
          selectorHint: getSelectorHint(element)
        });
      }
    }
    return candidates;
  }

  function isResumeActionLabel(label) {
    return /resume|upload|apply|deliver|attachment|submit/i.test(label)
      || /[\u7b80\u5386\u4e0a\u4f20\u9644\u4ef6\u6295\u9012\u7533\u8bf7\u53d1\u9001]/.test(label);
  }

  function isResumeUnlockLabel(label) {
    return /upload|apply|deliver|submit|send/i.test(label)
      || /[\u4e0a\u4f20\u6295\u9012\u53d1\u9001\u9644\u4ef6]/.test(label);
  }

  function isResumeLockedLabel(label) {
    return /locked|disabled|after reply|wait/i.test(label)
      || /[\u672a\u89e3\u9501\u9700\u8981\u6c9f\u901a\u56de\u590d\u540e\u7b49\u5f85]/.test(label);
  }

  function isSubmitActionLabel(label) {
    return /apply|deliver|submit|send application|submit application/i.test(label)
      || /投递|提交|发送申请|立即申请|确认投递|投简历|发送简历/.test(label);
  }

  function isSubmitReadyLabel(label) {
    return /apply|deliver|submit|send application|submit application/i.test(label)
      || /投递|提交|发送申请|立即申请|确认投递|投简历|发送简历/.test(label);
  }

  function isSubmitLockedLabel(label) {
    return /locked|disabled|after reply|wait|not available|unavailable/i.test(label)
      || /未解锁|需沟通|沟通后|回复后|等待|不可投递|暂不可|未开放/.test(label);
  }

  function isActionElementEnabled(element) {
    if (element.matches("button, input") && element.disabled) {
      return false;
    }
    const ariaDisabled = cleanText(element.getAttribute("aria-disabled") || "").toLowerCase();
    if (ariaDisabled === "true") {
      return false;
    }
    const className = String(element.className || "").toLowerCase();
    if (/disabled|disable|locked|lock/.test(className)) {
      return false;
    }
    return true;
  }

  function getSelectorHint(element) {
    const tag = element.tagName ? element.tagName.toLowerCase() : "node";
    const id = cleanText(element.id || "");
    const className = cleanText(String(element.className || "")).split(" ").filter(Boolean).slice(0, 3).join(".");
    return [tag, id ? `#${id}` : "", className ? `.${className}` : ""].join("");
  }

  function computeConversationConfidence({ chatOpened, messages, hasInput, roots }) {
    let score = 0;
    if (chatOpened) {
      score += 0.35;
    }
    if (messages.length) {
      score += Math.min(0.35, messages.length * 0.08);
    }
    if (hasInput) {
      score += 0.15;
    }
    if (roots.length) {
      score += 0.15;
    }
    return Math.min(1, Number(score.toFixed(2)));
  }

  function computeResumeUnlockConfidence({ unlockedCandidates, uploadInputs, lockedCandidates, actionCandidates }) {
    let score = 0;
    if (unlockedCandidates.length) {
      score += 0.55;
    }
    if (uploadInputs.length) {
      score += 0.3;
    }
    if (actionCandidates.length) {
      score += 0.1;
    }
    if (lockedCandidates.length && !unlockedCandidates.length && !uploadInputs.length) {
      score = Math.max(0.2, score - 0.2);
    }
    return Math.min(1, Number(score.toFixed(2)));
  }

  function computeUploadDryRunConfidence({ fileInputs, uploadActions, resumeActions }) {
    let score = 0;
    if (fileInputs.some((item) => item.enabled)) {
      score += 0.5;
    }
    if (fileInputs.some((item) => /pdf|doc|word|document|msword|officedocument/i.test(item.accept || ""))) {
      score += 0.15;
    }
    if (uploadActions.length) {
      score += 0.25;
    }
    if (resumeActions.length) {
      score += 0.1;
    }
    return Math.min(1, Number(score.toFixed(2)));
  }

  function computeSubmitDryRunConfidence({ readyActions, lockedActions, confirmationCandidates, actionCandidates }) {
    let score = 0;
    if (readyActions.length) {
      score += 0.6;
    }
    if (confirmationCandidates.length) {
      score += 0.15;
    }
    if (actionCandidates.length) {
      score += 0.1;
    }
    if (lockedActions.length && !readyActions.length) {
      score = Math.max(0.2, score - 0.2);
    }
    return Math.min(1, Number(score.toFixed(2)));
  }

  function getConversationDomDiagnostics() {
    return {
      chatLikeNodes: document.querySelectorAll("[class*='chat'], [class*='message'], [class*='im'], [class*='dialog']").length,
      buttonCount: document.querySelectorAll("button, [role='button']").length,
      fileInputCount: document.querySelectorAll("input[type='file']").length,
      currentUrl: location.href
    };
  }

  function findBrowserTaskTarget(task) {
    const desired = getDesiredTaskKeys(task);
    const cards = findJobCards();
    const fallbackTargets = [];

    for (const card of cards) {
      const clickable = findClickableJobElement(card);
      if (!clickable) {
        continue;
      }
      const job = extractJobFromCard(card, location.href);
      if (!isValidJobRecord(job)) {
        continue;
      }
      const keys = getJobCandidateKeys(job);
      const target = {
        key: getJobKey(job),
        element: clickable,
        title: job.title,
        url: job.detailUrl,
        fingerprint: job.jobId || job.detailUrl || job.title || getMultilineText(card).slice(0, 120),
        beforeText: getCurrentDetailFingerprint()
      };
      if (keys.some((key) => desired.strict.has(key))) {
        return target;
      }
      if (keys.some((key) => desired.loose.has(key))) {
        fallbackTargets.push(target);
      }
    }

    return fallbackTargets[0] || null;
  }

  function getDesiredTaskKeys(task) {
    const payload = getTaskPayload(task);
    const detailUrl = normalizeUrl(payload.detailUrl || task.detailUrl || "", location.href);
    const bossJobId = cleanText(payload.jobId || payload.bossJobId || task.bossJobId || extractJobId(detailUrl));
    const title = cleanText(payload.title || task.title || "");
    const company = cleanText(payload.company || task.company || "");
    const salary = cleanText(payload.salary || task.salary || "");
    const locationText = cleanText(payload.location || task.location || "");
    return {
      strict: new Set([
        bossJobId,
        detailUrl,
        extractJobId(detailUrl)
      ].map(cleanText).filter(Boolean)),
      loose: new Set([
        [title, company, salary, locationText].map(cleanText).filter(Boolean).join("|").toLowerCase(),
        [title, company].map(cleanText).filter(Boolean).join("|").toLowerCase()
      ].filter(Boolean))
    };
  }

  function getJobCandidateKeys(job) {
    const detailUrl = normalizeUrl(job?.detailUrl || job?.url || "", location.href);
    return [
      cleanText(job?.jobId || ""),
      extractJobId(detailUrl),
      detailUrl,
      [job?.title, job?.company, job?.salary, job?.location].map(cleanText).filter(Boolean).join("|").toLowerCase(),
      [job?.title, job?.company].map(cleanText).filter(Boolean).join("|").toLowerCase()
    ].map(cleanText).filter(Boolean);
  }

  function findJobFromCaptureForTask(capture, task) {
    const desired = getDesiredTaskKeys(task);
    return (capture?.jobs || []).find((job) => {
      const keys = getJobCandidateKeys(job);
      return keys.some((key) => desired.strict.has(key) || desired.loose.has(key));
    }) || null;
  }

  function summarizeBrowserTask(task) {
    const payload = getTaskPayload(task);
    return {
      id: Number(task?.id || 0),
      applicationId: task?.applicationId ?? null,
      taskType: task?.taskType || "",
      title: task?.title || payload.title || "",
      company: task?.company || payload.company || "",
      detailUrl: task?.detailUrl || payload.detailUrl || ""
    };
  }

  function summarizeCaptureForTask(capture) {
    return {
      jobCount: capture?.jobs?.length || 0,
      describedJobCount: (capture?.jobs || []).filter((job) => hasUsableDescription(job)).length,
      selectedDetailTitle: capture?.selectedDetail?.title || "",
      selectedDescriptionLength: String(capture?.selectedDetail?.description || "").trim().length
    };
  }

  function startAutoCrawl(options) {
    if (autoCrawlState.running) {
      return autoCrawlState;
    }

    const delayMs = clampNumber(options.delayMs, 800, 8000, 1600);
    const maxJobs = clampNumber(options.maxJobs, 1, 100, 30);
    seedAutoCrawlProgress(options);
    stopAutoCrawlRequested = false;
    autoCrawlState = {
      running: true,
      status: "running",
      total: 0,
      current: 0,
      captured: 0,
      described: 0,
      failed: 0,
      skipped: 0,
      blocked: false,
      blockingReason: "",
      loginRequired: false,
      captchaRequired: false,
      selectorChanged: false,
      visibleTargets: 0,
      pendingTargets: 0,
      visibleSkipped: 0,
      attempted: autoCrawlAttemptedKeys.size,
      scrollCount: 0,
      idleScrolls: 0,
      lastAction: "preparing",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      message: "正在准备岗位列表",
      lastJobTitle: "",
      errors: []
    };

    runAutoCrawl({ delayMs, maxJobs }).catch((error) => {
      autoCrawlState.running = false;
      autoCrawlState.status = "error";
      autoCrawlState.finishedAt = new Date().toISOString();
      autoCrawlState.message = error.message || String(error);
      autoCrawlState.lastAction = "error";
      autoCrawlState.errors.push(autoCrawlState.message);
    });

    return autoCrawlState;
  }

  async function runAutoCrawl(options) {
    startWatch();
    autoCrawlState.total = options.maxJobs;
    await refreshKnownCrawlProgress();
    await extractAndCache();

    let idleScrolls = 0;
    let processedThisRun = 0;
    while (processedThisRun < options.maxJobs) {
      if (stopAutoCrawlRequested) {
        autoCrawlState.status = "stopped";
        autoCrawlState.message = "自动补齐已停止";
        break;
      }

      await refreshKnownCrawlProgress();
      const excludeKeys = getAutoCrawlExcludeKeys();
      const scan = scanAutoCrawlTargets({ excludeKeys });
      const target = scan.targets[0];
      updateAutoCrawlDiagnostics(scan, {
        skipped: excludeKeys.size,
        idleScrolls,
        lastAction: target ? "target_found" : "scan_empty"
      });
      autoCrawlState.skipped = excludeKeys.size;

      const blocker = getAutoCrawlBlocker(scan, { idleScrolls });
      if (blocker) {
        markAutoCrawlBlocked(blocker);
        await extractAndCache().catch(() => {});
        break;
      }

      if (!target) {
        if (idleScrolls >= 6) {
          autoCrawlState.lastAction = "idle_limit";
          autoCrawlState.message = processedThisRun
            ? `自动补齐已处理 ${processedThisRun} 个岗位，暂无新的可点击项`
            : "未找到待补齐的新岗位，已跳过已处理项";
          break;
        }

        const before = getListFingerprint();
        autoCrawlState.message = "正在向后滚动，等待 BOSS 加载更多岗位";
        autoCrawlState.lastAction = "scrolling";
        autoCrawlState.scrollCount += 1;
        scrollForMoreTargets();
        await sleep(Math.max(700, Math.min(options.delayMs, 1800)));
        const after = getListFingerprint();
        idleScrolls = after && after !== before ? 0 : idleScrolls + 1;
        autoCrawlState.idleScrolls = idleScrolls;
        continue;
      }

      idleScrolls = 0;
      const targetKey = target.key || target.fingerprint;
      autoCrawlAttemptedKeys.add(targetKey);
      processedThisRun += 1;
      autoCrawlState.current = processedThisRun;
      autoCrawlState.attempted = autoCrawlAttemptedKeys.size;
      autoCrawlState.idleScrolls = idleScrolls;
      autoCrawlState.lastJobTitle = target.title || "";
      autoCrawlState.lastAction = "clicking";
      autoCrawlState.message = `正在打开 ${processedThisRun}/${options.maxJobs}: ${target.title || "未命名岗位"}`;

      try {
        await clickJobTarget(target);
        autoCrawlState.lastAction = "waiting_detail";
        await waitForDetailChange(target.fingerprint, options.delayMs + 2200);
        await sleep(options.delayMs);
        autoCrawlState.lastAction = "capturing";
        const capture = await extractAndCache();
        updateKnownDescriptionsFromCapture(capture, target);
        autoCrawlState.captured = capture.jobs.length;
        autoCrawlState.described = autoCrawlDescribedKeys.size;
        autoCrawlState.lastAction = "captured";
      } catch (error) {
        autoCrawlState.failed += 1;
        autoCrawlState.lastAction = "error";
        autoCrawlState.errors.push(`${target.title || target.url || processedThisRun}: ${error.message || String(error)}`);
      }
    }

    if (!stopAutoCrawlRequested && autoCrawlState.status !== "blocked") {
      autoCrawlState.status = "done";
      autoCrawlState.lastAction = "done";
      autoCrawlState.message = `自动补齐完成：本次处理 ${processedThisRun} 个，已跳过 ${autoCrawlState.skipped} 个已处理岗位`;
    }
    autoCrawlState.running = false;
    autoCrawlState.finishedAt = new Date().toISOString();

    await chrome.runtime.sendMessage({
      type: "SYNC_CACHE"
    }).catch(() => {});
  }

  function startWatch() {
    if (observer) {
      return;
    }

    observer = new MutationObserver(() => {
      clearTimeout(observeTimer);
      observeTimer = setTimeout(() => {
        extractAndCache().catch(() => {});
      }, 700);
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true
    });
  }

  function stopWatch() {
    clearTimeout(observeTimer);
    observeTimer = null;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  async function extractAndCache() {
    const capture = extractPage();
    const fingerprint = JSON.stringify({
      url: capture.page.url,
      jobs: capture.jobs.map((job) => [job.jobId, job.title, job.company, Boolean(job.description)]),
      detail: capture.selectedDetail?.jobId || capture.selectedDetail?.title || ""
    });

    if (fingerprint !== lastCaptureFingerprint) {
      lastCaptureFingerprint = fingerprint;
      await chrome.runtime.sendMessage({
        type: "CACHE_CAPTURE",
        capture
      });
    }

    return capture;
  }

  function extractPage() {
    const page = {
      url: location.href,
      title: document.title,
      capturedAt: new Date().toISOString()
    };

    const cards = findJobCards();
    const jobs = dedupeJobs(cards.map((card) => extractJobFromCard(card, page.url)));
    const selectedDetail = extractSelectedDetail(page.url);

    if (selectedDetail) {
      const match = findMatchingJob(jobs, selectedDetail);
      if (match) {
        mergeDetailIntoJob(match, selectedDetail);
      }
    }

    return {
      source: "boss-zhipin-dom",
      page,
      diagnostics: getPageDiagnostics(cards),
      selectedDetail,
      jobs,
      stats: {
        cardCount: cards.length,
        jobCount: jobs.length,
        describedJobCount: jobs.filter((job) => Boolean(job.description)).length,
        watching: Boolean(observer)
      }
    };
  }

  function getPageDiagnostics(cards) {
    const bodyText = document.body ? cleanText(document.body.innerText || "") : "";
    const lowerUrl = location.href.toLowerCase();
    const selectorCounts = getSelectorCounts();
    const loginRequired = /login|signin|passport|\/web\/user\//.test(lowerUrl)
      || /登录|注册|扫码登录|手机号登录/.test(bodyText);
    const captchaRequired = /security|captcha|verify/.test(lowerUrl)
      || /验证码|安全验证|滑块|请完成验证|异常访问|访问过于频繁|请稍候|人机验证|访问验证/.test(bodyText);
    return {
      url: location.href,
      title: document.title,
      loginRequired,
      captchaRequired,
      selectorCounts,
      cardCount: cards.length,
      bodySample: bodyText.slice(0, 500)
    };
  }

  function getSelectorCounts() {
    return {
      jobCardWrapper: document.querySelectorAll(".job-card-wrapper").length,
      jobCardBody: document.querySelectorAll(".job-card-body").length,
      jobPrimary: document.querySelectorAll(".job-primary").length,
      jobDetailLinks: document.querySelectorAll("a[href*='/job_detail/']").length,
      fileInputs: document.querySelectorAll("input[type='file']").length
    };
  }

  function findJobCards() {
    const selectors = [
      ".job-card-wrapper",
      ".job-card-body",
      ".job-primary",
      ".job-list-box li",
      "[class*='job-card']",
      "[class*='job-primary']"
    ];

    const cards = [];
    const seen = new Set();

    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        addCard(element, seen, cards);
      }
    }

    for (const link of document.querySelectorAll("a[href*='/job_detail/']")) {
      const card = link.closest(".job-card-wrapper, .job-card-body, .job-primary, li, [class*='job-card']");
      addCard(card || link, seen, cards);
    }

    return cards.filter((card) => {
      const text = getMultilineText(card);
      return text.length >= 10
        && hasJobDetailHref(card)
        && /job_detail|职位|薪|K|经验|学历|公司|招聘/i.test(`${text} ${getHref(card)}`);
    });
  }

  function scanAutoCrawlTargets(options = {}) {
    const cards = findJobCards();
    const seen = new Set();
    const targets = [];
    const excludeKeys = options.excludeKeys || new Set();
    const diagnostics = getPageDiagnostics(cards);
    let unclickableCount = 0;
    let invalidCount = 0;
    let duplicateCount = 0;
    let skippedKnownCount = 0;
    let skippedDescribedCount = 0;

    for (const card of cards) {
      const clickable = findClickableJobElement(card);
      if (!clickable) {
        unclickableCount += 1;
        continue;
      }

      const job = extractJobFromCard(card, location.href);
      if (!isValidJobRecord(job)) {
        invalidCount += 1;
        continue;
      }
      const fingerprint = job.jobId || job.detailUrl || job.title || getMultilineText(card).slice(0, 120);
      if (!fingerprint || seen.has(fingerprint)) {
        duplicateCount += 1;
        continue;
      }
      const key = getJobKey(job);
      if (!key || excludeKeys.has(key)) {
        skippedKnownCount += 1;
        continue;
      }
      if (hasUsableDescription(job)) {
        skippedDescribedCount += 1;
        continue;
      }
      seen.add(fingerprint);

      targets.push({
        key,
        element: clickable,
        title: job.title,
        url: job.detailUrl,
        fingerprint,
        beforeText: getCurrentDetailFingerprint()
      });
    }

    return {
      targets,
      diagnostics,
      visibleJobCount: cards.length,
      pendingTargetCount: targets.length,
      visibleSkippedCount: skippedKnownCount + skippedDescribedCount,
      skippedKnownCount,
      skippedDescribedCount,
      unclickableCount,
      invalidCount,
      duplicateCount
    };
  }

  function getAutoCrawlTargets(options = {}) {
    return scanAutoCrawlTargets(options).targets;
  }

  function updateAutoCrawlDiagnostics(scan, overrides = {}) {
    const diagnostics = scan.diagnostics || {};
    autoCrawlState.visibleTargets = scan.visibleJobCount || 0;
    autoCrawlState.pendingTargets = scan.pendingTargetCount || 0;
    autoCrawlState.visibleSkipped = scan.visibleSkippedCount || 0;
    autoCrawlState.skipped = overrides.skipped ?? autoCrawlState.skipped;
    autoCrawlState.attempted = autoCrawlAttemptedKeys.size;
    autoCrawlState.described = autoCrawlDescribedKeys.size;
    autoCrawlState.idleScrolls = overrides.idleScrolls ?? autoCrawlState.idleScrolls;
    autoCrawlState.lastAction = overrides.lastAction || autoCrawlState.lastAction;
    autoCrawlState.loginRequired = Boolean(diagnostics.loginRequired);
    autoCrawlState.captchaRequired = Boolean(diagnostics.captchaRequired);
    autoCrawlState.selectorChanged = Boolean(overrides.selectorChanged ?? autoCrawlState.selectorChanged);
  }

  function getAutoCrawlBlocker(scan, context = {}) {
    const diagnostics = scan.diagnostics || {};
    if (diagnostics.captchaRequired) {
      return {
        reason: "CAPTCHA_REQUIRED",
        action: "captcha_required",
        message: "BOSS 页面要求安全验证，已暂停自动补齐；请人工处理后重新开始",
        diagnostics
      };
    }
    if (diagnostics.loginRequired) {
      return {
        reason: "LOGIN_REQUIRED",
        action: "login_required",
        message: "BOSS 登录状态失效，已暂停自动补齐；请重新登录后再开始",
        diagnostics
      };
    }

    const selectorCounts = diagnostics.selectorCounts || {};
    const noVisibleJobs = Number(scan.visibleJobCount || 0) === 0;
    const noDetailLinks = Number(selectorCounts.jobDetailLinks || 0) === 0;
    if (context.idleScrolls >= 2 && noVisibleJobs && noDetailLinks && isBossJobLikePage(diagnostics)) {
      return {
        reason: "SELECTOR_CHANGED",
        action: "selector_changed",
        message: "未检测到岗位卡片或详情链接，已暂停自动补齐；请确认当前是岗位列表页或选择器是否需要更新",
        diagnostics
      };
    }
    return null;
  }

  function markAutoCrawlBlocked(blocker) {
    autoCrawlState.status = "blocked";
    autoCrawlState.blocked = true;
    autoCrawlState.blockingReason = blocker.reason || "";
    autoCrawlState.lastAction = blocker.action || "blocked";
    autoCrawlState.message = blocker.message || "自动补齐已暂停，需要人工处理";
    autoCrawlState.loginRequired = blocker.reason === "LOGIN_REQUIRED" || Boolean(blocker.diagnostics?.loginRequired);
    autoCrawlState.captchaRequired = blocker.reason === "CAPTCHA_REQUIRED" || Boolean(blocker.diagnostics?.captchaRequired);
    autoCrawlState.selectorChanged = blocker.reason === "SELECTOR_CHANGED";
    autoCrawlState.errors.push(autoCrawlState.message);
  }

  function isBossJobLikePage(diagnostics = {}) {
    const url = String(diagnostics.url || location.href || "").toLowerCase();
    return /zhipin\.com/.test(location.hostname)
      && (/\/web\/geek\/job|\/job_detail\/|\/web\/geek\/recommend|[?&]query=|[?&]city=/.test(url));
  }

  function findClickableJobElement(card) {
    const selectors = [
      "a[href*='/job_detail/']",
      ".job-name",
      ".job-title",
      "[class*='job-name']",
      "[class*='job-title']"
    ];

    for (const selector of selectors) {
      const element = card.matches?.(selector) ? card : card.querySelector?.(selector);
      if (element instanceof HTMLElement && isVisible(element)) {
        return element;
      }
    }

    return card instanceof HTMLElement && isVisible(card) ? card : null;
  }

  async function refreshKnownCrawlProgress() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_CACHE" });
      const jobs = response?.ok ? response.result?.jobs || [] : [];
      for (const job of jobs) {
        const key = getJobKey(job);
        if (key && hasUsableDescription(job)) {
          autoCrawlDescribedKeys.add(key);
        }
      }
      autoCrawlState.described = autoCrawlDescribedKeys.size;
      autoCrawlState.captured = jobs.length;
      autoCrawlState.attempted = autoCrawlAttemptedKeys.size;
    } catch {
      // Best-effort cache lookup; visible DOM scanning still works without it.
    }
  }

  function getAutoCrawlExcludeKeys() {
    return new Set([...autoCrawlAttemptedKeys, ...autoCrawlDescribedKeys]);
  }

  function updateKnownDescriptionsFromCapture(capture, target) {
    for (const job of capture?.jobs || []) {
      const key = getJobKey(job);
      if (key && hasUsableDescription(job)) {
        autoCrawlDescribedKeys.add(key);
      }
    }

    const selectedKey = getJobKey(capture?.selectedDetail || {});
    if (selectedKey && hasUsableDescription(capture?.selectedDetail || {})) {
      autoCrawlDescribedKeys.add(selectedKey);
    } else if (target?.key && hasUsableDescription(capture?.selectedDetail || {})) {
      autoCrawlDescribedKeys.add(target.key);
    }
  }

  function seedAutoCrawlProgress(options = {}) {
    for (const value of normalizeStringArray(options.completedJobKeys || [])) {
      autoCrawlDescribedKeys.add(value);
    }
    for (const value of normalizeStringArray(options.attemptedJobKeys || [])) {
      autoCrawlAttemptedKeys.add(value);
    }
  }

  function getJobKey(job) {
    const detailUrl = normalizeUrl(job?.detailUrl || job?.url || "", location.href);
    return cleanText(job?.jobId || extractJobId(detailUrl))
      || detailUrl
      || [job?.title, job?.company, job?.salary, job?.location].map(cleanText).filter(Boolean).join("|").toLowerCase();
  }

  function hasUsableDescription(job) {
    return cleanText(job?.description || "").length >= 50;
  }

  function getListFingerprint() {
    return findJobCards()
      .map((card) => {
        const job = extractJobFromCard(card, location.href);
        return getJobKey(job);
      })
      .filter(Boolean)
      .join("|");
  }

  function scrollForMoreTargets() {
    const containers = [
      document.querySelector(".job-list-box"),
      document.querySelector("[class*='job-list']"),
      document.scrollingElement,
      document.documentElement,
      document.body
    ].filter(Boolean);

    for (const container of containers) {
      const before = container.scrollTop;
      container.scrollBy?.({ top: Math.max(420, Math.floor(window.innerHeight * 0.75)), behavior: "smooth" });
      if (container.scrollTop !== before) {
        return;
      }
    }
    window.scrollBy({ top: Math.max(420, Math.floor(window.innerHeight * 0.75)), behavior: "smooth" });
  }

  async function clickJobTarget(target) {
    if (!target.element?.isConnected) {
      throw new Error("岗位元素已经不在页面中");
    }

    target.element.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth"
    });
    await sleep(250);

    const eventOptions = {
      bubbles: true,
      cancelable: true,
      view: window
    };
    target.element.dispatchEvent(new MouseEvent("mouseover", eventOptions));
    target.element.dispatchEvent(new MouseEvent("mousedown", eventOptions));
    target.element.dispatchEvent(new MouseEvent("mouseup", eventOptions));
    target.element.click();
  }

  async function waitForDetailChange(previousFingerprint, timeoutMs) {
    const startText = getCurrentDetailFingerprint();
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      await sleep(180);
      const currentText = getCurrentDetailFingerprint();
      if (currentText && currentText !== startText) {
        return;
      }
      if (currentText && currentText.includes(previousFingerprint)) {
        return;
      }
    }
  }

  function getCurrentDetailFingerprint() {
    const detail = extractSelectedDetail(location.href);
    if (!detail) {
      return "";
    }
    return [
      detail.jobId,
      detail.title,
      detail.company,
      detail.description
    ].filter(Boolean).join("|").slice(0, 500);
  }

  function addCard(element, seen, cards) {
    if (!element || !(element instanceof Element)) {
      return;
    }
    if (seen.has(element)) {
      return;
    }
    seen.add(element);
    cards.push(element);
  }

  function extractJobFromCard(card, pageUrl) {
    const rawText = getMultilineText(card);
    const lines = rawText.split("\n").filter(Boolean);
    const detailUrl = normalizeUrl(getHref(card), pageUrl);
    const tags = pickTexts(card, [
      ".tag-list span",
      ".job-tags span",
      ".info-desc",
      "[class*='tag'] span",
      "[class*='labels'] span"
    ]);

    const title = firstText(card, [
      ".job-name",
      ".job-title",
      ".name",
      "[class*='job-name']",
      "[class*='job-title']",
      "a[href*='/job_detail/']"
    ]) || inferTitle(lines);

    const salary = firstText(card, [
      ".salary",
      ".red",
      "[class*='salary']"
    ]) || inferSalary(rawText);

    const company = firstText(card, [
      ".company-name",
      ".company-text",
      "[class*='company-name']",
      "[class*='company'] a",
      "a[href*='/gongsi/']"
    ]) || inferCompany(lines, title);

    const recruiter = firstText(card, [
      ".boss-name",
      ".recruiter-name",
      "[class*='boss-name']",
      "[class*='recruiter']"
    ]);

    const location = firstText(card, [
      ".job-area",
      "[class*='job-area']",
      "[class*='location']"
    ]) || inferByPattern(lines, /(北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|西安|厦门|长沙|重庆|天津|郑州|合肥|佛山|东莞|远程)/);

    const experience = inferByPattern(lines, /(经验不限|在校\/应届|应届|[0-9]+年|[0-9]+-[0-9]+年|无需经验)/);
    const education = inferByPattern(lines, /(学历不限|大专|本科|硕士|博士|高中|中专)/);

    return {
      jobId: extractJobId(detailUrl),
      title,
      salary,
      company,
      location,
      experience,
      education,
      recruiter,
      tags,
      welfare: inferWelfare(lines),
      description: extractInlineDescription(card),
      detailUrl,
      rawText,
      capturedAt: new Date().toISOString()
    };
  }

  function extractSelectedDetail(pageUrl) {
    const root = findDetailRoot();
    if (!root) {
      return null;
    }

    const rawText = getMultilineText(root);
    if (!rawText || rawText.length < 20) {
      return null;
    }

    const detailHref = getHref(root);
    const detailUrl = normalizeUrl(detailHref || (/\/job_detail\//.test(location.pathname) ? location.href : ""), pageUrl);
    const title = firstText(root, [
      ".job-name",
      ".job-title",
      "h1",
      "[class*='job-name']",
      "[class*='job-title']"
    ]) || inferTitle(rawText.split("\n"));

    const salary = firstText(root, [
      ".salary",
      ".red",
      "[class*='salary']"
    ]) || inferSalary(rawText);

    const company = firstText(root, [
      ".company-name",
      ".company-text",
      "[class*='company-name']",
      "[class*='company'] a",
      "a[href*='/gongsi/']"
    ]);

    const description = extractDescription(root, rawText);
    const lines = rawText.split("\n").filter(Boolean);

    return {
      jobId: extractJobId(detailUrl),
      title,
      salary,
      company,
      location: firstText(root, [".location-address", ".job-address", ".job-area", "[class*='address']", "[class*='job-area']"]),
      experience: inferByPattern(lines, /(经验不限|在校\/应届|应届|[0-9]+年|[0-9]+-[0-9]+年|无需经验)/),
      education: inferByPattern(lines, /(学历不限|大专|本科|硕士|博士|高中|中专)/),
      recruiter: firstText(root, [".boss-name", ".name", "[class*='boss-name']", "[class*='recruiter']"]),
      tags: pickTexts(root, [".tag-list span", ".job-tags span", "[class*='tag'] span"]),
      welfare: inferWelfare(lines),
      description,
      detailUrl,
      rawText,
      capturedAt: new Date().toISOString()
    };
  }

  function findDetailRoot() {
    const selectors = [
      ".job-detail-container",
      ".job-detail",
      ".job-detail-box",
      ".job-sec",
      ".detail-content",
      ".job-detail-body",
      "[class*='job-detail']",
      "[class*='detail-content']"
    ];

    let best = null;
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const text = getMultilineText(element);
        if (!text || text.length < 20) {
          continue;
        }
        if (!best || text.length > getMultilineText(best).length) {
          best = element;
        }
      }
    }

    if (!best && /\/job_detail\//.test(location.pathname)) {
      best = document.querySelector("main") || document.body;
    }

    return best;
  }

  function extractDescription(root, fallbackText) {
    const candidates = [
      ".job-sec-text",
      ".job-description",
      ".job-detail-section .text",
      ".detail-content .text",
      "[class*='job-sec-text']",
      "[class*='description']",
      "[class*='desc']"
    ];

    for (const selector of candidates) {
      const matches = Array.from(root.querySelectorAll(selector))
        .map(getMultilineText)
        .filter((text) => text.length > 20);
      if (matches.length) {
        return matches.sort((a, b) => b.length - a.length)[0];
      }
    }

    return trimDescriptionFromDetailText(fallbackText);
  }

  function extractInlineDescription(card) {
    const text = extractDescription(card, "");
    if (!text || text.length < 50 || text.length > 2500) {
      return "";
    }
    return text;
  }

  function trimDescriptionFromDetailText(text) {
    const lines = String(text || "").split("\n").map(cleanText).filter(Boolean);
    const startIndex = lines.findIndex((line) => /职位描述|岗位职责|任职要求|职位详情/i.test(line));
    if (startIndex >= 0) {
      return lines.slice(startIndex + 1).join("\n").trim();
    }
    return lines.slice(0, 80).join("\n").trim();
  }

  function findMatchingJob(jobs, detail) {
    return jobs.find((job) => job.jobId && detail.jobId && job.jobId === detail.jobId)
      || jobs.find((job) => job.detailUrl && detail.detailUrl && job.detailUrl === detail.detailUrl)
      || jobs.find((job) => cleanText(job.title) && cleanText(job.title) === cleanText(detail.title));
  }

  function mergeDetailIntoJob(job, detail) {
    for (const key of ["title", "salary", "company", "location", "experience", "education", "recruiter", "detailUrl"]) {
      job[key] = detail[key] || job[key] || "";
    }
    job.tags = unionStrings(job.tags, detail.tags);
    job.welfare = unionStrings(job.welfare, detail.welfare);
    job.description = chooseLonger(job.description, detail.description);
    job.rawText = chooseLonger(job.rawText, detail.rawText);
  }

  function dedupeJobs(jobs) {
    const map = new Map();
    for (const job of jobs) {
      if (!isValidJobRecord(job)) {
        continue;
      }
      const key = job.jobId || job.detailUrl || [job.title, job.company, job.salary, job.location].join("|");
      if (!key || key === "|||") {
        continue;
      }
      const existing = map.get(key);
      if (existing) {
        mergeDetailIntoJob(existing, job);
      } else {
        map.set(key, job);
      }
    }
    return Array.from(map.values());
  }

  function firstText(root, selectors) {
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      const text = element ? cleanText(element.textContent) : "";
      if (text) {
        return text;
      }
    }
    return "";
  }

  function pickTexts(root, selectors) {
    const values = [];
    for (const selector of selectors) {
      for (const element of root.querySelectorAll(selector)) {
        const text = cleanText(element.textContent);
        if (text && text.length <= 50) {
          values.push(text);
        }
      }
    }
    return Array.from(new Set(values)).slice(0, 30);
  }

  function getHref(root) {
    if (root.matches?.("a[href*='/job_detail/']")) {
      return root.getAttribute("href") || "";
    }
    const link = root.querySelector?.("a[href*='/job_detail/']");
    return link ? link.getAttribute("href") || "" : "";
  }

  function hasJobDetailHref(root) {
    return Boolean(root?.matches?.("a[href*='/job_detail/']") || root?.querySelector?.("a[href*='/job_detail/']"));
  }

  function isValidJobRecord(job) {
    return Boolean(job?.jobId || /\/job_detail\//.test(String(job?.detailUrl || "")));
  }

  function getMultilineText(element) {
    return String(element?.innerText || element?.textContent || "")
      .replace(/\u00a0/g, " ")
      .split(/\r?\n/)
      .map(cleanText)
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  function inferTitle(lines) {
    return (lines || []).find((line) => {
      return line.length >= 2
        && line.length <= 50
        && !inferSalary(line)
        && !/(经验|学历|公司|招聘|职位描述|岗位职责)/.test(line);
    }) || "";
  }

  function inferSalary(text) {
    const match = String(text || "").match(/([0-9]+(?:\.[0-9]+)?\s*[-至]\s*[0-9]+(?:\.[0-9]+)?\s*[kK万]|[0-9]+(?:\.[0-9]+)?\s*[kK万]\s*[-至]\s*[0-9]+(?:\.[0-9]+)?\s*[kK万]|面议)/);
    return match ? cleanText(match[1]) : "";
  }

  function inferCompany(lines, title) {
    return (lines || []).find((line) => {
      return line !== title
        && line.length >= 2
        && line.length <= 60
        && /(公司|科技|信息|网络|集团|工作室|中心|咨询|服务|智能|数据|软件|有限|股份)/.test(line);
    }) || "";
  }

  function inferByPattern(lines, pattern) {
    const line = (lines || []).find((item) => pattern.test(item));
    return line ? cleanText(line) : "";
  }

  function inferWelfare(lines) {
    const welfarePattern = /(五险|一金|双休|年终|奖金|补贴|团建|餐补|房补|股票|期权|带薪|体检|节日|福利|绩效|加班补助)/;
    return Array.from(new Set((lines || []).filter((line) => welfarePattern.test(line) && line.length <= 80))).slice(0, 20);
  }

  function normalizeUrl(value, base) {
    if (!value) {
      return "";
    }
    try {
      return new URL(value, base || location.href).toString();
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

  function cleanMultiline(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map(cleanText)
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  function getTaskPayload(task) {
    return task?.payload && typeof task.payload === "object" ? task.payload : {};
  }

  function getElementLabel(element) {
    if (!element) {
      return "";
    }
    return cleanText([
      element.getAttribute?.("aria-label") || "",
      element.getAttribute?.("placeholder") || "",
      element.getAttribute?.("title") || "",
      element.getAttribute?.("name") || "",
      element.getAttribute?.("class") || "",
      element.innerText || "",
      element.textContent || ""
    ].filter(Boolean).join(" "));
  }

  function unionStrings(left = [], right = []) {
    return Array.from(new Set([...(left || []), ...(right || [])].map(cleanText).filter(Boolean)));
  }

  function normalizeStringArray(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map(cleanText).filter(Boolean);
  }

  function chooseLonger(left = "", right = "") {
    return String(right || "").length > String(left || "").length ? right : left;
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0
      && rect.height > 0
      && style.visibility !== "hidden"
      && style.display !== "none";
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(parsed)));
  }

  function createIdleCrawlState() {
    return {
      running: false,
      status: "idle",
      total: 0,
      current: 0,
      captured: 0,
      described: 0,
      failed: 0,
      skipped: 0,
      blocked: false,
      blockingReason: "",
      loginRequired: false,
      captchaRequired: false,
      selectorChanged: false,
      visibleTargets: 0,
      pendingTargets: 0,
      visibleSkipped: 0,
      attempted: 0,
      scrollCount: 0,
      idleScrolls: 0,
      lastAction: "idle",
      startedAt: null,
      finishedAt: null,
      message: "未开始",
      lastJobTitle: "",
      errors: []
    };
  }
})();
