const fields = {
  autoSync: document.getElementById("autoSync"),
  backendUrl: document.getElementById("backendUrl"),
  syncPath: document.getElementById("syncPath"),
  token: document.getElementById("token"),
  maxCachedJobs: document.getElementById("maxCachedJobs"),
  crawlMaxJobs: document.getElementById("crawlMaxJobs"),
  crawlDelayMs: document.getElementById("crawlDelayMs"),
  resumeOutputDir: document.getElementById("resumeOutputDir"),
  agentExecutionMode: document.getElementById("agentExecutionMode"),
  riskGateEnabled: document.getElementById("riskGateEnabled"),
  excludedDirections: document.getElementById("excludedDirections")
};

const ui = {
  workspaceTab: document.getElementById("workspaceTab"),
  profileTab: document.getElementById("profileTab"),
  settingsTab: document.getElementById("settingsTab"),
  workspacePanel: document.getElementById("workspacePanel"),
  profilePanel: document.getElementById("profilePanel"),
  settingsPanel: document.getElementById("settingsPanel"),
  workspaceApplicationCount: document.getElementById("workspaceApplicationCount"),
  workspaceActionCount: document.getElementById("workspaceActionCount"),
  workspaceReadyCount: document.getElementById("workspaceReadyCount"),
  workspaceErrorCount: document.getElementById("workspaceErrorCount"),
  queueTitle: document.getElementById("queueTitle"),
  workspaceQueueSelect: document.getElementById("workspaceQueueSelect"),
  openCreateQueueDialog: document.getElementById("openCreateQueueDialog"),
  deleteApplicationQueue: document.getElementById("deleteApplicationQueue"),
  workspaceFilter: document.getElementById("workspaceFilter"),
  workspaceManualFilter: document.getElementById("workspaceManualFilter"),
  workspaceListTitle: document.getElementById("workspaceListTitle"),
  runQueueScreening: document.getElementById("runQueueScreening"),
  runQueueResumeWorkflow: document.getElementById("runQueueResumeWorkflow"),
  queueResumeBatchStatus: document.getElementById("queueResumeBatchStatus"),
  workspaceSelectVisible: document.getElementById("workspaceSelectVisible"),
  workspaceSelectionCount: document.getElementById("workspaceSelectionCount"),
  removeSelectedApplications: document.getElementById("removeSelectedApplications"),
  workspaceApplications: document.getElementById("workspaceApplications"),
  workspaceEmpty: document.getElementById("workspaceEmpty"),
  nextActionTitle: document.getElementById("nextActionTitle"),
  workspaceSelectedCompany: document.getElementById("workspaceSelectedCompany"),
  workspaceStageTrack: document.getElementById("workspaceStageTrack"),
  workspaceSelectedStatus: document.getElementById("workspaceSelectedStatus"),
  workspaceSelectedMeta: document.getElementById("workspaceSelectedMeta"),
  workspaceActionHint: document.getElementById("workspaceActionHint"),
  workspaceNextAction: document.getElementById("workspaceNextAction"),
  workspaceViewDetail: document.getElementById("workspaceViewDetail"),
  jobDetailDialog: document.getElementById("jobDetailDialog"),
  closeJobDetailDialog: document.getElementById("closeJobDetailDialog"),
  closeJobDetailDialogSecondary: document.getElementById("closeJobDetailDialogSecondary"),
  jobDetailDialogTitle: document.getElementById("jobDetailDialogTitle"),
  jobDetailMeta: document.getElementById("jobDetailMeta"),
  jobDetailDescription: document.getElementById("jobDetailDescription"),
  jobDetailScreening: document.getElementById("jobDetailScreening"),
  jobDetailResume: document.getElementById("jobDetailResume"),
  jobDetailBossLink: document.getElementById("jobDetailBossLink"),
  createQueueDialog: document.getElementById("createQueueDialog"),
  createQueueForm: document.getElementById("createQueueForm"),
  closeCreateQueueDialog: document.getElementById("closeCreateQueueDialog"),
  cancelCreateQueue: document.getElementById("cancelCreateQueue"),
  createQueueName: document.getElementById("createQueueName"),
  createQueueDescription: document.getElementById("createQueueDescription"),
  advancedDiagnostics: document.getElementById("advancedDiagnostics"),
  advancedDiagnosticsMount: document.getElementById("advancedDiagnosticsMount"),
  resumeReviewDialog: document.getElementById("resumeReviewDialog"),
  resumeReviewDialogBody: document.getElementById("resumeReviewDialogBody"),
  closeResumeReviewDialog: document.getElementById("closeResumeReviewDialog"),
  realGreetingDialog: document.getElementById("realGreetingDialog"),
  closeRealGreetingDialog: document.getElementById("closeRealGreetingDialog"),
  realGreetingStepOne: document.getElementById("realGreetingStepOne"),
  realGreetingStepTwo: document.getElementById("realGreetingStepTwo"),
  realGreetingTarget: document.getElementById("realGreetingTarget"),
  realGreetingFinalSummary: document.getElementById("realGreetingFinalSummary"),
  realGreetingConfirmRationale: document.getElementById("realGreetingConfirmRationale"),
  realGreetingConfirmAcknowledgement: document.getElementById("realGreetingConfirmAcknowledgement"),
  realGreetingContinue: document.getElementById("realGreetingContinue"),
  realGreetingBack: document.getElementById("realGreetingBack"),
  realGreetingConfirmSend: document.getElementById("realGreetingConfirmSend"),
  save: document.getElementById("save"),
  refreshDiagnostics: document.getElementById("refreshDiagnostics"),
  refreshWorkflow: document.getElementById("refreshWorkflow"),
  refreshScreening: document.getElementById("refreshScreening"),
  refreshAgentQuality: document.getElementById("refreshAgentQuality"),
  modelConfigForm: document.getElementById("modelConfigForm"),
  modelConfigBadge: document.getElementById("modelConfigBadge"),
  modelBaseUrl: document.getElementById("modelBaseUrl"),
  modelName: document.getElementById("modelName"),
  modelWireApi: document.getElementById("modelWireApi"),
  modelApiKey: document.getElementById("modelApiKey"),
  modelReasoningEffort: document.getElementById("modelReasoningEffort"),
  modelTimeoutMs: document.getElementById("modelTimeoutMs"),
  modelMaxRetries: document.getElementById("modelMaxRetries"),
  saveModelConfig: document.getElementById("saveModelConfig"),
  testModelConfig: document.getElementById("testModelConfig"),
  clearModelApiKey: document.getElementById("clearModelApiKey"),
  modelConfigStatus: document.getElementById("modelConfigStatus"),
  runRulesBatchScreening: document.getElementById("runRulesBatchScreening"),
  runRiskGateRescreen: document.getElementById("runRiskGateRescreen"),
  refreshResume: document.getElementById("refreshResume"),
  runSelectedResumeWorkflow: document.getElementById("runSelectedResumeWorkflow"),
  resumeTemplateName: document.getElementById("resumeTemplateName"),
  prepareRulesResume: document.getElementById("prepareRulesResume"),
  evaluateResumeFit: document.getElementById("evaluateResumeFit"),
  verifyResumeClaims: document.getElementById("verifyResumeClaims"),
  reviseResumeFromChecks: document.getElementById("reviseResumeFromChecks"),
  auditRulesResume: document.getElementById("auditRulesResume"),
  refreshGreeting: document.getElementById("refreshGreeting"),
  prepareGreetingDryRun: document.getElementById("prepareGreetingDryRun"),
  prepareExecutionPackage: document.getElementById("prepareExecutionPackage"),
  runGreetingDryRunTask: document.getElementById("runGreetingDryRunTask"),
  queueConversationRefreshTask: document.getElementById("queueConversationRefreshTask"),
  queueResumeUnlockCheckTask: document.getElementById("queueResumeUnlockCheckTask"),
  queueResumeUploadDryRunTask: document.getElementById("queueResumeUploadDryRunTask"),
  queueSubmitApplicationDryRunTask: document.getElementById("queueSubmitApplicationDryRunTask"),
  runReadOnlyBossTask: document.getElementById("runReadOnlyBossTask"),
  greetingConversations: document.getElementById("greetingConversations"),
  submissionReadinessQueue: document.getElementById("submissionReadinessQueue"),
  executionPackageDetail: document.getElementById("executionPackageDetail"),
  executionPackageReviewActions: document.getElementById("executionPackageReviewActions"),
  executionChecklistDetail: document.getElementById("executionChecklistDetail"),
  readSubmissionPageResult: document.getElementById("readSubmissionPageResult"),
  recordSubmissionPageResult: document.getElementById("recordSubmissionPageResult"),
  submissionEvidenceDetail: document.getElementById("submissionEvidenceDetail"),
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
  agentQualityInvocations: document.getElementById("agentQualityInvocations"),
  agentQualityTokens: document.getElementById("agentQualityTokens"),
  agentQualityLatency: document.getElementById("agentQualityLatency"),
  agentQualityGate: document.getElementById("agentQualityGate"),
  agentQualityStatus: document.getElementById("agentQualityStatus"),
  agentShadowRunBadge: document.getElementById("agentShadowRunBadge"),
  startAgentShadowRun: document.getElementById("startAgentShadowRun"),
  agentShadowProgress: document.getElementById("agentShadowProgress"),
  agentShadowSamples: document.getElementById("agentShadowSamples"),
  agentShadowTokens: document.getElementById("agentShadowTokens"),
  agentShadowFailures: document.getElementById("agentShadowFailures"),
  agentShadowStatus: document.getElementById("agentShadowStatus"),
  agentShadowItems: document.getElementById("agentShadowItems"),
  agentShadowReviewForm: document.getElementById("agentShadowReviewForm"),
  agentShadowReviewItem: document.getElementById("agentShadowReviewItem"),
  agentShadowReviewLabel: document.getElementById("agentShadowReviewLabel"),
  agentShadowCorrectedRecommendation: document.getElementById("agentShadowCorrectedRecommendation"),
  agentShadowReviewNote: document.getElementById("agentShadowReviewNote"),
  saveAgentShadowReview: document.getElementById("saveAgentShadowReview"),
  refreshCareerContext: document.getElementById("refreshCareerContext"),
  profileAgentPortal: document.getElementById("profileAgentPortal"),
  profileDialogSessionSelect: document.getElementById("profileDialogSessionSelect"),
  newProfileDialogSession: document.getElementById("newProfileDialogSession"),
  refreshProfileDialog: document.getElementById("refreshProfileDialog"),
  profileDialogStatus: document.getElementById("profileDialogStatus"),
  profileResumeFile: document.getElementById("profileResumeFile"),
  importProfileResume: document.getElementById("importProfileResume"),
  profileResumeImportStatus: document.getElementById("profileResumeImportStatus"),
  profileResumeSources: document.getElementById("profileResumeSources"),
  profileDialogMessages: document.getElementById("profileDialogMessages"),
  profileDialogComposer: document.getElementById("profileDialogComposer"),
  sendProfileDialogMessage: document.getElementById("sendProfileDialogMessage"),
  retryProfileDialogMessage: document.getElementById("retryProfileDialogMessage"),
  profileDialogSummary: document.getElementById("profileDialogSummary"),
  profileDialogOpenQuestions: document.getElementById("profileDialogOpenQuestions"),
  profileDialogConflicts: document.getElementById("profileDialogConflicts"),
  generateCareerContext: document.getElementById("generateCareerContext"),
  generateCareerContextWithAnswers: document.getElementById("generateCareerContextWithAnswers"),
  generateProfileFactDrafts: document.getElementById("generateProfileFactDrafts"),
  refreshProfileFactDrafts: document.getElementById("refreshProfileFactDrafts"),
  regenerateCareerContextAfterFacts: document.getElementById("regenerateCareerContextAfterFacts"),
  careerContextStatus: document.getElementById("careerContextStatus"),
  careerContextAnswerStatus: document.getElementById("careerContextAnswerStatus"),
  profileAgentUpdateStatus: document.getElementById("profileAgentUpdateStatus"),
  profileFactDraftStatus: document.getElementById("profileFactDraftStatus"),
  careerContextFreshnessStatus: document.getElementById("careerContextFreshnessStatus"),
  careerContextExists: document.getElementById("careerContextExists"),
  careerContextBytes: document.getElementById("careerContextBytes"),
  careerContextQuestionCount: document.getElementById("careerContextQuestionCount"),
  careerContextMeta: document.getElementById("careerContextMeta"),
  careerContextQuestions: document.getElementById("careerContextQuestions"),
  careerContextAnswerForm: document.getElementById("careerContextAnswerForm"),
  profileAgentUserUpdate: document.getElementById("profileAgentUserUpdate"),
  stageProfileAgentUpdate: document.getElementById("stageProfileAgentUpdate"),
  clearProfileAgentUpdate: document.getElementById("clearProfileAgentUpdate"),
  profileFactDrafts: document.getElementById("profileFactDrafts"),
  careerContextPreview: document.getElementById("careerContextPreview"),
  careerContextViewer: document.getElementById("careerContextViewer"),
  viewCareerContext: document.getElementById("viewCareerContext"),
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
  realGreetingEnabled: document.getElementById("realGreetingEnabled"),
  realGreetingRationale: document.getElementById("realGreetingRationale"),
  armRealGreeting: document.getElementById("armRealGreeting"),
  runRealGreetingOnce: document.getElementById("runRealGreetingOnce"),
  revokeRealGreeting: document.getElementById("revokeRealGreeting"),
  realGreetingStatus: document.getElementById("realGreetingStatus"),
  realGreetingDetail: document.getElementById("realGreetingDetail"),
  recentEventCount: document.getElementById("recentEventCount"),
  recentEvents: document.getElementById("recentEvents"),
  missingDescriptionCount: document.getElementById("missingDescriptionCount"),
  missingDescriptions: document.getElementById("missingDescriptions"),
  removeMissingDescriptions: document.getElementById("removeMissingDescriptions"),
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
  applicationQueues: [],
  activeApplicationQueueId: null,
  applications: [],
  totalApplications: 0,
  selectedApplicationId: null,
  selectedApplicationIds: new Set(),
  visibleApplicationIds: [],
  workbenchStageFilter: "collected",
  queueBatchBusy: false,
  activeView: "workspace",
  screeningCandidates: [],
  screenings: [],
  greetingMessages: [],
  conversations: [],
  browserTaskCounts: {},
  missingDescriptionTotal: 0,
  workbenchBusy: false,
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
  selectedExecutionPackage: null,
  careerContext: null,
  careerContextFreshness: null,
  careerContextQuestions: [],
  careerContextAnswers: [],
  profileFactDrafts: [],
  profileDialogSessions: [],
  activeProfileDialogSessionId: null,
  profileDialogMessages: [],
  profileDialogFailedUserMessageId: null,
  profileDialogBusy: false,
  careerContextNeedsRegeneration: false,
  workflowErrors: [],
  workflowEvents: [],
  selectedTimelineApplicationId: null,
  selectedExecutionPackageApplicationId: null,
  latestSubmissionPageResult: null,
  realActionPolicy: null,
  realActionAuthorization: null,
  realActionAuthorizationToken: "",
  agentQuality: null,
  modelConfig: null,
  agentShadowRun: null,
  agentShadowPollTimer: null
};

organizeOptionPanels();
ensureGreetingDryRunControls();
setupOptionWorkspace();

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
      button.className = "secondary diagnostic-command";
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
  if (!ui.prepareExecutionPackage && prepareButton?.parentElement) {
    const button = document.createElement("button");
    button.id = "prepareExecutionPackage";
    button.className = "secondary";
    button.type = "button";
    button.textContent = "Prepare execution package";
    prepareButton.parentElement.appendChild(button);
    ui.prepareExecutionPackage = button;
  }
  if (!ui.executionPackageDetail && ui.greetingTasks?.parentElement?.parentElement) {
    const block = document.createElement("div");
    block.className = "execution-package-panel";
    const heading = document.createElement("div");
    heading.className = "list-heading";
    heading.textContent = "Local execution package";
    const detail = document.createElement("div");
    detail.id = "executionPackageDetail";
    detail.className = "detail-section execution-package-detail";
    detail.textContent = "No execution package prepared";
    block.append(heading, detail);
    ui.greetingTasks.parentElement.parentElement.insertAdjacentElement("afterend", block);
    ui.executionPackageDetail = detail;
  }
  if (!ui.executionPackageReviewActions && ui.executionPackageDetail?.parentElement) {
    const actions = document.createElement("div");
    actions.id = "executionPackageReviewActions";
    actions.className = "button-row compact hidden";
    actions.hidden = true;
    ui.executionPackageDetail.after(actions);
    ui.executionPackageReviewActions = actions;
  }
  if (!ui.executionChecklistDetail && ui.executionPackageReviewActions?.parentElement) {
    const heading = document.createElement("div");
    heading.className = "list-heading";
    heading.textContent = "Manual execution checklist";
    const detail = document.createElement("div");
    detail.id = "executionChecklistDetail";
    detail.className = "detail-section execution-checklist-detail";
    detail.textContent = "No execution checklist loaded";
    ui.executionPackageReviewActions.after(heading, detail);
    ui.executionChecklistDetail = detail;
  }
  if (!ui.submissionEvidenceDetail && ui.executionChecklistDetail?.parentElement) {
    const heading = document.createElement("div");
    heading.className = "list-heading";
    heading.textContent = "Submission evidence";
    const actions = document.createElement("div");
    actions.className = "button-row compact";
    const readButton = document.createElement("button");
    readButton.id = "readSubmissionPageResult";
    readButton.className = "secondary";
    readButton.type = "button";
    readButton.textContent = "Read current BOSS result";
    const recordButton = document.createElement("button");
    recordButton.id = "recordSubmissionPageResult";
    recordButton.className = "secondary";
    recordButton.type = "button";
    recordButton.textContent = "Record result evidence";
    const detail = document.createElement("div");
    detail.id = "submissionEvidenceDetail";
    detail.className = "detail-section submission-evidence-detail";
    detail.textContent = "No submission evidence recorded";
    actions.append(readButton, recordButton);
    ui.executionChecklistDetail.after(heading, actions, detail);
    ui.readSubmissionPageResult = readButton;
    ui.recordSubmissionPageResult = recordButton;
    ui.submissionEvidenceDetail = detail;
  }
}

function organizeOptionPanels() {
  const legacyPanels = document.getElementById("legacyPanels");
  if (!legacyPanels) {
    return;
  }
  const legacyCards = Array.from(legacyPanels.children).filter((node) => node.matches?.(".card"));
  const settingsCard = legacyCards[0] || null;
  const profilePortal = document.getElementById("profileAgentPortal");
  const riskGatePanel = legacyPanels.querySelector(".risk-gate-panel");
  const templatePanel = legacyPanels.querySelector(".inline-setting-row");
  const executionModePanel = fields.agentExecutionMode?.closest(".inline-setting-row") || null;
  const resumeDetailPanel = document.getElementById("resumeDetailPanel");
  const settingsCoreMount = document.getElementById("settingsCoreMount");
  const workspaceRiskMount = document.getElementById("workspaceRiskMount");
  const workspaceResumeMount = document.getElementById("workspaceResumeMount");
  const compatibilityMount = document.getElementById("retainedCompatibilityPanels");

  if (settingsCard && settingsCoreMount) {
    settingsCoreMount.appendChild(settingsCard);
  }
  if (profilePortal && ui.profilePanel) {
    ui.profilePanel.appendChild(profilePortal);
  }
  if (riskGatePanel && workspaceRiskMount) {
    workspaceRiskMount.appendChild(riskGatePanel);
  }
  if (executionModePanel && workspaceResumeMount) {
    workspaceResumeMount.appendChild(executionModePanel);
  }
  if (templatePanel && workspaceResumeMount) {
    workspaceResumeMount.appendChild(templatePanel);
  }
  if (resumeDetailPanel && ui.resumeReviewDialogBody) {
    ui.resumeReviewDialogBody.appendChild(resumeDetailPanel);
  }
  for (const card of legacyCards) {
    if (card !== settingsCard && card !== profilePortal) {
      const title = cleanUiText(card.querySelector("h2")?.textContent);
      if (new Set(["最近异常", "Workflow progress"]).has(title)) {
        ui.advancedDiagnosticsMount.appendChild(card);
      } else {
        compatibilityMount?.appendChild(card);
      }
    }
  }
  legacyPanels.remove();
}

