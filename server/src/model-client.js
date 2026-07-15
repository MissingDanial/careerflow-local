const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const OpenAIImport = require("openai");

const OpenAI = OpenAIImport.default || OpenAIImport;
const DEFAULT_CONFIG_PATH = path.join(__dirname, "..", "..", "gpt5.5.txt");
const DEFAULT_LOCAL_CONFIG_PATH = path.join(__dirname, "..", "..", "boss-model.local.json");
const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_MAX_RETRIES = 1;
const TELEMETRY_SCHEMA_VERSION = "m16.model-telemetry.v1";

function loadModelConfig(options = {}) {
  const configPath = options.configPath || process.env.BOSS_MODEL_CONFIG_PATH || DEFAULT_CONFIG_PATH;
  const fileConfig = readLooseModelConfig(configPath);
  const localConfigPath = options.localConfigPath
    || process.env.BOSS_MODEL_LOCAL_CONFIG_PATH
    || DEFAULT_LOCAL_CONFIG_PATH;
  const localConfig = readLocalModelConfig(localConfigPath);
  const secretConfigPath = options.secretConfigPath || resolveModelSecretConfigPath();
  const secretConfig = readSecretModelConfig(secretConfigPath);
  const apiKey = options.apiKey
    || process.env.OPENAI_API_KEY
    || process.env.BOSS_OPENAI_API_KEY
    || secretConfig.apiKey
    || fileConfig.apiKey
    || "";
  const baseUrl = options.baseUrl
    || process.env.OPENAI_BASE_URL
    || process.env.BOSS_OPENAI_BASE_URL
    || secretConfig.baseUrl
    || localConfig.baseUrl
    || fileConfig.baseUrl
    || "https://api.openai.com";
  const model = options.model
    || process.env.OPENAI_MODEL
    || process.env.BOSS_OPENAI_MODEL
    || secretConfig.model
    || localConfig.model
    || fileConfig.model
    || "";
  const wireApi = options.wireApi
    || process.env.OPENAI_WIRE_API
    || process.env.BOSS_OPENAI_WIRE_API
    || secretConfig.wireApi
    || localConfig.wireApi
    || fileConfig.wireApi
    || "responses";
  const reasoningEffort = firstDefined(
    options.reasoningEffort,
    process.env.OPENAI_REASONING_EFFORT,
    process.env.BOSS_OPENAI_REASONING_EFFORT,
    secretConfig.reasoningEffort,
    localConfig.reasoningEffort,
    fileConfig.reasoningEffort,
    ""
  );
  const modelRoutes = firstObject(
    options.modelRoutes,
    secretConfig.modelRoutes,
    localConfig.modelRoutes,
    fileConfig.modelRoutes
  );

  const source = options.source
    || (options.apiKey || options.baseUrl || options.model ? "explicit" : "")
    || (process.env.OPENAI_API_KEY || process.env.BOSS_OPENAI_API_KEY ? "env" : "")
    || (secretConfig.source ? "model_provider_local" : "")
    || (localConfig.source ? "local_overlay" : "")
    || (fileConfig.source ? "file" : "")
    || "default";

  return {
    configured: options.configured === false ? false : Boolean(apiKey && baseUrl && model),
    apiKey,
    baseUrl,
    model,
    wireApi,
    reasoningEffort,
    timeoutMs: positiveNumber(
      options.timeoutMs
        || process.env.BOSS_MODEL_TIMEOUT_MS
        || secretConfig.timeoutMs
        || localConfig.timeoutMs
        || fileConfig.timeoutMs
    )
      || DEFAULT_TIMEOUT_MS,
    maxRetries: clampInteger(
      options.maxRetries
        ?? process.env.BOSS_MODEL_MAX_RETRIES
        ?? secretConfig.maxRetries
        ?? localConfig.maxRetries
        ?? fileConfig.maxRetries
        ?? DEFAULT_MAX_RETRIES,
      0,
      3
    ),
    inputCostPerMillion: nonNegativeNumber(
      options.inputCostPerMillion
        ?? process.env.BOSS_MODEL_INPUT_COST_PER_MILLION
        ?? secretConfig.inputCostPerMillion
        ?? localConfig.inputCostPerMillion
        ?? fileConfig.inputCostPerMillion
    ),
    outputCostPerMillion: nonNegativeNumber(
      options.outputCostPerMillion
        ?? process.env.BOSS_MODEL_OUTPUT_COST_PER_MILLION
        ?? secretConfig.outputCostPerMillion
        ?? localConfig.outputCostPerMillion
        ?? fileConfig.outputCostPerMillion
    ),
    modelRoutes,
    source
  };
}

async function requestJsonCompletion(options = {}) {
  const completion = await requestStructuredCompletion(options);
  return completion.data;
}

