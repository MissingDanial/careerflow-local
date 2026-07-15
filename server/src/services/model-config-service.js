"use strict";

const fs = require("fs");
const path = require("path");
const { z } = require("zod");
const {
  loadModelConfig,
  requestStructuredCompletion,
  resolveModelSecretConfigPath
} = require("../model-client");
const { normalizeModelRoutes } = require("../agent-runtime-policy");

const MODEL_PROBE_SCHEMA = z.object({
  ok: z.literal(true),
  message: z.string().max(200).optional()
}).strict();

class ModelConfigService {
  constructor(options = {}) {
    this.configPath = path.resolve(options.configPath || resolveModelSecretConfigPath({
      dataDir: options.dataDir
    }));
    this.configLoader = options.configLoader || loadModelConfig;
    this.requestRunner = options.requestRunner || requestStructuredCompletion;
  }

  getStatus() {
    const config = this.configLoader({ secretConfigPath: this.configPath });
    return {
      ok: true,
      storage: "local_file",
      config: publicModelConfig(config),
      configFileExists: fs.existsSync(this.configPath)
    };
  }

  save(input = {}) {
    const existing = this.readStoredConfig();
    const effective = this.configLoader({ secretConfigPath: this.configPath });
    const apiKeyInput = Object.prototype.hasOwnProperty.call(input, "apiKey")
      ? cleanSecret(input.apiKey)
      : "";
    const next = {
      apiKey: input.clearApiKey === true
        ? ""
        : apiKeyInput || cleanSecret(existing.apiKey),
      baseUrl: validateBaseUrl(firstText(input.baseUrl, existing.baseUrl, effective.baseUrl)),
      model: requiredText(firstText(input.model, existing.model, effective.model), "Model is required"),
      wireApi: normalizeWireApi(firstText(input.wireApi, existing.wireApi, effective.wireApi)),
      reasoningEffort: normalizeReasoningEffort(firstText(
        input.reasoningEffort,
        existing.reasoningEffort,
        effective.reasoningEffort
      )),
      timeoutMs: clampInteger(
        firstDefined(input.timeoutMs, existing.timeoutMs, effective.timeoutMs),
        1000,
        300000,
        45000
      ),
      maxRetries: clampInteger(
        firstDefined(input.maxRetries, existing.maxRetries, effective.maxRetries),
        0,
        3,
        1
      ),
      inputCostPerMillion: nonNegativeNumber(firstDefined(
        input.inputCostPerMillion,
        existing.inputCostPerMillion,
        effective.inputCostPerMillion
      )),
      outputCostPerMillion: nonNegativeNumber(firstDefined(
        input.outputCostPerMillion,
        existing.outputCostPerMillion,
        effective.outputCostPerMillion
      )),
      modelRoutes: normalizeModelRoutes(firstDefined(
        input.modelRoutes,
        existing.modelRoutes,
        effective.modelRoutes
      ) || {})
    };
    this.writeStoredConfig(next);
    return this.getStatus();
  }

  async testConnection() {
    const config = this.configLoader({ secretConfigPath: this.configPath });
    if (!config.configured) {
      throw modelConfigError(422, "LLM_CONFIG_INVALID", "Complete API Key, base URL and model before testing");
    }
    const completion = await this.requestRunner({
      system: "You are a connectivity probe. Return only a JSON object matching the requested schema.",
      user: "Return {\"ok\":true,\"message\":\"connected\"}.",
      config,
      schema: MODEL_PROBE_SCHEMA,
      schemaName: "model_connectivity_probe"
    });
    return {
      ok: true,
      storage: "local_file",
      config: publicModelConfig(config),
      probe: completion.data,
      telemetry: publicTelemetry(completion.telemetry)
    };
  }

  readStoredConfig() {
    if (!fs.existsSync(this.configPath)) {
      return {};
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      throw modelConfigError(
        422,
        "LLM_CONFIG_INVALID",
        "Local model provider config is not valid JSON"
      );
    }
  }

  writeStoredConfig(config) {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    const temporaryPath = `${this.configPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600
      });
      fs.renameSync(temporaryPath, this.configPath);
    } finally {
      fs.rmSync(temporaryPath, { force: true });
    }
  }
}

function createModelConfigService(options = {}) {
  return new ModelConfigService(options);
}

function publicModelConfig(config = {}) {
  return {
    configured: Boolean(config.configured),
    hasApiKey: Boolean(config.apiKey),
    baseUrl: cleanText(config.baseUrl),
    model: cleanText(config.model),
    wireApi: normalizeWireApi(config.wireApi),
    reasoningEffort: normalizeReasoningEffort(config.reasoningEffort),
    timeoutMs: Number(config.timeoutMs || 0),
    maxRetries: Number(config.maxRetries || 0),
    inputCostPerMillion: nonNegativeNumber(config.inputCostPerMillion),
    outputCostPerMillion: nonNegativeNumber(config.outputCostPerMillion),
    modelRoutes: normalizeModelRoutes(config.modelRoutes || {}),
    source: cleanText(config.source)
  };
}

function publicTelemetry(telemetry = {}) {
  return {
    provider: cleanText(telemetry.provider),
    model: cleanText(telemetry.model),
    wireApi: cleanText(telemetry.wireApi),
    durationMs: Number(telemetry.durationMs || 0),
    attemptCount: Number(telemetry.attemptCount || 0),
    usage: telemetry.usage && typeof telemetry.usage === "object" ? telemetry.usage : {}
  };
}

function validateBaseUrl(value) {
  const text = requiredText(value, "Base URL is required").replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw modelConfigError(422, "LLM_BASE_URL_INVALID", "Base URL must be a valid HTTP(S) URL");
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw modelConfigError(422, "LLM_BASE_URL_INVALID", "Base URL must use HTTP or HTTPS");
  }
  return text;
}

function normalizeWireApi(value) {
  const wireApi = cleanText(value || "responses").toLowerCase();
  return new Set(["chat", "chat_completions", "chat.completions"]).has(wireApi)
    ? "chat"
    : "responses";
}

function normalizeReasoningEffort(value) {
  const effort = cleanText(value).toLowerCase();
  return new Set(["minimal", "low", "medium", "high"]).has(effort) ? effort : "";
}

function requiredText(value, message) {
  const text = cleanText(value);
  if (!text) {
    throw modelConfigError(422, "LLM_CONFIG_INVALID", message);
  }
  return text;
}

function firstText(...values) {
  return values.map(cleanText).find(Boolean) || "";
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanSecret(value) {
  return String(value || "").trim().slice(0, 4096);
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(min, Math.min(max, Math.trunc(number)))
    : fallback;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function modelConfigError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

module.exports = {
  ModelConfigService,
  createModelConfigService,
  publicModelConfig
};
