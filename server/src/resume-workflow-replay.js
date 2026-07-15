"use strict";

const crypto = require("crypto");
const { runScreeningAgent } = require("./screening-agent");
const { runResumeAgent } = require("./resume-agent");
const { runResumeFitEvaluator } = require("./resume-fit-evaluator");
const { runClaimVerifier } = require("./claim-verifier");
const { runResumeRevisionAgent } = require("./resume-revision-agent");
const { runAuditAgent } = require("./audit-agent");
const { DEFAULT_RESUME_TEMPLATE } = require("./resume-template-registry");
const {
  AGENT_VERSION,
  GRAPH_VERSION,
  PROMPT_VERSION,
  applyResumeRenderPolicy
} = require("./resume-workflow-graph");

async function replayResumeWorkflowRun(input = {}) {
  const store = input.store;
  if (!store) {
    throw replayError("WORKFLOW_REPLAY_STORE_REQUIRED", "Workflow replay requires a store.");
  }
  const workflowRunId = positiveInteger(input.workflowRunId);
  if (!workflowRunId) {
    throw replayError("WORKFLOW_REPLAY_RUN_REQUIRED", "A valid workflow run id is required.");
  }

  const original = store.getWorkflowRun(workflowRunId);
  const frozen = store.getWorkflowRunInput(workflowRunId);
  const mode = normalizeMode(input.mode || original.workflowRun.mode || "rules");
  const requestedModelConfig = input.modelConfig && typeof input.modelConfig === "object"
    ? input.modelConfig
    : {};
  const modelConfig = Object.keys(requestedModelConfig).length
    ? requestedModelConfig
    : frozen.manifest.modelConfig || {};
  const maxRevisions = Math.max(
    0,
    Math.min(3, Number(input.maxRevisions ?? frozen.executionOptions.maxRevisions ?? 1) || 0)
  );
  const replayedAt = new Date().toISOString();
  const screeningResult = await runScreeningAgent({
    application: frozen.application,
    job: frozen.job,
    profile: frozen.profile,
    userRules: frozen.userRules
  }, {
    mode,
    modelConfig
  });
  const screening = toReplayScreening(screeningResult);

  let resumeVersion = null;
  let resumeFitEvaluation = null;
  let resumeClaimVerification = null;
  let resumeAudit = null;
  let stopReason = screening.recommendation === "skip" ? "screening_recommendation_skip" : "";
  let revisionCount = 0;

  if (!stopReason) {
    const preparedResume = runResumeAgent({
      application: frozen.application,
      job: frozen.job,
      profile: frozen.profile,
      screening,
      userRules: frozen.userRules
    }, { mode }).result;
    resumeVersion = toReplayResumeVersion(
      applyResumeRenderPolicy(preparedResume, frozen.renderOptions),
      frozen.application.id,
      screening.id,
      1
    );

    while (resumeVersion) {
      resumeFitEvaluation = toReplayFitEvaluation(runResumeFitEvaluator({
        application: frozen.application,
        job: frozen.job,
        resumeVersion
      }, { mode }).result);
      resumeClaimVerification = toReplayClaimVerification(runClaimVerifier({
        application: frozen.application,
        profile: frozen.profile,
        resumeVersion,
        sourceMapping: resumeVersion.sourceMapping
      }, { mode }).result);

      const unsupportedCount = Number(resumeClaimVerification.unsupportedCount || 0);
      const needsRevision = Boolean(
        resumeFitEvaluation.policy?.requiresResumeRevision
        || unsupportedCount > 0
      );
      const canRevise = needsRevision && revisionCount < maxRevisions;
      const canProceedToAudit = resumeFitEvaluation.policy?.canProceedToAudit !== false
        && unsupportedCount === 0;
      if (canRevise) {
        const revised = runResumeRevisionAgent({
          application: frozen.application,
          job: frozen.job,
          profile: frozen.profile,
          resumeVersion,
          resumeFitEvaluation,
          resumeClaimVerification
        }, { mode });
        revisionCount += 1;
        resumeVersion = toReplayResumeVersion(
          applyResumeRenderPolicy(revised.result, frozen.renderOptions),
          frozen.application.id,
          screening.id,
          revisionCount + 1
        );
        continue;
      }
      if (!canProceedToAudit) {
        stopReason = unsupportedCount > 0 ? "resume_has_unsupported_claims" : "resume_checks_block_audit";
        break;
      }
      const auditResult = runAuditAgent({
        resumeVersionId: resumeVersion.id,
        job: frozen.job,
        screening,
        profile: frozen.profile,
        resumeFields: resumeVersion.resumeFields,
        sourceMapping: resumeVersion.sourceMapping,
        unsupportedClaims: resumeVersion.unsupportedClaims,
        renderMetadata: resumeVersion.renderMetadata
      }, { mode });
      resumeAudit = toReplayAudit(auditResult.result);
      stopReason = resumeAudit.recommendation === "approve" ? "" : "resume_audit_not_approved";
      break;
    }
  }

  const replay = {
    ok: Boolean(resumeVersion && resumeAudit),
    replayOnly: true,
    noPersistentWrites: true,
    noApplicationStatusChange: true,
    noBrowserTaskCreated: true,
    sourceWorkflowRunId: workflowRunId,
    inputSnapshot: frozen.manifest,
    executedWith: {
      graphVersion: GRAPH_VERSION,
      promptVersion: PROMPT_VERSION,
      agentVersion: AGENT_VERSION,
      mode,
      replayedAt
    },
    stopReason,
    revisionCount,
    screening,
    resumeVersion,
    resumeFitEvaluation,
    resumeClaimVerification,
    resumeAudit
  };

  return {
    ok: true,
    storage: "sqlite",
    originalWorkflowRun: original.workflowRun,
    inputSnapshot: frozen.manifest,
    replay,
    comparison: compareReplay(original.workflowRun.output || {}, replay)
  };
}

