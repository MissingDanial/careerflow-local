"use strict";

const { loadModelConfig } = require("./model-client");

const ROUTE_ALIASES = {
  ScreeningAgent: ["ScreeningAgent", "screening"],
  ResumeAgent: ["ResumeAgent", "resume"],
  ResumeFitEvaluator: ["ResumeFitEvaluator", "fit"],
  ResumeRevisionAgent: ["ResumeRevisionAgent", "revision"],
  AuditAgent: ["AuditAgent", "audit"]
};
const MODEL_ROUTE_FIELDS = new Set([
  "baseUrl",
  "model",
  "wireApi",
  "reasoningEffort",
  "timeoutMs",
  "maxRetries",
  "inputCostPerMillion",
  "outputCostPerMillion"
]);

function normalizeModelRoutes(value = {}) {
  const routes = normalizeObject(value);
  const output = {};
  for (const agentName of Object.keys(ROUTE_ALIASES)) {
    const route = findRoute(routes, agentName);
    if (route) {
      output[agentName] = normalizeRoute(route);
    }
  }
  return output;
}

function resolveAgentRuntime(input = {}, agentName) {
  const routes = normalizeModelRoutes({
    ...normalizeObject(input.modelConfig?.modelRoutes),
    ...normalizeObject(input.modelRoutes)
  });
  const route = routes[agentName] || {};
  const routeConfig = normalizeObject(route.modelConfig || route);
  const modelConfig = {
    ...normalizeObject(input.modelConfig),
    ...pickModelConfig(routeConfig)
  };
  return {
    agentName,
    mode: normalizeMode(route.mode || input.mode || "rules"),
    modelConfig,
    routed: Boolean(routes[agentName]),
    route
  };
}

function resolveWorkflowRuntime(input = {}) {
  const mode = normalizeMode(input.mode || "rules");
  const suppliedConfig = normalizeObject(input.modelConfig);
  const modelConfig = mode === "rules" ? suppliedConfig : loadModelConfig(suppliedConfig);
  return {
    mode,
    modelConfig,
    modelRoutes: normalizeModelRoutes({
      ...normalizeObject(modelConfig.modelRoutes),
      ...normalizeObject(input.modelRoutes)
    })
  };
}

function resolveAuditRuntime(state = {}) {
  const runtime = resolveAgentRuntime(state, "AuditAgent");
  const hasExplicitMode = Boolean(runtime.route.mode);
  if (
    !hasExplicitMode
    && state.fastAudit !== false
    && new Set(["auto", "hybrid"]).has(runtime.mode)
    && isFastAuditEligible(state)
  ) {
    return {
      ...runtime,
      mode: "rules",
      fastPath: true
    };
  }
  return {
    ...runtime,
    fastPath: false
  };
}

function publicModelIdentity(config = {}, mode = "") {
  if (normalizeMode(mode) === "rules") {
    return { mode: "rules" };
  }
  const loaded = loadModelConfig(config);
  return {
    configured: Boolean(loaded.configured),
    baseUrl: cleanText(loaded.baseUrl),
    model: cleanText(loaded.model),
    wireApi: normalizeWireApi(loaded.wireApi),
    reasoningEffort: normalizeReasoningEffort(loaded.reasoningEffort),
    timeoutMs: Number(loaded.timeoutMs || 0),
    maxRetries: Number(loaded.maxRetries || 0),
    source: cleanText(loaded.source)
  };
}

function isFastAuditEligible(state = {}) {
  const claim = state.resumeClaimVerification || {};
  const fit = state.resumeFitEvaluation || {};
  const renderQuality = state.resumeVersion?.renderMetadata?.renderQuality;
  return Boolean(
    claim.truthfulnessPassed
    && Number(claim.unsupportedCount || 0) === 0
    && Number(claim.needsUserConfirmationCount || 0) === 0
    && (!Array.isArray(fit.blockers) || fit.blockers.length === 0)
    && (!renderQuality || renderQuality.ok !== false)
  );
}

function findRoute(routes, agentName) {
  for (const alias of ROUTE_ALIASES[agentName] || [agentName]) {
    const route = routes[alias];
    if (route && typeof route === "object" && !Array.isArray(route)) {
      return route;
    }
  }
  return null;
}

function normalizeRoute(route = {}) {
  const output = pickModelConfig(route.modelConfig || route);
  const mode = normalizeMode(route.mode || "");
  if (route.mode && mode) {
    output.mode = mode;
  }
  return output;
}

function pickModelConfig(value = {}) {
  const output = {};
  for (const [key, item] of Object.entries(normalizeObject(value))) {
    if (MODEL_ROUTE_FIELDS.has(key) && item !== undefined && item !== null && item !== "") {
      output[key] = item;
    }
  }
  return output;
}

function normalizeMode(value) {
  const mode = cleanText(value).toLowerCase();
  return new Set(["rules", "auto", "llm", "hybrid"]).has(mode) ? mode : "rules";
}

function normalizeWireApi(value) {
  const wireApi = cleanText(value || "responses").toLowerCase();
  return new Set(["chat", "chat_completions", "chat.completions"]).has(wireApi) ? "chat" : "responses";
}

function normalizeReasoningEffort(value) {
  const effort = cleanText(value).toLowerCase();
  return effort === "xhigh" ? "high" : new Set(["minimal", "low", "medium", "high"]).has(effort) ? effort : "";
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

module.exports = {
  normalizeModelRoutes,
  publicModelIdentity,
  resolveAgentRuntime,
  resolveAuditRuntime,
  resolveWorkflowRuntime
};
