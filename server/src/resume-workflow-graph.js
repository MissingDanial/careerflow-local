const path = require("path");
const { Annotation, END, START, StateGraph } = require("@langchain/langgraph");
const { runScreeningAgent } = require("./screening-agent");
const { runResumeAgent } = require("./resume-agent");
const { runResumeFitEvaluator } = require("./resume-fit-evaluator");
const { runClaimVerifier } = require("./claim-verifier");
const { runResumeRevisionAgent } = require("./resume-revision-agent");
const { runAuditAgent } = require("./audit-agent");
const { renderResumeDocx } = require("./document-renderer");

const GRAPH_VERSION = "m10.4.resume-workflow-graph.v1";
const GRAPH_AGENT_NAME = "ResumeWorkflowGraph";
const DEFAULT_MAX_REVISIONS = 1;

const ResumeWorkflowState = Annotation.Root({
  store: Annotation({ reducer: (_left, right) => right, default: () => null }),
  applicationId: Annotation({ reducer: (_left, right) => right, default: () => 0 }),
  mode: Annotation({ reducer: (_left, right) => right, default: () => "rules" }),
  modelConfig: Annotation({ reducer: (_left, right) => right, default: () => ({}) }),
  renderDocx: Annotation({ reducer: (_left, right) => right, default: () => true }),
  renderOptions: Annotation({ reducer: (_left, right) => right, default: () => ({}) }),
  userRules: Annotation({ reducer: (_left, right) => right, default: () => ({}) }),
  maxRevisions: Annotation({ reducer: (_left, right) => right, default: () => DEFAULT_MAX_REVISIONS }),
  revisionCount: Annotation({ reducer: (_left, right) => right, default: () => 0 }),
  application: Annotation({ reducer: (_left, right) => right, default: () => ({}) }),
  job: Annotation({ reducer: (_left, right) => right, default: () => ({}) }),
  profile: Annotation({ reducer: (_left, right) => right, default: () => ({}) }),
  screening: Annotation({ reducer: (_left, right) => right, default: () => null }),
  resumeVersion: Annotation({ reducer: (_left, right) => right, default: () => null }),
  resumeFitEvaluation: Annotation({ reducer: (_left, right) => right, default: () => null }),
  resumeClaimVerification: Annotation({ reducer: (_left, right) => right, default: () => null }),
  resumeAudit: Annotation({ reducer: (_left, right) => right, default: () => null }),
  rendered: Annotation({ reducer: (_left, right) => right, default: () => null }),
  shouldRevise: Annotation({ reducer: (_left, right) => Boolean(right), default: () => false }),
  stopReason: Annotation({ reducer: (_left, right) => right, default: () => "" }),
  nodeEvents: Annotation({ reducer: (left, right) => left.concat(right), default: () => [] }),
  errors: Annotation({ reducer: (left, right) => left.concat(right), default: () => [] })
});

