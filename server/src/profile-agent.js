const fs = require("fs");
const path = require("path");

const AGENT_NAME = "ProfileAgent";
const PROVIDER = "rules";
const CONTEXT_FILE_NAME = "career_agent_context.md";

const DEFAULT_PROJECT_LINKS = [
  {
    aliases: ["SmartStor-EduHub", "EduHub"],
    label: "SmartStor-EduHub / AI education copilot",
    link: "https://github.com/MissingDanial/SmartStor-EduHub"
  },
  {
    aliases: ["Nazhi"],
    label: "Nazhi personal knowledge app",
    link: "https://github.com/MissingDanial/Nazhi"
  },
  {
    aliases: ["StyleMuse"],
    label: "StyleMuse AI writing quality system",
    link: "https://github.com/MissingDanial/StyleMuse"
  },
  {
    aliases: ["HealTeam"],
    label: "HealTeam family therapy AI companion",
    link: "https://github.com/MissingDanial/HealTeam"
  },
  {
    aliases: ["Workstation-Layout"],
    label: "Workstation-Layout VLM workspace analysis",
    link: "https://github.com/MissingDanial/Workstation-Layout"
  },
  {
    aliases: ["PetZodiacTest"],
    label: "PetZodiacTest mini program",
    link: "https://github.com/MissingDanial/PetZodiacTest"
  },
  {
    aliases: ["Image-table-to-Excel-table"],
    label: "Image table to Excel automation",
    link: "https://github.com/MissingDanial/Image-table-to-Excel-table"
  },
  {
    aliases: ["GIS_field"],
    label: "GIS_field spatial analysis",
    link: "https://github.com/MissingDanial/GIS_field"
  }
];

function buildCareerContext(input = {}, options = {}) {
  const bundle = normalizeProfileBundle(input.profileBundle || input.profile || {});
  const resumeSource = normalizeResumeSource(input.resumeSource || selectLatestResumeSource(bundle.resumeSources));
  const answers = normalizeAnswers(input.answers || {});
  const now = options.now || new Date().toISOString();
  const projectLinks = Array.isArray(options.projectLinks) && options.projectLinks.length
    ? options.projectLinks
    : DEFAULT_PROJECT_LINKS;

  const confirmedExperiences = bundle.experiences;
  const confirmedSkills = bundle.skills;
  const constraints = bundle.constraints;
  const pendingDrafts = bundle.pendingFactDrafts;
  const pendingExperiences = pendingDrafts.filter((draft) => draft.draftType === "experience");
  const pendingSkills = pendingDrafts.filter((draft) => draft.draftType === "skill");
  const pendingQuestions = pendingDrafts.filter((draft) => draft.draftType === "question");

  const targetRoles = normalizeStringArray(bundle.profile.target.roles || bundle.profile.target.targetRoles);
  const targetCities = normalizeStringArray(bundle.profile.target.cities || bundle.profile.target.locations);
  const excludedDirections = constraints
    .filter((constraint) => constraint.ruleType === "excluded_direction")
    .map((constraint) => constraint.content)
    .filter(Boolean);

  const education = confirmedExperiences.filter((item) => item.kind === "education");
  const projects = confirmedExperiences.filter((item) => item.kind !== "education");
  const resumeReadyFacts = buildResumeReadyFacts(confirmedExperiences, confirmedSkills);
  const expressionRiskFacts = buildExpressionRiskFacts(pendingExperiences, pendingSkills, projectLinks);
  const majorRiskFacts = buildMajorRiskFacts(constraints);
  const projectLibrary = buildProjectLibrary(confirmedExperiences, pendingExperiences, projectLinks);
  const skillMap = buildSkillMap(confirmedSkills, pendingSkills, confirmedExperiences);
  const missingQuestions = buildMissingQuestions({
    targetRoles,
    education,
    projects,
    resumeSource,
    pendingQuestions,
    pendingExperiences,
    answers
  });
  const forbiddenClaims = buildForbiddenClaims(confirmedExperiences, constraints);
  const recommendedVersions = buildRecommendedVersions(targetRoles, confirmedSkills, confirmedExperiences);
  const context = {
    generatedAt: now,
    provider: PROVIDER,
    profile: bundle.profile,
    sourceSummary: {
      resumeSourceId: resumeSource.id || null,
      resumeFileName: resumeSource.fileName || "",
      resumeTextLength: resumeSource.textLength || 0,
      confirmedExperienceCount: confirmedExperiences.length,
      confirmedSkillCount: confirmedSkills.length,
      pendingDraftCount: pendingDrafts.length,
      answerCount: answers.length
    },
    positioning: buildPositioning(bundle.profile, targetRoles, confirmedSkills, confirmedExperiences),
    targetRoleClusters: buildTargetRoleClusters(targetRoles, confirmedSkills, confirmedExperiences),
    targetCities,
    excludedDirections,
    education,
    resumeReadyFacts,
    expressionRiskFacts,
    majorRiskFacts,
    projectLibrary,
    skillMap,
    rewriteRules: buildRewriteRules(),
    forbiddenClaims,
    jdMatchingGuidance: buildJdMatchingGuidance(targetRoles, confirmedSkills, confirmedExperiences, excludedDirections),
    recommendedResumeVersions: recommendedVersions,
    missingQuestions,
    answers
  };

  return {
    ok: true,
    agent: AGENT_NAME,
    provider: PROVIDER,
    fallbackUsed: false,
    result: {
      context,
      markdown: renderCareerContextMarkdown(context),
      missingQuestions,
      summary: {
        profileId: bundle.profile.id || null,
        resumeSourceId: resumeSource.id || null,
        confirmedExperienceCount: confirmedExperiences.length,
        confirmedSkillCount: confirmedSkills.length,
        pendingExperienceDraftCount: pendingExperiences.length,
        pendingSkillDraftCount: pendingSkills.length,
        pendingQuestionCount: pendingQuestions.length,
        missingQuestionCount: missingQuestions.length,
        majorRiskCount: majorRiskFacts.length,
        expressionRiskCount: expressionRiskFacts.length
      }
    }
  };
}

