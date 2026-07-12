const AGENT_NAME = "ResumeAgent";
const { DEFAULT_RESUME_TEMPLATE } = require("./resume-template-registry");
const { ResumePlanOutputSchema } = require("./agent-output-schemas");
const { loadModelConfig, requestStructuredCompletion } = require("./model-client");

const PROMPT_VERSION = "m16.resume.prompt.v1";
const AGENT_VERSION = "m16.resume.agent.v1";

function runResumeAgent(input = {}, options = {}) {
  const context = normalizeResumeInput(input);
  const mode = normalizeMode(options.mode || input.mode || "rules");
  const baseline = runRuleBasedResumeAgent(context);
  const modelConfig = loadModelConfig(options.modelConfig || {});
  if (mode === "rules" || (mode === "auto" && !modelConfig.configured)) {
    return baseline;
  }
  if (!modelConfig.configured) {
    throw resumeAgentError("LLM_CONFIG_INVALID", "OpenAI-compatible model config is not available for ResumeAgent");
  }
  return runModelResumeAgent(context, baseline, mode, modelConfig, options);
}

function runRuleBasedResumeAgent(context) {
  const selectedSkills = selectSkills(context);
  const selectedExperiences = selectExperiences(context);
  const summary = buildSummary(context, selectedSkills, selectedExperiences);
  const projects = selectedExperiences.map((experience) => buildProjectSection(experience, context)).slice(0, 4);
  const education = context.profile.experiences
    .filter((experience) => experience.kind === "education")
    .slice(0, 2)
    .map((experience) => ({
      title: experience.title,
      organization: experience.organization,
      role: experience.role,
      period: [experience.startDate, experience.endDate].filter(Boolean).join(" - "),
      bullets: experience.facts.slice(0, 3)
    }));
  const fields = {
    name: context.profile.profile.displayName || "",
    headline: context.profile.profile.headline || context.job.title || "",
    targetRole: context.job.title || "",
    contact: normalizeContact(context.profile.profile),
    summary,
    skills: selectedSkills.map((skill) => skill.name).slice(0, 18),
    projects,
    education,
    awards: context.profile.experiences
      .filter((experience) => experience.kind === "award" || experience.kind === "certification")
      .flatMap((experience) => [experience.title, ...experience.facts])
      .filter(Boolean)
      .slice(0, 6)
  };
  const sourceMapping = buildSourceMapping(fields, selectedSkills, selectedExperiences);
  const unsupportedClaims = detectUnsupportedClaims(fields, sourceMapping);

  return {
    ok: true,
    agent: AGENT_NAME,
    provider: "rules",
    fallbackUsed: false,
    result: {
      resumeFields: fields,
      sourceMapping,
      diffSummary: buildDiffSummary(context, fields),
      compressionNotes: buildCompressionNotes(context, fields),
      unsupportedClaims,
      renderHints: {
        maxPages: 2,
        template: DEFAULT_RESUME_TEMPLATE
      },
      metadata: {
        method: "rules",
        selectedExperienceIds: selectedExperiences.map((experience) => experience.id),
        selectedSkillIds: selectedSkills.map((skill) => skill.id),
        screeningId: context.screening.id || null
      }
    },
    promptVersion: "m7.resume.rules.v1",
    agentVersion: "m7.resume.rules.v1",
    telemetry: {}
  };
}

async function runModelResumeAgent(context, baseline, mode, modelConfig, options = {}) {
  const invoke = options.requestStructuredCompletion || requestStructuredCompletion;
  try {
    const completion = await invoke({
      system: resumeSystemPrompt(),
      user: JSON.stringify(buildResumeModelInput(context, baseline), null, 2),
      config: modelConfig,
      schema: ResumePlanOutputSchema,
      schemaName: "resume_plan_output"
    });
    const result = buildModelResumeResult(completion.data, context, baseline);
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
      const structured = resumeAgentError(error.code || "RESUME_AGENT_FAILED", error.message || String(error));
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
        metadata: {
          ...baseline.result.metadata,
          method: "rules_fallback",
          fallbackReason: error.code || "LLM_REQUEST_FAILED",
          requiresUserConfirmation: true
        }
      }
    };
  }
}

