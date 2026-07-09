const { loadModelConfig, requestJsonCompletion } = require("./model-client");
const { buildRiskGateScreeningResult, evaluateJobRiskGate } = require("./job-risk-gate");

const AGENT_NAME = "ScreeningAgent";

async function runScreeningAgent(input = {}, options = {}) {
  const context = normalizeScreeningInput(input);
  const riskGate = evaluateJobRiskGate(context);
  if (riskGate.blocked) {
    return {
      ok: true,
      agent: AGENT_NAME,
      provider: "risk_gate",
      fallbackUsed: false,
      result: buildRiskGateScreeningResult(riskGate),
      modelConfig: publicModelConfig(loadModelConfig(options.modelConfig || {}))
    };
  }
  const baseline = runRuleBasedScreening(context, {
    reason: "rule_baseline",
    riskGate
  });
  const mode = normalizeMode(options.mode || input.mode || "auto");
  const modelConfig = loadModelConfig(options.modelConfig || {});

  if (mode === "rules" || (mode === "auto" && !modelConfig.configured)) {
    return {
      ok: true,
      agent: AGENT_NAME,
      provider: "rules",
      fallbackUsed: false,
      result: baseline,
      modelConfig: publicModelConfig(modelConfig)
    };
  }
  if (mode === "llm" && !modelConfig.configured) {
    throw structuredAgentError(agentClientError("LLM_CONFIG_INVALID", "OpenAI-compatible model config is not available"), {
      fallbackAvailable: true
    });
  }

  try {
    const modelOutput = await requestJsonCompletion({
      system: screeningSystemPrompt(),
      user: JSON.stringify(buildModelInput(context, baseline), null, 2),
      config: modelConfig
    });
    const result = normalizeScreeningOutput(modelOutput, baseline);
    return {
      ok: true,
      agent: AGENT_NAME,
      provider: "llm",
      fallbackUsed: false,
      result,
      modelConfig: publicModelConfig(modelConfig)
    };
  } catch (error) {
    if (mode === "llm") {
      throw structuredAgentError(error, {
        fallbackAvailable: true
      });
    }
    return {
      ok: true,
      agent: AGENT_NAME,
      provider: "rules",
      fallbackUsed: true,
      fallbackReason: error.code || "LLM_REQUEST_FAILED",
      fallbackMessage: error.message || String(error),
      result: {
        ...baseline,
        riskPoints: [
          ...baseline.riskPoints,
          `LLM screening unavailable; used deterministic fallback (${error.code || "LLM_REQUEST_FAILED"}).`
        ],
        requiresUserConfirmation: true
      },
      modelConfig: publicModelConfig(modelConfig)
    };
  }
}

function runRuleBasedScreening(input = {}, options = {}) {
  const job = input.job || {};
  const profile = input.profile || {};
  const text = [
    job.title,
    job.company,
    job.location,
    job.salary,
    job.experience,
    job.education,
    ...(job.tags || []),
    ...(job.welfare || []),
    job.description
  ].join("\n").toLowerCase();

  const skillNames = (profile.skills || []).map((skill) => skill.name).filter(Boolean);
  const experienceFacts = (profile.experiences || [])
    .flatMap((experience) => [
      experience.title,
      experience.role,
      experience.organization,
      ...(experience.facts || []),
      ...(experience.skills || [])
    ])
    .filter(Boolean);
  const targetTerms = extractTargetTerms(profile.profile?.target || {});
  const hardLimits = (profile.constraints || []).filter((constraint) => constraint.ruleType === "hard_limit");
  const forbiddenClaims = (profile.constraints || []).filter((constraint) => constraint.ruleType === "forbidden_claim");

  const matchedSkills = skillNames.filter((skill) => containsLoose(text, skill));
  const matchedExperience = experienceFacts.filter((fact) => containsLoose(text, fact)).slice(0, 8);
  const matchedTargets = targetTerms.filter((term) => containsLoose(text, term));
  const hardFailures = hardLimits.filter((constraint) => constraint.content && containsLoose(text, constraint.content));

  const descriptionLength = String(job.description || "").trim().length;
  const qualityPenalty = descriptionLength < 80 ? 20 : 0;
  const skillScore = Math.min(45, matchedSkills.length * 12);
  const experienceScore = Math.min(25, matchedExperience.length * 5);
  const targetScore = Math.min(20, matchedTargets.length * 8);
  const completenessScore = descriptionLength >= 300 ? 10 : descriptionLength >= 80 ? 5 : 0;
  const hardFailurePenalty = hardFailures.length ? 45 : 0;
  const matchScore = clamp(25 + skillScore + experienceScore + targetScore + completenessScore - hardFailurePenalty - qualityPenalty, 0, 100);
  const riskScore = clamp(
    15
      + qualityPenalty
      + hardFailures.length * 35
      + Math.max(0, 3 - matchedSkills.length) * 6
      + forbiddenClaims.length * 2,
    0,
    100
  );

  const recommendation = chooseRecommendation({ matchScore, riskScore, hardFailures, descriptionLength });
  return {
    matchScore,
    riskScore,
    recommendation,
    hardConditions: [
      {
        name: "jd_description",
        passed: descriptionLength >= 80,
        reason: descriptionLength >= 80 ? "JD is available for screening." : "JD is missing or too short."
      },
      ...hardFailures.map((constraint) => ({
        name: "hard_limit",
        passed: false,
        reason: constraint.content
      }))
    ],
    matchedPoints: [
      ...matchedSkills.map((skill) => `Skill matched: ${skill}`),
      ...matchedTargets.map((term) => `Target matched: ${term}`),
      ...matchedExperience.map((fact) => `Experience evidence matched: ${truncate(fact, 120)}`)
    ].slice(0, 16),
    riskPoints: [
      ...(descriptionLength < 80 ? ["JD is incomplete; score is low confidence."] : []),
      ...(matchedSkills.length ? [] : ["No confirmed skill directly matched the JD."]),
      ...hardFailures.map((constraint) => `Hard limit may be violated: ${constraint.content}`),
      ...((options.riskGate?.riskPoints) || [])
    ],
    resumeStrategy: buildResumeStrategy({ matchedSkills, matchedExperience, matchedTargets }),
    requiresUserConfirmation: recommendation === "review_needed" || descriptionLength < 80 || hardFailures.length > 0,
    confidence: descriptionLength >= 300 && matchedSkills.length >= 2 ? "medium" : "low",
    method: options.reason || "rules",
    metadata: {
      riskGate: options.riskGate || null
    }
  };
}

