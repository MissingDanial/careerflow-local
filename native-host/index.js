#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const MAX_MESSAGE_BYTES = 1024 * 1024;
const ALLOWED_COMMANDS = new Set(["STATUS", "START_BACKEND"]);

let inputBuffer = Buffer.alloc(0);
let messageQueue = Promise.resolve();

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  consumeMessages();
});

process.stdin.on("error", (error) => {
  sendError("NATIVE_HOST_INPUT_FAILED", error.message);
});

function consumeMessages() {
  while (inputBuffer.length >= 4) {
    const length = inputBuffer.readUInt32LE(0);
    if (length <= 0 || length > MAX_MESSAGE_BYTES) {
      inputBuffer = Buffer.alloc(0);
      sendError("NATIVE_HOST_MESSAGE_INVALID", "Native message length is invalid");
      return;
    }
    if (inputBuffer.length < 4 + length) {
      return;
    }
    const payload = inputBuffer.subarray(4, 4 + length);
    inputBuffer = inputBuffer.subarray(4 + length);
    messageQueue = messageQueue
      .then(() => handlePayload(payload))
      .catch((error) => sendError(error.code || "NATIVE_HOST_FAILED", error.message || String(error)));
  }
}

async function handlePayload(payload) {
  let message;
  try {
    message = JSON.parse(payload.toString("utf8"));
  } catch {
    throw nativeHostError("NATIVE_HOST_MESSAGE_INVALID", "Native message must be valid JSON");
  }
  const command = String(message?.command || message?.type || "").trim().toUpperCase();
  if (!ALLOWED_COMMANDS.has(command)) {
    throw nativeHostError("NATIVE_HOST_COMMAND_DENIED", `Unsupported native host command: ${command || "missing"}`);
  }
  const config = readHostConfig();
  if (command === "STATUS") {
    send(await getRuntimeStatus(config));
    return;
  }
  send(await startBackend(config));
}

async function startBackend(config) {
  const current = await getRuntimeStatus(config);
  if (current.running) {
    return {
      ...current,
      ok: true,
      started: false,
      alreadyRunning: true,
      token: config.token
    };
  }

  fs.mkdirSync(config.logDir, { recursive: true });
  fs.mkdirSync(config.dataDir, { recursive: true });
  const stdoutFd = fs.openSync(path.join(config.logDir, "backend-native.out.log"), "a");
  const stderrFd = fs.openSync(path.join(config.logDir, "backend-native.err.log"), "a");
  let child;
  try {
    child = spawn(config.nodePath, [config.backendEntry], {
      cwd: config.projectRoot,
      detached: true,
      windowsHide: true,
      stdio: ["ignore", stdoutFd, stderrFd],
      env: {
        ...process.env,
        HOST: config.host,
        PORT: String(config.port),
        BOSS_DATA_DIR: config.dataDir,
        BOSS_SYNC_TOKEN: config.token
      }
    });
    child.unref();
  } finally {
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
  }

  const deadline = Date.now() + config.startTimeoutMs;
  while (Date.now() < deadline) {
    const status = await getRuntimeStatus(config);
    if (status.running) {
      return {
        ...status,
        ok: true,
        started: true,
        alreadyRunning: false,
        pid: child.pid,
        token: config.token
      };
    }
    await delay(150);
  }
  throw nativeHostError(
    "BACKEND_START_TIMEOUT",
    `Backend did not become healthy within ${config.startTimeoutMs} ms`
  );
}

async function getRuntimeStatus(config) {
  const backendUrl = `http://${config.host}:${config.port}`;
  const health = await requestJson(`${backendUrl}/health`, config.token, 800);
  if (!health.ok || health.payload?.ok !== true) {
    return {
      ok: true,
      running: false,
      backendUrl,
      modelConfig: null
    };
  }
  const model = await requestJson(`${backendUrl}/api/model-config`, config.token, 1200);
  return {
    ok: true,
    running: true,
    backendUrl,
    service: health.payload.service || "boss-find-backend",
    modelConfig: model.ok ? model.payload?.config || null : null
  };
}

function readHostConfig() {
  const configPath = path.resolve(
    process.env.CAREERFLOW_NATIVE_CONFIG_PATH
      || path.join(path.dirname(process.execPath), "host-config.json")
  );
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    throw nativeHostError(
      "NATIVE_HOST_CONFIG_INVALID",
      "Native Host is not installed correctly; run npm run native:install"
    );
  }
  const projectRoot = path.resolve(String(parsed.projectRoot || ""));
  const nodePath = path.resolve(String(parsed.nodePath || ""));
  const backendEntry = path.resolve(projectRoot, String(parsed.backendEntry || "server/src/server.js"));
  const dataDir = path.resolve(projectRoot, String(parsed.dataDir || "server/data"));
  const logDir = path.resolve(projectRoot, String(parsed.logDir || "server/data/logs"));
  if (!fs.existsSync(projectRoot) || !fs.existsSync(nodePath) || !fs.existsSync(backendEntry)) {
    throw nativeHostError("NATIVE_HOST_CONFIG_INVALID", "Native Host project or Node path no longer exists");
  }
  for (const candidate of [backendEntry, dataDir, logDir]) {
    if (!isPathInside(projectRoot, candidate)) {
      throw nativeHostError("NATIVE_HOST_CONFIG_INVALID", "Native Host paths must remain inside the project");
    }
  }
  const host = String(parsed.host || "127.0.0.1").trim().toLowerCase();
  if (!new Set(["127.0.0.1", "localhost"]).has(host)) {
    throw nativeHostError("NATIVE_HOST_CONFIG_INVALID", "Native Host backend must bind to loopback");
  }
  const port = clampInteger(parsed.port, 1, 65535, 8787);
  return {
    projectRoot,
    nodePath,
    backendEntry,
    dataDir,
    logDir,
    host,
    port,
    token: String(parsed.token || "").trim(),
    startTimeoutMs: clampInteger(parsed.startTimeoutMs, 1000, 30000, 12000)
  };
}

function requestJson(url, token, timeoutMs) {
  return new Promise((resolve) => {
    const request = http.get(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      timeout: timeoutMs
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, payload });
        } catch {
          resolve({ ok: false, payload: null });
        }
      });
    });
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve({ ok: false, payload: null }));
  });
}

function send(value) {
  const payload = Buffer.from(JSON.stringify(value), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  process.stdout.write(Buffer.concat([header, payload]));
}

function sendError(code, message) {
  send({ ok: false, errorCode: code, error: String(message || "Native Host failed") });
}

function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(min, Math.min(max, Math.trunc(number)))
    : fallback;
}

function nativeHostError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
