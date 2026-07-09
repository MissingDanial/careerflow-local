const AGENT_NAME = "ClaimVerifier";

const HIGH_RISK_PATTERNS = [
  /\b(?:expert|lead|principal|architect|owned|managed|scaled|optimized|reduced|increased|improved)\b/i,
  /\b\d+(?:\.\d+)?\s*(?:%|percent|x|k|w|万|倍)\b/i,
  /负责人|主导|架构|优化|提升|降低|增长|负责|独立|核心|第一/i
];

function runClaimVerifier(input = {}, options = {}) {
  const context = normalizeInput(input);
  const mode = normalizeMode(options.mode || input.mode || "rules");
  if (mode !== "rules") {
    return runClaimVerifier(input, { ...options, mode: "rules" });
  }

  const claims = extractResumeClaims(context.resumeVersion);
  const evidenceIndex = buildEvidenceIndex(context);
  const verifiedClaims = claims.map((claim) => verifyClaim(claim, evidenceIndex));
  const summary = summarizeVerification(verifiedClaims);
  const policy = {
    canProceedToAudit: summary.unsupported === 0,
    requiresUserConfirmation: summary.needsUserConfirmation > 0 || summary.weak > 0,
    requiresResumeRevision: summary.unsupported > 0,
    noRealBossAction: true,
    noApplicationStatusChange: true
  };

  return {
    ok: true,
    agent: AGENT_NAME,
    provider: "rules",
    fallbackUsed: false,
    result: {
      claims: verifiedClaims,
      summary,
      unsupportedClaims: verifiedClaims
        .filter((item) => item.status === "UNSUPPORTED")
        .map((item) => item.claim)
        .slice(0, 30),
      needsUserConfirmation: verifiedClaims
        .filter((item) => item.status === "NEEDS_USER_CONFIRMATION")
        .map((item) => item.claim)
        .slice(0, 30),
      recommendations: buildRecommendations(verifiedClaims),
      policy,
      metadata: {
        method: "rules",
        resumeVersionId: context.resumeVersion.id || null,
        applicationId: context.application.id || context.resumeVersion.applicationId || null,
        evidenceCount: evidenceIndex.items.length
      }
    }
  };
}

function extractResumeClaims(resumeVersion = {}) {
  const fields = resumeVersion.resumeFields || {};
  const claims = [];
  addClaim(claims, "summary", "summary", fields.summary, { criticality: "high" });
  for (const [index, skill] of normalizeStringArray(fields.skills).entries()) {
    addClaim(claims, "skill", `skills[${index}]`, skill, { criticality: "medium" });
  }
  for (const [index, award] of normalizeStringArray(fields.awards).entries()) {
    addClaim(claims, "award", `awards[${index}]`, award, { criticality: "high" });
  }
  const projects = Array.isArray(fields.projects) ? fields.projects : [];
  for (const [projectIndex, project] of projects.entries()) {
    addClaim(claims, "project_title", `projects[${projectIndex}].title`, project?.title, { criticality: "medium" });
    addClaim(claims, "project_role", `projects[${projectIndex}].role`, project?.role, { criticality: "medium" });
    for (const [skillIndex, skill] of normalizeStringArray(project?.skills).entries()) {
      addClaim(claims, "project_skill", `projects[${projectIndex}].skills[${skillIndex}]`, skill, { criticality: "medium" });
    }
    for (const [bulletIndex, bullet] of normalizeStringArray(project?.bullets).entries()) {
      addClaim(claims, "project_bullet", `projects[${projectIndex}].bullets[${bulletIndex}]`, bullet, {
        criticality: isHighRiskClaim(bullet) ? "high" : "medium"
      });
    }
  }
  return claims.slice(0, 120);
}

function addClaim(claims, type, field, value, options = {}) {
  const claim = cleanMultiline(value);
  if (!claim) {
    return;
  }
  claims.push({
    type,
    field,
    claim,
    criticality: options.criticality || (isHighRiskClaim(claim) ? "high" : "medium")
  });
}