async function runResumeWorkflowGraph(input = {}, options = {}) {
  const store = input.store || options.store;
  if (!store) {
    throw workflowError("RESUME_WORKFLOW_STORE_REQUIRED", "A JobStore instance is required for ResumeWorkflowGraph.");
  }
  const applicationId = positiveInteger(input.applicationId || options.applicationId);
  if (!applicationId) {
    throw workflowError("RESUME_WORKFLOW_APPLICATION_REQUIRED", "A valid application id is required.");
  }

  recordWorkflowEvent(store, {
    applicationId,
    eventType: "RESUME_WORKFLOW_GRAPH_STARTED",
    severity: "info",
    status: "RUNNING",
    progressCurrent: 0,
    progressTotal: 7,
    message: `ResumeWorkflowGraph started for application ${applicationId}.`,
    metadata: {
      graphVersion: GRAPH_VERSION,
      noRealBossAction: true,
      noBrowserTaskCreated: true
    }
  });

  const graph = buildResumeWorkflowGraph();
  try {
    const state = await graph.invoke({
      store,
      applicationId,
      mode: normalizeMode(input.mode || options.mode || "rules"),
      modelConfig: input.modelConfig || options.modelConfig || {},
      renderDocx: input.renderDocx ?? options.renderDocx ?? true,
      renderOptions: input.renderOptions || options.renderOptions || {},
      userRules: input.userRules || options.userRules || {},
      maxRevisions: Math.max(0, Math.min(3, Number(input.maxRevisions ?? options.maxRevisions ?? DEFAULT_MAX_REVISIONS) || 0))
    }, {
      recursionLimit: 20
    });
    const ok = Boolean(state.resumeVersion && state.resumeAudit);
    recordWorkflowEvent(store, {
      applicationId,
      eventType: "RESUME_WORKFLOW_GRAPH_COMPLETED",
      severity: ok ? "info" : "warning",
      status: ok ? "SUCCEEDED" : "FAILED",
      progressCurrent: 7,
      progressTotal: 7,
      message: ok
        ? `ResumeWorkflowGraph completed for application ${applicationId}.`
        : `ResumeWorkflowGraph stopped for application ${applicationId}: ${state.stopReason || "unknown"}.`,
      errorCode: ok ? "" : "RESUME_WORKFLOW_INCOMPLETE",
      errorMessage: ok ? "" : state.stopReason || "Resume workflow did not produce an audited resume.",
      metadata: summarizeGraphState(state)
    });
    return {
      ok,
      storage: "sqlite",
      graphVersion: GRAPH_VERSION,
      applicationId,
      stopReason: state.stopReason || "",
      revisionCount: state.revisionCount || 0,
      nodeEvents: state.nodeEvents || [],
      errors: state.errors || [],
      screening: state.screening || null,
      resumeVersion: state.resumeVersion || null,
      resumeFitEvaluation: state.resumeFitEvaluation || null,
      resumeClaimVerification: state.resumeClaimVerification || null,
      resumeAudit: state.resumeAudit || null,
      rendered: state.rendered || null
    };
  } catch (error) {
    recordWorkflowEvent(store, {
      applicationId,
      eventType: "RESUME_WORKFLOW_GRAPH_FAILED",
      severity: "error",
      status: "FAILED",
      progressCurrent: 0,
      progressTotal: 7,
      message: `ResumeWorkflowGraph failed for application ${applicationId}.`,
      errorCode: error.code || "RESUME_WORKFLOW_GRAPH_FAILED",
      errorMessage: error.message || String(error),
      metadata: {
        graphVersion: GRAPH_VERSION,
        error: structuredError(error),
        noRealBossAction: true,
        noBrowserTaskCreated: true
      }
    });
    throw error;
  }
}

function buildResumeWorkflowGraph() {
  return new StateGraph(ResumeWorkflowState)
    .addNode("load_context", withNodeTelemetry("load_context", loadContextNode))
    .addNode("screen_application", withNodeTelemetry("screen_application", screenApplicationNode))
    .addNode("prepare_resume", withNodeTelemetry("prepare_resume", prepareResumeNode))
    .addNode("evaluate_fit", withNodeTelemetry("evaluate_fit", evaluateFitNode))
    .addNode("verify_claims", withNodeTelemetry("verify_claims", verifyClaimsNode))
    .addNode("decide_revision", withNodeTelemetry("decide_revision", decideRevisionNode))
    .addNode("revise_resume", withNodeTelemetry("revise_resume", reviseResumeNode))
    .addNode("audit_resume", withNodeTelemetry("audit_resume", auditResumeNode))
    .addEdge(START, "load_context")
    .addEdge("load_context", "screen_application")
    .addConditionalEdges("screen_application", routeAfterScreening, {
      prepare_resume: "prepare_resume",
      [END]: END
    })
    .addEdge("prepare_resume", "evaluate_fit")
    .addEdge("evaluate_fit", "verify_claims")
    .addEdge("verify_claims", "decide_revision")
    .addConditionalEdges("decide_revision", routeAfterRevisionDecision, {
      revise_resume: "revise_resume",
      audit_resume: "audit_resume",
      [END]: END
    })
    .addEdge("revise_resume", "evaluate_fit")
    .addEdge("audit_resume", END)
    .compile();
}

