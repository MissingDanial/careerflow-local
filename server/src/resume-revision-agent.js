const AGENT_NAME = "ResumeRevisionAgent";
const { DEFAULT_RESUME_TEMPLATE } = require("./resume-template-registry");

function runResumeRevisionAgent(input = {}, options = {}) {
  const context = normalizeInput(input);
  const mode = normalizeMode(options.mode || input.mode || "rules");
  if (mode !== "rules") {
    return runResumeRevisionAgent(input, { ...options, mode: "rules" });
  }

  const revision = reviseFields(context);
  const unsupportedClaims = detectUnsupportedClaims(revision.resumeFields, revision.sourceMapping);
  const changed = JSON.stringify(revision.resumeFields) !== JSON.stringify(context.resumeVersion.resumeFields);
  const diffSummary = buildDiffSummary(context, revision, changed);

  return {
    ok: true,
    agent: AGENT_NAME,
    provider: "rules",
    fallbackUsed: false,
    result: {
      resumeFields: revision.resumeFields,
      sourceMapping: revision.sourceMapping,
      diffSummary,
      compressionNotes: revision.compressionNotes,
      unsupportedClaims,
      renderMetadata: {
        ...context.resumeVersion.renderMetadata,
        maxPages: 2,
        template: context.resumeVersion.renderMetadata?.template || DEFAULT_RESUME_TEMPLATE,
        revisedBy: AGENT_NAME
      },
      metadata: {
        method: "rules",
        revisedFromVersionId: context.resumeVersion.id || null,
        applicationId: context.application.id || context.resumeVersion.applicationId || null,
        resumeFitEvaluationId: context.resumeFitEvaluation.id || null,
        resumeClaimVerificationId: context.resumeClaimVerification.id || null,
        changed,
        actions: revision.actions,
        policy: {
          canProceedToReEvaluation: true,
          requiresFitReEvaluation: true,
          requiresClaimReVerification: true,
          noRealBossAction: true,
          noApplicationStatusChange: true,
          noBrowserTaskCreated: true
        }
      }
    }
  };
}

function reviseFields(context) {
  const fields = clone(context.resumeVersion.resumeFields);
  const sourceMapping = normalizeSourceMapping(context.resumeVersion.sourceMapping);
  const actions = [];

  const claimIssues = sortClaimIssuesForSafeMutation((context.resumeClaimVerification.claims || [])
    .filter((claim) => ["UNSUPPORTED", "NEEDS_USER_CONFIRMATION", "WEAK"].includes(claim.status)));
  for (const claim of claimIssues) {
    const action = applyClaimIssue(fields, sourceMapping, claim);
    if (action) {
      actions.push(action);
    }
  }

  const fitItems = Array.isArray(context.resumeFitEvaluation.coverageItems)
    ? context.resumeFitEvaluation.coverageItems
    : [];
  for (const item of fitItems.filter((coverage) => ["missing", "weak"].includes(coverage.status)).slice(0, 8)) {
    const evidence = findConfirmedEvidenceForRequirement(item.requirement, context.profile);
    if (!evidence) {
      actions.push({
        type: "fit_gap_left_for_profile_update",
        requirement: item.requirement,
        reason: "No confirmed local profile evidence matched the JD requirement."
      });
      continue;
    }
    const added = addEvidenceToResume(fields, sourceMapping, item, evidence);
    actions.push(added);
  }

  compactFields(fields);
  return {
    resumeFields: fields,
    sourceMapping: dedupeSourceMapping(sourceMapping),
    compressionNotes: [
      ...normalizeStringArray(context.resumeVersion.compressionNotes),
      "ResumeRevisionAgent kept changes within confirmed local evidence and did not create BOSS actions."
    ],
    actions
  };
}

function sortClaimIssuesForSafeMutation(claims) {
  return [...claims].sort((left, right) => {
    const leftRank = mutationRank(left.field);
    const rightRank = mutationRank(right.field);
    return rightRank.group - leftRank.group
      || rightRank.parentIndex - leftRank.parentIndex
      || rightRank.itemIndex - leftRank.itemIndex
      || cleanText(right.field).localeCompare(cleanText(left.field));
  });
}