function writeCareerContextFile(markdown, options = {}) {
  const filePath = resolveCareerContextPath(options);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, String(markdown || ""), "utf8");
  const stat = fs.statSync(filePath);
  return {
    filePath,
    fileName: path.basename(filePath),
    bytes: stat.size,
    updatedAt: stat.mtime.toISOString()
  };
}

function readCareerContextFile(options = {}) {
  const filePath = resolveCareerContextPath(options);
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      filePath,
      fileName: path.basename(filePath),
      markdown: "",
      bytes: 0,
      updatedAt: ""
    };
  }
  const stat = fs.statSync(filePath);
  return {
    exists: true,
    filePath,
    fileName: path.basename(filePath),
    markdown: fs.readFileSync(filePath, "utf8"),
    bytes: stat.size,
    updatedAt: stat.mtime.toISOString()
  };
}

function resolveCareerContextPath(options = {}) {
  if (options.filePath) {
    return path.resolve(String(options.filePath));
  }
  const dataDir = path.resolve(options.dataDir || path.join(__dirname, "..", "data"));
  return path.join(dataDir, "career_context", CONTEXT_FILE_NAME);
}

function normalizeProfileBundle(bundle = {}) {
  const profile = normalizeProfile(bundle.profile || bundle);
  return {
    profile,
    resumeSources: Array.isArray(bundle.resumeSources) ? bundle.resumeSources.map(normalizeResumeSource) : [],
    experiences: Array.isArray(bundle.experiences) ? bundle.experiences.map(normalizeExperience).filter(hasExperienceContent) : [],
    skills: Array.isArray(bundle.skills) ? bundle.skills.map(normalizeSkill).filter((skill) => skill.name) : [],
    constraints: Array.isArray(bundle.constraints) ? bundle.constraints.map(normalizeConstraint).filter((constraint) => constraint.ruleType || constraint.content) : [],
    pendingFactDrafts: Array.isArray(bundle.pendingFactDrafts) ? bundle.pendingFactDrafts.map(normalizeDraft).filter((draft) => draft.draftType || draft.title) : []
  };
}

function normalizeProfile(profile = {}) {
  return {
    id: Number(profile.id || 0),
    displayName: text(profile.displayName || profile.display_name || ""),
    headline: text(profile.headline || ""),
    location: text(profile.location || ""),
    target: normalizeObject(profile.target || {}),
    summary: multiline(profile.summary || ""),
    createdAt: text(profile.createdAt || profile.created_at || ""),
    updatedAt: text(profile.updatedAt || profile.updated_at || "")
  };
}

function normalizeResumeSource(source = {}) {
  return {
    id: Number(source.id || 0),
    profileId: Number(source.profileId || source.profile_id || 0),
    sourceType: text(source.sourceType || source.source_type || ""),
    fileName: text(source.fileName || source.file_name || ""),
    filePath: text(source.filePath || source.file_path || ""),
    rawText: multiline(source.rawText || source.raw_text || source.text || ""),
    textLength: Number(source.textLength || String(source.rawText || source.raw_text || source.text || "").length || 0),
    parsed: normalizeObject(source.parsed || {}),
    metadata: normalizeObject(source.metadata || {}),
    createdAt: text(source.createdAt || source.created_at || "")
  };
}

