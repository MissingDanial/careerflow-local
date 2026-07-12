"use strict";

const fs = require("fs");
const path = require("path");
const { loadModelConfig, requestJsonCompletion } = require("./model-client");

const AGENT_NAME = "ProfileConversationAgent";
const PROMPT_VERSION = "m15.profile-conversation.prompt.v1";
const AGENT_VERSION = "m15.profile-conversation.agent.v1";
const DEFAULT_SKILL_ROOT = path.join(
  __dirname,
  "..",
  "..",
  ".agents",
  "skills",
  "career-retrospective-to-job"
);
const SKILL_FILES = [
  "SKILL.md",
  path.join("references", "interview_questions.md"),
  path.join("references", "resume_boundaries.md"),
  path.join("references", "role_clusters.md"),
  path.join("references", "profile_dialog_contract.md")
];

async function runProfileConversationAgent(input = {}, options = {}) {
  const modelConfig = resolveModelConfig(options.modelConfig || {});
  if (!modelConfig.configured) {
    throw profileConversationError(
      "LLM_CONFIG_INVALID",
      "OpenAI-compatible model config is not available for ProfileAgent conversation"
    );
  }
  const invoke = options.requestJsonCompletion || requestJsonCompletion;
  const skill = loadProfileConversationSkill(options);
  try {
    const output = await invoke({
      system: buildSystemPrompt(skill),
      user: JSON.stringify(buildModelInput(input), null, 2),
      config: modelConfig
    });
    return {
      ok: true,
      agent: AGENT_NAME,
      provider: "llm",
      fallbackUsed: false,
      promptVersion: PROMPT_VERSION,
      agentVersion: AGENT_VERSION,
      modelConfig: publicModelConfig(modelConfig),
      result: normalizeProfileConversationOutput(output, input)
    };
  } catch (error) {
    throw profileConversationError(
      error.code || "PROFILE_CONVERSATION_AGENT_FAILED",
      error.message || String(error),
      {
        cause: error,
        retryable: error.code === "LLM_REQUEST_FAILED"
      }
    );
  }
}

function loadProfileConversationSkill(options = {}) {
  const root = path.resolve(options.skillRoot || process.env.BOSS_PROFILE_SKILL_ROOT || DEFAULT_SKILL_ROOT);
  const sections = [];
  for (const relativePath of SKILL_FILES) {
    const filePath = path.join(root, relativePath);
    if (!fs.existsSync(filePath)) {
      if (relativePath === "SKILL.md" || relativePath.endsWith("profile_dialog_contract.md")) {
        throw profileConversationError("PROFILE_SKILL_MISSING", `Required ProfileAgent skill file is missing: ${filePath}`);
      }
      continue;
    }
    sections.push(`## Runtime skill source: ${relativePath}\n\n${fs.readFileSync(filePath, "utf8").trim()}`);
  }
  return {
    root,
    files: SKILL_FILES.filter((relativePath) => fs.existsSync(path.join(root, relativePath))),
    content: sections.join("\n\n").slice(0, 60000)
  };
}

function buildSystemPrompt(skill) {
  return [
    "You are ProfileAgent in a local-first career workflow.",
    "Conduct a useful multi-turn career interview in the user's language.",
    "Use the runtime career-retrospective skill below as binding procedural guidance.",
    "Return exactly one JSON object. Do not use markdown fences or prose outside JSON.",
    "Never silently mutate confirmed profile facts. Propose changes only through factDrafts.",
    "For corrections, use operation UPDATE and reference an existing entity id from confirmedProfile.",
    "Ask at most three focused follow-up questions in one turn.",
    "Do not expose hidden reasoning. Put only concise user-facing explanations in assistantReply and conflict summaries.",
    "A missing or uncertain detail should become a follow-up question, not a fabricated fact.",
    "",
    skill.content
  ].join("\n");
}

