const AGENT_NAME = "AuditAgent";
const { AuditReviewOutputSchema } = require("./agent-output-schemas");
const { loadModelConfig, requestStructuredCompletion } = require("./model-client");

const PROMPT_VERSION = "m16.audit.prompt.v1";
const AGENT_VERSION = "m16.audit.agent.v1";

function runAuditAgent(input = {}, options = {}) {
  const context = normalizeAuditInput(input);
  const mode = normalizeMode(options.mode || input.mode || "rules");
  const baseline = runRuleBasedAuditAgent(context);
  const modelConfig = loadModelConfig(options.modelConfig || {});
  if (mode === "rules" || (mode === "auto" && !modelConfig.configured)) {
    return baseline;
  }
  if (!modelConfig.configured) {
    throw auditAgentError("LLM_CONFIG_INVALID", "OpenAI-compatible model config is not available for AuditAgent");
  }
  return runModelAuditAgent(context, baseline, mode, modelConfig, options);
}

function runRuleBasedAuditAgent(context) {
  const unsupportedClaims = collectUnsupportedClaims(context);
  const sourceIssues = auditSourceMapping(context);
  const pageEstimate = estimatePages(context.resumeFields);
  const renderQuality = context.renderMetadata.renderQuality && typeof context.renderMetadata.renderQuality === "object"
    ? context.renderMetadata.renderQuality
    : null;
  const renderQualityPassed = !renderQuality || renderQuality.ok !== false;
  const truthfulnessPassed = unsupportedClaims.length === 0 && sourceIssues.length === 0;
  const formatPassed = hasMinimumResumeShape(context.resumeFields);
  const pageLimitPassed = pageEstimate <= 2;
  const riskFlags = [
    ...unsupportedClaims.map((claim) => `Unsupported claim: ${claim}`),
    ...sourceIssues,
    ...(renderQualityPassed ? [] : normalizeStringArray(renderQuality?.warnings).map((warning) => `Render QA: ${warning}`)),
    ...(pageLimitPassed ? [] : [`Estimated page count ${pageEstimate} exceeds 2.`]),
    ...(context.screening.recommendation === "skip" ? ["Screening recommendation is skip."] : [])
  ];
  const exaggerationRisk = truthfulnessPassed ? (riskFlags.length ? "medium" : "low") : "high";
  const recommendation = truthfulnessPassed && formatPassed && pageLimitPassed && renderQualityPassed && context.screening.recommendation !== "skip"
    ? "approve"
    : truthfulnessPassed && formatPassed && renderQualityPassed
      ? "revise"
      : "block";

  return {
    ok: true,
    agent: AGENT_NAME,
    provider: "rules",
    fallbackUsed: false,
    result: {
      truthfulnessPassed,
      formatPassed,
      pageLimitPassed,
      unsupportedClaims,
      sourceIssues,
      exaggerationRisk,
      jobFitReview: context.screening.matchScore >= 75 ? "good" : context.screening.matchScore >= 55 ? "mixed" : "weak",
      riskScoreAdjustment: riskFlags.length ? Math.min(35, riskFlags.length * 8) : 0,
      recommendation,
      requiresUserConfirmation: recommendation !== "approve" || context.screening.riskScore >= 50,
      renderMetadata: {
        ...context.renderMetadata,
        estimatedPages: pageEstimate,
        maxPages: 2,
        renderQualityPassed
      },
      riskFlags,
      metadata: {
        method: "rules",
        screeningId: context.screening.id || null,
        resumeVersionId: context.resumeVersionId || null
      }
    },
    promptVersion: "m7.audit.rules.v1",
    agentVersion: "m7.audit.rules.v1",
    telemetry: {}
  };
}

async function runModelAuditAgent(context, baseline, mode, modelConfig, options = {}) {
  const invoke = options.requestStructuredCompletion || requestStructuredCompletion;
  try {
    const completion = await invoke({
      system: auditSystemPrompt(),
      user: JSON.stringify(buildAuditModelInput(context, baseline), null, 2),
      config: modelConfig,
      schema: AuditReviewOutputSchema,
      schemaName: "resume_audit_review_output"
    });
    const result = mergeAuditReview(baseline.result, completion.data);
    return {
      ok: true,
      agent: AGENT_NAME,
      provider: mode === "hybrid" ? "hybrid" : "llm",
      fallbackUsed: false,
      result,
      modelConfig: publicModelConfig(modelConfig),
      promptVersion: PROMPT_VERSION,
      agentVersion: AGENT_VERSION,
      telemetry: completion.telemetry || {}
    };
  } catch (error) {
    if (mode === "llm" || mode === "hybrid") {
      const structured = auditAgentError(error.code || "AUDIT_AGENT_FAILED", error.message || String(error));
      structured.telemetry = error.telemetry || {};
      throw structured;
    }
    return {
      ...baseline,
      fallbackUsed: true,
      fallbackReason: error.code || "LLM_REQUEST_FAILED",
      fallbackMessage: error.message || String(error),
      modelConfig: publicModelConfig(modelConfig),
      promptVersion: PROMPT_VERSION,
      agentVersion: AGENT_VERSION,
      telemetry: error.telemetry || {},
      result: {
        ...baseline.result,
        requiresUserConfirmation: true,
        metadata: {
          ...baseline.result.metadata,
          method: "rules_fallback",
          fallbackReason: error.code || "LLM_REQUEST_FAILED"
        }
      }
    };
  }
}

