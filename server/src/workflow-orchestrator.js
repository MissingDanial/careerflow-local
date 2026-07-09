const WORKFLOW_VERSION = "m10.workflow-plan.v1";
const MIN_DESCRIPTION_LENGTH = 80;

function planApplicationWorkflow(snapshot = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const application = normalizeObject(snapshot.application);
  const job = normalizeObject(snapshot.job);
  const profile = normalizeObject(snapshot.profile);
  const screening = normalizeNullableObject(snapshot.latestScreening);
  const resumeVersion = normalizeNullableObject(snapshot.latestResumeVersion);
  const resumeFitEvaluation = normalizeNullableObject(snapshot.latestResumeFitEvaluation);
  const resumeClaimVerification = normalizeNullableObject(snapshot.latestResumeClaimVerification);
  const resumeAudit = normalizeNullableObject(snapshot.latestResumeAudit);
  const conversation = normalizeNullableObject(snapshot.latestConversation);
  const greetingDraft = normalizeNullableObject(snapshot.latestGreetingDraft);
  const browserTasks = Array.isArray(snapshot.latestBrowserTasks) ? snapshot.latestBrowserTasks : [];
  const conversationMetadata = normalizeObject(conversation?.metadata);
  const communicationAssessment = normalizeNullableObject(conversationMetadata.communicationAssessment);
  const submissionReadiness = normalizeNullableObject(conversationMetadata.submissionReadiness);
  const submissionReadinessReview = normalizeNullableObject(conversationMetadata.submissionReadinessReview);
  const uploadDryRun = normalizeNullableObject(conversationMetadata.lastUploadDryRun);
  const submitDryRun = normalizeNullableObject(conversationMetadata.lastSubmitDryRun);
  const taskEvidence = summarizeTasks(browserTasks);
  const context = {
    now,
    application,
    job,
    profile,
    screening,
    resumeVersion,
    resumeFitEvaluation,
    resumeClaimVerification,
    resumeAudit,
    conversation,
    greetingDraft,
    communicationAssessment,
    submissionReadiness,
    submissionReadinessReview,
    uploadDryRun,
    submitDryRun,
    taskEvidence
  };

  const stages = [
    planJobReady(context),
    planScreening(context),
    planResumeDraft(context),
    planResumeFitEvaluation(context),
    planResumeClaimVerification(context),
    planResumeAudit(context),
    planLocalApproval(context),
    planGreetingDraft(context),
    planConversationRefresh(context),
    planUploadDryRun(context),
    planSubmitDryRun(context),
    planSubmissionReadiness(context),
    planLocalReadinessReview(context),
    planExecutionPackage(context)
  ];
  const eligibleActions = stages
    .filter((stage) => stage.nextAction)
    .map((stage) => stage.nextAction);
  const blockedReasons = unique(stages.flatMap((stage) => stage.blockedReasons || []));
  const nextAction = eligibleActions.find((action) => action.priority === "high")
    || eligibleActions[0]
    || buildNoopAction(stages);

  return {
    ok: true,
    version: WORKFLOW_VERSION,
    generatedAt: now,
    applicationId: number(application.id),
    applicationStatus: text(application.status),
    sourceKey: text(application.sourceKey || job.sourceKey),
    title: text(application.title || job.title),
    company: text(application.company || job.company),
    noRealBossAction: true,
    noBrowserTaskCreated: true,
    realBossActionsBlocked: ["SEND_GREETING_REAL", "UPLOAD_RESUME_REAL", "SUBMIT_APPLICATION_REAL"],
    stages,
    nextAction,
    eligibleActions,
    blockedReasons,
    evidenceSummary: buildEvidenceSummary(context),
    safety: {
      browserHoldsModelSecrets: false,
      usesPendingProfileFacts: false,
      createsBrowserTasks: false,
      advancesApplicationStatus: false,
      requiresHumanReviewBeforeRealSubmission: true
    }
  };
}