function buildModelInput(input = {}) {
  const userMessage = normalizeMessage(input.userMessage || {});
  return {
    task: "Continue the career retrospective, answer the user, and propose auditable profile fact drafts.",
    outputSchema: {
      assistantReply: "string",
      factDrafts: [{
        draftType: "profile | experience | skill | constraint",
        operation: "CREATE | UPDATE",
        targetEntityType: "profile | experience | skill | constraint; required for UPDATE",
        targetEntityId: "positive integer; required for UPDATE",
        title: "string",
        confidence: "confirmed | user_confirmed | inferred | needs_review",
        evidenceText: "verbatim or concise evidence from the user message",
        content: "type-specific object",
        reason: "short user-facing explanation"
      }],
      followupQuestions: [{
        id: "stable short id",
        prompt: "one focused question",
        reason: "why it matters",
        priority: "high | medium | low"
      }],
      conflicts: [{
        type: "contradiction | ambiguous_boundary | missing_evidence",
        summary: "short description",
        existingEntityType: "profile | experience | skill | constraint | empty",
        existingEntityId: "positive integer or null",
        proposedValue: "string",
        resolutionQuestion: "string"
      }],
      sessionSummaryPatch: {
        goals: ["durable target roles and job-search priorities"],
        motivations: ["durable motivations and values"],
        preferences: ["work style, city, industry, and company preferences"],
        projectThemes: ["repeated project or capability themes"],
        strengths: ["evidence-backed strengths"],
        constraints: ["job-search and truth boundaries"],
        unresolvedTopics: ["topics that still require clarification"]
      }
    },
    rules: [
      "Only facts supported by the current user message or confirmed profile may enter factDrafts.",
      "Use CREATE for genuinely new entities and UPDATE for corrections to an existing entity.",
      "A profile draft updates displayName, headline, location, summary, or target fields.",
      "Keep employment/project boundaries defensible while optimizing useful resume evidence.",
      "Do not repeat a pending draft unless the user materially changed it.",
      "assistantReply must state what was understood and what still needs confirmation."
    ],
    session: normalizeSession(input.session || {}),
    confirmedProfile: normalizeProfileForPrompt(input.profileBundle || input.profile || {}),
    recentMessages: (Array.isArray(input.recentMessages) ? input.recentMessages : [])
      .filter((message) => message?.status !== "FAILED")
      .slice(-12)
      .map(normalizeMessage),
    currentUserMessage: userMessage
  };
}

function normalizeProfileConversationOutput(output = {}, input = {}) {
  const assistantReply = multiline(output.assistantReply || output.assistant_reply || "").slice(0, 12000);
  if (!assistantReply) {
    throw profileConversationError("AGENT_OUTPUT_SCHEMA_INVALID", "ProfileAgent model output is missing assistantReply");
  }
  const profile = normalizeProfileForPrompt(input.profileBundle || input.profile || {});
  const factDrafts = (Array.isArray(output.factDrafts || output.fact_drafts)
    ? output.factDrafts || output.fact_drafts
    : [])
    .map((draft) => normalizeModelFactDraft(draft, profile, input.userMessage))
    .filter(Boolean)
    .slice(0, 12);
  return {
    assistantReply,
    factDrafts,
    followupQuestions: normalizeFollowupQuestions(output.followupQuestions || output.followup_questions),
    conflicts: normalizeConflicts(output.conflicts),
    sessionSummaryPatch: boundedObject(output.sessionSummaryPatch || output.session_summary_patch || {}),
    summary: {
      proposedDraftCount: factDrafts.length,
      followupQuestionCount: normalizeFollowupQuestions(output.followupQuestions || output.followup_questions).length,
      conflictCount: normalizeConflicts(output.conflicts).length
    }
  };
}

function normalizeModelFactDraft(value = {}, profile, userMessage = {}) {
  const draftType = enumValue(value.draftType || value.draft_type || value.type, [
    "profile", "experience", "skill", "constraint"
  ]);
  if (!draftType) {
    return null;
  }
  const requestedOperation = enumValue(value.operation, ["CREATE", "UPDATE"], true) || "CREATE";
  const operation = draftType === "profile" ? "UPDATE" : requestedOperation;
  const targetEntityType = operation === "UPDATE"
    ? enumValue(value.targetEntityType || value.target_entity_type || value.target?.type || draftType, [
      "profile", "experience", "skill", "constraint"
    ])
    : "";
  const targetEntityId = operation === "UPDATE"
    ? positiveInteger(value.targetEntityId || value.target_entity_id || value.target?.id || (draftType === "profile" ? profile.profile.id : 0))
    : 0;
  if (operation === "UPDATE" && (targetEntityType !== draftType || !profileEntityExists(profile, targetEntityType, targetEntityId))) {
    return null;
  }
  const content = normalizeDraftContent(draftType, value.content || {});
  const title = text(value.title || content.title || content.name || content.content || `${draftType} update`).slice(0, 180);
  const evidenceText = multiline(value.evidenceText || value.evidence_text || userMessage.content || "").slice(0, 8000);
  if (!title || !evidenceText) {
    return null;
  }
  return {
    draftType,
    operation,
    targetEntityType,
    targetEntityId: targetEntityId || null,
    title,
    confidence: enumValue(value.confidence, ["confirmed", "user_confirmed", "inferred", "needs_review"]) || "needs_review",
    evidenceText,
    content,
    metadata: {
      generator: AGENT_NAME,
      promptVersion: PROMPT_VERSION,
      reason: text(value.reason || "").slice(0, 500)
    }
  };
}

