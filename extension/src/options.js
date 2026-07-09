const fields = {
  autoSync: document.getElementById("autoSync"),
  backendUrl: document.getElementById("backendUrl"),
  syncPath: document.getElementById("syncPath"),
  token: document.getElementById("token"),
  maxCachedJobs: document.getElementById("maxCachedJobs"),
  crawlMaxJobs: document.getElementById("crawlMaxJobs"),
  crawlDelayMs: document.getElementById("crawlDelayMs"),
  riskGateEnabled: document.getElementById("riskGateEnabled"),
  excludedDirections: document.getElementById("excludedDirections")
};

const ui = {
  save: document.getElementById("save"),
  refreshDiagnostics: document.getElementById("refreshDiagnostics"),
  refreshWorkflow: document.getElementById("refreshWorkflow"),
  refreshScreening: document.getElementById("refreshScreening"),
  runRulesBatchScreening: document.getElementById("runRulesBatchScreening"),
  runRiskGateRescreen: document.getElementById("runRiskGateRescreen"),
  refreshResume: document.getElementById("refreshResume"),
  runSelectedResumeWorkflow: document.getElementById("runSelectedResumeWorkflow"),
  prepareRulesResume: document.getElementById("prepareRulesResume"),
  evaluateResumeFit: document.getElementById("evaluateResumeFit"),
  verifyResumeClaims: document.getElementById("verifyResumeClaims"),
  reviseResumeFromChecks: document.getElementById("reviseResumeFromChecks"),
  auditRulesResume: document.getElementById("auditRulesResume"),
  refreshGreeting: document.getElementById("refreshGreeting"),
  prepareGreetingDryRun: document.getElementById("prepareGreetingDryRun"),
  runGreetingDryRunTask: document.getElementById("runGreetingDryRunTask"),
  queueConversationRefreshTask: document.getElementById("queueConversationRefreshTask"),
  queueResumeUnlockCheckTask: document.getElementById("queueResumeUnlockCheckTask"),
  queueResumeUploadDryRunTask: document.getElementById("queueResumeUploadDryRunTask"),
  queueSubmitApplicationDryRunTask: document.getElementById("queueSubmitApplicationDryRunTask"),
  runReadOnlyBossTask: document.getElementById("runReadOnlyBossTask"),
  greetingConversations: document.getElementById("greetingConversations"),
  submissionReadinessQueue: document.getElementById("submissionReadinessQueue"),
  clearCache: document.getElementById("clearCache"),
  status: document.getElementById("status"),
  browserTaskQueued: document.getElementById("browserTaskQueued"),
  browserTaskRunning: document.getElementById("browserTaskRunning"),
  browserTaskSucceeded: document.getElementById("browserTaskSucceeded"),
  browserTaskFailed: document.getElementById("browserTaskFailed"),
  browserTaskFailures: document.getElementById("browserTaskFailures"),
  browserTaskRecent: document.getElementById("browserTaskRecent"),
  currentPageTaskStatus: document.getElementById("currentPageTaskStatus"),
  currentPageUrl: document.getElementById("currentPageUrl"),
  currentPageQueued: document.getElementById("currentPageQueued"),
  currentPageRunning: document.getElementById("currentPageRunning"),
  currentPageFailed: document.getElementById("currentPageFailed"),
  currentPageCanceled: document.getElementById("currentPageCanceled"),
  currentPageTaskRecent: document.getElementById("currentPageTaskRecent"),
  requeueCurrentPage: document.getElementById("requeueCurrentPage"),
  cancelCurrentPage: document.getElementById("cancelCurrentPage"),
  qualityDescriptionCoverage: document.getElementById("qualityDescriptionCoverage"),
  qualityRequiredCoverage: document.getElementById("qualityRequiredCoverage"),
  qualityInvalidJobs: document.getElementById("qualityInvalidJobs"),
  qualityStatus: document.getElementById("qualityStatus"),
  qualityEvents: document.getElementById("qualityEvents"),
  screeningStatus: document.getElementById("screeningStatus"),
  screeningCandidateCount: document.getElementById("screeningCandidateCount"),
  screeningResultCount: document.getElementById("screeningResultCount"),
  agentRunCount: document.getElementById("agentRunCount"),
  screeningCandidates: document.getElementById("screeningCandidates"),
  screeningResults: document.getElementById("screeningResults"),
  agentRuns: document.getElementById("agentRuns"),
  refreshCareerContext: document.getElementById("refreshCareerContext"),
  generateCareerContext: document.getElementById("generateCareerContext"),
  generateCareerContextWithAnswers: document.getElementById("generateCareerContextWithAnswers"),
  generateProfileFactDrafts: document.getElementById("generateProfileFactDrafts"),
  refreshProfileFactDrafts: document.getElementById("refreshProfileFactDrafts"),
  regenerateCareerContextAfterFacts: document.getElementById("regenerateCareerContextAfterFacts"),
  careerContextStatus: document.getElementById("careerContextStatus"),
  careerContextAnswerStatus: document.getElementById("careerContextAnswerStatus"),
  profileFactDraftStatus: document.getElementById("profileFactDraftStatus"),
  careerContextFreshnessStatus: document.getElementById("careerContextFreshnessStatus"),
  careerContextExists: document.getElementById("careerContextExists"),
  careerContextBytes: document.getElementById("careerContextBytes"),
  careerContextQuestionCount: document.getElementById("careerContextQuestionCount"),
  careerContextMeta: document.getElementById("careerContextMeta"),
  careerContextQuestions: document.getElementById("careerContextQuestions"),
  careerContextAnswerForm: document.getElementById("careerContextAnswerForm"),
  profileFactDrafts: document.getElementById("profileFactDrafts"),
  careerContextPreview: document.getElementById("careerContextPreview"),
  resumeStatus: document.getElementById("resumeStatus"),
  resumeCandidateCount: document.getElementById("resumeCandidateCount"),
  resumeVersionCount: document.getElementById("resumeVersionCount"),
  resumeAuditCount: document.getElementById("resumeAuditCount"),
  resumeFitEvaluationCount: document.getElementById("resumeFitEvaluationCount"),
  resumeClaimVerificationCount: document.getElementById("resumeClaimVerificationCount"),
  resumeCandidates: document.getElementById("resumeCandidates"),
  resumeVersions: document.getElementById("resumeVersions"),
  resumeAudits: document.getElementById("resumeAudits"),
  resumeFitEvaluations: document.getElementById("resumeFitEvaluations"),
  resumeClaimVerifications: document.getElementById("resumeClaimVerifications"),
  resumeDetailTitle: document.getElementById("resumeDetailTitle"),
  resumeDetailStatus: document.getElementById("resumeDetailStatus"),
  resumeFieldPreview: document.getElementById("resumeFieldPreview"),
  resumeDiffSummary: document.getElementById("resumeDiffSummary"),
  resumeSourceMapping: document.getElementById("resumeSourceMapping"),
  resumeAuditRisk: document.getElementById("resumeAuditRisk"),
  resumeFitDetail: document.getElementById("resumeFitDetail"),
  resumeClaimDetail: document.getElementById("resumeClaimDetail"),
  toggleResumeEditor: document.getElementById("toggleResumeEditor"),
  saveResumeRevision: document.getElementById("saveResumeRevision"),
  approveResumeLocal: document.getElementById("approveResumeLocal"),
  resumeEditor: document.getElementById("resumeEditor"),
  resumeEditSummary: document.getElementById("resumeEditSummary"),
  resumeEditSkills: document.getElementById("resumeEditSkills"),
  resumeEditProjects: document.getElementById("resumeEditProjects"),
  resumeEditAwards: document.getElementById("resumeEditAwards"),
  resumeEditReason: document.getElementById("resumeEditReason"),
  greetingStatus: document.getElementById("greetingStatus"),
  greetingMessages: document.getElementById("greetingMessages"),
  greetingTasks: document.getElementById("greetingTasks"),
  recentEventCount: document.getElementById("recentEventCount"),
  recentEvents: document.getElementById("recentEvents"),
  missingDescriptionCount: document.getElementById("missingDescriptionCount"),
  missingDescriptions: document.getElementById("missingDescriptions"),
  workflowStatus: document.getElementById("workflowStatus"),
  workflowOpenErrorCount: document.getElementById("workflowOpenErrorCount"),
  workflowEventCount: document.getElementById("workflowEventCount"),
  workflowTimelineApplicationId: document.getElementById("workflowTimelineApplicationId"),
  workflowErrors: document.getElementById("workflowErrors"),
  workflowEvents: document.getElementById("workflowEvents"),
  workflowTimelineStatus: document.getElementById("workflowTimelineStatus"),
  workflowTimeline: document.getElementById("workflowTimeline"),
  preview: document.getElementById("preview")
};

const state = {
  resumeVersions: [],
  resumeAudits: [],
  resumeFitEvaluations: [],
  resumeClaimVerifications: [],
  selectedResumeVersionId: null,
  selectedResumeAuditId: null,
  selectedResumeFitEvaluationId: null,
  selectedResumeClaimVerificationId: null,
  selectedResumeVersion: null,
  selectedResumeAudit: null,
  selectedResumeFitEvaluation: null,
  selectedResumeClaimVerification: null,
  careerContext: null,
  careerContextQuestions: [],
  careerContextAnswers: [],
  profileFactDrafts: [],
  careerContextNeedsRegeneration: false,
  workflowErrors: [],
  workflowEvents: [],
  selectedTimelineApplicationId: null
};

ensureGreetingDryRunControls();

function ensureGreetingDryRunControls() {
  const prepareButton = ui.prepareGreetingDryRun;
  if (!prepareButton?.parentElement) {
    return;
  }
  const controls = [
    ["runGreetingDryRunTask", "Run SEND_GREETING dry-run"],
    ["queueConversationRefreshTask", "Queue REFRESH_CONVERSATION"],
    ["queueResumeUnlockCheckTask", "Queue CHECK_RESUME_UNLOCK"],
    ["queueResumeUploadDryRunTask", "Queue UPLOAD_RESUME dry-run"],
    ["queueSubmitApplicationDryRunTask", "Queue SUBMIT_APPLICATION dry-run"],
    ["runReadOnlyBossTask", "Run read-only BOSS task"]
  ];
  let after = prepareButton;
  for (const [id, label] of controls) {
    if (!ui[id]) {
      const button = document.createElement("button");
      button.id = id;
      button.className = "secondary";
      button.type = "button";
      button.textContent = label;
      after.insertAdjacentElement("afterend", button);
      ui[id] = button;
    }
    after = ui[id] || after;
  }

  if (!ui.greetingConversations && ui.greetingTasks?.parentElement?.parentElement) {
    const column = document.createElement("div");
    const heading = document.createElement("div");
    heading.className = "list-heading";
    heading.textContent = "会话/解锁状态";
    const list = document.createElement("div");
    list.id = "greetingConversations";
    list.className = "list compact-list";
    list.textContent = "暂无会话状态";
    column.append(heading, list);
    ui.greetingTasks.parentElement.parentElement.appendChild(column);
    ui.greetingConversations = list;
  }
  if (!ui.submissionReadinessQueue && ui.greetingTasks?.parentElement?.parentElement) {
    const column = document.createElement("div");
    const heading = document.createElement("div");
    heading.className = "list-heading";
    heading.textContent = "投递准备复核队列";
    const list = document.createElement("div");
    list.id = "submissionReadinessQueue";
    list.className = "list compact-list";
    list.textContent = "暂无待复核投递准备项";
    column.append(heading, list);
    ui.greetingTasks.parentElement.parentElement.appendChild(column);
    ui.submissionReadinessQueue = list;
  }
}

document.addEventListener("DOMContentLoaded", init);
ui.save.addEventListener("click", save);
ui.refreshDiagnostics.addEventListener("click", () => refreshDiagnostics());
ui.refreshWorkflow.addEventListener("click", () => refreshWorkflowDiagnostics());
ui.refreshScreening.addEventListener("click", () => refreshScreeningDiagnostics());
ui.runRulesBatchScreening.addEventListener("click", runRulesBatchScreening);
ui.runRiskGateRescreen.addEventListener("click", runRiskGateRescreen);
ui.refreshCareerContext.addEventListener("click", () => refreshCareerContextDiagnostics());
ui.generateCareerContext.addEventListener("click", () => generateCareerContext({ includeAnswers: false }));
ui.generateCareerContextWithAnswers.addEventListener("click", () => generateCareerContext({ includeAnswers: true }));
ui.generateProfileFactDrafts.addEventListener("click", generateProfileFactDraftsFromAnswers);
ui.refreshProfileFactDrafts.addEventListener("click", () => refreshProfileFactDrafts());
ui.regenerateCareerContextAfterFacts.addEventListener("click", () => generateCareerContext({ includeAnswers: true, afterFactChange: true }));
ui.refreshResume.addEventListener("click", () => refreshResumeDiagnostics());
ui.runSelectedResumeWorkflow.addEventListener("click", () => runResumeWorkflowForSelectedApplication());
ui.prepareRulesResume.addEventListener("click", prepareRulesResume);
ui.evaluateResumeFit.addEventListener("click", evaluateSelectedResumeFit);
ui.verifyResumeClaims.addEventListener("click", verifySelectedResumeClaims);
ui.reviseResumeFromChecks.addEventListener("click", reviseSelectedResumeFromChecks);
ui.auditRulesResume.addEventListener("click", auditRulesResume);
ui.refreshGreeting.addEventListener("click", () => refreshGreetingDiagnostics());
ui.prepareGreetingDryRun.addEventListener("click", prepareGreetingDryRun);
ui.runGreetingDryRunTask.addEventListener("click", runGreetingDryRunTask);
ui.queueConversationRefreshTask.addEventListener("click", () => queueReadOnlyBossTask("REFRESH_CONVERSATION"));
ui.queueResumeUnlockCheckTask.addEventListener("click", () => queueReadOnlyBossTask("CHECK_RESUME_UNLOCK"));
ui.queueResumeUploadDryRunTask.addEventListener("click", () => queueReadOnlyBossTask("UPLOAD_RESUME"));
ui.queueSubmitApplicationDryRunTask.addEventListener("click", () => queueReadOnlyBossTask("SUBMIT_APPLICATION"));
ui.runReadOnlyBossTask.addEventListener("click", runReadOnlyBossTask);
ui.toggleResumeEditor.addEventListener("click", toggleResumeEditor);
ui.saveResumeRevision.addEventListener("click", saveResumeRevision);
ui.approveResumeLocal.addEventListener("click", approveResumeLocal);
ui.clearCache.addEventListener("click", clearCache);
ui.requeueCurrentPage.addEventListener("click", requeueCurrentPageTasks);
ui.cancelCurrentPage.addEventListener("click", cancelCurrentPageTasks);
clearResumeDetail();