function buildResumeModelInput(context, baseline) {
  return {
    task: "Select confirmed evidence and tailor a concise two-page resume for this JD. Return JSON only.",
    outputSchema: {
      headline: "string; concise target headline",
      summary: "string; optional and evidence-bound",
      selectedSkillIds: ["positive confirmed skill id"],
      projects: [{
        sourceExperienceId: "positive confirmed experience id",
        skills: ["skills already supported by that experience"],
        bullets: [{
          text: "JD-tailored bullet without inventing facts",
          sourceFact: "verbatim confirmed fact supporting the bullet"
        }]
      }],
      diffSummary: ["short Chinese change summary"],
      compressionNotes: ["short two-page formatting note"]
    },
    rules: [
      "Use only IDs present in confirmedProfile.",
      "Every project bullet must cite one verbatim sourceFact from the selected experience.",
      "Do not invent metrics, employers, roles, dates, tools, ownership, awards, or outcomes.",
      "Select at most four non-education experiences and at most five bullets per experience.",
      "Prefer JD-relevant projects and preserve concrete metrics exactly.",
      "Do not add a standalone skills or summary section merely to repeat keywords.",
      "Return one strict JSON object and no markdown."
    ],
    job: context.job,
    screening: context.screening,
    confirmedProfile: {
      profile: context.profile.profile,
      experiences: context.profile.experiences,
      skills: context.profile.skills,
      constraints: context.profile.constraints
    },
    userRules: context.userRules,
    deterministicBaseline: {
      selectedExperienceIds: baseline.result.metadata.selectedExperienceIds,
      selectedSkillIds: baseline.result.metadata.selectedSkillIds,
      resumeFields: baseline.result.resumeFields
    }
  };
}

function resumeSystemPrompt() {
  return [
    "You are ResumeAgent in a local-first job application workflow.",
    "Tailor wording and evidence order to the JD without adding unsupported facts.",
    "Confirmed profile IDs and facts are the only evidence source.",
    "A rewritten bullet must preserve the meaning and metrics of its cited sourceFact.",
    "You cannot approve submission or create browser actions.",
    "Return exactly one JSON object."
  ].join("\n");
}