function setupOptionWorkspace() {
  const tabs = [ui.workspaceTab, ui.profileTab, ui.settingsTab].filter(Boolean);
  for (const tab of tabs) {
    tab.addEventListener("click", () => activateView(tab.dataset.viewTarget, { focus: false }));
    tab.addEventListener("keydown", (event) => {
      if (!new Set(["ArrowLeft", "ArrowRight", "Home", "End"]).has(event.key)) {
        return;
      }
      event.preventDefault();
      const currentIndex = tabs.indexOf(tab);
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : event.key === "ArrowRight"
            ? (currentIndex + 1) % tabs.length
            : (currentIndex - 1 + tabs.length) % tabs.length;
      activateView(tabs[nextIndex].dataset.viewTarget, { focus: true });
    });
  }
  ui.workspaceQueueSelect.addEventListener("change", changeActiveApplicationQueue);
  ui.openCreateQueueDialog.addEventListener("click", openCreateApplicationQueueDialog);
  ui.deleteApplicationQueue.addEventListener("click", archiveActiveApplicationQueue);
  ui.workspaceFilter.addEventListener("change", renderWorkbench);
  ui.workspaceManualFilter.addEventListener("change", renderWorkbench);
  for (const stageButton of document.querySelectorAll("[data-workbench-stage]")) {
    stageButton.addEventListener("click", () => activateWorkbenchStage(stageButton.dataset.workbenchStage));
  }
  ui.runQueueScreening.addEventListener("click", runActiveQueueScreening);
  ui.runQueueResumeWorkflow.addEventListener("click", runActiveQueueResumeBatch);
  ui.workspaceSelectVisible.addEventListener("change", toggleVisibleApplicationSelection);
  ui.removeSelectedApplications.addEventListener("click", removeSelectedApplicationsFromQueue);
  ui.workspaceNextAction.addEventListener("click", runWorkbenchNextAction);
  ui.workspaceViewDetail.addEventListener("click", () => openJobDetailDialog(state.selectedApplicationId));
  ui.createQueueForm.addEventListener("submit", createApplicationQueueFromDialog);
  ui.closeCreateQueueDialog.addEventListener("click", closeCreateApplicationQueueDialog);
  ui.cancelCreateQueue.addEventListener("click", closeCreateApplicationQueueDialog);
  ui.createQueueDialog.addEventListener("click", closeDialogFromBackdrop);
  ui.closeJobDetailDialog.addEventListener("click", () => ui.jobDetailDialog.close());
  ui.closeJobDetailDialogSecondary.addEventListener("click", () => ui.jobDetailDialog.close());
  ui.jobDetailDialog.addEventListener("click", closeDialogFromBackdrop);
  ui.jobDetailBossLink.addEventListener("click", (event) => {
    if (ui.jobDetailBossLink.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
    }
  });
  ui.closeResumeReviewDialog.addEventListener("click", () => ui.resumeReviewDialog.close());
  ui.closeRealGreetingDialog.addEventListener("click", () => ui.realGreetingDialog.close());
  ui.realGreetingConfirmRationale.addEventListener("input", updateRealGreetingContinueState);
  ui.realGreetingConfirmAcknowledgement.addEventListener("change", updateRealGreetingContinueState);
  ui.realGreetingContinue.addEventListener("click", showRealGreetingFinalStep);
  ui.realGreetingBack.addEventListener("click", showRealGreetingFirstStep);
  ui.realGreetingConfirmSend.addEventListener("click", confirmAndRunRealGreeting);
  ui.resumeReviewDialog.addEventListener("click", closeDialogFromBackdrop);
  ui.realGreetingDialog.addEventListener("click", closeDialogFromBackdrop);
  ui.realGreetingDialog.addEventListener("close", resetRealGreetingDialog);

  const initialView = location.hash === "#profile" || location.hash === "#profileAgentPortal"
    ? "profile"
    : location.hash === "#settings"
      ? "settings"
      : "workspace";
  activateView(initialView, { focus: false, updateHash: false });
}

function activateView(viewName, options = {}) {
  const normalized = ["workspace", "profile", "settings"].includes(viewName) ? viewName : "workspace";
  state.activeView = normalized;
  for (const tab of [ui.workspaceTab, ui.profileTab, ui.settingsTab]) {
    const active = tab.dataset.viewTarget === normalized;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && options.focus) {
      tab.focus();
    }
  }
  for (const panel of [ui.workspacePanel, ui.profilePanel, ui.settingsPanel]) {
    panel.hidden = panel.dataset.viewPanel !== normalized;
  }
  if (options.updateHash !== false) {
    const hash = normalized === "workspace" ? "" : `#${normalized}`;
    history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
  }
}

function closeDialogFromBackdrop(event) {
  if (event.target === event.currentTarget) {
    event.currentTarget.close();
  }
}

function openCreateApplicationQueueDialog() {
  ui.createQueueForm.reset();
  ui.createQueueDialog.showModal();
  ui.createQueueName.focus();
}

function closeCreateApplicationQueueDialog() {
  ui.createQueueDialog.close();
}