function planJobReady(context) {
  const application = context.application;
  const job = context.job;
  const descriptionLength = number(application.descriptionLength || String(job.description || "").trim().length);
  const hasRequiredFields = Boolean(text(application.title || job.title)
    && text(application.company || job.company)
    && text(application.detailUrl || job.detailUrl));
  const descriptionReady = descriptionLength >= MIN_DESCRIPTION_LENGTH;
  if (hasRequiredFields && descriptionReady) {
    return stage("JOB_READY", "COMPLETE", "Job and JD are available for agent processing.", {
      descriptionLength,
      minDescriptionLength: MIN_DESCRIPTION_LENGTH
    });
  }
  if (text(application.detailUrl || job.detailUrl)) {
    return stage("JOB_READY", "READY", "JD is incomplete; capture detail can be queued from the visible BOSS page.", {
      descriptionLength,
      minDescriptionLength: MIN_DESCRIPTION_LENGTH
    }, action("QUEUE_CAPTURE_DETAIL", "JOB_READY", {
      priority: "high",
      label: "Queue CAPTURE_DETAIL for the visible page",
      method: "POST",
      endpoint: "/api/browser-tasks",
      browserTaskType: "CAPTURE_DETAIL",
      requiresBrowserExecutor: true,
      requiresUserConfirmation: true
    }));
  }
  return stage("JOB_READY", "BLOCKED", "Job is missing a detail URL or required list fields.", {
    descriptionLength,
    minDescriptionLength: MIN_DESCRIPTION_LENGTH
  }, null, ["job_missing_required_fields"]);
}

function planScreening(context) {
  if (!isStageComplete(context, "JOB_READY")) {
    return stage("SCREENING", "WAITING", "Screening waits for a complete JD.");
  }
  if (context.screening) {
    if (context.screening.recommendation === "skip") {
      return stage("SCREENING", "SKIPPED", "Latest screening recommends skipping this application.", {
        screeningId: context.screening.id,
        recommendation: context.screening.recommendation,
        matchScore: context.screening.matchScore,
        riskScore: context.screening.riskScore
      }, null, ["screening_recommendation_skip"]);
    }
    return stage("SCREENING", "COMPLETE", "Latest screening is available.", {
      screeningId: context.screening.id,
      recommendation: context.screening.recommendation,
      matchScore: context.screening.matchScore,
      riskScore: context.screening.riskScore
    });
  }
  return stage("SCREENING", "READY", "Run ScreeningAgent before resume preparation.", {}, action("SCREEN_APPLICATION", "SCREENING", {
    priority: "high",
    label: "Run ScreeningAgent",
    method: "POST",
    endpoint: `/api/applications/${context.application.id}/screen`,
    agentName: "ScreeningAgent",
    noRealBossAction: true
  }));
}

function planResumeDraft(context) {
  if (context.screening?.recommendation === "skip") {
    return stage("RESUME_DRAFT", "SKIPPED", "Skipped by screening.");
  }
  if (!context.screening) {
    return stage("RESUME_DRAFT", "WAITING", "Resume generation waits for screening.");
  }
  if (!hasConfirmedProfileFacts(context.profile)) {
    return stage("RESUME_DRAFT", "BLOCKED", "Confirmed profile facts are required before ResumeAgent can draft.", {
      profile: context.profile
    }, null, ["profile_has_no_confirmed_facts"]);
  }
  if (context.resumeVersion) {
    return stage("RESUME_DRAFT", "COMPLETE", "A resume version exists for this application.", {
      resumeVersionId: context.resumeVersion.id,
      resumeStatus: context.resumeVersion.status,
      versionNumber: context.resumeVersion.versionNumber
    });
  }
  return stage("RESUME_DRAFT", "READY", "Generate a local JD-specific resume version.", {}, action("PREPARE_RESUME", "RESUME_DRAFT", {
    priority: "high",
    label: "Run ResumeAgent and render local DOCX",
    method: "POST",
    endpoint: `/api/applications/${context.application.id}/prepare-resume`,
    agentName: "ResumeAgent",
    noRealBossAction: true
  }));
}

