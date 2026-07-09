const fs = require("fs");
const path = require("path");

const DEFAULT_CONFIG_PATH = path.join(__dirname, "..", "..", "gpt5.5.txt");
const DEFAULT_TIMEOUT_MS = 45000;

function loadModelConfig(options = {}) {
  const configPath = options.configPath || process.env.BOSS_MODEL_CONFIG_PATH || DEFAULT_CONFIG_PATH;
  const fileConfig = readLooseModelConfig(configPath);
  const apiKey = process.env.OPENAI_API_KEY
    || process.env.BOSS_OPENAI_API_KEY
    || fileConfig.apiKey
    || "";
  const baseUrl = process.env.OPENAI_BASE_URL
    || process.env.BOSS_OPENAI_BASE_URL
    || fileConfig.baseUrl
    || "https://api.openai.com";
  const model = process.env.OPENAI_MODEL
    || process.env.BOSS_OPENAI_MODEL
    || fileConfig.model
    || "";
  const wireApi = process.env.OPENAI_WIRE_API
    || process.env.BOSS_OPENAI_WIRE_API
    || fileConfig.wireApi
    || "responses";
  const reasoningEffort = process.env.OPENAI_REASONING_EFFORT
    || process.env.BOSS_OPENAI_REASONING_EFFORT
    || fileConfig.reasoningEffort
    || "";

  return {
    configured: Boolean(apiKey && baseUrl && model),
    apiKey,
    baseUrl,
    model,
    wireApi,
    reasoningEffort,
    timeoutMs: Number(options.timeoutMs || process.env.BOSS_MODEL_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    source: fileConfig.source || "env"
  };
}

async function requestJsonCompletion({ system, user, config }) {
  const effectiveConfig = config || loadModelConfig();
  if (!effectiveConfig.configured) {
    throw agentClientError("LLM_CONFIG_INVALID", "OpenAI-compatible model config is not available");
  }

  const wireApi = String(effectiveConfig.wireApi || "responses").toLowerCase();
  if (wireApi === "chat" || wireApi === "chat_completions" || wireApi === "chat.completions") {
    return requestChatCompletion({ system, user, config: effectiveConfig });
  }
  return requestResponsesCompletion({ system, user, config: effectiveConfig });
}

async function requestResponsesCompletion({ system, user, config }) {
  const endpoint = resolveEndpoint(config.baseUrl, "/responses");
  const body = {
    model: config.model,
    input: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    text: {
      format: { type: "json_object" }
    }
  };
  const effort = normalizeReasoningEffort(config.reasoningEffort);
  if (effort) {
    body.reasoning = { effort };
  }

  const parsed = await postJson(endpoint, body, config);
  const text = extractOutputText(parsed);
  return parseJsonFromModelText(text);
}

async function requestChatCompletion({ system, user, config }) {
  const endpoint = resolveEndpoint(config.baseUrl, "/chat/completions");
  const body = {
    model: config.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    response_format: { type: "json_object" }
  };
  const parsed = await postJson(endpoint, body, config);
  const text = parsed?.choices?.[0]?.message?.content || "";
  return parseJsonFromModelText(text);
}

async function postJson(endpoint, body, config) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(config.timeoutMs) || DEFAULT_TIMEOUT_MS));
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      throw agentClientError("LLM_REQUEST_FAILED", `Model request failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    try {
      return JSON.parse(text || "{}");
    } catch {
      throw agentClientError("LLM_REQUEST_FAILED", "Model returned non-JSON transport response");
    }
  } catch (error) {
    if (error.name === "AbortError") {
      throw agentClientError("LLM_REQUEST_FAILED", "Model request timed out");
    }
    if (error.code) {
      throw error;
    }
    throw agentClientError("LLM_REQUEST_FAILED", error.message || String(error));
  } finally {
    clearTimeout(timeout);
  }
}

function resolveEndpoint(baseUrl, suffix) {
  const normalized = String(baseUrl || "").replace(/\/+$/, "");
  if (/\/v\d+$/i.test(normalized)) {
    return `${normalized}${suffix}`;
  }
  return `${normalized}/v1${suffix}`;
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
  const candidate = fenced ? fenced[1].trim() : raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    throw agentClientError("AGENT_OUTPUT_SCHEMA_INVALID", "Model returned invalid JSON");
  }
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
    apiKey: matchJsonString(text, "OPENAI_API_KEY") || matchAssignment(text, "OPENAI_API_KEY")
  };
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

function agentClientError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = {
  loadModelConfig,
  requestJsonCompletion
};