async function requestStructuredCompletion({
  system,
  user,
  config,
  schema,
  schemaName = "agent_output"
}) {
  const effectiveConfig = config || loadModelConfig();
  if (!effectiveConfig.configured) {
    throw agentClientError("LLM_CONFIG_INVALID", "OpenAI-compatible model config is not available");
  }

  const wireApi = normalizeWireApi(effectiveConfig.wireApi);
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const attempts = [];
  const requestHash = hashValue({
    model: effectiveConfig.model,
    wireApi,
    schemaName,
    system: String(system || ""),
    user: String(user || "")
  });
  let lastError = null;

  for (let attempt = 1; attempt <= Number(effectiveConfig.maxRetries || 0) + 1; attempt += 1) {
    const attemptStartedMs = Date.now();
    let attemptUsage = emptyUsage();
    let responseId = "";
    try {
      const response = wireApi === "chat"
        ? await requestChatCompletion({ system, user, config: effectiveConfig })
        : await requestResponsesCompletion({ system, user, config: effectiveConfig });
      responseId = cleanText(response.response?.id || "");
      attemptUsage = normalizeUsage(response.response, wireApi);
      const data = validateSchema(parseJsonFromModelText(response.text), schema, schemaName);
      const finishedAt = new Date().toISOString();
      attempts.push({
        attempt,
        status: "SUCCEEDED",
        durationMs: Date.now() - attemptStartedMs,
        responseId,
        usage: attemptUsage
      });
      const usage = aggregateAttemptUsage(attempts);
      return {
        data,
        telemetry: {
          schemaVersion: TELEMETRY_SCHEMA_VERSION,
          provider: "openai-compatible",
          model: cleanText(effectiveConfig.model),
          wireApi,
          schemaName: cleanText(schemaName),
          requestHash,
          responseId,
          startedAt,
          finishedAt,
          durationMs: Date.now() - startedMs,
          attemptCount: attempts.length,
          attempts,
          usage,
          estimatedCostUsd: estimateCostUsd(usage, effectiveConfig)
        }
      };
    } catch (error) {
      lastError = normalizeModelError(error);
      attempts.push({
        attempt,
        status: "FAILED",
        durationMs: Date.now() - attemptStartedMs,
        responseId,
        errorCode: lastError.code,
        errorMessage: cleanText(lastError.message).slice(0, 500),
        usage: attemptUsage
      });
      const retriesRemaining = attempt <= Number(effectiveConfig.maxRetries || 0);
      if (!retriesRemaining || !isRetryableModelError(lastError)) {
        break;
      }
      const retryDelayMs = calculateRetryDelayMs(lastError, attempt);
      attempts[attempts.length - 1].retryDelayMs = retryDelayMs;
      await delay(retryDelayMs);
    }
  }

  const finishedAt = new Date().toISOString();
  lastError.telemetry = {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    provider: "openai-compatible",
    model: cleanText(effectiveConfig.model),
    wireApi,
    schemaName: cleanText(schemaName),
    requestHash,
    responseId: "",
    startedAt,
    finishedAt,
    durationMs: Date.now() - startedMs,
    attemptCount: attempts.length,
    attempts,
    usage: aggregateAttemptUsage(attempts),
    estimatedCostUsd: estimateCostUsd(aggregateAttemptUsage(attempts), effectiveConfig)
  };
  throw lastError;
}

async function requestResponsesCompletion({ system, user, config }) {
  const client = createClient(config);
  const body = {
    model: config.model,
    input: [
      { role: "system", content: String(system || "") },
      { role: "user", content: String(user || "") }
    ],
    text: {
      format: { type: "json_object" }
    }
  };
  const effort = normalizeReasoningEffort(config.reasoningEffort);
  if (effort) {
    body.reasoning = { effort };
  }
  const response = await client.responses.create(body);
  return {
    response,
    text: extractOutputText(response)
  };
}

async function requestChatCompletion({ system, user, config }) {
  const client = createClient(config);
  const rawResponse = await client.chat.completions.create({
    model: config.model,
    messages: [
      { role: "system", content: String(system || "") },
      { role: "user", content: String(user || "") }
    ],
    response_format: { type: "json_object" }
  });
  const response = normalizeSdkResponse(rawResponse, "Chat Completions");
  return {
    response,
    text: extractChatOutputText(response)
  };
}

function normalizeSdkResponse(response, apiName) {
  if (response && typeof response === "object") {
    return response;
  }
  if (typeof response !== "string" || !response.trim()) {
    throw agentClientError("LLM_RESPONSE_INVALID", `${apiName} returned an empty or unsupported response`);
  }
  try {
    const parsed = JSON.parse(response);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // Report a stable transport error without persisting the provider response body.
  }
  throw agentClientError("LLM_RESPONSE_INVALID", `${apiName} returned a non-object JSON response`);
}

