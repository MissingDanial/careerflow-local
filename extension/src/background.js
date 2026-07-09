const SETTINGS_KEY = "bossFindSettings";
const CACHE_KEY = "bossFindCaptureCache";
const LAST_BOSS_PAGE_KEY = "bossFindLastBossPage";

const DEFAULT_SETTINGS = {
  backendUrl: "http://127.0.0.1:8787",
  syncPath: "/api/jobs/sync",
  token: "",
  maxCachedJobs: 500,
  autoSync: true,
  autoSyncDebounceMs: 1200,
  crawlDelayMs: 1600,
  crawlMaxJobs: 30,
  riskGateEnabled: false,
  excludedDirections: []
};

let autoSyncTimer = null;
let autoSyncInFlight = false;
let autoSyncPending = false;

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await storageGet(SETTINGS_KEY);
  if (!existing) {
    await storageSet(SETTINGS_KEY, DEFAULT_SETTINGS);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

async function handleMessage(message, sender) {
  if (!message || typeof message.type !== "string") {
    throw new Error("Invalid message");
  }

  switch (message.type) {
    case "GET_SETTINGS":
      return getSettings();
    case "SAVE_SETTINGS":
      return saveSettings(message.settings || {});
    case "CACHE_CAPTURE":
      return mergeCapture(message.capture, sender.tab);
    case "GET_CACHE":
      return getCache();
    case "CLEAR_CACHE":
      await storageSet(CACHE_KEY, createEmptyCache());
      return getCache();
    case "SYNC_CACHE":
      return syncCache(message.capture || null);
    case "GET_QUALITY":
      return fetchQualityReport();
    case "GET_EVENTS":
      return fetchBrowserEvents(message.limit || 5);
    case "GET_BROWSER_TASK_DIAGNOSTICS":
      return fetchBrowserTaskDiagnostics(message.options || message.limit || 10);
    case "GET_LAST_BOSS_PAGE":
      return getLastBossPage();
    case "SET_LAST_BOSS_PAGE":
      return setLastBossPage(message.page || {});
    case "CANCEL_BROWSER_TASKS":
      return cancelBrowserTasks(message.options || {});
    case "REQUEUE_BROWSER_TASKS":
      return requeueBrowserTasks(message.options || {});
    case "GET_MISSING_DESCRIPTIONS":
      return fetchMissingDescriptions(message.limit || 5);
    case "GET_SCREENING_CANDIDATES":
      return fetchScreeningCandidates(message.options || message.limit || 8);
    case "GET_SCREENINGS":
      return fetchScreenings(message.options || message.limit || 8);
    case "GET_AGENT_RUNS":
      return fetchAgentRuns(message.options || message.limit || 8);
    case "GET_CAREER_CONTEXT":
      return fetchCareerContext();
    case "GENERATE_CAREER_CONTEXT":
      return generateCareerContext(message.options || {});
    case "GET_PROFILE_FACT_DRAFTS":
      return fetchProfileFactDrafts(message.options || message.limit || 20);
    case "GENERATE_PROFILE_FACT_DRAFTS":
      return generateProfileFactDrafts(message.options || {});
    case "CONFIRM_PROFILE_FACT_DRAFT":
      return confirmProfileFactDraft(message.draftId || message.id, message.options || {});
    case "REJECT_PROFILE_FACT_DRAFT":
      return rejectProfileFactDraft(message.draftId || message.id, message.options || {});
    case "GET_WORKFLOW_EVENTS":
      return fetchWorkflowEvents(message.options || message.limit || 20);
    case "GET_WORKFLOW_ERRORS":
      return fetchWorkflowErrors(message.options || message.limit || 20);
    case "GET_APPLICATION_TIMELINE":
      return fetchApplicationTimeline(message.applicationId || message.options?.applicationId, message.options || {});
    case "RESOLVE_WORKFLOW_ERROR":
      return resolveWorkflowError(message.eventId || message.workflowEventId || message.id, message.options || {});
    case "SCREEN_APPLICATION_BATCH":
      return screenApplicationBatch(message.options || {});
    case "GET_RESUME_CANDIDATES":
      return fetchResumeCandidates(message.options || message.limit || 8);
    case "GET_RESUME_VERSIONS":
      return fetchResumeVersions(message.options || message.limit || 8);
    case "GET_RESUME_VERSION":
      return fetchResumeVersion(message.resumeVersionId || message.id);
    case "GET_RESUME_FIT_EVALUATIONS":
      return fetchResumeFitEvaluations(message.options || message.limit || 8);
    case "GET_RESUME_CLAIM_VERIFICATIONS":
      return fetchResumeClaimVerifications(message.options || message.limit || 8);
    case "GET_RESUME_AUDITS":
      return fetchResumeAudits(message.options || message.limit || 8);
    case "GET_RESUME_AUDIT":
      return fetchResumeAudit(message.resumeAuditId || message.id);
    case "PREPARE_RESUME":
      return prepareResume(message.applicationId, message.options || {});
    case "EVALUATE_RESUME_FIT":
      return evaluateResumeFit(message.resumeVersionId, message.options || {});
    case "VERIFY_RESUME_CLAIMS":
      return verifyResumeClaims(message.resumeVersionId, message.options || {});
    case "REVISE_RESUME_FROM_CHECKS":
      return reviseResumeFromChecks(message.resumeVersionId, message.options || {});
    case "AUDIT_RESUME":
      return auditResume(message.resumeVersionId, message.options || {});
    case "REVISE_RESUME":
      return reviseResume(message.resumeVersionId, message.options || {});
    case "APPROVE_RESUME_LOCAL":
      return approveResumeLocal(message.resumeVersionId, message.options || {});
    case "RUN_RESUME_WORKFLOW_GRAPH":
      return runResumeWorkflowGraph(message.applicationId, message.options || {});
    case "GET_MESSAGES":
      return fetchMessages(message.options || message.limit || 8);
    case "GET_CONVERSATIONS":
      return fetchConversations(message.options || message.limit || 8);
    case "GET_SUBMISSION_READINESS_QUEUE":
      return fetchSubmissionReadinessQueue(message.options || message.limit || 8);
    case "REVIEW_SUBMISSION_READINESS":
      return reviewSubmissionReadiness(message.applicationId, message.options || {});
    case "PREPARE_GREETING":
      return prepareGreeting(message.applicationId, message.options || {});
    case "GET_JOB_KEYS":
      return fetchJobKeys(message.options || {});
    case "CLAIM_BROWSER_TASK":
      return claimBrowserTask(message.options || {});
    case "CREATE_BROWSER_TASK":
      return createBrowserTask(message.task || {});
    case "TRANSITION_BROWSER_TASK":
      return transitionBrowserTask(message.taskId, message.transition || {});
    default:
      throw new Error(`Unsupported message type: ${message.type}`);
  }
}

async function getSettings() {
  return {
    ...DEFAULT_SETTINGS,
    ...((await storageGet(SETTINGS_KEY)) || {})
  };
}

async function saveSettings(settings) {
  const current = await getSettings();
  const next = {
    ...current,
    backendUrl: normalizeBaseUrl(settings.backendUrl ?? current.backendUrl),
    syncPath: normalizePath(settings.syncPath ?? current.syncPath),
    token: String(settings.token ?? current.token ?? "").trim(),
    maxCachedJobs: clampNumber(settings.maxCachedJobs, 50, 2000, current.maxCachedJobs),
    autoSync: parseBoolean(settings.autoSync, current.autoSync),
    autoSyncDebounceMs: clampNumber(settings.autoSyncDebounceMs, 500, 10000, current.autoSyncDebounceMs),
    crawlDelayMs: clampNumber(settings.crawlDelayMs, 800, 8000, current.crawlDelayMs),
    crawlMaxJobs: clampNumber(settings.crawlMaxJobs, 1, 100, current.crawlMaxJobs),
    riskGateEnabled: parseBoolean(settings.riskGateEnabled, current.riskGateEnabled),
    excludedDirections: normalizeDelimitedStringArray(settings.excludedDirections ?? current.excludedDirections)
  };

  await storageSet(SETTINGS_KEY, next);
  return next;
}

async function syncCache(optionalCapture) {
  if (!optionalCapture) {
    clearTimeout(autoSyncTimer);
    autoSyncTimer = null;
  }

  if (optionalCapture) {
    await mergeCapture(optionalCapture, null, { skipAutoSync: true });
  }

  const settings = await getSettings();
  const cache = await getCache();
  const jobs = cache.jobs || [];
  if (!jobs.length) {
    throw new Error("没有可同步的岗位缓存，请先采集当前页面。");
  }

  const syncUrl = new URL(settings.syncPath, ensureTrailingSlash(settings.backendUrl)).toString();
  const payload = {
    source: "boss-find-extension",
    exportedAt: new Date().toISOString(),
    stats: {
      jobCount: jobs.length,
      pageCount: Object.keys(cache.pages || {}).length,
      lastUpdatedAt: cache.lastUpdatedAt || null,
      quality: summarizeCacheQuality(cache)
    },
    pages: cache.pages || {},
    jobs
  };

  const headers = {
    "Content-Type": "application/json"
  };
  if (settings.token) {
    headers.Authorization = `Bearer ${settings.token}`;
  }

  const response = await fetch(syncUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const message = data?.error || data?.message || `同步失败：HTTP ${response.status}`;
    throw new Error(message);
  }

  const latestCache = await getCache();
  const nextCache = {
    ...latestCache,
    lastSyncedAt: new Date().toISOString(),
    lastSyncResult: data
  };
  await storageSet(CACHE_KEY, nextCache);

  return {
    endpoint: syncUrl,
    sent: jobs.length,
    response: data
  };
}

async function fetchQualityReport() {
  const settings = await getSettings();
  const qualityUrl = new URL("/api/quality?limit=1", ensureTrailingSlash(settings.backendUrl)).toString();
  const headers = {};
  if (settings.token) {
    headers.Authorization = `Bearer ${settings.token}`;
  }

  const response = await fetch(qualityUrl, {
    method: "GET",
    headers
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const message = data?.error || data?.message || `质量报告读取失败：HTTP ${response.status}`;
    throw new Error(message);
  }

  return {
    endpoint: qualityUrl,
    report: data
  };
}

async function fetchBrowserEvents(limit = 5) {
  const settings = await getSettings();
  const eventLimit = clampNumber(limit, 1, 20, 5);
  const eventsUrl = new URL(`/api/events?limit=${eventLimit}`, ensureTrailingSlash(settings.backendUrl)).toString();
  const headers = {};
  if (settings.token) {
    headers.Authorization = `Bearer ${settings.token}`;
  }

  const response = await fetch(eventsUrl, {
    method: "GET",
    headers
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const message = data?.error || data?.message || `事件日志读取失败：HTTP ${response.status}`;
    throw new Error(message);
  }

  return {
    endpoint: eventsUrl,
    events: Array.isArray(data?.events) ? data.events : []
  };
}

async function fetchBrowserTaskDiagnostics(options = 10) {
  const settings = await getSettings();
  const normalizedOptions = typeof options === "object" && options !== null
    ? options
    : { limit: options };
  const taskLimit = clampNumber(normalizedOptions.limit, 1, 50, 10);
  const diagnosticsUrl = new URL("/api/browser-tasks/diagnostics", ensureTrailingSlash(settings.backendUrl));
  diagnosticsUrl.searchParams.set("limit", String(taskLimit));
  if (normalizedOptions.sourceUrl || normalizedOptions.pageUrl) {
    diagnosticsUrl.searchParams.set("sourceUrl", normalizedOptions.sourceUrl || normalizedOptions.pageUrl);
  }
  const headers = {};
  if (settings.token) {
    headers.Authorization = `Bearer ${settings.token}`;
  }

  const response = await fetch(diagnosticsUrl.toString(), {
    method: "GET",
    headers
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const message = data?.error || data?.message || `浏览器任务诊断读取失败：HTTP ${response.status}`;
    throw new Error(message);
  }

  return {
    endpoint: diagnosticsUrl.toString(),
    diagnostics: data
  };
}

async function getLastBossPage() {
  return (await storageGet(LAST_BOSS_PAGE_KEY)) || {
    url: "",
    title: "",
    updatedAt: ""
  };
}

async function setLastBossPage(page = {}) {
  const url = cleanText(page.url || "");
  if (!url) {
    return getLastBossPage();
  }
  const next = {
    url,
    title: cleanText(page.title || ""),
    updatedAt: new Date().toISOString()
  };
  await storageSet(LAST_BOSS_PAGE_KEY, next);
  return next;
}

async function fetchMissingDescriptions(limit = 5) {
  const settings = await getSettings();
  const jobLimit = clampNumber(limit, 1, 20, 5);
  const missingUrl = new URL(`/api/jobs/missing-descriptions?limit=${jobLimit}`, ensureTrailingSlash(settings.backendUrl)).toString();
  const headers = {};
  if (settings.token) {
    headers.Authorization = `Bearer ${settings.token}`;
  }

  const response = await fetch(missingUrl, {
    method: "GET",
    headers
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const message = data?.error || data?.message || `待补 JD 队列读取失败：HTTP ${response.status}`;
    throw new Error(message);
  }

  return {
    endpoint: missingUrl,
    totalMissingDescriptions: Number(data?.totalMissingDescriptions || 0),
    jobs: Array.isArray(data?.jobs) ? data.jobs : []
  };
}

async function fetchScreeningCandidates(options = 8) {
  const settings = await getSettings();
  const normalizedOptions = typeof options === "object" && options !== null
    ? options
    : { limit: options };
  const candidateLimit = clampNumber(normalizedOptions.limit, 1, 50, 8);
  const minDescriptionLength = clampNumber(normalizedOptions.minDescriptionLength, 1, 5000, 80);
  const candidatesUrl = new URL("/api/screening-candidates", ensureTrailingSlash(settings.backendUrl));
  candidatesUrl.searchParams.set("limit", String(candidateLimit));
  candidatesUrl.searchParams.set("minDescriptionLength", String(minDescriptionLength));
  if (normalizedOptions.includeAlreadyScreened) {
    candidatesUrl.searchParams.set("includeAlreadyScreened", "1");
  }
  const statuses = Array.isArray(normalizedOptions.statuses)
    ? normalizedOptions.statuses
    : normalizeStringArray([normalizedOptions.status || normalizedOptions.statuses].filter(Boolean));
  for (const status of statuses) {
    candidatesUrl.searchParams.append("status", status);
  }

  return {
    endpoint: candidatesUrl.toString(),
    response: await backendJson(candidatesUrl.toString(), {
      method: "GET",
      token: settings.token,
      errorPrefix: "筛选候选读取失败"
    })
  };
}

async function fetchScreenings(options = 8) {
  const settings = await getSettings();
  const normalizedOptions = typeof options === "object" && options !== null
    ? options
    : { limit: options };
  const screeningLimit = clampNumber(normalizedOptions.limit, 1, 50, 8);
  const screeningsUrl = new URL("/api/screenings", ensureTrailingSlash(settings.backendUrl));
  screeningsUrl.searchParams.set("limit", String(screeningLimit));
  if (normalizedOptions.applicationId) {
    screeningsUrl.searchParams.set("applicationId", String(normalizedOptions.applicationId));
  }
  return {
    endpoint: screeningsUrl.toString(),
    response: await backendJson(screeningsUrl.toString(), {
      method: "GET",
      token: settings.token,
      errorPrefix: "筛选结果读取失败"
    })
  };
}

async function fetchAgentRuns(options = 8) {
  const settings = await getSettings();
  const normalizedOptions = typeof options === "object" && options !== null
    ? options
    : { limit: options };
  const runLimit = clampNumber(normalizedOptions.limit, 1, 50, 8);
  const runsUrl = new URL("/api/agent-runs", ensureTrailingSlash(settings.backendUrl));
  runsUrl.searchParams.set("limit", String(runLimit));
  if (normalizedOptions.applicationId) {
    runsUrl.searchParams.set("applicationId", String(normalizedOptions.applicationId));
  }
  return {
    endpoint: runsUrl.toString(),
    response: await backendJson(runsUrl.toString(), {
      method: "GET",
      token: settings.token,
      errorPrefix: "Agent 运行记录读取失败"
    })
  };
}

async function fetchCareerContext() {
  const settings = await getSettings();
  const contextUrl = new URL("/api/profile/career-context", ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: contextUrl,
    response: await backendJson(contextUrl, {
      method: "GET",
      token: settings.token,
      errorPrefix: "职业经历上下文读取失败"
    })
  };
}

async function generateCareerContext(options = {}) {
  const settings = await getSettings();
  const contextUrl = new URL("/api/profile/career-context", ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: contextUrl,
    response: await backendJson(contextUrl, {
      method: "POST",
      token: settings.token,
      body: {
        resumeSourceId: options.resumeSourceId || null,
        answers: Array.isArray(options.answers) ? options.answers : [],
        writeFile: options.writeFile !== false
      },
      errorPrefix: "ProfileAgent 职业经历上下文生成失败"
    })
  };
}

async function fetchProfileFactDrafts(options = 20) {
  const settings = await getSettings();
  const normalizedOptions = typeof options === "object" && options !== null
    ? options
    : { limit: options };
  const draftUrl = new URL("/api/profile/fact-drafts", ensureTrailingSlash(settings.backendUrl));
  draftUrl.searchParams.set("limit", String(clampNumber(normalizedOptions.limit, 1, 100, 20)));
  draftUrl.searchParams.set("status", String(normalizedOptions.status || "PENDING"));
  if (normalizedOptions.draftType || normalizedOptions.type) {
    draftUrl.searchParams.set("draftType", String(normalizedOptions.draftType || normalizedOptions.type));
  }
  if (normalizedOptions.resumeSourceId || normalizedOptions.sourceId) {
    draftUrl.searchParams.set("resumeSourceId", String(normalizedOptions.resumeSourceId || normalizedOptions.sourceId));
  }
  return {
    endpoint: draftUrl.toString(),
    response: await backendJson(draftUrl.toString(), {
      method: "GET",
      token: settings.token,
      errorPrefix: "待确认事实草稿读取失败"
    })
  };
}

async function generateProfileFactDrafts(options = {}) {
  const settings = await getSettings();
  const draftUrl = new URL("/api/profile/career-context/fact-drafts", ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: draftUrl,
    response: await backendJson(draftUrl, {
      method: "POST",
      token: settings.token,
      body: {
        resumeSourceId: options.resumeSourceId || null,
        answers: Array.isArray(options.answers) ? options.answers : []
      },
      errorPrefix: "ProfileAgent 事实草稿生成失败"
    })
  };
}

async function confirmProfileFactDraft(draftId, options = {}) {
  const id = Number(draftId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("缺少有效的事实草稿 ID");
  }
  const settings = await getSettings();
  const draftUrl = new URL(`/api/profile/fact-drafts/${id}/confirm`, ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: draftUrl,
    response: await backendJson(draftUrl, {
      method: "POST",
      token: settings.token,
      body: options,
      errorPrefix: "事实草稿确认失败"
    })
  };
}

async function rejectProfileFactDraft(draftId, options = {}) {
  const id = Number(draftId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("缺少有效的事实草稿 ID");
  }
  const settings = await getSettings();
  const draftUrl = new URL(`/api/profile/fact-drafts/${id}/reject`, ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: draftUrl,
    response: await backendJson(draftUrl, {
      method: "POST",
      token: settings.token,
      body: {
        reason: options.reason || "options_profile_fact_rejected"
      },
      errorPrefix: "事实草稿拒绝失败"
    })
  };
}

async function fetchWorkflowEvents(options = 20) {
  const settings = await getSettings();
  const normalizedOptions = typeof options === "object" && options !== null
    ? options
    : { limit: options };
  const eventLimit = clampNumber(normalizedOptions.limit, 1, 100, 20);
  const eventsUrl = new URL("/api/workflow-events", ensureTrailingSlash(settings.backendUrl));
  eventsUrl.searchParams.set("limit", String(eventLimit));
  if (normalizedOptions.applicationId) {
    eventsUrl.searchParams.set("applicationId", String(normalizedOptions.applicationId));
  }
  if (normalizedOptions.severity) {
    eventsUrl.searchParams.set("severity", String(normalizedOptions.severity));
  }
  if (normalizedOptions.resolutionStatus || normalizedOptions.status) {
    eventsUrl.searchParams.set("resolutionStatus", String(normalizedOptions.resolutionStatus || normalizedOptions.status));
  }
  return {
    endpoint: eventsUrl.toString(),
    response: await backendJson(eventsUrl.toString(), {
      method: "GET",
      token: settings.token,
      errorPrefix: "Workflow event read failed"
    })
  };
}

async function fetchWorkflowErrors(options = 20) {
  const settings = await getSettings();
  const normalizedOptions = typeof options === "object" && options !== null
    ? options
    : { limit: options };
  const errorLimit = clampNumber(normalizedOptions.limit, 1, 100, 20);
  const errorsUrl = new URL("/api/workflow-errors", ensureTrailingSlash(settings.backendUrl));
  errorsUrl.searchParams.set("limit", String(errorLimit));
  errorsUrl.searchParams.set("status", String(normalizedOptions.status || normalizedOptions.resolutionStatus || "OPEN"));
  if (normalizedOptions.applicationId) {
    errorsUrl.searchParams.set("applicationId", String(normalizedOptions.applicationId));
  }
  if (normalizedOptions.sourceType) {
    errorsUrl.searchParams.set("sourceType", String(normalizedOptions.sourceType));
  }
  return {
    endpoint: errorsUrl.toString(),
    response: await backendJson(errorsUrl.toString(), {
      method: "GET",
      token: settings.token,
      errorPrefix: "Workflow error queue read failed"
    })
  };
}

async function fetchApplicationTimeline(applicationId, options = {}) {
  const id = Number(applicationId || options.applicationId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Valid application ID is required for workflow timeline");
  }
  const settings = await getSettings();
  const timelineLimit = clampNumber(options.limit, 1, 200, 100);
  const timelineUrl = new URL(`/api/applications/${id}/timeline`, ensureTrailingSlash(settings.backendUrl));
  timelineUrl.searchParams.set("limit", String(timelineLimit));
  return {
    endpoint: timelineUrl.toString(),
    response: await backendJson(timelineUrl.toString(), {
      method: "GET",
      token: settings.token,
      errorPrefix: "Application timeline read failed"
    })
  };
}

async function resolveWorkflowError(eventId, options = {}) {
  const id = Number(eventId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Valid workflow event ID is required");
  }
  const status = String(options.status || options.resolutionStatus || "RESOLVED").toUpperCase();
  if (!["RESOLVED", "IGNORED"].includes(status)) {
    throw new Error("Workflow error status must be RESOLVED or IGNORED");
  }
  const settings = await getSettings();
  const resolveUrl = new URL(`/api/workflow-errors/${id}/resolve`, ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: resolveUrl,
    response: await backendJson(resolveUrl, {
      method: "POST",
      token: settings.token,
      body: {
        status,
        resolvedBy: options.resolvedBy || "user",
        note: options.note || "options_workflow_error_queue"
      },
      errorPrefix: "Workflow error resolution failed"
    })
  };
}

async function screenApplicationBatch(options = {}) {
  const settings = await getSettings();
  const batchUrl = new URL("/api/applications/screen-batch", ensureTrailingSlash(settings.backendUrl)).toString();
  const limit = clampNumber(options.limit, 1, 50, 10);
  return {
    endpoint: batchUrl,
    response: await backendJson(batchUrl, {
      method: "POST",
      token: settings.token,
      body: {
        ...options,
        mode: options.mode || "rules",
        limit,
        continueOnError: options.continueOnError !== false
      },
      errorPrefix: "批量筛选失败"
    })
  };
}

async function fetchResumeCandidates(options = 8) {
  const settings = await getSettings();
  const normalizedOptions = typeof options === "object" && options !== null
    ? options
    : { limit: options };
  const candidateLimit = clampNumber(normalizedOptions.limit, 1, 50, 8);
  const minDescriptionLength = clampNumber(normalizedOptions.minDescriptionLength, 1, 5000, 80);
  const minMatchScore = clampNumber(normalizedOptions.minMatchScore, 0, 100, 0);
  const candidatesUrl = new URL("/api/resume-candidates", ensureTrailingSlash(settings.backendUrl));
  candidatesUrl.searchParams.set("limit", String(candidateLimit));
  candidatesUrl.searchParams.set("minDescriptionLength", String(minDescriptionLength));
  candidatesUrl.searchParams.set("minMatchScore", String(minMatchScore));
  candidatesUrl.searchParams.set("excludeExistingResume", normalizedOptions.excludeExistingResume === false ? "0" : "1");
  const statuses = Array.isArray(normalizedOptions.statuses)
    ? normalizedOptions.statuses
    : normalizeStringArray([normalizedOptions.status || normalizedOptions.statuses].filter(Boolean));
  for (const status of statuses) {
    candidatesUrl.searchParams.append("status", status);
  }
  const recommendations = Array.isArray(normalizedOptions.recommendations)
    ? normalizedOptions.recommendations
    : normalizeStringArray([normalizedOptions.recommendation || normalizedOptions.recommendations].filter(Boolean));
  for (const recommendation of recommendations) {
    candidatesUrl.searchParams.append("recommendation", recommendation);
  }

  return {
    endpoint: candidatesUrl.toString(),
    response: await backendJson(candidatesUrl.toString(), {
      method: "GET",
      token: settings.token,
      errorPrefix: "简历候选读取失败"
    })
  };
}

async function fetchResumeVersions(options = 8) {
  const settings = await getSettings();
  const normalizedOptions = typeof options === "object" && options !== null
    ? options
    : { limit: options };
  const versionLimit = clampNumber(normalizedOptions.limit, 1, 50, 8);
  const versionsUrl = new URL("/api/resume-versions", ensureTrailingSlash(settings.backendUrl));
  versionsUrl.searchParams.set("limit", String(versionLimit));
  if (normalizedOptions.applicationId) {
    versionsUrl.searchParams.set("applicationId", String(normalizedOptions.applicationId));
  }
  return {
    endpoint: versionsUrl.toString(),
    response: await backendJson(versionsUrl.toString(), {
      method: "GET",
      token: settings.token,
      errorPrefix: "简历版本读取失败"
    })
  };
}

async function fetchResumeVersion(resumeVersionId) {
  const id = Number(resumeVersionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("缺少有效的 resume version ID");
  }
  const settings = await getSettings();
  const versionUrl = new URL(`/api/resume-versions/${id}`, ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: versionUrl,
    response: await backendJson(versionUrl, {
      method: "GET",
      token: settings.token,
      errorPrefix: "简历版本详情读取失败"
    })
  };
}

async function fetchResumeFitEvaluations(options = 8) {
  const settings = await getSettings();
  const normalizedOptions = typeof options === "object" && options !== null
    ? options
    : { limit: options };
  const fitLimit = clampNumber(normalizedOptions.limit, 1, 50, 8);
  const fitUrl = new URL("/api/resume-fit-evaluations", ensureTrailingSlash(settings.backendUrl));
  fitUrl.searchParams.set("limit", String(fitLimit));
  if (normalizedOptions.applicationId) {
    fitUrl.searchParams.set("applicationId", String(normalizedOptions.applicationId));
  }
  if (normalizedOptions.resumeVersionId) {
    fitUrl.searchParams.set("resumeVersionId", String(normalizedOptions.resumeVersionId));
  }
  return {
    endpoint: fitUrl.toString(),
    response: await backendJson(fitUrl.toString(), {
      method: "GET",
      token: settings.token,
      errorPrefix: "Resume fit evaluations read failed"
    })
  };
}

async function fetchResumeClaimVerifications(options = 8) {
  const settings = await getSettings();
  const normalizedOptions = typeof options === "object" && options !== null
    ? options
    : { limit: options };
  const claimLimit = clampNumber(normalizedOptions.limit, 1, 50, 8);
  const claimUrl = new URL("/api/resume-claim-verifications", ensureTrailingSlash(settings.backendUrl));
  claimUrl.searchParams.set("limit", String(claimLimit));
  if (normalizedOptions.applicationId) {
    claimUrl.searchParams.set("applicationId", String(normalizedOptions.applicationId));
  }
  if (normalizedOptions.resumeVersionId) {
    claimUrl.searchParams.set("resumeVersionId", String(normalizedOptions.resumeVersionId));
  }
  return {
    endpoint: claimUrl.toString(),
    response: await backendJson(claimUrl.toString(), {
      method: "GET",
      token: settings.token,
      errorPrefix: "Resume claim verifications read failed"
    })
  };
}

async function fetchResumeAudits(options = 8) {
  const settings = await getSettings();
  const normalizedOptions = typeof options === "object" && options !== null
    ? options
    : { limit: options };
  const auditLimit = clampNumber(normalizedOptions.limit, 1, 50, 8);
  const auditsUrl = new URL("/api/resume-audits", ensureTrailingSlash(settings.backendUrl));
  auditsUrl.searchParams.set("limit", String(auditLimit));
  if (normalizedOptions.applicationId) {
    auditsUrl.searchParams.set("applicationId", String(normalizedOptions.applicationId));
  }
  if (normalizedOptions.resumeVersionId) {
    auditsUrl.searchParams.set("resumeVersionId", String(normalizedOptions.resumeVersionId));
  }
  return {
    endpoint: auditsUrl.toString(),
    response: await backendJson(auditsUrl.toString(), {
      method: "GET",
      token: settings.token,
      errorPrefix: "简历审核读取失败"
    })
  };
}

async function fetchResumeAudit(resumeAuditId) {
  const id = Number(resumeAuditId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("缺少有效的 resume audit ID");
  }
  const settings = await getSettings();
  const auditUrl = new URL(`/api/resume-audits/${id}`, ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: auditUrl,
    response: await backendJson(auditUrl, {
      method: "GET",
      token: settings.token,
      errorPrefix: "简历审核详情读取失败"
    })
  };
}

async function prepareResume(applicationId, options = {}) {
  const id = Number(applicationId || options.applicationId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("缺少有效的 application ID");
  }
  const settings = await getSettings();
  const prepareUrl = new URL(`/api/applications/${id}/prepare-resume`, ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: prepareUrl,
    response: await backendJson(prepareUrl, {
      method: "POST",
      token: settings.token,
      body: {
        ...options,
        mode: "rules",
        renderDocx: true
      },
      errorPrefix: "规则简历生成失败"
    })
  };
}

async function evaluateResumeFit(resumeVersionId, options = {}) {
  const id = Number(resumeVersionId || options.resumeVersionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Valid resume version ID is required for fit evaluation");
  }
  const settings = await getSettings();
  const evaluateUrl = new URL(`/api/resume-versions/${id}/evaluate-fit`, ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: evaluateUrl,
    response: await backendJson(evaluateUrl, {
      method: "POST",
      token: settings.token,
      body: {
        ...options,
        mode: options.mode || "rules"
      },
      errorPrefix: "Resume fit evaluation failed"
    })
  };
}

async function verifyResumeClaims(resumeVersionId, options = {}) {
  const id = Number(resumeVersionId || options.resumeVersionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Valid resume version ID is required for claim verification");
  }
  const settings = await getSettings();
  const verifyUrl = new URL(`/api/resume-versions/${id}/verify-claims`, ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: verifyUrl,
    response: await backendJson(verifyUrl, {
      method: "POST",
      token: settings.token,
      body: {
        ...options,
        mode: options.mode || "rules"
      },
      errorPrefix: "Resume claim verification failed"
    })
  };
}

async function reviseResumeFromChecks(resumeVersionId, options = {}) {
  const id = Number(resumeVersionId || options.resumeVersionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Valid resume version ID is required for checked revision");
  }
  const settings = await getSettings();
  const reviseUrl = new URL(`/api/resume-versions/${id}/revise-from-checks`, ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: reviseUrl,
    response: await backendJson(reviseUrl, {
      method: "POST",
      token: settings.token,
      body: {
        ...options,
        mode: options.mode || "rules",
        renderDocx: options.renderDocx !== false
      },
      errorPrefix: "Resume checked revision failed"
    })
  };
}

async function auditResume(resumeVersionId, options = {}) {
  const id = Number(resumeVersionId || options.resumeVersionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("缺少有效的 resume version ID");
  }
  const settings = await getSettings();
  const auditUrl = new URL(`/api/resume-versions/${id}/audit`, ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: auditUrl,
    response: await backendJson(auditUrl, {
      method: "POST",
      token: settings.token,
      body: {
        ...options,
        mode: "rules"
      },
      errorPrefix: "规则简历审核失败"
    })
  };
}

async function reviseResume(resumeVersionId, options = {}) {
  const id = Number(resumeVersionId || options.resumeVersionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("缺少有效的 resume version ID");
  }
  const settings = await getSettings();
  const reviseUrl = new URL(`/api/resume-versions/${id}/revise`, ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: reviseUrl,
    response: await backendJson(reviseUrl, {
      method: "POST",
      token: settings.token,
      body: {
        resumeFields: options.resumeFields || {},
        reason: options.reason || "options_detail_edit",
        provider: "user_edit",
        renderDocx: options.renderDocx !== false
      },
      errorPrefix: "简历编辑保存失败"
    })
  };
}

async function approveResumeLocal(resumeVersionId, options = {}) {
  const id = Number(resumeVersionId || options.resumeVersionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("缺少有效的 resume version ID");
  }
  const settings = await getSettings();
  const approveUrl = new URL(`/api/resume-versions/${id}/approve-local`, ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: approveUrl,
    response: await backendJson(approveUrl, {
      method: "POST",
      token: settings.token,
      body: {
        approver: options.approver || "user",
        note: options.note || ""
      },
      errorPrefix: "本地审批失败"
    })
  };
}

async function runResumeWorkflowGraph(applicationId, options = {}) {
  const id = Number(applicationId || options.applicationId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Valid application ID is required for resume workflow graph");
  }
  const settings = await getSettings();
  const graphUrl = new URL(`/api/applications/${id}/resume-workflow-graph`, ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: graphUrl,
    response: await backendJson(graphUrl, {
      method: "POST",
      token: settings.token,
      body: {
        ...options,
        mode: options.mode || "rules",
        renderDocx: options.renderDocx !== false,
        maxRevisions: options.maxRevisions ?? 1
      },
      errorPrefix: "Resume workflow graph failed"
    })
  };
}

async function fetchMessages(options = 8) {
  const settings = await getSettings();
  const normalizedOptions = typeof options === "object" && options !== null
    ? options
    : { limit: options };
  const messageLimit = clampNumber(normalizedOptions.limit, 1, 50, 8);
  const messagesUrl = new URL("/api/messages", ensureTrailingSlash(settings.backendUrl));
  messagesUrl.searchParams.set("limit", String(messageLimit));
  if (normalizedOptions.applicationId) {
    messagesUrl.searchParams.set("applicationId", String(normalizedOptions.applicationId));
  }
  return {
    endpoint: messagesUrl.toString(),
    response: await backendJson(messagesUrl.toString(), {
      method: "GET",
      token: settings.token,
      errorPrefix: "打招呼草稿读取失败"
    })
  };
}

async function fetchConversations(options = 8) {
  const settings = await getSettings();
  const normalizedOptions = typeof options === "object" && options !== null
    ? options
    : { limit: options };
  const conversationLimit = clampNumber(normalizedOptions.limit, 1, 50, 8);
  const conversationsUrl = new URL("/api/conversations", ensureTrailingSlash(settings.backendUrl));
  conversationsUrl.searchParams.set("limit", String(conversationLimit));
  if (normalizedOptions.applicationId) {
    conversationsUrl.searchParams.set("applicationId", String(normalizedOptions.applicationId));
  }
  return {
    endpoint: conversationsUrl.toString(),
    response: await backendJson(conversationsUrl.toString(), {
      method: "GET",
      token: settings.token,
      errorPrefix: "会话状态读取失败"
    })
  };
}

async function fetchSubmissionReadinessQueue(options = 8) {
  const settings = await getSettings();
  const normalizedOptions = typeof options === "object" && options !== null
    ? options
    : { limit: options };
  const queueLimit = clampNumber(normalizedOptions.limit, 1, 50, 8);
  const readinessUrl = new URL("/api/submission-readiness", ensureTrailingSlash(settings.backendUrl));
  readinessUrl.searchParams.set("limit", String(queueLimit));
  const statuses = Array.isArray(normalizedOptions.status)
    ? normalizedOptions.status
    : Array.isArray(normalizedOptions.statuses)
      ? normalizedOptions.statuses
      : normalizedOptions.status || normalizedOptions.statuses || "READY_FOR_MANUAL_REVIEW";
  for (const status of (Array.isArray(statuses) ? statuses : String(statuses).split(","))) {
    if (status) {
      readinessUrl.searchParams.append("status", String(status));
    }
  }
  return {
    endpoint: readinessUrl.toString(),
    response: await backendJson(readinessUrl.toString(), {
      method: "GET",
      token: settings.token,
      errorPrefix: "投递准备队列读取失败"
    })
  };
}

async function reviewSubmissionReadiness(applicationId, options = {}) {
  const id = Number(applicationId || options.applicationId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("缺少有效的 application ID");
  }
  const settings = await getSettings();
  const reviewUrl = new URL(`/api/submission-readiness/${id}/review`, ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: reviewUrl,
    response: await backendJson(reviewUrl, {
      method: "POST",
      token: settings.token,
      errorPrefix: "投递准备复核失败",
      body: JSON.stringify(options || {})
    })
  };
}

async function prepareGreeting(applicationId, options = {}) {
  const id = Number(applicationId || options.applicationId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("缺少有效的 application ID");
  }
  const settings = await getSettings();
  const greetingUrl = new URL(`/api/applications/${id}/prepare-greeting`, ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: greetingUrl,
    response: await backendJson(greetingUrl, {
      method: "POST",
      token: settings.token,
      body: {
        ...options,
        mode: "rules",
        dryRun: true
      },
      errorPrefix: "打招呼 dry-run 生成失败"
    })
  };
}

async function fetchJobKeys(options = {}) {
  const settings = await getSettings();
  const describedOnly = options.describedOnly !== false;
  const minDescriptionLength = clampNumber(options.minDescriptionLength, 1, 2000, 50);
  const keysUrl = new URL(
    `/api/jobs/keys?described=${describedOnly ? "1" : "0"}&minDescriptionLength=${minDescriptionLength}`,
    ensureTrailingSlash(settings.backendUrl)
  ).toString();
  const headers = {};
  if (settings.token) {
    headers.Authorization = `Bearer ${settings.token}`;
  }

  const response = await fetch(keysUrl, {
    method: "GET",
    headers
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const message = data?.error || data?.message || `已入库岗位 key 读取失败：HTTP ${response.status}`;
    throw new Error(message);
  }

  return {
    endpoint: keysUrl,
    describedOnly: Boolean(data?.describedOnly),
    totalJobs: Number(data?.totalJobs || 0),
    keyCount: Number(data?.keyCount || 0),
    keys: normalizeStringArray(data?.keys)
  };
}

async function claimBrowserTask(options = {}) {
  const settings = await getSettings();
  const claimUrl = new URL("/api/browser-tasks/claim", ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: claimUrl,
    response: await backendJson(claimUrl, {
      method: "POST",
      token: settings.token,
      body: {
        taskTypes: Array.isArray(options.taskTypes) ? options.taskTypes : [],
        sourceUrl: options.sourceUrl || ""
      },
      errorPrefix: "浏览器任务领取失败"
    })
  };
}

async function createBrowserTask(task = {}) {
  const settings = await getSettings();
  const taskUrl = new URL("/api/browser-tasks", ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: taskUrl,
    response: await backendJson(taskUrl, {
      method: "POST",
      token: settings.token,
      body: task,
      errorPrefix: "浏览器任务创建失败"
    })
  };
}

async function transitionBrowserTask(taskId, transition = {}) {
  const id = Number(taskId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("缺少有效的浏览器任务 ID");
  }

  const settings = await getSettings();
  const transitionUrl = new URL(`/api/browser-tasks/${id}/transition`, ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: transitionUrl,
    response: await backendJson(transitionUrl, {
      method: "POST",
      token: settings.token,
      body: transition,
      errorPrefix: "浏览器任务状态回写失败"
    })
  };
}

async function cancelBrowserTasks(options = {}) {
  return mutateBrowserTasks("/api/browser-tasks/cancel", options, "浏览器任务取消失败");
}

async function requeueBrowserTasks(options = {}) {
  return mutateBrowserTasks("/api/browser-tasks/requeue", options, "浏览器任务重排失败");
}

async function mutateBrowserTasks(pathname, options = {}, errorPrefix) {
  const settings = await getSettings();
  const taskUrl = new URL(pathname, ensureTrailingSlash(settings.backendUrl)).toString();
  return {
    endpoint: taskUrl,
    response: await backendJson(taskUrl, {
      method: "POST",
      token: settings.token,
      body: options,
      errorPrefix
    })
  };
}

async function backendJson(url, options = {}) {
  const headers = {};
  let body = null;
  if (Object.prototype.hasOwnProperty.call(options, "body")) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body ?? {});
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const message = data?.error || data?.message || `${options.errorPrefix || "后端请求失败"}：HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function mergeCapture(capture, tab, options = {}) {
  validateCapture(capture);

  const settings = await getSettings();
  const cache = await getCache();
  const now = new Date().toISOString();
  const jobsByKey = new Map((cache.jobs || []).map((job) => [job.cacheKey, job]));

  const incomingJobs = Array.isArray(capture.jobs) ? capture.jobs : [];
  for (const job of incomingJobs) {
    const normalized = normalizeJob(job, capture, now);
    if (!isValidJob(normalized)) {
      continue;
    }
    const existing = jobsByKey.get(normalized.cacheKey);
    jobsByKey.set(normalized.cacheKey, mergeJob(existing, normalized, now));
  }

  if (capture.selectedDetail?.description || capture.selectedDetail?.title) {
    const detailJob = normalizeJob(capture.selectedDetail, capture, now);
    if (isValidJob(detailJob)) {
      const existing = jobsByKey.get(detailJob.cacheKey);
      jobsByKey.set(detailJob.cacheKey, mergeJob(existing, detailJob, now));
    }
  }

  let jobs = Array.from(jobsByKey.values()).sort((a, b) => {
    const left = Date.parse(b.lastSeenAt || b.capturedAt || 0);
    const right = Date.parse(a.lastSeenAt || a.capturedAt || 0);
    return left - right;
  });

  jobs = jobs.slice(0, settings.maxCachedJobs);

  const pageUrl = capture.page?.url || tab?.url || "unknown";
  const pageDiagnostics = normalizeDiagnostics(capture.diagnostics || {});
  const pageStats = normalizeStats(capture.stats || {});
  const pages = {
    ...(cache.pages || {}),
    [pageUrl]: {
      url: pageUrl,
      title: capture.page?.title || tab?.title || "",
      lastCapturedAt: now,
      visibleJobCount: incomingJobs.length,
      validJobCount: incomingJobs.map((job) => normalizeJob(job, capture, now)).filter(isValidJob).length,
      describedJobCount: incomingJobs.filter((job) => Boolean(cleanMultiline(job.description || ""))).length,
      selectedDetailJobId: capture.selectedDetail?.jobId || "",
      selectedDetailTitle: capture.selectedDetail?.title || "",
      loginRequired: Boolean(pageDiagnostics.loginRequired),
      captchaRequired: Boolean(pageDiagnostics.captchaRequired),
      selectorCounts: pageDiagnostics.selectorCounts || {},
      diagnostics: pageDiagnostics,
      stats: pageStats,
      searchContext: inferSearchContext(capture.page || {}, pageDiagnostics)
    }
  };

  const nextCache = {
    version: 1,
    lastUpdatedAt: now,
    lastSyncedAt: cache.lastSyncedAt || null,
    lastSyncResult: cache.lastSyncResult || null,
    jobs,
    pages
  };
  await storageSet(CACHE_KEY, nextCache);

  const summary = summarizeCache(nextCache);
  if (!options.skipAutoSync && settings.autoSync && jobs.length) {
    scheduleAutoSync(settings);
  }

  return summary;
}

async function getCache() {
  return (await storageGet(CACHE_KEY)) || createEmptyCache();
}

function createEmptyCache() {
  return {
    version: 1,
    lastUpdatedAt: null,
    lastSyncedAt: null,
    jobs: [],
    pages: {}
  };
}

function normalizeJob(job, capture, now) {
  const pageUrl = capture.page?.url || "";
  const detailUrl = normalizeUrl(job.detailUrl || job.url || "", pageUrl);
  const jobId = cleanText(job.jobId || extractJobId(detailUrl));
  const title = cleanText(job.title || job.jobName || "");
  const company = cleanText(job.company || job.companyName || "");
  const cacheKey = jobId || detailUrl || stableKey([title, company, job.salary, job.location, pageUrl]);

  return {
    cacheKey,
    jobId,
    title,
    salary: cleanText(job.salary || ""),
    company,
    location: cleanText(job.location || ""),
    experience: cleanText(job.experience || ""),
    education: cleanText(job.education || ""),
    recruiter: cleanText(job.recruiter || ""),
    tags: normalizeStringArray(job.tags),
    welfare: normalizeStringArray(job.welfare),
    description: cleanMultiline(job.description || ""),
    detailUrl,
    sourceUrl: pageUrl,
    pageTitle: cleanText(capture.page?.title || ""),
    rawText: cleanMultiline(job.rawText || "").slice(0, 4000),
    capturedAt: job.capturedAt || capture.page?.capturedAt || now,
    firstSeenAt: now,
    lastSeenAt: now,
    seenCount: 1
  };
}

function isValidJob(job) {
  return Boolean(job?.jobId || /\/job_detail\//.test(String(job?.detailUrl || "")));
}

function mergeJob(existing, incoming, now) {
  if (!existing) {
    return incoming;
  }

  const merged = {
    ...existing,
    ...preferNonEmpty(existing, incoming),
    tags: unionStrings(existing.tags, incoming.tags),
    welfare: unionStrings(existing.welfare, incoming.welfare),
    description: chooseLonger(existing.description, incoming.description),
    rawText: chooseLonger(existing.rawText, incoming.rawText).slice(0, 4000),
    firstSeenAt: existing.firstSeenAt || incoming.firstSeenAt,
    lastSeenAt: now,
    seenCount: (existing.seenCount || 1) + 1
  };

  return merged;
}

function preferNonEmpty(existing, incoming) {
  const result = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (Array.isArray(value)) {
      continue;
    }
    result[key] = value || existing[key] || "";
  }
  return result;
}

function summarizeCache(cache) {
  const jobs = cache.jobs || [];
  return {
    jobCount: jobs.length,
    describedJobCount: jobs.filter((job) => Boolean(job.description)).length,
    pageCount: Object.keys(cache.pages || {}).length,
    lastUpdatedAt: cache.lastUpdatedAt,
    lastSyncedAt: cache.lastSyncedAt || null,
    lastSyncResult: cache.lastSyncResult || null
  };
}

function summarizeCacheQuality(cache) {
  const jobs = cache.jobs || [];
  const pages = Object.values(cache.pages || {});
  const describedJobCount = jobs.filter((job) => Boolean(cleanMultiline(job.description || ""))).length;
  const requiredFields = ["title", "company", "detailUrl"];
  const completeRequiredCount = jobs.filter((job) => requiredFields.every((field) => Boolean(cleanText(job[field] || "")))).length;

  return {
    jobCount: jobs.length,
    describedJobCount,
    descriptionCoverage: jobs.length ? describedJobCount / jobs.length : 0,
    completeRequiredCount,
    requiredFieldCoverage: jobs.length ? completeRequiredCount / jobs.length : 0,
    loginRequiredPageCount: pages.filter((page) => page.loginRequired).length,
    captchaRequiredPageCount: pages.filter((page) => page.captchaRequired).length
  };
}

function normalizeDiagnostics(diagnostics) {
  return {
    url: cleanText(diagnostics.url || ""),
    title: cleanText(diagnostics.title || ""),
    loginRequired: Boolean(diagnostics.loginRequired),
    captchaRequired: Boolean(diagnostics.captchaRequired),
    selectorCounts: diagnostics.selectorCounts && typeof diagnostics.selectorCounts === "object"
      ? diagnostics.selectorCounts
      : {},
    cardCount: Number(diagnostics.cardCount || 0),
    bodySample: cleanText(diagnostics.bodySample || "").slice(0, 500)
  };
}

function normalizeStats(stats) {
  return {
    cardCount: Number(stats.cardCount || 0),
    jobCount: Number(stats.jobCount || 0),
    describedJobCount: Number(stats.describedJobCount || 0),
    watching: Boolean(stats.watching)
  };
}

function inferSearchContext(page, diagnostics) {
  const url = page.url || diagnostics.url || "";
  let query = "";
  let city = "";
  try {
    const parsed = new URL(url);
    query = parsed.searchParams.get("query") || parsed.searchParams.get("ka") || "";
    city = parsed.searchParams.get("city") || "";
  } catch {
    query = "";
    city = "";
  }

  return {
    url,
    title: cleanText(page.title || diagnostics.title || ""),
    query: cleanText(query),
    city: cleanText(city)
  };
}

function scheduleAutoSync(settings) {
  clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => {
    runAutoSync().catch(() => {});
  }, settings.autoSyncDebounceMs);
}

async function runAutoSync() {
  if (autoSyncInFlight) {
    autoSyncPending = true;
    return;
  }

  autoSyncInFlight = true;
  try {
    await syncCache(null);
  } finally {
    autoSyncInFlight = false;
    if (autoSyncPending) {
      autoSyncPending = false;
      const settings = await getSettings();
      scheduleAutoSync(settings);
    }
  }
}

function validateCapture(capture) {
  if (!capture || typeof capture !== "object") {
    throw new Error("Capture payload is required");
  }
  if (!Array.isArray(capture.jobs)) {
    throw new Error("Capture payload must include jobs[]");
  }
}

function storageGet(key) {
  return chrome.storage.local.get(key).then((result) => result[key]);
}

function storageSet(key, value) {
  return chrome.storage.local.set({ [key]: value });
}

function normalizeBaseUrl(value) {
  const url = String(value || DEFAULT_SETTINGS.backendUrl).trim();
  return url.replace(/\/+$/, "") || DEFAULT_SETTINGS.backendUrl;
}

function normalizePath(value) {
  const path = String(value || DEFAULT_SETTINGS.syncPath).trim();
  return path.startsWith("/") ? path : `/${path}`;
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function parseBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return Boolean(fallback);
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanMultiline(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(cleanText).filter(Boolean).slice(0, 30);
}

function normalizeDelimitedStringArray(value) {
  if (Array.isArray(value)) {
    return normalizeStringArray(value);
  }
  return String(value || "")
    .split(/[\n,，、;；|]+/)
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 30);
}

function unionStrings(left = [], right = []) {
  return Array.from(new Set([...normalizeStringArray(left), ...normalizeStringArray(right)]));
}

function chooseLonger(left = "", right = "") {
  return String(right || "").length > String(left || "").length ? right : left;
}

function normalizeUrl(value, base) {
  if (!value) {
    return "";
  }
  try {
    return new URL(value, base || "https://www.zhipin.com").toString();
  } catch {
    return String(value);
  }
}

function extractJobId(url) {
  const match = String(url || "").match(/\/job_detail\/([^/?#]+?)(?:\.html)?(?:[?#]|$)/);
  return match ? match[1] : "";
}

function stableKey(parts) {
  return parts.map((part) => cleanText(part)).filter(Boolean).join("|").toLowerCase();
}
