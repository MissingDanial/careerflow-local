const AGENT_NAME = "AuditAgent";

function runAuditAgent(input = {}, options = {}) {
  const context = normalizeAuditInput(input);
  const mode = normalizeMode(options.mode || input.mode || "rules");
  if (mode !== "rules") {
    return runAuditAgent(input, { ...options, mode: "rules" });
  }
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
    }
  };
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
  return Boolean(fields.summary)
    && Array.isArray(fields.skills)
    && Array.isArray(fields.projects)
    && (fields.skills.length > 0 || fields.projects.length > 0);
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
  return new Set(["rules", "auto", "llm"]).has(mode) ? mode : "rules";
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