function extractChatOutputText(response) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => typeof item === "string" ? item : item?.text || "")
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function createClient(config) {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: resolveApiBaseUrl(config.baseUrl),
    timeout: Math.max(1000, Number(config.timeoutMs) || DEFAULT_TIMEOUT_MS),
    maxRetries: 0
  });
}

function resolveApiBaseUrl(baseUrl) {
  const normalized = String(baseUrl || "").replace(/\/+$/, "");
  if (/\/v\d+$/i.test(normalized)) {
    return normalized;
  }
  return `${normalized}/v1`;
}

function extractOutputText(parsed) {
  if (typeof parsed?.output_text === "string" && parsed.output_text.trim()) {
    return parsed.output_text;
  }
  const parts = [];
  for (const item of parsed?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function parseJsonFromModelText(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    throw agentClientError("AGENT_OUTPUT_SCHEMA_INVALID", "Model returned empty output");
  }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  const candidate = fenced
    ? fenced[1].trim()
    : firstBrace >= 0 && lastBrace >= firstBrace
      ? raw.slice(firstBrace, lastBrace + 1)
      : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    throw agentClientError("AGENT_OUTPUT_SCHEMA_INVALID", "Model returned invalid JSON");
  }
}

function validateSchema(data, schema, schemaName) {
  if (!schema || typeof schema.safeParse !== "function") {
    return data;
  }
  const parsed = schema.safeParse(data);
  if (parsed.success) {
    return parsed.data;
  }
  const issues = (parsed.error?.issues || []).slice(0, 8).map((issue) => {
    const location = Array.isArray(issue.path) && issue.path.length ? issue.path.join(".") : "root";
    return `${location}: ${issue.message}`;
  });
  throw agentClientError(
    "AGENT_OUTPUT_SCHEMA_INVALID",
    `${schemaName || "Agent output"} failed schema validation: ${issues.join("; ")}`
  );
}

function normalizeUsage(response, wireApi) {
  const usage = response?.usage || {};
  if (wireApi === "chat") {
    return {
      inputTokens: nonNegativeInteger(usage.prompt_tokens),
      outputTokens: nonNegativeInteger(usage.completion_tokens),
      reasoningTokens: nonNegativeInteger(usage.completion_tokens_details?.reasoning_tokens),
      totalTokens: nonNegativeInteger(usage.total_tokens)
    };
  }
  return {
    inputTokens: nonNegativeInteger(usage.input_tokens),
    outputTokens: nonNegativeInteger(usage.output_tokens),
    reasoningTokens: nonNegativeInteger(usage.output_tokens_details?.reasoning_tokens),
    totalTokens: nonNegativeInteger(usage.total_tokens)
  };
}

function estimateCostUsd(usage, config) {
  const inputRate = nonNegativeNumber(config.inputCostPerMillion);
  const outputRate = nonNegativeNumber(config.outputCostPerMillion);
  if (!inputRate && !outputRate) {
    return null;
  }
  const value = ((usage.inputTokens * inputRate) + (usage.outputTokens * outputRate)) / 1_000_000;
  return Number(value.toFixed(8));
}

function aggregateAttemptUsage(attempts) {
  return (attempts || []).reduce((summary, attempt) => {
    const usage = attempt.usage || {};
    summary.inputTokens += nonNegativeInteger(usage.inputTokens);
    summary.outputTokens += nonNegativeInteger(usage.outputTokens);
    summary.reasoningTokens += nonNegativeInteger(usage.reasoningTokens);
    summary.totalTokens += nonNegativeInteger(usage.totalTokens);
    return summary;
  }, emptyUsage());
}

function normalizeModelError(error) {
  if (["AGENT_OUTPUT_SCHEMA_INVALID", "LLM_CONFIG_INVALID", "LLM_RESPONSE_INVALID"].includes(error?.code)) {
    return error;
  }
  const status = Number(error?.status || error?.response?.status || 0);
  const message = status
    ? `Model request failed with HTTP ${status}: ${cleanText(error?.message || "request failed").slice(0, 300)}`
    : cleanText(error?.message || String(error) || "Model request failed");
  const normalized = agentClientError("LLM_REQUEST_FAILED", message);
  normalized.status = status || null;
  normalized.cause = error;
  return normalized;
}

function isRetryableModelError(error) {
  if (["AGENT_OUTPUT_SCHEMA_INVALID", "LLM_RESPONSE_INVALID"].includes(error?.code)) {
    return true;
  }
  if (error?.code !== "LLM_REQUEST_FAILED") {
    return false;
  }
  return !error.status || error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500;
}