function buildModelResumeResult(output, context, baseline) {
  const skillById = new Map(context.profile.skills.map((skill) => [Number(skill.id || 0), skill]));
  const experienceById = new Map(context.profile.experiences.map((experience) => [Number(experience.id || 0), experience]));
  const selectedSkills = Array.from(new Set(output.selectedSkillIds || []))
    .map((id) => skillById.get(Number(id)))
    .filter(Boolean)
    .slice(0, 18);
  const projectPlans = [];
  const usedExperienceIds = new Set();
  for (const plan of output.projects || []) {
    const experience = experienceById.get(Number(plan.sourceExperienceId || 0));
    if (!experience || usedExperienceIds.has(experience.id) || ["education", "award", "certification"].includes(experience.kind)) {
      continue;
    }
    const bullets = (plan.bullets || []).map((bullet) => {
      const sourceFact = findCanonicalSourceFact(experience, bullet.sourceFact);
      if (!sourceFact) {
        return null;
      }
      return {
        text: multiline(bullet.text).slice(0, 500),
        sourceFact
      };
    }).filter((bullet) => bullet?.text).slice(0, 5);
    if (!bullets.length) {
      continue;
    }
    usedExperienceIds.add(experience.id);
    const allowedSkills = new Set([
      ...experience.skills,
      ...selectedSkills.map((skill) => skill.name)
    ].map((item) => text(item).toLowerCase()).filter(Boolean));
    projectPlans.push({
      experience,
      skills: normalizeStringArray(plan.skills).filter((skill) => allowedSkills.has(skill.toLowerCase())).slice(0, 8),
      bullets
    });
  }
  if (!projectPlans.length) {
    throw resumeAgentError(
      "AGENT_OUTPUT_EVIDENCE_INVALID",
      "ResumeAgent model output did not contain any project bullet backed by a confirmed sourceFact"
    );
  }

  const fields = {
    name: context.profile.profile.displayName || "",
    headline: text(output.headline || context.profile.profile.headline || context.job.title || "").slice(0, 180),
    targetRole: context.job.title || "",
    contact: normalizeContact(context.profile.profile),
    summary: multiline(output.summary || "").slice(0, 1200),
    skills: selectedSkills.map((skill) => skill.name).slice(0, 18),
    projects: projectPlans.map(({ experience, skills, bullets }) => ({
      title: experience.title,
      organization: experience.organization,
      role: experience.role,
      period: [experience.startDate, experience.endDate].filter(Boolean).join(" - "),
      skills,
      bullets: bullets.map((bullet) => bullet.text)
    })),
    education: context.profile.experiences
      .filter((experience) => experience.kind === "education")
      .slice(0, 2)
      .map((experience) => ({
        title: experience.title,
        organization: experience.organization,
        role: experience.role,
        period: [experience.startDate, experience.endDate].filter(Boolean).join(" - "),
        bullets: experience.facts.slice(0, 3)
      })),
    awards: context.profile.experiences
      .filter((experience) => experience.kind === "award" || experience.kind === "certification")
      .flatMap((experience) => [experience.title, ...experience.facts])
      .filter(Boolean)
      .slice(0, 6)
  };
  const sourceMapping = buildModelSourceMapping(fields, selectedSkills, projectPlans);
  const unsupportedClaims = detectUnsupportedClaims(fields, sourceMapping);
  if (unsupportedClaims.length) {
    throw resumeAgentError(
      "AGENT_OUTPUT_EVIDENCE_INVALID",
      `ResumeAgent model output contains unmapped fields: ${unsupportedClaims.join(", ")}`
    );
  }
  return {
    resumeFields: fields,
    sourceMapping,
    diffSummary: normalizeStringArray(output.diffSummary).slice(0, 12),
    compressionNotes: normalizeStringArray(output.compressionNotes).slice(0, 12),
    unsupportedClaims,
    renderHints: {
      maxPages: 2,
      template: DEFAULT_RESUME_TEMPLATE
    },
    metadata: {
      method: "llm_evidence_bounded",
      selectedExperienceIds: projectPlans.map((item) => item.experience.id),
      selectedSkillIds: selectedSkills.map((skill) => skill.id),
      screeningId: context.screening.id || null,
      evidenceValidated: true,
      noRealBossAction: true
    }
  };
}

function buildModelSourceMapping(fields, selectedSkills, projectPlans) {
  const mappings = [];
  if (fields.summary) {
    for (const plan of projectPlans.slice(0, 3)) {
      mappings.push({
        resumeField: "summary",
        sourceType: "experience",
        sourceId: plan.experience.id,
        sourceFact: plan.bullets[0].sourceFact
      });
    }
  }
  selectedSkills.forEach((skill, index) => {
    mappings.push({
      resumeField: `skills[${index}]`,
      sourceType: "skill",
      sourceId: skill.id,
      sourceFact: skill.name
    });
  });
  projectPlans.forEach((plan, projectIndex) => {
    const { experience } = plan;
    mappings.push({
      resumeField: `projects[${projectIndex}].title`,
      sourceType: "experience",
      sourceId: experience.id,
      sourceFact: experience.title || experience.role || experience.organization
    });
    if (experience.organization) {
      mappings.push({
        resumeField: `projects[${projectIndex}].organization`,
        sourceType: "experience",
        sourceId: experience.id,
        sourceFact: experience.organization
      });
    }
    if (experience.role) {
      mappings.push({
        resumeField: `projects[${projectIndex}].role`,
        sourceType: "experience",
        sourceId: experience.id,
        sourceFact: experience.role
      });
    }
    plan.skills.forEach((skill, skillIndex) => {
      mappings.push({
        resumeField: `projects[${projectIndex}].skills[${skillIndex}]`,
        sourceType: "experience",
        sourceId: experience.id,
        sourceFact: skill
      });
    });
    plan.bullets.forEach((bullet, bulletIndex) => {
      mappings.push({
        resumeField: `projects[${projectIndex}].bullets[${bulletIndex}]`,
        sourceType: "experience",
        sourceId: experience.id,
        sourceFact: bullet.sourceFact
      });
    });
  });
  return mappings.filter((mapping) => mapping.sourceFact);
}

