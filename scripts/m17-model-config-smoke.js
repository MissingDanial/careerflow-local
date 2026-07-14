#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { loadModelConfig } = require("../server/src/model-client");
const { createModelConfigService } = require("../server/src/services/model-config-service");

const ROOT = path.resolve(__dirname, "..");
const TOKEN = "m17-model-config-smoke-token";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const direct = await runDirectChecks();
  const api = await runApiChecks();
  const source = runSourceChecks();
  const checks = { ...direct.checks, ...api.checks, ...source };
  console.log(JSON.stringify({
    ok: Object.values(checks).every(Boolean),
    checks,
    summary: {
      direct: direct.summary,
      api: api.summary
    }
  }, null, 2));
  process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
}

async function runDirectChecks() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m17-model-direct-"));
  const configPath = path.join(dataDir, "model-provider.local.json");
  const isolatedLoader = (options = {}) => loadModelConfig({
    ...options,
    configPath: path.join(dataDir, "missing-provider.txt"),
    localConfigPath: path.join(dataDir, "missing-overlay.json")
  });
  let probedApiKey = "";
  const service = createModelConfigService({
    configPath,
    configLoader: isolatedLoader,
    requestRunner: async ({ config }) => {
      probedApiKey = config.apiKey;
      return {
        data: { ok: true, message: "connected" },
        telemetry: {
          provider: "fixture",
          model: config.model,
          wireApi: config.wireApi,
          durationMs: 12,
          attemptCount: 1,
          usage: { totalTokens: 3 }
        }
      };
    }
  });
  try {
    const initial = service.getStatus();
    const saved = service.save({
      apiKey: "fixture-local-model-secret-value",
      baseUrl: "https://model.example.test/v1/",
      model: "fixture-model",
      wireApi: "chat",
      reasoningEffort: "medium",
      timeoutMs: 30000,
      maxRetries: 2
    });
    const storedAfterSave = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const updated = service.save({
      apiKey: "",
      baseUrl: "https://model.example.test/v1",
      model: "fixture-model-v2",
      wireApi: "responses"
    });
    const storedAfterBlank = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const probe = await service.testConnection();
    const invalidUrlCode = captureErrorCode(() => service.save({
      baseUrl: "file:///tmp/model",
      model: "invalid"
    }));
    const cleared = service.save({
      clearApiKey: true,
      baseUrl: "https://model.example.test/v1",
      model: "fixture-model-v2"
    });
    const storedAfterClear = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return {
      checks: {
        startsUnconfiguredWithoutExternalSecrets: initial.config.configured === false
          && initial.config.hasApiKey === false,
        savesBackendOwnedSecretFile: storedAfterSave.apiKey === "fixture-local-model-secret-value"
          && storedAfterSave.baseUrl === "https://model.example.test/v1",
        publicStatusNeverReturnsApiKey: saved.config.hasApiKey === true
          && !Object.prototype.hasOwnProperty.call(saved.config, "apiKey")
          && !JSON.stringify(saved).includes("fixture-local-model-secret-value"),
        blankApiKeyPreservesExistingSecret: storedAfterBlank.apiKey === "fixture-local-model-secret-value"
          && updated.config.model === "fixture-model-v2",
        testUsesSavedConfigAndSanitizesTelemetry: probedApiKey === "fixture-local-model-secret-value"
          && probe.probe.ok === true
          && probe.telemetry.usage.totalTokens === 3
          && !JSON.stringify(probe).includes("fixture-local-model-secret-value"),
        invalidBaseUrlIsRejected: invalidUrlCode === "LLM_BASE_URL_INVALID",
        apiKeyRequiresExplicitClear: cleared.config.hasApiKey === false
          && storedAfterClear.apiKey === ""
      },
      summary: {
        configFile: path.basename(configPath),
        configuredAfterSave: saved.config.configured,
        modelAfterUpdate: updated.config.model,
        configuredAfterClear: cleared.config.configured
      }
    };
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function runApiChecks() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m17-model-api-"));
  const port = await findFreePort();
  const isolatedProviderPath = path.join(dataDir, "missing-provider.txt");
  const isolatedOverlayPath = path.join(dataDir, "missing-overlay.json");
  const server = spawn(process.execPath, ["server/src/server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      BOSS_DATA_DIR: dataDir,
      BOSS_SKIP_LEGACY_IMPORT: "1",
      BOSS_SYNC_TOKEN: TOKEN,
      BOSS_MODEL_CONFIG_PATH: isolatedProviderPath,
      BOSS_MODEL_LOCAL_CONFIG_PATH: isolatedOverlayPath,
      OPENAI_API_KEY: "",
      BOSS_OPENAI_API_KEY: ""
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk.toString(); });
  server.stderr.on("data", (chunk) => { output += chunk.toString(); });
  try {
    await waitForHealth(port, server, () => output);
    const initial = await requestJson(port, "GET", "/api/model-config");
    const unauthorized = await requestRaw(port, "PUT", "/api/model-config", {
      baseUrl: "https://api.example.test",
      model: "blocked-model"
    });
    const saved = await requestJson(port, "PUT", "/api/model-config", {
      apiKey: "api-route-secret-value",
      baseUrl: "https://api.example.test/v1",
      model: "api-model",
      wireApi: "chat",
      maxRetries: 2
    }, TOKEN);
    const loaded = await requestJson(port, "GET", "/api/model-config");
    const stored = JSON.parse(fs.readFileSync(path.join(dataDir, "model-provider.local.json"), "utf8"));
    return {
      checks: {
        apiStartsWithSanitizedStatus: initial.config.hasApiKey === false
          && !Object.prototype.hasOwnProperty.call(initial.config, "apiKey"),
        apiWriteRequiresBackendToken: unauthorized.status === 401,
        apiSaveReturnsNoSecret: saved.config.configured === true
          && saved.config.hasApiKey === true
          && !JSON.stringify(saved).includes("api-route-secret-value"),
        apiGetLoadsSavedConfigImmediately: loaded.config.model === "api-model"
          && loaded.config.wireApi === "chat"
          && loaded.config.hasApiKey === true,
        apiPersistsOnlyInIgnoredDataDir: stored.apiKey === "api-route-secret-value"
          && stored.model === "api-model"
      },
      summary: {
        unauthorizedStatus: unauthorized.status,
        configured: loaded.config.configured,
        model: loaded.config.model
      }
    };
  } finally {
    server.kill();
    await waitForExit(server);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

function runSourceChecks() {
  const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(ROOT, "extension/src/background.js"), "utf8");
  const serverSource = fs.readFileSync(path.join(ROOT, "server/src/server.js"), "utf8");
  const settingsStart = backgroundSource.indexOf("const DEFAULT_SETTINGS");
  const settingsEnd = backgroundSource.indexOf("};", settingsStart);
  const settingsBlock = backgroundSource.slice(settingsStart, settingsEnd);
  return {
    localModelSecretDirectoryIsIgnored: gitignore.includes("server/data/**"),
    serverExposesSanitizedModelConfigContract: serverSource.includes("/api/model-config")
      && serverSource.includes("modelConfigService.getStatus()"),
    extensionDoesNotPersistModelApiKey: !settingsBlock.includes("modelApiKey")
  };
}

function captureErrorCode(callback) {
  try {
    callback();
    return "";
  } catch (error) {
    return error.code || "";
  }
}

async function requestJson(port, method, pathname, body = null, token = "") {
  const result = await requestRaw(port, method, pathname, body, token);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`${method} ${pathname} failed: ${result.status} ${JSON.stringify(result.payload)}`);
  }
  return result.payload;
}

async function requestRaw(port, method, pathname, body = null, token = "") {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return {
    status: response.status,
    payload: await response.json()
  };
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForHealth(port, child, readOutput) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before health check: ${readOutput()}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the server binds its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for server health: ${readOutput()}`);
}

async function waitForExit(child) {
  if (child.exitCode !== null) {
    return;
  }
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 2000);
  });
}