function buildAuditModelInput(context, baseline) {
  return {
    task: "Review the resume's JD fit, clarity, and application readiness after deterministic hard gates. Return JSON only.",
    outputSchema: {
      jobFitReview: "good | mixed | weak",
      recommendation: "approve | revise | block",
      requiresUserConfirmation: "boolean",
      confidence: "low | medium | high",
      qualityIssues: ["specific issue grounded in supplied resume/JD"],
      recommendations: ["specific evidence-preserving revision"]
    },
    rules: [
      "You may make the deterministic recommendation stricter, never weaker.",
      "Do not approve if deterministicAudit reports truth, render, format, or page failure.",
      "Do not request invented facts or metrics.",
      "Do not decide or perform BOSS submission.",
      "Return exactly one JSON object."
    ],
    job: context.job,
    screening: context.screening,
    resumeFields: context.resumeFields,
    sourceMapping: context.sourceMapping,
    deterministicAudit: baseline.result
  };
}

function auditSystemPrompt() {
  return [
    "You are AuditAgent in a local-first resume workflow.",
    "Deterministic truthfulness, source mapping, render, and page checks are binding hard gates.",
    "Review semantic JD fit and writing quality conservatively.",
    "Never relax a deterministic blocker or invent evidence.",
    "Return exactly one JSON object."
  ].join("\n");
}

function mergeAuditReview(baseline, review) {
  const recommendation = stricterRecommendation(baseline.recommendation, review.recommendation);
  const qualityIssues = normalizeStringArray(review.qualityIssues).slice(0, 20);
  const recommendations = normalizeStringArray(review.recommendations).slice(0, 15);
  const riskFlags = Array.from(new Set([
    ...baseline.riskFlags,
    ...qualityIssues.map((issue) => `Model quality review: ${issue}`)
  ])).slice(0, 40);
  return {
    ...baseline,
    jobFitReview: stricterJobFitReview(baseline.jobFitReview, review.jobFitReview),
    recommendation,
    requiresUserConfirmation: Boolean(
      baseline.requiresUserConfirmation
        || review.requiresUserConfirmation
        || recommendation !== "approve"
    ),
    riskScoreAdjustment: Math.min(50, baseline.riskScoreAdjustment + Math.min(15, qualityIssues.length * 3)),
    riskFlags,
    metadata: {
      ...baseline.metadata,
      method: "deterministic_gates_plus_llm_review",
      modelConfidence: text(review.confidence).toLowerCase(),
      qualityIssues,
      recommendations,
      deterministicRecommendation: baseline.recommendation,
      modelRecommendation: review.recommendation,
      noRealBossAction: true
    }
  };
}

function stricterRecommendation(left, right) {
  const order = { approve: 0, revise: 1, block: 2 };
  const normalizedLeft = Object.hasOwn(order, left) ? left : "block";
  const normalizedRight = Object.hasOwn(order, right) ? right : "block";
  return order[normalizedRight] > order[normalizedLeft] ? normalizedRight : normalizedLeft;
}

function stricterJobFitReview(left, right) {
  const order = { good: 0, mixed: 1, weak: 2 };
  const normalizedLeft = Object.hasOwn(order, left) ? left : "weak";
  const normalizedRight = Object.hasOwn(order, right) ? right : "weak";
  return order[normalizedRight] > order[normalizedLeft] ? normalizedRight : normalizedLeft;
}

function publicModelConfig(config = {}) {
  return {
    configured: Boolean(config.configured),
    baseUrl: config.baseUrl || "",
    model: config.model || "",
    wireApi: config.wireApi || "",
    reasoningEffort: config.reasoningEffort || "",
    maxRetries: Number(config.maxRetries || 0),
    source: config.source || ""
  };
}

function auditAgentError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.agent = AGENT_NAME;
  error.step = "audit_resume";
  error.retryable = code === "LLM_REQUEST_FAILED" || code === "AGENT_OUTPUT_SCHEMA_INVALID";
  return error;
}