function withNodeTelemetry(nodeName, handler) {
  return async (state) => {
    const startedAt = new Date().toISOString();
    try {
      recordWorkflowEvent(state.store, {
        applicationId: state.applicationId,
        eventType: "RESUME_WORKFLOW_GRAPH_NODE_STARTED",
        severity: "debug",
        status: "RUNNING",
        message: `${GRAPH_AGENT_NAME} node ${nodeName} started.`,
        metadata: {
          graphVersion: GRAPH_VERSION,
          nodeName,
          startedAt,
          revisionCount: state.revisionCount || 0
        }
      });
      const update = await handler(state);
      const finishedAt = new Date().toISOString();
      recordWorkflowEvent(state.store, {
        applicationId: state.applicationId,
        eventType: "RESUME_WORKFLOW_GRAPH_NODE_SUCCEEDED",
        severity: "debug",
        status: "SUCCEEDED",
        message: `${GRAPH_AGENT_NAME} node ${nodeName} succeeded.`,
        metadata: {
          graphVersion: GRAPH_VERSION,
          nodeName,
          startedAt,
          finishedAt,
          summary: summarizeNodeUpdate(update)
        }
      });
      return {
        ...update,
        nodeEvents: [{
          nodeName,
          status: "SUCCEEDED",
          startedAt,
          finishedAt,
          summary: summarizeNodeUpdate(update)
        }]
      };
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const structured = structuredError(error);
      recordWorkflowEvent(state.store, {
        applicationId: state.applicationId,
        eventType: "RESUME_WORKFLOW_GRAPH_NODE_FAILED",
        severity: "error",
        status: "FAILED",
        message: `${GRAPH_AGENT_NAME} node ${nodeName} failed.`,
        errorCode: structured.code,
        errorMessage: structured.message,
        metadata: {
          graphVersion: GRAPH_VERSION,
          nodeName,
          startedAt,
          finishedAt,
          error: structured
        }
      });
      error.nodeName = nodeName;
      throw error;
    }
  };
}

async function loadContextNode(state) {
  const input = state.store.getApplicationScreeningInput(state.applicationId, {
    userRules: state.userRules || {}
  });
  return {
    application: input.application,
    job: input.job,
    profile: input.profile,
    stopReason: ""
  };
}

async function screenApplicationNode(state) {
  const latest = state.store.getLatestScreeningForApplication(state.applicationId);
  if (latest && !state.userRules?.forceRescreen) {
    return {
      screening: latest,
      stopReason: latest.recommendation === "skip" ? "screening_recommendation_skip" : ""
    };
  }
  const screeningInput = state.store.getApplicationScreeningInput(state.applicationId, {
    userRules: state.userRules || {}
  });
  const agentRun = state.store.startAgentRun({
    agentName: "ScreeningAgent",
    applicationId: state.applicationId,
    step: "langgraph_score_job",
    provider: state.mode,
    input: {
      application: screeningInput.application,
      job: screeningInput.job,
      profileSummary: summarizeProfileForTrace(screeningInput.profile),
      userRules: screeningInput.userRules,
      graphVersion: GRAPH_VERSION
    }
  });
  try {
    const agentResult = await runScreeningAgent(screeningInput, {
      mode: state.mode,
      modelConfig: state.modelConfig || {}
    });
    const finishedRun = state.store.finishAgentRun(agentRun.id, {
      status: "SUCCEEDED",
      provider: agentResult.provider,
      output: {
        result: agentResult.result,
        fallbackUsed: agentResult.fallbackUsed,
        fallbackReason: agentResult.fallbackReason || "",
        modelConfig: agentResult.modelConfig || {}
      },
      fallbackUsed: agentResult.fallbackUsed
    });
    const saved = state.store.createScreening({
      applicationId: state.applicationId,
      agentRunId: finishedRun.id,
      provider: agentResult.provider,
      result: agentResult.result,
      metadata: {
        generatedBy: GRAPH_AGENT_NAME,
        graphVersion: GRAPH_VERSION,
        fallbackUsed: agentResult.fallbackUsed,
        fallbackReason: agentResult.fallbackReason || "",
        fallbackMessage: agentResult.fallbackMessage || "",
        modelConfig: agentResult.modelConfig || {}
      }
    });
    return {
      screening: saved.screening,
      stopReason: saved.screening.recommendation === "skip" ? "screening_recommendation_skip" : ""
    };
  } catch (error) {
    state.store.finishAgentRun(agentRun.id, {
      status: "FAILED",
      provider: state.mode,
      output: { error: structuredError(error) },
      errorCode: error.code || "SCREENING_AGENT_FAILED",
      errorMessage: error.message || String(error)
    });
    throw error;
  }
}