async function archiveActiveApplicationQueue() {
  const queue = getActiveApplicationQueue();
  if (!queue?.id || queue.isDefault) {
    setStatus("默认队列必须保留，不能删除。", true);
    return;
  }
  if (!window.confirm(`删除意向“${queue.name}”？岗位、筛选、简历和日志历史仍会保留。`)) {
    return;
  }
  try {
    ui.deleteApplicationQueue.disabled = true;
    await runtimeMessage({ type: "ARCHIVE_APPLICATION_QUEUE", queueId: queue.id });
    state.activeApplicationQueueId = null;
    state.selectedApplicationId = null;
    state.selectedApplicationIds.clear();
    const diagnostics = await loadApplicationDiagnostics();
    await runtimeMessage({
      type: "SAVE_SETTINGS",
      settings: { activeApplicationQueueId: diagnostics.activeQueueId }
    });
    renderApplicationDiagnostics(diagnostics);
    setStatus(`意向“${queue.name}”已删除，历史数据未清除。`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    ui.deleteApplicationQueue.disabled = Boolean(getActiveApplicationQueue()?.isDefault);
  }
}

function activateWorkbenchStage(stageName) {
  const stage = new Set(["collected", "screened", "resume", "manual"]).has(stageName)
    ? stageName
    : "collected";
  state.workbenchStageFilter = stage;
  state.selectedApplicationIds.clear();
  for (const button of document.querySelectorAll("[data-workbench-stage]")) {
    button.classList.toggle("is-active", button.dataset.workbenchStage === stage);
  }
  for (const control of document.querySelectorAll("[data-stage-control]")) {
    control.hidden = control.dataset.stageControl !== stage;
  }
  const titles = {
    collected: "完整 JD 岗位",
    screened: "岗位筛选结果",
    resume: "定制简历结果",
    manual: "人工联系与投递"
  };
  ui.workspaceListTitle.textContent = titles[stage];
  renderWorkbench();
}

async function runActiveQueueScreening() {
  const queue = getActiveApplicationQueue();
  const eligibleStatuses = new Set(["DETAIL_CAPTURED", "SCORED", "SHORTLISTED", "NEEDS_USER_REVIEW"]);
  const applicationIds = state.applications
    .filter((application) => application.descriptionLength >= 80 && eligibleStatuses.has(application.status))
    .map((application) => Number(application.id))
    .filter(Boolean);
  if (!queue?.id || !applicationIds.length) {
    setStatus("当前意向没有可筛选的完整 JD 岗位。", true);
    return;
  }
  try {
    ui.runQueueScreening.disabled = true;
    const excludedDirections = parseDelimitedList(fields.excludedDirections.value);
    const savedSettings = await runtimeMessage({
      type: "SAVE_SETTINGS",
      settings: {
        ...readSettings(),
        riskGateEnabled: fields.riskGateEnabled.checked,
        excludedDirections
      }
    });
    renderSettings(savedSettings);
    let succeeded = 0;
    let failed = 0;
    for (let index = 0; index < applicationIds.length; index += 50) {
      const result = await runtimeMessage({
        type: "SCREEN_APPLICATION_BATCH",
        options: {
          queueId: queue.id,
          applicationIds: applicationIds.slice(index, index + 50),
          mode: getSelectedAgentExecutionMode(),
          limit: 50,
          includeAlreadyScreened: true,
          continueOnError: true,
          userRules: {
            excludedDirections: fields.riskGateEnabled.checked ? excludedDirections : []
          }
        }
      });
      succeeded += Number(result.response?.succeeded || 0);
      failed += Number(result.response?.failed || 0);
    }
    await Promise.all([
      refreshApplicationDiagnostics({ silent: true }),
      refreshScreeningDiagnostics({ silent: true })
    ]);
    activateWorkbenchStage("screened");
    setStatus(`“${queue.name}”筛选完成：成功 ${succeeded}，失败 ${failed}`, failed > 0);
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    ui.runQueueScreening.disabled = false;
  }
}

async function runActiveQueueResumeBatch() {
  const queue = getActiveApplicationQueue();
  const candidates = state.applications.filter((application) => (
    application.descriptionLength >= 80
    && application.latestScreeningRecommendation === "auto_prepare"
    && !application.latestResumeVersionId
  ));
  if (!queue?.id || !candidates.length) {
    setStatus("当前意向没有待生成的筛选通过岗位。", true);
    return;
  }
  try {
    state.queueBatchBusy = true;
    ui.runQueueResumeWorkflow.disabled = true;
    await saveResumeOutputDirectory();
    let succeeded = 0;
    let failed = 0;
    for (const [index, application] of candidates.entries()) {
      ui.queueResumeBatchStatus.textContent = `正在生成 ${index + 1}/${candidates.length}：${application.title || "岗位"}`;
      try {
        await runtimeMessage({
          type: "RUN_RESUME_WORKFLOW_GRAPH",
          applicationId: application.id,
          options: {
            mode: getSelectedAgentExecutionMode(),
            renderDocx: true,
            maxRevisions: 1,
            renderOptions: getResumeRenderOptions(),
            userRules: { forceRescreen: false }
          }
        });
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }
    await Promise.all([
      refreshApplicationDiagnostics({ silent: true }),
      refreshResumeDiagnostics({ silent: true }),
      refreshWorkflowDiagnostics({ silent: true })
    ]);
    ui.queueResumeBatchStatus.textContent = `成功 ${succeeded} · 失败 ${failed}`;
    activateWorkbenchStage("resume");
    setStatus(`“${queue.name}”简历生成完成：成功 ${succeeded}，失败 ${failed}`, failed > 0);
  } catch (error) {
    ui.queueResumeBatchStatus.textContent = error.message || String(error);
    setStatus(error.message || String(error), true);
  } finally {
    state.queueBatchBusy = false;
    ui.runQueueResumeWorkflow.disabled = false;
  }
}

async function trustFilteredApplication(applicationId) {
  const queue = getActiveApplicationQueue();
  const application = state.applications.find((item) => Number(item.id) === Number(applicationId));
  if (!queue?.id || !application?.id) {
    return;
  }
  try {
    await runtimeMessage({
      type: "TRUST_APPLICATION_QUEUE_ITEM",
      queueId: queue.id,
      applicationId: application.id,
      options: {
        actor: "local-user",
        reason: "用户在工作台取消风险过滤并添加信任"
      }
    });
    const excludedDirections = parseDelimitedList(fields.excludedDirections.value);
    await runtimeMessage({
      type: "SCREEN_APPLICATION_BATCH",
      options: {
        queueId: queue.id,
        applicationIds: [application.id],
        mode: getSelectedAgentExecutionMode(),
        limit: 1,
        continueOnError: false,
        userRules: { excludedDirections }
      }
    });
    await Promise.all([
      refreshApplicationDiagnostics({ silent: true }),
      refreshScreeningDiagnostics({ silent: true })
    ]);
    setStatus(`已信任并重新评估：${application.title || "岗位"}`);
  } catch (error) {
    await refreshApplicationDiagnostics({ silent: true }).catch(() => {});
    setStatus(error.message || String(error), true);
  }
}

async function updateApplicationManualStatus(applicationId, manualStatus) {
  try {
    await runtimeMessage({
      type: "UPDATE_MANUAL_APPLICATION_STATUS",
      applicationId,
      options: {
        manualStatus,
        actor: "local-user",
        note: "用户在工作台手动更新联系/投递状态"
      }
    });
    await refreshApplicationDiagnostics({ silent: true });
    setStatus(`人工状态已更新为“${formatManualApplicationStatus(manualStatus)}”`);
  } catch (error) {
    setStatus(error.message || String(error), true);
    await refreshApplicationDiagnostics({ silent: true }).catch(() => {});
  }
}

function openJobDetailDialog(applicationId) {
  const application = state.applications.find((item) => Number(item.id) === Number(applicationId));
  if (!application) {
    return;
  }
  ui.jobDetailDialogTitle.textContent = application.title || "岗位完整信息";
  ui.jobDetailMeta.replaceChildren();
  appendKeyValue(ui.jobDetailMeta, "公司", application.company || "未记录");
  appendKeyValue(ui.jobDetailMeta, "地点/薪资", [application.location, application.salary].filter(Boolean).join(" · ") || "未记录");
  appendKeyValue(ui.jobDetailMeta, "人工状态", formatManualApplicationStatus(application.manualStatus));
  ui.jobDetailDescription.textContent = application.description || "暂无完整职位描述";
  ui.jobDetailScreening.replaceChildren();
  appendKeyValue(ui.jobDetailScreening, "推荐", formatRecommendation(application.latestScreeningRecommendation));
  appendKeyValue(ui.jobDetailScreening, "匹配", application.latestMatchScore === null ? "未评估" : `${formatScore(application.latestMatchScore)}/100`);
  appendKeyValue(ui.jobDetailScreening, "风险", application.latestRiskScore === null ? "未评估" : `${formatScore(application.latestRiskScore)}/100`);
  ui.jobDetailResume.replaceChildren();
  appendKeyValue(ui.jobDetailResume, "状态", application.latestResumeVersionId ? formatResumeVersionStatus(application.latestResumeStatus) : "尚未生成");
  appendKeyValue(ui.jobDetailResume, "文件", application.latestResumeFilePath || application.latestResumeErrorCode || "暂无");
  const bossUrl = normalizeBossJobUrl(application.detailUrl);
  ui.jobDetailBossLink.href = bossUrl || "#";
  ui.jobDetailBossLink.setAttribute("aria-disabled", String(!bossUrl));
  ui.jobDetailBossLink.classList.toggle("is-disabled", !bossUrl);
  if (!ui.jobDetailDialog.open) {
    ui.jobDetailDialog.showModal();
  }
}

function openBossApplication(application) {
  const bossUrl = normalizeBossJobUrl(application?.detailUrl);
  if (!bossUrl) {
    throw new Error("当前岗位没有可打开的 BOSS 详情地址");
  }
  chrome.tabs.create({ url: bossUrl });
  setStatus(`已打开 ${application.title || "岗位"}，请人工完成打招呼或投递。`);
}

async function createApplicationQueueFromDialog(event) {
  event.preventDefault();
  const name = cleanUiText(ui.createQueueName.value);
  if (!name) {
    setStatus("请输入岗位队列名称", true);
    ui.createQueueName.focus();
    return;
  }
  try {
    ui.createQueueForm.querySelector("button[type='submit']").disabled = true;
    const result = await runtimeMessage({
      type: "CREATE_APPLICATION_QUEUE",
      queue: {
        name,
        description: cleanUiText(ui.createQueueDescription.value)
      }
    });
    const queue = result.response?.queue;
    if (!queue?.id) {
      throw new Error("后端未返回新队列");
    }
    state.activeApplicationQueueId = Number(queue.id);
    state.selectedApplicationIds.clear();
    await runtimeMessage({
      type: "SAVE_SETTINGS",
      settings: { activeApplicationQueueId: queue.id }
    });
    closeCreateApplicationQueueDialog();
    await refreshApplicationQueueScope();
    setStatus(`已创建并切换到“${queue.name}”`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    ui.createQueueForm.querySelector("button[type='submit']").disabled = false;
  }
}

async function changeActiveApplicationQueue() {
  const queueId = Number(ui.workspaceQueueSelect.value || 0);
  if (!Number.isInteger(queueId) || queueId <= 0 || queueId === state.activeApplicationQueueId) {
    return;
  }
  try {
    state.activeApplicationQueueId = queueId;
    state.selectedApplicationId = null;
    state.selectedApplicationIds.clear();
    await runtimeMessage({
      type: "SAVE_SETTINGS",
      settings: { activeApplicationQueueId: queueId }
    });
    await refreshApplicationQueueScope();
    const queue = getActiveApplicationQueue();
    setStatus(`已切换到“${queue?.name || "岗位队列"}”`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

async function refreshApplicationQueueScope() {
  const diagnostics = await loadApplicationDiagnostics();
  renderApplicationDiagnostics(diagnostics);
  const missing = await runtimeMessage({
    type: "GET_MISSING_DESCRIPTIONS",
    options: {
      queueId: state.activeApplicationQueueId,
      limit: 200,
      minDescriptionLength: 80
    }
  });
  renderMissingDescriptions(
    missing.jobs || [],
    missing.totalMissingDescriptions || 0
  );
}

function toggleVisibleApplicationSelection() {
  const shouldSelect = ui.workspaceSelectVisible.checked;
  for (const applicationId of state.visibleApplicationIds) {
    if (shouldSelect) {
      state.selectedApplicationIds.add(applicationId);
    } else {
      state.selectedApplicationIds.delete(applicationId);
    }
  }
  renderWorkbench();
}

function toggleApplicationSelection(applicationId, selected) {
  const id = Number(applicationId);
  if (selected) {
    state.selectedApplicationIds.add(id);
  } else {
    state.selectedApplicationIds.delete(id);
  }
  updateApplicationSelectionControls();
}

function updateApplicationSelectionControls() {
  const visibleIds = state.visibleApplicationIds;
  const selectedVisibleCount = visibleIds.filter((id) => state.selectedApplicationIds.has(id)).length;
  ui.workspaceSelectVisible.checked = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  ui.workspaceSelectVisible.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
  ui.workspaceSelectVisible.disabled = visibleIds.length === 0;
  ui.workspaceSelectionCount.textContent = `已选 ${state.selectedApplicationIds.size}`;
  ui.removeSelectedApplications.disabled = state.selectedApplicationIds.size === 0;
}

async function removeSelectedApplicationsFromQueue() {
  const applicationIds = Array.from(state.selectedApplicationIds);
  const queue = getActiveApplicationQueue();
  if (!queue?.id || !applicationIds.length) {
    return;
  }
  if (!window.confirm(`从“${queue.name}”移出已选 ${applicationIds.length} 个岗位？历史记录不会删除。`)) {
    return;
  }
  try {
    ui.removeSelectedApplications.disabled = true;
    const result = await runtimeMessage({
      type: "REMOVE_APPLICATION_QUEUE_ITEMS",
      queueId: queue.id,
      options: {
        applicationIds,
        removedBy: "options-workbench",
        reason: "workbench_bulk_remove"
      }
    });
    state.selectedApplicationIds.clear();
    state.selectedApplicationId = null;
    await refreshApplicationQueueScope();
    setStatus(`已从当前队列移出 ${result.response?.removed || 0} 个岗位`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    updateApplicationSelectionControls();
  }
}

async function removeAllMissingDescriptionsFromQueue() {
  const queue = getActiveApplicationQueue();
  const total = Number(state.missingDescriptionTotal || 0);
  if (!queue?.id || total <= 0) {
    return;
  }
  if (!window.confirm(`从“${queue.name}”移出全部 ${total} 个待补 JD 岗位？再次采集时不会自动恢复。`)) {
    return;
  }
  try {
    ui.removeMissingDescriptions.disabled = true;
    const result = await runtimeMessage({
      type: "REMOVE_MISSING_DESCRIPTION_ITEMS",
      queueId: queue.id,
      options: {
        minDescriptionLength: 80,
        removedBy: "options-missing-jd",
        reason: "missing_jd_bulk_remove"
      }
    });
    state.selectedApplicationIds.clear();
    await refreshApplicationQueueScope();
    setStatus(`已移出 ${result.response?.removed || 0} 个待补 JD 岗位`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

function getActiveApplicationQueue() {
  return state.applicationQueues.find((queue) => (
    Number(queue.id) === Number(state.activeApplicationQueueId)
  )) || null;
}

function updateRealGreetingContinueState() {
  const rationale = cleanUiText(ui.realGreetingConfirmRationale.value);
  ui.realGreetingContinue.disabled = !rationale || !ui.realGreetingConfirmAcknowledgement.checked;
}

function showRealGreetingFirstStep() {
  ui.realGreetingStepOne.hidden = false;
  ui.realGreetingStepTwo.hidden = true;
}

function showRealGreetingFinalStep() {
  if (ui.realGreetingContinue.disabled) {
    return;
  }
  const application = getSelectedWorkbenchApplication();
  const message = getGreetingMessageForApplication(application?.id);
  ui.realGreetingFinalSummary.textContent = formatRealGreetingConfirmation(application, message);
  ui.realGreetingStepOne.hidden = true;
  ui.realGreetingStepTwo.hidden = false;
}

function resetRealGreetingDialog() {
  ui.realGreetingConfirmRationale.value = "";
  ui.realGreetingConfirmAcknowledgement.checked = false;
  ui.realGreetingContinue.disabled = true;
  ui.realGreetingConfirmSend.disabled = false;
  showRealGreetingFirstStep();
}

document.addEventListener("DOMContentLoaded", init);
ui.save.addEventListener("click", save);
ui.refreshDiagnostics.addEventListener("click", () => refreshDiagnostics());
ui.refreshWorkflow.addEventListener("click", () => refreshWorkflowDiagnostics());
ui.refreshScreening.addEventListener("click", () => refreshScreeningDiagnostics());
ui.refreshAgentQuality.addEventListener("click", () => refreshAgentQualityDiagnostics());
ui.modelConfigForm.addEventListener("submit", saveBackendModelConfig);
ui.testModelConfig.addEventListener("click", testBackendModelConfig);
ui.clearModelApiKey.addEventListener("click", clearBackendModelApiKey);
ui.startAgentShadowRun.addEventListener("click", startAgentShadowRun);
ui.agentShadowReviewForm.addEventListener("submit", saveAgentShadowReview);
ui.runRulesBatchScreening.addEventListener("click", runRulesBatchScreening);
ui.runRiskGateRescreen.addEventListener("click", runRiskGateRescreen);
ui.refreshCareerContext.addEventListener("click", () => refreshCareerContextDiagnostics());
ui.newProfileDialogSession.addEventListener("click", () => createProfileDialogSession());
ui.refreshProfileDialog.addEventListener("click", () => refreshProfileDialogDiagnostics());
ui.profileDialogSessionSelect.addEventListener("change", selectProfileDialogSession);
ui.sendProfileDialogMessage.addEventListener("click", sendProfileDialogTurn);
ui.retryProfileDialogMessage.addEventListener("click", retryProfileDialogTurn);
ui.profileDialogComposer.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    sendProfileDialogTurn();
  }
});
ui.generateCareerContext.addEventListener("click", () => generateCareerContext({ includeAnswers: false }));
ui.generateCareerContextWithAnswers.addEventListener("click", () => generateCareerContext({ includeAnswers: true }));
ui.viewCareerContext.addEventListener("click", viewSavedCareerContext);
ui.importProfileResume.addEventListener("click", importProfileResumeFile);
ui.generateProfileFactDrafts.addEventListener("click", generateProfileFactDraftsFromAnswers);
ui.stageProfileAgentUpdate.addEventListener("click", stageProfileAgentUserUpdate);
ui.clearProfileAgentUpdate.addEventListener("click", clearProfileAgentUserUpdate);
ui.refreshProfileFactDrafts.addEventListener("click", () => refreshProfileFactDrafts());
ui.regenerateCareerContextAfterFacts.addEventListener("click", () => generateCareerContext({ includeAnswers: true, afterFactChange: true }));
ui.refreshResume.addEventListener("click", () => refreshResumeDiagnostics());
ui.runSelectedResumeWorkflow.addEventListener("click", () => runResumeWorkflowForSelectedApplication());
ui.resumeTemplateName.addEventListener("change", saveResumeTemplateSelection);
fields.agentExecutionMode.addEventListener("change", saveAgentExecutionMode);
fields.resumeOutputDir.addEventListener("change", saveResumeOutputDirectory);
ui.prepareRulesResume.addEventListener("click", prepareRulesResume);
ui.evaluateResumeFit.addEventListener("click", evaluateSelectedResumeFit);
ui.verifyResumeClaims.addEventListener("click", verifySelectedResumeClaims);
ui.reviseResumeFromChecks.addEventListener("click", reviseSelectedResumeFromChecks);
ui.auditRulesResume.addEventListener("click", auditRulesResume);
ui.refreshGreeting.addEventListener("click", async () => {
  await refreshGreetingDiagnostics();
  await refreshRealActionDiagnostics({ silent: true });
});
ui.prepareGreetingDryRun.addEventListener("click", () => prepareGreetingDryRun());
ui.realGreetingEnabled.addEventListener("change", updateRealGreetingPolicyFromToggle);
ui.armRealGreeting.addEventListener("click", armRealGreetingForSelectedApplication);
ui.runRealGreetingOnce.addEventListener("click", runAuthorizedRealGreetingOnce);
ui.revokeRealGreeting.addEventListener("click", revokeActiveRealGreetingAuthorization);
ui.prepareExecutionPackage.addEventListener("click", () => prepareExecutionPackageForSelectedApplication());
ui.runGreetingDryRunTask.addEventListener("click", runGreetingDryRunTask);
ui.queueConversationRefreshTask.addEventListener("click", () => queueReadOnlyBossTask("REFRESH_CONVERSATION"));
ui.queueResumeUnlockCheckTask.addEventListener("click", () => queueReadOnlyBossTask("CHECK_RESUME_UNLOCK"));
ui.queueResumeUploadDryRunTask.addEventListener("click", () => queueReadOnlyBossTask("UPLOAD_RESUME"));
ui.queueSubmitApplicationDryRunTask.addEventListener("click", () => queueReadOnlyBossTask("SUBMIT_APPLICATION"));
ui.runReadOnlyBossTask.addEventListener("click", runReadOnlyBossTask);
ui.readSubmissionPageResult.addEventListener("click", () => readSubmissionPageResult());
ui.recordSubmissionPageResult.addEventListener("click", () => recordSubmissionPageResult());
ui.toggleResumeEditor.addEventListener("click", toggleResumeEditor);
ui.saveResumeRevision.addEventListener("click", saveResumeRevision);
ui.approveResumeLocal.addEventListener("click", approveResumeLocal);
ui.clearCache.addEventListener("click", clearCache);
ui.requeueCurrentPage.addEventListener("click", requeueCurrentPageTasks);
ui.cancelCurrentPage.addEventListener("click", cancelCurrentPageTasks);
ui.removeMissingDescriptions.addEventListener("click", removeAllMissingDescriptionsFromQueue);
clearResumeDetail();

async function init() {
  try {
    const settings = await runtimeMessage({ type: "GET_SETTINGS" });
    renderSettings(settings);
    await refreshResumeTemplates({ silent: true });
    await refreshDiagnostics({ silent: true });
    await refreshProfileResumeSources({ silent: true });
    await refreshBackendModelConfig({ silent: true });
    await refreshAgentQualityDiagnostics({ silent: true });
    await refreshAgentShadowDiagnostics({ silent: true });
    await refreshRealActionDiagnostics({ silent: true });
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
    agentExecutionMode: getSelectedAgentExecutionMode(),
    activeApplicationQueueId: state.activeApplicationQueueId,
    resumeTemplateName: getSelectedResumeTemplateName(),
    resumeOutputDir: cleanUiText(fields.resumeOutputDir.value),
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
  fields.resumeOutputDir.value = settings.resumeOutputDir || "";
  state.activeApplicationQueueId = Number(settings.activeApplicationQueueId || 0) || null;
  fields.agentExecutionMode.value = normalizeAgentExecutionMode(settings.agentExecutionMode || "hybrid");
  if (ui.resumeTemplateName && settings.resumeTemplateName) {
    ui.resumeTemplateName.dataset.pendingValue = settings.resumeTemplateName;
    ui.resumeTemplateName.value = settings.resumeTemplateName;
  }
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
  const [applicationResult] = await Promise.allSettled([
    loadApplicationDiagnostics()
  ]);
  const [cacheResult, qualityResult, eventsResult, taskResult, missingResult, pageResult, workflowResult, screeningResult, careerContextResult, profileDialogResult, resumeResult, greetingResult] = await Promise.allSettled([
    runtimeMessage({ type: "GET_CACHE" }),
    runtimeMessage({ type: "GET_QUALITY" }),
    runtimeMessage({ type: "GET_EVENTS", limit: 8 }),
    runtimeMessage({ type: "GET_BROWSER_TASK_DIAGNOSTICS", limit: 8 }),
    runtimeMessage({
      type: "GET_MISSING_DESCRIPTIONS",
      options: { queueId: state.activeApplicationQueueId, limit: 200, minDescriptionLength: 80 }
    }),
    runtimeMessage({ type: "GET_LAST_BOSS_PAGE" }),
    loadWorkflowDiagnostics(),
    loadScreeningDiagnostics(),
    loadCareerContextDiagnostics(),
    loadProfileDialogDiagnostics(),
    loadResumeDiagnostics(),
    loadGreetingDiagnostics()
  ]);

  if (applicationResult.status === "fulfilled") {
    renderApplicationDiagnostics(applicationResult.value);
  } else {
    renderApplicationDiagnostics(null, applicationResult.reason);
  }
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
  if (profileDialogResult.status === "fulfilled") {
    renderProfileDialogDiagnostics(profileDialogResult.value);
  } else {
    renderProfileDialogDiagnostics(null, profileDialogResult.reason);
  }

  renderWorkbench();
  const failed = [applicationResult, cacheResult, qualityResult, eventsResult, taskResult, missingResult, pageResult, workflowResult, screeningResult, careerContextResult, profileDialogResult, resumeResult, greetingResult].find((item) => item.status === "rejected");
  if (failed) {
    setStatus(failed.reason?.message || String(failed.reason), true);
    return;
  }
  setStatus("诊断已刷新");
}

async function loadApplicationDiagnostics() {
  const queueResult = await runtimeMessage({
    type: "GET_APPLICATION_QUEUES"
  });
  const queues = Array.isArray(queueResult.response?.queues) ? queueResult.response.queues : [];
  const requestedQueue = queues.find((queue) => (
    Number(queue.id) === Number(state.activeApplicationQueueId)
  ));
  const activeQueue = requestedQueue || queues.find((queue) => queue.isDefault) || queues[0] || null;
  if (!activeQueue?.id) {
    throw new Error("后端没有可用的岗位队列");
  }
  state.applicationQueues = queues;
  state.activeApplicationQueueId = Number(activeQueue.id);
  const result = await runtimeMessage({
    type: "GET_APPLICATIONS",
    options: {
      queueId: activeQueue.id,
      limit: 500,
      completeDescriptionOnly: true
    }
  });
  return {
    ...(result.response || {}),
    queues,
    activeQueueId: Number(activeQueue.id)
  };
}

async function refreshApplicationDiagnostics(options = {}) {
  try {
    const diagnostics = await loadApplicationDiagnostics();
    renderApplicationDiagnostics(diagnostics);
    if (!options.silent) {
      setStatus("岗位队列已刷新");
    }
    return diagnostics;
  } catch (error) {
    renderApplicationDiagnostics(null, error);
    if (!options.silent) {
      setStatus(error.message || String(error), true);
    }
    return null;
  }
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
    runtimeMessage({ type: "GET_SCREENING_CANDIDATES", options: { limit: 50, minDescriptionLength: 80 } }),
    runtimeMessage({ type: "GET_SCREENINGS", options: { limit: 50 } }),
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

async function refreshProfileResumeSources(options = {}) {
  try {
    const result = await runtimeMessage({ type: "GET_PROFILE_RESUME_SOURCES", options: { limit: 20 } });
    const payload = result.response || {};
    const sources = Array.isArray(payload.resumeSources) ? payload.resumeSources : [];
    renderList(ui.profileResumeSources, sources, (source) => ({
      title: source.fileName || `简历来源 #${source.id}`,
      meta: [
        String(source.sourceType || "").toUpperCase(),
        `${source.textLength || 0} 字`,
        source.createdAt ? formatTime(source.createdAt) : ""
      ].filter(Boolean).join(" · ")
    }), "暂无简历来源");
    if (!options.silent) {
      ui.profileResumeImportStatus.textContent = `已保存 ${payload.totalResumeSources || sources.length} 份简历来源`;
    }
    return payload;
  } catch (error) {
    ui.profileResumeImportStatus.textContent = error.message || String(error);
    ui.profileResumeImportStatus.classList.add("warn");
    if (!options.silent) {
      setStatus(error.message || String(error), true);
    }
    return null;
  }
}

async function importProfileResumeFile() {
  const file = ui.profileResumeFile.files?.[0];
  if (!file) {
    setStatus("请先选择一份简历文件。", true);
    return;
  }
  const extension = String(file.name || "").toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
  if (!new Set([".docx", ".pdf", ".txt", ".md"]).has(extension)) {
    setStatus("仅支持 DOCX、PDF、TXT 和 MD 简历。", true);
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    setStatus("简历文件不能超过 8 MB。", true);
    return;
  }
  try {
    ui.importProfileResume.disabled = true;
    ui.profileResumeImportStatus.classList.remove("warn");
    ui.profileResumeImportStatus.textContent = `正在识别 ${file.name}`;
    const contentBase64 = await readFileAsBase64(file);
    const imported = await runtimeMessage({
      type: "IMPORT_PROFILE_RESUME",
      resume: {
        fileName: file.name,
        contentBase64,
        metadata: {
          source: "options-profile-upload",
          size: file.size,
          mimeType: file.type || ""
        }
      }
    });
    const resumeSource = imported.response?.resumeSource || {};
    if (!resumeSource.id) {
      throw new Error("后端未返回简历来源 ID");
    }
    const drafts = await runtimeMessage({
      type: "CREATE_PROFILE_RESUME_DRAFTS",
      resumeSourceId: resumeSource.id
    });
    await Promise.all([
      refreshProfileResumeSources({ silent: true }),
      refreshProfileFactDrafts({ silent: true })
    ]);
    ui.profileResumeImportStatus.textContent = `已识别 ${resumeSource.textLength || 0} 字，新增 ${drafts.response?.created || 0} 条待确认草稿`;
    setStatus(`简历“${file.name}”已识别，请继续对话并确认事实草稿。`);
  } catch (error) {
    ui.profileResumeImportStatus.textContent = error.message || String(error);
    ui.profileResumeImportStatus.classList.add("warn");
    setStatus(error.message || String(error), true);
  } finally {
    ui.importProfileResume.disabled = false;
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const value = String(reader.result || "");
      resolve(value.includes(",") ? value.slice(value.indexOf(",") + 1) : value);
    });
    reader.addEventListener("error", () => reject(reader.error || new Error("简历文件读取失败")));
    reader.readAsDataURL(file);
  });
}

function viewSavedCareerContext() {
  ui.careerContextViewer.open = true;
  ui.careerContextViewer.scrollIntoView({ behavior: "smooth", block: "start" });
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

async function loadProfileDialogDiagnostics() {
  const sessionResult = await runtimeMessage({
    type: "GET_PROFILE_DIALOG_SESSIONS",
    options: { limit: 30 }
  });
  const sessions = Array.isArray(sessionResult.response?.sessions) ? sessionResult.response.sessions : [];
  const preferredId = Number(state.activeProfileDialogSessionId || 0);
  const active = sessions.find((session) => Number(session.id) === preferredId) || sessions[0] || null;
  if (!active?.id) {
    return {
      sessions,
      totalSessions: Number(sessionResult.response?.totalSessions || 0),
      detail: null
    };
  }
  const detailResult = await runtimeMessage({
    type: "GET_PROFILE_DIALOG_SESSION",
    sessionId: active.id,
    options: {
      messageLimit: 100,
      draftLimit: 100
    }
  });
  return {
    sessions,
    totalSessions: Number(sessionResult.response?.totalSessions || sessions.length),
    detail: detailResult.response || null
  };
}

async function refreshProfileDialogDiagnostics(options = {}) {
  try {
    if (!options.silent) {
      ui.profileDialogStatus.textContent = "正在读取画像对话";
    }
    const diagnostics = await loadProfileDialogDiagnostics();
    renderProfileDialogDiagnostics(diagnostics);
    if (!options.silent) {
      setStatus("ProfileAgent 对话已刷新");
    }
    return diagnostics;
  } catch (error) {
    renderProfileDialogDiagnostics(null, error);
    if (!options.silent) {
      setStatus(error.message || String(error), true);
    }
    return null;
  }
}

async function createProfileDialogSession(options = {}) {
  try {
    setProfileDialogBusy(true, "正在创建画像对话");
    const result = await runtimeMessage({
      type: "CREATE_PROFILE_DIALOG_SESSION",
      options: {
        title: options.title || "职业经历复盘"
      }
    });
    state.activeProfileDialogSessionId = Number(result.response?.session?.id || 0) || null;
    state.profileDialogFailedUserMessageId = null;
    await refreshProfileDialogDiagnostics({ silent: true });
    if (!options.silent) {
      setStatus("已创建新的 ProfileAgent 对话");
    }
    return result.response?.session || null;
  } catch (error) {
    renderProfileDialogDiagnostics(null, error);
    setStatus(error.message || String(error), true);
    return null;
  } finally {
    setProfileDialogBusy(false);
  }
}

async function selectProfileDialogSession() {
  const sessionId = Number(ui.profileDialogSessionSelect.value || 0);
  state.activeProfileDialogSessionId = Number.isInteger(sessionId) && sessionId > 0 ? sessionId : null;
  state.profileDialogFailedUserMessageId = null;
  await refreshProfileDialogDiagnostics({ silent: true });
}

async function sendProfileDialogTurn() {
  const content = String(ui.profileDialogComposer.value || "").trim();
  if (!content) {
    setStatus("请先填写要和 ProfileAgent 讨论的内容。", true);
    ui.profileDialogComposer.focus();
    return;
  }
  try {
    let sessionId = Number(state.activeProfileDialogSessionId || 0);
    if (!sessionId) {
      const session = await createProfileDialogSession({ silent: true });
      sessionId = Number(session?.id || 0);
    }
    if (!sessionId) {
      throw new Error("无法创建 ProfileAgent 对话");
    }
    setProfileDialogBusy(true, "ProfileAgent 正在整理本轮信息");
    const result = await runtimeMessage({
      type: "SEND_PROFILE_DIALOG_MESSAGE",
      sessionId,
      options: { content }
    });
    ui.profileDialogComposer.value = "";
    state.profileDialogFailedUserMessageId = null;
    state.activeProfileDialogSessionId = sessionId;
    await Promise.all([
      refreshProfileDialogDiagnostics({ silent: true }),
      refreshProfileFactDrafts({ silent: true }),
      refreshWorkflowDiagnostics({ silent: true }).catch(() => {})
    ]);
    const payload = result.response || {};
    setStatus(`ProfileAgent 已回复；新增待确认草稿 ${payload.createdDraftCount || 0} 条`);
  } catch (error) {
    const persistedMessageId = Number(error.context?.userMessageId || 0);
    if (persistedMessageId) {
      state.profileDialogFailedUserMessageId = persistedMessageId;
      ui.profileDialogComposer.value = "";
    }
    await refreshProfileDialogDiagnostics({ silent: true }).catch(() => {});
    setStatus(`${error.code || "PROFILE_DIALOG_FAILED"}: ${error.message || String(error)}`, true);
  } finally {
    setProfileDialogBusy(false);
  }
}

async function retryProfileDialogTurn() {
  const sessionId = Number(state.activeProfileDialogSessionId || 0);
  const messageId = Number(state.profileDialogFailedUserMessageId || 0);
  if (!sessionId || !messageId) {
    setStatus("当前没有可重试的 ProfileAgent 消息。", true);
    return;
  }
  try {
    setProfileDialogBusy(true, "ProfileAgent 正在重试上一轮");
    const result = await runtimeMessage({
      type: "RETRY_PROFILE_DIALOG_MESSAGE",
      sessionId,
      messageId,
      options: {}
    });
    state.profileDialogFailedUserMessageId = null;
    await Promise.all([
      refreshProfileDialogDiagnostics({ silent: true }),
      refreshProfileFactDrafts({ silent: true }),
      refreshWorkflowDiagnostics({ silent: true }).catch(() => {})
    ]);
    setStatus(`ProfileAgent 重试成功；新增待确认草稿 ${result.response?.createdDraftCount || 0} 条`);
  } catch (error) {
    state.profileDialogFailedUserMessageId = Number(error.context?.userMessageId || messageId);
    await refreshProfileDialogDiagnostics({ silent: true }).catch(() => {});
    setStatus(`${error.code || "PROFILE_DIALOG_RETRY_FAILED"}: ${error.message || String(error)}`, true);
  } finally {
    setProfileDialogBusy(false);
  }
}

function setProfileDialogBusy(busy, statusText = "") {
  state.profileDialogBusy = Boolean(busy);
  ui.newProfileDialogSession.disabled = Boolean(busy);
  ui.refreshProfileDialog.disabled = Boolean(busy);
  ui.profileDialogSessionSelect.disabled = Boolean(busy);
  ui.sendProfileDialogMessage.disabled = Boolean(busy);
  ui.retryProfileDialogMessage.disabled = Boolean(busy);
  ui.profileDialogComposer.disabled = Boolean(busy);
  if (statusText) {
    ui.profileDialogStatus.textContent = statusText;
  }
}

function renderProfileDialogDiagnostics(diagnostics, error = null) {
  if (error) {
    ui.profileDialogStatus.textContent = error.message || "画像对话不可用";
    ui.profileDialogStatus.classList.add("warn");
    return;
  }
  const sessions = Array.isArray(diagnostics?.sessions) ? diagnostics.sessions : [];
  const detail = diagnostics?.detail || null;
  const session = detail?.session || null;
  const messages = Array.isArray(detail?.messages) ? detail.messages : [];
  state.profileDialogSessions = sessions;
  state.activeProfileDialogSessionId = Number(session?.id || state.activeProfileDialogSessionId || 0) || null;
  state.profileDialogMessages = messages;
  renderProfileDialogSessionOptions(sessions, state.activeProfileDialogSessionId);
  renderProfileDialogMessages(messages);

  const lastFailed = messages.slice().reverse().find((message) => message.role === "assistant" && message.status === "FAILED");
  const lastCompletedAssistant = messages.slice().reverse().find((message) => message.role === "assistant" && message.status === "COMPLETED");
  state.profileDialogFailedUserMessageId = lastFailed
    && (!lastCompletedAssistant || Number(lastFailed.id) > Number(lastCompletedAssistant.id))
    ? Number(lastFailed.retryOfMessageId || 0) || null
    : null;
  ui.retryProfileDialogMessage.hidden = !state.profileDialogFailedUserMessageId;
  ui.retryProfileDialogMessage.classList.toggle("hidden", !state.profileDialogFailedUserMessageId);

  ui.profileDialogStatus.classList.toggle("warn", Boolean(lastFailed));
  ui.profileDialogStatus.textContent = session
    ? [
      `${detail.totalMessages ?? messages.length} 条消息`,
      `${detail.pendingDraftCount || 0} 条待确认`,
      session.modelConfig?.model || "模型待首次调用"
    ].join(" · ")
    : "尚无对话，发送消息时会自动创建";
  renderProfileDialogSummary(ui.profileDialogSummary, session?.summary || {});
  renderTextList(
    ui.profileDialogOpenQuestions,
    (Array.isArray(session?.openQuestions) ? session.openQuestions : []).map((question) => (
      `${question.priority ? `[${question.priority}] ` : ""}${question.prompt || question.question || ""}${question.reason ? `：${question.reason}` : ""}`
    )),
    "暂无待追问问题"
  );
  renderTextList(
    ui.profileDialogConflicts,
    (Array.isArray(session?.conflicts) ? session.conflicts : []).map((conflict) => (
      `${conflict.summary || conflict.type || "待核实"}${conflict.resolutionQuestion ? `：${conflict.resolutionQuestion}` : ""}`
    )),
    "暂无冲突"
  );
}

function renderProfileDialogSessionOptions(sessions, selectedId) {
  ui.profileDialogSessionSelect.replaceChildren();
  if (!sessions.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "暂无对话";
    ui.profileDialogSessionSelect.appendChild(option);
    return;
  }
  for (const session of sessions) {
    const option = document.createElement("option");
    option.value = String(session.id || "");
    option.textContent = `${session.title || `对话 #${session.id}`} · ${session.messageCount || 0} 条`;
    option.selected = Number(session.id) === Number(selectedId);
    ui.profileDialogSessionSelect.appendChild(option);
  }
}

function renderProfileDialogMessages(messages) {
  ui.profileDialogMessages.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "profile-dialog-empty";
    empty.textContent = "开始对话后，ProfileAgent 会逐轮整理经历并提出下一组问题。";
    ui.profileDialogMessages.appendChild(empty);
    return;
  }
  for (const message of messages) {
    const item = document.createElement("article");
    item.className = `profile-dialog-message ${message.role === "user" ? "user" : "assistant"}${message.status === "FAILED" ? " failed" : ""}`;
    const meta = document.createElement("div");
    meta.className = "profile-dialog-message-meta";
    const role = document.createElement("strong");
    role.textContent = message.role === "user" ? "你" : "ProfileAgent";
    const time = document.createElement("span");
    time.textContent = message.createdAt ? formatTime(message.createdAt) : "";
    meta.append(role, time);
    const body = document.createElement("div");
    body.className = "profile-dialog-message-body";
    body.textContent = message.status === "FAILED"
      ? `${message.errorCode || "PROFILE_DIALOG_FAILED"}: ${message.errorMessage || "模型调用失败，用户消息已保留。"}`
      : message.content || "";
    item.append(meta, body);
    ui.profileDialogMessages.appendChild(item);
  }
  ui.profileDialogMessages.scrollTop = ui.profileDialogMessages.scrollHeight;
}

function renderProfileDialogSummary(container, summary) {
  container.replaceChildren();
  const entries = flattenProfileDialogSummary(summary);
  if (!entries.length) {
    container.textContent = "暂无会话摘要";
    return;
  }
  for (const [key, value] of entries) {
    appendKeyValue(container, key, value);
  }
}

function flattenProfileDialogSummary(value, prefix = "", depth = 0) {
  if (!value || typeof value !== "object" || depth > 2) {
    return [];
  }
  const result = [];
  for (const [key, item] of Object.entries(value).slice(0, 20)) {
    const rawLabel = prefix ? `${prefix}.${key}` : key;
    const label = formatProfileDialogSummaryKey(rawLabel);
    if (Array.isArray(item)) {
      if (item.length) {
        result.push([label, item.map((entry) => typeof entry === "object" ? JSON.stringify(entry) : String(entry)).join("、")]);
      }
    } else if (item && typeof item === "object") {
      result.push(...flattenProfileDialogSummary(item, label, depth + 1));
    } else if (item !== "" && item !== null && item !== undefined) {
      result.push([label, String(item)]);
    }
  }
  return result.slice(0, 30);
}

function formatProfileDialogSummaryKey(value) {
  const labels = {
    goals: "求职目标",
    durableGoals: "求职目标",
    motivations: "核心动机",
    preferences: "工作偏好",
    projectThemes: "项目主线",
    projectFocus: "重点项目",
    strengths: "优势证据",
    constraints: "求职约束",
    unresolvedTopics: "未决问题"
  };
  return labels[value] || String(value || "").replaceAll(".", " / ");
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
        sourceSessionId: state.activeProfileDialogSessionId || null,
        writeFile: true
      }
    });
    renderCareerContextDiagnostics(result.response || {});
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
    ui.regenerateCareerContextAfterFacts.disabled = !isCareerContextRegenerationNeeded();
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
  const answers = readCareerContextAnswersWithUserUpdate();
  if (!answers.length) {
    setStatus("请先填写 ProfileAgent 追问回答或主动补充画像内容，再生成事实草稿。", true);
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

async function stageProfileAgentUserUpdate() {
  const answer = readProfileAgentUserUpdateAnswer();
  if (!answer) {
    ui.profileAgentUpdateStatus.textContent = "请先填写要补充或修改的画像内容";
    ui.profileAgentUpdateStatus.classList.add("warn");
    setStatus("请先填写要补充或修改的画像内容。", true);
    return;
  }
  try {
    ui.stageProfileAgentUpdate.disabled = true;
    ui.generateProfileFactDrafts.disabled = true;
    ui.profileAgentUpdateStatus.textContent = "正在生成待确认草稿";
    ui.profileAgentUpdateStatus.classList.remove("warn");
    const result = await runtimeMessage({
      type: "GENERATE_PROFILE_FACT_DRAFTS",
      options: {
        answers: [answer]
      }
    });
    renderProfileFactDrafts(result.response || {});
    await refreshProfileFactDrafts({ silent: true });
    await refreshWorkflowDiagnostics({ silent: true }).catch(() => {});
    const payload = result.response || {};
    ui.profileAgentUpdateStatus.textContent = `已生成 ${payload.created || 0} 条草稿，跳过 ${payload.skipped || 0} 条`;
    setStatus(`画像补充已进入待确认草稿：新增 ${payload.created || 0}，跳过 ${payload.skipped || 0}`);
  } catch (error) {
    ui.profileAgentUpdateStatus.textContent = error.message || String(error);
    ui.profileAgentUpdateStatus.classList.add("warn");
    await refreshWorkflowDiagnostics({ silent: true }).catch(() => {});
    setStatus(error.message || String(error), true);
  } finally {
    ui.stageProfileAgentUpdate.disabled = false;
    ui.generateProfileFactDrafts.disabled = false;
  }
}

function clearProfileAgentUserUpdate() {
  ui.profileAgentUserUpdate.value = "";
  ui.profileAgentUpdateStatus.textContent = "输入后先生成待确认草稿";
  ui.profileAgentUpdateStatus.classList.remove("warn");
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
    await refreshProfileFactDrafts({ silent: true });
    await refreshProfileDialogDiagnostics({ silent: true }).catch(() => {});
    await refreshCareerContextDiagnostics({ silent: true }).catch(() => {
      state.careerContextNeedsRegeneration = true;
      updateCareerContextFreshnessStatus();
    });
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
        limit: 50,
        minDescriptionLength: 80,
        recommendations: ["auto_prepare"],
        statuses: ["SHORTLISTED"],
        excludeExistingResume: true
      }
    }),
    runtimeMessage({ type: "GET_RESUME_VERSIONS", options: { limit: 50 } }),
    runtimeMessage({ type: "GET_RESUME_AUDITS", options: { limit: 50 } }),
    runtimeMessage({ type: "GET_RESUME_FIT_EVALUATIONS", options: { limit: 50 } }),
    runtimeMessage({ type: "GET_RESUME_CLAIM_VERIFICATIONS", options: { limit: 50 } })
  ]);
  return {
    candidates: candidateResult.response || {},
    versions: versionResult.response || {},
    audits: auditResult.response || {},
    fits: fitResult.response || {},
    claims: claimResult.response || {}
  };
}

