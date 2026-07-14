const AGENT_NAME = "ResumeFitEvaluator";
const { FitReviewOutputSchema } = require("./agent-output-schemas");
const { loadModelConfig, requestStructuredCompletion } = require("./model-client");
const { resolveResumeTemplate } = require("./resume-template-registry");

const PROMPT_VERSION = "m18.resume-fit.prompt.v1";
const AGENT_VERSION = "m18.resume-fit.agent.v1";

const TECH_TERMS = [
  "javascript",
  "typescript",
  "node",
  "node.js",
  "react",
  "vue",
  "python",
  "java",
  "go",
  "golang",
  "sql",
  "sqlite",
  "mysql",
  "postgres",
  "postgresql",
  "fastapi",
  "django",
  "flask",
  "chrome extension",
  "mv3",
  "playwright",
  "langchain",
  "langgraph",
  "llm",
  "agent",
  "api",
  "rest",
  "docker",
  "linux",
  "git",
  "ci",
  "cd",
  "excel",
  "pdf",
  "docx",
  "爬虫",
  "反爬",
  "浏览器插件",
  "后端",
  "前端",
  "数据库",
  "自动化",
  "简历",
  "投递",
  "数据采集",
  "岗位匹配"
];

const RESPONSIBILITY_HINTS = [
  "负责",
  "参与",
  "开发",
  "设计",
  "搭建",
  "维护",
  "优化",
  "实现",
  "协作",
  "推进",
  "沉淀",
  "测试",
  "部署",
  "构建",
  "采集",
  "分析"
];

function runResumeFitEvaluator(input = {}, options = {}) {
  const context = normalizeInput(input);
  const mode = normalizeMode(options.mode || input.mode || "rules");
  const baseline = runRuleBasedResumeFitEvaluator(context);
  const modelConfig = loadModelConfig(options.modelConfig || {});
  if (mode === "rules" || (mode === "auto" && !modelConfig.configured)) {
    return baseline;
  }
  if (!modelConfig.configured) {
    throw fitEvaluatorError("LLM_CONFIG_INVALID", "OpenAI-compatible model config is not available for ResumeFitEvaluator");
  }
  return runModelResumeFitEvaluator(context, baseline, mode, modelConfig, options);
}

function runRuleBasedResumeFitEvaluator(context) {
  const jdRequirements = extractJdRequirements(context.job);
  const resumeEvidence = extractResumeEvidence(context.resumeVersion);
  const coverageItems = jdRequirements.requirements.map((requirement) => evaluateRequirement(requirement, resumeEvidence));
  const covered = coverageItems.filter((item) => item.status === "covered").length;
  const weak = coverageItems.filter((item) => item.status === "weak").length;
  const missing = coverageItems.filter((item) => item.status === "missing").length;
  const coverageScore = coverageItems.length
    ? Math.round(((covered + weak * 0.45) / coverageItems.length) * 100)
    : 0;
  const confidence = coverageItems.length >= 5 ? "medium" : coverageItems.length >= 2 ? "low" : "very_low";
  const fitLevel = coverageScore >= 78 ? "strong" : coverageScore >= 58 ? "mixed" : "weak";
  const blockers = coverageItems
    .filter((item) => item.type === "skill" && item.priority === "must" && item.source === "tag" && item.status === "missing")
    .map((item) => item.requirement)
    .slice(0, 10);
  const recommendations = buildRecommendations(coverageItems, context.resumeVersion);

  return {
    ok: true,
    agent: AGENT_NAME,
    provider: "rules",
    fallbackUsed: false,
    result: {
      jdRequirements,
      coverage: {
        score: coverageScore,
        fitLevel,
        confidence,
        covered,
        weak,
        missing,
        total: coverageItems.length,
        items: coverageItems
      },
      blockers,
      recommendations,
      policy: {
        canProceedToAudit: coverageScore >= 55 && blockers.length === 0,
        requiresResumeRevision: coverageScore < 75 || weak > 0 || missing > 0,
        noRealBossAction: true,
        noApplicationStatusChange: true
      },
      metadata: {
        method: "rules",
        resumeVersionId: context.resumeVersion.id || null,
        applicationId: context.application.id || context.resumeVersion.applicationId || null,
        requirementCount: coverageItems.length
      }
    },
    promptVersion: "m10.resume-fit.rules.v1",
    agentVersion: "m10.resume-fit.rules.v1",
    telemetry: {}
  };
}