function planResumeAudit(context) {
  if (!context.resumeVersion) {
    return stage("RESUME_AUDIT", "WAITING", "Audit waits for a resume version.");
  }
  if (!context.resumeFitEvaluation || number(context.resumeFitEvaluation.resumeVersionId) !== number(context.resumeVersion.id)) {
    return stage("RESUME_AUDIT", "WAITING", "Audit waits for resume/JD fit evaluation.", {
      resumeVersionId: context.resumeVersion.id
    });
  }
  if (context.resumeFitEvaluation.policy?.canProceedToAudit === false) {
    return stage("RESUME_AUDIT", "WAITING", "Audit waits until blocking resume fit gaps are resolved.", {
      resumeFitEvaluationId: context.resumeFitEvaluation.id,
      coverageScore: context.resumeFitEvaluation.coverageScore,
      fitLevel: context.resumeFitEvaluation.fitLevel,
      blockers: context.resumeFitEvaluation.blockers || []
    });
  }
  if (!context.resumeClaimVerification || number(context.resumeClaimVerification.resumeVersionId) !== number(context.resumeVersion.id)) {
    return stage("RESUME_AUDIT", "WAITING", "Audit waits for ClaimVerifier evidence review.", {
      resumeVersionId: context.resumeVersion.id
    });
  }
  if (context.resumeClaimVerification.policy?.canProceedToAudit === false) {
    return stage("RESUME_AUDIT", "WAITING", "Audit waits until unsupported resume claims are resolved.", {
      resumeClaimVerificationId: context.resumeClaimVerification.id,
      unsupportedCount: context.resumeClaimVerification.unsupportedCount,
      needsUserConfirmationCount: context.resumeClaimVerification.needsUserConfirmationCount,
      recommendations: context.resumeClaimVerification.recommendations || []
    });
  }
  if (!context.resumeAudit || number(context.resumeAudit.resumeVersionId) !== number(context.resumeVersion.id)) {
    return stage("RESUME_AUDIT", "READY", "Audit the latest resume version before local approval.", {
      resumeVersionId: context.resumeVersion.id,
      resumeStatus: context.resumeVersion.status
    }, action("AUDIT_RESUME", "RESUME_AUDIT", {
      priority: "high",
      label: "Run AuditAgent",
      method: "POST",
      endpoint: `/api/resume-versions/${context.resumeVersion.id}/audit`,
      agentName: "AuditAgent",
      noRealBossAction: true
    }));
  }
  if (context.resumeAudit.recommendation === "approve") {
    return stage("RESUME_AUDIT", "COMPLETE", "Latest resume audit approved the version.", {
      resumeAuditId: context.resumeAudit.id,
      resumeVersionId: context.resumeVersion.id,
      recommendation: context.resumeAudit.recommendation,
      jobFitReview: context.resumeAudit.jobFitReview,
      riskFlags: context.resumeAudit.riskFlags || []
    });
  }
  if (context.resumeAudit.recommendation === "revise") {
    return stage("RESUME_AUDIT", "READY", "Audit requires local revision before approval.", {
      resumeAuditId: context.resumeAudit.id,
      recommendation: context.resumeAudit.recommendation,
      riskFlags: context.resumeAudit.riskFlags || []
    }, action("REVISE_RESUME", "RESUME_AUDIT", {
      priority: "high",
      label: "Revise resume and re-audit",
      method: "POST",
      endpoint: `/api/resume-versions/${context.resumeVersion.id}/revise`,
      noRealBossAction: true
    }), ["resume_audit_requires_revision"]);
  }
  return stage("RESUME_AUDIT", "BLOCKED", "Audit blocked the current resume version.", {
    resumeAuditId: context.resumeAudit.id,
    recommendation: context.resumeAudit.recommendation,
    riskFlags: context.resumeAudit.riskFlags || []
  }, null, ["resume_audit_blocked"]);
}