function toReplayScreening(agentResult) {
  return {
    id: 0,
    provider: agentResult.provider,
    ...clone(agentResult.result)
  };
}

function toReplayResumeVersion(result, applicationId, screeningId, versionNumber) {
  return {
    id: versionNumber,
    applicationId: Number(applicationId || 0),
    screeningId: screeningId || null,
    versionNumber,
    status: "DRAFTED",
    provider: "rules",
    resumeFields: clone(result.resumeFields),
    sourceMapping: clone(result.sourceMapping || []),
    diffSummary: clone(result.diffSummary || []),
    compressionNotes: clone(result.compressionNotes || []),
    unsupportedClaims: clone(result.unsupportedClaims || []),
    renderMetadata: {
      ...(result.renderMetadata || {}),
      ...(result.renderHints || {}),
      maxPages: 2,
      template: result.renderMetadata?.template
        || result.renderHints?.template
        || DEFAULT_RESUME_TEMPLATE,
      graphVersion: GRAPH_VERSION
    },
    metadata: clone(result.metadata || {})
  };
}

function toReplayFitEvaluation(result) {
  return {
    id: 0,
    coverageScore: Number(result.coverage?.score || 0),
    fitLevel: result.coverage?.fitLevel || "",
    confidence: result.coverage?.confidence || "",
    requirementCount: Number(result.coverage?.total || 0),
    coveredCount: Number(result.coverage?.covered || 0),
    weakCount: Number(result.coverage?.weak || 0),
    missingCount: Number(result.coverage?.missing || 0),
    jdRequirements: clone(result.jdRequirements || {}),
    coverageItems: clone(result.coverage?.items || []),
    blockers: clone(result.blockers || []),
    recommendations: clone(result.recommendations || []),
    policy: clone(result.policy || {}),
    metadata: clone(result.metadata || {})
  };
}

function toReplayClaimVerification(result) {
  return {
    id: 0,
    totalClaims: Number(result.summary?.total || 0),
    supportedCount: Number(result.summary?.supported || 0),
    weakCount: Number(result.summary?.weak || 0),
    unsupportedCount: Number(result.summary?.unsupported || 0),
    needsUserConfirmationCount: Number(result.summary?.needsUserConfirmation || 0),
    truthfulnessPassed: Boolean(result.summary?.truthfulnessPassed),
    coverageRatio: Number(result.summary?.coverageRatio || 0),
    claims: clone(result.claims || []),
    unsupportedClaims: clone(result.unsupportedClaims || []),
    needsUserConfirmation: clone(result.needsUserConfirmation || []),
    recommendations: clone(result.recommendations || []),
    policy: clone(result.policy || {}),
    metadata: clone(result.metadata || {})
  };
}

function toReplayAudit(result) {
  return {
    id: 0,
    status: result.recommendation === "approve"
      ? "APPROVED"
      : result.recommendation === "revise"
        ? "NEEDS_REVISION"
        : "BLOCKED",
    ...clone(result)
  };
}

function compareReplay(original, replay) {
  const checks = {
    inputHashMatches: original.inputSnapshot?.inputHash === replay.inputSnapshot?.inputHash,
    versionCompatible: original.graphVersion === replay.executedWith.graphVersion
      && original.promptVersion === replay.executedWith.promptVersion
      && original.agentVersion === replay.executedWith.agentVersion,
    screeningMatches: hash(screeningProjection(original.screening)) === hash(screeningProjection(replay.screening)),
    resumeMatches: hash(original.resumeVersion?.resumeFields || null) === hash(replay.resumeVersion?.resumeFields || null),
    fitMatches: hash(fitProjection(original.resumeFitEvaluation)) === hash(fitProjection(replay.resumeFitEvaluation)),
    claimMatches: hash(claimProjection(original.resumeClaimVerification)) === hash(claimProjection(replay.resumeClaimVerification)),
    auditMatches: hash(auditProjection(original.resumeAudit)) === hash(auditProjection(replay.resumeAudit)),
    stopReasonMatches: String(original.stopReason || "") === String(replay.stopReason || "")
  };
  return {
    matches: Object.values(checks).every(Boolean),
    checks
  };
}

function screeningProjection(value) {
  return value ? {
    matchScore: value.matchScore,
    riskScore: value.riskScore,
    recommendation: value.recommendation,
    hardConditions: value.hardConditions,
    matchedPoints: value.matchedPoints,
    riskPoints: value.riskPoints,
    resumeStrategy: value.resumeStrategy
  } : null;
}

function fitProjection(value) {
  return value ? {
    coverageScore: value.coverageScore,
    fitLevel: value.fitLevel,
    requirementCount: value.requirementCount,
    coveredCount: value.coveredCount,
    weakCount: value.weakCount,
    missingCount: value.missingCount,
    blockers: value.blockers
  } : null;
}

function claimProjection(value) {
  return value ? {
    totalClaims: value.totalClaims,
    supportedCount: value.supportedCount,
    weakCount: value.weakCount,
    unsupportedCount: value.unsupportedCount,
    needsUserConfirmationCount: value.needsUserConfirmationCount,
    truthfulnessPassed: value.truthfulnessPassed
  } : null;
}

function auditProjection(value) {
  return value ? {
    truthfulnessPassed: value.truthfulnessPassed,
    formatPassed: value.formatPassed,
    pageLimitPassed: value.pageLimitPassed,
    recommendation: value.recommendation,
    jobFitReview: value.jobFitReview
  } : null;
}

function hash(value) {
  return crypto.createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalizeMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return new Set(["rules", "auto", "llm"]).has(mode) ? mode : "rules";
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function replayError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = {
  replayResumeWorkflowRun
};