function normalizeDraftContent(draftType, value = {}) {
  if (draftType === "profile") {
    return compactObject({
      displayName: text(value.displayName || value.display_name || ""),
      headline: text(value.headline || ""),
      location: text(value.location || ""),
      summary: multiline(value.summary || ""),
      target: boundedObject(value.target || {})
    });
  }
  if (draftType === "experience") {
    return compactObject({
      kind: enumValue(value.kind || value.type, ["work", "project", "education", "award", "certification", "activity", "other"]) || "project",
      title: text(value.title || ""),
      organization: text(value.organization || value.company || value.school || ""),
      role: text(value.role || ""),
      startDate: text(value.startDate || value.start_date || ""),
      endDate: text(value.endDate || value.end_date || ""),
      facts: stringArray(value.facts, 20),
      skills: stringArray(value.skills, 20),
      evidenceText: multiline(value.evidenceText || value.evidence_text || ""),
      evidenceSource: text(value.evidenceSource || value.evidence_source || "profile_dialog"),
      confidence: enumValue(value.confidence, ["confirmed", "user_confirmed", "inferred", "needs_review"]) || "needs_review",
      allowedRewrites: stringArray(value.allowedRewrites || value.allowed_rewrites, 12),
      forbiddenClaims: stringArray(value.forbiddenClaims || value.forbidden_claims, 12)
    });
  }
  if (draftType === "skill") {
    return compactObject({
      name: text(value.name || ""),
      category: text(value.category || ""),
      proficiency: enumValue(value.proficiency, ["aware", "basic", "familiar", "proficient", "expert"]) || "familiar",
      evidence: stringArray(value.evidence, 20)
    });
  }
  return compactObject({
    ruleType: enumValue(value.ruleType || value.rule_type || value.type, [
      "forbidden_claim", "allowed_rewrite", "preference", "hard_limit", "risk_note", "excluded_direction"
    ]),
    content: multiline(value.content || value.text || ""),
    severity: enumValue(value.severity, ["info", "warning", "blocker"]) || "warning",
    metadata: boundedObject(value.metadata || {})
  });
}

function normalizeProfileForPrompt(bundle = {}) {
  const profile = bundle.profile || bundle;
  return {
    profile: {
      id: positiveInteger(profile.id),
      displayName: text(profile.displayName || profile.display_name || ""),
      headline: text(profile.headline || ""),
      location: text(profile.location || ""),
      target: boundedObject(profile.target || {}),
      summary: multiline(profile.summary || "")
    },
    resumeSources: (Array.isArray(bundle.resumeSources) ? bundle.resumeSources : []).slice(0, 5).map((source) => ({
      id: positiveInteger(source.id),
      sourceType: text(source.sourceType || source.source_type || ""),
      fileName: text(source.fileName || source.file_name || ""),
      textLength: Number(source.textLength || String(source.rawText || source.raw_text || "").length || 0),
      createdAt: text(source.createdAt || source.created_at || "")
    })),
    experiences: (Array.isArray(bundle.experiences) ? bundle.experiences : []).slice(0, 80).map((item) => boundedObject(item)),
    skills: (Array.isArray(bundle.skills) ? bundle.skills : []).slice(0, 80).map((item) => boundedObject(item)),
    constraints: (Array.isArray(bundle.constraints) ? bundle.constraints : []).slice(0, 80).map((item) => boundedObject(item)),
    pendingFactDrafts: (Array.isArray(bundle.pendingFactDrafts) ? bundle.pendingFactDrafts : []).slice(0, 50).map((item) => ({
      id: positiveInteger(item.id),
      draftType: text(item.draftType || item.draft_type || ""),
      operation: text(item.operation || "CREATE"),
      targetEntityType: text(item.targetEntityType || item.target_entity_type || ""),
      targetEntityId: positiveInteger(item.targetEntityId || item.target_entity_id || 0) || null,
      title: text(item.title || ""),
      evidenceText: multiline(item.evidenceText || item.evidence_text || "").slice(0, 1500),
      content: boundedObject(item.content || {})
    }))
  };
}

function normalizeSession(value = {}) {
  return {
    id: positiveInteger(value.id),
    title: text(value.title || ""),
    status: text(value.status || ""),
    summary: boundedObject(value.summary || {}),
    openQuestions: normalizeFollowupQuestions(value.openQuestions || value.open_questions),
    conflicts: normalizeConflicts(value.conflicts)
  };
}

