const fs = require("fs");
const path = require("path");
const { planApplicationWorkflow } = require("../workflow-orchestrator");

const EXECUTION_PACKAGE_VERSION = "m11.execution-package.v1";
const BLOCKED_REAL_ACTIONS = ["SEND_GREETING_REAL", "UPLOAD_RESUME_REAL", "SUBMIT_APPLICATION_REAL"];
const EXECUTION_PACKAGE_REVIEW_DECISIONS = new Set([
  "APPROVED_FOR_MANUAL_EXECUTION",
  "REFRESH_REQUIRED",
  "BLOCKED"
]);
const EXECUTION_STEP_DECISIONS = new Set([
  "DONE",
  "SKIPPED",
  "FAILED",
  "BLOCKED",
  "NEEDS_REFRESH"
]);

function createExecutionPackageService({ store, dataDir }) {
  if (!store) {
    throw new Error("ExecutionPackageService requires a store");
  }
  const archiveRoot = path.join(path.resolve(dataDir || path.join(__dirname, "..", "data")), "execution_packages");

  return {
    readPackage(applicationId, options = {}) {
      const snapshot = store.getApplicationWorkflowSnapshot(applicationId);
      const executionPackage = buildLocalExecutionPackage(snapshot, options);
      executionPackage.validation = validateExecutionPackage(executionPackage);
      return {
        ok: true,
        storage: "sqlite",
        persisted: false,
        executionPackage
      };
    },

    preparePackage(applicationId, options = {}) {
      const snapshot = store.getApplicationWorkflowSnapshot(applicationId);
      const executionPackage = buildLocalExecutionPackage(snapshot, options);
      const archive = writeExecutionPackageArchive(executionPackage, {
        outputDir: options.outputDir || archiveRoot
      });
      executionPackage.archive = archive;
      executionPackage.validation = validateExecutionPackage(executionPackage, {
        requireArchive: true
      });
      const readyForManualExecution = executionPackage.ready && executionPackage.validation.ok;
      const event = store.recordWorkflowEvent({
        applicationId,
        sourceType: "workflow",
        eventType: "EXECUTION_PACKAGE_PREPARED",
        severity: readyForManualExecution ? "info" : "warning",
        status: readyForManualExecution ? "READY" : "BLOCKED",
        progressCurrent: readyForManualExecution ? 1 : 0,
        progressTotal: 1,
        message: readyForManualExecution
          ? `Local execution package prepared for application ${applicationId}.`
          : `Local execution package prepared with ${executionPackage.blockers.length} blocker(s) and ${executionPackage.validation.blockingFailures.length} validation failure(s).`,
        errorCode: readyForManualExecution ? "" : "EXECUTION_PACKAGE_NOT_READY",
        errorMessage: readyForManualExecution
          ? ""
          : [
            ...executionPackage.blockers.map((blocker) => blocker.code),
            ...executionPackage.validation.blockingFailures.map((failure) => failure.code)
          ].join(", "),
        metadata: {
          version: EXECUTION_PACKAGE_VERSION,
          requestedBy: cleanText(options.requestedBy || options.reviewer || "user"),
          packageStatus: executionPackage.status,
          ready: executionPackage.ready,
          blockerCodes: executionPackage.blockers.map((blocker) => blocker.code),
          validation: executionPackage.validation,
          resumeVersionId: executionPackage.resume?.versionId || null,
          greetingMessageId: executionPackage.greeting?.messageId || null,
          archive,
          noRealBossAction: true,
          noBrowserTaskCreated: true,
          createsBrowserTasks: false,
          realActionsBlocked: BLOCKED_REAL_ACTIONS
        }
      });
      return {
        ok: true,
        storage: "sqlite",
        persisted: true,
        workflowEvent: event,
        executionPackage
      };
    },

    reviewPackage(applicationId, input = {}) {
      const decision = normalizeExecutionPackageReviewDecision(input.decision || input.status || "");
      if (!decision) {
        const error = new Error("Valid execution package review decision is required");
        error.statusCode = 400;
        throw error;
      }
      const reviewer = cleanText(input.reviewer || input.approver || "user");
      const note = cleanText(input.note || input.reason || "");
      const snapshot = store.getApplicationWorkflowSnapshot(applicationId);
      const executionPackage = buildLocalExecutionPackage(snapshot, input);
      if (input.archive && typeof input.archive === "object") {
        executionPackage.archive = input.archive;
      }
      if (input.requireArchive !== false) {
        const preparedEvent = findLatestExecutionPackagePreparedEvent(store, applicationId);
        if (preparedEvent?.metadata?.archive) {
          executionPackage.archive = preparedEvent.metadata.archive;
        }
      }
      executionPackage.validation = validateExecutionPackage(executionPackage, {
        requireArchive: input.requireArchive !== false
      });
      const approvalBlocked = decision === "APPROVED_FOR_MANUAL_EXECUTION"
        && (!executionPackage.ready || !executionPackage.validation.ok);
      const review = {
        decision,
        reviewer,
        note,
        reviewedAt: new Date().toISOString(),
        accepted: !approvalBlocked,
        requiresRefresh: decision === "REFRESH_REQUIRED",
        blocked: decision === "BLOCKED" || approvalBlocked,
        noRealBossAction: true,
        noBrowserTaskCreated: true,
        createsBrowserTasks: false,
        packageReady: Boolean(executionPackage.ready),
        validationOk: Boolean(executionPackage.validation.ok),
        blockerCodes: executionPackage.blockers.map((blocker) => blocker.code),
        validationFailureCodes: executionPackage.validation.blockingFailures.map((failure) => failure.code)
      };
      const event = store.recordWorkflowEvent({
        applicationId,
        sourceType: "workflow",
        eventType: "EXECUTION_PACKAGE_REVIEWED",
        severity: approvalBlocked ? "warning" : "info",
        status: approvalBlocked ? "BLOCKED" : decision,
        progressCurrent: review.accepted ? 1 : 0,
        progressTotal: 1,
        message: approvalBlocked
          ? `Execution package review blocked approval for application ${applicationId}.`
          : `Execution package reviewed for application ${applicationId}: ${decision}.`,
        errorCode: approvalBlocked ? "EXECUTION_PACKAGE_REVIEW_BLOCKED" : "",
        errorMessage: approvalBlocked
          ? review.validationFailureCodes.concat(review.blockerCodes).join(", ")
          : "",
        metadata: {
          version: EXECUTION_PACKAGE_VERSION,
          review,
          validation: executionPackage.validation,
          packageStatus: executionPackage.status,
          archive: executionPackage.archive || null,
          noRealBossAction: true,
          noBrowserTaskCreated: true,
          createsBrowserTasks: false,
          realActionsBlocked: BLOCKED_REAL_ACTIONS
        }
      });
      return {
        ok: review.accepted,
        storage: "sqlite",
        persisted: true,
        workflowEvent: event,
        review,
        executionPackage
      };
    },

    readChecklist(applicationId, options = {}) {
      const snapshot = store.getApplicationWorkflowSnapshot(applicationId);
      const executionPackage = buildLocalExecutionPackage(snapshot, options);
      const preparedEvent = findLatestExecutionPackagePreparedEvent(store, applicationId);
      if (preparedEvent?.metadata?.archive) {
        executionPackage.archive = preparedEvent.metadata.archive;
      }
      executionPackage.validation = validateExecutionPackage(executionPackage, {
        requireArchive: options.requireArchive !== false && Boolean(executionPackage.archive)
      });
      const checklist = buildExecutionChecklist({
        store,
        applicationId,
        executionPackage,
        preparedEvent,
        reviewEvent: findLatestExecutionPackageReviewEvent(store, applicationId),
        stepEvents: findExecutionStepEvents(store, applicationId)
      });
      return {
        ok: true,
        storage: "sqlite",
        persisted: false,
        executionPackage,
        checklist
      };
    },

    recordChecklistStep(applicationId, input = {}) {
      const stepAction = cleanText(input.stepAction || input.action || "");
      const decision = normalizeExecutionStepDecision(input.decision || input.status || "");
      if (!stepAction) {
        const error = new Error("Execution checklist step action is required");
        error.statusCode = 400;
        throw error;
      }
      if (!decision) {
        const error = new Error("Valid execution checklist step decision is required");
        error.statusCode = 400;
        throw error;
      }
      const checklistResult = this.readChecklist(applicationId, {
        requestedBy: input.requestedBy || input.reviewer || "user",
        requireArchive: true
      });
      const checklist = checklistResult.checklist;
      const step = checklist.steps.find((item) => item.action === stepAction);
      if (!step) {
        const error = new Error(`Execution checklist step is not allowed: ${stepAction}`);
        error.statusCode = 400;
        throw error;
      }
      const approvalMissing = !checklist.canRecordManualProgress;
      const record = {
        stepAction,
        stepOrder: step.order,
        stepTitle: step.title,
        decision,
        note: cleanText(input.note || input.reason || ""),
        evidenceUrl: cleanText(input.evidenceUrl || input.url || ""),
        reviewer: cleanText(input.reviewer || input.operator || "user"),
        recordedAt: new Date().toISOString(),
        noRealBossAction: true,
        noBrowserTaskCreated: true,
        createsBrowserTasks: false,
        applicationStatus: checklist.applicationStatus,
        packageReviewDecision: checklist.packageReview?.decision || "",
        packageReviewAccepted: Boolean(checklist.packageReview?.accepted)
      };
      const event = store.recordWorkflowEvent({
        applicationId,
        sourceType: "workflow",
        eventType: "EXECUTION_CHECKLIST_STEP_RECORDED",
        severity: approvalMissing || decision === "FAILED" || decision === "BLOCKED" ? "warning" : "info",
        status: approvalMissing ? "BLOCKED" : decision,
        progressCurrent: countCompletedChecklistSteps(checklist.steps, record),
        progressTotal: checklist.steps.length,
        message: approvalMissing
          ? `Execution checklist step was not accepted because package approval is missing for application ${applicationId}.`
          : `Execution checklist step recorded for application ${applicationId}: ${stepAction} ${decision}.`,
        errorCode: approvalMissing ? "EXECUTION_PACKAGE_APPROVAL_REQUIRED" : "",
        errorMessage: approvalMissing ? "Execution package review approval is required before recording manual progress." : "",
        metadata: {
          version: EXECUTION_PACKAGE_VERSION,
          record,
          noRealBossAction: true,
          noBrowserTaskCreated: true,
          createsBrowserTasks: false,
          realActionsBlocked: BLOCKED_REAL_ACTIONS
        }
      });
      const nextChecklist = this.readChecklist(applicationId, {
        requestedBy: input.requestedBy || input.reviewer || "user",
        requireArchive: true
      }).checklist;
      return {
        ok: !approvalMissing,
        storage: "sqlite",
        persisted: true,
        workflowEvent: event,
        record,
        checklist: nextChecklist,
        executionPackage: checklistResult.executionPackage
      };
    }
  };
}