function normalizeAuditInput(input = {}) {
  return {
    resumeVersionId: Number(input.resumeVersionId || 0),
    job: normalizeObject(input.job),
    screening: normalizeScreening(input.screening || {}),
    profile: normalizeProfile(input.profile || {}),
    resumeFields: normalizeObject(input.resumeFields || input.resume_fields),
    sourceMapping: Array.isArray(input.sourceMapping || input.source_mapping)
      ? (input.sourceMapping || input.source_mapping).map(normalizeMapping)
      : [],
    unsupportedClaims: normalizeStringArray(input.unsupportedClaims || input.unsupported_claims),
    renderMetadata: normalizeObject(input.renderMetadata || input.render_metadata)
  };
}

function normalizeScreening(screening = {}) {
  return {
    id: Number(screening.id || 0),
    matchScore: Number(screening.matchScore || screening.match_score || 0),
    riskScore: Number(screening.riskScore || screening.risk_score || 0),
    recommendation: text(screening.recommendation || "")
  };
}

function normalizeProfile(profile = {}) {
  return {
    experiences: Array.isArray(profile.experiences) ? profile.experiences : [],
    skills: Array.isArray(profile.skills) ? profile.skills : [],
    constraints: Array.isArray(profile.constraints) ? profile.constraints : []
  };
}

function normalizeMapping(mapping = {}) {
  return {
    resumeField: text(mapping.resumeField || mapping.resume_field || ""),
    sourceType: text(mapping.sourceType || mapping.source_type || ""),
    sourceId: mapping.sourceId === null || mapping.source_id === null ? null : Number(mapping.sourceId || mapping.source_id || 0),
    sourceFact: text(mapping.sourceFact || mapping.source_fact || "")
  };
}

function collectUnsupportedClaims(context) {
  const unsupported = new Set(context.unsupportedClaims);
  const mappingFields = new Set(context.sourceMapping.map((mapping) => mapping.resumeField).filter(Boolean));
  const fields = context.resumeFields || {};
  if (fields.summary && !mappingFields.has("summary")) {
    unsupported.add("summary");
  }
  for (const [projectIndex, project] of (fields.projects || []).entries()) {
    const titleField = `projects[${projectIndex}].title`;
    if (project?.title && !mappingFields.has(titleField)) {
      unsupported.add(titleField);
    }
    for (const [bulletIndex, bullet] of (project?.bullets || []).entries()) {
      const field = `projects[${projectIndex}].bullets[${bulletIndex}]`;
      if (bullet && !mappingFields.has(field)) {
        unsupported.add(field);
      }
    }
  }
  return Array.from(unsupported).slice(0, 50);
}

function auditSourceMapping(context) {
  const issues = [];
  const experienceIds = new Set(context.profile.experiences.map((experience) => Number(experience.id || 0)).filter(Boolean));
  const skillIds = new Set(context.profile.skills.map((skill) => Number(skill.id || 0)).filter(Boolean));
  for (const mapping of context.sourceMapping) {
    if (!mapping.resumeField || !mapping.sourceFact) {
      issues.push(`Incomplete source mapping for ${mapping.resumeField || "unknown field"}.`);
      continue;
    }
    if (mapping.sourceType === "experience" && mapping.sourceId && !experienceIds.has(mapping.sourceId)) {
      issues.push(`Source experience not found: ${mapping.sourceId}.`);
    }
    if (mapping.sourceType === "skill" && mapping.sourceId && !skillIds.has(mapping.sourceId)) {
      issues.push(`Source skill not found: ${mapping.sourceId}.`);
    }
  }
  return issues.slice(0, 50);
}

function hasMinimumResumeShape(fields = {}) {
  const education = Array.isArray(fields.education) ? fields.education : [];
  return Boolean(fields.name || fields.headline || fields.summary)
    && Array.isArray(fields.skills)
    && Array.isArray(fields.projects)
    && (fields.skills.length > 0 || fields.projects.length > 0 || education.length > 0);
}

function estimatePages(fields = {}) {
  const summaryChars = String(fields.summary || "").length;
  const skillChars = (fields.skills || []).join(" ").length;
  const projectChars = (fields.projects || []).reduce((sum, project) => {
    return sum
      + String(project?.title || "").length
      + String(project?.organization || "").length
      + (project?.bullets || []).join(" ").length;
  }, 0);
  const educationChars = (fields.education || []).reduce((sum, item) => {
    return sum + String(item?.title || "").length + (item?.bullets || []).join(" ").length;
  }, 0);
  const totalChars = summaryChars + skillChars + projectChars + educationChars;
  const bulletCount = (fields.projects || []).reduce((count, project) => count + (project?.bullets || []).length, 0);
  return Math.max(1, Math.ceil((totalChars + bulletCount * 45) / 1800));
}

function normalizeMode(value) {
  const mode = text(value).toLowerCase();
  return new Set(["rules", "auto", "llm", "hybrid"]).has(mode) ? mode : "rules";
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(text).filter(Boolean).slice(0, 80);
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

module.exports = {
  runAuditAgent
};