function routeAfterScreening(state) {
  return state.stopReason === "screening_recommendation_skip" ? END : "prepare_resume";
}

async function prepareResumeNode(state) {
  const resumeInput = state.store.getApplicationResumeInput(state.applicationId, {
    screeningId: state.screening?.id || "",
    userRules: state.userRules || {}
  });
  const agentRun = state.store.startAgentRun({
    agentName: "ResumeAgent",
    applicationId: state.applicationId,
    step: "langgraph_prepare_resume",
    provider: state.mode,
    input: {
      application: resumeInput.application,
      job: resumeInput.job,
      screening: resumeInput.screening,
      profileSummary: summarizeProfileForTrace(resumeInput.profile),
      graphVersion: GRAPH_VERSION
    }
  });
  try {
    const agentResult = runResumeAgent(resumeInput, {
      mode: state.mode
    });
    const finishedRun = state.store.finishAgentRun(agentRun.id, {
      status: "SUCCEEDED",
      provider: agentResult.provider,
      output: {
        result: agentResult.result,
        fallbackUsed: agentResult.fallbackUsed
      },
      fallbackUsed: agentResult.fallbackUsed
    });
    const saved = state.store.createResumeVersion({
      applicationId: state.applicationId,
      screeningId: resumeInput.screening.id,
      agentRunId: finishedRun.id,
      provider: agentResult.provider,
      result: withRenderMetadata(agentResult.result, state.renderOptions),
      metadata: {
        generatedBy: GRAPH_AGENT_NAME,
        graphVersion: GRAPH_VERSION,
        nodeName: "prepare_resume",
        mode: state.mode
      }
    });
    const rendered = await maybeRenderResume(state, saved.resumeVersion);
    return {
      resumeVersion: rendered.resumeVersion,
      rendered: rendered.rendered,
      resumeFitEvaluation: null,
      resumeClaimVerification: null,
      resumeAudit: null,
      shouldRevise: false,
      stopReason: ""
    };
  } catch (error) {
    state.store.finishAgentRun(agentRun.id, {
      status: "FAILED",
      provider: state.mode,
      output: { error: structuredError(error) },
      errorCode: error.code || "RESUME_AGENT_FAILED",
      errorMessage: error.message || String(error)
    });
    throw error;
  }
}

async function evaluateFitNode(state) {
  const resumeVersion = assertResumeVersion(state.resumeVersion);
  const resumeInput = state.store.getApplicationResumeInput(resumeVersion.applicationId, {
    screeningId: resumeVersion.screeningId || ""
  });
  const agentRun = state.store.startAgentRun({
    agentName: "ResumeFitEvaluator",
    applicationId: resumeVersion.applicationId,
    step: "langgraph_evaluate_resume_fit",
    provider: state.mode,
    input: {
      resumeVersionId: resumeVersion.id,
      application: resumeInput.application,
      job: resumeInput.job,
      resumeFields: resumeVersion.resumeFields,
      graphVersion: GRAPH_VERSION
    }
  });
  try {
    const agentResult = runResumeFitEvaluator({
      application: resumeInput.application,
      job: resumeInput.job,
      resumeVersion
    }, {
      mode: state.mode
    });
    const finishedRun = state.store.finishAgentRun(agentRun.id, {
      status: "SUCCEEDED",
      provider: agentResult.provider,
      output: {
        result: agentResult.result,
        fallbackUsed: agentResult.fallbackUsed
      },
      fallbackUsed: agentResult.fallbackUsed
    });
    const saved = state.store.createResumeFitEvaluation({
      resumeVersionId: resumeVersion.id,
      agentRunId: finishedRun.id,
      provider: agentResult.provider,
      result: agentResult.result,
      metadata: {
        evaluatedBy: GRAPH_AGENT_NAME,
        graphVersion: GRAPH_VERSION,
        mode: state.mode,
        revisionCount: state.revisionCount || 0
      }
    });
    state.store.recordWorkflowEvent({
      applicationId: resumeVersion.applicationId,
      sourceType: "agent_run",
      sourceId: finishedRun.id,
      eventType: "RESUME_FIT_EVALUATED",
      severity: saved.resumeFitEvaluation.blockers.length || saved.resumeFitEvaluation.coverageScore < 55 ? "warning" : "info",
      status: "SUCCEEDED",
      progressCurrent: 1,
      progressTotal: 1,
      message: `Resume fit evaluated by LangGraph for resume version ${resumeVersion.id}: ${saved.resumeFitEvaluation.coverageScore}/100.`,
      errorCode: saved.resumeFitEvaluation.blockers.length ? "RESUME_FIT_HAS_BLOCKERS" : "",
      errorMessage: saved.resumeFitEvaluation.blockers.length ? `${saved.resumeFitEvaluation.blockers.length} must-have JD requirement(s) are missing.` : "",
      metadata: {
        graphVersion: GRAPH_VERSION,
        resumeVersionId: resumeVersion.id,
        resumeFitEvaluationId: saved.resumeFitEvaluation.id,
        noRealBossAction: true,
        noApplicationStatusChange: true
      }
    });
    return {
      resumeFitEvaluation: saved.resumeFitEvaluation,
      resumeClaimVerification: null,
      resumeAudit: null
    };
  } catch (error) {
    state.store.finishAgentRun(agentRun.id, {
      status: "FAILED",
      provider: state.mode,
      output: { error: structuredError(error) },
      errorCode: error.code || "RESUME_FIT_EVALUATOR_FAILED",
      errorMessage: error.message || String(error)
    });
    throw error;
  }
}

