const SECTION_PATTERNS = [
  { kind: "work", pattern: /^(work|employment|internship|professional|工作经历|实习经历|职业经历|任职经历)/i },
  { kind: "project", pattern: /^(project|projects|项目经历|项目经验|个人项目|校园项目)/i },
  { kind: "education", pattern: /^(education|教育背景|教育经历|学历|在校经历)/i },
  { kind: "skill", pattern: /^(skills?|technical skills?|专业技能|技能|技能清单|技术栈)/i },
  { kind: "award", pattern: /^(awards?|honors?|荣誉|奖项|获奖|证书|认证)/i },
  { kind: "activity", pattern: /^(activities?|campus|社团|活动经历|学生工作)/i }
];

const KNOWN_SKILLS = [
  "JavaScript", "TypeScript", "Node.js", "React", "Vue", "Python", "FastAPI", "Flask",
  "SQLite", "PostgreSQL", "MySQL", "Redis", "Docker", "Git", "Chrome Extension",
  "Playwright", "Selenium", "LangChain", "LangGraph", "OpenAI", "Prompt Engineering",
  "RAG", "FAISS", "SQL", "Excel", "PowerPoint", "Figma", "Axure", "BOSS", "A/B",
  "数据分析", "用户调研", "需求分析", "竞品分析", "原型设计", "项目管理", "产品设计",
  "指标体系", "流程设计", "增长分析", "爬虫", "自动化", "简历优化"
];

function generateProfileFactDrafts(resumeSource = {}) {
  const lines = normalizeLines(resumeSource.rawText || resumeSource.text || "");
  const sections = splitSections(lines);
  const drafts = [];
  const experienceDrafts = buildExperienceDrafts(sections, resumeSource);
  const skillDrafts = buildSkillDrafts(sections, experienceDrafts, resumeSource);
  drafts.push(...experienceDrafts, ...skillDrafts);
  drafts.push(...buildQuestionDrafts(experienceDrafts, skillDrafts, resumeSource));

  return {
    resumeSourceId: Number(resumeSource.id || 0),
    drafts: drafts.slice(0, 80),
    summary: {
      lineCount: lines.length,
      sectionCount: sections.length,
      experienceDraftCount: experienceDrafts.length,
      skillDraftCount: skillDrafts.length,
      questionDraftCount: drafts.filter((draft) => draft.draftType === "question").length
    }
  };
}

function buildExperienceDrafts(sections, resumeSource) {
  const result = [];
  const targetKinds = new Set(["work", "project", "education", "award", "activity"]);
  for (const section of sections) {
    if (!targetKinds.has(section.kind)) {
      continue;
    }
    const entries = splitEntries(section.lines);
    for (const entry of entries.slice(0, 8)) {
      const draft = normalizeExperienceDraft(section, entry, resumeSource);
      if (draft) {
        result.push(draft);
      }
    }
  }
  return result;
}

function normalizeExperienceDraft(section, entry, resumeSource) {
  const evidenceLines = [entry.title, ...entry.facts].map(cleanLine).filter(Boolean);
  if (!evidenceLines.length) {
    return null;
  }
  const evidenceText = evidenceLines.join("\n");
  const dateRange = extractDateRange(evidenceText);
  const title = normalizeDraftTitle(entry.title || evidenceLines[0] || section.heading);
  const facts = entry.facts.length ? entry.facts : evidenceLines.slice(1);
  const normalizedFacts = facts.map(stripBullet).map(cleanLine).filter(Boolean).slice(0, 8);
  const skills = extractSkills(evidenceText).slice(0, 12);

  return {
    draftType: "experience",
    title: title || section.heading || kindDisplayName(section.kind),
    confidence: "needs_review",
    evidenceText,
    content: {
      kind: section.kind === "work" ? "work" : section.kind,
      title: title || kindDisplayName(section.kind),
      organization: extractOrganization(entry.title || ""),
      role: extractRole(entry.title || ""),
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      facts: normalizedFacts.length ? normalizedFacts : [evidenceText].slice(0, 1),
      skills,
      evidenceSource: `resume_source:${resumeSource.id || ""}`,
      confidence: "needs_review",
      allowedRewrites: ["用户确认后可改写表达和调整顺序"],
      forbiddenClaims: ["未确认前不得用于投递简历", "不得新增简历原文没有支持的事实"]
    },
    metadata: {
      section: section.heading,
      generator: "heuristic-profile-draft-generator"
    }
  };
}