function mutationRank(field) {
  const value = cleanText(field);
  const projectArray = value.match(/^projects\[([0-9]+)\]\.(bullets|skills)\[([0-9]+)\]$/);
  if (projectArray) {
    return {
      group: 3,
      parentIndex: Number(projectArray[1]),
      itemIndex: Number(projectArray[3])
    };
  }
  const topArray = value.match(/^(skills|awards)\[([0-9]+)\]$/);
  if (topArray) {
    return {
      group: 2,
      parentIndex: topArray[1] === "skills" ? 1 : 2,
      itemIndex: Number(topArray[2])
    };
  }
  const projectScalar = value.match(/^projects\[([0-9]+)\]\./);
  if (projectScalar) {
    return {
      group: 1,
      parentIndex: Number(projectScalar[1]),
      itemIndex: 0
    };
  }
  return {
    group: 0,
    parentIndex: 0,
    itemIndex: 0
  };
}

function applyClaimIssue(fields, sourceMapping, claim) {
  const field = cleanText(claim.field);
  if (!field) {
    return null;
  }
  if (claim.status === "UNSUPPORTED") {
    const removed = removeFieldValue(fields, sourceMapping, field);
    return removed ? {
      type: "removed_unsupported_claim",
      field,
      claim: claim.claim,
      reason: claim.reason || "No confirmed evidence supports this claim."
    } : null;
  }
  if (claim.status === "NEEDS_USER_CONFIRMATION" || claim.status === "WEAK") {
    const softened = softenFieldValue(fields, field);
    return softened ? {
      type: claim.status === "WEAK" ? "softened_weak_claim" : "softened_unconfirmed_claim",
      field,
      claim: claim.claim,
      reason: claim.reason || "Claim needs stronger evidence before audit."
    } : null;
  }
  return null;
}

function removeFieldValue(fields, sourceMapping, field) {
  const projectBullet = field.match(/^projects\[([0-9]+)\]\.bullets\[([0-9]+)\]$/);
  if (projectBullet) {
    const projectIndex = Number(projectBullet[1]);
    const bulletIndex = Number(projectBullet[2]);
    const project = fields.projects?.[projectIndex];
    if (!project || !Array.isArray(project.bullets)) {
      return false;
    }
    project.bullets.splice(bulletIndex, 1);
    removeMapping(sourceMapping, field);
    reindexProjectMappings(sourceMapping, projectIndex, "bullets", bulletIndex);
    return true;
  }
  const skill = field.match(/^skills\[([0-9]+)\]$/);
  if (skill) {
    const index = Number(skill[1]);
    if (!Array.isArray(fields.skills) || index >= fields.skills.length) {
      return false;
    }
    fields.skills.splice(index, 1);
    removeMapping(sourceMapping, field);
    reindexTopLevelMappings(sourceMapping, "skills", index);
    return true;
  }
  const award = field.match(/^awards\[([0-9]+)\]$/);
  if (award) {
    const index = Number(award[1]);
    if (!Array.isArray(fields.awards) || index >= fields.awards.length) {
      return false;
    }
    fields.awards.splice(index, 1);
    removeMapping(sourceMapping, field);
    reindexTopLevelMappings(sourceMapping, "awards", index);
    return true;
  }
  if (field === "summary" && fields.summary) {
    fields.summary = softenText(fields.summary);
    return true;
  }
  const projectRole = field.match(/^projects\[([0-9]+)\]\.role$/);
  if (projectRole) {
    const project = fields.projects?.[Number(projectRole[1])];
    if (!project?.role) {
      return false;
    }
    project.role = "";
    removeMapping(sourceMapping, field);
    return true;
  }
  return false;
}