async function verifyClaimsNode(state) {
  const resumeVersion = assertResumeVersion(state.resumeVersion);
  const resumeInput = state.store.getApplicationResumeInput(resumeVersion.applicationId, {
    screeningId: resumeVersion.screeningId || ""
  });
  const agentRun = state.store.startAgentRun({
    agentName: "ClaimVerifier",
    applicationId: resumeVersion.applicationId,
    step: "langgraph_verify_resume_claims",
    provider: state.mode,
    input: {
      resumeVersionId: resumeVersion.id,
      application: resumeInput.application,
      profileSummary: summarizeProfileForTrace(resumeInput.profile),
      resumeFields: resumeVersion.resumeFields,
      sourceMapping: resumeVersion.sourceMapping,
      graphVersion: GRAPH_VERSION
    }
  });
  try {
    const agentResult = runClaimVerifier({
      application: resumeInput.application,
      profile: resumeInput.profile,
      resumeVersion,
      sourceMapping: resumeVersion.sourceMapping
    }, {
      mode: state.mode
    });
    const finishedRun = state.store.finishAgentRun(agentRun.id, {
      status: "SUCCEEDED",
      provider: agentResult.provider,
      output: {
        result: agentResult.result,
        fallbackUsed: agentResult.fallbackUsed
      },
      fallbackUsed: agentResult.fallbackUsed
    });
    const saved = state.store.createResumeClaimVerification({
      resumeVersionId: resumeVersion.id,
      agentRunId: finishedRun.id,
      provider: agentResult.provider,
      result: agentResult.result,
      metadata: {
        verifiedBy: GRAPH_AGENT_NAME,
        graphVersion: GRAPH_VERSION,
        mode: state.mode,
        revisionCount: state.revisionCount || 0
      }
    });
    state.store.recordWorkflowEvent({
      applicationId: resumeVersion.applicationId,
      sourceType: "agent_run",
      sourceId: finishedRun.id,
      eventType: "RESUME_CLAIMS_VERIFIED",
      severity: saved.resumeClaimVerification.truthfulnessPassed ? "info" : "warning",
      status: "SUCCEEDED",
      progressCurrent: 1,
      progressTotal: 1,
      message: `Resume claims verified by LangGraph for resume version ${resumeVersion.id}: ${saved.resumeClaimVerification.supportedCount}/${saved.resumeClaimVerification.totalClaims} supported.`,
      errorCode: saved.resumeClaimVerification.unsupportedCount || saved.resumeClaimVerification.needsUserConfirmationCount ? "RESUME_CLAIMS_NEED_REVIEW" : "",
      errorMessage: saved.resumeClaimVerification.unsupportedCount || saved.resumeClaimVerification.needsUserConfirmationCount
        ? `${saved.resumeClaimVerification.unsupportedCount} unsupported claim(s), ${saved.resumeClaimVerification.needsUserConfirmationCount} claim(s) need confirmation.`
        : "",
      metadata: {
        graphVersion: GRAPH_VERSION,
        resumeVersionId: resumeVersion.id,
        resumeClaimVerificationId: saved.resumeClaimVerification.id,
        noRealBossAction: true,
        noApplicationStatusChange: true
      }
    });
    return {
      resumeClaimVerification: saved.resumeClaimVerification,
      resumeAudit: null
    };
  } catch (error) {
    state.store.finishAgentRun(agentRun.id, {
      status: "FAILED",
      provider: state.mode,
      output: { error: structuredError(error) },
      errorCode: error.code || "CLAIM_VERIFIER_FAILED",
      errorMessage: error.message || String(error)
    });
    throw error;
  }
}