function planResumeFitEvaluation(context) {
  if (!context.resumeVersion) {
    return stage("RESUME_FIT_EVALUATION", "WAITING", "Resume/JD fit evaluation waits for a resume version.");
  }
  if (context.resumeFitEvaluation && number(context.resumeFitEvaluation.resumeVersionId) === number(context.resumeVersion.id)) {
    if (context.resumeFitEvaluation.policy?.canProceedToAudit === false) {
      return stage("RESUME_FIT_EVALUATION", "READY", "Resume fit evaluation found blocking JD coverage gaps.", {
        resumeFitEvaluationId: context.resumeFitEvaluation.id,
        coverageScore: context.resumeFitEvaluation.coverageScore,
        fitLevel: context.resumeFitEvaluation.fitLevel,
        blockers: context.resumeFitEvaluation.blockers || [],
        recommendations: context.resumeFitEvaluation.recommendations || []
      }, action("REVISE_RESUME_FOR_JD_FIT", "RESUME_FIT_EVALUATION", {
        priority: "high",
        label: "Run ResumeRevisionAgent against JD fit gaps",
        method: "POST",
        endpoint: `/api/resume-versions/${context.resumeVersion.id}/revise-from-checks`,
        agentName: "ResumeRevisionAgent",
        noRealBossAction: true
      }), ["resume_fit_requires_revision"]);
    }
    return stage("RESUME_FIT_EVALUATION", "COMPLETE", "Resume/JD fit evaluation passed the current gate.", {
      resumeFitEvaluationId: context.resumeFitEvaluation.id,
      coverageScore: context.resumeFitEvaluation.coverageScore,
      fitLevel: context.resumeFitEvaluation.fitLevel,
      requiresResumeRevision: Boolean(context.resumeFitEvaluation.policy?.requiresResumeRevision),
      recommendations: context.resumeFitEvaluation.recommendations || []
    });
  }
  return stage("RESUME_FIT_EVALUATION", "READY", "Evaluate whether the resume version covers the JD before audit.", {
    resumeVersionId: context.resumeVersion.id
  }, action("EVALUATE_RESUME_FIT", "RESUME_FIT_EVALUATION", {
    priority: "high",
    label: "Run ResumeFitEvaluator",
    method: "POST",
    endpoint: `/api/resume-versions/${context.resumeVersion.id}/evaluate-fit`,
    agentName: "ResumeFitEvaluator",
    noRealBossAction: true
  }));
}

function planResumeClaimVerification(context) {
  if (!context.resumeVersion) {
    return stage("RESUME_CLAIM_VERIFICATION", "WAITING", "Claim verification waits for a resume version.");
  }
  if (!context.resumeFitEvaluation || number(context.resumeFitEvaluation.resumeVersionId) !== number(context.resumeVersion.id)) {
    return stage("RESUME_CLAIM_VERIFICATION", "WAITING", "Claim verification waits for resume/JD fit evaluation.", {
      resumeVersionId: context.resumeVersion.id
    });
  }
  if (context.resumeFitEvaluation.policy?.canProceedToAudit === false) {
    return stage("RESUME_CLAIM_VERIFICATION", "WAITING", "Claim verification waits until blocking JD fit gaps are resolved.", {
      resumeFitEvaluationId: context.resumeFitEvaluation.id,
      blockers: context.resumeFitEvaluation.blockers || []
    });
  }
  if (context.resumeClaimVerification && number(context.resumeClaimVerification.resumeVersionId) === number(context.resumeVersion.id)) {
    if (context.resumeClaimVerification.policy?.canProceedToAudit === false) {
      return stage("RESUME_CLAIM_VERIFICATION", "READY", "ClaimVerifier found unsupported or unconfirmed resume claims.", {
        resumeClaimVerificationId: context.resumeClaimVerification.id,
        unsupportedCount: context.resumeClaimVerification.unsupportedCount,
        needsUserConfirmationCount: context.resumeClaimVerification.needsUserConfirmationCount,
        recommendations: context.resumeClaimVerification.recommendations || []
      }, action("REVISE_OR_CONFIRM_RESUME_CLAIMS", "RESUME_CLAIM_VERIFICATION", {
        priority: "high",
        label: "Run ResumeRevisionAgent or confirm source facts",
        method: "POST",
        endpoint: `/api/resume-versions/${context.resumeVersion.id}/revise-from-checks`,
        agentName: "ResumeRevisionAgent",
        noRealBossAction: true
      }), ["resume_claims_need_review"]);
    }
    return stage("RESUME_CLAIM_VERIFICATION", "COMPLETE", "ClaimVerifier passed the current resume version.", {
      resumeClaimVerificationId: context.resumeClaimVerification.id,
      totalClaims: context.resumeClaimVerification.totalClaims,
      supportedCount: context.resumeClaimVerification.supportedCount,
      weakCount: context.resumeClaimVerification.weakCount,
      unsupportedCount: context.resumeClaimVerification.unsupportedCount,
      needsUserConfirmationCount: context.resumeClaimVerification.needsUserConfirmationCount,
      recommendations: context.resumeClaimVerification.recommendations || []
    });
  }
  return stage("RESUME_CLAIM_VERIFICATION", "READY", "Verify resume claims against local profile evidence before audit.", {
    resumeVersionId: context.resumeVersion.id
  }, action("VERIFY_RESUME_CLAIMS", "RESUME_CLAIM_VERIFICATION", {
    priority: "high",
    label: "Run ClaimVerifier",
    method: "POST",
    endpoint: `/api/resume-versions/${context.resumeVersion.id}/verify-claims`,
    agentName: "ClaimVerifier",
    noRealBossAction: true
  }));
}