function buildLocalExecutionPackage(snapshot = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const plan = options.plan || planApplicationWorkflow(snapshot, { now });
  const application = normalizeObject(snapshot.application);
  const job = normalizeObject(snapshot.job);
  const resumeVersion = normalizeNullableObject(snapshot.latestResumeVersion);
  const resumeFitEvaluation = normalizeNullableObject(snapshot.latestResumeFitEvaluation);
  const resumeClaimVerification = normalizeNullableObject(snapshot.latestResumeClaimVerification);
  const resumeAudit = normalizeNullableObject(snapshot.latestResumeAudit);
  const conversation = normalizeNullableObject(snapshot.latestConversation);
  const greetingDraft = normalizeNullableObject(snapshot.latestGreetingDraft);
  const conversationMetadata = normalizeObject(conversation?.metadata);
  const communicationAssessment = normalizeNullableObject(conversationMetadata.communicationAssessment);
  const submissionReadiness = normalizeNullableObject(conversationMetadata.submissionReadiness);
  const submissionReadinessReview = normalizeNullableObject(conversationMetadata.submissionReadinessReview);
  const uploadDryRun = normalizeNullableObject(conversationMetadata.lastUploadDryRun);
  const submitDryRun = normalizeNullableObject(conversationMetadata.lastSubmitDryRun);
  const browserTasks = Array.isArray(snapshot.latestBrowserTasks) ? snapshot.latestBrowserTasks : [];
  const taskEvidence = summarizeLatestTasks(browserTasks);
  const renderMetadata = normalizeObject(resumeVersion?.renderMetadata);
  const renderQuality = normalizeNullableObject(renderMetadata.renderQuality);
  const descriptionLength = number(application.descriptionLength || String(job.description || "").trim().length);
  const blockers = [];
  const warnings = [];

  addBlocker(blockers, !application.id, "application_missing", "Application snapshot is missing.");
  addBlocker(blockers, !(text(application.title || job.title) && text(application.company || job.company)), "job_identity_missing", "Job title or company is missing.");
  addBlocker(blockers, !text(application.detailUrl || job.detailUrl), "job_detail_url_missing", "BOSS detail URL is missing.");
  addBlocker(blockers, descriptionLength < 80, "job_description_incomplete", "JD is incomplete or too short.");
  addBlocker(blockers, !resumeVersion, "resume_version_missing", "No resume version exists for this application.");
  addBlocker(blockers, Boolean(resumeVersion && resumeVersion.status !== "APPROVED"), "resume_not_approved", "Latest resume version is not approved by AuditAgent.");
  addBlocker(blockers, Boolean(resumeVersion && !resumeVersion.metadata?.localApproval?.approved), "resume_local_approval_missing", "Local resume approval is missing.");
  addBlocker(blockers, Boolean(resumeVersion && !text(resumeVersion.filePath)), "resume_docx_missing", "Rendered DOCX path is missing.");
  addBlocker(blockers, Boolean(resumeVersion && text(resumeVersion.fileFormat).toLowerCase() !== "docx"), "resume_docx_format_missing", "Rendered resume is not recorded as DOCX.");
  addBlocker(blockers, Boolean(renderQuality && renderQuality.ok === false), "resume_render_qa_failed", "DOCX render QA has hard failures.");
  addBlocker(blockers, Boolean(resumeFitEvaluation?.policy?.canProceedToAudit === false), "resume_fit_gate_blocked", "Resume/JD fit gate still blocks audit.");
  addBlocker(blockers, Boolean(resumeClaimVerification?.policy?.canProceedToAudit === false), "resume_claim_gate_blocked", "Claim verification still blocks audit.");
  addBlocker(blockers, !resumeAudit, "resume_audit_missing", "Resume audit is missing.");
  addBlocker(blockers, Boolean(resumeAudit && resumeAudit.recommendation !== "approve"), "resume_audit_not_approved", "Resume audit has not approved this version.");
  addBlocker(blockers, !greetingDraft, "greeting_draft_missing", "Greeting draft is missing.");
  addBlocker(blockers, Boolean(greetingDraft && greetingDraft.status !== "DRAFT"), "greeting_draft_status_unexpected", "Greeting draft is not in DRAFT status.");
  addBlocker(blockers, !taskEvidence.SEND_GREETING?.succeeded, "send_greeting_dry_run_missing", "SEND_GREETING dry-run has not succeeded.");
  addBlocker(blockers, !isUploadDryRunReady(uploadDryRun), "upload_dry_run_missing", "UPLOAD_RESUME dry-run is missing or unsafe.");
  addBlocker(blockers, !isSubmitDryRunReady(submitDryRun), "submit_dry_run_missing", "SUBMIT_APPLICATION dry-run is missing or unsafe.");
  addBlocker(blockers, submissionReadiness?.status !== "READY_FOR_MANUAL_REVIEW", "submission_readiness_not_ready", "Submission readiness is not ready for manual review.");
  addBlocker(blockers, submissionReadinessReview?.decision !== "APPROVED_FOR_MANUAL_EXECUTION", "submission_readiness_review_missing", "Local submission readiness review has not approved manual execution.");

  if (renderQuality && Array.isArray(renderQuality.warnings)) {
    warnings.push(...renderQuality.warnings.slice(0, 12).map((item) => ({
      code: "resume_render_qa_warning",
      message: String(item || "")
    })).filter((item) => item.message));
  }
  if (submissionReadiness?.confidence && Number(submissionReadiness.confidence) < 0.8) {
    warnings.push({
      code: "submission_readiness_low_confidence",
      message: `Submission readiness confidence is ${submissionReadiness.confidence}.`
    });
  }

  const ready = blockers.length === 0;
  return {
    ok: true,
    version: EXECUTION_PACKAGE_VERSION,
    preparedAt: now,
    applicationId: number(application.id),
    ready,
    status: ready ? "READY_FOR_MANUAL_EXECUTION" : "BLOCKED",
    noRealBossAction: true,
    createsBrowserTasks: false,
    noBrowserTaskCreated: true,
    realActionsBlocked: BLOCKED_REAL_ACTIONS,
    safety: {
      browserHoldsModelSecrets: false,
      createsBrowserTasks: false,
      advancesApplicationStatus: false,
      clicksBossSend: false,
      uploadsResume: false,
      submitsApplication: false,
      requiresHumanReviewBeforeRealSubmission: true
    },
    blockers,
    warnings,
    nextActions: ready ? [] : blockers.map((blocker) => ({
      action: "RESOLVE_EXECUTION_PACKAGE_BLOCKER",
      blockerCode: blocker.code,
      label: blocker.message,
      noRealBossAction: true
    })),
    application: {
      id: number(application.id),
      status: text(application.status),
      title: text(application.title || job.title),
      company: text(application.company || job.company),
      salary: text(application.salary || job.salary),
      location: text(application.location || job.location),
      detailUrl: text(application.detailUrl || job.detailUrl),
      descriptionLength
    },
    job: {
      sourceKey: text(application.sourceKey || job.sourceKey),
      bossJobId: text(application.bossJobId || job.jobId),
      detailUrl: text(application.detailUrl || job.detailUrl)
    },
    resume: summarizeResume(resumeVersion, resumeAudit, resumeFitEvaluation, resumeClaimVerification, renderMetadata, renderQuality),
    greeting: greetingDraft ? {
      messageId: number(greetingDraft.id),
      conversationId: number(greetingDraft.conversationId),
      resumeVersionId: number(greetingDraft.resumeVersionId),
      status: text(greetingDraft.status),
      actionMode: text(greetingDraft.metadata?.actionMode || "dry_run"),
      requiresUserConfirmation: greetingDraft.metadata?.requiresUserConfirmation !== false,
      messageText: text(greetingDraft.messageText),
      noRealBossAction: true
    } : null,
    conversation: conversation ? {
      id: number(conversation.id),
      status: text(conversation.status),
      conversationUrl: text(conversation.conversationUrl),
      communicationAssessment,
      updatedAt: conversation.updatedAt || ""
    } : null,
    dryRunEvidence: {
      sendGreeting: summarizeTaskEvidence(taskEvidence.SEND_GREETING),
      uploadResume: {
        task: summarizeTaskEvidence(taskEvidence.UPLOAD_RESUME),
        evidence: uploadDryRun || null,
        ready: isUploadDryRunReady(uploadDryRun)
      },
      submitApplication: {
        task: summarizeTaskEvidence(taskEvidence.SUBMIT_APPLICATION),
        evidence: submitDryRun || null,
        ready: isSubmitDryRunReady(submitDryRun)
      }
    },
    submissionReadiness: submissionReadiness || null,
    submissionReadinessReview: submissionReadinessReview || null,
    workflowPlan: {
      version: plan.version,
      nextAction: plan.nextAction || null,
      blockedReasons: Array.isArray(plan.blockedReasons) ? plan.blockedReasons : [],
      evidenceSummary: plan.evidenceSummary || {}
    },
    manualSteps: buildManualSteps({ ready, blockers, resumeVersion, greetingDraft, application, job })
  };
}