function softenFieldValue(fields, field) {
  const projectBullet = field.match(/^projects\[([0-9]+)\]\.bullets\[([0-9]+)\]$/);
  if (projectBullet) {
    const project = fields.projects?.[Number(projectBullet[1])];
    const index = Number(projectBullet[2]);
    if (!project || !Array.isArray(project.bullets) || !project.bullets[index]) {
      return false;
    }
    project.bullets[index] = softenText(project.bullets[index]);
    return true;
  }
  if (field === "summary" && fields.summary) {
    fields.summary = softenText(fields.summary);
    return true;
  }
  return false;
}

function softenText(value) {
  return cleanMultiline(value)
    .replace(/\b(?:expert|principal|architect|owned|managed|scaled)\b/gi, "worked on")
    .replace(/\b(?:lead|leading)\b/gi, "participated in")
    .replace(/独立|主导|核心|第一/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findConfirmedEvidenceForRequirement(requirement, profile) {
  const requirementText = cleanText(requirement).toLowerCase();
  if (!requirementText) {
    return null;
  }
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  for (const skill of skills) {
    const name = cleanText(skill.name);
    if (name && includesLoose(requirementText, name)) {
      return {
        sourceType: "skill",
        sourceId: Number(skill.id || 0) || null,
        sourceFact: name,
        skillName: name,
        text: name
      };
    }
  }
  const experiences = Array.isArray(profile.experiences) ? profile.experiences : [];
  for (const experience of experiences) {
    const facts = normalizeStringArray(experience.facts);
    const skillsForExperience = normalizeStringArray(experience.skills);
    const candidates = [
      ...skillsForExperience.map((item) => ({ text: item, kind: "skill" })),
      ...facts.map((item) => ({ text: item, kind: "fact" })),
      { text: experience.evidenceText || "", kind: "evidence" }
    ].filter((item) => item.text);
    for (const candidate of candidates) {
      if (scoreText(requirementText, candidate.text) >= 0.2 || includesAny(requirementText, skillsForExperience)) {
        return {
          sourceType: "experience",
          sourceId: Number(experience.id || 0) || null,
          sourceFact: candidate.text,
          skillName: skillsForExperience.find((item) => includesLoose(requirementText, item)) || "",
          text: candidate.text,
          title: cleanText(experience.title || experience.role || experience.organization)
        };
      }
    }
  }
  return null;
}

function addEvidenceToResume(fields, sourceMapping, requirement, evidence) {
  const requirementText = cleanText(requirement.requirement);
  const skillName = cleanText(evidence.skillName || evidence.sourceFact);
  if (requirement.type === "skill" && skillName) {
    fields.skills = unique([...normalizeStringArray(fields.skills), skillName]).slice(0, 18);
    const index = fields.skills.findIndex((item) => item === skillName);
    sourceMapping.push({
      resumeField: `skills[${index}]`,
      sourceType: evidence.sourceType,
      sourceId: evidence.sourceId,
      sourceFact: evidence.sourceFact
    });
    return {
      type: "surfaced_confirmed_skill",
      requirement: requirementText,
      field: `skills[${index}]`,
      sourceType: evidence.sourceType,
      sourceId: evidence.sourceId
    };
  }

  fields.projects = Array.isArray(fields.projects) ? fields.projects : [];
  let projectIndex = fields.projects.findIndex((project) => {
    return Number(project.experienceId || 0) && Number(project.experienceId || 0) === Number(evidence.sourceId || 0);
  });
  if (projectIndex < 0) {
    projectIndex = fields.projects.findIndex((project) => Array.isArray(project.bullets) && project.bullets.length < 4);
  }
  if (projectIndex < 0) {
    projectIndex = fields.projects.length;
    fields.projects.push({
      experienceId: evidence.sourceType === "experience" ? evidence.sourceId : null,
      title: evidence.title || "Confirmed project evidence",
      organization: "",
      role: "",
      period: "",
      skills: [],
      bullets: []
    });
  }
  const project = fields.projects[projectIndex];
  project.bullets = normalizeStringArray(project.bullets);
  const bullet = buildEvidenceBullet(requirementText, evidence.text);
  if (!project.bullets.some((item) => item === bullet)) {
    project.bullets.push(bullet);
  }
  project.bullets = project.bullets.slice(0, 4);
  const bulletIndex = project.bullets.findIndex((item) => item === bullet);
  const field = `projects[${projectIndex}].bullets[${bulletIndex}]`;
  sourceMapping.push({
    resumeField: field,
    sourceType: evidence.sourceType,
    sourceId: evidence.sourceId,
    sourceFact: evidence.sourceFact
  });
  return {
    type: "surfaced_confirmed_project_evidence",
    requirement: requirementText,
    field,
    sourceType: evidence.sourceType,
    sourceId: evidence.sourceId
  };
}

function buildEvidenceBullet(requirement, evidence) {
  const cleanRequirement = cleanText(requirement);
  const cleanEvidence = cleanMultiline(evidence);
  if (!cleanRequirement || includesLoose(cleanEvidence, cleanRequirement)) {
    return cleanEvidence;
  }
  return `${cleanEvidence} Related JD requirement: ${cleanRequirement}.`;
}

function compactFields(fields) {
  fields.skills = unique(normalizeStringArray(fields.skills)).slice(0, 18);
  fields.awards = normalizeStringArray(fields.awards).slice(0, 6);
  fields.projects = (Array.isArray(fields.projects) ? fields.projects : [])
    .map((project) => ({
      ...project,
      title: cleanText(project.title || ""),
      organization: cleanText(project.organization || ""),
      role: cleanText(project.role || ""),
      period: cleanText(project.period || ""),
      skills: unique(normalizeStringArray(project.skills)).slice(0, 8),
      bullets: unique(normalizeStringArray(project.bullets)).slice(0, 4)
    }))
    .filter((project) => project.title || project.organization || project.role || project.bullets.length)
    .slice(0, 4);
}

function buildDiffSummary(context, revision, changed) {
  const fit = context.resumeFitEvaluation;
  const claim = context.resumeClaimVerification;
  return [
    changed
      ? `ResumeRevisionAgent prepared a new local resume version from version #${context.resumeVersion.id}.`
      : `ResumeRevisionAgent found no safe local changes for version #${context.resumeVersion.id}.`,
    fit?.id ? `Used resume fit evaluation #${fit.id} (${fit.coverageScore || 0}/100).` : "No fit evaluation was available.",
    claim?.id ? `Used claim verification #${claim.id} (${claim.unsupportedCount || 0} unsupported, ${claim.needsUserConfirmationCount || 0} confirm).` : "No claim verification was available.",
    `${revision.actions.length} revision action(s) recorded; no BOSS browser action was created.`
  ];
}

function detectUnsupportedClaims(fields, sourceMapping) {
  const mappedFields = new Set(sourceMapping.map((mapping) => mapping.resumeField));
  const unsupported = [];
  const projects = Array.isArray(fields.projects) ? fields.projects : [];
  for (const [projectIndex, project] of projects.entries()) {
    for (const [bulletIndex, bullet] of normalizeStringArray(project.bullets).entries()) {
      const field = `projects[${projectIndex}].bullets[${bulletIndex}]`;
      if (bullet && !mappedFields.has(field)) {
        unsupported.push(field);
      }
    }
  }
  return unsupported.slice(0, 50);
}

function removeMapping(sourceMapping, field) {
  for (let index = sourceMapping.length - 1; index >= 0; index -= 1) {
    if (sourceMapping[index].resumeField === field) {
      sourceMapping.splice(index, 1);
    }
  }
}

function reindexProjectMappings(sourceMapping, projectIndex, arrayName, removedIndex) {
  const prefix = `projects[${projectIndex}].${arrayName}[`;
  for (const mapping of sourceMapping) {
    if (!mapping.resumeField.startsWith(prefix)) {
      continue;
    }
    const match = mapping.resumeField.match(/\[([0-9]+)\]$/);
    const index = Number(match?.[1] || 0);
    if (index > removedIndex) {
      mapping.resumeField = `projects[${projectIndex}].${arrayName}[${index - 1}]`;
    }
  }
}

function reindexTopLevelMappings(sourceMapping, arrayName, removedIndex) {
  const prefix = `${arrayName}[`;
  for (const mapping of sourceMapping) {
    if (!mapping.resumeField.startsWith(prefix)) {
      continue;
    }
    const match = mapping.resumeField.match(/\[([0-9]+)\]$/);
    const index = Number(match?.[1] || 0);
    if (index > removedIndex) {
      mapping.resumeField = `${arrayName}[${index - 1}]`;
    }
  }
}

function normalizeInput(input = {}) {
  return {
    application: normalizeObject(input.application),
    job: normalizeObject(input.job),
    profile: normalizeProfile(input.profile || {}),
    resumeVersion: normalizeResumeVersion(input.resumeVersion || input.resume_version || {}),
    resumeFitEvaluation: normalizeObject(input.resumeFitEvaluation || input.resume_fit_evaluation || {}),
    resumeClaimVerification: normalizeObject(input.resumeClaimVerification || input.resume_claim_verification || {})
  };
}

function normalizeResumeVersion(resumeVersion = {}) {
  return {
    id: Number(resumeVersion.id || 0),
    applicationId: Number(resumeVersion.applicationId || resumeVersion.application_id || 0),
    screeningId: resumeVersion.screeningId || resumeVersion.screening_id || null,
    resumeFields: normalizeObject(resumeVersion.resumeFields || resumeVersion.resume_fields),
    sourceMapping: normalizeSourceMapping(resumeVersion.sourceMapping || resumeVersion.source_mapping || []),
    diffSummary: normalizeStringArray(resumeVersion.diffSummary || resumeVersion.diff_summary),
    compressionNotes: normalizeStringArray(resumeVersion.compressionNotes || resumeVersion.compression_notes),
    unsupportedClaims: normalizeStringArray(resumeVersion.unsupportedClaims || resumeVersion.unsupported_claims),
    renderMetadata: normalizeObject(resumeVersion.renderMetadata || resumeVersion.render_metadata),
    metadata: normalizeObject(resumeVersion.metadata)
  };
}

function normalizeProfile(profile = {}) {
  return {
    experiences: Array.isArray(profile.experiences) ? profile.experiences : [],
    skills: Array.isArray(profile.skills) ? profile.skills : [],
    constraints: Array.isArray(profile.constraints) ? profile.constraints : []
  };
}

function normalizeSourceMapping(value) {
  const items = Array.isArray(value) ? value : [];
  return items.map((item) => ({
    resumeField: cleanText(item?.resumeField || item?.resume_field || ""),
    sourceType: cleanText(item?.sourceType || item?.source_type || ""),
    sourceId: item?.sourceId === null || item?.source_id === null ? null : Number(item?.sourceId || item?.source_id || 0) || null,
    sourceFact: cleanMultiline(item?.sourceFact || item?.source_fact || "")
  })).filter((item) => item.resumeField || item.sourceFact);
}

function dedupeSourceMapping(items) {
  const seen = new Set();
  const output = [];
  for (const item of normalizeSourceMapping(items)) {
    const key = `${item.resumeField}|${item.sourceType}|${item.sourceId || ""}|${item.sourceFact}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output.slice(0, 200);
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

function unique(values) {
  return Array.from(new Set((values || []).map(cleanMultiline).filter(Boolean)));
}

function includesAny(haystack, needles) {
  return normalizeStringArray(needles).some((needle) => includesLoose(haystack, needle));
}

function includesLoose(left, right) {
  const leftText = cleanText(left).toLowerCase();
  const rightText = cleanText(right).toLowerCase();
  return Boolean(leftText && rightText && (leftText.includes(rightText) || rightText.includes(leftText)));
}

function scoreText(left, right) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }
  const overlap = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(1, Math.min(leftTokens.size, 12));
}

function tokenSet(value) {
  return new Set(cleanText(value)
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5+#.]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
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
  runResumeRevisionAgent
};