async function runModelResumeFitEvaluator(context, baseline, mode, modelConfig, options = {}) {
  const invoke = options.requestStructuredCompletion || requestStructuredCompletion;
  try {
    const evidenceItems = extractResumeEvidence(context.resumeVersion);
    const completion = await invoke({
      system: fitSystemPrompt(),
      user: JSON.stringify(buildFitModelInput(context, baseline, evidenceItems), null, 2),
      config: modelConfig,
      schema: FitReviewOutputSchema,
      schemaName: "resume_fit_review_output"
    });
    const result = buildModelFitResult(completion.data, context, baseline, evidenceItems);
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
      const structured = fitEvaluatorError(error.code || "RESUME_FIT_EVALUATOR_FAILED", error.message || String(error));
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
          fallbackReason: error.code || "LLM_REQUEST_FAILED"
        }
      }
    };
  }
}

function buildFitModelInput(context, baseline, evidenceItems) {
  return {
    task: "Review semantic coverage of each indexed JD requirement using exact resume evidence. Return JSON only.",
    outputSchema: {
      items: [{
        requirementIndex: "zero-based index from jdRequirements",
        status: "covered | weak | missing",
        evidenceField: "exact field from resumeEvidence, or empty for missing",
        evidenceText: "verbatim text from resumeEvidence, or empty for missing",
        reason: "short evidence-based explanation"
      }],
      recommendations: ["evidence-bound improvement"],
      confidence: "low | medium | high"
    },
    rules: [
      "Return one item for every indexed requirement.",
      "covered or weak requires an exact evidenceField and verbatim evidenceText from resumeEvidence.",
      "Do not infer experience from JD keywords alone.",
      "Missing must-have requirements remain blockers.",
      "Do not decide application submission."
    ],
    job: {
      title: context.job.title,
      tags: context.job.tags
    },
    jdRequirements: baseline.result.jdRequirements.requirements.map((requirement, index) => ({ index, ...requirement })),
    resumeEvidence: evidenceItems,
    deterministicBaseline: {
      coverageScore: baseline.result.coverage.score,
      blockers: baseline.result.blockers
    }
  };
}

function fitSystemPrompt() {
  return [
    "You are ResumeFitEvaluator in a local-first resume workflow.",
    "Evaluate JD coverage only from the supplied resume evidence.",
    "Semantic matches are allowed only when you quote the exact supporting evidence.",
    "Be conservative with must-have requirements.",
    "Return exactly one JSON object."
  ].join("\n");
}

function buildModelFitResult(output, context, baseline, evidenceItems) {
  const requirements = baseline.result.jdRequirements.requirements;
  const evidenceByField = new Map(evidenceItems.map((item) => [item.field, item]));
  const reviewByIndex = new Map();
  for (const review of output.items || []) {
    const index = Number(review.requirementIndex);
    if (!Number.isInteger(index) || index < 0 || index >= requirements.length || reviewByIndex.has(index)) {
      continue;
    }
    reviewByIndex.set(index, review);
  }
  if (reviewByIndex.size !== requirements.length) {
    throw fitEvaluatorError(
      "AGENT_OUTPUT_EVIDENCE_INVALID",
      `ResumeFitEvaluator returned ${reviewByIndex.size}/${requirements.length} indexed requirement reviews`
    );
  }

  const coverageItems = requirements.map((requirement, index) => {
    const review = reviewByIndex.get(index);
    if (review.status === "missing") {
      return {
        ...requirement,
        status: "missing",
        score: 0,
        evidenceField: "",
        evidenceText: "",
        reason: text(review.reason)
      };
    }
    const evidence = evidenceByField.get(text(review.evidenceField));
    const canonicalEvidence = evidence && evidenceMatchesVerbatim(evidence.text, review.evidenceText)
      ? evidence
      : null;
    if (!canonicalEvidence) {
      return {
        ...requirement,
        status: "missing",
        score: 0,
        evidenceField: "",
        evidenceText: "",
        reason: "Model proposed coverage without a valid verbatim resume evidence reference."
      };
    }
    return {
      ...requirement,
      status: review.status,
      score: review.status === "covered" ? 100 : 50,
      evidenceField: canonicalEvidence.field,
      evidenceText: canonicalEvidence.text,
      reason: text(review.reason)
    };
  });
  const covered = coverageItems.filter((item) => item.status === "covered").length;
  const weak = coverageItems.filter((item) => item.status === "weak").length;
  const missing = coverageItems.filter((item) => item.status === "missing").length;
  const coverageScore = coverageItems.length
    ? Math.round(((covered + weak * 0.45) / coverageItems.length) * 100)
    : 0;
  const blockers = coverageItems
    .filter((item) => item.priority === "must" && item.status === "missing")
    .map((item) => item.requirement)
    .slice(0, 10);
  return {
    jdRequirements: baseline.result.jdRequirements,
    coverage: {
      score: coverageScore,
      fitLevel: coverageScore >= 78 ? "strong" : coverageScore >= 58 ? "mixed" : "weak",
      confidence: normalizeConfidence(output.confidence),
      covered,
      weak,
      missing,
      total: coverageItems.length,
      items: coverageItems
    },
    blockers,
    recommendations: unique([
      ...normalizeStringArray(output.recommendations),
      ...buildRecommendations(coverageItems, context.resumeVersion)
    ]).slice(0, 15),
    policy: {
      canProceedToAudit: coverageScore >= 55 && blockers.length === 0,
      requiresResumeRevision: coverageScore < 75 || weak > 0 || missing > 0,
      noRealBossAction: true,
      noApplicationStatusChange: true
    },
    metadata: {
      method: "llm_with_verbatim_evidence_gate",
      resumeVersionId: context.resumeVersion.id || null,
      applicationId: context.application.id || context.resumeVersion.applicationId || null,
      requirementCount: coverageItems.length,
      evidenceReferenceCount: coverageItems.filter((item) => item.evidenceField).length
    }
  };
}