function summarizeResume(resumeVersion, resumeAudit, resumeFitEvaluation, resumeClaimVerification, renderMetadata, renderQuality) {
  if (!resumeVersion) {
    return null;
  }
  return {
    versionId: number(resumeVersion.id),
    versionNumber: number(resumeVersion.versionNumber),
    status: text(resumeVersion.status),
    filePath: text(resumeVersion.filePath),
    fileFormat: text(resumeVersion.fileFormat),
    localApproval: resumeVersion.metadata?.localApproval || null,
    template: {
      key: text(renderMetadata.template),
      label: text(renderMetadata.templateLabel),
      skill: text(renderMetadata.templateSkill),
      sectionOrder: Array.isArray(renderMetadata.templateOrder) ? renderMetadata.templateOrder : []
    },
    renderQuality: renderQuality ? {
      ok: renderQuality.ok !== false,
      estimatedPages: number(renderQuality.estimatedPages),
      maxPages: number(renderQuality.maxPages || 2),
      textLength: number(renderQuality.textLength),
      blockingChecks: renderQuality.blockingChecks || {},
      warnings: Array.isArray(renderQuality.warnings) ? renderQuality.warnings : []
    } : null,
    audit: resumeAudit ? {
      id: number(resumeAudit.id),
      recommendation: text(resumeAudit.recommendation),
      truthfulnessPassed: Boolean(resumeAudit.truthfulnessPassed),
      formatPassed: Boolean(resumeAudit.formatPassed),
      pageLimitPassed: Boolean(resumeAudit.pageLimitPassed),
      jobFitReview: text(resumeAudit.jobFitReview),
      riskFlags: Array.isArray(resumeAudit.riskFlags) ? resumeAudit.riskFlags : []
    } : null,
    fitEvaluation: resumeFitEvaluation ? {
      id: number(resumeFitEvaluation.id),
      coverageScore: number(resumeFitEvaluation.coverageScore),
      fitLevel: text(resumeFitEvaluation.fitLevel),
      policy: resumeFitEvaluation.policy || {}
    } : null,
    claimVerification: resumeClaimVerification ? {
      id: number(resumeClaimVerification.id),
      truthfulnessPassed: Boolean(resumeClaimVerification.truthfulnessPassed),
      supportedCount: number(resumeClaimVerification.supportedCount),
      unsupportedCount: number(resumeClaimVerification.unsupportedCount),
      needsUserConfirmationCount: number(resumeClaimVerification.needsUserConfirmationCount),
      policy: resumeClaimVerification.policy || {}
    } : null
  };
}