function normalizeExperience(experience = {}) {
  return {
    id: Number(experience.id || 0),
    kind: text(experience.kind || "project").toLowerCase() || "project",
    title: text(experience.title || ""),
    organization: text(experience.organization || ""),
    role: text(experience.role || ""),
    startDate: text(experience.startDate || experience.start_date || ""),
    endDate: text(experience.endDate || experience.end_date || ""),
    facts: normalizeStringArray(experience.facts),
    skills: normalizeStringArray(experience.skills),
    evidenceText: multiline(experience.evidenceText || experience.evidence_text || ""),
    evidenceSource: text(experience.evidenceSource || experience.evidence_source || ""),
    confidence: text(experience.confidence || ""),
    allowedRewrites: normalizeStringArray(experience.allowedRewrites || experience.allowed_rewrites),
    forbiddenClaims: normalizeStringArray(experience.forbiddenClaims || experience.forbidden_claims)
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
    ruleType: text(constraint.ruleType || constraint.rule_type || "").toLowerCase(),
    content: multiline(constraint.content || ""),
    severity: text(constraint.severity || "").toLowerCase() || "warning",
    metadata: normalizeObject(constraint.metadata || {})
  };
}

function normalizeDraft(draft = {}) {
  return {
    id: Number(draft.id || 0),
    resumeSourceId: draft.resumeSourceId === null || draft.resume_source_id === null ? null : Number(draft.resumeSourceId || draft.resume_source_id || 0),
    draftType: text(draft.draftType || draft.draft_type || "").toLowerCase(),
    status: text(draft.status || "").toUpperCase(),
    title: text(draft.title || ""),
    content: normalizeObject(draft.content || {}),
    evidenceText: multiline(draft.evidenceText || draft.evidence_text || ""),
    confidence: text(draft.confidence || ""),
    metadata: normalizeObject(draft.metadata || {})
  };
}

function normalizeAnswers(value) {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => item && typeof item === "object" ? {
        id: text(item.id || item.questionId || `answer_${index + 1}`),
        question: multiline(item.question || item.prompt || ""),
        answer: multiline(item.answer || item.content || item.text || "")
      } : {
        id: `answer_${index + 1}`,
        question: "",
        answer: multiline(item)
      })
      .filter((item) => item.answer);
  }
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, answer]) => ({
      id: text(key),
      question: "",
      answer: multiline(answer)
    })).filter((item) => item.answer);
  }
  return [];
}

function selectLatestResumeSource(sources = []) {
  return sources.slice().sort((left, right) => Number(right.id || 0) - Number(left.id || 0))[0] || {};
}

function buildPositioning(profile, targetRoles, skills, experiences) {
  if (profile.summary) {
    return profile.summary;
  }
  const roleText = targetRoles[0] || profile.headline || "AI product / product operations candidate";
  const skillText = skills.slice(0, 4).map((skill) => skill.name).filter(Boolean).join(", ");
  const projectText = experiences.find((item) => item.kind !== "education")?.title || "";
  return [
    `面向${roleText}的求职定位`,
    skillText ? `突出${skillText}` : "",
    projectText ? `以${projectText}等项目作为主要证据` : ""
  ].filter(Boolean).join("，") + "。";
}

function buildTargetRoleClusters(targetRoles, skills, experiences) {
  const clusters = [];
  for (const role of targetRoles.slice(0, 6)) {
    clusters.push({
      name: role,
      priority: "primary",
      reason: "来自用户目标设置"
    });
  }
  const textBlob = searchable([skills.map((skill) => skill.name), experiences.map((item) => [item.title, item.role, item.skills])]);
  if (/AI|AIGC|LLM|LangGraph|OpenAI|Prompt|RAG|大模型|智能体/i.test(textBlob)) {
    clusters.push({ name: "AI 产品 / 大模型应用", priority: "expandable", reason: "经历中包含 AI、大模型或智能体项目证据" });
  }
  if (/product|需求|用户|竞品|原型|Figma|Axure|产品/i.test(textBlob)) {
    clusters.push({ name: "产品经理 / 产品策划", priority: "expandable", reason: "经历中包含需求、用户、原型或产品设计证据" });
  }
  if (/Node|React|Python|SQLite|Chrome Extension|Playwright|工程|开发/i.test(textBlob)) {
    clusters.push({ name: "AI 产品工程 / 工具型开发", priority: "expandable", reason: "经历中包含前后端、插件或自动化工程证据" });
  }
  return uniqueBy(clusters, (item) => item.name).slice(0, 8);
}

function buildResumeReadyFacts(experiences, skills) {
  const experienceFacts = experiences.map((experience) => ({
    type: "experience",
    riskLevel: "strong",
    title: experience.title || experience.role || experience.organization || `experience:${experience.id}`,
    label: labelForExperience(experience),
    facts: experience.facts.slice(0, 8),
    skills: experience.skills.slice(0, 10),
    evidenceSource: experience.evidenceSource || experience.evidenceText || `profile_experiences:${experience.id}`
  }));
  const skillFacts = skills.map((skill) => ({
    type: "skill",
    riskLevel: "strong",
    title: skill.name,
    label: skill.category || "skill",
    facts: [`熟练度边界：${skill.proficiency || "familiar"}`],
    skills: [skill.name],
    evidenceSource: skill.evidence.length ? skill.evidence.join("; ") : `profile_skills:${skill.id}`
  }));
  return experienceFacts.concat(skillFacts).filter((item) => item.title).slice(0, 80);
}