async function decideRevisionNode(state) {
  const fitPolicy = state.resumeFitEvaluation?.policy || {};
  const claimPolicy = state.resumeClaimVerification?.policy || {};
  const unsupportedCount = Number(state.resumeClaimVerification?.unsupportedCount || 0);
  const needsRevision = Boolean(fitPolicy.requiresResumeRevision || unsupportedCount > 0);
  const canRevise = needsRevision && (state.revisionCount || 0) < (state.maxRevisions || 0);
  const canProceedToAudit = fitPolicy.canProceedToAudit !== false && unsupportedCount === 0;
  if (canRevise) {
    return {
      shouldRevise: true,
      stopReason: ""
    };
  }
  if (!canProceedToAudit) {
    return {
      shouldRevise: false,
      stopReason: unsupportedCount > 0 ? "resume_has_unsupported_claims" : "resume_checks_block_audit"
    };
  }
  return {
    shouldRevise: false,
    stopReason: ""
  };
}

function routeAfterRevisionDecision(state) {
  if (state.shouldRevise) {
    return "revise_resume";
  }
  if (state.stopReason) {
    return END;
  }
  return "audit_resume";
}

async function reviseResumeNode(state) {
  const resumeVersion = assertResumeVersion(state.resumeVersion);
  const resumeInput = state.store.getApplicationResumeInput(resumeVersion.applicationId, {
    screeningId: resumeVersion.screeningId || ""
  });
  const agentRun = state.store.startAgentRun({
    agentName: "ResumeRevisionAgent",
    applicationId: resumeVersion.applicationId,
    step: "langgraph_revise_resume_from_checks",
    provider: state.mode,
    input: {
      resumeVersionId: resumeVersion.id,
      resumeFitEvaluationId: state.resumeFitEvaluation?.id || null,
      resumeClaimVerificationId: state.resumeClaimVerification?.id || null,
      application: resumeInput.application,
      job: resumeInput.job,
      profileSummary: summarizeProfileForTrace(resumeInput.profile),
      graphVersion: GRAPH_VERSION
    }
  });
  try {
    const agentResult = runResumeRevisionAgent({
      application: resumeInput.application,
      job: resumeInput.job,
      profile: resumeInput.profile,
      resumeVersion,
      resumeFitEvaluation: state.resumeFitEvaluation,
      resumeClaimVerification: state.resumeClaimVerification
    }, {
      mode: state.mode
    });
    const finishedRun = state.store.finishAgentRun(agentRun.id, {
      status: "SUCCEEDED",
      provider: agentResult.provider,
      output: {
        result: agentResult.result,
        fallbackUsed: agentResult.fallbackUsed
      },
      fallbackUsed: agentResult.fallbackUsed
    });
    const saved = state.store.createResumeVersion({
      applicationId: resumeVersion.applicationId,
      screeningId: resumeVersion.screeningId || "",
      agentRunId: finishedRun.id,
      provider: agentResult.provider,
      result: withRenderMetadata(agentResult.result, state.renderOptions),
      skipApplicationTransition: true,
      metadata: {
        generatedBy: GRAPH_AGENT_NAME,
        graphVersion: GRAPH_VERSION,
        revisedFromVersionId: resumeVersion.id,
        resumeFitEvaluationId: state.resumeFitEvaluation?.id || null,
        resumeClaimVerificationId: state.resumeClaimVerification?.id || null,
        revisionSource: "langgraph_checks",
        mode: state.mode
      }
    });
    const rendered = await maybeRenderResume(state, saved.resumeVersion);
    const actionCount = Array.isArray(agentResult.result.metadata?.actions)
      ? agentResult.result.metadata.actions.length
      : 0;
    state.store.recordWorkflowEvent({
      applicationId: resumeVersion.applicationId,
      sourceType: "agent_run",
      sourceId: finishedRun.id,
      eventType: "RESUME_REVISION_PREPARED",
      severity: actionCount ? "info" : "warning",
      status: "SUCCEEDED",
      progressCurrent: 1,
      progressTotal: 1,
      message: `LangGraph prepared resume revision from version ${resumeVersion.id} into version ${rendered.resumeVersion.id}.`,
      errorCode: actionCount ? "" : "RESUME_REVISION_NO_SAFE_CHANGE",
      errorMessage: actionCount ? "" : "No safe evidence-bound revision was available.",
      metadata: {
        graphVersion: GRAPH_VERSION,
        baseResumeVersionId: resumeVersion.id,
        resumeVersionId: rendered.resumeVersion.id,
        actionCount,
        noRealBossAction: true,
        noApplicationStatusChange: true,
        noBrowserTaskCreated: true
      }
    });
    return {
      revisionCount: (state.revisionCount || 0) + 1,
      resumeVersion: rendered.resumeVersion,
      rendered: rendered.rendered,
      resumeFitEvaluation: null,
      resumeClaimVerification: null,
      resumeAudit: null,
      shouldRevise: false,
      stopReason: ""
    };
  } catch (error) {
    state.store.finishAgentRun(agentRun.id, {
      status: "FAILED",
      provider: state.mode,
      output: { error: structuredError(error) },
      errorCode: error.code || "RESUME_REVISION_AGENT_FAILED",
      errorMessage: error.message || String(error)
    });
    throw error;
  }
}