function buildManualSteps({ ready, blockers, resumeVersion, greetingDraft, application, job }) {
  if (!ready) {
    return blockers.map((blocker, index) => ({
      order: index + 1,
      action: "resolve_blocker",
      title: blocker.code,
      detail: blocker.message,
      noRealBossAction: true
    }));
  }
  return [
    {
      order: 1,
      action: "open_boss_job",
      title: "Open the matched BOSS job page",
      detail: text(application.detailUrl || job.detailUrl),
      noRealBossAction: true
    },
    {
      order: 2,
      action: "verify_job_identity",
      title: "Verify title and company before any manual action",
      detail: [application.title || job.title, application.company || job.company].map(text).filter(Boolean).join(" @ "),
      noRealBossAction: true
    },
    {
      order: 3,
      action: "review_greeting_draft",
      title: "Review the greeting draft locally",
      detail: greetingDraft?.messageText || "",
      noRealBossAction: true
    },
    {
      order: 4,
      action: "use_rendered_docx",
      title: "Use the approved local DOCX if BOSS requests a resume",
      detail: resumeVersion?.filePath || "",
      noRealBossAction: true
    },
    {
      order: 5,
      action: "manual_submit_only_after_final_review",
      title: "Submit manually only after final page review",
      detail: "This package does not click send, upload, confirm, or submit.",
      noRealBossAction: true
    }
  ];
}