function planLocalApproval(context) {
  if (!context.resumeVersion) {
    return stage("LOCAL_APPROVAL", "WAITING", "Local approval waits for an audited resume.");
  }
  if (context.resumeVersion.status !== "APPROVED") {
    return stage("LOCAL_APPROVAL", "WAITING", "Only APPROVED resume versions can be locally approved.", {
      resumeStatus: context.resumeVersion.status
    });
  }
  if (context.resumeVersion.metadata?.localApproval?.approved) {
    return stage("LOCAL_APPROVAL", "COMPLETE", "Resume version has local approval.", {
      resumeVersionId: context.resumeVersion.id,
      approvedAt: context.resumeVersion.metadata.localApproval.approvedAt || ""
    });
  }
  return stage("LOCAL_APPROVAL", "READY", "Approve the audited resume locally before greeting.", {
    resumeVersionId: context.resumeVersion.id
  }, action("APPROVE_RESUME_LOCAL", "LOCAL_APPROVAL", {
    priority: "high",
    label: "Local resume approval",
    method: "POST",
    endpoint: `/api/resume-versions/${context.resumeVersion.id}/approve-local`,
    requiresUserConfirmation: true,
    noRealBossAction: true
  }));
}

function planGreetingDraft(context) {
  if (!context.resumeVersion?.metadata?.localApproval?.approved) {
    return stage("GREETING_DRAFT", "WAITING", "Greeting draft waits for local resume approval.");
  }
  if (context.greetingDraft) {
    return stage("GREETING_DRAFT", "COMPLETE", "MessageAgent greeting draft exists.", {
      messageId: context.greetingDraft.id,
      messageStatus: context.greetingDraft.status,
      actionMode: context.greetingDraft.metadata?.actionMode || ""
    });
  }
  return stage("GREETING_DRAFT", "READY", "Prepare a BOSS greeting draft and dry-run browser task.", {}, action("PREPARE_GREETING", "GREETING_DRAFT", {
    priority: "high",
    label: "Run MessageAgent",
    method: "POST",
    endpoint: `/api/applications/${context.application.id}/prepare-greeting`,
    agentName: "MessageAgent",
    noRealBossAction: true,
    createsDryRunTask: true
  }));
}

function planConversationRefresh(context) {
  if (!context.greetingDraft) {
    return stage("CONVERSATION_REFRESH", "WAITING", "Conversation refresh waits for a greeting draft.");
  }
  if (!context.taskEvidence.SEND_GREETING?.succeeded) {
    return stage("CONVERSATION_REFRESH", "READY", "Run SEND_GREETING dry-run before reading conversation state.", {
      latestSendGreetingTask: context.taskEvidence.SEND_GREETING || null
    }, action("RUN_SEND_GREETING_DRY_RUN", "CONVERSATION_REFRESH", {
      priority: "medium",
      label: "Run SEND_GREETING dry-run in the open BOSS page",
      browserTaskType: "SEND_GREETING",
      requiresBrowserExecutor: true,
      requiresUserConfirmation: true,
      noRealBossAction: true
    }));
  }
  if (context.communicationAssessment?.state && context.communicationAssessment.state !== "CONVERSATION_UNKNOWN") {
    return stage("CONVERSATION_REFRESH", "COMPLETE", "Conversation state has read-only assessment.", {
      conversationId: context.conversation?.id || null,
      communicationState: context.communicationAssessment.state,
      resumeRequested: Boolean(context.communicationAssessment.resumeRequested)
    });
  }
  return stage("CONVERSATION_REFRESH", "READY", "Refresh conversation or resume unlock state from the visible BOSS page.", {
    conversationId: context.conversation?.id || null
  }, action("QUEUE_REFRESH_CONVERSATION", "CONVERSATION_REFRESH", {
    priority: "medium",
    label: "Queue REFRESH_CONVERSATION",
    method: "POST",
    endpoint: "/api/browser-tasks",
    browserTaskType: "REFRESH_CONVERSATION",
    requiresBrowserExecutor: true,
    requiresUserConfirmation: true,
    noRealBossAction: true
  }));
}