async function init() {
  try {
    const settings = await runtimeMessage({ type: "GET_SETTINGS" });
    renderSettings(settings);
    await refreshDiagnostics({ silent: true });
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

async function save() {
  try {
    const settings = await runtimeMessage({
      type: "SAVE_SETTINGS",
      settings: readSettings()
    });
    renderSettings(settings);
    setStatus("设置已保存");
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

function readSettings() {
  return {
    autoSync: fields.autoSync.checked,
    backendUrl: fields.backendUrl.value,
    syncPath: fields.syncPath.value,
    token: fields.token.value,
    maxCachedJobs: fields.maxCachedJobs.value,
    crawlMaxJobs: fields.crawlMaxJobs.value,
    crawlDelayMs: fields.crawlDelayMs.value,
    riskGateEnabled: fields.riskGateEnabled.checked,
    excludedDirections: parseDelimitedList(fields.excludedDirections.value)
  };
}

function renderSettings(settings) {
  fields.autoSync.checked = Boolean(settings.autoSync);
  fields.backendUrl.value = settings.backendUrl || "";
  fields.syncPath.value = settings.syncPath || "";
  fields.token.value = settings.token || "";
  fields.maxCachedJobs.value = settings.maxCachedJobs || 500;
  fields.crawlMaxJobs.value = settings.crawlMaxJobs || 30;
  fields.crawlDelayMs.value = settings.crawlDelayMs || 1600;
  fields.riskGateEnabled.checked = Boolean(settings.riskGateEnabled);
  fields.excludedDirections.value = formatDelimitedList(settings.excludedDirections);
}

function parseDelimitedList(value) {
  return String(value || "")
    .split(/[\n,，、;；|]+/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 30);
}

function formatDelimitedList(value) {
  return (Array.isArray(value) ? value : parseDelimitedList(value)).join("、");
}

async function refreshDiagnostics(options = {}) {
  setStatus(options.silent ? "" : "正在刷新诊断");
  const [cacheResult, qualityResult, eventsResult, taskResult, missingResult, pageResult, workflowResult, screeningResult, careerContextResult, resumeResult, greetingResult] = await Promise.allSettled([
    runtimeMessage({ type: "GET_CACHE" }),
    runtimeMessage({ type: "GET_QUALITY" }),
    runtimeMessage({ type: "GET_EVENTS", limit: 8 }),
    runtimeMessage({ type: "GET_BROWSER_TASK_DIAGNOSTICS", limit: 8 }),
    runtimeMessage({ type: "GET_MISSING_DESCRIPTIONS", limit: 8 }),
    runtimeMessage({ type: "GET_LAST_BOSS_PAGE" }),
    loadWorkflowDiagnostics(),
    loadScreeningDiagnostics(),
    loadCareerContextDiagnostics(),
    loadResumeDiagnostics(),
    loadGreetingDiagnostics()
  ]);

  if (cacheResult.status === "fulfilled") {
    renderCache(cacheResult.value);
  }
  if (qualityResult.status === "fulfilled") {
    renderQuality(qualityResult.value.report);
  } else {
    renderQuality(null, qualityResult.reason);
  }
  if (eventsResult.status === "fulfilled") {
    renderEvents(eventsResult.value.events || []);
  } else {
    renderEvents([], eventsResult.reason);
  }
  if (taskResult.status === "fulfilled") {
    renderTaskDiagnostics(taskResult.value.diagnostics || {});
  } else {
    renderTaskDiagnostics(null, taskResult.reason);
  }
  if (pageResult.status === "fulfilled") {
    await refreshCurrentPageDiagnostics(pageResult.value);
  } else {
    renderCurrentPageDiagnostics(null, pageResult.reason);
  }
  if (missingResult.status === "fulfilled") {
    renderMissingDescriptions(missingResult.value.jobs || [], missingResult.value.totalMissingDescriptions || 0);
  } else {
    renderMissingDescriptions([], 0, missingResult.reason);
  }
  if (workflowResult.status === "fulfilled") {
    renderWorkflowDiagnostics(workflowResult.value);
  } else {
    renderWorkflowDiagnostics(null, workflowResult.reason);
  }
  if (screeningResult.status === "fulfilled") {
    renderScreeningDiagnostics(screeningResult.value);
  } else {
    renderScreeningDiagnostics(null, screeningResult.reason);
  }
  if (careerContextResult.status === "fulfilled") {
    renderCareerContextDiagnostics(careerContextResult.value);
  } else {
    renderCareerContextDiagnostics(null, careerContextResult.reason);
  }
  if (resumeResult.status === "fulfilled") {
    renderResumeDiagnostics(resumeResult.value);
  } else {
    renderResumeDiagnostics(null, resumeResult.reason);
  }
  if (greetingResult.status === "fulfilled") {
    renderGreetingDiagnostics(greetingResult.value);
  } else {
    renderGreetingDiagnostics(null, greetingResult.reason);
  }

  const failed = [cacheResult, qualityResult, eventsResult, taskResult, missingResult, pageResult, workflowResult, screeningResult, careerContextResult, resumeResult, greetingResult].find((item) => item.status === "rejected");
  if (failed) {
    setStatus(failed.reason?.message || String(failed.reason), true);
    return;
  }
  setStatus("诊断已刷新");
}

async function refreshScreeningDiagnostics(options = {}) {
  try {
    ui.screeningStatus.textContent = options.silent ? "" : "正在刷新筛选数据";
    const diagnostics = await loadScreeningDiagnostics();
    renderScreeningDiagnostics(diagnostics);
    setStatus("筛选数据已刷新");
  } catch (error) {
    renderScreeningDiagnostics(null, error);
    setStatus(error.message || String(error), true);
  }
}

async function refreshWorkflowDiagnostics(options = {}) {
  try {
    ui.workflowStatus.textContent = options.silent ? "" : "Loading workflow logs";
    const diagnostics = await loadWorkflowDiagnostics();
    renderWorkflowDiagnostics(diagnostics);
    if (state.selectedTimelineApplicationId) {
      await viewWorkflowTimeline(state.selectedTimelineApplicationId, { preserveStatus: true });
    }
    setStatus("Workflow logs refreshed");
  } catch (error) {
    renderWorkflowDiagnostics(null, error);
    setStatus(error.message || String(error), true);
  }
}

async function loadWorkflowDiagnostics() {
  const [errorResult, eventResult] = await Promise.all([
    runtimeMessage({ type: "GET_WORKFLOW_ERRORS", options: { limit: 8, status: "OPEN" } }),
    runtimeMessage({ type: "GET_WORKFLOW_EVENTS", options: { limit: 12 } })
  ]);
  return {
    errors: errorResult.response || {},
    events: eventResult.response || {}
  };
}

async function loadScreeningDiagnostics() {
  const [candidateResult, screeningResult, runResult] = await Promise.all([
    runtimeMessage({ type: "GET_SCREENING_CANDIDATES", options: { limit: 8, minDescriptionLength: 80 } }),
    runtimeMessage({ type: "GET_SCREENINGS", options: { limit: 8 } }),
    runtimeMessage({ type: "GET_AGENT_RUNS", options: { limit: 8 } })
  ]);
  return {
    candidates: candidateResult.response || {},
    screenings: screeningResult.response || {},
    runs: runResult.response || {}
  };
}

async function runRulesBatchScreening() {
  try {
    ui.runRulesBatchScreening.disabled = true;
    ui.screeningStatus.textContent = "正在执行规则批量筛选";
    const result = await runtimeMessage({
      type: "SCREEN_APPLICATION_BATCH",
      options: {
        mode: "rules",
        limit: 10,
        continueOnError: true
      }
    });
    await refreshScreeningDiagnostics({ silent: true });
    const response = result.response || {};
    setStatus(`规则筛选完成：成功 ${response.succeeded || 0}，失败 ${response.failed || 0}`);
  } catch (error) {
    renderScreeningDiagnostics(null, error);
    setStatus(error.message || String(error), true);
  } finally {
    ui.runRulesBatchScreening.disabled = false;
  }
}

async function runRiskGateRescreen() {
  const excludedDirections = parseDelimitedList(fields.excludedDirections.value);
  if (!fields.riskGateEnabled.checked) {
    setStatus("请先启用 JD 风险门禁，再按新规则重筛。", true);
    return;
  }
  if (!excludedDirections.length) {
    setStatus("请先填写至少一个不想去的方向，例如：销售、直播。", true);
    return;
  }

  try {
    ui.runRiskGateRescreen.disabled = true;
    ui.screeningStatus.textContent = "正在按新风险规则重筛";
    const savedSettings = await runtimeMessage({
      type: "SAVE_SETTINGS",
      settings: {
        ...readSettings(),
        riskGateEnabled: true,
        excludedDirections
      }
    });
    renderSettings(savedSettings);
    const result = await runtimeMessage({
      type: "SCREEN_APPLICATION_BATCH",
      options: {
        mode: "rules",
        limit: 50,
        continueOnError: true,
        riskGateOnly: true,
        includeAlreadyScreened: true,
        statuses: ["DETAIL_CAPTURED", "SCORED", "SHORTLISTED", "NEEDS_USER_REVIEW"],
        userRules: {
          excludedDirections
        }
      }
    });
    await refreshScreeningDiagnostics({ silent: true });
    const response = result.response || {};
    setStatus(`风险重筛完成：成功 ${response.succeeded || 0}，失败 ${response.failed || 0}`);
  } catch (error) {
    renderScreeningDiagnostics(null, error);
    setStatus(error.message || String(error), true);
  } finally {
    ui.runRiskGateRescreen.disabled = false;
  }
}

async function refreshCareerContextDiagnostics(options = {}) {
  try {
    ui.careerContextStatus.textContent = options.silent ? "" : "正在读取职业经历上下文";
    const diagnostics = await loadCareerContextDiagnostics();
    renderCareerContextDiagnostics(diagnostics);
    setStatus("职业经历上下文已刷新");
  } catch (error) {
    renderCareerContextDiagnostics(null, error);
    setStatus(error.message || String(error), true);
  }
}

async function loadCareerContextDiagnostics() {
  const [contextResult, draftResult] = await Promise.all([
    runtimeMessage({ type: "GET_CAREER_CONTEXT" }),
    runtimeMessage({
      type: "GET_PROFILE_FACT_DRAFTS",
      options: {
        status: "PENDING",
        limit: 20
      }
    })
  ]);
  return {
    ...(contextResult.response || {}),
    factDrafts: draftResult.response || {}
  };
}

async function generateCareerContext(options = {}) {
  const includeAnswers = Boolean(options.includeAnswers);
  const answers = includeAnswers ? readCareerContextAnswers() : [];
  try {
    ui.generateCareerContext.disabled = true;
    ui.generateCareerContextWithAnswers.disabled = true;
    ui.regenerateCareerContextAfterFacts.disabled = true;
    ui.careerContextStatus.textContent = "ProfileAgent 正在生成职业经历上下文";
    const result = await runtimeMessage({
      type: "GENERATE_CAREER_CONTEXT",
      options: {
        answers,
        writeFile: true
      }
    });
    renderCareerContextDiagnostics(result.response || {});
    state.careerContextNeedsRegeneration = false;
    updateCareerContextFreshnessStatus();
    await refreshWorkflowDiagnostics({ silent: true }).catch(() => {});
    const questions = normalizeCareerContextQuestions(result.response || {});
    setStatus(`ProfileAgent 已生成 career_agent_context.md，带入回答 ${answers.length} 条，待追问 ${questions.length} 项`);
  } catch (error) {
    renderCareerContextDiagnostics(null, error);
    await refreshWorkflowDiagnostics({ silent: true }).catch(() => {});
    setStatus(error.message || String(error), true);
  } finally {
    ui.generateCareerContext.disabled = false;
    ui.generateCareerContextWithAnswers.disabled = false;
    ui.regenerateCareerContextAfterFacts.disabled = !state.careerContextNeedsRegeneration;
  }
}

async function refreshProfileFactDrafts(options = {}) {
  try {
    ui.profileFactDraftStatus.textContent = options.silent ? "" : "正在读取待确认事实草稿";
    const result = await runtimeMessage({
      type: "GET_PROFILE_FACT_DRAFTS",
      options: {
        status: "PENDING",
        limit: 20
      }
    });
    renderProfileFactDrafts(result.response || {});
    if (!options.silent) {
      setStatus("待确认事实草稿已刷新");
    }
  } catch (error) {
    renderProfileFactDrafts(null, error);
    setStatus(error.message || String(error), true);
  }
}

async function generateProfileFactDraftsFromAnswers() {
  const answers = readCareerContextAnswers();
  if (!answers.length) {
    setStatus("请先填写 ProfileAgent 追问回答，再生成事实草稿。", true);
    return;
  }
  try {
    ui.generateProfileFactDrafts.disabled = true;
    ui.refreshProfileFactDrafts.disabled = true;
    ui.profileFactDraftStatus.textContent = "正在把当前回答生成待确认事实草稿";
    const result = await runtimeMessage({
      type: "GENERATE_PROFILE_FACT_DRAFTS",
      options: {
        answers
      }
    });
    renderProfileFactDrafts(result.response || {});
    await refreshProfileFactDrafts({ silent: true });
    await refreshWorkflowDiagnostics({ silent: true }).catch(() => {});
    const payload = result.response || {};
    setStatus(`事实草稿生成完成：新增 ${payload.created || 0}，跳过 ${payload.skipped || 0}`);
  } catch (error) {
    renderProfileFactDrafts(null, error);
    await refreshWorkflowDiagnostics({ silent: true }).catch(() => {});
    setStatus(error.message || String(error), true);
  } finally {
    ui.generateProfileFactDrafts.disabled = false;
    ui.refreshProfileFactDrafts.disabled = false;
  }
}

async function confirmProfileFactDraftFromOptions(draftId) {
  const draft = state.profileFactDrafts.find((item) => Number(item.id) === Number(draftId));
  await mutateProfileFactDraft({
    draftId,
    type: "CONFIRM_PROFILE_FACT_DRAFT",
    statusMessage: `正在确认事实草稿 #${draftId}`,
    doneMessage: `事实草稿 #${draftId} 已确认，建议重新生成职业上下文`,
    options: {
      content: readProfileFactDraftEdit(draft)
    }
  });
}

async function rejectProfileFactDraftFromOptions(draftId) {
  await mutateProfileFactDraft({
    draftId,
    type: "REJECT_PROFILE_FACT_DRAFT",
    statusMessage: `正在拒绝事实草稿 #${draftId}`,
    doneMessage: `事实草稿 #${draftId} 已拒绝`,
    options: {
      reason: "options_profile_fact_rejected"
    }
  });
}

async function mutateProfileFactDraft({ draftId, type, statusMessage, doneMessage, options = {} }) {
  try {
    setStatus(statusMessage);
    await runtimeMessage({
      type,
      draftId,
      options
    });
    state.careerContextNeedsRegeneration = true;
    updateCareerContextFreshnessStatus();
    await refreshProfileFactDrafts({ silent: true });
    await refreshWorkflowDiagnostics({ silent: true }).catch(() => {});
    setStatus(doneMessage);
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

async function refreshResumeDiagnostics(options = {}) {
  try {
    ui.resumeStatus.textContent = options.silent ? "" : "正在刷新简历数据";
    const diagnostics = await loadResumeDiagnostics();
    renderResumeDiagnostics(diagnostics);
    setStatus("简历数据已刷新");
  } catch (error) {
    renderResumeDiagnostics(null, error);
    setStatus(error.message || String(error), true);
  }
}

async function loadResumeDiagnostics() {
  const [candidateResult, versionResult, auditResult, fitResult, claimResult] = await Promise.all([
    runtimeMessage({
      type: "GET_RESUME_CANDIDATES",
      options: {
        limit: 8,
        minDescriptionLength: 80,
        recommendations: ["auto_prepare"],
        statuses: ["SHORTLISTED"],
        excludeExistingResume: true
      }
    }),
    runtimeMessage({ type: "GET_RESUME_VERSIONS", options: { limit: 8 } }),
    runtimeMessage({ type: "GET_RESUME_AUDITS", options: { limit: 8 } }),
    runtimeMessage({ type: "GET_RESUME_FIT_EVALUATIONS", options: { limit: 8 } }),
    runtimeMessage({ type: "GET_RESUME_CLAIM_VERIFICATIONS", options: { limit: 8 } })
  ]);
  return {
    candidates: candidateResult.response || {},
    versions: versionResult.response || {},
    audits: auditResult.response || {},
    fits: fitResult.response || {},
    claims: claimResult.response || {}
  };
}

async function prepareRulesResume() {
  try {
    ui.prepareRulesResume.disabled = true;
    ui.resumeStatus.textContent = "正在生成规则简历";
    const diagnostics = await loadResumeDiagnostics();
    const candidates = Array.isArray(diagnostics.candidates?.candidates) ? diagnostics.candidates.candidates : [];
    const candidate = candidates[0];
    if (!candidate?.id) {
      throw new Error("暂无可定制简历的 shortlist 岗位，请先完成规则筛选。");
    }
    const result = await runtimeMessage({
      type: "PREPARE_RESUME",
      applicationId: candidate.id,
      options: {
        mode: "rules",
        renderDocx: true,
        screeningId: candidate.screeningId || ""
      }
    });
    await refreshResumeDiagnostics({ silent: true });
    await refreshScreeningDiagnostics({ silent: true });
    const resumeVersion = result.response?.resumeVersion || {};
    if (resumeVersion.id) {
      await showResumeVersionDetail(resumeVersion.id);
    }
    setStatus(`规则简历已生成：#${resumeVersion.id || ""} ${resumeVersion.filePath ? "DOCX 已渲染" : "结构化版本已保存"}`.trim());
  } catch (error) {
    renderResumeDiagnostics(null, error);
    setStatus(error.message || String(error), true);
  } finally {
    ui.prepareRulesResume.disabled = false;
  }
}

async function runResumeWorkflowForSelectedApplication(applicationId = null) {
  let targetApplicationId = Number(applicationId || state.selectedResumeVersion?.applicationId || 0);
  try {
    ui.runSelectedResumeWorkflow.disabled = true;
    ui.resumeStatus.textContent = "正在运行简历闭环";
    if (!targetApplicationId) {
      const diagnostics = await loadResumeDiagnostics();
      const candidates = Array.isArray(diagnostics.candidates?.candidates) ? diagnostics.candidates.candidates : [];
      targetApplicationId = Number(candidates[0]?.id || 0);
    }
    if (!Number.isInteger(targetApplicationId) || targetApplicationId <= 0) {
      throw new Error("暂无可运行简历闭环的岗位，请先完成岗位筛选并确保 JD 已补齐。");
    }
    const result = await runtimeMessage({
      type: "RUN_RESUME_WORKFLOW_GRAPH",
      applicationId: targetApplicationId,
      options: {
        mode: "rules",
        renderDocx: true,
        maxRevisions: 1,
        userRules: {
          forceRescreen: false
        }
      }
    });
    const response = result.response || {};
    await refreshResumeDiagnostics({ silent: true });
    await refreshWorkflowDiagnostics({ silent: true }).catch(() => {});
    await refreshScreeningDiagnostics({ silent: true }).catch(() => {});
    if (response.resumeVersion?.id) {
      await showResumeVersionDetail(response.resumeVersion.id);
    }
    if (targetApplicationId) {
      await viewWorkflowTimeline(targetApplicationId, { preserveStatus: true }).catch(() => {});
    }
    const fit = response.resumeFitEvaluation || {};
    const docxLabel = response.resumeVersion?.filePath ? `DOCX ${shortPath(response.resumeVersion.filePath)}` : "DOCX 未生成";
    setStatus(`简历闭环完成：岗位 #${targetApplicationId}，fit ${formatScore(fit.coverageScore)}/100，${docxLabel}`);
  } catch (error) {
    await refreshWorkflowDiagnostics({ silent: true }).catch(() => {});
    if (targetApplicationId) {
      await viewWorkflowTimeline(targetApplicationId, { preserveStatus: true }).catch(() => {});
    }
    renderResumeDiagnostics(null, error);
    setStatus(error.message || String(error), true);
  } finally {
    ui.runSelectedResumeWorkflow.disabled = false;
  }
}

async function evaluateSelectedResumeFit() {
  try {
    ui.evaluateResumeFit.disabled = true;
    ui.resumeStatus.textContent = "Evaluating resume/JD fit";
    const diagnostics = await loadResumeDiagnostics();
    const versions = Array.isArray(diagnostics.versions?.resumeVersions) ? diagnostics.versions.resumeVersions : [];
    const fits = Array.isArray(diagnostics.fits?.resumeFitEvaluations) ? diagnostics.fits.resumeFitEvaluations : [];
    const evaluatedVersionIds = new Set(fits.map((fit) => Number(fit.resumeVersionId || 0)).filter(Boolean));
    const selectedId = Number(state.selectedResumeVersionId || 0);
    const target = selectedId
      ? versions.find((version) => Number(version.id) === selectedId) || state.selectedResumeVersion
      : versions.find((version) => !evaluatedVersionIds.has(Number(version.id)) && ["DRAFTED", "NEEDS_AUDIT", "APPROVED"].includes(version.status))
        || versions.find((version) => ["DRAFTED", "NEEDS_AUDIT", "APPROVED"].includes(version.status))
        || versions[0];
    if (!target?.id) {
      throw new Error("No resume version is available for JD fit evaluation. Generate a resume first.");
    }
    const result = await runtimeMessage({
      type: "EVALUATE_RESUME_FIT",
      resumeVersionId: target.id,
      options: {
        mode: "rules"
      }
    });
    await refreshResumeDiagnostics({ silent: true });
    await refreshWorkflowDiagnostics({ silent: true }).catch(() => {});
    const evaluation = result.response?.resumeFitEvaluation || {};
    if (target.id) {
      await showResumeVersionDetail(target.id);
    }
    setStatus(`Resume fit evaluated: #${evaluation.id || ""} ${formatFitLevel(evaluation.fitLevel)} ${formatScore(evaluation.coverageScore)}/100`.trim());
  } catch (error) {
    renderResumeDiagnostics(null, error);
    setStatus(error.message || String(error), true);
  } finally {
    ui.evaluateResumeFit.disabled = false;
  }
}

async function verifySelectedResumeClaims() {
  try {
    ui.verifyResumeClaims.disabled = true;
    ui.resumeStatus.textContent = "Verifying resume claims";
    const diagnostics = await loadResumeDiagnostics();
    const versions = Array.isArray(diagnostics.versions?.resumeVersions) ? diagnostics.versions.resumeVersions : [];
    const selectedId = Number(state.selectedResumeVersionId || 0);
    const target = selectedId
      ? versions.find((version) => Number(version.id) === selectedId) || state.selectedResumeVersion
      : versions.find((version) => ["DRAFTED", "NEEDS_AUDIT", "APPROVED"].includes(version.status))
        || versions[0];
    if (!target?.id) {
      throw new Error("No resume version is available for claim verification. Generate a resume first.");
    }
    const result = await runtimeMessage({
      type: "VERIFY_RESUME_CLAIMS",
      resumeVersionId: target.id,
      options: {
        mode: "rules"
      }
    });
    await refreshResumeDiagnostics({ silent: true });
    await refreshWorkflowDiagnostics({ silent: true }).catch(() => {});
    const verification = result.response?.resumeClaimVerification || {};
    if (target.id) {
      await showResumeVersionDetail(target.id);
    }
    setStatus(`Resume claims verified: #${verification.id || ""} ${verification.supportedCount || 0}/${verification.totalClaims || 0} supported`.trim());
  } catch (error) {
    renderResumeDiagnostics(null, error);
    setStatus(error.message || String(error), true);
  } finally {
    ui.verifyResumeClaims.disabled = false;
  }
}

async function reviseSelectedResumeFromChecks() {
  try {
    ui.reviseResumeFromChecks.disabled = true;
    ui.resumeStatus.textContent = "Preparing checked resume revision";
    const diagnostics = await loadResumeDiagnostics();
    const versions = Array.isArray(diagnostics.versions?.resumeVersions) ? diagnostics.versions.resumeVersions : [];
    const selectedId = Number(state.selectedResumeVersionId || 0);
    const target = selectedId
      ? versions.find((version) => Number(version.id) === selectedId) || state.selectedResumeVersion
      : versions.find((version) => ["DRAFTED", "NEEDS_AUDIT", "NEEDS_REVISION"].includes(version.status))
        || versions[0];
    if (!target?.id) {
      throw new Error("No resume version is available for checked revision. Generate a resume first.");
    }
    const result = await runtimeMessage({
      type: "REVISE_RESUME_FROM_CHECKS",
      resumeVersionId: target.id,
      options: {
        mode: "rules",
        renderDocx: true
      }
    });
    await refreshResumeDiagnostics({ silent: true });
    await refreshWorkflowDiagnostics({ silent: true }).catch(() => {});
    const revision = result.response?.resumeVersion || {};
    if (revision.id) {
      await showResumeVersionDetail(revision.id);
    }
    const actions = Array.isArray(revision.metadata?.actions) ? revision.metadata.actions.length : 0;
    setStatus(`Checked revision prepared: #${revision.id || ""} ${actions} action(s)`.trim());
  } catch (error) {
    renderResumeDiagnostics(null, error);
    setStatus(error.message || String(error), true);
  } finally {
    ui.reviseResumeFromChecks.disabled = false;
  }
}

async function auditRulesResume() {
  try {
    ui.auditRulesResume.disabled = true;
    ui.resumeStatus.textContent = "正在审核规则简历";
    const diagnostics = await loadResumeDiagnostics();
    const versions = Array.isArray(diagnostics.versions?.resumeVersions) ? diagnostics.versions.resumeVersions : [];
    const audits = Array.isArray(diagnostics.audits?.resumeAudits) ? diagnostics.audits.resumeAudits : [];
    const auditedVersionIds = new Set(audits.map((audit) => Number(audit.resumeVersionId || 0)).filter(Boolean));
    const draft = versions.find((version) => !auditedVersionIds.has(Number(version.id)) && ["DRAFTED", "NEEDS_AUDIT"].includes(version.status))
      || versions.find((version) => ["DRAFTED", "NEEDS_AUDIT"].includes(version.status))
      || versions[0];
    if (!draft?.id) {
      throw new Error("暂无可审核的简历草稿，请先生成规则简历。");
    }
    const result = await runtimeMessage({
      type: "AUDIT_RESUME",
      resumeVersionId: draft.id,
      options: {
        mode: "rules"
      }
    });
    await refreshResumeDiagnostics({ silent: true });
    await refreshScreeningDiagnostics({ silent: true });
    const audit = result.response?.resumeAudit || {};
    if (audit.id) {
      await showResumeAuditDetail(audit.id);
    }
    setStatus(`规则审核完成：#${audit.id || ""} ${formatAuditRecommendation(audit.recommendation)}`.trim());
  } catch (error) {
    renderResumeDiagnostics(null, error);
    setStatus(error.message || String(error), true);
  } finally {
    ui.auditRulesResume.disabled = false;
  }
}

async function refreshGreetingDiagnostics(options = {}) {
  try {
    ui.greetingStatus.textContent = options.silent ? "" : "正在刷新打招呼草稿";
    const diagnostics = await loadGreetingDiagnostics();
    renderGreetingDiagnostics(diagnostics);
    setStatus("打招呼草稿已刷新");
  } catch (error) {
    renderGreetingDiagnostics(null, error);
    setStatus(error.message || String(error), true);
  }
}

async function loadGreetingDiagnostics() {
  const [messageResult, conversationResult, taskResult, readinessResult] = await Promise.all([
    runtimeMessage({ type: "GET_MESSAGES", options: { limit: 8 } }),
    runtimeMessage({ type: "GET_CONVERSATIONS", options: { limit: 8 } }),
    runtimeMessage({ type: "GET_BROWSER_TASK_DIAGNOSTICS", options: { limit: 8 } }),
    runtimeMessage({ type: "GET_SUBMISSION_READINESS_QUEUE", options: { limit: 8, status: ["READY_FOR_MANUAL_REVIEW", "BLOCKED"] } })
  ]);
  return {
    messages: messageResult.response || {},
    conversations: conversationResult.response || {},
    tasks: taskResult.diagnostics || {},
    submissionReadinessQueue: readinessResult.response || {}
  };
}

async function prepareGreetingDryRun() {
  try {
    ui.prepareGreetingDryRun.disabled = true;
    ui.greetingStatus.textContent = "正在生成打招呼 dry-run";
    const resumeDiagnostics = await loadResumeDiagnostics();
    const versions = Array.isArray(resumeDiagnostics.versions?.resumeVersions) ? resumeDiagnostics.versions.resumeVersions : [];
    const version = versions.find((item) => item.status === "APPROVED" && item.metadata?.localApproval?.approved)
      || versions.find((item) => item.status === "APPROVED");
    if (!version?.applicationId) {
      throw new Error("暂无已审核通过并本地审批的简历版本，请先完成 M7.4。");
    }
    if (!version.metadata?.localApproval?.approved) {
      throw new Error("请先对审核通过的简历版本执行本地审批，再生成打招呼 dry-run。");
    }
    const result = await runtimeMessage({
      type: "PREPARE_GREETING",
      applicationId: version.applicationId,
      options: {
        mode: "rules",
        resumeVersionId: version.id,
        dryRun: true
      }
    });
    await refreshGreetingDiagnostics({ silent: true });
    await refreshDiagnostics({ silent: true });
    const message = result.response?.message || {};
    const task = result.response?.browserTask || {};
    setStatus(`打招呼 dry-run 已生成：消息 #${message.id || ""}，任务 #${task.id || ""}`.trim());
  } catch (error) {
    renderGreetingDiagnostics(null, error);
    setStatus(error.message || String(error), true);
  } finally {
    ui.prepareGreetingDryRun.disabled = false;
  }
}

async function runGreetingDryRunTask() {
  await runBossTaskFromQueue({
    button: ui.runGreetingDryRunTask,
    taskTypes: ["SEND_GREETING"],
    statusText: "Running SEND_GREETING dry-run",
    emptyMessage: "No queued SEND_GREETING dry-run task matches the active BOSS page.",
    failureCode: "SEND_GREETING_DRY_RUN_FAILED",
    successMessage: (task) => `SEND_GREETING dry-run ready: task #${task.id}`,
    failureMessage: (_task, result) => `SEND_GREETING dry-run failed: ${result?.errorCode || result?.message || "unknown"}`
  });
}

async function queueReadOnlyBossTask(taskType) {
  const normalizedType = String(taskType || "").toUpperCase();
  if (!["REFRESH_CONVERSATION", "CHECK_RESUME_UNLOCK", "UPLOAD_RESUME", "SUBMIT_APPLICATION"].includes(normalizedType)) {
    setStatus(`Unsupported read-only task type: ${normalizedType}`, true);
    return;
  }
  const button = normalizedType === "REFRESH_CONVERSATION"
    ? ui.queueConversationRefreshTask
    : normalizedType === "CHECK_RESUME_UNLOCK"
      ? ui.queueResumeUnlockCheckTask
      : normalizedType === "UPLOAD_RESUME"
        ? ui.queueResumeUploadDryRunTask
        : ui.queueSubmitApplicationDryRunTask;
  try {
    button.disabled = true;
    ui.greetingStatus.textContent = `Queueing ${normalizedType}`;
    const tab = await getBossExecutionTab();
    await rememberBossPage(tab);
    const pageContext = await getBossPageTaskContext(tab);
  const payload = {
    ...pageContext,
    sourceUrl: pageContext.sourceUrl || tab.url || "",
    readOnly: true,
    dryRun: true,
    noFileSelected: true,
    noSubmit: true,
    noRealBossAction: true
  };
    const task = await runtimeMessage({
      type: "CREATE_BROWSER_TASK",
      task: {
        applicationId: pageContext.applicationId || null,
        taskType: normalizedType,
        payload
      }
    });
    await refreshGreetingDiagnostics({ silent: true });
    await refreshDiagnostics({ silent: true });
    const created = task.response || {};
    setStatus(`${normalizedType} queued: task #${created.id || ""}${created.duplicate ? " (existing open task)" : ""}`.trim());
  } catch (error) {
    await refreshGreetingDiagnostics({ silent: true }).catch(() => {});
    setStatus(error.message || String(error), true);
  } finally {
    button.disabled = false;
  }
}

async function runReadOnlyBossTask() {
  await runBossTaskFromQueue({
    button: ui.runReadOnlyBossTask,
    taskTypes: ["REFRESH_CONVERSATION", "CHECK_RESUME_UNLOCK", "UPLOAD_RESUME", "SUBMIT_APPLICATION"],
    statusText: "Running read-only BOSS task",
    emptyMessage: "No queued read-only conversation/unlock/upload/submit dry-run task matches the active BOSS page.",
    failureCode: "READ_ONLY_BOSS_TASK_FAILED",
    successMessage: (task) => `${task.taskType} read-only task succeeded: #${task.id}`,
    failureMessage: (task, result) => `${task.taskType} read-only task failed: ${result?.errorCode || result?.message || "unknown"}`
  });
}

async function runBossTaskFromQueue(options = {}) {
  const button = options.button;
  try {
    if (button) {
      button.disabled = true;
    }
    ui.greetingStatus.textContent = options.statusText || "Running BOSS task";
    const tab = await getBossExecutionTab();
    await rememberBossPage(tab);
    const claim = await runtimeMessage({
      type: "CLAIM_BROWSER_TASK",
      options: {
        taskTypes: options.taskTypes || [],
        sourceUrl: tab.url || ""
      }
    });
    const task = claim?.response?.task;
    if (!claim?.response?.claimed || !task) {
      throw new Error(options.emptyMessage || "No queued browser task matches the active BOSS page.");
    }

    const result = await runClaimedBrowserTask(tab, task, options.failureCode || "BROWSER_TASK_FAILED");
    await refreshGreetingDiagnostics({ silent: true });
    await refreshDiagnostics({ silent: true });
    setStatus(result?.ok
      ? (options.successMessage ? options.successMessage(task, result) : `Browser task succeeded: #${task.id}`)
      : (options.failureMessage ? options.failureMessage(task, result) : `Browser task failed: ${result?.errorCode || result?.message || "unknown"}`),
      !result?.ok);
  } catch (error) {
    await refreshGreetingDiagnostics({ silent: true }).catch(() => {});
    setStatus(error.message || String(error), true);
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

async function runClaimedBrowserTask(tab, task, failureCode) {
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
        errorMessage: result?.ok ? "" : result?.errorCode || result?.message || failureCode
      }
    });
    return result;
  } catch (error) {
    await runtimeMessage({
      type: "TRANSITION_BROWSER_TASK",
      taskId: task.id,
      transition: {
        toStatus: "FAILED",
        result: {
          ok: false,
          errorCode: "BROWSER_TASK_FAILED",
          message: error.message || String(error),
          pageUrl: tab.url || ""
        },
        errorMessage: error.message || String(error)
      }
    }).catch(() => {});
    throw error;
  }
}

async function getBossPageTaskContext(tab) {
  const fallback = {
    sourceUrl: tab.url || "",
    pageTitle: tab.title || ""
  };
  try {
    const capture = await tabMessage(tab.id, { type: "EXTRACT_PAGE" });
    const selected = capture?.selectedDetail || {};
    const matched = findBestCaptureJobForTaskContext(capture);
    return {
      jobId: selected.jobId || matched?.jobId || extractJobIdFromUrl(selected.detailUrl || matched?.detailUrl || tab.url || ""),
      title: selected.title || matched?.title || "",
      company: selected.company || matched?.company || "",
      detailUrl: selected.detailUrl || matched?.detailUrl || tab.url || "",
      sourceUrl: capture?.page?.url || tab.url || "",
      pageTitle: capture?.page?.title || tab.title || ""
    };
  } catch {
    return {
      ...fallback,
      jobId: extractJobIdFromUrl(tab.url || ""),
      detailUrl: tab.url || ""
    };
  }
}

function findBestCaptureJobForTaskContext(capture = {}) {
  const selected = capture.selectedDetail || {};
  const jobs = Array.isArray(capture.jobs) ? capture.jobs : [];
  if (!jobs.length) {
    return null;
  }
  return jobs.find((job) => {
    const selectedJobId = selected.jobId || extractJobIdFromUrl(selected.detailUrl || "");
    return Boolean(
      (selectedJobId && (job.jobId === selectedJobId || extractJobIdFromUrl(job.detailUrl || "") === selectedJobId))
      || (selected.title && selected.company && job.title === selected.title && job.company === selected.company)
    );
  }) || jobs[0];
}

function extractJobIdFromUrl(value) {
  const text = String(value || "");
  const match = text.match(/job_detail\/([a-zA-Z0-9_-]+)/i);
  return match ? match[1] : "";
}

async function clearCache() {
  try {
    await runtimeMessage({ type: "CLEAR_CACHE" });
    await refreshDiagnostics({ silent: true });
    setStatus("缓存已清空");
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

function renderCache(cache) {
  const jobs = cache?.jobs || [];
  ui.preview.textContent = jobs.length
    ? JSON.stringify(jobs.slice(0, 10).map(pickJobPreview), null, 2)
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
  ui.qualityEvents.textContent = alerts.length ? alerts.join(" · ") : "无异常摘要";
}

function renderTaskDiagnostics(diagnostics, error = null) {
  if (error) {
    ui.browserTaskQueued.textContent = "--";
    ui.browserTaskRunning.textContent = "--";
    ui.browserTaskSucceeded.textContent = "--";
    ui.browserTaskFailed.textContent = "--";
    ui.browserTaskFailures.textContent = error.message || "浏览器任务诊断不可用";
    ui.browserTaskFailures.classList.add("warn");
    ui.browserTaskRecent.textContent = "";
    return;
  }

  const counts = diagnostics?.counts || {};
  ui.browserTaskQueued.textContent = String(counts.queued ?? 0);
  ui.browserTaskRunning.textContent = String(counts.running ?? 0);
  ui.browserTaskSucceeded.textContent = String(counts.succeeded ?? 0);
  ui.browserTaskFailed.textContent = String(counts.failed ?? 0);
  ui.browserTaskFailures.classList.toggle("warn", Number(counts.failed || 0) > 0);

  const failures = Array.isArray(diagnostics?.failuresByReason) ? diagnostics.failuresByReason.slice(0, 3) : [];
  ui.browserTaskFailures.textContent = failures.length
    ? failures.map((failure) => `${normalizeEventType(failure.reason)} ${failure.count}`).join(" · ")
    : "暂无失败任务";

  const tasks = Array.isArray(diagnostics?.recentTasks) ? diagnostics.recentTasks.slice(0, 5) : [];
  renderList(ui.browserTaskRecent, tasks, (task) => ({
    title: `#${task.id} ${task.taskType || ""} ${task.status || ""}`,
    meta: [task.title || task.payload?.title, task.company || task.payload?.company, task.errorMessage].filter(Boolean).join(" · ")
  }), "暂无任务记录");
}

function renderGreetingDiagnostics(diagnostics, error = null) {
  if (error) {
    ui.greetingStatus.textContent = error.message || "打招呼草稿不可用";
    ui.greetingStatus.classList.add("warn");
    ui.greetingMessages.textContent = "";
    ui.greetingTasks.textContent = "";
    return;
  }

  ui.greetingStatus.classList.remove("warn");
  const messages = Array.isArray(diagnostics?.messages?.messages) ? diagnostics.messages.messages.slice(0, 8) : [];
  const conversations = Array.isArray(diagnostics?.conversations?.conversations) ? diagnostics.conversations.conversations.slice(0, 8) : [];
  const tasks = Array.isArray(diagnostics?.tasks?.recentTasks)
    ? diagnostics.tasks.recentTasks
      .filter((task) => ["SEND_GREETING", "REFRESH_CONVERSATION", "CHECK_RESUME_UNLOCK", "UPLOAD_RESUME", "SUBMIT_APPLICATION"].includes(task.taskType))
      .slice(0, 8)
    : [];
  const readOnlyTasks = tasks.filter((task) => ["REFRESH_CONVERSATION", "CHECK_RESUME_UNLOCK", "UPLOAD_RESUME", "SUBMIT_APPLICATION"].includes(task.taskType));
  ui.greetingStatus.textContent = [
    `${messages.length} 条草稿`,
    `${conversations.length} 个会话`,
    `${readOnlyTasks.length} 个只读刷新任务`
  ].join(" · ");

  renderList(ui.greetingMessages, messages, (message) => ({
    title: `#${message.id} ${message.company || ""} ${message.title || ""}`.trim(),
    meta: [
      message.status,
      message.metadata?.actionMode || "dry_run",
      message.messageText
    ].filter(Boolean).join(" · ")
  }), "暂无打招呼草稿");

  renderList(ui.greetingTasks, tasks, (task) => ({
    title: `#${task.id} ${task.taskType || ""} ${task.status || ""} ${task.payload?.dryRun ? "dry-run" : ""}`.trim(),
    meta: [
      task.title || task.payload?.title,
      task.company || task.payload?.company,
      task.payload?.readOnly ? "read-only" : "",
      task.result?.statusReason || task.errorMessage || task.payload?.messageText
    ].filter(Boolean).join(" · ")
  }), "暂无打招呼/只读任务");

  if (ui.greetingConversations) {
    renderList(ui.greetingConversations, conversations, (conversation) => {
      const lastResult = conversation.metadata?.lastResult || {};
      const resumeUnlock = lastResult.resumeUnlock || {};
      const snapshot = lastResult.conversation || {};
      const communication = conversation.metadata?.communicationAssessment || {};
      const nextAction = conversation.metadata?.nextActionRecommendation || {};
      const submissionReadiness = conversation.metadata?.submissionReadiness || {};
      return {
        title: `#${conversation.id} ${formatCommunicationState(communication.state) || conversation.status || "UNKNOWN"}`,
        meta: [
          conversation.title || "未命名岗位",
          conversation.company,
          formatNextAction(nextAction.action),
          formatSubmissionReadiness(submissionReadiness.status),
          snapshot.messageCount ? `${snapshot.messageCount} 条消息` : "",
          communication.inboundCount ? `对方 ${communication.inboundCount}` : "",
          resumeUnlock.unlocked ? "简历入口已解锁" : (resumeUnlock.status || ""),
          conversation.updatedAt ? formatTime(conversation.updatedAt) : ""
        ].filter(Boolean).join(" · ")
      };
    }, "暂无会话/解锁状态");
  }

  if (ui.submissionReadinessQueue) {
    const readinessItems = Array.isArray(diagnostics?.submissionReadinessQueue?.items)
      ? diagnostics.submissionReadinessQueue.items.slice(0, 8)
      : [];
    renderList(ui.submissionReadinessQueue, readinessItems, (item) => {
      const readiness = item.submissionReadiness || {};
      const nextAction = item.nextActionRecommendation || {};
      const review = item.submissionReadinessReview || {};
      return {
        title: `#${item.applicationId} ${formatSubmissionReadiness(readiness.status) || readiness.status || "UNKNOWN"}`,
        meta: [
          item.title || "未命名岗位",
          item.company,
          item.applicationStatus,
          formatNextAction(nextAction.action),
          formatSubmissionReadinessReview(review.decision),
          readiness.reason,
          item.updatedAt ? formatTime(item.updatedAt) : ""
        ].filter(Boolean).join(" · "),
        actions: [
          {
            label: "本地复核通过",
            onClick: () => reviewSubmissionReadiness(item.applicationId, "APPROVED_FOR_MANUAL_EXECUTION")
          },
          {
            label: "需要刷新",
            onClick: () => reviewSubmissionReadiness(item.applicationId, "REFRESH_REQUIRED")
          },
          {
            label: "阻断",
            onClick: () => reviewSubmissionReadiness(item.applicationId, "BLOCKED")
          }
        ]
      };
    }, "暂无待复核投递准备项");
  }
}

async function reviewSubmissionReadiness(applicationId, decision) {
  try {
    setStatus(`正在写入投递准备复核：${formatSubmissionReadinessReview(decision) || decision}`);
    await runtimeMessage({
      type: "REVIEW_SUBMISSION_READINESS",
      applicationId,
      options: {
        decision,
        reviewer: "user",
        note: "options_submission_readiness_queue",
        noRealBossAction: true
      }
    });
    await refreshGreetingDiagnostics({ silent: true });
    await refreshDiagnostics({ silent: true });
    setStatus(`投递准备复核已写入：${formatSubmissionReadinessReview(decision) || decision}`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

async function refreshCurrentPageDiagnostics(page = null) {
  const currentPage = page || await runtimeMessage({ type: "GET_LAST_BOSS_PAGE" });
  if (!currentPage?.url) {
    renderCurrentPageDiagnostics(null);
    return;
  }
  const result = await runtimeMessage({
    type: "GET_BROWSER_TASK_DIAGNOSTICS",
    options: {
      limit: 8,
      sourceUrl: currentPage.url
    }
  });
  renderCurrentPageDiagnostics(result.diagnostics || {}, null, currentPage);
}

function renderCurrentPageDiagnostics(diagnostics, error = null, page = null) {
  const hasPage = Boolean(page?.url || diagnostics?.sourceUrl);
  if (error) {
    ui.currentPageTaskStatus.textContent = error.message || "当前页任务诊断不可用";
    ui.currentPageTaskStatus.classList.add("warn");
    ui.currentPageUrl.textContent = "无法读取最近 BOSS 页面";
    ui.currentPageTaskRecent.textContent = "";
    setCurrentPageCounts({});
    setCurrentPageButtonsDisabled(true);
    return;
  }
  if (!hasPage) {
    ui.currentPageTaskStatus.textContent = "尚未记录 BOSS 页面";
    ui.currentPageTaskStatus.classList.remove("warn");
    ui.currentPageUrl.textContent = "先在 BOSS 岗位列表页打开弹窗或执行一次采集。";
    ui.currentPageTaskRecent.textContent = "暂无当前页任务";
    setCurrentPageCounts({});
    setCurrentPageButtonsDisabled(true);
    return;
  }

  const counts = diagnostics?.counts || {};
  setCurrentPageCounts(counts);
  const sourceUrl = page?.url || diagnostics?.sourceUrl || "";
  ui.currentPageUrl.textContent = shortUrl(sourceUrl);
  ui.currentPageTaskStatus.textContent = [
    `${counts.total || 0} 个任务`,
    `${counts.queued || 0} 待处理`,
    `${counts.failed || 0} 失败`
  ].join(" · ");
  ui.currentPageTaskStatus.classList.toggle("warn", Number(counts.failed || 0) > 0);
  setCurrentPageButtonsDisabled(false);

  const tasks = Array.isArray(diagnostics?.recentTasks) ? diagnostics.recentTasks.slice(0, 6) : [];
  renderList(ui.currentPageTaskRecent, tasks, (task) => ({
    title: `#${task.id} ${task.taskType || ""} ${task.status || ""}`,
    meta: [task.title || task.payload?.title, task.company || task.payload?.company, task.errorMessage].filter(Boolean).join(" · ")
  }), "暂无当前页任务");
}

function setCurrentPageCounts(counts = {}) {
  ui.currentPageQueued.textContent = String(counts.queued ?? 0);
  ui.currentPageRunning.textContent = String(counts.running ?? 0);
  ui.currentPageFailed.textContent = String(counts.failed ?? 0);
  ui.currentPageCanceled.textContent = String(counts.canceled ?? 0);
}

function setCurrentPageButtonsDisabled(disabled) {
  ui.requeueCurrentPage.disabled = Boolean(disabled);
  ui.cancelCurrentPage.disabled = Boolean(disabled);
}

async function requeueCurrentPageTasks() {
  await mutateCurrentPageTasks({
    type: "REQUEUE_BROWSER_TASKS",
    statusMessage: "正在恢复当前页失败任务",
    donePrefix: "已恢复当前页任务",
    options: {
      taskTypes: ["CAPTURE_DETAIL"],
      statuses: ["FAILED", "CANCELED"],
      reason: "OPTIONS_RETRY"
    }
  });
}

async function cancelCurrentPageTasks() {
  await mutateCurrentPageTasks({
    type: "CANCEL_BROWSER_TASKS",
    statusMessage: "正在取消当前页待处理任务",
    donePrefix: "已取消当前页任务",
    options: {
      taskTypes: ["CAPTURE_DETAIL"],
      statuses: ["QUEUED", "RUNNING"],
      reason: "OPTIONS_CANCEL_CURRENT_PAGE"
    }
  });
}

async function mutateCurrentPageTasks({ type, statusMessage, donePrefix, options }) {
  try {
    setStatus(statusMessage);
    const page = await runtimeMessage({ type: "GET_LAST_BOSS_PAGE" });
    if (!page?.url) {
      throw new Error("尚未记录当前 BOSS 页面，请先在 BOSS 页面打开弹窗。");
    }
    const result = await runtimeMessage({
      type,
      options: {
        ...options,
        sourceUrl: page.url
      }
    });
    await refreshCurrentPageDiagnostics(page);
    await refreshDiagnostics({ silent: true });
    const payload = result.response || result;
    setStatus(`${donePrefix}：${payload.changed || 0} 个，跳过 ${payload.skipped || 0} 个`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

function renderEvents(events, error = null) {
  if (error) {
    ui.recentEventCount.textContent = "--";
    ui.recentEvents.textContent = error.message || "事件日志不可用";
    ui.recentEvents.classList.add("warn");
    return;
  }

  ui.recentEvents.classList.remove("warn");
  ui.recentEventCount.textContent = String(events.length);
  renderList(ui.recentEvents, events, (event) => ({
    title: [normalizeEventType(event.eventType), event.createdAt ? formatTime(event.createdAt) : ""].filter(Boolean).join(" · "),
    meta: [event.message, event.pageTitle || shortUrl(event.pageUrl)].filter(Boolean).join(" · ")
  }), "暂无异常事件");
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
  renderList(ui.missingDescriptions, jobs, (job) => ({
    title: job.title || "未命名岗位",
    meta: [job.company, job.salary, job.location, `${job.descriptionLength || 0} 字`].filter(Boolean).join(" · ")
  }), "暂无待补岗位");
}

function renderWorkflowDiagnostics(diagnostics, error = null) {
  if (error) {
    ui.workflowOpenErrorCount.textContent = "--";
    ui.workflowEventCount.textContent = "--";
    ui.workflowStatus.textContent = error.message || "Workflow logs unavailable";
    ui.workflowStatus.classList.add("warn");
    ui.workflowErrors.textContent = "";
    ui.workflowEvents.textContent = "";
    return;
  }

  const errorPayload = diagnostics?.errors || {};
  const eventPayload = diagnostics?.events || {};
  const errors = Array.isArray(errorPayload.errors) ? errorPayload.errors : [];
  const events = Array.isArray(eventPayload.events) ? eventPayload.events : [];
  state.workflowErrors = errors;
  state.workflowEvents = events;

  ui.workflowOpenErrorCount.textContent = String(errorPayload.totalErrors ?? errors.length);
  ui.workflowEventCount.textContent = String(events.length);
  ui.workflowStatus.classList.toggle("warn", errors.length > 0);
  ui.workflowStatus.textContent = errors.length
    ? `${errors.length} open workflow issue(s)`
    : `${events.length} recent workflow event(s)`;

  renderList(ui.workflowErrors, errors, (event) => ({
    title: workflowEventTitle(event),
    meta: workflowEventMeta(event),
    actions: workflowEventActions(event, true)
  }), "No open workflow errors");

  renderList(ui.workflowEvents, events, (event) => ({
    title: workflowEventTitle(event),
    meta: workflowEventMeta(event),
    actions: workflowEventActions(event, false)
  }), "No workflow events");
}

function workflowEventActions(event, allowResolve) {
  const actions = [];
  if (event.applicationId) {
    actions.push({
      label: "Timeline",
      onClick: () => viewWorkflowTimeline(event.applicationId)
    });
  }
  if (allowResolve) {
    actions.push({
      label: "Resolved",
      onClick: () => resolveWorkflowErrorFromOptions(event.id, "RESOLVED")
    });
    actions.push({
      label: "Ignored",
      onClick: () => resolveWorkflowErrorFromOptions(event.id, "IGNORED")
    });
  }
  return actions;
}

function workflowEventTitle(event) {
  return [
    `#${event.id}`,
    formatWorkflowSeverity(event.severity),
    normalizeEventType(event.eventType),
    event.status
  ].filter(Boolean).join(" ");
}

function workflowEventMeta(event) {
  const progress = formatWorkflowProgress(event.progress);
  return [
    event.applicationId ? `app ${event.applicationId}` : "",
    event.title || "",
    event.company || "",
    event.sourceType ? `${event.sourceType}${event.sourceId ? ` #${event.sourceId}` : ""}` : "",
    progress,
    event.errorCode || "",
    event.errorMessage || event.message || "",
    event.resolutionStatus && event.resolutionStatus !== "OPEN" ? event.resolutionStatus : "",
    event.updatedAt || event.createdAt ? formatTime(event.updatedAt || event.createdAt) : ""
  ].filter(Boolean).join(" 路 ");
}

async function viewWorkflowTimeline(applicationId, options = {}) {
  const id = Number(applicationId);
  if (!Number.isInteger(id) || id <= 0) {
    setStatus("Valid application ID is required for workflow timeline", true);
    return;
  }
  try {
    state.selectedTimelineApplicationId = id;
    ui.workflowTimelineApplicationId.textContent = String(id);
    ui.workflowTimelineStatus.textContent = `Loading application ${id} timeline`;
    const result = await runtimeMessage({
      type: "GET_APPLICATION_TIMELINE",
      applicationId: id,
      options: { limit: 100 }
    });
    renderWorkflowTimeline(result.response || {});
    if (!options.preserveStatus) {
      setStatus(`Workflow timeline loaded: application ${id}`);
    }
  } catch (error) {
    renderWorkflowTimeline(null, error);
    setStatus(error.message || String(error), true);
  }
}

function renderWorkflowTimeline(timeline, error = null) {
  if (error) {
    ui.workflowTimelineStatus.textContent = error.message || "Workflow timeline unavailable";
    ui.workflowTimelineStatus.classList.add("warn");
    ui.workflowTimeline.textContent = "";
    return;
  }
  const items = Array.isArray(timeline?.items) ? timeline.items : [];
  ui.workflowTimelineStatus.classList.toggle("warn", items.some((item) => item.severity === "error"));
  ui.workflowTimelineStatus.textContent = items.length
    ? `${items.length} timeline item(s) for application ${timeline.applicationId || state.selectedTimelineApplicationId || ""}`.trim()
    : "No timeline records for this application";
  renderList(ui.workflowTimeline, items, (item) => ({
    title: workflowEventTitle(item),
    meta: workflowEventMeta(item)
  }), "No timeline loaded");
}

async function resolveWorkflowErrorFromOptions(eventId, status) {
  try {
    setStatus(`Marking workflow event #${eventId} ${status}`);
    await runtimeMessage({
      type: "RESOLVE_WORKFLOW_ERROR",
      eventId,
      options: {
        status,
        resolvedBy: "user",
        note: `options_workflow_errors:${status}`
      }
    });
    await refreshWorkflowDiagnostics({ silent: true });
    setStatus(`Workflow event #${eventId} marked ${status}`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

function renderScreeningDiagnostics(diagnostics, error = null) {
  if (error) {
    ui.screeningCandidateCount.textContent = "--";
    ui.screeningResultCount.textContent = "--";
    ui.agentRunCount.textContent = "--";
    ui.screeningStatus.textContent = error.message || "筛选数据不可用";
    ui.screeningStatus.classList.add("warn");
    ui.screeningCandidates.textContent = "";
    ui.screeningResults.textContent = "";
    ui.agentRuns.textContent = "";
    return;
  }

  const candidatePayload = diagnostics?.candidates || {};
  const screeningPayload = diagnostics?.screenings || {};
  const runPayload = diagnostics?.runs || {};
  const candidates = Array.isArray(candidatePayload.candidates) ? candidatePayload.candidates : [];
  const screenings = Array.isArray(screeningPayload.screenings) ? screeningPayload.screenings : [];
  const runs = Array.isArray(runPayload.runs) ? runPayload.runs : [];

  ui.screeningCandidateCount.textContent = String(candidatePayload.totalCandidates ?? candidates.length);
  ui.screeningResultCount.textContent = String(screeningPayload.totalScreenings ?? screenings.length);
  ui.agentRunCount.textContent = String(runPayload.totalAgentRuns ?? runs.length);
  ui.screeningStatus.textContent = [
    `${candidatePayload.totalCandidates ?? candidates.length} 待筛选`,
    `${screeningPayload.totalScreenings ?? screenings.length} 已筛选`,
    `${runPayload.totalAgentRuns ?? runs.length} 次运行`
  ].join(" · ");
  ui.screeningStatus.classList.toggle("warn", runs.some((run) => run.status === "FAILED"));

  renderList(ui.screeningCandidates, candidates, (candidate) => ({
    title: `${candidate.title || "未命名岗位"} · ${candidate.company || "未知公司"}`,
    meta: [
      candidate.status,
      candidate.location,
      `${candidate.descriptionLength || 0} 字 JD`,
      candidate.updatedAt ? formatTime(candidate.updatedAt) : ""
    ].filter(Boolean).join(" · "),
    actions: candidate.id
      ? [{
        label: "一键简历闭环",
        onClick: () => runResumeWorkflowForSelectedApplication(candidate.id)
      }]
      : []
  }), "暂无待筛选岗位");

  renderList(ui.screeningResults, screenings, (screening) => ({
    title: `${formatScore(screening.matchScore)} / 风险 ${formatScore(screening.riskScore)} · ${formatRecommendation(screening.recommendation)}`,
    meta: [
      screening.title || "未命名岗位",
      screening.company,
      screening.provider,
      screening.confidence ? `置信度 ${screening.confidence}` : "",
      screening.createdAt ? formatTime(screening.createdAt) : ""
    ].filter(Boolean).join(" · "),
    actions: screening.applicationId && screening.recommendation !== "skip"
      ? [{
        label: "一键简历闭环",
        onClick: () => runResumeWorkflowForSelectedApplication(screening.applicationId)
      }]
      : []
  }), "暂无筛选结果");

  renderList(ui.agentRuns, runs, (run) => ({
    title: `#${run.id} ${run.agentName || "Agent"} ${formatAgentRunStatus(run.status)}`,
    meta: [
      run.title || `application ${run.applicationId || ""}`.trim(),
      run.provider,
      run.fallbackUsed ? "已降级" : "",
      run.errorCode || run.errorMessage,
      run.finishedAt ? formatTime(run.finishedAt) : run.createdAt ? formatTime(run.createdAt) : ""
    ].filter(Boolean).join(" · ")
  }), "暂无运行记录");
}

function renderCareerContextDiagnostics(diagnostics, error = null) {
  if (error) {
    ui.careerContextExists.textContent = "--";
    ui.careerContextBytes.textContent = "--";
    ui.careerContextQuestionCount.textContent = "--";
    ui.careerContextStatus.textContent = error.message || "职业经历上下文不可用";
    ui.careerContextStatus.classList.add("warn");
    ui.careerContextAnswerStatus.textContent = "职业经历上下文不可用";
    ui.careerContextAnswerStatus.classList.add("warn");
    ui.careerContextMeta.textContent = "";
    ui.careerContextQuestions.textContent = "";
    ui.careerContextAnswerForm.textContent = "";
    ui.profileFactDraftStatus.textContent = "待确认事实草稿不可用";
    ui.profileFactDraftStatus.classList.add("warn");
    ui.profileFactDrafts.textContent = "";
    ui.generateProfileFactDrafts.disabled = true;
    ui.careerContextPreview.textContent = "";
    return;
  }

  const context = normalizeCareerContextPayload(diagnostics || {});
  const questions = normalizeCareerContextQuestions(diagnostics || {});
  state.careerContext = context;
  state.careerContextQuestions = questions;
  state.careerContextAnswers = mergeCareerContextAnswers(state.careerContextAnswers, normalizeCareerContextAnswers(diagnostics || {}), questions);

  ui.careerContextExists.textContent = context.exists ? "已生成" : "未生成";
  ui.careerContextBytes.textContent = context.bytes ? String(context.bytes) : "--";
  ui.careerContextQuestionCount.textContent = String(questions.length);
  ui.generateCareerContextWithAnswers.disabled = questions.length === 0 && state.careerContextAnswers.length === 0;
  ui.careerContextStatus.classList.toggle("warn", questions.length > 0);
  ui.careerContextStatus.textContent = context.exists
    ? `${shortPath(context.filePath || context.fileName || "career_agent_context.md")} · ${context.updatedAt ? formatTime(context.updatedAt) : "未记录时间"}`
    : "尚未生成 career_agent_context.md";

  ui.careerContextMeta.replaceChildren();
  appendKeyValue(ui.careerContextMeta, "文件", context.filePath || context.fileName || "未生成");
  appendKeyValue(ui.careerContextMeta, "更新时间", context.updatedAt ? formatTime(context.updatedAt) : "未记录");
  appendKeyValue(ui.careerContextMeta, "Agent run", context.agentRunId ? `#${context.agentRunId}` : "暂无");
  appendKeyValue(ui.careerContextMeta, "写入策略", context.writeFile === false ? "仅预览，未写入" : "写入本地文件");
  appendKeyValue(ui.careerContextMeta, "边界", "不确认 PENDING 草稿，不触发 BOSS 页面动作");

  ui.careerContextAnswerStatus.classList.remove("warn");
  renderTextList(ui.careerContextQuestions, questions.map(formatCareerContextQuestion), "暂无待追问问题");
  renderCareerContextAnswerForm(questions);
  if (Object.prototype.hasOwnProperty.call(diagnostics || {}, "factDrafts")) {
    renderProfileFactDrafts(diagnostics?.factDrafts || {});
  }
  ui.careerContextPreview.textContent = context.markdown
    ? truncateText(context.markdown, 12000)
    : "暂无 career_agent_context.md";
}

function renderProfileFactDrafts(payload, error = null) {
  if (error) {
    state.profileFactDrafts = [];
    ui.profileFactDraftStatus.textContent = error.message || "待确认事实草稿不可用";
    ui.profileFactDraftStatus.classList.add("warn");
    ui.profileFactDrafts.textContent = "";
    return;
  }
  const drafts = Array.isArray(payload?.drafts) ? payload.drafts : [];
  state.profileFactDrafts = drafts;
  ui.profileFactDraftStatus.classList.toggle("warn", drafts.length > 0);
  ui.profileFactDraftStatus.textContent = drafts.length
    ? `${drafts.length} 个待确认事实草稿；确认后才进入正式事实库`
    : "暂无待确认事实草稿";
  renderList(ui.profileFactDrafts, drafts, (draft) => ({
    title: `#${draft.id} ${formatProfileDraftType(draft.draftType)} · ${draft.title || "未命名事实"}`,
    meta: [
      draft.confidence ? `置信度 ${draft.confidence}` : "",
      draft.evidenceText ? truncateInlineText(draft.evidenceText, 110) : "",
      draft.createdAt ? formatTime(draft.createdAt) : ""
    ].filter(Boolean).join(" · "),
    dataset: {
      draftId: String(draft.id || "")
    },
    actions: [
      {
        label: "确认",
        onClick: () => confirmProfileFactDraftFromOptions(draft.id)
      },
      {
        label: "拒绝",
        onClick: () => rejectProfileFactDraftFromOptions(draft.id)
      }
    ]
  }), "暂无待确认事实草稿");
  for (const draft of drafts) {
    const node = ui.profileFactDrafts.querySelector(`[data-draft-id="${draft.id}"]`);
    if (node) {
      node.appendChild(createProfileFactDraftEditor(draft));
    }
  }
  updateCareerContextFreshnessStatus();
}

function createProfileFactDraftEditor(draft) {
  const form = document.createElement("div");
  form.className = "fact-draft-editor";
  form.dataset.draftId = String(draft.id || "");

  if (draft.draftType === "experience") {
    form.appendChild(createDraftInput(draft, "title", "标题", draft.content?.title || draft.title || ""));
    form.appendChild(createDraftInput(draft, "role", "职责", draft.content?.role || ""));
    form.appendChild(createDraftTextarea(draft, "facts", "事实/指标，每行一条", Array.isArray(draft.content?.facts) ? draft.content.facts.join("\n") : ""));
    form.appendChild(createDraftInput(draft, "skills", "技能，逗号或换行分隔", Array.isArray(draft.content?.skills) ? draft.content.skills.join("、") : ""));
  } else if (draft.draftType === "skill") {
    form.appendChild(createDraftInput(draft, "name", "技能名称", draft.content?.name || draft.title || ""));
    form.appendChild(createDraftInput(draft, "category", "分类", draft.content?.category || ""));
    form.appendChild(createDraftInput(draft, "proficiency", "熟练度", draft.content?.proficiency || "familiar"));
  } else if (draft.draftType === "constraint") {
    form.appendChild(createDraftInput(draft, "ruleType", "规则类型", draft.content?.ruleType || ""));
    form.appendChild(createDraftTextarea(draft, "content", "约束内容", draft.content?.content || draft.title || ""));
    form.appendChild(createDraftInput(draft, "severity", "级别", draft.content?.severity || "preference"));
  } else {
    form.appendChild(createDraftTextarea(draft, "note", "备注", draft.evidenceText || ""));
  }

  return form;
}

function createDraftInput(draft, field, label, value) {
  const row = document.createElement("label");
  row.className = "draft-edit-row";
  const text = document.createElement("span");
  text.textContent = label;
  const input = document.createElement("input");
  input.type = "text";
  input.spellcheck = false;
  input.dataset.draftId = String(draft.id || "");
  input.dataset.field = field;
  input.value = String(value || "");
  row.append(text, input);
  return row;
}

function createDraftTextarea(draft, field, label, value) {
  const row = document.createElement("label");
  row.className = "draft-edit-row";
  const text = document.createElement("span");
  text.textContent = label;
  const input = document.createElement("textarea");
  input.rows = field === "facts" ? 4 : 2;
  input.spellcheck = true;
  input.dataset.draftId = String(draft.id || "");
  input.dataset.field = field;
  input.value = String(value || "");
  row.append(text, input);
  return row;
}

function readProfileFactDraftEdit(draft) {
  if (!draft?.id) {
    return {};
  }
  const editor = ui.profileFactDrafts.querySelector(`.fact-draft-editor[data-draft-id="${draft.id}"]`);
  if (!editor) {
    return {};
  }
  const values = {};
  for (const node of Array.from(editor.querySelectorAll("[data-field]"))) {
    values[node.dataset.field] = String(node.value || "").trim();
  }
  if (draft.draftType === "experience") {
    return {
      title: values.title || draft.content?.title || draft.title || "",
      role: values.role || draft.content?.role || "",
      facts: splitEditableList(values.facts),
      skills: splitEditableList(values.skills),
      confidence: "user_confirmed"
    };
  }
  if (draft.draftType === "skill") {
    return {
      name: values.name || draft.content?.name || draft.title || "",
      category: values.category || draft.content?.category || "",
      proficiency: values.proficiency || draft.content?.proficiency || "familiar"
    };
  }
  if (draft.draftType === "constraint") {
    return {
      ruleType: values.ruleType || draft.content?.ruleType || "",
      content: values.content || draft.content?.content || "",
      severity: values.severity || draft.content?.severity || "preference"
    };
  }
  return {};
}

function splitEditableList(value) {
  return String(value || "")
    .split(/[\n,，、;；]+/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 30);
}

function updateCareerContextFreshnessStatus() {
  ui.regenerateCareerContextAfterFacts.disabled = !state.careerContextNeedsRegeneration;
  ui.careerContextFreshnessStatus.classList.toggle("warn", state.careerContextNeedsRegeneration);
  ui.careerContextFreshnessStatus.textContent = state.careerContextNeedsRegeneration
    ? "事实库已变更，建议重新生成 career_agent_context.md 后再进行 JD 打分或简历生成。"
    : "确认或拒绝事实草稿后，建议重新生成职业上下文。";
}

function formatProfileDraftType(value) {
  const labels = {
    experience: "经历",
    skill: "技能",
    constraint: "约束",
    question: "追问"
  };
  return labels[value] || value || "草稿";
}

function normalizeCareerContextPayload(payload = {}) {
  const stored = payload.careerContext || {};
  const context = stored.context && typeof stored.context === "object" ? stored.context : {};
  const markdown = stored.markdown || "";
  return {
    exists: Boolean(stored.exists || markdown || stored.file || stored.filePath),
    filePath: stored.filePath || stored.file || "",
    fileName: stored.fileName || "",
    markdown,
    bytes: Number(stored.bytes || browserByteLength(markdown)),
    updatedAt: stored.updatedAt || "",
    agentRunId: payload.agentRun?.id || stored.agentRunId || context.agentRunId || "",
    writeFile: stored.writeFile
  };
}

function normalizeCareerContextQuestions(payload = {}) {
  const direct = Array.isArray(payload.missingQuestions) ? payload.missingQuestions : [];
  const contextQuestions = Array.isArray(payload.careerContext?.context?.missingQuestions)
    ? payload.careerContext.context.missingQuestions
    : [];
  const questions = [...direct, ...contextQuestions]
    .map((item, index) => {
      if (typeof item === "string") {
        const prompt = item.trim();
        return prompt ? { id: `question_${index + 1}`, prompt, priority: "medium", metadata: {} } : null;
      }
      if (!item || typeof item !== "object") {
        return null;
      }
      const prompt = String(item.prompt || item.question || item.reason || "").replace(/\s+/g, " ").trim();
      const id = String(item.id || item.topic || `question_${index + 1}`).replace(/\s+/g, "_").trim();
      return prompt && id
        ? {
          id,
          prompt,
          priority: item.priority || "medium",
          metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {}
        }
        : null;
    })
    .filter(Boolean)
    .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 30);
  return questions;
}

function formatCareerContextQuestion(question) {
  if (!question || typeof question !== "object") {
    return String(question || "");
  }
  return `${question.id}：${question.prompt}`;
}

function normalizeCareerContextAnswers(payload = {}) {
  const direct = Array.isArray(payload.answers) ? payload.answers : [];
  const contextAnswers = Array.isArray(payload.careerContext?.context?.answers)
    ? payload.careerContext.context.answers
    : [];
  return [...direct, ...contextAnswers]
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      return {
        id: String(item.id || "").trim(),
        answer: String(item.answer || "").trim()
      };
    })
    .filter((item) => item?.id && item.answer)
    .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 50);
}

function mergeCareerContextAnswers(existing, incoming, questions) {
  const byId = new Map();
  for (const item of Array.isArray(incoming) ? incoming : []) {
    if (item?.id && item.answer) {
      byId.set(item.id, { id: item.id, answer: item.answer });
    }
  }
  for (const item of Array.isArray(existing) ? existing : []) {
    if (item?.id && item.answer && !byId.has(item.id)) {
      byId.set(item.id, { id: item.id, answer: item.answer });
    }
  }
  for (const question of questions) {
    if (question?.id && !byId.has(question.id)) {
      byId.set(question.id, { id: question.id, answer: "" });
    }
  }
  return Array.from(byId.values()).slice(0, 50);
}

function renderCareerContextAnswerForm(questions) {
  ui.careerContextAnswerForm.replaceChildren();
  const values = Array.isArray(questions) ? questions : [];
  if (!values.length) {
    const hasAnswers = state.careerContextAnswers.some((item) => item.answer);
    ui.careerContextAnswerStatus.textContent = hasAnswers
      ? "所有当前追问已回答；可继续带回答重新生成上下文"
      : "暂无可回答问题";
    ui.generateProfileFactDrafts.disabled = !hasAnswers;
    ui.careerContextAnswerForm.textContent = "暂无可回答问题";
    return;
  }

  const answerById = new Map(state.careerContextAnswers.map((item) => [item.id, item.answer || ""]));
  for (const question of values) {
    const row = document.createElement("label");
    row.className = "answer-row";
    const prompt = document.createElement("span");
    prompt.textContent = `${question.id}：${question.prompt}`;
    const input = document.createElement("textarea");
    input.rows = 3;
    input.dataset.questionId = question.id;
    input.dataset.questionPrompt = question.prompt;
    input.value = answerById.get(question.id) || "";
    input.placeholder = "填写你的确认信息、边界或暂不使用原因";
    input.addEventListener("input", () => {
      updateCareerContextAnswer(question.id, input.value);
      updateCareerContextAnswerStatus();
    });
    row.append(prompt, input);
    ui.careerContextAnswerForm.appendChild(row);
  }
  updateCareerContextAnswerStatus();
}

function updateCareerContextAnswer(id, answer) {
  const key = String(id || "").trim();
  if (!key) {
    return;
  }
  const existing = state.careerContextAnswers.find((item) => item.id === key);
  if (existing) {
    existing.answer = String(answer || "").trim();
  } else {
    state.careerContextAnswers.push({ id: key, answer: String(answer || "").trim() });
  }
}

function updateCareerContextAnswerStatus() {
  const answers = readCareerContextAnswers();
  const total = state.careerContextQuestions.length;
  ui.careerContextAnswerStatus.textContent = total
    ? `已填写 ${answers.length}/${total} 条；带回答重新生成后，已回答问题会从待追问中移除`
    : "回答只用于重新生成上下文，不会确认事实库";
  ui.generateCareerContextWithAnswers.disabled = answers.length === 0;
  ui.generateProfileFactDrafts.disabled = answers.length === 0;
}

function readCareerContextAnswers() {
  const nodes = Array.from(ui.careerContextAnswerForm.querySelectorAll("textarea[data-question-id]"));
  if (nodes.length) {
    return nodes
      .map((node) => ({
        id: String(node.dataset.questionId || "").trim(),
        prompt: String(node.dataset.questionPrompt || "").trim(),
        answer: String(node.value || "").trim()
      }))
      .filter((item) => item.id && item.answer)
      .slice(0, 50);
  }
  return state.careerContextAnswers
    .filter((item) => item?.id && item.answer)
    .map((item) => ({ id: item.id, answer: item.answer }))
    .slice(0, 50);
}

function browserByteLength(value) {
  return new Blob([String(value || "")]).size;
}

function truncateText(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}\n\n... truncated ${text.length - maxLength} chars`;
}

function truncateInlineText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function renderResumeDiagnostics(diagnostics, error = null) {
  if (error) {
    ui.resumeCandidateCount.textContent = "--";
    ui.resumeVersionCount.textContent = "--";
    ui.resumeAuditCount.textContent = "--";
    ui.resumeFitEvaluationCount.textContent = "--";
    ui.resumeClaimVerificationCount.textContent = "--";
    ui.resumeStatus.textContent = error.message || "简历数据不可用";
    ui.resumeStatus.classList.add("warn");
    ui.resumeCandidates.textContent = "";
    ui.resumeVersions.textContent = "";
    ui.resumeAudits.textContent = "";
    ui.resumeFitEvaluations.textContent = "";
    ui.resumeClaimVerifications.textContent = "";
    ui.runSelectedResumeWorkflow.disabled = true;
    ui.evaluateResumeFit.disabled = true;
    ui.verifyResumeClaims.disabled = true;
    return;
  }

  const candidatePayload = diagnostics?.candidates || {};
  const versionPayload = diagnostics?.versions || {};
  const auditPayload = diagnostics?.audits || {};
  const fitPayload = diagnostics?.fits || {};
  const claimPayload = diagnostics?.claims || {};
  const candidates = Array.isArray(candidatePayload.candidates) ? candidatePayload.candidates : [];
  const versions = Array.isArray(versionPayload.resumeVersions) ? versionPayload.resumeVersions : [];
  const audits = Array.isArray(auditPayload.resumeAudits) ? auditPayload.resumeAudits : [];
  const fits = Array.isArray(fitPayload.resumeFitEvaluations) ? fitPayload.resumeFitEvaluations : [];
  const claims = Array.isArray(claimPayload.resumeClaimVerifications) ? claimPayload.resumeClaimVerifications : [];
  state.resumeVersions = versions;
  state.resumeAudits = audits;
  state.resumeFitEvaluations = fits;
  state.resumeClaimVerifications = claims;
  ui.runSelectedResumeWorkflow.disabled = !(candidates.length || versions.length);
  ui.evaluateResumeFit.disabled = !versions.length;
  ui.verifyResumeClaims.disabled = !versions.length;

  ui.resumeCandidateCount.textContent = String(candidatePayload.totalCandidates ?? candidates.length);
  ui.resumeVersionCount.textContent = String(versionPayload.totalResumeVersions ?? versions.length);
  ui.resumeAuditCount.textContent = String(auditPayload.totalResumeAudits ?? audits.length);
  ui.resumeFitEvaluationCount.textContent = String(fitPayload.totalResumeFitEvaluations ?? fits.length);
  ui.resumeClaimVerificationCount.textContent = String(claimPayload.totalResumeClaimVerifications ?? claims.length);
  ui.resumeStatus.textContent = [
    `${candidatePayload.totalCandidates ?? candidates.length} 可定制`,
    `${versionPayload.totalResumeVersions ?? versions.length} 个版本`,
    `${auditPayload.totalResumeAudits ?? audits.length} 次审核`,
    `${fitPayload.totalResumeFitEvaluations ?? fits.length} 次 fit`,
    `${claimPayload.totalResumeClaimVerifications ?? claims.length} 次 claim`
  ].join(" · ");
  ui.resumeStatus.classList.toggle("warn", audits.some((audit) => audit.recommendation === "block" || audit.status === "BLOCKED")
    || fits.some((fit) => Array.isArray(fit.blockers) && fit.blockers.length)
    || claims.some((claim) => claim.unsupportedCount || claim.needsUserConfirmationCount));

  renderList(ui.resumeCandidates, candidates, (candidate) => ({
    title: `${candidate.title || "未命名岗位"} · ${candidate.company || "未知公司"}`,
    meta: [
      `匹配 ${formatScore(candidate.matchScore)}`,
      `风险 ${formatScore(candidate.riskScore)}`,
      formatRecommendation(candidate.recommendation),
      candidate.screeningCreatedAt ? formatTime(candidate.screeningCreatedAt) : ""
    ].filter(Boolean).join(" · "),
    actions: candidate.id
      ? [{
        label: "一键简历闭环",
        onClick: () => runResumeWorkflowForSelectedApplication(candidate.id)
      }]
      : []
  }), "暂无可定制岗位");

  renderList(ui.resumeVersions, versions, (version) => ({
    title: `#${version.id} v${version.versionNumber || 1} ${formatResumeVersionStatus(version.status)}`,
    meta: [
      version.title || "未命名岗位",
      version.company,
      version.provider,
      version.filePath ? shortPath(version.filePath) : "",
      version.createdAt ? formatTime(version.createdAt) : ""
    ].filter(Boolean).join(" · "),
    actionLabel: "查看简历详情",
    onClick: () => showResumeVersionDetail(version.id)
  }), "暂无简历版本");

  renderList(ui.resumeAudits, audits, (audit) => ({
    title: `#${audit.id} ${formatAuditRecommendation(audit.recommendation)} · ${formatResumeVersionStatus(audit.status)}`,
    meta: [
      audit.title || "未命名岗位",
      audit.company,
      audit.exaggerationRisk ? `真实性风险 ${audit.exaggerationRisk}` : "",
      audit.requiresUserConfirmation ? "需人工确认" : "",
      audit.createdAt ? formatTime(audit.createdAt) : ""
    ].filter(Boolean).join(" · "),
    actionLabel: "查看审核详情",
    onClick: () => showResumeAuditDetail(audit.id)
  }), "暂无审核记录");

  renderList(ui.resumeFitEvaluations, fits, (fit) => ({
    title: `#${fit.id} ${formatFitLevel(fit.fitLevel)} ${formatScore(fit.coverageScore)}/100`,
    meta: [
      fit.title || "Untitled job",
      fit.company,
      `resume #${fit.resumeVersionId || ""}`,
      fit.requirementCount ? `${fit.requirementCount} req` : "",
      fit.missingCount ? `${fit.missingCount} missing` : "",
      Array.isArray(fit.blockers) && fit.blockers.length ? `${fit.blockers.length} blocker(s)` : "",
      fit.createdAt ? formatTime(fit.createdAt) : ""
    ].filter(Boolean).join(" 路 "),
    actionLabel: "View fit",
    onClick: () => showResumeVersionDetail(fit.resumeVersionId)
  }), "No fit evaluations");

  renderList(ui.resumeClaimVerifications, claims, (claim) => ({
    title: `#${claim.id} ${claim.truthfulnessPassed ? "Passed" : "Needs review"} ${claim.supportedCount || 0}/${claim.totalClaims || 0}`,
    meta: [
      claim.title || "Untitled job",
      claim.company,
      `resume #${claim.resumeVersionId || ""}`,
      claim.unsupportedCount ? `${claim.unsupportedCount} unsupported` : "",
      claim.needsUserConfirmationCount ? `${claim.needsUserConfirmationCount} confirm` : "",
      claim.createdAt ? formatTime(claim.createdAt) : ""
    ].filter(Boolean).join(" 路 "),
    actionLabel: "View claims",
    onClick: () => showResumeVersionDetail(claim.resumeVersionId)
  }), "No claim verifications");

  if (state.selectedResumeVersionId && !versions.some((version) => Number(version.id) === Number(state.selectedResumeVersionId))) {
    clearResumeDetail();
  }
}

async function showResumeVersionDetail(resumeVersionId) {
  try {
    const id = Number(resumeVersionId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("缺少有效的简历版本 ID");
    }
    ui.resumeDetailStatus.textContent = "正在读取简历详情";
    const [versionResult, auditResult, fitResult, claimResult] = await Promise.all([
      runtimeMessage({ type: "GET_RESUME_VERSION", resumeVersionId: id }),
      runtimeMessage({ type: "GET_RESUME_AUDITS", options: { resumeVersionId: id, limit: 1 } }),
      runtimeMessage({ type: "GET_RESUME_FIT_EVALUATIONS", options: { resumeVersionId: id, limit: 1 } }),
      runtimeMessage({ type: "GET_RESUME_CLAIM_VERIFICATIONS", options: { resumeVersionId: id, limit: 1 } })
    ]);
    const version = versionResult.response || {};
    const audits = Array.isArray(auditResult.response?.resumeAudits) ? auditResult.response.resumeAudits : [];
    const fits = Array.isArray(fitResult.response?.resumeFitEvaluations) ? fitResult.response.resumeFitEvaluations : [];
    const claims = Array.isArray(claimResult.response?.resumeClaimVerifications) ? claimResult.response.resumeClaimVerifications : [];
    state.selectedResumeVersionId = version.id || id;
    state.selectedResumeAuditId = audits[0]?.id || null;
    state.selectedResumeFitEvaluationId = fits[0]?.id || null;
    state.selectedResumeClaimVerificationId = claims[0]?.id || null;
    renderResumeDetail(version, audits[0] || null, fits[0] || null, claims[0] || null);
    setStatus(`已读取简历版本 #${version.id || id}`);
  } catch (error) {
    ui.resumeDetailStatus.textContent = error.message || String(error);
    ui.resumeDetailStatus.classList.add("warn");
    setStatus(error.message || String(error), true);
  }
}

async function showResumeAuditDetail(resumeAuditId) {
  try {
    const id = Number(resumeAuditId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("缺少有效的简历审核 ID");
    }
    ui.resumeDetailStatus.textContent = "正在读取审核详情";
    const auditResult = await runtimeMessage({ type: "GET_RESUME_AUDIT", resumeAuditId: id });
    const audit = auditResult.response || {};
    const [versionResult, fitResult, claimResult] = await Promise.all([
      runtimeMessage({ type: "GET_RESUME_VERSION", resumeVersionId: audit.resumeVersionId }),
      runtimeMessage({ type: "GET_RESUME_FIT_EVALUATIONS", options: { resumeVersionId: audit.resumeVersionId, limit: 1 } }),
      runtimeMessage({ type: "GET_RESUME_CLAIM_VERIFICATIONS", options: { resumeVersionId: audit.resumeVersionId, limit: 1 } })
    ]);
    const version = versionResult.response || {};
    const fits = Array.isArray(fitResult.response?.resumeFitEvaluations) ? fitResult.response.resumeFitEvaluations : [];
    const claims = Array.isArray(claimResult.response?.resumeClaimVerifications) ? claimResult.response.resumeClaimVerifications : [];
    state.selectedResumeVersionId = version.id || null;
    state.selectedResumeAuditId = audit.id || id;
    state.selectedResumeFitEvaluationId = fits[0]?.id || null;
    state.selectedResumeClaimVerificationId = claims[0]?.id || null;
    renderResumeDetail(version, audit, fits[0] || null, claims[0] || null);
    setStatus(`已读取审核记录 #${audit.id || id}`);
  } catch (error) {
    ui.resumeDetailStatus.textContent = error.message || String(error);
    ui.resumeDetailStatus.classList.add("warn");
    setStatus(error.message || String(error), true);
  }
}

function renderResumeDetail(version = {}, audit = null, fitEvaluation = null, claimVerification = null) {
  const fields = version.resumeFields && typeof version.resumeFields === "object" ? version.resumeFields : {};
  state.selectedResumeVersion = version;
  state.selectedResumeAudit = audit;
  state.selectedResumeFitEvaluation = fitEvaluation;
  state.selectedResumeClaimVerification = claimVerification;
  ui.resumeDetailTitle.textContent = [
    version.title || "简历详情",
    version.company ? `@${version.company}` : ""
  ].filter(Boolean).join(" ");
  ui.resumeDetailStatus.textContent = [
    version.id ? `版本 #${version.id}` : "",
    formatResumeVersionStatus(version.status),
    version.filePath ? shortPath(version.filePath) : "",
    version.metadata?.localApproval?.approved ? `已本地审批 ${formatTime(version.metadata.localApproval.approvedAt)}` : "",
    audit?.id ? `审核 #${audit.id} ${formatAuditRecommendation(audit.recommendation)}` : "暂无审核"
  ].filter(Boolean).join(" · ");
  ui.resumeDetailStatus.classList.toggle("warn", Boolean(audit && (audit.recommendation === "block" || audit.status === "BLOCKED")));
  ui.toggleResumeEditor.disabled = !version.id;
  ui.runSelectedResumeWorkflow.disabled = !version.applicationId;
  ui.saveResumeRevision.disabled = true;
  ui.evaluateResumeFit.disabled = !version.id;
  ui.verifyResumeClaims.disabled = !version.id;
  ui.reviseResumeFromChecks.disabled = !version.id;
  const hasLocalApproval = Boolean(version.metadata?.localApproval?.approved);
  ui.approveResumeLocal.disabled = !(version.id && version.status === "APPROVED") || hasLocalApproval;
  ui.approveResumeLocal.textContent = hasLocalApproval ? "已本地审批" : "本地审批通过";
  fillResumeEditor(fields);
  setResumeEditorVisible(false);

  ui.resumeFieldPreview.replaceChildren();
  appendKeyValue(ui.resumeFieldPreview, "姓名", fields.name || "未填写");
  appendKeyValue(ui.resumeFieldPreview, "标题", fields.headline || fields.targetRole || "未填写");
  appendKeyValue(ui.resumeFieldPreview, "摘要", fields.summary || "暂无摘要");
  appendPillGroup(ui.resumeFieldPreview, "技能", fields.skills || []);
  appendProjectPreview(ui.resumeFieldPreview, fields.projects || []);
  appendPillGroup(ui.resumeFieldPreview, "奖项/证书", fields.awards || []);

  renderTextList(ui.resumeDiffSummary, [
    ...(Array.isArray(version.diffSummary) ? version.diffSummary : []),
    ...(Array.isArray(version.compressionNotes) ? version.compressionNotes.map((item) => `压缩：${item}`) : []),
    ...(Array.isArray(version.unsupportedClaims) && version.unsupportedClaims.length
      ? version.unsupportedClaims.map((item) => `无证据声明：${item}`)
      : [])
  ], "暂无修改摘要");

  renderSourceMapping(ui.resumeSourceMapping, Array.isArray(version.sourceMapping) ? version.sourceMapping : []);
  renderAuditRisk(ui.resumeAuditRisk, audit);
  renderResumeFitDetail(ui.resumeFitDetail, fitEvaluation);
  renderResumeClaimDetail(ui.resumeClaimDetail, claimVerification);
}

function clearResumeDetail() {
  state.selectedResumeVersionId = null;
  state.selectedResumeAuditId = null;
  state.selectedResumeFitEvaluationId = null;
  state.selectedResumeClaimVerificationId = null;
  state.selectedResumeVersion = null;
  state.selectedResumeAudit = null;
  state.selectedResumeFitEvaluation = null;
  state.selectedResumeClaimVerification = null;
  ui.resumeDetailTitle.textContent = "简历详情";
  ui.resumeDetailStatus.textContent = "选择简历版本查看详情";
  ui.resumeDetailStatus.classList.remove("warn");
  ui.toggleResumeEditor.disabled = true;
  ui.saveResumeRevision.disabled = true;
  ui.evaluateResumeFit.disabled = true;
  ui.verifyResumeClaims.disabled = true;
  ui.reviseResumeFromChecks.disabled = true;
  ui.approveResumeLocal.disabled = true;
  ui.approveResumeLocal.textContent = "本地审批通过";
  setResumeEditorVisible(false);
  ui.resumeFieldPreview.textContent = "暂无简历字段";
  ui.resumeDiffSummary.textContent = "暂无修改摘要";
  ui.resumeSourceMapping.textContent = "暂无证据映射";
  ui.resumeAuditRisk.textContent = "暂无审核记录";
  ui.resumeFitDetail.textContent = "No fit evaluation";
  ui.resumeClaimDetail.textContent = "No claim verification";
}

function toggleResumeEditor() {
  if (!state.selectedResumeVersion?.id) {
    setStatus("请先选择一个简历版本", true);
    return;
  }
  setResumeEditorVisible(ui.resumeEditor.hidden);
}

function setResumeEditorVisible(visible) {
  ui.resumeEditor.hidden = !visible;
  ui.toggleResumeEditor.textContent = visible ? "收起编辑" : "编辑当前简历";
  ui.saveResumeRevision.disabled = !visible || !state.selectedResumeVersion?.id;
}

function fillResumeEditor(fields = {}) {
  ui.resumeEditSummary.value = fields.summary || "";
  ui.resumeEditSkills.value = formatEditableList(fields.skills || []);
  ui.resumeEditProjects.value = formatEditableProjects(fields.projects || []);
  ui.resumeEditAwards.value = formatEditableList(fields.awards || []);
  ui.resumeEditReason.value = "";
}

async function saveResumeRevision() {
  try {
    const version = state.selectedResumeVersion;
    if (!version?.id) {
      throw new Error("请先选择一个简历版本");
    }
    ui.saveResumeRevision.disabled = true;
    ui.resumeDetailStatus.textContent = "正在保存新简历版本";
    const result = await runtimeMessage({
      type: "REVISE_RESUME",
      resumeVersionId: version.id,
      options: {
        resumeFields: readResumeRevisionFields(version.resumeFields || {}),
        reason: ui.resumeEditReason.value || "options_detail_edit",
        renderDocx: true
      }
    });
    await refreshResumeDiagnostics({ silent: true });
    const nextVersion = result.response?.resumeVersion || {};
    if (nextVersion.id) {
      await showResumeVersionDetail(nextVersion.id);
    }
    setStatus(`新简历版本已保存：#${nextVersion.id || ""}`.trim());
  } catch (error) {
    ui.resumeDetailStatus.textContent = error.message || String(error);
    ui.resumeDetailStatus.classList.add("warn");
    setStatus(error.message || String(error), true);
  } finally {
    ui.saveResumeRevision.disabled = !state.selectedResumeVersion?.id || ui.resumeEditor.hidden;
  }
}

async function approveResumeLocal() {
  try {
    const version = state.selectedResumeVersion;
    if (!version?.id) {
      throw new Error("请先选择一个简历版本");
    }
    if (version.status !== "APPROVED") {
      throw new Error("只有审核通过的简历版本才能本地审批通过");
    }
    ui.approveResumeLocal.disabled = true;
    ui.resumeDetailStatus.textContent = "正在写入本地审批";
    const result = await runtimeMessage({
      type: "APPROVE_RESUME_LOCAL",
      resumeVersionId: version.id,
      options: {
        approver: "user",
        note: ui.resumeEditReason.value || ""
      }
    });
    await refreshResumeDiagnostics({ silent: true });
    await showResumeVersionDetail(result.response?.resumeVersion?.id || version.id);
    const transition = result.response?.transition || {};
    setStatus(`本地审批已记录：${transition.fromStatus || ""} -> ${transition.toStatus || ""}`.trim());
  } catch (error) {
    ui.resumeDetailStatus.textContent = error.message || String(error);
    ui.resumeDetailStatus.classList.add("warn");
    setStatus(error.message || String(error), true);
  } finally {
    const selected = state.selectedResumeVersion;
    ui.approveResumeLocal.disabled = !(selected?.id && selected.status === "APPROVED") || Boolean(selected?.metadata?.localApproval?.approved);
  }
}

function readResumeRevisionFields(baseFields = {}) {
  const baseProjects = Array.isArray(baseFields.projects) ? baseFields.projects : [];
  const projectBlocks = splitProjectBlocks(ui.resumeEditProjects.value);
  return {
    summary: ui.resumeEditSummary.value,
    skills: parseEditableList(ui.resumeEditSkills.value),
    projects: projectBlocks.map((bullets, index) => ({
      ...(baseProjects[index] || {}),
      bullets
    })),
    awards: parseEditableList(ui.resumeEditAwards.value)
  };
}

function formatEditableList(items) {
  return (Array.isArray(items) ? items : []).filter(Boolean).join("\n");
}

function parseEditableList(value) {
  return String(value || "")
    .split(/[\n,，;；]+/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 40);
}

function formatEditableProjects(projects) {
  return (Array.isArray(projects) ? projects : [])
    .map((project) => (Array.isArray(project.bullets) ? project.bullets : []).filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n");
}

function splitProjectBlocks(value) {
  return String(value || "")
    .split(/\n\s*\n/)
    .map((block) => block.split(/\n+/).map((line) => line.replace(/^[\s\-*•]+/, "").trim()).filter(Boolean).slice(0, 8))
    .filter((items) => items.length)
    .slice(0, 8);
}

function appendKeyValue(container, label, value) {
  const row = document.createElement("div");
  row.className = "detail-row";
  const key = document.createElement("span");
  key.className = "detail-key";
  key.textContent = label;
  const text = document.createElement("span");
  text.className = "detail-value";
  text.textContent = value || "";
  row.append(key, text);
  container.appendChild(row);
}

function appendPillGroup(container, label, items) {
  const values = Array.isArray(items) ? items.filter(Boolean).slice(0, 18) : [];
  const block = document.createElement("div");
  block.className = "detail-block";
  const heading = document.createElement("div");
  heading.className = "detail-key";
  heading.textContent = label;
  const group = document.createElement("div");
  group.className = "pill-group";
  if (!values.length) {
    group.textContent = "暂无";
  } else {
    for (const item of values) {
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = String(item);
      group.appendChild(pill);
    }
  }
  block.append(heading, group);
  container.appendChild(block);
}

function appendProjectPreview(container, projects) {
  const values = Array.isArray(projects) ? projects.slice(0, 4) : [];
  const block = document.createElement("div");
  block.className = "detail-block";
  const heading = document.createElement("div");
  heading.className = "detail-key";
  heading.textContent = "项目/经历";
  block.appendChild(heading);
  if (!values.length) {
    const empty = document.createElement("div");
    empty.className = "detail-value";
    empty.textContent = "暂无";
    block.appendChild(empty);
  } else {
    for (const project of values) {
      const item = document.createElement("div");
      item.className = "detail-card";
      const title = document.createElement("div");
      title.className = "list-title";
      title.textContent = [project.title, project.role].filter(Boolean).join(" · ") || "未命名经历";
      const meta = document.createElement("div");
      meta.className = "list-meta";
      meta.textContent = [project.organization, project.period, Array.isArray(project.skills) ? project.skills.join("、") : ""].filter(Boolean).join(" · ");
      item.append(title, meta);
      renderTextList(item, Array.isArray(project.bullets) ? project.bullets.slice(0, 4) : [], "暂无要点", { append: true });
      block.appendChild(item);
    }
  }
  container.appendChild(block);
}

function renderTextList(container, items, emptyText, options = {}) {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  const list = document.createElement("ul");
  list.className = "plain-list";
  if (!values.length) {
    if (options.append) {
      const empty = document.createElement("div");
      empty.className = "list-meta";
      empty.textContent = emptyText;
      container.appendChild(empty);
    } else {
      container.textContent = emptyText;
    }
    return;
  }
  if (!options.append) {
    container.replaceChildren();
  }
  for (const item of values) {
    const node = document.createElement("li");
    node.textContent = String(item);
    list.appendChild(node);
  }
  container.appendChild(list);
}

function renderSourceMapping(container, mappings) {
  const values = Array.isArray(mappings) ? mappings.slice(0, 30) : [];
  container.replaceChildren();
  if (!values.length) {
    container.textContent = "暂无证据映射";
    return;
  }
  for (const mapping of values) {
    const node = document.createElement("div");
    node.className = "list-item";
    const title = document.createElement("div");
    title.className = "list-title";
    title.textContent = mapping.resumeField || "字段";
    const meta = document.createElement("div");
    meta.className = "list-meta";
    meta.textContent = [
      mapping.sourceType || "source",
      mapping.sourceId ? `#${mapping.sourceId}` : "",
      mapping.sourceFact || ""
    ].filter(Boolean).join(" · ");
    node.append(title, meta);
    container.appendChild(node);
  }
}

function renderAuditRisk(container, audit) {
  container.replaceChildren();
  if (!audit) {
    container.textContent = "暂无审核记录";
    return;
  }
  appendKeyValue(container, "结论", formatAuditRecommendation(audit.recommendation));
  appendKeyValue(container, "真实性", audit.truthfulnessPassed ? "通过" : "未通过");
  appendKeyValue(container, "格式", audit.formatPassed ? "通过" : "未通过");
  appendKeyValue(container, "页数", audit.pageLimitPassed ? "通过" : "未通过");
  appendKeyValue(container, "夸大风险", audit.exaggerationRisk || "未评估");
  appendKeyValue(container, "岗位匹配复核", audit.jobFitReview || "未评估");
  appendKeyValue(container, "需人工确认", audit.requiresUserConfirmation ? "是" : "否");
  renderTextList(container, [
    ...(Array.isArray(audit.riskFlags) ? audit.riskFlags.map((item) => `风险：${item}`) : []),
    ...(Array.isArray(audit.sourceIssues) ? audit.sourceIssues.map((item) => `证据问题：${item}`) : []),
    ...(Array.isArray(audit.unsupportedClaims) ? audit.unsupportedClaims.map((item) => `无证据声明：${item}`) : [])
  ], "暂无风险项", { append: true });
}

function renderResumeFitDetail(container, fit) {
  container.replaceChildren();
  if (!fit) {
    container.textContent = "No fit evaluation";
    return;
  }
  appendKeyValue(container, "Score", `${formatScore(fit.coverageScore)}/100`);
  appendKeyValue(container, "Level", formatFitLevel(fit.fitLevel));
  appendKeyValue(container, "Confidence", fit.confidence || "unknown");
  appendKeyValue(container, "Requirements", [
    fit.requirementCount ? `${fit.requirementCount} total` : "",
    fit.coveredCount ? `${fit.coveredCount} covered` : "",
    fit.weakCount ? `${fit.weakCount} weak` : "",
    fit.missingCount ? `${fit.missingCount} missing` : ""
  ].filter(Boolean).join(", ") || "No requirements");
  appendKeyValue(container, "Policy", formatFitPolicy(fit.policy));
  renderTextList(container, [
    ...(Array.isArray(fit.blockers) ? fit.blockers.map((item) => `Blocker: ${formatFitText(item)}`) : []),
    ...(Array.isArray(fit.recommendations) ? fit.recommendations.map((item) => `Recommendation: ${formatFitText(item)}`) : []),
    ...(Array.isArray(fit.coverageItems) ? fit.coverageItems.slice(0, 12).map((item) => {
      return `${item.status || "unknown"}: ${item.requirement || ""}${item.evidenceField ? ` (${item.evidenceField})` : ""}`;
    }) : [])
  ], "No fit gaps", { append: true });
}

function renderResumeClaimDetail(container, verification) {
  container.replaceChildren();
  if (!verification) {
    container.textContent = "No claim verification";
    return;
  }
  appendKeyValue(container, "Result", verification.truthfulnessPassed ? "Passed" : "Needs review");
  appendKeyValue(container, "Claims", [
    verification.totalClaims ? `${verification.totalClaims} total` : "",
    verification.supportedCount ? `${verification.supportedCount} supported` : "",
    verification.weakCount ? `${verification.weakCount} weak` : "",
    verification.unsupportedCount ? `${verification.unsupportedCount} unsupported` : "",
    verification.needsUserConfirmationCount ? `${verification.needsUserConfirmationCount} confirm` : ""
  ].filter(Boolean).join(", ") || "No claims");
  appendKeyValue(container, "Policy", formatClaimPolicy(verification.policy));
  renderTextList(container, [
    ...(Array.isArray(verification.unsupportedClaims) ? verification.unsupportedClaims.map((item) => `Unsupported: ${formatClaimText(item)}`) : []),
    ...(Array.isArray(verification.needsUserConfirmation) ? verification.needsUserConfirmation.map((item) => `Confirm: ${formatClaimText(item)}`) : []),
    ...(Array.isArray(verification.recommendations) ? verification.recommendations.slice(0, 12).map((item) => `Recommendation: ${formatClaimText(item)}`) : []),
    ...(Array.isArray(verification.claims) ? verification.claims.slice(0, 12).map((item) => `${item.status || "UNKNOWN"}: ${item.claim || ""}`) : [])
  ], "No claim issues", { append: true });
}

function renderList(container, items, mapper, emptyText) {
  container.replaceChildren();
  if (!items.length) {
    container.textContent = emptyText;
    return;
  }
  for (const item of items) {
    const view = mapper(item);
    const node = document.createElement("div");
    node.className = "list-item";
    if (view.dataset && typeof view.dataset === "object") {
      for (const [key, value] of Object.entries(view.dataset)) {
        node.dataset[key] = String(value);
      }
    }
    const title = document.createElement("div");
    title.className = "list-title";
    title.textContent = view.title || "";
    const meta = document.createElement("div");
    meta.className = "list-meta";
    meta.textContent = view.meta || "";
    node.append(title, meta);
    if (typeof view.onClick === "function") {
      const action = document.createElement("button");
      action.className = "inline-action";
      action.type = "button";
      action.textContent = view.actionLabel || "查看";
      action.addEventListener("click", view.onClick);
      node.appendChild(action);
    }
    if (Array.isArray(view.actions)) {
      for (const itemAction of view.actions) {
        if (typeof itemAction?.onClick !== "function") {
          continue;
        }
        const action = document.createElement("button");
        action.className = "inline-action";
        action.type = "button";
        action.textContent = itemAction.label || "操作";
        action.addEventListener("click", itemAction.onClick);
        node.appendChild(action);
      }
    }
    container.appendChild(node);
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

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : "--";
}

function formatScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number)) : "--";
}

function formatRecommendation(value) {
  const labels = {
    auto_prepare: "推荐进入简历定制",
    review_needed: "需要人工复核",
    skip: "跳过"
  };
  return labels[value] || value || "未建议";
}

function formatAgentRunStatus(value) {
  const labels = {
    SUCCEEDED: "成功",
    FAILED: "失败",
    RUNNING: "运行中"
  };
  return labels[value] || value || "";
}

function formatResumeVersionStatus(value) {
  const labels = {
    DRAFTED: "已生成",
    NEEDS_AUDIT: "待审核",
    APPROVED: "审核通过",
    NEEDS_REVISION: "需修改",
    BLOCKED: "已阻断"
  };
  return labels[value] || value || "";
}

function formatAuditRecommendation(value) {
  const labels = {
    approve: "通过",
    revise: "需修改",
    block: "阻断"
  };
  return labels[value] || value || "未审核";
}

function formatFitLevel(value) {
  const labels = {
    strong: "Strong fit",
    mixed: "Mixed fit",
    weak: "Weak fit"
  };
  return labels[value] || value || "Not evaluated";
}

function formatFitPolicy(policy = {}) {
  if (!policy || typeof policy !== "object") {
    return "No policy";
  }
  return [
    policy.canProceedToAudit === false ? "audit blocked" : "audit allowed",
    policy.requiresResumeRevision ? "revision suggested" : "",
    policy.noRealBossAction ? "no BOSS action" : ""
  ].filter(Boolean).join(", ") || "No policy";
}

function formatFitText(value) {
  if (!value || typeof value !== "object") {
    return String(value || "");
  }
  return [
    value.requirement || value.reason || value.message || value.type || "",
    value.status || "",
    value.evidenceField ? `field=${value.evidenceField}` : ""
  ].filter(Boolean).join(" ");
}

function formatClaimPolicy(policy = {}) {
  if (!policy || typeof policy !== "object") {
    return "No policy";
  }
  return [
    policy.canProceedToAudit === false ? "audit blocked" : "audit allowed",
    policy.requiresResumeRevision ? "revision required" : "",
    policy.requiresUserConfirmation ? "confirmation required" : "",
    policy.noRealBossAction ? "no BOSS action" : ""
  ].filter(Boolean).join(", ") || "No policy";
}

function formatClaimText(value) {
  if (!value || typeof value !== "object") {
    return String(value || "");
  }
  return [
    value.claim || value.reason || value.message || value.type || "",
    value.field ? `field=${value.field}` : "",
    value.status || ""
  ].filter(Boolean).join(" ");
}

function formatCommunicationState(value) {
  const labels = {
    RESUME_REQUESTED: "对方要求简历",
    RECRUITER_REPLIED: "对方已回复",
    WAITING_FOR_REPLY: "等待对方回复",
    CHAT_OPENED_NO_MESSAGES: "会话已打开",
    CONVERSATION_UNKNOWN: "会话未知"
  };
  return labels[value] || value || "";
}

function formatNextAction(value) {
  const labels = {
    PREPARE_RESUME_UPLOAD_DRY_RUN: "建议准备上传 dry-run",
    REVIEW_SUBMISSION_READINESS: "建议复核投递准备度",
    RESOLVE_SUBMISSION_BLOCKER: "建议处理投递阻断",
    REVIEW_RECRUITER_REPLY: "建议人工查看回复",
    WAIT_FOR_REPLY: "建议等待回复",
    REFRESH_CONVERSATION_LATER: "建议稍后刷新",
    REFRESH_CONVERSATION: "建议刷新会话"
  };
  return labels[value] || value || "";
}

function formatSubmissionReadiness(value) {
  const labels = {
    READY_FOR_MANUAL_REVIEW: "投递准备待人工复核",
    INSUFFICIENT_EVIDENCE: "投递准备证据不足",
    BLOCKED: "投递准备阻断"
  };
  return labels[value] || "";
}

function formatSubmissionReadinessReview(value) {
  const labels = {
    APPROVED_FOR_MANUAL_EXECUTION: "本地复核通过",
    REFRESH_REQUIRED: "需要刷新证据",
    BLOCKED: "本地阻断"
  };
  return labels[value] || "";
}

function formatWorkflowSeverity(value) {
  const labels = {
    info: "Info",
    warning: "Warning",
    error: "Error"
  };
  return labels[value] || value || "";
}

function formatWorkflowProgress(progress = {}) {
  const current = Number(progress.current);
  const total = Number(progress.total);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) {
    return "";
  }
  return `${current}/${total}`;
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

function shortUrl(value) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return String(value || "");
  }
}

function shortPath(value) {
  const text = String(value || "");
  const parts = text.split(/[\\/]+/).filter(Boolean);
  return parts.length > 2 ? parts.slice(-2).join("/") : text;
}

async function runtimeMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "扩展后台无响应");
  }
  return response.result;
}

async function getBossExecutionTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && isBossUrl(tab.url)) {
    return tab;
  }

  const tabs = await chrome.tabs.query({
    url: [
      "https://www.zhipin.com/*",
      "https://*.zhipin.com/*"
    ]
  });
  const candidates = tabs
    .filter((item) => item.id && isBossUrl(item.url))
    .sort((left, right) => {
      const activeDiff = Number(Boolean(right.active)) - Number(Boolean(left.active));
      if (activeDiff) {
        return activeDiff;
      }
      return Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0);
    });
  if (!candidates.length) {
    throw new Error("Open the logged-in BOSS/Zhipin page before running SEND_GREETING dry-run.");
  }
  return candidates[0];
}

async function tabMessage(tabId, message) {
  const response = await chrome.tabs.sendMessage(tabId, message);
  if (!response?.ok) {
    throw new Error(response?.error || "BOSS page content script did not respond. Refresh the BOSS page and retry.");
  }
  return response.result;
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

function isBossUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "www.zhipin.com" || parsed.hostname.endsWith(".zhipin.com");
  } catch {
    return false;
  }
}

function setStatus(message, isError = false) {
  ui.status.textContent = message || "";
  ui.status.classList.toggle("warn", Boolean(isError));
}
