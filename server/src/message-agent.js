const AGENT_NAME = "MessageAgent";

function runMessageAgent(input = {}, options = {}) {
  const context = normalizeMessageInput(input);
  const mode = normalizeMode(options.mode || input.mode || "rules");
  if (mode !== "rules") {
    return runMessageAgent(input, { ...options, mode: "rules" });
  }

  const messageText = buildGreeting(context);
  const qualitySignals = buildQualitySignals(context);
  return {
    ok: true,
    agent: AGENT_NAME,
    provider: "rules",
    fallbackUsed: false,
    result: {
      messageText,
      channel: "boss_greeting",
      actionMode: "dry_run",
      tone: "polite_direct",
      qualitySignals,
      requiresUserConfirmation: true,
      metadata: {
        method: "rules",
        resumeVersionId: context.resumeVersion.id || null,
        screeningId: context.screening.id || null
      }
    }
  };
}

function normalizeMessageInput(input = {}) {
  return {
    application: normalizeObject(input.application),
    job: normalizeJob(input.job || {}),
    screening: normalizeScreening(input.screening || {}),
    resumeVersion: normalizeObject(input.resumeVersion || input.resume_version),
    profile: normalizeProfile(input.profile || {}),
    userRules: normalizeObject(input.userRules)
  };
}

function normalizeJob(job = {}) {
  return {
    title: text(job.title || ""),
    company: text(job.company || job.companyName || ""),
    recruiter: text(job.recruiter || ""),
    description: text(job.description || ""),
    tags: normalizeStringArray(job.tags || []),
    location: text(job.location || "")
  };
}

function normalizeScreening(screening = {}) {
  return {
    id: Number(screening.id || 0),
    matchScore: Number(screening.matchScore || screening.match_score || 0),
    riskScore: Number(screening.riskScore || screening.risk_score || 0),
    matchedPoints: normalizeStringArray(screening.matchedPoints || screening.matched_points || []),
    recommendation: text(screening.recommendation || "")
  };
}

function normalizeProfile(profile = {}) {
  const base = normalizeObject(profile.profile || profile);
  return {
    displayName: text(base.displayName || base.display_name || ""),
    headline: text(base.headline || ""),
    experiences: Array.isArray(profile.experiences) ? profile.experiences : [],
    skills: Array.isArray(profile.skills) ? profile.skills : []
  };
}

function buildGreeting(context) {
  const recruiterPrefix = context.job.recruiter ? `${context.job.recruiter}您好，` : "您好，";
  const target = context.job.title || "这个岗位";
  const skillText = selectSkillNames(context).slice(0, 3).join("、");
  const projectText = selectProjectTitle(context);
  const matchText = context.screening.matchScore
    ? `系统匹配评分 ${context.screening.matchScore}/100，`
    : "";
  const evidenceText = [
    skillText ? `我有${skillText}相关经验` : "",
    projectText ? `近期项目主要是${projectText}` : ""
  ].filter(Boolean).join("，");
  const evidenceSentence = evidenceText
    ? `${matchText}${evidenceText}，和岗位要求比较接近。`
    : `${matchText}我看了岗位要求，和我的求职方向比较接近。`;
  const resumeSentence = context.resumeVersion.filePath
    ? "我已准备好针对该岗位的简历版本，方便的话希望进一步沟通。"
    : "方便的话希望进一步沟通，也可以按岗位要求补充更多信息。";
  return `${recruiterPrefix}我关注到贵司${target}岗位。${evidenceSentence}${resumeSentence}`;
}

function buildQualitySignals(context) {
  return [
    context.screening.matchScore ? `match_score:${context.screening.matchScore}` : "",
    context.screening.riskScore ? `risk_score:${context.screening.riskScore}` : "",
    context.resumeVersion.status ? `resume_status:${context.resumeVersion.status}` : "",
    context.resumeVersion.filePath ? "resume_file:ready" : "resume_file:missing"
  ].filter(Boolean);
}

function selectSkillNames(context) {
  const fromResume = normalizeStringArray(context.resumeVersion.resumeFields?.skills || []);
  if (fromResume.length) {
    return fromResume;
  }
  return context.profile.skills
    .map((skill) => text(skill?.name || ""))
    .filter(Boolean)
    .slice(0, 6);
}

function selectProjectTitle(context) {
  const projects = Array.isArray(context.resumeVersion.resumeFields?.projects)
    ? context.resumeVersion.resumeFields.projects
    : [];
  const project = projects.find((item) => text(item?.title || item?.role || item?.organization || ""));
  if (project) {
    return text(project.title || project.role || project.organization || "");
  }
  const experience = context.profile.experiences.find((item) => text(item?.title || item?.role || item?.organization || ""));
  return experience ? text(experience.title || experience.role || experience.organization || "") : "";
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
  runMessageAgent
};