function buildEvidenceIndex(context) {
  const mappingByField = new Map();
  for (const mapping of context.sourceMapping) {
    if (!mapping.resumeField) {
      continue;
    }
    const list = mappingByField.get(mapping.resumeField) || [];
    list.push(mapping);
    mappingByField.set(mapping.resumeField, list);
  }

  const items = [];
  for (const experience of context.profile.experiences) {
    addEvidence(items, {
      sourceType: "experience",
      sourceId: experience.id,
      sourceField: "title",
      text: [experience.title, experience.organization, experience.role, experience.evidenceText].filter(Boolean).join(" ")
    });
    for (const fact of normalizeStringArray(experience.facts)) {
      addEvidence(items, {
        sourceType: "experience",
        sourceId: experience.id,
        sourceField: "facts",
        text: fact
      });
    }
    for (const skill of normalizeStringArray(experience.skills)) {
      addEvidence(items, {
        sourceType: "experience",
        sourceId: experience.id,
        sourceField: "skills",
        text: skill
      });
    }
  }
  for (const skill of context.profile.skills) {
    addEvidence(items, {
      sourceType: "skill",
      sourceId: skill.id,
      sourceField: "name",
      text: [skill.name, skill.category, skill.proficiency, ...(normalizeStringArray(skill.evidence))].filter(Boolean).join(" ")
    });
  }
  return {
    mappingByField,
    items
  };
}

function addEvidence(items, item) {
  const textValue = cleanMultiline(item.text);
  if (!textValue) {
    return;
  }
  items.push({
    sourceType: cleanText(item.sourceType),
    sourceId: Number(item.sourceId || 0) || null,
    sourceField: cleanText(item.sourceField),
    text: textValue
  });
}