function findCanonicalSourceFact(experience, proposed) {
  const target = multiline(proposed);
  if (!target) {
    return "";
  }
  const candidates = [
    ...experience.facts,
    experience.evidenceText
  ].map(multiline).filter(Boolean);
  const exact = candidates.find((candidate) => candidate === target);
  if (exact) {
    return exact;
  }
  const loose = candidates.find((candidate) => (
    Math.min(candidate.length, target.length) >= 12
      && (candidate.includes(target) || target.includes(candidate))
  ));
  return loose || "";
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

function resumeAgentError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.agent = AGENT_NAME;
  error.step = "prepare_resume";
  error.retryable = code === "LLM_REQUEST_FAILED" || code === "AGENT_OUTPUT_SCHEMA_INVALID";
  return error;
}

function normalizeResumeInput(input = {}) {
  return {
    application: normalizeObject(input.application),
    job: normalizeJob(input.job || {}),
    screening: normalizeScreening(input.screening || {}),
    profile: normalizeProfile(input.profile || {}),
    userRules: normalizeObject(input.userRules)
  };
}

function normalizeProfile(profile = {}) {
  return {
    profile: normalizeObject(profile.profile || profile),
    experiences: Array.isArray(profile.experiences) ? profile.experiences.map(normalizeExperience) : [],
    skills: Array.isArray(profile.skills) ? profile.skills.map(normalizeSkill) : [],
    constraints: Array.isArray(profile.constraints) ? profile.constraints.map(normalizeConstraint) : []
  };
}

function normalizeJob(job = {}) {
  return {
    id: Number(job.id || 0),
    title: text(job.title || ""),
    company: text(job.company || job.companyName || ""),
    salary: text(job.salary || ""),
    location: text(job.location || ""),
    experience: text(job.experience || ""),
    education: text(job.education || ""),
    tags: normalizeStringArray(job.tags),
    welfare: normalizeStringArray(job.welfare),
    description: multiline(job.description || ""),
    detailUrl: text(job.detailUrl || job.detail_url || "")
  };
}

function normalizeScreening(screening = {}) {
  return {
    id: Number(screening.id || 0),
    matchScore: Number(screening.matchScore || screening.match_score || 0),
    riskScore: Number(screening.riskScore || screening.risk_score || 0),
    recommendation: text(screening.recommendation || ""),
    matchedPoints: normalizeStringArray(screening.matchedPoints || screening.matched_points),
    riskPoints: normalizeStringArray(screening.riskPoints || screening.risk_points),
    resumeStrategy: normalizeStringArray(screening.resumeStrategy || screening.resume_strategy)
  };
}

function normalizeExperience(experience = {}) {
  return {
    id: Number(experience.id || 0),
    kind: text(experience.kind || "project").toLowerCase(),
    title: text(experience.title || ""),
    organization: text(experience.organization || ""),
    role: text(experience.role || ""),
    startDate: text(experience.startDate || ""),
    endDate: text(experience.endDate || ""),
    facts: normalizeStringArray(experience.facts),
    skills: normalizeStringArray(experience.skills),
    evidenceText: multiline(experience.evidenceText || ""),
    confidence: text(experience.confidence || ""),
    allowedRewrites: normalizeStringArray(experience.allowedRewrites),
    forbiddenClaims: normalizeStringArray(experience.forbiddenClaims)
  };
}

function normalizeSkill(skill = {}) {
  return {
    id: Number(skill.id || 0),
    name: text(skill.name || ""),
    category: text(skill.category || ""),
    proficiency: text(skill.proficiency || ""),
    evidence: normalizeStringArray(skill.evidence)
  };
}