function planUploadDryRun(context) {
  if (isUploadDryRunReady(context.uploadDryRun)) {
    return stage("UPLOAD_DRY_RUN", "COMPLETE", "Upload entry dry-run evidence is available.", {
      uploadDryRun: context.uploadDryRun
    });
  }
  const communicationState = text(context.communicationAssessment?.state);
  const resumeRequested = Boolean(context.communicationAssessment?.resumeRequested);
  const resumeUnlocked = Boolean(context.communicationAssessment?.resumeUnlocked
    || context.application.status === "RESUME_UNLOCKED"
    || context.conversation?.metadata?.lastResult?.resumeUnlock?.unlocked);
  if (resumeRequested || resumeUnlocked || communicationState === "RESUME_REQUESTED") {
    return stage("UPLOAD_DRY_RUN", "READY", "Run upload entry dry-run after resume request or unlock evidence.", {
      communicationState,
      resumeRequested,
      resumeUnlocked
    }, action("QUEUE_UPLOAD_RESUME_DRY_RUN", "UPLOAD_DRY_RUN", {
      priority: "high",
      label: "Queue UPLOAD_RESUME dry-run",
      method: "POST",
      endpoint: "/api/browser-tasks",
      browserTaskType: "UPLOAD_RESUME",
      requiresBrowserExecutor: true,
      requiresUserConfirmation: true,
      noRealBossAction: true
    }));
  }
  return stage("UPLOAD_DRY_RUN", "WAITING", "Upload dry-run waits for resume request or unlock evidence.", {
    communicationState: communicationState || "UNKNOWN"
  });
}

function planSubmitDryRun(context) {
  if (isSubmitDryRunReady(context.submitDryRun)) {
    return stage("SUBMIT_DRY_RUN", "COMPLETE", "Submit entry dry-run evidence is available.", {
      submitDryRun: context.submitDryRun
    });
  }
  if (isUploadDryRunReady(context.uploadDryRun)) {
    return stage("SUBMIT_DRY_RUN", "READY", "Run submit entry dry-run after upload entry is visible.", {}, action("QUEUE_SUBMIT_APPLICATION_DRY_RUN", "SUBMIT_DRY_RUN", {
      priority: "high",
      label: "Queue SUBMIT_APPLICATION dry-run",
      method: "POST",
      endpoint: "/api/browser-tasks",
      browserTaskType: "SUBMIT_APPLICATION",
      requiresBrowserExecutor: true,
      requiresUserConfirmation: true,
      noRealBossAction: true
    }));
  }
  return stage("SUBMIT_DRY_RUN", "WAITING", "Submit dry-run waits for upload dry-run evidence.");
}

function planSubmissionReadiness(context) {
  if (!context.submissionReadiness?.status) {
    if (isUploadDryRunReady(context.uploadDryRun) && isSubmitDryRunReady(context.submitDryRun)) {
      return stage("SUBMISSION_READINESS", "READY", "Dry-run evidence exists; re-run readiness assessment by refreshing dry-run evidence.", {}, action("REFRESH_SUBMISSION_READINESS", "SUBMISSION_READINESS", {
        priority: "medium",
        label: "Refresh submission readiness evidence",
        noRealBossAction: true
      }));
    }
    return stage("SUBMISSION_READINESS", "WAITING", "Submission readiness waits for upload and submit dry-runs.");
  }
  if (context.submissionReadiness.status === "READY_FOR_MANUAL_REVIEW") {
    return stage("SUBMISSION_READINESS", "COMPLETE", "Submission readiness is ready for local review.", {
      submissionReadiness: context.submissionReadiness
    });
  }
  if (context.submissionReadiness.status === "INSUFFICIENT_EVIDENCE") {
    return stage("SUBMISSION_READINESS", "READY", "Submission readiness needs more browser evidence.", {
      submissionReadiness: context.submissionReadiness
    }, action("REFRESH_SUBMISSION_EVIDENCE", "SUBMISSION_READINESS", {
      priority: "high",
      label: "Refresh upload or submit dry-run evidence",
      noRealBossAction: true,
      requiresBrowserExecutor: true
    }), ["submission_readiness_insufficient_evidence"]);
  }
  return stage("SUBMISSION_READINESS", "BLOCKED", "Submission readiness gate is blocked.", {
    submissionReadiness: context.submissionReadiness
  }, null, ["submission_readiness_blocked"]);
}