function writeExecutionPackageArchive(executionPackage = {}, options = {}) {
  const outputDir = path.resolve(options.outputDir || path.join(__dirname, "..", "data", "execution_packages"));
  fs.mkdirSync(outputDir, { recursive: true });
  const baseName = buildArchiveBaseName(executionPackage);
  const jsonPath = path.join(outputDir, `${baseName}.json`);
  const markdownPath = path.join(outputDir, `${baseName}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(executionPackage, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownPath, renderExecutionPackageMarkdown(executionPackage), "utf8");
  const jsonBytes = fs.statSync(jsonPath).size;
  const markdownBytes = fs.statSync(markdownPath).size;
  return {
    outputDir,
    jsonPath,
    markdownPath,
    jsonBytes,
    markdownBytes,
    generatedAt: new Date().toISOString(),
    noRealBossAction: true
  };
}

function buildArchiveBaseName(executionPackage = {}) {
  const timestamp = text(executionPackage.preparedAt || new Date().toISOString())
    .replace(/[:.]/g, "-")
    .replace(/[^\dT-]/g, "")
    .slice(0, 24);
  const applicationId = number(executionPackage.applicationId);
  const title = slugify(executionPackage.application?.title || "job").slice(0, 36);
  const company = slugify(executionPackage.application?.company || "company").slice(0, 28);
  return [`application-${applicationId || "unknown"}`, company, title, timestamp].filter(Boolean).join("-");
}

function renderExecutionPackageMarkdown(executionPackage = {}) {
  const lines = [];
  lines.push(`# Local Execution Package #${executionPackage.applicationId || ""}`.trim());
  lines.push("");
  lines.push(`- Status: ${executionPackage.status || "UNKNOWN"}`);
  lines.push(`- Ready: ${executionPackage.ready ? "yes" : "no"}`);
  lines.push(`- Prepared at: ${executionPackage.preparedAt || ""}`);
  lines.push(`- No real BOSS action: ${executionPackage.noRealBossAction ? "true" : "false"}`);
  lines.push(`- Creates browser tasks: ${executionPackage.createsBrowserTasks ? "true" : "false"}`);
  lines.push(`- Real actions blocked: ${(executionPackage.realActionsBlocked || []).join(", ") || "none"}`);
  lines.push("");
  lines.push("## Job");
  lines.push("");
  lines.push(`- Title: ${executionPackage.application?.title || ""}`);
  lines.push(`- Company: ${executionPackage.application?.company || ""}`);
  lines.push(`- Location: ${executionPackage.application?.location || ""}`);
  lines.push(`- Detail URL: ${executionPackage.application?.detailUrl || ""}`);
  lines.push(`- JD length: ${executionPackage.application?.descriptionLength || 0}`);
  lines.push("");
  lines.push("## Resume");
  lines.push("");
  lines.push(`- Version: ${executionPackage.resume?.versionId || ""}`);
  lines.push(`- File: ${executionPackage.resume?.filePath || ""}`);
  lines.push(`- Format: ${executionPackage.resume?.fileFormat || ""}`);
  lines.push(`- Template: ${executionPackage.resume?.template?.key || ""}`);
  lines.push(`- DOCX QA: ${executionPackage.resume?.renderQuality?.ok === false ? "failed" : "passed_or_not_recorded"}`);
  lines.push(`- Audit: ${executionPackage.resume?.audit?.recommendation || ""}`);
  lines.push(`- Fit score: ${executionPackage.resume?.fitEvaluation?.coverageScore ?? ""}`);
  lines.push(`- Claims passed: ${executionPackage.resume?.claimVerification?.truthfulnessPassed === true ? "true" : "false"}`);
  lines.push("");
  lines.push("## Greeting");
  lines.push("");
  lines.push(`- Message ID: ${executionPackage.greeting?.messageId || ""}`);
  lines.push(`- Status: ${executionPackage.greeting?.status || ""}`);
  lines.push(`- Action mode: ${executionPackage.greeting?.actionMode || ""}`);
  if (executionPackage.greeting?.messageText) {
    lines.push("");
    lines.push("```text");
    lines.push(executionPackage.greeting.messageText);
    lines.push("```");
  }
  lines.push("");
  lines.push("## Dry Run Evidence");
  lines.push("");
  lines.push(`- SEND_GREETING: ${formatTaskLine(executionPackage.dryRunEvidence?.sendGreeting)}`);
  lines.push(`- UPLOAD_RESUME ready: ${executionPackage.dryRunEvidence?.uploadResume?.ready ? "true" : "false"}`);
  lines.push(`- SUBMIT_APPLICATION ready: ${executionPackage.dryRunEvidence?.submitApplication?.ready ? "true" : "false"}`);
  lines.push("");
  lines.push("## Readiness");
  lines.push("");
  lines.push(`- Submission readiness: ${executionPackage.submissionReadiness?.status || ""}`);
  lines.push(`- Readiness reason: ${executionPackage.submissionReadiness?.reason || ""}`);
  lines.push(`- Review decision: ${executionPackage.submissionReadinessReview?.decision || ""}`);
  lines.push(`- Reviewer: ${executionPackage.submissionReadinessReview?.reviewer || ""}`);
  lines.push("");
  lines.push("## Blockers");
  lines.push("");
  appendList(lines, executionPackage.blockers, (blocker) => `${blocker.code}: ${blocker.message}`, "No blockers.");
  lines.push("");
  lines.push("## Manual Steps");
  lines.push("");
  appendList(lines, executionPackage.manualSteps, (step) => `${step.order}. ${step.title}${step.detail ? ` - ${step.detail}` : ""}`, "No manual steps.");
  lines.push("");
  lines.push("## Safety");
  lines.push("");
  for (const [key, value] of Object.entries(executionPackage.safety || {})) {
    lines.push(`- ${key}: ${value}`);
  }
  if (executionPackage.validation) {
    lines.push("");
    lines.push("## Validation");
    lines.push("");
    lines.push(`- OK: ${executionPackage.validation.ok ? "true" : "false"}`);
    appendList(
      lines,
      executionPackage.validation.blockingFailures,
      (failure) => `${failure.code}: ${failure.message}`,
      "No validation failures."
    );
    appendList(
      lines,
      executionPackage.validation.warnings,
      (warning) => `${warning.code}: ${warning.message}`,
      "No validation warnings."
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function validateExecutionPackage(executionPackage = {}, options = {}) {
  const checks = [];
  const blockingFailures = [];
  const warnings = [];

  const addCheck = (code, passed, message, severity = "error") => {
    const check = {
      code,
      passed: Boolean(passed),
      severity,
      message
    };
    checks.push(check);
    if (!check.passed) {
      if (severity === "warning") {
        warnings.push({ code, message });
      } else {
        blockingFailures.push({ code, message });
      }
    }
  };

  addCheck("package_object_present", isPlainObject(executionPackage), "Execution package must be an object.");
  addCheck("version_supported", executionPackage.version === EXECUTION_PACKAGE_VERSION, "Execution package version is unsupported.");
  addCheck("application_id_present", number(executionPackage.applicationId) > 0, "Application id is missing.");
  addCheck("prepared_at_present", Boolean(text(executionPackage.preparedAt)), "Prepared timestamp is missing.");
  addCheck("status_present", Boolean(text(executionPackage.status)), "Package status is missing.");
  addCheck("safety_no_real_boss_action", executionPackage.noRealBossAction === true, "Package must declare no real BOSS action.");
  addCheck("safety_no_browser_tasks", executionPackage.createsBrowserTasks === false, "Package must not create browser tasks.");
  addCheck("safety_no_browser_task_created", executionPackage.noBrowserTaskCreated === true, "Package must declare no browser task was created.");
  addCheck("safety_contract_present", isPlainObject(executionPackage.safety), "Safety contract is missing.");
  addCheck("safety_disables_send", executionPackage.safety?.clicksBossSend === false, "Safety contract must disable BOSS send.");
  addCheck("safety_disables_upload", executionPackage.safety?.uploadsResume === false, "Safety contract must disable resume upload.");
  addCheck("safety_disables_submit", executionPackage.safety?.submitsApplication === false, "Safety contract must disable application submit.");
  addCheck("real_actions_blocked", BLOCKED_REAL_ACTIONS.every((action) => executionPackage.realActionsBlocked?.includes(action)), "All real BOSS actions must be explicitly blocked.");
  addCheck("job_identity_present", Boolean(text(executionPackage.application?.title) && text(executionPackage.application?.company)), "Job title and company are required.");
  addCheck("job_detail_url_present", Boolean(text(executionPackage.application?.detailUrl)), "BOSS job detail URL is required.");
  addCheck("manual_steps_safe", safeList(executionPackage.manualSteps).every((step) => step.noRealBossAction === true), "Manual steps must be marked noRealBossAction.");

  if (executionPackage.ready) {
    addCheck("ready_status_matches", executionPackage.status === "READY_FOR_MANUAL_EXECUTION", "Ready package must use READY_FOR_MANUAL_EXECUTION status.");
    addCheck("ready_has_no_blockers", safeList(executionPackage.blockers).length === 0, "Ready package must have no blockers.");
    addCheck("ready_resume_approved", executionPackage.resume?.status === "APPROVED", "Ready package must include an approved resume.");
    addCheck("ready_resume_local_approval", executionPackage.resume?.localApproval?.approved === true, "Ready package must include local resume approval.");
    addCheck("ready_resume_docx", Boolean(text(executionPackage.resume?.filePath)) && text(executionPackage.resume?.fileFormat).toLowerCase() === "docx", "Ready package must include a DOCX file path.");
    addCheck("ready_render_qa_ok", executionPackage.resume?.renderQuality?.ok === true, "Ready package must pass DOCX render QA.");
    addCheck("ready_audit_approved", executionPackage.resume?.audit?.recommendation === "approve", "Ready package must include approved AuditAgent result.");
    addCheck("ready_greeting_draft", Boolean(executionPackage.greeting?.messageId) && executionPackage.greeting?.status === "DRAFT", "Ready package must include a greeting draft.");
    addCheck("ready_greeting_safe", executionPackage.greeting?.noRealBossAction === true, "Greeting draft must be marked noRealBossAction.");
    addCheck("ready_send_greeting_dry_run", executionPackage.dryRunEvidence?.sendGreeting?.succeeded === true, "Ready package must include SEND_GREETING dry-run success.");
    addCheck("ready_upload_dry_run", executionPackage.dryRunEvidence?.uploadResume?.ready === true, "Ready package must include UPLOAD_RESUME dry-run evidence.");
    addCheck("ready_submit_dry_run", executionPackage.dryRunEvidence?.submitApplication?.ready === true, "Ready package must include SUBMIT_APPLICATION dry-run evidence.");
    addCheck("ready_submission_readiness", executionPackage.submissionReadiness?.status === "READY_FOR_MANUAL_REVIEW", "Ready package must include submission readiness.");
    addCheck("ready_submission_review", executionPackage.submissionReadinessReview?.decision === "APPROVED_FOR_MANUAL_EXECUTION", "Ready package must include local submission readiness approval.");
  } else {
    addCheck("blocked_has_blockers", safeList(executionPackage.blockers).length > 0, "Blocked package should list blockers.", "warning");
  }

  if (options.requireArchive) {
    addCheck("archive_json_path_present", Boolean(text(executionPackage.archive?.jsonPath)), "Archive JSON path is missing.");
    addCheck("archive_markdown_path_present", Boolean(text(executionPackage.archive?.markdownPath)), "Archive Markdown path is missing.");
    addCheck("archive_json_exists", fileExists(executionPackage.archive?.jsonPath), "Archive JSON file does not exist.");
    addCheck("archive_markdown_exists", fileExists(executionPackage.archive?.markdownPath), "Archive Markdown file does not exist.");
    addCheck("archive_marked_safe", executionPackage.archive?.noRealBossAction === true, "Archive must be marked noRealBossAction.");
    addCheck("archive_json_not_empty", number(executionPackage.archive?.jsonBytes) > 0, "Archive JSON is empty.");
    addCheck("archive_markdown_not_empty", number(executionPackage.archive?.markdownBytes) > 0, "Archive Markdown is empty.");
  }

  return {
    ok: blockingFailures.length === 0,
    version: `${EXECUTION_PACKAGE_VERSION}.validation.v1`,
    checkedAt: new Date().toISOString(),
    requireArchive: Boolean(options.requireArchive),
    checks,
    blockingFailures,
    warnings,
    safetyPassed: blockingFailures.every((failure) => !failure.code.startsWith("safety_") && failure.code !== "real_actions_blocked")
  };
}

function findLatestExecutionPackagePreparedEvent(store, applicationId) {
  if (!store || typeof store.getWorkflowEvents !== "function") {
    return null;
  }
  const events = store.getWorkflowEvents({
    applicationId,
    limit: 50
  }).events || [];
  return events.find((event) => event.eventType === "EXECUTION_PACKAGE_PREPARED") || null;
}

function findLatestExecutionPackageReviewEvent(store, applicationId) {
  if (!store || typeof store.getWorkflowEvents !== "function") {
    return null;
  }
  const events = store.getWorkflowEvents({
    applicationId,
    limit: 80
  }).events || [];
  return events.find((event) => event.eventType === "EXECUTION_PACKAGE_REVIEWED") || null;
}

function findExecutionStepEvents(store, applicationId) {
  if (!store || typeof store.getWorkflowEvents !== "function") {
    return [];
  }
  const events = store.getWorkflowEvents({
    applicationId,
    limit: 120
  }).events || [];
  return events.filter((event) => event.eventType === "EXECUTION_CHECKLIST_STEP_RECORDED");
}

function buildExecutionChecklist({ applicationId, executionPackage, preparedEvent, reviewEvent, stepEvents }) {
  const steps = safeList(executionPackage.manualSteps).map((step) => normalizeChecklistStep(step, stepEvents));
  const packageReview = normalizePackageReview(reviewEvent);
  const completedCount = steps.filter((step) => step.record?.decision === "DONE" || step.record?.decision === "SKIPPED").length;
  const failedCount = steps.filter((step) => step.record?.decision === "FAILED" || step.record?.decision === "BLOCKED").length;
  const canRecordManualProgress = Boolean(
    executionPackage.ready
    && executionPackage.validation?.ok !== false
    && packageReview?.decision === "APPROVED_FOR_MANUAL_EXECUTION"
    && packageReview.accepted === true
  );
  return {
    version: `${EXECUTION_PACKAGE_VERSION}.manual-checklist.v1`,
    applicationId: number(applicationId),
    status: canRecordManualProgress
      ? (completedCount >= steps.length && steps.length ? "COMPLETE" : "READY")
      : "BLOCKED",
    canRecordManualProgress,
    blockedReasons: buildChecklistBlockedReasons(executionPackage, packageReview),
    packageReady: Boolean(executionPackage.ready),
    packageValidationOk: executionPackage.validation?.ok !== false,
    packagePreparedEventId: preparedEvent?.id || null,
    packageReviewEventId: reviewEvent?.id || null,
    packageReview,
    applicationStatus: executionPackage.application?.status || "",
    steps,
    progress: {
      completed: completedCount,
      failed: failedCount,
      total: steps.length
    },
    noRealBossAction: true,
    noBrowserTaskCreated: true,
    createsBrowserTasks: false,
    realActionsBlocked: BLOCKED_REAL_ACTIONS
  };
}

function normalizeChecklistStep(step = {}, stepEvents = []) {
  const action = cleanText(step.action || "");
  const latestEvent = safeList(stepEvents).find((event) => event.metadata?.record?.stepAction === action) || null;
  const record = latestEvent?.metadata?.record || null;
  return {
    order: number(step.order),
    action,
    title: text(step.title),
    detail: text(step.detail),
    noRealBossAction: step.noRealBossAction === true,
    record: record ? {
      decision: text(record.decision),
      note: text(record.note),
      evidenceUrl: text(record.evidenceUrl),
      reviewer: text(record.reviewer),
      recordedAt: record.recordedAt || "",
      workflowEventId: latestEvent.id || null,
      noRealBossAction: record.noRealBossAction === true,
      noBrowserTaskCreated: record.noBrowserTaskCreated === true
    } : null
  };
}

function normalizePackageReview(reviewEvent) {
  const review = reviewEvent?.metadata?.review || null;
  if (!review) {
    return null;
  }
  return {
    decision: text(review.decision),
    accepted: review.accepted === true,
    blocked: review.blocked === true,
    requiresRefresh: review.requiresRefresh === true,
    reviewer: text(review.reviewer),
    reviewedAt: review.reviewedAt || "",
    workflowEventId: reviewEvent.id || null,
    noRealBossAction: review.noRealBossAction === true,
    noBrowserTaskCreated: review.noBrowserTaskCreated === true
  };
}

function buildChecklistBlockedReasons(executionPackage, packageReview) {
  const reasons = [];
  if (!executionPackage.ready) {
    reasons.push("execution_package_not_ready");
  }
  if (executionPackage.validation?.ok === false) {
    reasons.push("execution_package_validation_failed");
  }
  if (!packageReview) {
    reasons.push("execution_package_review_missing");
  } else if (packageReview.decision !== "APPROVED_FOR_MANUAL_EXECUTION" || packageReview.accepted !== true) {
    reasons.push("execution_package_review_not_approved");
  }
  return reasons;
}

function countCompletedChecklistSteps(steps = [], pendingRecord = null) {
  const decisions = new Map();
  for (const step of safeList(steps)) {
    if (step.record?.decision) {
      decisions.set(step.action, step.record.decision);
    }
  }
  if (pendingRecord?.stepAction) {
    decisions.set(pendingRecord.stepAction, pendingRecord.decision);
  }
  return Array.from(decisions.values()).filter((decision) => decision === "DONE" || decision === "SKIPPED").length;
}

function normalizeExecutionPackageReviewDecision(value) {
  const decision = cleanText(value).toUpperCase();
  return EXECUTION_PACKAGE_REVIEW_DECISIONS.has(decision) ? decision : "";
}

function normalizeExecutionStepDecision(value) {
  const decision = cleanText(value).toUpperCase();
  return EXECUTION_STEP_DECISIONS.has(decision) ? decision : "";
}

function appendList(lines, items, mapper, emptyText) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) {
    lines.push(`- ${emptyText}`);
    return;
  }
  for (const item of values) {
    lines.push(`- ${mapper(item)}`);
  }
}

function formatTaskLine(task) {
  if (!task) {
    return "missing";
  }
  return `#${task.id || ""} ${task.status || ""} ${task.statusReason || ""}`.trim();
}

function summarizeLatestTasks(tasks = []) {
  const byType = {};
  for (const task of tasks) {
    const taskType = text(task.taskType).toUpperCase();
    if (!taskType || byType[taskType]) {
      continue;
    }
    byType[taskType] = {
      id: number(task.id),
      taskType,
      status: text(task.status),
      succeeded: task.status === "SUCCEEDED",
      failed: task.status === "FAILED",
      updatedAt: task.updatedAt || task.createdAt || "",
      result: task.result || null
    };
  }
  return byType;
}

function summarizeTaskEvidence(task) {
  if (!task) {
    return null;
  }
  return {
    id: task.id,
    taskType: task.taskType,
    status: task.status,
    succeeded: Boolean(task.succeeded),
    failed: Boolean(task.failed),
    updatedAt: task.updatedAt,
    statusReason: text(task.result?.statusReason || task.result?.reason || "")
  };
}

function isUploadDryRunReady(uploadDryRun) {
  return Boolean(uploadDryRun
    && uploadDryRun.noRealBossAction !== false
    && (uploadDryRun.fileInputUsable || uploadDryRun.uploadActionVisible || uploadDryRun.status === "UPLOAD_DRY_RUN_READY")
    && uploadDryRun.uploaded !== true
    && uploadDryRun.submitted !== true);
}

function isSubmitDryRunReady(submitDryRun) {
  return Boolean(submitDryRun
    && submitDryRun.noRealBossAction !== false
    && (submitDryRun.submitActionVisible || submitDryRun.status === "SUBMIT_DRY_RUN_READY")
    && submitDryRun.clickedSubmit !== true
    && submitDryRun.confirmed !== true
    && submitDryRun.submitted !== true
    && submitDryRun.uploaded !== true);
}

function addBlocker(blockers, condition, code, message) {
  if (condition) {
    blockers.push({ code, message });
  }
}

function normalizeNullableObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function safeList(value) {
  return Array.isArray(value) ? value : [];
}

function fileExists(value) {
  const filePath = text(value);
  return Boolean(filePath && fs.existsSync(filePath));
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanText(value) {
  return text(value);
}

function slugify(value) {
  const normalized = text(value)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "item";
}

module.exports = {
  EXECUTION_PACKAGE_VERSION,
  BLOCKED_REAL_ACTIONS,
  createExecutionPackageService,
  buildLocalExecutionPackage,
  writeExecutionPackageArchive,
  renderExecutionPackageMarkdown,
  validateExecutionPackage
};