function calculateRetryDelayMs(error, attempt) {
  if (error?.code === "AGENT_OUTPUT_SCHEMA_INVALID" || error?.code === "LLM_RESPONSE_INVALID") {
    return Math.min(2000, 250 * (2 ** Math.max(0, attempt - 1)));
  }
  const status = Number(error?.status || 0);
  if (status === 429) {
    return Math.min(20000, 3000 * (2 ** Math.max(0, attempt - 1)));
  }
  if (status >= 500) {
    return Math.min(15000, 2000 * (2 ** Math.max(0, attempt - 1)));
  }
  return Math.min(5000, 1000 * (2 ** Math.max(0, attempt - 1)));
}

function readLooseModelConfig(configPath) {
  if (!configPath || !fs.existsSync(configPath)) {
    return {};
  }
  const text = fs.readFileSync(configPath, "utf8");
  return {
    source: configPath,
    model: matchAssignment(text, "model"),
    baseUrl: matchAssignment(text, "base_url"),
    wireApi: matchAssignment(text, "wire_api"),
    reasoningEffort: matchAssignment(text, "model_reasoning_effort"),
    timeoutMs: matchAssignment(text, "model_timeout_ms"),
    maxRetries: matchAssignment(text, "model_max_retries"),
    inputCostPerMillion: matchAssignment(text, "model_input_cost_per_million"),
    outputCostPerMillion: matchAssignment(text, "model_output_cost_per_million"),
    apiKey: matchJsonString(text, "OPENAI_API_KEY") || matchAssignment(text, "OPENAI_API_KEY")
  };
}

function readLocalModelConfig(configPath) {
  if (!configPath || !fs.existsSync(configPath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("root must be an object");
    }
    return {
      source: configPath,
      baseUrl: cleanText(parsed.baseUrl),
      model: cleanText(parsed.model),
      wireApi: cleanText(parsed.wireApi),
      reasoningEffort: Object.prototype.hasOwnProperty.call(parsed, "reasoningEffort")
        ? cleanText(parsed.reasoningEffort)
        : undefined,
      timeoutMs: parsed.timeoutMs,
      maxRetries: parsed.maxRetries,
      inputCostPerMillion: parsed.inputCostPerMillion,
      outputCostPerMillion: parsed.outputCostPerMillion,
      modelRoutes: normalizeObject(parsed.modelRoutes)
    };
  } catch {
    throw agentClientError("LLM_CONFIG_INVALID", "boss-model.local.json must contain a valid JSON object");
  }
}

function readSecretModelConfig(configPath) {
  if (!configPath || !fs.existsSync(configPath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("root must be an object");
    }
    return {
      source: configPath,
      apiKey: cleanText(parsed.apiKey),
      baseUrl: cleanText(parsed.baseUrl),
      model: cleanText(parsed.model),
      wireApi: cleanText(parsed.wireApi),
      reasoningEffort: Object.prototype.hasOwnProperty.call(parsed, "reasoningEffort")
        ? cleanText(parsed.reasoningEffort)
        : undefined,
      timeoutMs: parsed.timeoutMs,
      maxRetries: parsed.maxRetries,
      inputCostPerMillion: parsed.inputCostPerMillion,
      outputCostPerMillion: parsed.outputCostPerMillion,
      modelRoutes: normalizeObject(parsed.modelRoutes)
    };
  } catch {
    throw agentClientError(
      "LLM_CONFIG_INVALID",
      "server/data/model-provider.local.json must contain a valid JSON object"
    );
  }
}

function resolveModelSecretConfigPath(options = {}) {
  const dataDir = options.dataDir
    || process.env.BOSS_DATA_DIR
    || path.join(__dirname, "..", "data");
  return path.resolve(
    options.secretConfigPath
      || process.env.BOSS_MODEL_SECRET_CONFIG_PATH
      || path.join(dataDir, "model-provider.local.json")
  );
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function matchAssignment(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(text || "").match(new RegExp(`^\\s*${escaped}\\s*=\\s*"?([^"\\r\\n]+)"?`, "mi"));
  return match ? match[1].trim() : "";
}

function matchJsonString(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(text || "").match(new RegExp(`"${escaped}"\\s*:\\s*"([^"]+)"`, "i"));
  return match ? match[1].trim() : "";
}

function normalizeReasoningEffort(value) {
  const effort = String(value || "").toLowerCase();
  if (effort === "xhigh") {
    return "high";
  }
  return new Set(["minimal", "low", "medium", "high"]).has(effort) ? effort : "";
}

function normalizeWireApi(value) {
  const wireApi = String(value || "responses").toLowerCase();
  return new Set(["chat", "chat_completions", "chat.completions"]).has(wireApi) ? "chat" : "responses";
}

function emptyUsage() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0
  };
}

function hashValue(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function clampInteger(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return minimum;
  }
  return Math.max(minimum, Math.min(maximum, Math.trunc(number)));
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function agentClientError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = {
  TELEMETRY_SCHEMA_VERSION,
  loadModelConfig,
  resolveModelSecretConfigPath,
  requestJsonCompletion,
  requestStructuredCompletion
};