function planLocalReadinessReview(context) {
  if (!context.submissionReadiness?.status) {
    return stage("LOCAL_READINESS_REVIEW", "WAITING", "Local readiness review waits for submission readiness.");
  }
  if (context.submissionReadiness.status !== "READY_FOR_MANUAL_REVIEW") {
    return stage("LOCAL_READINESS_REVIEW", "WAITING", "Only READY_FOR_MANUAL_REVIEW can be approved locally.", {
      readinessStatus: context.submissionReadiness.status
    });
  }
  if (context.submissionReadinessReview?.decision === "APPROVED_FOR_MANUAL_EXECUTION") {
    return stage("LOCAL_READINESS_REVIEW", "COMPLETE", "Local readiness review approved manual execution.", {
      review: context.submissionReadinessReview
    });
  }
  if (context.submissionReadinessReview?.decision === "BLOCKED") {
    return stage("LOCAL_READINESS_REVIEW", "BLOCKED", "Local readiness review blocked execution.", {
      review: context.submissionReadinessReview
    }, null, ["submission_readiness_review_blocked"]);
  }
  if (context.submissionReadinessReview?.decision === "REFRESH_REQUIRED") {
    return stage("LOCAL_READINESS_REVIEW", "READY", "Local readiness review requires refreshed evidence.", {
      review: context.submissionReadinessReview
    }, action("REFRESH_REQUIRED_BY_LOCAL_REVIEW", "LOCAL_READINESS_REVIEW", {
      priority: "high",
      label: "Refresh browser dry-run evidence",
      noRealBossAction: true,
      requiresBrowserExecutor: true
    }), ["submission_readiness_review_refresh_required"]);
  }
  return stage("LOCAL_READINESS_REVIEW", "READY", "Review submission readiness locally.", {
    readinessStatus: context.submissionReadiness.status
  }, action("REVIEW_SUBMISSION_READINESS", "LOCAL_READINESS_REVIEW", {
    priority: "high",
    label: "Review submission readiness locally",
    method: "POST",
    endpoint: `/api/submission-readiness/${context.application.id}/review`,
    requiresUserConfirmation: true,
    noRealBossAction: true
  }));
}

function planExecutionPackage(context) {
  if (context.submissionReadinessReview?.decision === "APPROVED_FOR_MANUAL_EXECUTION") {
    return stage("EXECUTION_PACKAGE", "READY", "Manual execution package can be prepared; real upload/submit remains locked.", {
      review: context.submissionReadinessReview
    }, action("PREPARE_MANUAL_EXECUTION_PACKAGE", "EXECUTION_PACKAGE", {
      priority: "medium",
      label: "Prepare local manual execution package",
      noRealBossAction: true,
      blocksRealUpload: true,
      blocksRealSubmit: true
    }));
  }
  return stage("EXECUTION_PACKAGE", "WAITING", "Execution package waits for local readiness approval.");
}

function stage(id, status, summary, evidence = {}, nextAction = null, blockedReasons = []) {
  return {
    id,
    status,
    summary,
    evidence,
    nextAction,
    blockedReasons: unique(blockedReasons)
  };
}

function action(actionName, stageId, overrides = {}) {
  return {
    action: actionName,
    stage: stageId,
    priority: "medium",
    requiresUserConfirmation: false,
    requiresBrowserExecutor: false,
    noRealBossAction: true,
    createsRealBrowserTask: false,
    blockedTaskTypes: ["UPLOAD_RESUME_REAL", "SUBMIT_APPLICATION_REAL"],
    ...overrides
  };
}

function isStageComplete(context, stageId) {
  if (stageId === "JOB_READY") {
    const descriptionLength = number(context.application.descriptionLength || String(context.job.description || "").trim().length);
    return Boolean(text(context.application.title || context.job.title)
      && text(context.application.company || context.job.company)
      && text(context.application.detailUrl || context.job.detailUrl)
      && descriptionLength >= MIN_DESCRIPTION_LENGTH);
  }
  return false;
}