function normalizeScreeningInput(input = {}) {
  return {
    job: normalizeJob(input.job || {}),
    profile: {
      profile: input.profile?.profile || {},
      experiences: Array.isArray(input.profile?.experiences) ? input.profile.experiences : [],
      skills: Array.isArray(input.profile?.skills) ? input.profile.skills : [],
      constraints: Array.isArray(input.profile?.constraints) ? input.profile.constraints : []
    },
    userRules: input.userRules && typeof input.userRules === "object" ? input.userRules : {}
  };
}

function normalizeJob(job = {}) {
  return {
    id: Number(job.id || 0),
    sourceKey: text(job.sourceKey || job.source_key || ""),
    jobId: text(job.jobId || job.job_id || job.bossJobId || ""),
    title: text(job.title || ""),
    company: text(job.company || job.companyName || job.company_name || ""),
    salary: text(job.salary || ""),
    location: text(job.location || ""),
    experience: text(job.experience || ""),
    education: text(job.education || ""),
    recruiter: text(job.recruiter || ""),
    tags: array(job.tags),
    welfare: array(job.welfare),
    description: multiline(job.description || ""),
    detailUrl: text(job.detailUrl || job.detail_url || "")
  };
}

function normalizeScreeningOutput(output = {}, baseline) {
  const recommendation = normalizeRecommendation(output.recommendation) || baseline.recommendation;
  const matchScore = clamp(Number(output.matchScore ?? output.match_score ?? baseline.matchScore), 0, 100);
  const riskScore = clamp(Number(output.riskScore ?? output.risk_score ?? baseline.riskScore), 0, 100);
  return {
    matchScore,
    riskScore,
    recommendation,
    hardConditions: normalizeHardConditions(output.hardConditions || output.hard_conditions || baseline.hardConditions),
    matchedPoints: array(output.matchedPoints || output.matched_points || baseline.matchedPoints).slice(0, 20),
    riskPoints: array(output.riskPoints || output.risk_points || baseline.riskPoints).slice(0, 20),
    resumeStrategy: array(output.resumeStrategy || output.resume_strategy || baseline.resumeStrategy).slice(0, 20),
    requiresUserConfirmation: Boolean(output.requiresUserConfirmation ?? output.requires_user_confirmation ?? baseline.requiresUserConfirmation),
    confidence: normalizeConfidence(output.confidence || baseline.confidence),
    method: "llm"
  };
}

function normalizeHardConditions(value) {
  const list = Array.isArray(value) ? value : [];
  return list.slice(0, 20).map((item, index) => ({
    name: text(item?.name || `condition_${index + 1}`),
    passed: Boolean(item?.passed),
    reason: text(item?.reason || "")
  }));
}