async function auditResumeNode(state) {
  const resumeVersion = assertResumeVersion(state.resumeVersion);
  const resumeInput = state.store.getApplicationResumeInput(resumeVersion.applicationId, {
    screeningId: resumeVersion.screeningId || ""
  });
  const agentRun = state.store.startAgentRun({
    agentName: "AuditAgent",
    applicationId: resumeVersion.applicationId,
    step: "langgraph_audit_resume",
    provider: state.mode,
    input: {
      resumeVersionId: resumeVersion.id,
      application: resumeInput.application,
      job: resumeInput.job,
      screening: resumeInput.screening,
      profileSummary: summarizeProfileForTrace(resumeInput.profile),
      graphVersion: GRAPH_VERSION
    }
  });
  try {
    const agentResult = runAuditAgent({
      resumeVersionId: resumeVersion.id,
      job: resumeInput.job,
      screening: resumeInput.screening,
      profile: resumeInput.profile,
      resumeFields: resumeVersion.resumeFields,
      sourceMapping: resumeVersion.sourceMapping,
      unsupportedClaims: resumeVersion.unsupportedClaims,
      renderMetadata: resumeVersion.renderMetadata
    }, {
      mode: state.mode
    });
    const finishedRun = state.store.finishAgentRun(agentRun.id, {
      status: "SUCCEEDED",
      provider: agentResult.provider,
      output: {
        result: agentResult.result,
        fallbackUsed: agentResult.fallbackUsed
      },
      fallbackUsed: agentResult.fallbackUsed
    });
    const saved = state.store.createResumeAudit({
      resumeVersionId: resumeVersion.id,
      agentRunId: finishedRun.id,
      provider: agentResult.provider,
      result: agentResult.result,
      metadata: {
        auditedBy: GRAPH_AGENT_NAME,
        graphVersion: GRAPH_VERSION,
        mode: state.mode
      }
    });
    return {
      resumeAudit: saved.resumeAudit,
      resumeVersion: saved.resumeVersion,
      stopReason: saved.resumeAudit.recommendation === "approve" ? "" : "resume_audit_not_approved"
    };
  } catch (error) {
    state.store.finishAgentRun(agentRun.id, {
      status: "FAILED",
      provider: state.mode,
      output: { error: structuredError(error) },
      errorCode: error.code || "AUDIT_AGENT_FAILED",
      errorMessage: error.message || String(error)
    });
    throw error;
  }
}