function verifyClaim(claim, evidenceIndex) {
  const mappings = findMappingsForClaim(claim.field, evidenceIndex.mappingByField);
  const mappedEvidence = mappings.map((mapping) => ({
    sourceType: mapping.sourceType,
    sourceId: mapping.sourceId,
    sourceField: "sourceMapping",
    text: mapping.sourceFact
  })).filter((item) => item.text);
  const evidencePool = mappedEvidence.length ? mappedEvidence : evidenceIndex.items;
  const scored = evidencePool
    .map((evidence) => ({
      evidence,
      score: scoreEvidence(claim.claim, evidence.text)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  const hasDirectMapping = mappings.length > 0;
  const status = decideStatus({
    claim,
    hasDirectMapping,
    score: best?.score || 0
  });
  return {
    ...claim,
    status,
    confidence: confidenceForStatus(status, best?.score || 0, hasDirectMapping),
    evidence: best ? {
      sourceType: best.evidence.sourceType,
      sourceId: best.evidence.sourceId,
      sourceField: best.evidence.sourceField,
      text: best.evidence.text,
      score: Math.round(best.score * 100)
    } : null,
    sourceMappingCount: mappings.length,
    reason: reasonForStatus(status, claim, best?.score || 0, hasDirectMapping)
  };
}

function findMappingsForClaim(field, mappingByField) {
  const exact = mappingByField.get(field) || [];
  if (exact.length) {
    return exact;
  }
  const projectMatch = field.match(/^(projects\[[0-9]+\])/);
  if (projectMatch) {
    return Array.from(mappingByField.entries())
      .filter(([key]) => key.startsWith(projectMatch[1]))
      .flatMap(([, value]) => value);
  }
  return [];
}

function decideStatus({ claim, hasDirectMapping, score }) {
  if (hasDirectMapping && score >= 0.2) {
    return "SUPPORTED";
  }
  if (score >= 0.72) {
    return "SUPPORTED";
  }
  if (score >= 0.42) {
    return "WEAK";
  }
  if (claim.criticality === "high" || isHighRiskClaim(claim.claim)) {
    return "NEEDS_USER_CONFIRMATION";
  }
  return "UNSUPPORTED";
}

function confidenceForStatus(status, score, hasDirectMapping) {
  if (status === "SUPPORTED" && hasDirectMapping) {
    return "high";
  }
  if (status === "SUPPORTED") {
    return score >= 0.85 ? "high" : "medium";
  }
  if (status === "WEAK") {
    return "medium";
  }
  return "low";
}

function reasonForStatus(status, claim, score, hasDirectMapping) {
  if (status === "SUPPORTED") {
    return hasDirectMapping ? "Direct source mapping supports this claim." : "Profile evidence has a strong text match.";
  }
  if (status === "WEAK") {
    return `Only weak profile evidence was found (${Math.round(score * 100)}).`;
  }
  if (status === "NEEDS_USER_CONFIRMATION") {
    return "High-impact claim needs user confirmation before audit.";
  }
  return `No confirmed evidence was found for ${claim.field}.`;
}

function summarizeVerification(claims) {
  const counts = {
    total: claims.length,
    supported: 0,
    weak: 0,
    unsupported: 0,
    needsUserConfirmation: 0
  };
  for (const claim of claims) {
    if (claim.status === "SUPPORTED") {
      counts.supported += 1;
    } else if (claim.status === "WEAK") {
      counts.weak += 1;
    } else if (claim.status === "NEEDS_USER_CONFIRMATION") {
      counts.needsUserConfirmation += 1;
    } else {
      counts.unsupported += 1;
    }
  }
  counts.truthfulnessPassed = counts.unsupported === 0 && counts.needsUserConfirmation === 0;
  counts.coverageRatio = counts.total ? Number((counts.supported / counts.total).toFixed(4)) : 0;
  return counts;
}

function buildRecommendations(claims) {
  const items = [];
  for (const claim of claims) {
    if (claim.status === "UNSUPPORTED") {
      items.push({
        type: "remove_or_source_claim",
        field: claim.field,
        claim: claim.claim,
        reason: "No confirmed evidence supports this claim.",
        allowedAction: "Remove the claim or add confirmed profile evidence before using it."
      });
    } else if (claim.status === "NEEDS_USER_CONFIRMATION") {
      items.push({
        type: "confirm_high_impact_claim",
        field: claim.field,
        claim: claim.claim,
        reason: "High-impact claim needs explicit user confirmation.",
        allowedAction: "Ask the user to confirm or downgrade the wording."
      });
    } else if (claim.status === "WEAK") {
      items.push({
        type: "tighten_claim_to_evidence",
        field: claim.field,
        claim: claim.claim,
        reason: "Evidence exists but is weak.",
        allowedAction: "Rewrite the claim closer to the source fact."
      });
    }
  }
  if (!items.length) {
    items.push({
      type: "proceed_to_audit",
      field: "",
      claim: "",
      reason: "All extracted claims have sufficient local evidence.",
      allowedAction: "Proceed to AuditAgent."
    });
  }
  return items.slice(0, 40);
}

function scoreEvidence(claim, evidence) {
  const left = cleanText(claim).toLowerCase();
  const right = cleanText(evidence).toLowerCase();
  if (!left || !right) {
    return 0;
  }
  if (right.includes(left) || left.includes(right)) {
    return 1;
  }
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }
  const overlap = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(1, Math.min(leftTokens.size, 12));
}

function isHighRiskClaim(value) {
  const text = cleanText(value);
  return HIGH_RISK_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeInput(input = {}) {
  return {
    application: normalizeObject(input.application),
    resumeVersion: normalizeResumeVersion(input.resumeVersion || input.resume_version || {}),
    profile: normalizeProfile(input.profile || {}),
    sourceMapping: Array.isArray(input.sourceMapping || input.source_mapping)
      ? (input.sourceMapping || input.source_mapping).map(normalizeMapping)
      : []
  };
}

function normalizeResumeVersion(resumeVersion = {}) {
  return {
    id: Number(resumeVersion.id || 0),
    applicationId: Number(resumeVersion.applicationId || resumeVersion.application_id || 0),
    status: cleanText(resumeVersion.status || ""),
    resumeFields: normalizeObject(resumeVersion.resumeFields || resumeVersion.resume_fields),
    sourceMapping: Array.isArray(resumeVersion.sourceMapping || resumeVersion.source_mapping)
      ? (resumeVersion.sourceMapping || resumeVersion.source_mapping).map(normalizeMapping)
      : []
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
    resumeField: cleanText(mapping.resumeField || mapping.resume_field || ""),
    sourceType: cleanText(mapping.sourceType || mapping.source_type || ""),
    sourceId: mapping.sourceId === null || mapping.source_id === null ? null : Number(mapping.sourceId || mapping.source_id || 0),
    sourceFact: cleanMultiline(mapping.sourceFact || mapping.source_fact || "")
  };
}

function normalizeMode(value) {
  const mode = cleanText(value).toLowerCase();
  return new Set(["rules", "auto", "llm"]).has(mode) ? mode : "rules";
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(cleanMultiline).filter(Boolean).slice(0, 120);
}

function tokenSet(value) {
  return new Set(cleanText(value)
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5+#.]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2));
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

module.exports = {
  AGENT_NAME,
  extractResumeClaims,
  runClaimVerifier
};