function buildModelInput(context, baseline) {
  return {
    task: "Score this BOSS Zhipin job for the candidate. Return JSON only.",
    schema: {
      matchScore: "number 0-100",
      riskScore: "number 0-100",
      recommendation: "auto_prepare | review_needed | skip",
      hardConditions: [{ name: "string", passed: "boolean", reason: "string" }],
      matchedPoints: ["string"],
      riskPoints: ["string"],
      resumeStrategy: ["string"],
      requiresUserConfirmation: "boolean",
      confidence: "low | medium | high"
    },
    rules: [
      "Use only confirmed profile facts.",
      "Do not decide application submission.",
      "If evidence is weak or JD is incomplete, choose review_needed or skip.",
      "Prefer conservative risk scoring."
    ],
    job: context.job,
    confirmedProfile: context.profile,
    deterministicBaseline: baseline
  };
}

function screeningSystemPrompt() {
  return [
    "You are ScreeningAgent for a local-first job application workflow.",
    "You score jobs using the candidate's confirmed facts only.",
    "You must return one strict JSON object and no prose.",
    "You must not claim the candidate has skills or experience that are not in confirmedProfile.",
    "You cannot approve final application submission."
  ].join("\n");
}

function chooseRecommendation({ matchScore, riskScore, hardFailures, descriptionLength }) {
  if (hardFailures.length || descriptionLength < 80 || matchScore < 45 || riskScore >= 70) {
    return "skip";
  }
  if (matchScore >= 75 && riskScore <= 35) {
    return "auto_prepare";
  }
  return "review_needed";
}

function buildResumeStrategy({ matchedSkills, matchedExperience, matchedTargets }) {
  const strategy = [];
  if (matchedSkills.length) {
    strategy.push(`Prioritize confirmed skills: ${matchedSkills.slice(0, 6).join(", ")}`);
  }
  if (matchedExperience.length) {
    strategy.push("Use matched experience evidence before generic summary.");
  }
  if (matchedTargets.length) {
    strategy.push(`Align opening summary with target terms: ${matchedTargets.slice(0, 5).join(", ")}`);
  }
  if (!strategy.length) {
    strategy.push("Keep resume generation blocked until more confirmed facts match this JD.");
  }
  return strategy;
}

function extractTargetTerms(target = {}) {
  const values = [];
  for (const value of Object.values(target || {})) {
    if (Array.isArray(value)) {
      values.push(...value);
    } else if (value && typeof value !== "object") {
      values.push(value);
    }
  }
  return array(values);
}

function containsLoose(haystack, needle) {
  const normalizedNeedle = text(needle).toLowerCase();
  if (!normalizedNeedle || normalizedNeedle.length < 2) {
    return false;
  }
  if (normalizedNeedle.length <= 4) {
    return haystack.includes(normalizedNeedle);
  }
  const importantTokens = normalizedNeedle
    .split(/[^a-z0-9\u4e00-\u9fa5+#.]+/i)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 5);
  return importantTokens.length > 0 && importantTokens.some((token) => haystack.includes(token));
}

function normalizeMode(value) {
  const mode = text(value).toLowerCase();
  return new Set(["auto", "rules", "llm"]).has(mode) ? mode : "auto";
}

function normalizeRecommendation(value) {
  const recommendation = text(value).toLowerCase();
  return new Set(["auto_prepare", "review_needed", "skip"]).has(recommendation) ? recommendation : "";
}

function normalizeConfidence(value) {
  const confidence = text(value).toLowerCase();
  return new Set(["low", "medium", "high"]).has(confidence) ? confidence : "low";
}

function publicModelConfig(config) {
  return {
    configured: Boolean(config.configured),
    baseUrl: config.baseUrl || "",
    model: config.model || "",
    wireApi: config.wireApi || "",
    source: config.source || ""
  };
}

function structuredAgentError(error, context = {}) {
  const structured = new Error(error.message || String(error));
  structured.code = error.code || "SCREENING_AGENT_FAILED";
  structured.agent = AGENT_NAME;
  structured.step = "score_job";
  structured.retryable = structured.code === "LLM_REQUEST_FAILED";
  structured.severity = "error";
  structured.context = context;
  return structured;
}

function agentClientError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function multiline(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map(text)
    .filter(Boolean)
    .join("\n");
}

function array(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.map(text).filter(Boolean))).slice(0, 80);
}

function truncate(value, length) {
  const content = text(value);
  return content.length > length ? `${content.slice(0, length - 3)}...` : content;
}

function clamp(value, min, max) {
  const number = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

module.exports = {
  evaluateJobRiskGate,
  runScreeningAgent,
  runRuleBasedScreening,
  normalizeScreeningOutput
};