function buildExpressionRiskFacts(pendingExperiences, pendingSkills, projectLinks) {
  const experienceItems = pendingExperiences.map((draft) => ({
    type: "pending_experience",
    riskLevel: "expression-risk",
    title: draft.title || draft.content.title || `pending:${draft.id}`,
    suggestedLabel: suggestFlexibleLabel(draft),
    facts: normalizeStringArray(draft.content.facts || [draft.evidenceText]).slice(0, 6),
    evidenceSource: draft.evidenceText || `profile_fact_drafts:${draft.id}`,
    projectLink: findProjectLink(draft.title || draft.evidenceText, projectLinks)?.link || "",
    interviewNote: "可用于提升 JD 适配度，但在进入正式投递简历前需要用户确认表述边界。"
  }));
  const skillItems = pendingSkills.map((draft) => ({
    type: "pending_skill",
    riskLevel: "expression-risk",
    title: draft.title || draft.content.name || `pending_skill:${draft.id}`,
    suggestedLabel: "技能证据待确认",
    facts: [draft.evidenceText || draft.title].filter(Boolean),
    evidenceSource: `profile_fact_drafts:${draft.id}`,
    projectLink: "",
    interviewNote: "技能可以作为检索和追问线索，但不能直接当作 confirmed skill 使用。"
  }));
  return experienceItems.concat(skillItems).filter((item) => item.title).slice(0, 80);
}

function buildMajorRiskFacts(constraints) {
  return constraints
    .filter((constraint) => constraint.severity === "blocker" || constraint.ruleType === "forbidden_claim" || constraint.ruleType === "hard_limit")
    .map((constraint) => ({
      type: constraint.ruleType || "risk",
      riskLevel: "major-risk",
      title: constraint.content,
      reason: constraint.severity === "blocker" ? "用户或系统标记为 blocker" : "简历高压线或硬约束",
      action: constraint.ruleType === "excluded_direction" ? "筛选阶段直接跳过命中 JD" : "生成简历时禁止使用或必须人工确认"
    }));
}

function buildProjectLibrary(experiences, pendingExperiences, projectLinks) {
  const confirmed = experiences.map((experience) => projectItemFromExperience(experience, "confirmed", projectLinks));
  const pending = pendingExperiences.map((draft) => projectItemFromDraft(draft, projectLinks));
  return confirmed.concat(pending).filter((item) => item.name).slice(0, 60);
}

function projectItemFromExperience(experience, status, projectLinks) {
  const projectLink = findProjectLink([experience.title, experience.organization, experience.evidenceText].join(" "), projectLinks);
  return {
    name: experience.title || experience.organization || experience.role || `experience:${experience.id}`,
    period: [experience.startDate, experience.endDate].filter(Boolean).join(" - "),
    nature: labelForExperience(experience),
    status,
    role: experience.role,
    scenario: firstSentence(experience.evidenceText || experience.facts.join(" ")),
    facts: experience.facts.slice(0, 6),
    skills: experience.skills.slice(0, 10),
    link: projectLink?.link || "",
    evidenceSource: experience.evidenceSource || `profile_experiences:${experience.id}`,
    pendingChecks: []
  };
}

function projectItemFromDraft(draft, projectLinks) {
  const title = draft.title || draft.content.title || `pending:${draft.id}`;
  const projectLink = findProjectLink([title, draft.evidenceText].join(" "), projectLinks);
  return {
    name: title,
    period: [draft.content.startDate, draft.content.endDate].filter(Boolean).join(" - "),
    nature: suggestFlexibleLabel(draft),
    status: "pending",
    role: text(draft.content.role || ""),
    scenario: firstSentence(draft.evidenceText || normalizeStringArray(draft.content.facts).join(" ")),
    facts: normalizeStringArray(draft.content.facts || [draft.evidenceText]).slice(0, 6),
    skills: normalizeStringArray(draft.content.skills).slice(0, 10),
    link: projectLink?.link || "",
    evidenceSource: `profile_fact_drafts:${draft.id}`,
    pendingChecks: [
      "确认经历性质",
      "确认个人职责边界",
      "确认可公开指标和项目状态"
    ]
  };
}