async function maybeRenderResume(state, resumeVersion) {
  if (!state.renderDocx) {
    return {
      resumeVersion,
      rendered: null
    };
  }
  const outputDir = state.renderOptions.outputDir
    ? path.resolve(state.renderOptions.outputDir)
    : undefined;
  const rendered = await renderResumeDocx(resumeVersion, {
    ...state.renderOptions,
    ...(outputDir ? { outputDir } : {})
  });
  return {
    resumeVersion: state.store.attachResumeFile(resumeVersion.id, rendered),
    rendered
  };
}

function withRenderMetadata(result = {}, renderOptions = {}) {
  return {
    ...result,
    renderMetadata: {
      ...(result.renderMetadata || {}),
      ...(result.renderHints || {}),
      maxPages: 2,
      template: renderOptions.templateName || renderOptions.template || result.renderHints?.template || "boss-find-fixed-docx-v1",
      referenceDocxPath: renderOptions.referenceDocxPath || "",
      photoPath: renderOptions.photoPath || "",
      graphVersion: GRAPH_VERSION
    }
  };
}

function assertResumeVersion(resumeVersion) {
  if (!resumeVersion?.id) {
    throw workflowError("RESUME_WORKFLOW_RESUME_VERSION_REQUIRED", "Resume version is required for this graph node.");
  }
  return resumeVersion;
}

function recordWorkflowEvent(store, input = {}) {
  if (!store?.recordWorkflowEvent) {
    return null;
  }
  return store.recordWorkflowEvent({
    applicationId: input.applicationId || null,
    sourceType: input.sourceType || "workflow",
    sourceId: input.sourceId || null,
    eventType: input.eventType,
    severity: input.severity || "info",
    status: input.status || "",
    progressCurrent: input.progressCurrent,
    progressTotal: input.progressTotal,
    message: input.message,
    errorCode: input.errorCode || "",
    errorMessage: input.errorMessage || "",
    metadata: {
      graphVersion: GRAPH_VERSION,
      ...(input.metadata || {})
    }
  });
}

function summarizeGraphState(state = {}) {
  return {
    graphVersion: GRAPH_VERSION,
    applicationId: state.applicationId || null,
    screeningId: state.screening?.id || null,
    resumeVersionId: state.resumeVersion?.id || null,
    resumeFitEvaluationId: state.resumeFitEvaluation?.id || null,
    resumeClaimVerificationId: state.resumeClaimVerification?.id || null,
    resumeAuditId: state.resumeAudit?.id || null,
    revisionCount: state.revisionCount || 0,
    stopReason: state.stopReason || "",
    renderedFilePath: state.rendered?.filePath || state.resumeVersion?.filePath || "",
    noRealBossAction: true,
    noBrowserTaskCreated: true
  };
}

function summarizeNodeUpdate(update = {}) {
  return {
    screeningId: update.screening?.id || null,
    resumeVersionId: update.resumeVersion?.id || null,
    resumeFitEvaluationId: update.resumeFitEvaluation?.id || null,
    resumeClaimVerificationId: update.resumeClaimVerification?.id || null,
    resumeAuditId: update.resumeAudit?.id || null,
    shouldRevise: Boolean(update.shouldRevise),
    stopReason: update.stopReason || "",
    renderedFilePath: update.rendered?.filePath || ""
  };
}

function summarizeProfileForTrace(profile = {}) {
  return {
    experienceCount: Array.isArray(profile.experiences) ? profile.experiences.length : 0,
    skillCount: Array.isArray(profile.skills) ? profile.skills.length : 0,
    constraintCount: Array.isArray(profile.constraints) ? profile.constraints.length : 0,
    target: profile.profile?.target || {}
  };
}

function structuredError(error) {
  return {
    code: error.code || "INTERNAL_ERROR",
    agent: error.agent || "",
    step: error.step || "",
    nodeName: error.nodeName || "",
    message: error.message || String(error),
    retryable: Boolean(error.retryable),
    severity: error.severity || "error",
    context: error.context || {}
  };
}

function workflowError(code, message, context = {}) {
  const error = new Error(message);
  error.code = code;
  error.agent = GRAPH_AGENT_NAME;
  error.context = context;
  return error;
}

function normalizeMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return new Set(["rules", "auto", "llm"]).has(mode) ? mode : "rules";
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

module.exports = {
  GRAPH_VERSION,
  buildResumeWorkflowGraph,
  runResumeWorkflowGraph
};