function normalizeConstraint(constraint = {}) {
  return {
    id: Number(constraint.id || 0),
    ruleType: text(constraint.ruleType || ""),
    content: multiline(constraint.content || ""),
    severity: text(constraint.severity || "")
  };
}

function normalizeContact(profile = {}) {
  const target = normalizeObject(profile.target || {});
  const contact = normalizeObject(profile.contact || target.contact || {});
  return {
    phone: text(contact.phone || profile.phone || target.phone || ""),
    email: text(contact.email || profile.email || target.email || ""),
    website: text(contact.website || profile.website || target.website || ""),
    github: text(contact.github || profile.github || target.github || "")
  };
}

function selectSkills(context) {
  const jobText = searchableText([context.job.title, context.job.tags, context.job.description, context.screening.matchedPoints]);
  return context.profile.skills
    .map((skill) => ({
      ...skill,
      score: containsLoose(jobText, skill.name) ? 3 : containsLoose(jobText, skill.category) ? 1 : 0
    }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .filter((skill, index) => skill.score > 0 || index < 8)
    .slice(0, 12);
}

function selectExperiences(context) {
  const jobText = searchableText([context.job.title, context.job.tags, context.job.description, context.screening.matchedPoints]);
  const scored = context.profile.experiences
    .filter((experience) => experience.kind !== "education" && experience.kind !== "award" && experience.kind !== "certification")
    .map((experience) => ({
      ...experience,
      score: scoreExperience(experience, jobText)
    }))
    .sort((left, right) => right.score - left.score || left.id - right.id);
  return scored.filter((experience, index) => experience.score > 0 || index < 3).slice(0, 4);
}

function scoreExperience(experience, jobText) {
  const terms = [
    experience.title,
    experience.role,
    experience.organization,
    ...experience.skills,
    ...experience.facts
  ].filter(Boolean);
  return terms.reduce((score, term) => score + (containsLoose(jobText, term) ? 1 : 0), 0);
}

function buildSummary(context, skills, experiences) {
  const target = context.job.title || context.profile.profile.target?.roles?.[0] || "目标岗位";
  const skillText = skills.slice(0, 5).map((skill) => skill.name).filter(Boolean).join("、");
  const experienceText = experiences[0]?.title || experiences[0]?.role || "";
  return [
    `面向${target}，突出与岗位 JD 直接相关的真实项目和执行经验。`,
    skillText ? `可呈现能力包括：${skillText}。` : "",
    experienceText ? `核心证明来自：${experienceText}。` : "",
    context.screening.matchScore ? `当前岗位匹配评分 ${context.screening.matchScore}/100，风险评分 ${context.screening.riskScore}/100。` : ""
  ].filter(Boolean).join("");
}

function buildProjectSection(experience, context) {
  const bullets = prioritizeFacts(experience, context).slice(0, 4);
  return {
    experienceId: experience.id,
    title: experience.title || experience.role || experience.organization || "项目经历",
    organization: experience.organization,
    role: experience.role,
    period: [experience.startDate, experience.endDate].filter(Boolean).join(" - "),
    skills: experience.skills.slice(0, 8),
    bullets
  };
}

function prioritizeFacts(experience, context) {
  const jobText = searchableText([context.job.title, context.job.description, context.job.tags, context.screening.matchedPoints]);
  const facts = experience.facts.length ? experience.facts : [experience.evidenceText].filter(Boolean);
  return facts
    .map((fact) => ({ fact, matched: containsLoose(jobText, fact) }))
    .sort((left, right) => Number(right.matched) - Number(left.matched))
    .map((item) => item.fact);
}

function buildSourceMapping(fields, skills, experiences) {
  const mappings = [];
  if (fields.summary) {
    mappings.push({
      resumeField: "summary",
      sourceType: "profile",
      sourceId: null,
      sourceFact: "Generated only from confirmed profile, skills, experiences, and current JD."
    });
  }
  skills.forEach((skill, index) => {
    mappings.push({
      resumeField: `skills[${index}]`,
      sourceType: "skill",
      sourceId: skill.id,
      sourceFact: skill.name
    });
  });
  experiences.forEach((experience, projectIndex) => {
    mappings.push({
      resumeField: `projects[${projectIndex}].title`,
      sourceType: "experience",
      sourceId: experience.id,
      sourceFact: experience.title || experience.role || experience.organization
    });
    if (experience.organization) {
      mappings.push({
        resumeField: `projects[${projectIndex}].organization`,
        sourceType: "experience",
        sourceId: experience.id,
        sourceFact: experience.organization
      });
    }
    if (experience.role) {
      mappings.push({
        resumeField: `projects[${projectIndex}].role`,
        sourceType: "experience",
        sourceId: experience.id,
        sourceFact: experience.role
      });
    }
    experience.skills.slice(0, 8).forEach((skill, skillIndex) => {
      mappings.push({
        resumeField: `projects[${projectIndex}].skills[${skillIndex}]`,
        sourceType: "experience",
        sourceId: experience.id,
        sourceFact: skill
      });
    });
    const project = fields.projects[projectIndex] || {};
    normalizeStringArray(project.bullets).slice(0, 4).forEach((bullet, factIndex) => {
      mappings.push({
        resumeField: `projects[${projectIndex}].bullets[${factIndex}]`,
        sourceType: "experience",
        sourceId: experience.id,
        sourceFact: findSourceFactForBullet(bullet, experience)
      });
    });
  });
  return mappings.filter((mapping) => mapping.sourceFact);
}

function findSourceFactForBullet(bullet, experience) {
  const normalizedBullet = multiline(bullet);
  const exact = experience.facts.find((fact) => multiline(fact) === normalizedBullet);
  if (exact) {
    return exact;
  }
  const loose = experience.facts.find((fact) => {
    const value = multiline(fact);
    return value && (value.includes(normalizedBullet) || normalizedBullet.includes(value));
  });
  return loose || normalizedBullet || experience.evidenceText || experience.title;
}

function detectUnsupportedClaims(fields, sourceMapping) {
  const mappedFields = new Set(sourceMapping.map((mapping) => mapping.resumeField));
  const unsupported = [];
  if (fields.summary && !mappedFields.has("summary")) {
    unsupported.push("summary");
  }
  fields.projects.forEach((project, projectIndex) => {
    project.bullets.forEach((bullet, bulletIndex) => {
      const field = `projects[${projectIndex}].bullets[${bulletIndex}]`;
      if (bullet && !mappedFields.has(field)) {
        unsupported.push(field);
      }
    });
  });
  return unsupported;
}

function buildDiffSummary(context, fields) {
  return [
    `围绕 ${context.job.title || "目标岗位"} 重排经历。`,
    fields.skills.length ? `技能区保留 ${fields.skills.length} 项岗位相关技能。` : "技能区暂无可确认技能。",
    fields.projects.length ? `项目区选取 ${fields.projects.length} 段已确认经历。` : "项目区暂无可确认经历。"
  ];
}

function buildCompressionNotes(context, fields) {
  const notes = [];
  const bulletCount = fields.projects.reduce((count, project) => count + project.bullets.length, 0);
  if (bulletCount > 12) {
    notes.push("项目 bullet 较多，渲染时需压缩到 2 页内。");
  }
  if (context.job.description.length < 300) {
    notes.push("JD 信息偏短，简历定制置信度偏低。");
  }
  return notes;
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

function searchableText(parts) {
  return parts.flat(Infinity).map(text).join("\n").toLowerCase();
}

function containsLoose(haystack, needle) {
  const normalizedNeedle = text(needle).toLowerCase();
  return normalizedNeedle.length >= 2 && String(haystack || "").includes(normalizedNeedle);
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function multiline(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map(text)
    .filter(Boolean)
    .join("\n")
    .trim();
}

module.exports = {
  runResumeAgent
};