function buildSkillMap(skills, pendingSkills, experiences) {
  const map = new Map();
  for (const skill of skills) {
    upsertSkillMap(map, skill.name, {
      category: skill.category || inferSkillCategory(skill.name),
      proficiency: skill.proficiency || "familiar",
      evidence: skill.evidence.length ? skill.evidence : [`profile_skills:${skill.id}`],
      status: "confirmed"
    });
  }
  for (const experience of experiences) {
    for (const skill of experience.skills) {
      upsertSkillMap(map, skill, {
        category: inferSkillCategory(skill),
        proficiency: "evidence-backed",
        evidence: [experience.title || `profile_experiences:${experience.id}`],
        status: "confirmed"
      });
    }
  }
  for (const draft of pendingSkills) {
    upsertSkillMap(map, draft.title || draft.content.name, {
      category: draft.content.category || inferSkillCategory(draft.title || draft.content.name || ""),
      proficiency: draft.content.proficiency || "needs_review",
      evidence: [draft.evidenceText || `profile_fact_drafts:${draft.id}`],
      status: "pending"
    });
  }
  return Array.from(map.values()).slice(0, 80);
}

function upsertSkillMap(map, name, item) {
  const key = text(name);
  if (!key) {
    return;
  }
  const current = map.get(key) || {
    name: key,
    category: item.category || "",
    proficiency: item.proficiency || "",
    evidence: [],
    status: item.status || "confirmed"
  };
  current.category = current.category || item.category || "";
  current.proficiency = rankProficiency(current.proficiency, item.proficiency);
  current.status = current.status === "confirmed" || item.status === "confirmed" ? "confirmed" : "pending";
  current.evidence = uniqueStrings(current.evidence.concat(item.evidence || [])).slice(0, 8);
  map.set(key, current);
}

function rankProficiency(left, right) {
  const order = ["", "needs_review", "aware", "basic", "familiar", "evidence-backed", "proficient", "expert"];
  return order.indexOf(right) > order.indexOf(left) ? right : left;
}

function buildRewriteRules() {
  return [
    "简历顺序优先：学历背景 -> 实习与项目 -> 其他补充；求职摘要和技能关键词不是必填项。",
    "项目经历必须围绕目标 JD 重排和改写，优先保留最能证明岗位能力的 3-4 个项目。",
    "真实参与但雇佣、商业或合作边界复杂的经历，不直接删除；优先使用产品实践、合作项目、商业化项目、创业项目、项目负责人等可解释标签。",
    "技能应嵌入项目 bullet，而不是堆叠成孤立关键词。",
    "DOCX 默认控制在 2 页以内，删除低相关补充经历，保留项目链接和可解释证据。",
    "后续 ResumeAgent 只能改写表达和顺序，不能新增没有证据的公司、岗位、奖项、指标或上线状态。"
  ];
}

function buildForbiddenClaims(experiences, constraints) {
  const defaults = [
    "不得编造公司、实习、雇佣关系、客户关系、奖项或证书。",
    "不得把 demo、课程项目或本地原型写成已上线商业产品。",
    "不得把了解或接触过的技能写成熟练、精通或主导。",
    "不得编造用户数、营收、转化率、性能提升等量化指标。",
    "不得把平台自动化写成绕过风控或绕过验证。"
  ];
  const experienceRules = experiences.flatMap((experience) => experience.forbiddenClaims || []);
  const constraintRules = constraints
    .filter((constraint) => constraint.ruleType === "forbidden_claim" || constraint.ruleType === "hard_limit")
    .map((constraint) => constraint.content);
  return uniqueStrings(defaults.concat(experienceRules, constraintRules)).slice(0, 80);
}

function buildJdMatchingGuidance(targetRoles, skills, experiences, excludedDirections) {
  const skillNames = skills.map((skill) => skill.name).filter(Boolean);
  const projectNames = experiences.filter((item) => item.kind !== "education").map((item) => item.title).filter(Boolean);
  return {
    highFitSignals: uniqueStrings([
      ...targetRoles.map((role) => `JD 明确包含目标方向：${role}`),
      ...skillNames.slice(0, 8).map((skill) => `JD 要求 ${skill} 且本地证据已确认`),
      ...projectNames.slice(0, 6).map((project) => `可用 ${project} 对应 JD 项目要求`)
    ]).slice(0, 20),
    mediumFitSignals: [
      "JD 方向相近但缺少明确项目证据时，可进入人工复核或补充追问。",
      "JD 要求的工具/方法在 pending 草稿中出现时，可先标记 expression-risk，不直接作为 confirmed fact。"
    ],
    skipSignals: excludedDirections.length
      ? excludedDirections.map((item) => `命中用户排斥方向：${item}`)
      : ["销售、直播、纯电话邀约、强地推等方向如被用户配置为 excluded_direction，应在风险门禁直接跳过。"]
  };
}