function buildSkillDrafts(sections, experienceDrafts, resumeSource) {
  const skillTexts = [];
  for (const section of sections) {
    if (section.kind === "skill") {
      skillTexts.push(...section.lines);
    }
  }
  for (const draft of experienceDrafts) {
    skillTexts.push(...(draft.content.skills || []));
  }

  const skills = new Set();
  for (const text of skillTexts) {
    for (const skill of extractSkills(text)) {
      skills.add(skill);
    }
  }

  return Array.from(skills).slice(0, 30).map((skill) => ({
    draftType: "skill",
    title: skill,
    confidence: "needs_review",
    evidenceText: findEvidenceLine(skillTexts, skill) || skill,
    content: {
      name: skill,
      category: inferSkillCategory(skill),
      proficiency: "familiar",
      evidence: [`resume_source:${resumeSource.id || ""}`]
    },
    metadata: {
      generator: "heuristic-profile-draft-generator"
    }
  }));
}

function buildQuestionDrafts(experienceDrafts, skillDrafts, resumeSource) {
  const questions = [];
  if (!experienceDrafts.length) {
    questions.push({
      reason: "NO_EXPERIENCE_DRAFT",
      question: "简历原文没有识别出项目、实习或教育经历，请手动补充可用于投递的真实经历。"
    });
  }
  if (!skillDrafts.length) {
    questions.push({
      reason: "NO_SKILL_DRAFT",
      question: "简历原文没有识别出明确技能，请补充技能名称、熟练度和证据来源。"
    });
  }
  for (const draft of experienceDrafts.slice(0, 10)) {
    const facts = draft.content.facts || [];
    if (!draft.content.startDate && !draft.content.endDate) {
      questions.push({
        reason: "DATE_MISSING",
        targetDraftTitle: draft.title,
        question: `请确认「${draft.title}」的起止时间。`
      });
    }
    if (!facts.some((fact) => /\d|%|倍|人|次|万|千|小时|天/.test(fact))) {
      questions.push({
        reason: "METRIC_MISSING",
        targetDraftTitle: draft.title,
        question: `「${draft.title}」是否有可验证的量化结果？没有也可以确认为空。`
      });
    }
    if (!draft.content.role) {
      questions.push({
        reason: "ROLE_MISSING",
        targetDraftTitle: draft.title,
        question: `请确认你在「${draft.title}」中的角色和负责范围。`
      });
    }
  }

  return questions.slice(0, 30).map((item) => ({
    draftType: "question",
    title: item.reason,
    confidence: "needs_review",
    evidenceText: item.targetDraftTitle || "",
    content: {
      question: item.question,
      reason: item.reason,
      targetDraftTitle: item.targetDraftTitle || "",
      resumeSourceId: Number(resumeSource.id || 0)
    },
    metadata: {
      generator: "heuristic-profile-draft-generator"
    }
  }));
}

