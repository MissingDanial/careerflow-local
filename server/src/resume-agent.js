const AGENT_NAME = "ResumeAgent";
const { DEFAULT_RESUME_TEMPLATE } = require("./resume-template-registry");

function runResumeAgent(input = {}, options = {}) {
  const context = normalizeResumeInput(input);
  const mode = normalizeMode(options.mode || input.mode || "rules");
  if (mode !== "rules") {
    return runResumeAgent(input, { ...options, mode: "rules" });
  }
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
    }
  };
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