function buildNoopAction(stages) {
  const blocked = stages.find((stage) => stage.status === "BLOCKED");
  if (blocked) {
    return action("RESOLVE_BLOCKER", blocked.id, {
      priority: "high",
      label: "Resolve workflow blocker",
      blockedReasons: blocked.blockedReasons || []
    });
  }
  return action("NO_ELIGIBLE_ACTION", "WORKFLOW", {
    priority: "low",
    label: "No eligible action",
    blockedTaskTypes: ["SEND_GREETING_REAL", "UPLOAD_RESUME_REAL", "SUBMIT_APPLICATION_REAL"]
  });
}

function buildEvidenceSummary(context) {
  return {
    jobDescriptionLength: number(context.application.descriptionLength || String(context.job.description || "").trim().length),
    applicationStatus: text(context.application.status),
    screening: context.screening ? {
      id: context.screening.id,
      recommendation: context.screening.recommendation,
      matchScore: context.screening.matchScore,
      riskScore: context.screening.riskScore
    } : null,
    resumeVersion: context.resumeVersion ? {
      id: context.resumeVersion.id,
      status: context.resumeVersion.status,
      localApproval: Boolean(context.resumeVersion.metadata?.localApproval?.approved)
    } : null,
    resumeFitEvaluation: context.resumeFitEvaluation ? {
      id: context.resumeFitEvaluation.id,
      resumeVersionId: context.resumeFitEvaluation.resumeVersionId,
      coverageScore: context.resumeFitEvaluation.coverageScore,
      fitLevel: context.resumeFitEvaluation.fitLevel,
      requiresResumeRevision: Boolean(context.resumeFitEvaluation.policy?.requiresResumeRevision)
    } : null,
    resumeClaimVerification: context.resumeClaimVerification ? {
      id: context.resumeClaimVerification.id,
      resumeVersionId: context.resumeClaimVerification.resumeVersionId,
      truthfulnessPassed: Boolean(context.resumeClaimVerification.truthfulnessPassed),
      supportedCount: context.resumeClaimVerification.supportedCount,
      unsupportedCount: context.resumeClaimVerification.unsupportedCount,
      needsUserConfirmationCount: context.resumeClaimVerification.needsUserConfirmationCount
    } : null,
    resumeAudit: context.resumeAudit ? {
      id: context.resumeAudit.id,
      resumeVersionId: context.resumeAudit.resumeVersionId,
      recommendation: context.resumeAudit.recommendation,
      jobFitReview: context.resumeAudit.jobFitReview
    } : null,
    conversation: context.conversation ? {
      id: context.conversation.id,
      status: context.conversation.status,
      communicationState: context.communicationAssessment?.state || ""
    } : null,
    dryRuns: {
      sendGreetingSucceeded: Boolean(context.taskEvidence.SEND_GREETING?.succeeded),
      uploadReady: isUploadDryRunReady(context.uploadDryRun),
      submitReady: isSubmitDryRunReady(context.submitDryRun)
    },
    submissionReadiness: context.submissionReadiness ? {
      status: context.submissionReadiness.status,
      reason: context.submissionReadiness.reason || ""
    } : null,
    submissionReadinessReview: context.submissionReadinessReview ? {
      decision: context.submissionReadinessReview.decision,
      reviewedAt: context.submissionReadinessReview.reviewedAt || ""
    } : null
  };
}

function summarizeTasks(tasks) {
  const byType = {};
  for (const task of tasks) {
    const taskType = text(task.taskType).toUpperCase();
    if (!taskType || byType[taskType]) {
      continue;
    }
    byType[taskType] = {
      id: task.id,
      status: task.status,
      succeeded: task.status === "SUCCEEDED",
      failed: task.status === "FAILED",
      updatedAt: task.updatedAt || task.createdAt || "",
      result: task.result || null
    };
  }
  return byType;
}

function hasConfirmedProfileFacts(profile) {
  return number(profile.confirmedExperienceCount || profile.experienceCount) > 0
    || number(profile.skillCount) > 0;
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

function normalizeNullableObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function unique(values) {
  return Array.from(new Set((values || []).map(text).filter(Boolean)));
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

module.exports = {
  WORKFLOW_VERSION,
  planApplicationWorkflow
};