async function refreshResumeTemplates(options = {}) {
  if (!ui.resumeTemplateName) {
    return;
  }
  try {
    const result = await runtimeMessage({ type: "GET_RESUME_TEMPLATES" });
    renderResumeTemplateOptions(result.response || {});
  } catch (error) {
    if (!options.silent) {
      setStatus(error.message || String(error), true);
    }
  }
}

function renderResumeTemplateOptions(payload = {}) {
  const templates = Array.isArray(payload.templates) ? payload.templates : [];
  if (!ui.resumeTemplateName || !templates.length) {
    return;
  }
  const selected = ui.resumeTemplateName.dataset.pendingValue || getSelectedResumeTemplateName();
  ui.resumeTemplateName.replaceChildren();
  for (const template of templates) {
    const option = document.createElement("option");
    option.value = template.key || "";
    option.textContent = formatResumeTemplateOption(template, payload.defaultTemplate);
    ui.resumeTemplateName.appendChild(option);
  }
  const nextValue = templates.some((template) => template.key === selected)
    ? selected
    : payload.defaultTemplate || templates[0]?.key || "";
  ui.resumeTemplateName.value = nextValue;
  ui.resumeTemplateName.dataset.pendingValue = nextValue;
}

function formatResumeTemplateOption(template = {}, defaultTemplate = "") {
  const parts = [];
  if (template.key && template.key === defaultTemplate) {
    parts.push("默认");
  }
  parts.push(template.label || template.key || "Unnamed template");
  if (template.skillName) {
    parts.push(`skill:${template.skillName}`);
  }
  return parts.join(" · ");
}

function getSelectedResumeTemplateName() {
  return ui.resumeTemplateName?.value || "resume-to-word-campus-product-v1";
}

function getResumeRenderOptions() {
  const outputDir = cleanUiText(fields.resumeOutputDir?.value);
  return {
    templateName: getSelectedResumeTemplateName(),
    ...(outputDir ? { outputDir } : {})
  };
}

async function saveResumeTemplateSelection() {
  try {
    const savedSettings = await runtimeMessage({
      type: "SAVE_SETTINGS",
      settings: readSettings()
    });
    renderSettings(savedSettings);
    setStatus("DOCX template 已保存");
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
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
        renderOptions: getResumeRenderOptions(),
        screeningId: candidate.screeningId || ""
      }
    });
    await refreshResumeDiagnostics({ silent: true });
    await refreshApplicationDiagnostics({ silent: true });
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
        mode: getSelectedAgentExecutionMode(),
        renderDocx: true,
        maxRevisions: 1,
        renderOptions: getResumeRenderOptions(),
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
    await refreshApplicationDiagnostics({ silent: true });
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
  const selectedApplicationId = getSelectedExecutionPackageApplicationId();
  const [messageResult, conversationResult, taskResult, readinessResult] = await Promise.all([
    runtimeMessage({ type: "GET_MESSAGES", options: { limit: 50 } }),
    runtimeMessage({ type: "GET_CONVERSATIONS", options: { limit: 50 } }),
    runtimeMessage({ type: "GET_BROWSER_TASK_DIAGNOSTICS", options: { limit: 8 } }),
    runtimeMessage({ type: "GET_SUBMISSION_READINESS_QUEUE", options: { limit: 8, status: ["READY_FOR_MANUAL_REVIEW", "BLOCKED"] } })
  ]);
  let executionPackage = null;
  let executionChecklist = null;
  let submissionEvidence = null;
  if (selectedApplicationId) {
    try {
      const packageResult = await runtimeMessage({
        type: "GET_EXECUTION_PACKAGE",
        applicationId: selectedApplicationId,
        options: { requestedBy: "options_diagnostics" }
      });
      executionPackage = packageResult.response || null;
      const checklistResult = await runtimeMessage({
        type: "GET_EXECUTION_CHECKLIST",
        applicationId: selectedApplicationId,
        options: { requestedBy: "options_diagnostics" }
      });
      executionChecklist = checklistResult.response || null;
      const evidenceResult = await runtimeMessage({
        type: "GET_SUBMISSION_EVIDENCE",
        applicationId: selectedApplicationId,
        options: { limit: 10, requestedBy: "options_diagnostics" }
      });
      submissionEvidence = evidenceResult.response || null;
    } catch (error) {
      executionPackage = { ok: false, error: error.message || String(error), applicationId: selectedApplicationId };
      executionChecklist = { ok: false, error: error.message || String(error), applicationId: selectedApplicationId };
      submissionEvidence = { ok: false, error: error.message || String(error), applicationId: selectedApplicationId };
    }
  }
  return {
    messages: messageResult.response || {},
    conversations: conversationResult.response || {},
    tasks: taskResult.diagnostics || {},
    submissionReadinessQueue: readinessResult.response || {},
    executionPackage,
    executionChecklist,
    submissionEvidence
  };
}