function evidenceMatchesVerbatim(canonical, proposed) {
  const left = multiline(canonical);
  const right = multiline(proposed);
  return Boolean(left && right && (left === right || (Math.min(left.length, right.length) >= 12 && left.includes(right))));
}

function normalizeConfidence(value) {
  const normalized = text(value).toLowerCase();
  return new Set(["low", "medium", "high"]).has(normalized) ? normalized : "low";
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

function fitEvaluatorError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.agent = AGENT_NAME;
  error.step = "evaluate_resume_fit";
  error.retryable = code === "LLM_REQUEST_FAILED" || code === "AGENT_OUTPUT_SCHEMA_INVALID";
  return error;
}

function extractJdRequirements(job = {}) {
  const description = multiline(job.description || "");
  const title = text(job.title || "");
  const tags = normalizeStringArray(job.tags);
  const lines = description
    .split(/\r?\n|[。；;]+/g)
    .map(text)
    .filter((line) => line.length >= 3)
    .slice(0, 80);
  const tagRequirements = unique(tags).map((item) => ({
    type: "skill",
    requirement: item,
    priority: "must",
    source: "tag"
  }));
  const inferredSkillRequirements = unique(TECH_TERMS
    .filter((term) => containsLoose(description, term) || containsLoose(title, term))
    .filter((term) => !tags.some((tag) => containsLoose(tag, term) || containsLoose(term, tag))))
    .map((item) => ({
      type: "skill",
      requirement: item,
      priority: "should",
      source: "keyword"
    }));
  const responsibilityRequirements = lines
    .filter((line) => RESPONSIBILITY_HINTS.some((hint) => line.includes(hint)))
    .slice(0, 8)
    .map((line) => ({
      type: "responsibility",
      requirement: line,
      priority: /必须|精通|熟悉|要求|需要/.test(line) ? "must" : "should",
      source: "description"
    }));
  const fallbackRequirements = !tagRequirements.length && !inferredSkillRequirements.length && !responsibilityRequirements.length && description
    ? lines.slice(0, 5).map((line) => ({
      type: "description",
      requirement: line,
      priority: "should",
      source: "description"
    }))
    : [];
  const requirements = uniqueRequirements([
    ...tagRequirements,
    ...inferredSkillRequirements,
    ...responsibilityRequirements,
    ...fallbackRequirements
  ]).slice(0, 30);
  return {
    title,
    descriptionLength: description.length,
    requirements
  };
}

function extractResumeEvidence(resumeVersion = {}) {
  const fields = resumeVersion.resumeFields || {};
  const template = resolveResumeTemplate(resumeVersion.renderMetadata?.template || resumeVersion.render_metadata?.template);
  const skills = template.showSkillsSection ? normalizeStringArray(fields.skills) : [];
  const projects = Array.isArray(fields.projects) ? fields.projects : [];
  const summary = template.showSummarySection ? multiline(fields.summary || "") : "";
  const projectEvidence = projects.flatMap((project, projectIndex) => {
    const title = text(project?.title || "");
    const projectSkills = normalizeStringArray(project?.skills);
    const bullets = normalizeStringArray(project?.bullets);
    return [
      ...projectSkills.map((item, skillIndex) => ({
        field: `projects[${projectIndex}].skills[${skillIndex}]`,
        text: item,
        source: "project_skill",
        title
      })),
      ...bullets.map((item, bulletIndex) => ({
        field: `projects[${projectIndex}].bullets[${bulletIndex}]`,
        text: item,
        source: "project_bullet",
        title
      }))
    ];
  });
  return [
    ...skills.map((item, index) => ({
      field: `skills[${index}]`,
      text: item,
      source: "skill"
    })),
    ...(summary ? [{
      field: "summary",
      text: summary,
      source: "summary"
    }] : []),
    ...projectEvidence
  ].filter((item) => item.text);
}