function buildRecommendedVersions(targetRoles, skills, experiences) {
  const versions = [];
  const roleSeeds = targetRoles.length ? targetRoles.slice(0, 4) : ["AI 产品", "产品经理"];
  for (const role of roleSeeds) {
    versions.push({
      name: `${role} 定制版`,
      targetRole: role,
      projectOrder: rankProjectsForRole(role, experiences),
      emphasizeSkills: rankSkillsForRole(role, skills),
      removeOrCompress: ["低相关补充经历", "孤立技能关键词", "无法解释的指标"],
      mustKeep: ["学历背景", "项目链接", "可解释的个人职责和交付物"],
      mustAvoid: ["未确认事实", "夸大上线状态", "不可证明指标"]
    });
  }
  return uniqueBy(versions, (item) => item.name).slice(0, 4);
}

function rankProjectsForRole(role, experiences) {
  const roleText = searchable(role);
  return experiences
    .filter((item) => item.kind !== "education")
    .map((experience) => ({
      title: experience.title || experience.organization || `experience:${experience.id}`,
      score: containsLoose(searchable([experience.title, experience.role, experience.skills, experience.facts]), roleText) ? 2 : 0
    }))
    .sort((left, right) => right.score - left.score)
    .map((item) => item.title)
    .slice(0, 4);
}