function splitSections(lines) {
  const sections = [];
  let current = { kind: "summary", heading: "Summary", lines: [] };
  for (const line of lines) {
    const headingKind = detectSectionKind(line);
    if (headingKind) {
      if (current.lines.length || current.kind !== "summary") {
        sections.push(current);
      }
      current = { kind: headingKind, heading: line.replace(/[:：]\s*$/, ""), lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  if (current.lines.length || !sections.length) {
    sections.push(current);
  }
  return sections;
}

function splitEntries(lines) {
  const entries = [];
  let current = null;
  for (const line of lines.map(cleanLine).filter(Boolean)) {
    if (isLikelyEntryTitle(line)) {
      if (current && (current.title || current.facts.length)) {
        entries.push(current);
      }
      current = { title: line, facts: [] };
      continue;
    }
    if (!current) {
      current = { title: "", facts: [] };
    }
    current.facts.push(stripBullet(line));
  }
  if (current && (current.title || current.facts.length)) {
    entries.push(current);
  }
  if (!entries.length && lines.length) {
    entries.push({ title: lines[0], facts: lines.slice(1) });
  }
  return entries;
}

function detectSectionKind(line) {
  const normalized = cleanLine(line).replace(/[:：]\s*$/, "");
  if (normalized.length > 32) {
    return "";
  }
  const match = SECTION_PATTERNS.find((item) => item.pattern.test(normalized));
  return match ? match.kind : "";
}

function isLikelyEntryTitle(line) {
  const text = cleanLine(line);
  if (!text || isBulletLine(text)) {
    return false;
  }
  if (/[。；;]$/.test(text)) {
    return false;
  }
  if (/^(负责|参与|完成|设计|搭建|优化|输出|协同|通过|使用|基于)/.test(text)) {
    return false;
  }
  return text.length <= 90;
}

function extractSkills(text) {
  const result = new Set();
  const normalized = cleanLine(text);
  for (const skill of KNOWN_SKILLS) {
    if (normalized.toLowerCase().includes(skill.toLowerCase())) {
      result.add(skill);
    }
  }
  for (const token of normalized.split(/[、,，;；/|]/).map(cleanLine)) {
    if (/^[A-Za-z][A-Za-z0-9+.# -]{1,30}$/.test(token) || /^[\u4e00-\u9fa5]{2,12}$/.test(token)) {
      if (!/^(负责|参与|项目|经历|熟悉|掌握|了解|使用|通过|进行|以及|包括|相关|能力)$/.test(token)) {
        result.add(normalizeSkillName(token));
      }
    }
  }
  return Array.from(result).filter(Boolean);
}

function extractDateRange(text) {
  const normalized = cleanLine(text);
  const match = normalized.match(/((?:20)?\d{2}[./-]?\d{0,2})\s*(?:-|--|~|至|到)\s*((?:20)?\d{2}[./-]?\d{0,2}|至今|现在|present)/i);
  if (!match) {
    return { startDate: "", endDate: "" };
  }
  return {
    startDate: normalizeDate(match[1]),
    endDate: /至今|现在|present/i.test(match[2]) ? "present" : normalizeDate(match[2])
  };
}

function extractOrganization(title) {
  const parts = cleanLine(title).split(/\s*[|｜@]\s*/).map(cleanLine).filter(Boolean);
  return parts.length >= 2 ? parts[0] : "";
}

function extractRole(title) {
  const parts = cleanLine(title).split(/\s*[|｜@]\s*/).map(cleanLine).filter(Boolean);
  return parts.length >= 2 ? parts[1] : "";
}

function inferSkillCategory(skill) {
  if (/SQL|SQLite|PostgreSQL|MySQL|Redis/i.test(skill)) {
    return "data";
  }
  if (/JavaScript|TypeScript|Node|React|Vue|Python|FastAPI|Flask|Docker|Git/i.test(skill)) {
    return "engineering";
  }
  if (/需求|用户|竞品|产品|原型|项目管理|指标|增长|Figma|Axure/i.test(skill)) {
    return "product";
  }
  return "general";
}

function normalizeDate(value) {
  const text = cleanLine(value);
  const compact = text.replace(/[./]/g, "-");
  if (/^\d{4}-?\d{2}$/.test(compact)) {
    return compact.includes("-") ? compact : `${compact.slice(0, 4)}-${compact.slice(4)}`;
  }
  if (/^\d{2}-?\d{2}$/.test(compact)) {
    const valueWithDash = compact.includes("-") ? compact : `${compact.slice(0, 2)}-${compact.slice(2)}`;
    return `20${valueWithDash}`;
  }
  return compact;
}

function normalizeSkillName(value) {
  const text = cleanLine(value);
  const known = KNOWN_SKILLS.find((skill) => skill.toLowerCase() === text.toLowerCase());
  return known || text;
}

function normalizeDraftTitle(value) {
  return cleanLine(value)
    .replace(/\s*((?:20)?\d{2}[./-]?\d{0,2}\s*(?:-|--|~|至|到)\s*((?:20)?\d{2}[./-]?\d{0,2}|至今|现在|present)).*$/i, "")
    .trim();
}

function findEvidenceLine(lines, skill) {
  return lines.find((line) => cleanLine(line).toLowerCase().includes(skill.toLowerCase())) || "";
}

function kindDisplayName(kind) {
  return {
    work: "工作经历",
    project: "项目经历",
    education: "教育经历",
    award: "荣誉奖项",
    activity: "活动经历"
  }[kind] || "经历";
}

function normalizeLines(text) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);
}

function cleanLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isBulletLine(value) {
  return /^([-*]|\d+[.)、]|[•·●])\s*/.test(cleanLine(value));
}

function stripBullet(value) {
  return cleanLine(value).replace(/^([-*]|\d+[.)、]|[•·●])\s*/, "");
}

module.exports = {
  generateProfileFactDrafts
};