function evaluateRequirement(requirement, evidenceItems) {
  const scored = evidenceItems
    .map((evidence) => ({
      evidence,
      score: scoreEvidence(requirement.requirement, evidence.text)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  const status = best?.score >= 0.72 ? "covered" : best?.score >= 0.35 ? "weak" : "missing";
  return {
    ...requirement,
    status,
    score: best ? Math.round(best.score * 100) : 0,
    evidenceField: best?.evidence.field || "",
    evidenceText: best?.evidence.text || ""
  };
}

function scoreEvidence(requirement, evidence) {
  const req = text(requirement).toLowerCase();
  const ev = text(evidence).toLowerCase();
  if (!req || !ev) {
    return 0;
  }
  if (ev.includes(req) || req.includes(ev)) {
    return 1;
  }
  const reqTokens = tokenSet(req);
  const evTokens = tokenSet(ev);
  if (!reqTokens.size || !evTokens.size) {
    return 0;
  }
  const overlap = Array.from(reqTokens).filter((token) => evTokens.has(token)).length;
  return overlap / Math.max(1, Math.min(reqTokens.size, 8));
}

function buildRecommendations(items, resumeVersion) {
  const missing = items.filter((item) => item.status === "missing").slice(0, 8);
  const weak = items.filter((item) => item.status === "weak").slice(0, 8);
  const recommendations = [];
  if (missing.length) {
    recommendations.push(...missing.map((item) => ({
      type: "add_or_surface_evidence",
      requirement: item.requirement,
      reason: "No matching confirmed resume evidence was found.",
      allowedAction: "Only add this if the profile fact library has confirmed evidence."
    })));
  }
  if (weak.length) {
    recommendations.push(...weak.map((item) => ({
      type: "strengthen_existing_evidence",
      requirement: item.requirement,
      evidenceField: item.evidenceField,
      reason: "A weak match exists, but wording should be tightened against the JD.",
      allowedAction: "Rewrite only within existing source mapping and confirmed facts."
    })));
  }
  if (!recommendations.length) {
    recommendations.push({
      type: "keep_current_resume",
      requirement: "",
      reason: `Resume version #${resumeVersion.id || ""} covers the extracted JD requirements well.`.trim(),
      allowedAction: "Proceed to audit and local approval gates."
    });
  }
  return recommendations.slice(0, 12);
}

function normalizeInput(input = {}) {
  return {
    application: normalizeObject(input.application),
    job: normalizeJob(input.job || {}),
    resumeVersion: normalizeResumeVersion(input.resumeVersion || input.resume_version || {})
  };
}

function normalizeJob(job = {}) {
  return {
    id: Number(job.id || 0),
    title: text(job.title || ""),
    description: multiline(job.description || ""),
    tags: normalizeStringArray(job.tags)
  };
}

function normalizeResumeVersion(resumeVersion = {}) {
  return {
    id: Number(resumeVersion.id || 0),
    applicationId: Number(resumeVersion.applicationId || resumeVersion.application_id || 0),
    status: text(resumeVersion.status || ""),
    resumeFields: normalizeObject(resumeVersion.resumeFields || resumeVersion.resume_fields)
  };
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
  return value.map(text).filter(Boolean).slice(0, 120);
}

function uniqueRequirements(requirements) {
  const seen = new Set();
  const output = [];
  for (const item of requirements) {
    const key = `${item.type}:${text(item.requirement).toLowerCase()}`;
    if (!item.requirement || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}

function unique(values) {
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

function tokenSet(value) {
  return new Set(text(value)
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5+#.]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2));
}

function containsLoose(haystack, needle) {
  const left = text(haystack).toLowerCase();
  const right = text(needle).toLowerCase();
  return Boolean(left && right && (left.includes(right) || right.includes(left)));
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function multiline(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

module.exports = {
  AGENT_NAME,
  extractJdRequirements,
  runResumeFitEvaluator
};
