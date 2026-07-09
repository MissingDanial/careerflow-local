const HIGH_RISK_SCORE = 100;

const DEFAULT_DIRECTION_KEYWORDS = {
  sales: ["销售", "电销", "电话销售", "地推", "邀约", "客户开发", "陌拜", "BD", "商务拓展", "招商", "渠道销售"],
  livestream: ["直播", "主播", "带货", "直播间", "中控", "场控", "达人运营", "抖音直播", "快手直播"],
  insurance: ["保险", "寿险", "车险", "保险代理", "保险经纪"],
  real_estate: ["房产销售", "置业顾问", "房地产经纪", "房产经纪"],
  customer_service: ["客服", "售前客服", "售后客服", "在线客服", "电话客服"]
};

function evaluateJobRiskGate(input = {}) {
  const context = normalizeInput(input);
  const excludedDirections = collectExcludedDirections(context);
  if (!excludedDirections.length) {
    return {
      blocked: false,
      level: "low",
      score: 0,
      matchedDirections: [],
      matchedRules: [],
      riskPoints: [],
      hardConditions: [],
      metadata: {
        gate: "job_risk_gate",
        excludedDirectionCount: 0
      }
    };
  }

  const text = buildJobText(context.job);
  const matchedRules = [];
  for (const direction of excludedDirections) {
    const terms = expandDirectionTerms(direction);
    const matchedTerms = terms.filter((term) => containsJobTerm(text, term));
    if (matchedTerms.length) {
      matchedRules.push({
        direction: direction.label,
        source: direction.source,
        severity: direction.severity,
        matchedTerms: matchedTerms.slice(0, 10),
        evidence: findEvidenceSnippets(context.job, matchedTerms).slice(0, 5)
      });
    }
  }

  const highRiskMatches = matchedRules.filter((rule) => rule.severity === "blocker" || rule.severity === "warning");
  const blocked = highRiskMatches.length > 0;
  return {
    blocked,
    level: blocked ? "high" : matchedRules.length ? "medium" : "low",
    score: blocked ? HIGH_RISK_SCORE : matchedRules.length ? 65 : 0,
    matchedDirections: matchedRules.map((rule) => rule.direction),
    matchedRules,
    riskPoints: matchedRules.map((rule) => (
      `Excluded direction matched: ${rule.direction}; terms: ${rule.matchedTerms.join(", ")}`
    )),
    hardConditions: matchedRules.map((rule) => ({
      name: "excluded_direction",
      passed: false,
      reason: `${rule.direction}: ${rule.matchedTerms.join(", ")}`
    })),
    metadata: {
      gate: "job_risk_gate",
      excludedDirectionCount: excludedDirections.length,
      blockedByUserPreference: blocked
    }
  };
}

function buildRiskGateScreeningResult(gate = {}) {
  return {
    matchScore: 0,
    riskScore: gate.score || HIGH_RISK_SCORE,
    recommendation: "skip",
    hardConditions: gate.hardConditions || [],
    matchedPoints: [],
    riskPoints: gate.riskPoints || [],
    resumeStrategy: ["Skip resume generation because the JD matches an excluded direction."],
    requiresUserConfirmation: false,
    confidence: "high",
    method: "risk_gate",
    metadata: {
      riskGate: gate
    }
  };
}

function collectExcludedDirections(context = {}) {
  const profileDirections = (context.profile.constraints || [])
    .filter((constraint) => constraint.ruleType === "excluded_direction")
    .map((constraint) => ({
      label: text(constraint.content),
      source: "profile_constraint",
      severity: normalizeSeverity(constraint.severity),
      terms: [
        ...splitDirectionText(constraint.content),
        ...array(constraint.metadata?.keywords)
      ]
    }));
  const userRuleDirections = array(context.userRules.excludedDirections || context.userRules.excluded_directions)
    .map((direction) => ({
      label: direction,
      source: "user_rules",
      severity: "blocker",
      terms: splitDirectionText(direction)
    }));
  return dedupeDirections([...profileDirections, ...userRuleDirections])
    .filter((direction) => direction.label || direction.terms.length);
}

function expandDirectionTerms(direction = {}) {
  const baseTerms = [
    direction.label,
    ...array(direction.terms)
  ].flatMap(splitDirectionText);
  const mappedTerms = [];
  for (const term of baseTerms) {
    const key = normalizeDirectionKey(term);
    if (DEFAULT_DIRECTION_KEYWORDS[key]) {
      mappedTerms.push(...DEFAULT_DIRECTION_KEYWORDS[key]);
    }
  }
  return Array.from(new Set([...baseTerms, ...mappedTerms].map(text).filter((term) => term.length >= 2)));
}

function normalizeInput(input = {}) {
  return {
    job: input.job || {},
    profile: {
      constraints: Array.isArray(input.profile?.constraints) ? input.profile.constraints : []
    },
    userRules: input.userRules && typeof input.userRules === "object" ? input.userRules : {}
  };
}

function buildJobText(job = {}) {
  return [
    job.title,
    job.company,
    job.location,
    job.salary,
    job.experience,
    job.education,
    ...(Array.isArray(job.tags) ? job.tags : []),
    ...(Array.isArray(job.welfare) ? job.welfare : []),
    job.description
  ].map(text).join("\n").toLowerCase();
}

function containsJobTerm(haystack, term) {
  const needle = text(term).toLowerCase();
  if (!needle || needle.length < 2) {
    return false;
  }
  return haystack.includes(needle);
}

function findEvidenceSnippets(job = {}, terms = []) {
  const fields = [
    ["title", job.title],
    ["tags", Array.isArray(job.tags) ? job.tags.join(" ") : ""],
    ["description", job.description]
  ];
  const snippets = [];
  for (const [field, value] of fields) {
    const content = text(value);
    const lowerContent = content.toLowerCase();
    for (const term of terms) {
      const lowerTerm = text(term).toLowerCase();
      const index = lowerContent.indexOf(lowerTerm);
      if (index >= 0) {
        const start = Math.max(0, index - 24);
        const end = Math.min(content.length, index + lowerTerm.length + 36);
        snippets.push({
          field,
          term,
          text: content.slice(start, end)
        });
      }
    }
  }
  return snippets;
}

function splitDirectionText(value) {
  return text(value)
    .split(/[,\n，、;；/|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dedupeDirections(directions) {
  const seen = new Set();
  const result = [];
  for (const direction of directions) {
    const key = `${direction.source}:${direction.label}:${direction.terms.join("|")}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(direction);
  }
  return result;
}

function normalizeDirectionKey(value) {
  const normalized = text(value).toLowerCase();
  if (["销售", "sale", "sales", "bd", "商务拓展"].includes(normalized)) {
    return "sales";
  }
  if (["直播", "livestream", "live streaming", "带货"].includes(normalized)) {
    return "livestream";
  }
  if (["保险", "insurance"].includes(normalized)) {
    return "insurance";
  }
  if (["房产", "房地产", "real estate"].includes(normalized)) {
    return "real_estate";
  }
  if (["客服", "customer service"].includes(normalized)) {
    return "customer_service";
  }
  return normalized;
}

function normalizeSeverity(value) {
  const severity = text(value).toLowerCase();
  return new Set(["info", "warning", "blocker"]).has(severity) ? severity : "blocker";
}

function array(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(text).filter(Boolean);
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

module.exports = {
  DEFAULT_DIRECTION_KEYWORDS,
  buildRiskGateScreeningResult,
  evaluateJobRiskGate
};