function rankSkillsForRole(role, skills) {
  const roleText = searchable(role);
  return skills
    .map((skill) => ({
      name: skill.name,
      score: containsLoose(searchable([skill.name, skill.category]), roleText) ? 2 : 0
    }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .map((item) => item.name)
    .slice(0, 10);
}

function buildMissingQuestions(input) {
  const questions = [];
  if (!input.resumeSource.id) {
    questions.push(question("resume_source_missing", "请上传或导入一份简历原文，作为 ProfileAgent 复盘的基础证据。"));
  }
  if (!input.targetRoles.length) {
    questions.push(question("target_roles_missing", "请确认优先投递的 2-4 类岗位，例如 AI 产品、产品经理、AI 产品工程等。"));
  }
  if (!input.education.length) {
    questions.push(question("education_missing", "请确认学历、学校、专业、毕业时间和可公开成绩/荣誉边界。"));
  }
  if (!input.projects.length) {
    questions.push(question("confirmed_projects_missing", "请确认至少 2-4 个可投递使用的项目/实习经历，包含角色、交付物、结果和项目链接。"));
  }
  for (const draft of input.pendingQuestions.slice(0, 12)) {
    questions.push(question(
      `pending_question_${draft.id}`,
      draft.content.question || draft.title,
      { targetDraftTitle: draft.content.targetDraftTitle || draft.evidenceText || "" }
    ));
  }
  for (const draft of input.pendingExperiences.slice(0, 8)) {
    const title = draft.title || draft.content.title || `草稿 ${draft.id}`;
    questions.push(question(
      `pending_experience_${draft.id}`,
      `请确认「${title}」的经历性质、个人职责、可公开指标、项目状态和链接；确认前只作为 expression-risk 证据。`
    ));
  }
  const answeredIds = new Set(input.answers.map((answer) => answer.id));
  return uniqueBy(questions, (item) => item.id)
    .filter((item) => !answeredIds.has(item.id))
    .slice(0, 30);
}

function question(id, prompt, metadata = {}) {
  return {
    id,
    prompt: multiline(prompt),
    priority: /missing|pending_experience/.test(id) ? "high" : "medium",
    metadata
  };
}

function renderCareerContextMarkdown(context) {
  const lines = [];
  lines.push("# Career Agent Context");
  lines.push("");
  lines.push(`更新时间：${context.generatedAt}`);
  lines.push("用途：为岗位筛选、JD 匹配、定制简历、适配度评估和面试叙事提供可追溯上下文。");
  lines.push("");
  lines.push("原则：");
  lines.push("- 本文档优先服务投递转化和 JD 适配，但每个 claim 必须能被解释。");
  lines.push("- confirmed facts 可进入正式简历；PENDING / expression-risk 只能作为追问或表达策略候选。");
  lines.push("- 后续 Agent 可以改写表达和顺序，不能新增没有证据的事实。");
  lines.push("");
  lines.push("## 1. 一句话定位");
  lines.push("");
  lines.push(context.positioning || "待补充。");
  lines.push("");
  lines.push("## 2. 基本信息");
  lines.push("");
  lines.push(listOrFallback([
    context.profile.displayName ? `姓名：${context.profile.displayName}` : "",
    context.profile.headline ? `当前标题：${context.profile.headline}` : "",
    context.profile.location ? `城市：${context.profile.location}` : "",
    "个人网站提示：https://missingdanial.github.io",
    "GitHub 提示：https://github.com/MissingDanial"
  ]));
  lines.push("");
  lines.push("## 3. 当前求职目标");
  lines.push("");
  lines.push("### 3.1 优先岗位");
  lines.push(renderBullets(context.targetRoleClusters.filter((item) => item.priority === "primary").map((item) => `${item.name}：${item.reason}`), "待用户确认。"));
  lines.push("");
  lines.push("### 3.2 可扩展岗位");
  lines.push(renderBullets(context.targetRoleClusters.filter((item) => item.priority !== "primary").map((item) => `${item.name}：${item.reason}`), "待 ProfileAgent 根据经历继续扩展。"));
  lines.push("");
  lines.push("### 3.3 谨慎或不建议岗位");
  lines.push(renderBullets(context.excludedDirections, "未配置排斥方向；后续可在设置页添加销售、直播等风险门禁。"));
  lines.push("");
  lines.push("### 3.4 城市、行业、公司偏好");
  lines.push(renderBullets(context.targetCities, "待补充。"));
  lines.push("");
  lines.push("## 4. 求职核心叙事");
  lines.push("");
  lines.push(renderBullets(context.resumeReadyFacts.slice(0, 8).map((item) => `${item.title}：${item.facts.slice(0, 2).join("；") || item.label}`), "缺少 confirmed facts。"));
  lines.push("");
  lines.push("## 5. 能力地图");
  lines.push("");
  lines.push(renderTable(["能力", "类别", "边界", "状态", "证据"], context.skillMap.map((skill) => [
    skill.name,
    skill.category,
    skill.proficiency,
    skill.status,
    skill.evidence.join("; ")
  ])));
  lines.push("");
  lines.push("## 6. 关键项目与经历素材库");
  lines.push("");
  for (const project of context.projectLibrary) {
    lines.push(`### ${project.name}`);
    lines.push("");
    lines.push(listOrFallback([
      `时间：${project.period || "待确认"}`,
      `性质：${project.nature || "待确认"}`,
      `状态：${project.status}`,
      `角色：${project.role || "待确认"}`,
      `场景：${project.scenario || "待补充"}`,
      `项目链接：${project.link || "无公开链接或待发布"}`,
      `证据来源：${project.evidenceSource || "待补充"}`
    ]));
    lines.push("");
    lines.push("可用事实：");
    lines.push(renderBullets(project.facts, "待补充。"));
    if (project.pendingChecks.length) {
      lines.push("");
      lines.push("待核实：");
      lines.push(renderBullets(project.pendingChecks));
    }
    lines.push("");
  }
  if (!context.projectLibrary.length) {
    lines.push("待补充。");
    lines.push("");
  }
  lines.push("## 7. Expression-Risk 证据");
  lines.push("");
  lines.push(renderBullets(context.expressionRiskFacts.map((item) => `${item.title}：${item.suggestedLabel}；${item.interviewNote}`), "暂无。"));
  lines.push("");
  lines.push("## 8. Major-Risk / 高压线");
  lines.push("");
  lines.push(renderBullets(context.majorRiskFacts.map((item) => `${item.title}：${item.action}`), "暂无额外 blocker。"));
  lines.push("");
  lines.push("## 9. 简历改写规则");
  lines.push("");
  lines.push(renderBullets(context.rewriteRules));
  lines.push("");
  lines.push("## 10. 不同岗位版本的简历策略");
  lines.push("");
  for (const version of context.recommendedResumeVersions) {
    lines.push(`### ${version.name}`);
    lines.push("");
    lines.push(listOrFallback([
      `目标岗位：${version.targetRole}`,
      `项目顺序：${version.projectOrder.join(" -> ") || "待确认"}`,
      `强调能力：${version.emphasizeSkills.join("、") || "待确认"}`,
      `压缩/删除：${version.removeOrCompress.join("、")}`,
      `必须保留：${version.mustKeep.join("、")}`,
      `必须避免：${version.mustAvoid.join("、")}`
    ]));
    lines.push("");
  }
  lines.push("## 11. JD 匹配判断规则");
  lines.push("");
  lines.push("### 11.1 高匹配 JD 特征");
  lines.push(renderBullets(context.jdMatchingGuidance.highFitSignals, "待补充 confirmed facts 后生成。"));
  lines.push("");
  lines.push("### 11.2 中等匹配 JD 特征");
  lines.push(renderBullets(context.jdMatchingGuidance.mediumFitSignals));
  lines.push("");
  lines.push("### 11.3 低匹配或应跳过");
  lines.push(renderBullets(context.jdMatchingGuidance.skipSignals));
  lines.push("");
  lines.push("## 12. 后续 Agent 必须追问的问题");
  lines.push("");
  lines.push(renderBullets(context.missingQuestions.map((item) => `${item.id}：${item.prompt}`), "暂无。"));
  lines.push("");
  lines.push("## 13. 用户补充答案");
  lines.push("");
  lines.push(renderBullets(context.answers.map((item) => `${item.id}：${item.answer}`), "暂无。"));
  lines.push("");
  lines.push("## 14. 给后续 Agent 的执行建议");
  lines.push("");
  lines.push(renderBullets([
    "先读取目标 JD，再从项目素材库选择 3-4 个最相关项目。",
    "优先使用 confirmed facts；expression-risk 只能在用户确认后进入正式投递版本。",
    "风险门禁先于岗位适配评分执行。",
    "定制简历输出 DOCX 前必须重新跑适配度评估、claim 校验和 AuditAgent。",
    "所有失败、降级和人工纠正都写入 workflow_events。"
  ]));
  lines.push("");
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function labelForExperience(experience) {
  const kind = experience.kind || "project";
  if (kind === "work") {
    return "实习/工作经历";
  }
  if (kind === "education") {
    return "学历背景";
  }
  if (kind === "award" || kind === "certification") {
    return "奖项/证书";
  }
  if (/创业|商业|合作|客户|公司/.test(searchable([experience.title, experience.organization, experience.evidenceText]))) {
    return "商业化项目 / 合作项目";
  }
  return "项目经历";
}

function suggestFlexibleLabel(draft) {
  const textBlob = searchable([draft.title, draft.evidenceText, draft.content]);
  if (/实习|intern/i.test(textBlob)) {
    return "实习经历待确认";
  }
  if (/公司|客户|商业|营收|创业|合作/.test(textBlob)) {
    return "商业化项目 / 合作项目";
  }
  if (/课程|作业|学校/.test(textBlob)) {
    return "课程项目";
  }
  return "产品实践 / 项目经历";
}

function inferSkillCategory(name) {
  if (/SQL|SQLite|PostgreSQL|MySQL|Excel|数据|分析/i.test(name)) {
    return "data";
  }
  if (/JavaScript|TypeScript|Node|React|Vue|Python|FastAPI|Chrome|Playwright|Docker|Git|工程|开发/i.test(name)) {
    return "engineering";
  }
  if (/产品|需求|用户|竞品|原型|Figma|Axure|增长|指标|项目管理/i.test(name)) {
    return "product";
  }
  if (/Prompt|OpenAI|LangChain|LangGraph|RAG|AI|LLM|大模型/i.test(name)) {
    return "ai";
  }
  return "general";
}

function findProjectLink(value, projectLinks) {
  const blob = searchable(value);
  return projectLinks.find((item) => (item.aliases || []).some((alias) => blob.toLowerCase().includes(String(alias).toLowerCase()))) || null;
}

function renderBullets(items, fallback = "暂无。") {
  const cleaned = normalizeStringArray(items).filter(Boolean);
  if (!cleaned.length) {
    return `- ${fallback}`;
  }
  return cleaned.map((item) => `- ${item}`).join("\n");
}

function renderTable(headers, rows) {
  if (!rows.length) {
    return "暂无。";
  }
  const safeHeaders = headers.map(escapeTableCell);
  const lines = [
    `| ${safeHeaders.join(" | ")} |`,
    `| ${safeHeaders.map(() => "---").join(" | ")} |`
  ];
  for (const row of rows.slice(0, 80)) {
    lines.push(`| ${row.map(escapeTableCell).join(" | ")} |`);
  }
  return lines.join("\n");
}

function escapeTableCell(value) {
  return text(value).replace(/\|/g, "/").slice(0, 160);
}

function listOrFallback(items, fallback = "待补充。") {
  return renderBullets(items, fallback);
}

function hasExperienceContent(experience) {
  return Boolean(experience.title || experience.organization || experience.role || experience.facts.length || experience.evidenceText);
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeStringArray(value) {
  const values = Array.isArray(value) ? value : value === null || value === undefined || value === "" ? [] : [value];
  return values.flatMap((item) => {
    if (Array.isArray(item)) {
      return normalizeStringArray(item);
    }
    if (item && typeof item === "object") {
      return [multiline(item.text || item.name || item.title || item.content || JSON.stringify(item))];
    }
    return String(item || "")
      .split(/\n|；|;/)
      .map(text)
      .filter(Boolean);
  }).filter(Boolean);
}

function uniqueStrings(values) {
  return Array.from(new Set(normalizeStringArray(values)));
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = keyFn(value);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function multiline(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function searchable(value) {
  if (Array.isArray(value)) {
    return value.map(searchable).join(" ");
  }
  if (value && typeof value === "object") {
    return Object.values(value).map(searchable).join(" ");
  }
  return text(value);
}

function containsLoose(haystack, needle) {
  const left = text(haystack).toLowerCase();
  const right = text(needle).toLowerCase();
  if (!left || !right) {
    return false;
  }
  return left.includes(right) || right.includes(left);
}

function firstSentence(value) {
  const textValue = multiline(value);
  if (!textValue) {
    return "";
  }
  return textValue.split(/[。.!?\n]/).map(text).filter(Boolean)[0] || textValue.slice(0, 120);
}

module.exports = {
  AGENT_NAME,
  CONTEXT_FILE_NAME,
  buildCareerContext,
  readCareerContextFile,
  writeCareerContextFile,
  resolveCareerContextPath
};