async function prepareGreetingDryRun(applicationId = null) {
  try {
    ui.prepareGreetingDryRun.disabled = true;
    ui.greetingStatus.textContent = "正在生成打招呼 dry-run";
    const targetApplicationId = Number(applicationId || 0);
    if (targetApplicationId) {
      const existingDraft = getGreetingMessageForApplication(targetApplicationId)
        || await refreshGreetingDraftForApplication(targetApplicationId);
      if (existingDraft) {
        const application = state.applications.find((item) => Number(item.id) === targetApplicationId);
        if (application) {
          openRealGreetingDialog(application);
          setStatus(`已找到当前岗位的打招呼草稿 #${existingDraft.id}`);
          return;
        }
      }
    }
    const resumeDiagnostics = await loadResumeDiagnostics();
    const versions = Array.isArray(resumeDiagnostics.versions?.resumeVersions) ? resumeDiagnostics.versions.resumeVersions : [];
    const scopedVersions = targetApplicationId
      ? versions.filter((item) => Number(item.applicationId) === targetApplicationId)
      : versions;
    const version = scopedVersions.find((item) => item.status === "APPROVED" && item.metadata?.localApproval?.approved)
      || scopedVersions.find((item) => item.status === "APPROVED");
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

function normalizeAgentExecutionMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return new Set(["hybrid", "auto", "llm", "rules"]).has(mode) ? mode : "hybrid";
}

function getSelectedAgentExecutionMode() {
  return normalizeAgentExecutionMode(fields.agentExecutionMode?.value || "hybrid");
}

async function saveAgentExecutionMode() {
  try {
    const savedSettings = await runtimeMessage({
      type: "SAVE_SETTINGS",
      settings: readSettings()
    });
    renderSettings(savedSettings);
    setStatus(`Agent 模式已保存：${formatAgentExecutionMode(getSelectedAgentExecutionMode())}`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

async function saveResumeOutputDirectory() {
  try {
    const savedSettings = await runtimeMessage({
      type: "SAVE_SETTINGS",
      settings: readSettings()
    });
    renderSettings(savedSettings);
    setStatus(savedSettings.resumeOutputDir
      ? `DOCX 保存目录已更新：${savedSettings.resumeOutputDir}`
      : "DOCX 将保存到后端默认目录");
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

async function refreshBackendModelConfig(options = {}) {
  try {
    const result = await runtimeMessage({ type: "GET_MODEL_CONFIG" });
    renderBackendModelConfig(result.response || {});
    return result.response || {};
  } catch (error) {
    state.modelConfig = null;
    ui.modelConfigBadge.textContent = "不可用";
    ui.modelConfigBadge.dataset.tone = "attention";
    ui.modelConfigStatus.textContent = error.message || String(error);
    ui.modelConfigStatus.classList.add("error");
    if (!options.silent) {
      setStatus(error.message || String(error), true);
    }
    return null;
  }
}

function renderBackendModelConfig(payload = {}) {
  const config = payload.config || {};
  state.modelConfig = config;
  ui.modelBaseUrl.value = config.baseUrl || "https://api.openai.com/v1";
  ui.modelName.value = config.model || "";
  ui.modelWireApi.value = config.wireApi === "chat" ? "chat" : "responses";
  ui.modelApiKey.value = "";
  ui.modelApiKey.placeholder = config.hasApiKey
    ? "已配置，留空表示保留"
    : "输入模型服务 API Key";
  ui.modelReasoningEffort.value = config.reasoningEffort || "";
  ui.modelTimeoutMs.value = Number(config.timeoutMs || 45000);
  ui.modelMaxRetries.value = Number(config.maxRetries ?? 1);
  ui.modelConfigBadge.textContent = config.configured ? "已配置" : "待配置";
  ui.modelConfigBadge.dataset.tone = config.configured ? "complete" : "attention";
  ui.modelConfigStatus.classList.remove("error");
  ui.modelConfigStatus.textContent = config.configured
    ? `${config.model} · ${config.wireApi === "chat" ? "Chat Completions" : "Responses API"} · ${config.source || "local"}`
    : "请补全 Base URL、模型和 API Key；凭据只保存在后端本地文件。";
  ui.clearModelApiKey.disabled = !config.hasApiKey;
}

function readBackendModelConfigForm(options = {}) {
  return {
    baseUrl: ui.modelBaseUrl.value,
    model: ui.modelName.value,
    wireApi: ui.modelWireApi.value,
    apiKey: ui.modelApiKey.value,
    reasoningEffort: ui.modelReasoningEffort.value,
    timeoutMs: ui.modelTimeoutMs.value,
    maxRetries: ui.modelMaxRetries.value,
    clearApiKey: Boolean(options.clearApiKey)
  };
}

async function persistBackendModelConfig(options = {}) {
  const result = await runtimeMessage({
    type: "SAVE_MODEL_CONFIG",
    config: readBackendModelConfigForm(options)
  });
  renderBackendModelConfig(result.response || {});
  return result.response || {};
}

async function saveBackendModelConfig(event) {
  event?.preventDefault();
  try {
    ui.saveModelConfig.disabled = true;
    await persistBackendModelConfig();
    setStatus("模型服务配置已保存到后端本地文件");
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    ui.saveModelConfig.disabled = false;
  }
}

async function testBackendModelConfig() {
  try {
    ui.testModelConfig.disabled = true;
    ui.modelConfigStatus.textContent = "正在保存配置并测试模型连接";
    await persistBackendModelConfig();
    const result = await runtimeMessage({ type: "TEST_MODEL_CONFIG" });
    const response = result.response || {};
    renderBackendModelConfig(response);
    ui.modelConfigStatus.textContent = `连接成功 · ${response.telemetry?.durationMs || 0} ms · ${response.telemetry?.attemptCount || 1} 次请求`;
    setStatus("模型服务连接测试成功");
  } catch (error) {
    ui.modelConfigStatus.textContent = error.message || String(error);
    ui.modelConfigStatus.classList.add("error");
    setStatus(error.message || String(error), true);
  } finally {
    ui.testModelConfig.disabled = false;
  }
}

async function clearBackendModelApiKey() {
  if (!window.confirm("清除后端本地 API Key？后续模型 Agent 将不可用，直到重新配置。")) {
    return;
  }
  try {
    ui.clearModelApiKey.disabled = true;
    await persistBackendModelConfig({ clearApiKey: true });
    setStatus("后端本地 API Key 已清除");
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    ui.clearModelApiKey.disabled = !state.modelConfig?.hasApiKey;
  }
}

async function refreshAgentQualityDiagnostics(options = {}) {
  try {
    const result = await runtimeMessage({
      type: "GET_AGENT_QUALITY",
      options: { limit: 500 }
    });
    renderAgentQuality(result.response || {});
  } catch (error) {
    if (!options.silent) {
      setStatus(error.message || String(error), true);
    }
    if (ui.agentQualityStatus) {
      ui.agentQualityStatus.textContent = error.message || String(error);
      ui.agentQualityStatus.classList.add("error");
    }
  }
}

function renderAgentQuality(payload = {}) {
  state.agentQuality = payload;
  const totals = payload.totals || {};
  const latency = payload.latencyMs || {};
  const evaluations = Array.isArray(payload.evaluations) ? payload.evaluations : [];
  const latest = evaluations[0] || null;
  const latestMetrics = latest?.metrics && typeof latest.metrics === "object" ? latest.metrics : {};
  const gatePassed = latest && latest.status === "SUCCEEDED"
    && Object.values(latestMetrics).every((metric) => metric?.passed !== false);
  ui.agentQualityInvocations.textContent = Number(payload.invocationCount || 0).toLocaleString("zh-CN");
  ui.agentQualityTokens.textContent = Number(totals.totalTokens || 0).toLocaleString("zh-CN");
  ui.agentQualityLatency.textContent = latency.p95 ? `${Number(latency.p95)} ms` : "--";
  ui.agentQualityGate.textContent = latest ? (gatePassed ? "通过" : latest.status === "RUNNING" ? "运行中" : "未通过") : "未评测";
  ui.agentQualityStatus.textContent = [
    `模式 ${formatAgentExecutionMode(getSelectedAgentExecutionMode())}`,
    `回退 ${Number(totals.fallbackCount || 0)}`,
    `失败 ${Number(totals.failedCount || 0)}`,
    latest ? `评测 #${latest.id}` : "暂无评测"
  ].join(" · ");
  ui.agentQualityStatus.classList.toggle("error", Boolean(latest && latest.status === "FAILED"));
}

async function refreshAgentShadowDiagnostics(options = {}) {
  try {
    const listed = await runtimeMessage({
      type: "GET_AGENT_SHADOW_RUNS",
      options: { limit: 10 }
    });
    const latest = listed.response?.runs?.[0] || null;
    if (!latest) {
      renderAgentShadow(null);
      return;
    }
    const detail = await runtimeMessage({
      type: "GET_AGENT_SHADOW_RUN",
      runId: latest.id
    });
    renderAgentShadow(detail.response || null);
  } catch (error) {
    renderAgentShadow(null, error);
    if (!options.silent) {
      setStatus(error.message || String(error), true);
    }
  }
}

async function startAgentShadowRun() {
  ui.startAgentShadowRun.disabled = true;
  ui.agentShadowStatus.textContent = "正在创建 Shadow run";
  ui.agentShadowStatus.classList.remove("error", "warn");
  try {
    const mode = getSelectedAgentExecutionMode();
    const result = await runtimeMessage({
      type: "START_AGENT_SHADOW_RUN",
      options: {
        mode,
        limit: 20,
        topK: 5,
        samplesPerTopJob: 3,
        requestDelayMs: mode === "rules" ? 0 : 2500
      }
    });
    const runId = Number(result.response?.run?.id || 0);
    if (!runId) {
      throw new Error("Shadow run 未返回有效 ID");
    }
    const detail = await runtimeMessage({ type: "GET_AGENT_SHADOW_RUN", runId });
    renderAgentShadow(detail.response || null);
    setStatus(`Shadow run #${runId} 已进入队列`);
  } catch (error) {
    ui.startAgentShadowRun.disabled = false;
    ui.agentShadowStatus.textContent = error.message || String(error);
    ui.agentShadowStatus.classList.add("error");
    setStatus(error.message || String(error), true);
  }
}

async function saveAgentShadowReview(event) {
  event.preventDefault();
  const itemId = Number(ui.agentShadowReviewItem.value || 0);
  if (!itemId) {
    setStatus("请选择一个 Shadow 岗位", true);
    return;
  }
  ui.saveAgentShadowReview.disabled = true;
  try {
    const result = await runtimeMessage({
      type: "REVIEW_AGENT_SHADOW_ITEM",
      itemId,
      review: {
        label: ui.agentShadowReviewLabel.value,
        correctedRecommendation: ui.agentShadowCorrectedRecommendation.value,
        reviewer: "local-user",
        note: ui.agentShadowReviewNote.value.trim()
      }
    });
    ui.agentShadowReviewNote.value = "";
    await refreshAgentShadowDiagnostics({ silent: true });
    setStatus(`Shadow 评审 #${result.response?.review?.id || ""} 已保存`.trim());
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    ui.saveAgentShadowReview.disabled = !Number(ui.agentShadowReviewItem.value || 0);
  }
}

function renderAgentShadow(payload, error = null) {
  if (state.agentShadowPollTimer) {
    clearTimeout(state.agentShadowPollTimer);
    state.agentShadowPollTimer = null;
  }
  if (error) {
    state.agentShadowRun = null;
    ui.agentShadowRunBadge.textContent = "读取失败";
    ui.agentShadowProgress.textContent = "--";
    ui.agentShadowSamples.textContent = "--";
    ui.agentShadowTokens.textContent = "--";
    ui.agentShadowFailures.textContent = "--";
    ui.agentShadowStatus.textContent = error.message || String(error);
    ui.agentShadowStatus.classList.add("error");
    ui.agentShadowItems.textContent = "Shadow 数据不可用";
    populateAgentShadowReviewItems([]);
    ui.startAgentShadowRun.disabled = false;
    return;
  }
  const run = payload?.run || null;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  state.agentShadowRun = payload || null;
  if (!run) {
    ui.agentShadowRunBadge.textContent = "未运行";
    ui.agentShadowProgress.textContent = "0/0";
    ui.agentShadowSamples.textContent = "0";
    ui.agentShadowTokens.textContent = "0";
    ui.agentShadowFailures.textContent = "0";
    ui.agentShadowStatus.textContent = "尚无 Shadow run";
    ui.agentShadowStatus.classList.remove("error", "warn");
    ui.agentShadowItems.textContent = "暂无 Shadow 结果";
    populateAgentShadowReviewItems([]);
    ui.startAgentShadowRun.disabled = false;
    return;
  }

  const active = new Set(["QUEUED", "RUNNING"]).has(run.status);
  const telemetry = run.telemetry || {};
  const usage = telemetry.usage || {};
  ui.agentShadowRunBadge.textContent = formatAgentShadowStatus(run.status);
  ui.agentShadowProgress.textContent = `${Number(run.completedCount || 0)}/${Number(run.selectedCount || 0)}`;
  ui.agentShadowSamples.textContent = Number(run.sampleCount || 0).toLocaleString("zh-CN");
  ui.agentShadowTokens.textContent = Number(usage.totalTokens || 0).toLocaleString("zh-CN");
  ui.agentShadowFailures.textContent = Number(telemetry.failedSampleCount ?? run.failedCount ?? 0).toLocaleString("zh-CN");
  ui.agentShadowStatus.textContent = [
    `Run #${run.id}`,
    formatAgentExecutionMode(run.mode),
    `${Number(run.modelInvocationCount || 0)} 次模型调用`,
    run.errorCode || ""
  ].filter(Boolean).join(" · ");
  ui.agentShadowStatus.classList.toggle("error", run.status === "FAILED");
  ui.agentShadowStatus.classList.toggle("warn", run.status === "PARTIAL");
  ui.startAgentShadowRun.disabled = active;

  renderList(ui.agentShadowItems, items.slice(0, 20), (item) => ({
    title: `${item.rank ? `#${item.rank} ` : ""}${item.job?.title || "未命名岗位"} · ${item.job?.company || "未知公司"}`,
    meta: [
      item.averageMatchScore === null ? "无评分" : `均分 ${Number(item.averageMatchScore).toFixed(1)}`,
      item.screeningScoreStddev === null ? "" : `σ ${Number(item.screeningScoreStddev).toFixed(2)}`,
      `${item.successCount || 0}/${item.sampleCount || 0} 成功`,
      formatScreeningRecommendation(item.recommendation),
      item.latestReview ? formatAgentShadowReviewLabel(item.latestReview.label) : "待评审"
    ].filter(Boolean).join(" · ")
  }), active ? "正在等待首批结果" : "暂无可评审岗位");
  populateAgentShadowReviewItems(active ? [] : items.filter((item) => item.successCount > 0));
  if (active) {
    state.agentShadowPollTimer = setTimeout(() => {
      refreshAgentShadowDiagnostics({ silent: true });
    }, 1500);
  }
}

function populateAgentShadowReviewItems(items) {
  const selected = Number(ui.agentShadowReviewItem.value || 0);
  ui.agentShadowReviewItem.replaceChildren();
  for (const item of items) {
    const option = document.createElement("option");
    option.value = String(item.id);
    option.textContent = `${item.rank ? `#${item.rank} ` : ""}${item.job?.title || `岗位 ${item.applicationId}`}`;
    ui.agentShadowReviewItem.appendChild(option);
  }
  if (items.some((item) => item.id === selected)) {
    ui.agentShadowReviewItem.value = String(selected);
  }
  const disabled = items.length === 0;
  ui.agentShadowReviewItem.disabled = disabled;
  ui.saveAgentShadowReview.disabled = disabled;
}

function formatAgentShadowStatus(status) {
  return ({
    QUEUED: "排队中",
    RUNNING: "运行中",
    SUCCEEDED: "已完成",
    PARTIAL: "部分完成",
    FAILED: "失败"
  })[status] || status || "未知";
}

function formatAgentShadowReviewLabel(label) {
  return ({
    CORRECT: "判断正确",
    FALSE_POSITIVE: "误筛",
    FALSE_NEGATIVE: "漏筛",
    BAD_REASON: "理由错误",
    RISK_MISSED: "遗漏风险"
  })[label] || label || "待评审";
}

function formatScreeningRecommendation(value) {
  return ({
    auto_prepare: "可准备简历",
    review_needed: "需复核",
    skip: "跳过"
  })[value] || value || "无推荐";
}

function formatAgentExecutionMode(mode) {
  return ({
    hybrid: "混合",
    auto: "自动降级",
    llm: "严格模型",
    rules: "仅规则"
  })[normalizeAgentExecutionMode(mode)] || "混合";
}

async function refreshRealActionDiagnostics(options = {}) {
  try {
    if (!options.silent) {
      ui.realGreetingStatus.textContent = "正在读取真实动作策略";
    }
    const applicationId = getSelectedRealActionApplicationId();
    const [policyResult, authorizationsResult] = await Promise.all([
      runtimeMessage({
        type: "GET_REAL_ACTION_POLICY",
        options: { actionType: "SEND_GREETING_REAL" }
      }),
      runtimeMessage({
        type: "GET_REAL_ACTION_AUTHORIZATIONS",
        options: {
          actionType: "SEND_GREETING_REAL",
          applicationId: applicationId || null,
          limit: 10
        }
      })
    ]);
    const policyResponse = policyResult.response || {};
    const policy = policyResponse.policy || {};
    const authorizations = Array.isArray(authorizationsResult.response?.authorizations)
      ? authorizationsResult.response.authorizations
      : [];
    const active = policyResponse.activeAuthorization
      || authorizations.find((item) => ["ARMED", "QUEUED"].includes(item.status))
      || authorizations[0]
      || null;
    const previousId = Number(state.realActionAuthorization?.id || 0);
    if (previousId && active?.id && previousId !== Number(active.id)) {
      state.realActionAuthorizationToken = "";
    }
    state.realActionPolicy = policy;
    state.realActionAuthorization = active;
    renderRealActionDiagnostics(policy, active, applicationId);
    return { policy, authorization: active, authorizations };
  } catch (error) {
    renderRealActionDiagnostics(null, null, getSelectedRealActionApplicationId(), error);
    if (!options.silent) {
      setStatus(error.message || String(error), true);
    }
    return null;
  }
}

function renderRealActionDiagnostics(policy, authorization, applicationId, error = null) {
  ui.realGreetingDetail.replaceChildren();
  if (error) {
    ui.realGreetingStatus.textContent = error.message || "真实动作策略不可用";
    ui.realGreetingStatus.classList.add("warn");
    ui.realGreetingDetail.textContent = error.message || String(error);
    ui.realGreetingDetail.classList.add("warn");
    ui.realGreetingEnabled.checked = false;
    ui.armRealGreeting.disabled = true;
    ui.runRealGreetingOnce.disabled = true;
    ui.revokeRealGreeting.disabled = true;
    return;
  }
  const enabled = policy?.enabled === true;
  ui.realGreetingEnabled.checked = enabled;
  ui.realGreetingStatus.classList.toggle("warn", !enabled || authorization?.status === "UNCERTAIN");
  ui.realGreetingDetail.classList.toggle("warn", authorization?.status === "UNCERTAIN");
  ui.realGreetingStatus.textContent = enabled
    ? `已启用至 ${formatTime(policy.enabledUntil)}`
    : "策略默认关闭";
  appendKeyValue(ui.realGreetingDetail, "选中 application", applicationId ? `#${applicationId}` : "未选择");
  appendKeyValue(ui.realGreetingDetail, "今日额度", `${Number(policy?.usedToday || 0)}/${Number(policy?.dailyLimit || 1)}`);
  appendKeyValue(ui.realGreetingDetail, "冷却", `${Number(policy?.cooldownSeconds || 300)} 秒`);
  if (authorization) {
    appendKeyValue(ui.realGreetingDetail, "授权", `#${authorization.id} · ${authorization.status}`);
    appendKeyValue(ui.realGreetingDetail, "岗位", authorization.targetJobId || authorization.targetDetailUrl || "未知");
    appendKeyValue(ui.realGreetingDetail, "消息", `#${authorization.messageId} · ${shortHash(authorization.messageHash)}`);
    appendKeyValue(ui.realGreetingDetail, "失效时间", formatTime(authorization.expiresAt));
    appendKeyValue(ui.realGreetingDetail, "浏览器任务", authorization.browserTaskId ? `#${authorization.browserTaskId}` : "尚未入队");
    if (authorization.errorCode) {
      appendKeyValue(ui.realGreetingDetail, "最近错误", authorization.errorCode);
    }
  } else {
    appendKeyValue(ui.realGreetingDetail, "授权", "尚无真实动作授权");
  }
  const canArm = enabled
    && applicationId > 0
    && Number(policy?.remainingToday || 0) > 0
    && !["ARMED", "QUEUED"].includes(authorization?.status);
  const canQueueArmed = authorization?.status === "ARMED" && Boolean(state.realActionAuthorizationToken);
  const canRunQueued = authorization?.status === "QUEUED" && Number(authorization.browserTaskId || 0) > 0;
  ui.armRealGreeting.disabled = !canArm;
  ui.runRealGreetingOnce.disabled = !(canQueueArmed || canRunQueued);
  ui.revokeRealGreeting.disabled = !["ARMED", "QUEUED"].includes(authorization?.status);
  ui.runRealGreetingOnce.textContent = canRunQueued ? "执行已入队任务" : "发送一次";
}

async function updateRealGreetingPolicyFromToggle() {
  const enabled = ui.realGreetingEnabled.checked;
  const rationale = cleanUiText(ui.realGreetingRationale.value);
  if (!rationale) {
    ui.realGreetingEnabled.checked = !enabled;
    setStatus("启用或关闭真实动作前必须填写本次操作原因", true);
    return;
  }
  try {
    ui.realGreetingEnabled.disabled = true;
    await runtimeMessage({
      type: "UPDATE_REAL_ACTION_POLICY",
      options: {
        enabled,
        durationMinutes: 15,
        actor: "user",
        rationale
      }
    });
    if (!enabled) {
      state.realActionAuthorizationToken = "";
    }
    await refreshRealActionDiagnostics({ silent: true });
    await refreshWorkflowDiagnostics({ silent: true }).catch(() => {});
    setStatus(enabled ? "真实打招呼策略已短时启用" : "真实打招呼策略已关闭");
  } catch (error) {
    ui.realGreetingEnabled.checked = !enabled;
    setStatus(`${error.code || "REAL_ACTION_POLICY_UPDATE_FAILED"}: ${error.message || String(error)}`, true);
  } finally {
    ui.realGreetingEnabled.disabled = false;
  }
}

async function armRealGreetingForSelectedApplication() {
  const applicationId = getSelectedRealActionApplicationId();
  const rationale = cleanUiText(ui.realGreetingRationale.value);
  if (!applicationId) {
    setStatus("请先在简历详情或执行包中选中一个 application", true);
    return;
  }
  if (!rationale) {
    setStatus("授权真实打招呼前必须填写本次操作原因", true);
    return;
  }
  try {
    ui.armRealGreeting.disabled = true;
    ui.realGreetingStatus.textContent = `正在为 application #${applicationId} 创建一次性授权`;
    const result = await runtimeMessage({
      type: "ARM_REAL_ACTION_AUTHORIZATION",
      options: {
        applicationId,
        durationMinutes: 5,
        actor: "user",
        rationale
      }
    });
    const response = result.response || {};
    state.realActionAuthorization = response.authorization || null;
    state.realActionAuthorizationToken = response.authorizationToken || "";
    await refreshRealActionDiagnostics({ silent: true });
    setStatus(`真实打招呼授权 #${response.authorization?.id || ""} 已创建，令牌只保留在当前页面内存中`);
  } catch (error) {
    state.realActionAuthorizationToken = "";
    await refreshRealActionDiagnostics({ silent: true });
    setStatus(`${error.code || "REAL_ACTION_ARM_FAILED"}: ${error.message || String(error)}`, true);
  } finally {
    ui.armRealGreeting.disabled = false;
  }
}

async function runAuthorizedRealGreetingOnce() {
  let authorization = state.realActionAuthorization;
  if (!authorization?.id || !["ARMED", "QUEUED"].includes(authorization.status)) {
    setStatus("没有可执行的一次性真实打招呼授权", true);
    return;
  }
  try {
    ui.runRealGreetingOnce.disabled = true;
    const tab = await getBossExecutionTab();
    await rememberBossPage(tab);
    let taskId = Number(authorization.browserTaskId || 0);
    if (authorization.status === "ARMED") {
      if (!state.realActionAuthorizationToken) {
        throw new Error("一次性授权令牌已离开当前页面内存，请撤销后重新授权");
      }
      const queued = await runtimeMessage({
        type: "QUEUE_REAL_ACTION_AUTHORIZATION",
        authorizationId: authorization.id,
        options: {
          authorizationToken: state.realActionAuthorizationToken
        }
      });
      state.realActionAuthorizationToken = "";
      authorization = queued.response?.authorization || authorization;
      state.realActionAuthorization = authorization;
      taskId = Number(queued.response?.browserTask?.id || authorization.browserTaskId || 0);
    }
    if (!taskId) {
      throw new Error("真实打招呼授权没有关联浏览器任务");
    }
    await runBossTaskFromQueue({
      button: ui.runRealGreetingOnce,
      taskId,
      taskTypes: ["SEND_GREETING_REAL"],
      statusText: "正在执行单岗位真实打招呼",
      emptyMessage: "指定的真实打招呼任务无法领取，可能已失效或被策略关闭。",
      failureCode: "SEND_GREETING_REAL_FAILED",
      successMessage: (task) => `真实打招呼已由 DOM 回读确认：任务 #${task.id}`,
      failureMessage: (_task, result) => result?.realAction?.clickedSend
        ? `发送结果不确定，已进入人工复核：${result?.errorCode || "REAL_ACTION_OUTCOME_UNCERTAIN"}`
        : `真实打招呼在点击前停止：${result?.errorCode || result?.message || "unknown"}`
    });
  } catch (error) {
    setStatus(`${error.code || "SEND_GREETING_REAL_FAILED"}: ${error.message || String(error)}`, true);
  } finally {
    await refreshRealActionDiagnostics({ silent: true });
    await refreshGreetingDiagnostics({ silent: true }).catch(() => {});
    await refreshWorkflowDiagnostics({ silent: true }).catch(() => {});
  }
}

async function revokeActiveRealGreetingAuthorization() {
  const authorization = state.realActionAuthorization;
  const rationale = cleanUiText(ui.realGreetingRationale.value);
  if (!authorization?.id || !["ARMED", "QUEUED"].includes(authorization.status)) {
    setStatus("没有可撤销的真实动作授权", true);
    return;
  }
  if (!rationale) {
    setStatus("撤销授权前必须填写本次操作原因", true);
    return;
  }
  try {
    ui.revokeRealGreeting.disabled = true;
    await runtimeMessage({
      type: "REVOKE_REAL_ACTION_AUTHORIZATION",
      authorizationId: authorization.id,
      options: { actor: "user", rationale }
    });
    state.realActionAuthorizationToken = "";
    await refreshRealActionDiagnostics({ silent: true });
    setStatus(`真实动作授权 #${authorization.id} 已撤销`);
  } catch (error) {
    setStatus(`${error.code || "REAL_ACTION_REVOKE_FAILED"}: ${error.message || String(error)}`, true);
  } finally {
    ui.revokeRealGreeting.disabled = false;
  }
}

function getSelectedRealActionApplicationId() {
  const selected = Number(
    state.selectedApplicationId
    || state.selectedExecutionPackageApplicationId
    || state.selectedResumeVersion?.applicationId
    || 0
  );
  return Number.isInteger(selected) && selected > 0 ? selected : 0;
}

function cleanUiText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function shortHash(value) {
  const text = String(value || "");
  return text.length > 12 ? `${text.slice(0, 8)}...${text.slice(-4)}` : text || "missing";
}

async function prepareExecutionPackageForSelectedApplication(applicationId = null) {
  const targetApplicationId = Number(applicationId || getSelectedExecutionPackageApplicationId());
  try {
    if (!Number.isInteger(targetApplicationId) || targetApplicationId <= 0) {
      throw new Error("Select an application or approved resume before preparing the execution package.");
    }
    ui.prepareExecutionPackage.disabled = true;
    ui.greetingStatus.textContent = "Preparing local execution package";
    const result = await runtimeMessage({
      type: "PREPARE_EXECUTION_PACKAGE",
      applicationId: targetApplicationId,
      options: {
        requestedBy: "options_execution_package",
        noRealBossAction: true
      }
    });
    state.selectedExecutionPackageApplicationId = targetApplicationId;
    state.selectedExecutionPackage = result.response?.executionPackage || null;
    renderExecutionPackageDetail(result.response);
    await refreshRealActionDiagnostics({ silent: true });
    await refreshGreetingDiagnostics({ silent: true });
    await refreshWorkflowDiagnostics({ silent: true }).catch(() => {});
    const executionPackage = result.response?.executionPackage || {};
    setStatus(executionPackage.ready
      ? `Execution package ready for application #${targetApplicationId}`
      : `Execution package has ${executionPackage.blockers?.length || 0} blocker(s)`);
  } catch (error) {
    renderExecutionPackageDetail({ ok: false, error: error.message || String(error), applicationId: targetApplicationId || null });
    setStatus(error.message || String(error), true);
  } finally {
    ui.prepareExecutionPackage.disabled = false;
  }
}

function getSelectedExecutionPackageApplicationId() {
  const selected = Number(state.selectedExecutionPackageApplicationId || state.selectedResumeVersion?.applicationId || 0);
  if (Number.isInteger(selected) && selected > 0) {
    return selected;
  }
  const readinessItems = Array.isArray(state.submissionReadinessItems) ? state.submissionReadinessItems : [];
  const approved = readinessItems.find((item) => item.submissionReadinessReview?.decision === "APPROVED_FOR_MANUAL_EXECUTION");
  const ready = approved || readinessItems.find((item) => item.submissionReadiness?.status === "READY_FOR_MANUAL_REVIEW");
  return Number(ready?.applicationId || 0);
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
        taskId: options.taskId || null,
        sourceUrl: options.taskId ? "" : tab.url || ""
      }
    });
    const task = claim?.response?.task;
    if (!claim?.response?.claimed || !task) {
      throw new Error(claim?.response?.message || options.emptyMessage || "No queued browser task matches the active BOSS page.");
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
        claimToken: task.claimToken || "",
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
        claimToken: task.claimToken || "",
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
    state.browserTaskCounts = {};
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
  state.browserTaskCounts = counts;
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
    state.greetingMessages = [];
    state.conversations = [];
    ui.greetingStatus.textContent = error.message || "打招呼草稿不可用";
    ui.greetingStatus.classList.add("warn");
    ui.greetingMessages.textContent = "";
    ui.greetingTasks.textContent = "";
    return;
  }

  ui.greetingStatus.classList.remove("warn");
  const messages = Array.isArray(diagnostics?.messages?.messages) ? diagnostics.messages.messages.slice(0, 8) : [];
  const conversations = Array.isArray(diagnostics?.conversations?.conversations) ? diagnostics.conversations.conversations.slice(0, 8) : [];
  state.greetingMessages = Array.isArray(diagnostics?.messages?.messages) ? diagnostics.messages.messages : [];
  state.conversations = Array.isArray(diagnostics?.conversations?.conversations) ? diagnostics.conversations.conversations : [];
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
    state.submissionReadinessItems = readinessItems;
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
  renderExecutionPackageDetail(diagnostics?.executionPackage || null);
  renderExecutionChecklistDetail(diagnostics?.executionChecklist || null);
  renderSubmissionEvidenceDetail(diagnostics?.submissionEvidence || null);
  renderWorkbench();
}

function renderExecutionPackageDetail(result = null) {
  if (!ui.executionPackageDetail) {
    return;
  }
  ui.executionPackageDetail.replaceChildren();
  const executionPackage = result?.executionPackage || result?.response?.executionPackage || state.selectedExecutionPackage || null;
  if (result?.error) {
    ui.executionPackageDetail.textContent = result.error;
    ui.executionPackageDetail.classList.add("warn");
    renderExecutionPackageReviewActions(null);
    return;
  }
  if (!executionPackage) {
    ui.executionPackageDetail.textContent = "No execution package prepared";
    ui.executionPackageDetail.classList.remove("warn");
    renderExecutionPackageReviewActions(null);
    return;
  }
  state.selectedExecutionPackage = executionPackage;
  state.selectedExecutionPackageApplicationId = executionPackage.applicationId || state.selectedExecutionPackageApplicationId;
  const validation = executionPackage.validation || {};
  const validationFailures = Array.isArray(validation.blockingFailures) ? validation.blockingFailures : [];
  const validationWarnings = Array.isArray(validation.warnings) ? validation.warnings : [];
  ui.executionPackageDetail.classList.toggle("warn", executionPackage.ready === false || validation.ok === false);
  appendKeyValue(ui.executionPackageDetail, "Status", executionPackage.ready ? "Ready" : "Blocked");
  appendKeyValue(ui.executionPackageDetail, "Validation", validation.ok === false ? `Failed (${validationFailures.length})` : "Passed/Not archived");
  appendKeyValue(ui.executionPackageDetail, "Application", `#${executionPackage.applicationId || ""} ${executionPackage.application?.title || ""} @ ${executionPackage.application?.company || ""}`.trim());
  appendKeyValue(ui.executionPackageDetail, "DOCX", shortPath(executionPackage.resume?.filePath || ""));
  appendKeyValue(ui.executionPackageDetail, "DOCX QA", executionPackage.resume?.renderQuality?.ok === false ? "Failed" : "Passed/Not recorded");
  appendKeyValue(ui.executionPackageDetail, "Greeting", executionPackage.greeting?.messageId ? `Message #${executionPackage.greeting.messageId}` : "Missing");
  appendKeyValue(ui.executionPackageDetail, "Readiness", formatSubmissionReadiness(executionPackage.submissionReadiness?.status) || executionPackage.submissionReadiness?.status || "Missing");
  appendKeyValue(ui.executionPackageDetail, "Review", formatSubmissionReadinessReview(executionPackage.submissionReadinessReview?.decision) || executionPackage.submissionReadinessReview?.decision || "Missing");
  if (executionPackage.archive?.jsonPath || executionPackage.archive?.markdownPath) {
    appendKeyValue(ui.executionPackageDetail, "Archive JSON", shortPath(executionPackage.archive.jsonPath || ""));
    appendKeyValue(ui.executionPackageDetail, "Archive MD", shortPath(executionPackage.archive.markdownPath || ""));
  }
  appendPillGroup(ui.executionPackageDetail, "Blocked real actions", executionPackage.realActionsBlocked || []);
  if (validationFailures.length) {
    renderTextList(ui.executionPackageDetail, validationFailures.map((failure) => `${failure.code}: ${failure.message}`), "No validation failures", { append: true });
  }
  if (validationWarnings.length) {
    renderTextList(ui.executionPackageDetail, validationWarnings.map((warning) => `${warning.code}: ${warning.message}`), "No validation warnings", { append: true });
  }
  const blockers = Array.isArray(executionPackage.blockers) ? executionPackage.blockers : [];
  if (blockers.length) {
    renderTextList(ui.executionPackageDetail, blockers.map((blocker) => `${blocker.code}: ${blocker.message}`), "No blockers", { append: true });
  }
  const steps = Array.isArray(executionPackage.manualSteps) ? executionPackage.manualSteps.slice(0, 6) : [];
  if (steps.length) {
    renderTextList(ui.executionPackageDetail, steps.map((step) => `${step.order}. ${step.title}${step.detail ? ` - ${step.detail}` : ""}`), "No manual steps", { append: true });
  }
  renderExecutionPackageReviewActions(executionPackage);
}

function renderExecutionPackageReviewActions(executionPackage) {
  if (!ui.executionPackageReviewActions) {
    return;
  }
  ui.executionPackageReviewActions.replaceChildren();
  if (!executionPackage?.applicationId) {
    ui.executionPackageReviewActions.hidden = true;
    ui.executionPackageReviewActions.classList.add("hidden");
    return;
  }
  ui.executionPackageReviewActions.hidden = false;
  ui.executionPackageReviewActions.classList.remove("hidden");
  const actions = [
    ["APPROVED_FOR_MANUAL_EXECUTION", "Approve package", "primary"],
    ["REFRESH_REQUIRED", "Refresh required", "secondary"],
    ["BLOCKED", "Block package", "secondary"]
  ];
  for (const [decision, label, className] of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", () => reviewExecutionPackage(executionPackage.applicationId, decision));
    ui.executionPackageReviewActions.appendChild(button);
  }
}

async function reviewExecutionPackage(applicationId, decision) {
  try {
    const targetApplicationId = Number(applicationId);
    if (!Number.isInteger(targetApplicationId) || targetApplicationId <= 0) {
      throw new Error("Select an execution package before review.");
    }
    setExecutionPackageReviewButtonsDisabled(true);
    setStatus(`Reviewing execution package: ${formatExecutionPackageReview(decision)}`);
    const result = await runtimeMessage({
      type: "REVIEW_EXECUTION_PACKAGE",
      applicationId: targetApplicationId,
      options: {
        decision,
        reviewer: "user",
        note: "options_execution_package_review",
        requireArchive: true,
        noRealBossAction: true
      }
    });
    state.selectedExecutionPackageApplicationId = targetApplicationId;
    state.selectedExecutionPackage = result.response?.executionPackage || state.selectedExecutionPackage;
    renderExecutionPackageDetail(result.response);
    await refreshWorkflowDiagnostics({ silent: true }).catch(() => {});
    await refreshGreetingDiagnostics({ silent: true }).catch(() => {});
    const review = result.response?.review || {};
    setStatus(review.accepted
      ? `Execution package review recorded: ${formatExecutionPackageReview(decision)}`
      : `Execution package review blocked: ${(review.validationFailureCodes || []).concat(review.blockerCodes || []).join(", ") || decision}`, !review.accepted);
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    setExecutionPackageReviewButtonsDisabled(false);
  }
}

function setExecutionPackageReviewButtonsDisabled(disabled) {
  if (!ui.executionPackageReviewActions) {
    return;
  }
  for (const button of ui.executionPackageReviewActions.querySelectorAll("button")) {
    button.disabled = Boolean(disabled);
  }
}

function formatExecutionPackageReview(decision) {
  const value = String(decision || "").toUpperCase();
  if (value === "APPROVED_FOR_MANUAL_EXECUTION") {
    return "Approved for manual execution";
  }
  if (value === "REFRESH_REQUIRED") {
    return "Refresh required";
  }
  if (value === "BLOCKED") {
    return "Blocked";
  }
  return value || "Unknown";
}

function renderExecutionChecklistDetail(result = null) {
  if (!ui.executionChecklistDetail) {
    return;
  }
  ui.executionChecklistDetail.replaceChildren();
  const checklist = result?.checklist || result?.response?.checklist || null;
  if (result?.error) {
    ui.executionChecklistDetail.textContent = result.error;
    ui.executionChecklistDetail.classList.add("warn");
    return;
  }
  if (!checklist) {
    ui.executionChecklistDetail.textContent = "No execution checklist loaded";
    ui.executionChecklistDetail.classList.remove("warn");
    return;
  }
  const blockedReasons = Array.isArray(checklist.blockedReasons) ? checklist.blockedReasons : [];
  ui.executionChecklistDetail.classList.toggle("warn", checklist.canRecordManualProgress === false);
  appendKeyValue(ui.executionChecklistDetail, "Checklist", `${checklist.status || "UNKNOWN"} ${checklist.progress?.completed || 0}/${checklist.progress?.total || 0}`);
  appendKeyValue(ui.executionChecklistDetail, "Package review", checklist.packageReview?.decision || "Missing");
  appendKeyValue(ui.executionChecklistDetail, "Boundary", "Records local manual progress only");
  if (blockedReasons.length) {
    appendPillGroup(ui.executionChecklistDetail, "Blocked reasons", blockedReasons);
  }
  const steps = Array.isArray(checklist.steps) ? checklist.steps : [];
  if (!steps.length) {
    renderTextList(ui.executionChecklistDetail, [], "No checklist steps", { append: true });
    return;
  }
  for (const step of steps) {
    ui.executionChecklistDetail.appendChild(renderExecutionChecklistStep(checklist, step));
  }
}

function renderExecutionChecklistStep(checklist, step) {
  const item = document.createElement("div");
  item.className = "checklist-step";
  const title = document.createElement("div");
  title.className = "list-title";
  title.textContent = `${step.order || ""}. ${step.title || step.action || "Step"}`.trim();
  const meta = document.createElement("div");
  meta.className = "list-meta";
  meta.textContent = [
    step.action || "",
    step.record?.decision ? `recorded: ${step.record.decision}` : "not recorded",
    step.record?.recordedAt ? formatTime(step.record.recordedAt) : "",
    step.detail || ""
  ].filter(Boolean).join(" · ");
  const actions = document.createElement("div");
  actions.className = "button-row compact checklist-actions";
  const decisions = [
    ["DONE", "Done", "primary"],
    ["FAILED", "Failed", "secondary"],
    ["BLOCKED", "Block", "secondary"],
    ["NEEDS_REFRESH", "Refresh", "secondary"]
  ];
  for (const [decision, label, className] of decisions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.disabled = !checklist.canRecordManualProgress;
    button.addEventListener("click", () => recordExecutionChecklistStep(checklist.applicationId, step.action, decision));
    actions.appendChild(button);
  }
  item.append(title, meta, actions);
  return item;
}

async function recordExecutionChecklistStep(applicationId, stepAction, decision) {
  try {
    const targetApplicationId = Number(applicationId);
    if (!Number.isInteger(targetApplicationId) || targetApplicationId <= 0 || !stepAction) {
      throw new Error("Select a valid execution checklist step first.");
    }
    setStatus(`Recording checklist step: ${stepAction} ${decision}`);
    const result = await runtimeMessage({
      type: "RECORD_EXECUTION_CHECKLIST_STEP",
      applicationId: targetApplicationId,
      options: {
        stepAction,
        decision,
        reviewer: "user",
        note: "options_execution_checklist",
        noRealBossAction: true
      }
    });
    renderExecutionChecklistDetail(result.response);
    await refreshWorkflowDiagnostics({ silent: true }).catch(() => {});
    await refreshGreetingDiagnostics({ silent: true }).catch(() => {});
    const record = result.response?.record || {};
    setStatus(result.response?.ok
      ? `Checklist step recorded: ${record.stepAction || stepAction} ${record.decision || decision}`
      : `Checklist step blocked: ${record.stepAction || stepAction}`, !result.response?.ok);
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

function renderSubmissionEvidenceDetail(result = null) {
  if (!ui.submissionEvidenceDetail) {
    return;
  }
  ui.submissionEvidenceDetail.replaceChildren();
  const latestPageResult = result?.latestPageResult || state.latestSubmissionPageResult || null;
  const latestEvidence = result?.latestEvidence
    || (Array.isArray(result?.evidence) ? result.evidence[0] : null)
    || result?.workflowEvent
    || null;
  const metadata = latestEvidence?.metadata || {};
  const evidence = result?.evidence && !Array.isArray(result.evidence)
    ? result.evidence
    : metadata.evidence || result?.evidenceRecord || null;
  const assessment = result?.assessment || metadata.assessment || null;
  if (result?.error) {
    ui.submissionEvidenceDetail.textContent = result.error;
    ui.submissionEvidenceDetail.classList.add("warn");
    return;
  }
  if (!latestEvidence && !latestPageResult && !evidence && !assessment) {
    ui.submissionEvidenceDetail.textContent = "No submission evidence recorded";
    ui.submissionEvidenceDetail.classList.remove("warn");
    return;
  }
  const status = assessment?.resultStatus || evidence?.pageResult?.resultStatus || latestPageResult?.resultStatus || latestEvidence?.status || "UNKNOWN";
  const blockers = Array.isArray(assessment?.blockers) && assessment.blockers.length
    ? assessment.blockers
    : Array.isArray(evidence?.pageResult?.blockers) && evidence.pageResult.blockers.length
      ? evidence.pageResult.blockers
      : latestPageResult?.blockers || [];
  const signals = Array.isArray(evidence?.pageResult?.signals) && evidence.pageResult.signals.length
    ? evidence.pageResult.signals
    : latestPageResult?.signals || [];
  ui.submissionEvidenceDetail.classList.toggle("warn", status === "BLOCKED_BY_BOSS" || status === "NEEDS_USER_ACTION" || status === "UNKNOWN");
  appendKeyValue(ui.submissionEvidenceDetail, "Status", formatSubmissionEvidenceStatus(status));
  appendKeyValue(ui.submissionEvidenceDetail, "Confidence", formatDecimal(assessment?.confidence ?? evidence?.pageResult?.confidence ?? latestPageResult?.confidence));
  appendKeyValue(ui.submissionEvidenceDetail, "Application", `#${result?.applicationId || latestEvidence?.applicationId || evidence?.pageResult?.context?.applicationId || latestPageResult?.context?.applicationId || ""}`.trim());
  appendKeyValue(ui.submissionEvidenceDetail, "Source", evidence?.source || latestPageResult?.source || "workflow event");
  appendKeyValue(ui.submissionEvidenceDetail, "Recorded", latestEvidence?.createdAt ? formatTime(latestEvidence.createdAt) : (latestPageResult ? "Pending local read" : ""));
  appendKeyValue(ui.submissionEvidenceDetail, "Boundary", "Read-only evidence; no BOSS click/upload/submit");
  if (signals.length) {
    appendPillGroup(ui.submissionEvidenceDetail, "Signals", signals);
  }
  if (blockers.length) {
    appendPillGroup(ui.submissionEvidenceDetail, "Blockers", blockers);
  }
  const sample = evidence?.pageResult?.pageTextSample || latestPageResult?.pageTextSample || evidence?.manualEvidence?.text || evidence?.notes || "";
  if (sample) {
    renderTextList(ui.submissionEvidenceDetail, [sample.slice(0, 360)], "No page sample", { append: true });
  }
}

async function readSubmissionPageResult(options = {}) {
  const applicationId = Number(getSelectedExecutionPackageApplicationId());
  try {
    if (!Number.isInteger(applicationId) || applicationId <= 0) {
      throw new Error("Select an application or approved execution package before reading submission evidence.");
    }
    if (ui.readSubmissionPageResult) {
      ui.readSubmissionPageResult.disabled = true;
    }
    if (!options.silent) {
      setStatus("Reading current BOSS page result");
    }
    const tab = await getBossExecutionTab();
    await rememberBossPage(tab);
    const pageContext = await getBossPageTaskContext(tab);
    const pageResult = await tabMessage(tab.id, {
      type: "READ_SUBMISSION_PAGE_RESULT",
      context: {
        ...pageContext,
        applicationId
      }
    });
    state.selectedExecutionPackageApplicationId = applicationId;
    state.latestSubmissionPageResult = pageResult;
    renderSubmissionEvidenceDetail({
      ok: true,
      applicationId,
      latestPageResult: pageResult
    });
    if (!options.silent) {
      setStatus(`BOSS page result read: ${formatSubmissionEvidenceStatus(pageResult.resultStatus)}`);
    }
    return pageResult;
  } catch (error) {
    renderSubmissionEvidenceDetail({ ok: false, error: error.message || String(error), applicationId });
    setStatus(error.message || String(error), true);
    throw error;
  } finally {
    if (ui.readSubmissionPageResult) {
      ui.readSubmissionPageResult.disabled = false;
    }
  }
}

async function recordSubmissionPageResult() {
  const applicationId = Number(getSelectedExecutionPackageApplicationId());
  try {
    if (!Number.isInteger(applicationId) || applicationId <= 0) {
      throw new Error("Select an application or approved execution package before recording submission evidence.");
    }
    if (ui.recordSubmissionPageResult) {
      ui.recordSubmissionPageResult.disabled = true;
    }
    setStatus("Recording submission evidence");
    let pageResult = state.latestSubmissionPageResult;
    const pageResultApplicationId = Number(pageResult?.context?.applicationId || 0);
    if (!pageResult || pageResultApplicationId !== applicationId) {
      pageResult = await readSubmissionPageResult({ silent: true });
    }
    const result = await runtimeMessage({
      type: "RECORD_SUBMISSION_EVIDENCE",
      applicationId,
      options: {
        source: "boss_page_readonly",
        evidenceType: "readonly_page_result",
        pageResult,
        notes: "options_submission_result_read",
        recordedBy: "user",
        noRealBossAction: true
      }
    });
    state.selectedExecutionPackageApplicationId = applicationId;
    renderSubmissionEvidenceDetail(result.response);
    await refreshWorkflowDiagnostics({ silent: true }).catch(() => {});
    await refreshGreetingDiagnostics({ silent: true }).catch(() => {});
    const assessment = result.response?.assessment || {};
    setStatus(`Submission evidence recorded: ${formatSubmissionEvidenceStatus(assessment.resultStatus || pageResult.resultStatus)}`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    if (ui.recordSubmissionPageResult) {
      ui.recordSubmissionPageResult.disabled = false;
    }
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
    state.missingDescriptionTotal = 0;
    ui.missingDescriptionCount.textContent = "--";
    ui.missingDescriptions.textContent = error.message || "待补 JD 队列不可用";
    ui.missingDescriptions.classList.add("warn");
    ui.removeMissingDescriptions.disabled = true;
    return;
  }

  ui.missingDescriptions.classList.remove("warn");
  state.missingDescriptionTotal = Number(total || jobs.length || 0);
  ui.missingDescriptionCount.textContent = String(total || jobs.length);
  ui.removeMissingDescriptions.disabled = state.missingDescriptionTotal === 0
    || !state.activeApplicationQueueId;
  renderList(ui.missingDescriptions, jobs, (job) => ({
    title: job.title || "未命名岗位",
    meta: [job.company, job.salary, job.location, `${job.descriptionLength || 0} 字`].filter(Boolean).join(" · ")
  }), "暂无待补岗位");
}

function renderWorkflowDiagnostics(diagnostics, error = null) {
  if (error) {
    state.workflowErrors = [];
    state.workflowEvents = [];
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
  renderWorkbench();
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

function renderApplicationDiagnostics(payload, error = null) {
  if (error) {
    state.applications = [];
    state.totalApplications = 0;
    state.selectedApplicationIds.clear();
    renderWorkbench();
    return;
  }
  state.applicationQueues = Array.isArray(payload?.queues)
    ? payload.queues
    : state.applicationQueues;
  state.activeApplicationQueueId = Number(
    payload?.activeQueueId || payload?.queueId || state.activeApplicationQueueId || 0
  ) || null;
  const applications = Array.isArray(payload?.applications) ? payload.applications : [];
  state.applications = applications;
  state.totalApplications = Number(payload?.totalApplications ?? applications.length);
  const applicationIds = new Set(applications.map((item) => Number(item.id)).filter(Boolean));
  for (const selectedId of state.selectedApplicationIds) {
    if (!applicationIds.has(selectedId)) {
      state.selectedApplicationIds.delete(selectedId);
    }
  }
  renderApplicationQueueSelect();
  const selectedExists = applications.some((item) => Number(item.id) === Number(state.selectedApplicationId));
  if (!selectedExists) {
    const preferred = applications.find((item) => !new Set(["SUBMITTED", "SKIPPED"]).has(item.status)) || applications[0];
    state.selectedApplicationId = preferred?.id || null;
    if (preferred?.id) {
      state.selectedExecutionPackageApplicationId = preferred.id;
    }
  }
  renderWorkbench();
}

function renderApplicationQueueSelect() {
  ui.workspaceQueueSelect.replaceChildren();
  for (const queue of state.applicationQueues) {
    const option = document.createElement("option");
    option.value = String(queue.id);
    option.textContent = `${queue.name} (${queue.completeApplicationCount || 0})`;
    ui.workspaceQueueSelect.appendChild(option);
  }
  ui.workspaceQueueSelect.value = String(state.activeApplicationQueueId || "");
  ui.workspaceQueueSelect.disabled = state.applicationQueues.length === 0;
  const activeQueue = getActiveApplicationQueue();
  ui.queueTitle.textContent = activeQueue?.name || "岗位队列";
  ui.deleteApplicationQueue.disabled = !activeQueue || activeQueue.isDefault;
  ui.deleteApplicationQueue.title = activeQueue?.isDefault ? "默认队列必须保留" : "删除当前意向岗位队列";
}

function renderWorkbench() {
  if (!ui.workspaceApplications) {
    return;
  }
  const applications = Array.isArray(state.applications) ? state.applications : [];
  const stage = state.workbenchStageFilter || "collected";
  const filter = ui.workspaceFilter.value || "all";
  const manualFilter = ui.workspaceManualFilter.value || "all";
  const visible = applications.filter((application) => (
    applicationMatchesWorkbenchStage(application, stage)
    && (filter !== "attention" || applicationNeedsAttention(application, stage))
    && (stage !== "manual" || manualFilter === "all" || application.manualStatus === manualFilter)
  ));
  state.visibleApplicationIds = visible.map((application) => Number(application.id)).filter(Boolean);
  if (visible.length && !visible.some((item) => Number(item.id) === Number(state.selectedApplicationId))) {
    state.selectedApplicationId = visible[0].id;
    state.selectedExecutionPackageApplicationId = visible[0].id;
  } else if (!visible.length) {
    state.selectedApplicationId = null;
  }

  const screeningPassed = applications.filter((item) => item.latestScreeningRecommendation === "auto_prepare").length;
  const resumeSucceeded = applications.filter((item) => Boolean(item.latestResumeFilePath)).length;
  const resumeFailed = applications.filter((item) => Boolean(item.latestResumeErrorCode) && !item.latestResumeFilePath).length;
  const applied = applications.filter((item) => item.manualStatus === "APPLIED").length;
  ui.workspaceApplicationCount.textContent = String(applications.length);
  ui.workspaceActionCount.textContent = String(screeningPassed);
  ui.workspaceReadyCount.textContent = String(resumeSucceeded);
  ui.workspaceErrorCount.textContent = String(applied);
  if (!state.queueBatchBusy) {
    ui.queueResumeBatchStatus.textContent = `成功 ${resumeSucceeded} · 失败 ${resumeFailed}`;
  }

  ui.workspaceApplications.replaceChildren();
  ui.workspaceEmpty.hidden = visible.length > 0;
  for (const application of visible) {
    const row = document.createElement("tr");
    row.className = "application-row";
    row.tabIndex = 0;
    row.dataset.applicationId = String(application.id || "");
    row.setAttribute("aria-selected", String(Number(application.id) === Number(state.selectedApplicationId)));
    row.addEventListener("click", () => selectWorkbenchApplication(application.id));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectWorkbenchApplication(application.id);
      }
    });

    const jobCell = document.createElement("td");
    jobCell.className = "job-cell";
    const jobLayout = document.createElement("div");
    jobLayout.className = "job-cell-layout";
    const select = document.createElement("input");
    select.className = "application-select";
    select.type = "checkbox";
    select.setAttribute("aria-label", `选择 ${application.title || "岗位"}`);
    select.checked = state.selectedApplicationIds.has(Number(application.id));
    select.addEventListener("click", (event) => event.stopPropagation());
    select.addEventListener("change", () => toggleApplicationSelection(application.id, select.checked));
    const jobText = document.createElement("div");
    jobText.className = "job-cell-text";
    const title = document.createElement("strong");
    title.textContent = application.title || "未命名岗位";
    const company = document.createElement("span");
    company.textContent = [application.company || "未知公司", application.location, application.salary].filter(Boolean).join(" · ");
    jobText.append(title, company);
    jobLayout.append(select, jobText);
    jobCell.append(jobLayout);

    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    status.className = "status-chip";
    status.dataset.tone = getApplicationStatusTone(application.status);
    status.textContent = formatApplicationStatus(application.status);
    statusCell.appendChild(status);

    const scoreCell = document.createElement("td");
    const screening = getScreeningForApplication(application.id);
    const matchScore = screening?.matchScore ?? application.latestMatchScore;
    const hasMatchScore = matchScore !== null && matchScore !== undefined && Number.isFinite(Number(matchScore));
    scoreCell.className = hasMatchScore ? "match-score" : "match-score muted";
    scoreCell.textContent = hasMatchScore ? String(Math.round(Number(matchScore))) : "--";

    const manualCell = document.createElement("td");
    const manualSelect = document.createElement("select");
    manualSelect.className = "manual-status-select";
    manualSelect.setAttribute("aria-label", `${application.title || "岗位"}人工状态`);
    for (const [value, label] of [["NOT_CONTACTED", "未联系"], ["GREETED", "已打招呼"], ["APPLIED", "已投递"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      manualSelect.appendChild(option);
    }
    manualSelect.value = application.manualStatus || "NOT_CONTACTED";
    manualSelect.disabled = !application.latestResumeFilePath;
    manualSelect.addEventListener("click", (event) => event.stopPropagation());
    manualSelect.addEventListener("change", (event) => {
      event.stopPropagation();
      updateApplicationManualStatus(application.id, manualSelect.value);
    });
    manualCell.appendChild(manualSelect);

    const actionCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "row-actions";
    actions.appendChild(createWorkbenchRowButton("更多", () => openJobDetailDialog(application.id)));
    if (application.status === "SKIPPED" && !application.trusted) {
      actions.appendChild(createWorkbenchRowButton("信任", () => trustFilteredApplication(application.id), "secondary"));
    }
    if (application.latestResumeFilePath && normalizeBossJobUrl(application.detailUrl)) {
      actions.appendChild(createWorkbenchRowButton("打开", () => openBossApplication(application), "primary"));
    }
    actionCell.appendChild(actions);
    row.append(jobCell, statusCell, scoreCell, manualCell, actionCell);
    ui.workspaceApplications.appendChild(row);
  }
  updateApplicationSelectionControls();
  renderWorkbenchSelection();
}

function applicationMatchesWorkbenchStage(application, stage) {
  if (stage === "screened") {
    return Boolean(application.latestScreeningId) || application.status === "SKIPPED";
  }
  if (stage === "resume") {
    return Boolean(application.latestResumeVersionId || application.latestResumeErrorCode);
  }
  if (stage === "manual") {
    return Boolean(application.latestResumeFilePath);
  }
  return application.descriptionLength >= 80;
}

function applicationNeedsAttention(application, stage) {
  const errorStatus = new Set(["NEEDS_USER_REVIEW", "NEEDS_MANUAL_ACTION", "FAILED"]);
  if (stage === "screened") {
    return application.latestScreeningRecommendation !== "auto_prepare" || errorStatus.has(application.status);
  }
  if (stage === "resume") {
    return Boolean(application.latestResumeErrorCode) || (!application.latestResumeFilePath && errorStatus.has(application.status));
  }
  if (stage === "manual") {
    return application.manualStatus === "NOT_CONTACTED";
  }
  return application.status === "SKIPPED" || errorStatus.has(application.status);
}

function createWorkbenchRowButton(label, onClick, variant = "secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `${variant} row-action`;
  button.textContent = label;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function renderWorkbenchSelection() {
  const application = getSelectedWorkbenchApplication();
  if (!application) {
    ui.nextActionTitle.textContent = "选择一个岗位";
    ui.workspaceSelectedCompany.textContent = "查看岗位、筛选和简历信息";
    ui.workspaceSelectedStatus.textContent = "未选择";
    ui.workspaceSelectedStatus.dataset.tone = "complete";
    ui.workspaceSelectedMeta.textContent = "--";
    ui.workspaceActionHint.textContent = "从左侧岗位列表选择一项。";
    ui.workspaceNextAction.textContent = "选择一个岗位";
    ui.workspaceNextAction.disabled = true;
    ui.workspaceViewDetail.disabled = true;
    renderWorkbenchStageTrack(0);
    return;
  }
  const action = resolveWorkbenchNextAction(application);
  const screening = getScreeningForApplication(application.id);
  ui.nextActionTitle.textContent = application.title || "未命名岗位";
  ui.workspaceSelectedCompany.textContent = [application.company, application.location, application.salary].filter(Boolean).join(" · ") || "公司信息未记录";
  ui.workspaceSelectedStatus.textContent = formatApplicationStatus(application.status);
  ui.workspaceSelectedStatus.dataset.tone = getApplicationStatusTone(application.status);
  const matchScore = screening?.matchScore ?? application.latestMatchScore;
  const riskScore = screening?.riskScore ?? application.latestRiskScore;
  ui.workspaceSelectedMeta.textContent = matchScore !== null && matchScore !== undefined
    ? `匹配 ${formatScore(matchScore)} · 风险 ${formatScore(riskScore)}`
    : `${application.descriptionLength || 0} 字 JD`;
  ui.workspaceActionHint.textContent = action.hint;
  ui.workspaceNextAction.textContent = state.workbenchBusy ? "处理中..." : action.label;
  ui.workspaceNextAction.dataset.action = action.type;
  ui.workspaceNextAction.disabled = state.workbenchBusy || action.disabled;
  ui.workspaceViewDetail.disabled = false;
  renderWorkbenchStageTrack(getWorkbenchPipelineStage(application));
}

function renderWorkbenchStageTrack(currentStage) {
  const labels = ["JD", "筛选", "简历", "人工"];
  ui.workspaceStageTrack.replaceChildren();
  labels.forEach((label, index) => {
    const step = document.createElement("span");
    step.className = "stage-step";
    if (index < currentStage) {
      step.classList.add("is-complete");
    } else if (index === currentStage) {
      step.classList.add("is-current");
    }
    step.textContent = label;
    ui.workspaceStageTrack.appendChild(step);
  });
}

function selectWorkbenchApplication(applicationId) {
  const id = Number(applicationId);
  if (!Number.isInteger(id) || id <= 0) {
    return;
  }
  state.selectedApplicationId = id;
  state.selectedExecutionPackageApplicationId = id;
  state.latestSubmissionPageResult = null;
  renderWorkbench();
}

function getSelectedWorkbenchApplication() {
  return state.applications.find((item) => Number(item.id) === Number(state.selectedApplicationId)) || null;
}

function getScreeningForApplication(applicationId) {
  const screening = state.screenings.find((item) => Number(item.applicationId) === Number(applicationId));
  if (screening) {
    return screening;
  }
  const application = state.applications.find((item) => Number(item.id) === Number(applicationId));
  return application?.latestScreeningId ? {
    id: application.latestScreeningId,
    applicationId: application.id,
    matchScore: application.latestMatchScore,
    riskScore: application.latestRiskScore,
    recommendation: application.latestScreeningRecommendation
  } : null;
}

function getResumeVersionForApplication(applicationId) {
  const version = state.resumeVersions.find((item) => Number(item.applicationId) === Number(applicationId));
  if (version) {
    return version;
  }
  const application = state.applications.find((item) => Number(item.id) === Number(applicationId));
  return application?.latestResumeVersionId ? {
    id: application.latestResumeVersionId,
    applicationId: application.id,
    status: application.latestResumeStatus,
    filePath: application.latestResumeFilePath
  } : null;
}

function getGreetingMessageForApplication(applicationId) {
  return state.greetingMessages.find((item) => (
    Number(item.applicationId) === Number(applicationId)
    && item.channel === "boss_greeting"
    && item.direction === "OUTBOUND"
    && item.status === "DRAFT"
  )) || null;
}

async function refreshGreetingDraftForApplication(applicationId) {
  const id = Number(applicationId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  const result = await runtimeMessage({
    type: "GET_MESSAGES",
    options: { applicationId: id, limit: 20 }
  });
  const messages = Array.isArray(result.response?.messages) ? result.response.messages : [];
  state.greetingMessages = mergeRecordsById(messages, state.greetingMessages);
  if (Number(state.selectedApplicationId) === id) {
    renderWorkbenchSelection();
  }
  return getGreetingMessageForApplication(id);
}

function resolveWorkbenchNextAction(application) {
  if (!application) {
    return { type: "NONE", label: "选择一个岗位", hint: "先选择岗位查看下一步。", disabled: true };
  }
  if (application.status === "SKIPPED" && !application.trusted) {
    return { type: "TRUST", label: "取消过滤并信任", hint: "绕过当前意向的方向门禁后重新评估，不会直接判定岗位匹配。", disabled: false };
  }
  if (!application.latestScreeningId) {
    return { type: "SCREEN", label: "评估岗位", hint: "运行风险门禁和岗位匹配评分。", disabled: false };
  }
  if (application.latestScreeningRecommendation === "auto_prepare" && !application.latestResumeVersionId) {
    return { type: "GENERATE_RESUME", label: "生成定制简历", hint: "按当前 JD 生成并审核本地 DOCX。", disabled: false };
  }
  if (application.latestResumeFilePath) {
    return { type: "OPEN_BOSS", label: "打开岗位页面", hint: "系统只导航到岗位；打招呼、上传和投递由用户完成。", disabled: !normalizeBossJobUrl(application.detailUrl) };
  }
  return { type: "DETAIL", label: "查看完整信息", hint: application.statusReason || "查看筛选、简历或失败详情。", disabled: false };
}

async function runWorkbenchNextAction() {
  const application = getSelectedWorkbenchApplication();
  const action = resolveWorkbenchNextAction(application);
  if (!application || action.disabled || state.workbenchBusy) {
    return;
  }
  state.workbenchBusy = true;
  renderWorkbenchSelection();
  try {
    if (action.type === "SCREEN") {
      const queue = getActiveApplicationQueue();
      const result = await runtimeMessage({
        type: "SCREEN_APPLICATION_BATCH",
        options: {
          queueId: queue?.id,
          applicationIds: [application.id],
          mode: getSelectedAgentExecutionMode(),
          limit: 1,
          continueOnError: false,
          userRules: {
            excludedDirections: fields.riskGateEnabled.checked
              ? parseDelimitedList(fields.excludedDirections.value)
              : []
          }
        }
      });
      await Promise.all([
        refreshApplicationDiagnostics({ silent: true }),
        refreshScreeningDiagnostics({ silent: true }),
        refreshResumeDiagnostics({ silent: true })
      ]);
      const first = result.response?.results?.[0] || {};
      setStatus(first.ok === false
        ? `岗位评估失败：${first.errorCode || first.errorMessage || "unknown"}`
        : `岗位评估完成：匹配 ${formatScore(first.matchScore)}，${formatRecommendation(first.recommendation)}`,
      first.ok === false);
    } else if (action.type === "GENERATE_RESUME") {
      await runResumeWorkflowForSelectedApplication(application.id);
      await refreshApplicationDiagnostics({ silent: true });
    } else if (action.type === "TRUST") {
      await trustFilteredApplication(application.id);
    } else if (action.type === "OPEN_BOSS") {
      openBossApplication(application);
    } else if (action.type === "DETAIL") {
      openJobDetailDialog(application.id);
    } else if (action.type === "REVIEW_RESUME") {
      await openResumeReviewForApplication(application.id);
      await refreshApplicationDiagnostics({ silent: true });
    }
  } catch (error) {
    setStatus(error.message || String(error), true);
  } finally {
    state.workbenchBusy = false;
    renderWorkbench();
  }
}

async function openResumeReviewForApplication(applicationId) {
  const id = Number(applicationId);
  const result = await runtimeMessage({
    type: "GET_RESUME_VERSIONS",
    options: { applicationId: id, limit: 20 }
  });
  const versions = Array.isArray(result.response?.resumeVersions) ? result.response.resumeVersions : [];
  if (!versions.length) {
    throw new Error("当前岗位还没有可审核的简历版本");
  }
  state.resumeVersions = mergeRecordsById(versions, state.resumeVersions);
  state.selectedExecutionPackageApplicationId = id;
  await showResumeVersionDetail(versions[0].id);
  if (!ui.resumeReviewDialog.open) {
    ui.resumeReviewDialog.showModal();
  }
}

async function openAdvancedDiagnosticsForApplication(applicationId) {
  state.selectedTimelineApplicationId = Number(applicationId);
  state.selectedExecutionPackageApplicationId = Number(applicationId);
  activateView("settings", { focus: false });
  ui.advancedDiagnostics.open = true;
  await viewWorkflowTimeline(applicationId, { preserveStatus: true }).catch(() => {});
  ui.advancedDiagnostics.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openRealGreetingDialog(application) {
  const message = getGreetingMessageForApplication(application?.id);
  if (!application?.id || !message?.id) {
    setStatus("当前岗位还没有可发送的打招呼草稿", true);
    return;
  }
  state.selectedApplicationId = application.id;
  state.selectedExecutionPackageApplicationId = application.id;
  resetRealGreetingDialog();
  ui.realGreetingTarget.textContent = formatRealGreetingConfirmation(application, message);
  ui.realGreetingDialog.showModal();
  ui.realGreetingConfirmRationale.focus();
}

function formatRealGreetingConfirmation(application, message) {
  return [
    `${application?.title || "未命名岗位"} @ ${application?.company || "未知公司"}`,
    application?.detailUrl || "岗位链接未记录",
    `消息 #${message?.id || ""}：${truncateInlineText(message?.messageText || "", 220)}`
  ].join("\n");
}

async function confirmAndRunRealGreeting() {
  const application = getSelectedWorkbenchApplication();
  const message = getGreetingMessageForApplication(application?.id);
  const rationale = cleanUiText(ui.realGreetingConfirmRationale.value);
  if (!application?.id || !message?.id || !rationale || !ui.realGreetingConfirmAcknowledgement.checked) {
    setStatus("岗位、消息、操作原因或确认项不完整", true);
    return;
  }
  const policyWasEnabled = state.realActionPolicy?.enabled === true;
  ui.realGreetingConfirmSend.disabled = true;
  try {
    await runtimeMessage({
      type: "UPDATE_REAL_ACTION_POLICY",
      options: {
        enabled: true,
        durationMinutes: 15,
        actor: "user",
        rationale
      }
    });
    const armed = await runtimeMessage({
      type: "ARM_REAL_ACTION_AUTHORIZATION",
      options: {
        applicationId: application.id,
        durationMinutes: 5,
        actor: "user",
        rationale
      }
    });
    state.realActionAuthorization = armed.response?.authorization || null;
    state.realActionAuthorizationToken = armed.response?.authorizationToken || "";
    ui.realGreetingRationale.value = rationale;
    ui.realGreetingDialog.close();
    setStatus(`一次性授权 #${state.realActionAuthorization?.id || ""} 已创建，正在执行当前岗位`);
    await runAuthorizedRealGreetingOnce();
    await refreshApplicationDiagnostics({ silent: true });
  } catch (error) {
    state.realActionAuthorizationToken = "";
    setStatus(`${error.code || "SEND_GREETING_REAL_FAILED"}: ${error.message || String(error)}`, true);
  } finally {
    if (!policyWasEnabled) {
      await runtimeMessage({
        type: "UPDATE_REAL_ACTION_POLICY",
        options: {
          enabled: false,
          durationMinutes: 1,
          actor: "user",
          rationale: `${rationale} / single action window closed`
        }
      }).catch(() => {});
    }
    ui.realGreetingConfirmSend.disabled = false;
    await refreshRealActionDiagnostics({ silent: true });
    renderWorkbench();
  }
}

function mergeRecordsById(primary, secondary) {
  const merged = new Map();
  for (const item of [...primary, ...secondary]) {
    if (item?.id && !merged.has(Number(item.id))) {
      merged.set(Number(item.id), item);
    }
  }
  return Array.from(merged.values());
}

function formatApplicationStatus(value) {
  const labels = {
    LIST_CAPTURED: "待补 JD",
    DETAIL_CAPTURED: "待评估",
    SCORED: "已评分",
    SHORTLISTED: "待生成简历",
    RESUME_DRAFTED: "待审核",
    RESUME_AUDITED: "待本地确认",
    GREETING_READY: "待打招呼",
    GREETING_SENT: "已打招呼",
    CHAT_OPENED: "沟通中",
    RESUME_UNLOCKED: "简历已解锁",
    SUBMISSION_READY: "待投递复核",
    SUBMITTED: "已投递",
    SKIPPED: "已跳过",
    NEEDS_USER_REVIEW: "需复核",
    NEEDS_MANUAL_ACTION: "需人工处理",
    FAILED: "失败"
  };
  return labels[value] || value || "未知";
}

function getApplicationStatusTone(value) {
  if (["DETAIL_CAPTURED", "SHORTLISTED", "GREETING_READY", "RESUME_UNLOCKED", "SUBMISSION_READY"].includes(value)) {
    return "ready";
  }
  if (["LIST_CAPTURED", "SCORED", "RESUME_DRAFTED", "RESUME_AUDITED"].includes(value)) {
    return "warning";
  }
  if (["NEEDS_USER_REVIEW", "NEEDS_MANUAL_ACTION", "FAILED"].includes(value)) {
    return "danger";
  }
  return "complete";
}

function getWorkbenchPipelineStage(application = {}) {
  if (application.manualStatus === "GREETED" || application.manualStatus === "APPLIED") {
    return 3;
  }
  if (application.latestResumeVersionId || application.latestResumeFilePath) {
    return 2;
  }
  if (application.latestScreeningId || application.status === "SKIPPED") {
    return 1;
  }
  return 0;
}

function renderScreeningDiagnostics(diagnostics, error = null) {
  if (error) {
    state.screeningCandidates = [];
    state.screenings = [];
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
  state.screeningCandidates = candidates;
  state.screenings = screenings;

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
  renderWorkbench();
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
  state.careerContextFreshness = normalizeCareerContextFreshness(diagnostics || {});
  state.careerContextNeedsRegeneration = state.careerContextFreshness.status === "STALE" || state.careerContextFreshness.status === "MISSING";
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
  appendKeyValue(ui.careerContextMeta, "复用状态", formatCareerContextFreshnessStatus(state.careerContextFreshness));
  appendKeyValue(ui.careerContextMeta, "最近画像变更", state.careerContextFreshness.latestProfileChangedAt ? `${formatTime(state.careerContextFreshness.latestProfileChangedAt)} / ${state.careerContextFreshness.latestProfileChangeSource || "profile"}` : "未记录");
  appendKeyValue(ui.careerContextMeta, "Agent run", context.agentRunId ? `#${context.agentRunId}` : "暂无");
  appendKeyValue(ui.careerContextMeta, "写入策略", context.writeFile === false ? "仅预览，未写入" : "写入本地文件");
  appendKeyValue(ui.careerContextMeta, "边界", "只做画像沉淀；单岗位流程仅读取已持久化事实，不会重跑 ProfileAgent 或触发 BOSS 页面动作");

  ui.careerContextAnswerStatus.classList.remove("warn");
  renderTextList(ui.careerContextQuestions, questions.map(formatCareerContextQuestion), "暂无待追问问题");
  renderCareerContextAnswerForm(questions);
  if (Object.prototype.hasOwnProperty.call(diagnostics || {}, "factDrafts")) {
    renderProfileFactDrafts(diagnostics?.factDrafts || {});
  }
  ui.careerContextPreview.textContent = context.markdown
    ? truncateText(context.markdown, 12000)
    : "暂无 career_agent_context.md";
  updateCareerContextFreshnessStatus();
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
      draft.operation === "UPDATE" ? `更新 ${draft.targetEntityType || draft.draftType} #${draft.targetEntityId || "?"}` : "新增事实",
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

  if (draft.draftType === "profile") {
    form.appendChild(createDraftInput(draft, "displayName", "姓名", draft.content?.displayName || ""));
    form.appendChild(createDraftInput(draft, "headline", "职业定位", draft.content?.headline || ""));
    form.appendChild(createDraftInput(draft, "location", "所在地", draft.content?.location || ""));
    form.appendChild(createDraftInput(draft, "targetRoles", "目标岗位", Array.isArray(draft.content?.target?.roles) ? draft.content.target.roles.join("、") : ""));
    form.appendChild(createDraftInput(draft, "targetCities", "目标城市", Array.isArray(draft.content?.target?.cities) ? draft.content.target.cities.join("、") : ""));
    form.appendChild(createDraftTextarea(draft, "summary", "画像摘要", draft.content?.summary || ""));
  } else if (draft.draftType === "experience") {
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
  if (draft.draftType === "profile") {
    const target = { ...(draft.content?.target || {}) };
    const roles = splitEditableList(values.targetRoles);
    const cities = splitEditableList(values.targetCities);
    if (roles.length) {
      target.roles = roles;
    }
    if (cities.length) {
      target.cities = cities;
    }
    const content = {};
    for (const field of ["displayName", "headline", "location", "summary"]) {
      const value = values[field] || draft.content?.[field] || "";
      if (value) {
        content[field] = value;
      }
    }
    if (Object.keys(target).length) {
      content.target = target;
    }
    return content;
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
  const freshness = state.careerContextFreshness || {};
  const needsRegeneration = isCareerContextRegenerationNeeded();
  ui.regenerateCareerContextAfterFacts.disabled = !needsRegeneration;
  ui.careerContextFreshnessStatus.classList.toggle("warn", needsRegeneration);
  if (freshness.status === "STALE") {
    ui.careerContextFreshnessStatus.textContent = `事实库已变更，旧 career_agent_context.md 已过期；最近变更：${freshness.latestProfileChangedAt ? formatTime(freshness.latestProfileChangedAt) : "未记录"}。`;
    return;
  }
  if (freshness.status === "MISSING") {
    ui.careerContextFreshnessStatus.textContent = "尚未生成 career_agent_context.md；ProfileAgent 首次对话沉淀后会持久复用。";
    return;
  }
  if (freshness.status === "FRESH") {
    ui.careerContextFreshnessStatus.textContent = "career_agent_context.md 与当前画像事实库一致；后续 JD 评分和简历生成会直接复用持久化画像。";
    return;
  }
  ui.careerContextFreshnessStatus.textContent = state.careerContextNeedsRegeneration
    ? "事实库已变更，建议重新生成 career_agent_context.md 后再进行 JD 打分或简历生成。"
    : "确认或拒绝事实草稿后，建议重新生成职业上下文。";
}

function isCareerContextRegenerationNeeded() {
  const status = state.careerContextFreshness?.status || "";
  return state.careerContextNeedsRegeneration || status === "STALE" || status === "MISSING";
}

function normalizeCareerContextFreshness(payload = {}) {
  const freshness = payload.freshness && typeof payload.freshness === "object" ? payload.freshness : {};
  const status = String(freshness.status || "").toUpperCase();
  return {
    status: ["FRESH", "STALE", "MISSING"].includes(status) ? status : "",
    isFresh: Boolean(freshness.isFresh),
    contextUpdatedAt: freshness.contextUpdatedAt || "",
    latestProfileChangedAt: freshness.latestProfileChangedAt || "",
    latestProfileChangeSource: freshness.latestProfileChangeSource || "",
    latestProfileChangeId: freshness.latestProfileChangeId || null,
    staleReasons: Array.isArray(freshness.staleReasons) ? freshness.staleReasons : []
  };
}

function formatCareerContextFreshnessStatus(freshness = {}) {
  if (freshness.status === "FRESH") {
    return "可复用";
  }
  if (freshness.status === "STALE") {
    return "已过期，需重新生成";
  }
  if (freshness.status === "MISSING") {
    return "未生成";
  }
  return "未记录";
}

function formatProfileDraftType(value) {
  const labels = {
    profile: "基本画像",
    experience: "经历",
    skill: "技能",
    constraint: "约束",
    question: "追问"
  };
  return labels[value] || value || "草稿";
}

function normalizeCareerContextPayload(payload = {}) {
  const stored = payload.careerContext || {};
  const file = stored.file && typeof stored.file === "object" ? stored.file : {};
  const context = stored.context && typeof stored.context === "object" ? stored.context : {};
  const markdown = stored.markdown || "";
  return {
    exists: Boolean(stored.exists || markdown || stored.file || stored.filePath),
    filePath: stored.filePath || file.filePath || "",
    fileName: stored.fileName || file.fileName || "",
    markdown,
    bytes: Number(stored.bytes || file.bytes || browserByteLength(markdown)),
    updatedAt: stored.updatedAt || file.updatedAt || payload.freshness?.contextUpdatedAt || "",
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

function readCareerContextAnswersWithUserUpdate() {
  const answers = readCareerContextAnswers();
  const updateAnswer = readProfileAgentUserUpdateAnswer();
  if (updateAnswer) {
    answers.push(updateAnswer);
  }
  return answers.slice(0, 50);
}

function readProfileAgentUserUpdateAnswer() {
  const answer = String(ui.profileAgentUserUpdate?.value || "").trim();
  if (!answer) {
    return null;
  }
  return {
    id: "profile_user_update",
    prompt: "用户主动补充或修改画像信息",
    answer
  };
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
    state.resumeVersions = [];
    state.resumeAudits = [];
    state.resumeFitEvaluations = [];
    state.resumeClaimVerifications = [];
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
  renderWorkbench();
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
    await refreshRealActionDiagnostics({ silent: true });
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
    await refreshRealActionDiagnostics({ silent: true });
    setStatus(`已读取审核记录 #${audit.id || id}`);
  } catch (error) {
    ui.resumeDetailStatus.textContent = error.message || String(error);
    ui.resumeDetailStatus.classList.add("warn");
    setStatus(error.message || String(error), true);
  }
}

function renderResumeDetail(version = {}, audit = null, fitEvaluation = null, claimVerification = null) {
  const fields = version.resumeFields && typeof version.resumeFields === "object" ? version.resumeFields : {};
  const renderMetadata = version.renderMetadata && typeof version.renderMetadata === "object" ? version.renderMetadata : {};
  state.selectedResumeVersion = version;
  if (version.applicationId) {
    state.selectedApplicationId = version.applicationId;
    state.selectedExecutionPackageApplicationId = version.applicationId;
  }
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
  appendTemplateMetadata(ui.resumeFieldPreview, renderMetadata);
  appendRenderQuality(ui.resumeFieldPreview, renderMetadata.renderQuality || {});
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
    await refreshApplicationDiagnostics({ silent: true });
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
    await refreshApplicationDiagnostics({ silent: true });
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

function appendTemplateMetadata(container, metadata = {}) {
  if (!metadata || typeof metadata !== "object" || !(metadata.template || metadata.templateLabel || metadata.templateSkill)) {
    return;
  }
  appendKeyValue(container, "模板", metadata.templateLabel || metadata.template || "未记录");
  appendKeyValue(container, "模板 Skill", metadata.templateSkill || "未记录");
  appendKeyValue(
    container,
    "章节顺序",
    Array.isArray(metadata.templateOrder) && metadata.templateOrder.length ? metadata.templateOrder.join(" -> ") : "未记录"
  );
  appendKeyValue(container, "隐藏摘要/技能", [
    metadata.showSummarySection === false ? "摘要隐藏" : "摘要显示",
    metadata.showSkillsSection === false ? "技能隐藏" : "技能显示"
  ].join(" / "));
}

function appendRenderQuality(container, renderQuality = {}) {
  if (!renderQuality || typeof renderQuality !== "object" || !renderQuality.checks) {
    return;
  }
  appendKeyValue(container, "DOCX QA", renderQuality.ok === false ? "需检查" : "通过");
  appendKeyValue(container, "页数估算", `${renderQuality.estimatedPages || "?"}/${renderQuality.maxPages || 2}`);
  appendKeyValue(container, "文本长度", String(renderQuality.textLength || 0));
  const warnings = Array.isArray(renderQuality.warnings) ? renderQuality.warnings.filter(Boolean) : [];
  if (warnings.length) {
    appendPillGroup(container, "DOCX QA warnings", warnings.slice(0, 8));
  }
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

function formatManualApplicationStatus(value) {
  const labels = {
    NOT_CONTACTED: "未联系",
    GREETED: "已打招呼",
    APPLIED: "已投递"
  };
  return labels[value] || "未联系";
}

function normalizeBossJobUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || !/(^|\.)zhipin\.com$/i.test(url.hostname)) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
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

function formatSubmissionEvidenceStatus(value) {
  const labels = {
    MANUAL_SUBMISSION_CONFIRMED: "Manual submission confirmed",
    GREETING_SENT_CONFIRMED: "Greeting sent confirmed",
    RESUME_UPLOAD_CONFIRMED: "Resume upload confirmed",
    BLOCKED_BY_BOSS: "Blocked by BOSS",
    NEEDS_USER_ACTION: "Needs user action",
    UNKNOWN: "Unknown"
  };
  return labels[value] || value || "Unknown";
}

function formatDecimal(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "--";
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
    const error = new Error(response?.error || "扩展后台无响应");
    error.code = response?.errorCode || "EXTENSION_BACKGROUND_ERROR";
    error.context = response?.context || {};
    throw error;
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