function normalizeMessage(value = {}) {
  return {
    id: positiveInteger(value.id),
    role: enumValue(value.role, ["user", "assistant", "system"]) || "user",
    status: text(value.status || "COMPLETED"),
    content: multiline(value.content || "").slice(0, 12000),
    createdAt: text(value.createdAt || value.created_at || "")
  };
}

function normalizeFollowupQuestions(value) {
  return (Array.isArray(value) ? value : []).map((item, index) => ({
    id: token(item?.id || `followup_${index + 1}`),
    prompt: multiline(item?.prompt || item?.question || "").slice(0, 800),
    reason: text(item?.reason || "").slice(0, 400),
    priority: enumValue(item?.priority, ["high", "medium", "low"]) || "medium"
  })).filter((item) => item.prompt).slice(0, 3);
}

function normalizeConflicts(value) {
  return (Array.isArray(value) ? value : []).map((item) => ({
    type: enumValue(item?.type, ["contradiction", "ambiguous_boundary", "missing_evidence"]) || "ambiguous_boundary",
    summary: multiline(item?.summary || "").slice(0, 800),
    existingEntityType: enumValue(item?.existingEntityType || item?.existing_entity_type, [
      "profile", "experience", "skill", "constraint"
    ]),
    existingEntityId: positiveInteger(item?.existingEntityId || item?.existing_entity_id || 0) || null,
    proposedValue: multiline(item?.proposedValue || item?.proposed_value || "").slice(0, 1000),
    resolutionQuestion: multiline(item?.resolutionQuestion || item?.resolution_question || "").slice(0, 800)
  })).filter((item) => item.summary || item.resolutionQuestion).slice(0, 12);
}

function profileEntityExists(profile, type, id) {
  if (!type || !id) {
    return false;
  }
  if (type === "profile") {
    return profile.profile.id === id;
  }
  const collection = type === "experience"
    ? profile.experiences
    : type === "skill"
      ? profile.skills
      : profile.constraints;
  return collection.some((item) => positiveInteger(item.id) === id);
}

function resolveModelConfig(overrides = {}) {
  const loaded = loadModelConfig(overrides);
  const config = {
    ...loaded,
    ...(overrides && typeof overrides === "object" ? overrides : {})
  };
  config.configured = overrides.configured === false
    ? false
    : Boolean(config.apiKey && config.baseUrl && config.model) || Boolean(overrides.configured);
  return config;
}

function publicModelConfig(config) {
  return {
    configured: Boolean(config.configured),
    baseUrl: config.baseUrl || "",
    model: config.model || "",
    wireApi: config.wireApi || "",
    reasoningEffort: config.reasoningEffort || "",
    source: config.source || ""
  };
}

function boundedObject(value, depth = 0) {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 4) {
    return {};
  }
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 60)) {
    if (Array.isArray(item)) {
      result[key] = item.slice(0, 30).map((entry) => (
        entry && typeof entry === "object" ? boundedObject(entry, depth + 1) : multiline(entry).slice(0, 1500)
      ));
    } else if (item && typeof item === "object") {
      result[key] = boundedObject(item, depth + 1);
    } else if (typeof item === "boolean" || typeof item === "number") {
      result[key] = item;
    } else {
      result[key] = multiline(item).slice(0, 3000);
    }
  }
  return result;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => {
    if (Array.isArray(item)) {
      return item.length > 0;
    }
    if (item && typeof item === "object") {
      return Object.keys(item).length > 0;
    }
    return item !== "" && item !== null && item !== undefined;
  }));
}

function stringArray(value, limit = 30) {
  const values = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
  return Array.from(new Set(values.flatMap((item) => String(item || "").split(/[\n；;]/)).map(text).filter(Boolean))).slice(0, limit);
}

function enumValue(value, allowed, upper = false) {
  const normalized = upper ? text(value).toUpperCase() : text(value).toLowerCase();
  const normalizedAllowed = upper ? allowed : allowed.map((item) => item.toLowerCase());
  const index = normalizedAllowed.indexOf(normalized);
  return index >= 0 ? allowed[index] : "";
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function token(value) {
  return text(value).replace(/[^a-z0-9_\-\u4e00-\u9fa5]+/gi, "_").slice(0, 80);
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

function profileConversationError(code, message, options = {}) {
  const error = new Error(message, options.cause ? { cause: options.cause } : undefined);
  error.code = code;
  error.agent = AGENT_NAME;
  error.step = "profile_dialog_turn";
  error.retryable = Boolean(options.retryable || code === "LLM_REQUEST_FAILED");
  return error;
}

module.exports = {
  AGENT_NAME,
  AGENT_VERSION,
  PROMPT_VERSION,
  buildModelInput,
  loadProfileConversationSkill,
  normalizeProfileConversationOutput,
  runProfileConversationAgent
};
