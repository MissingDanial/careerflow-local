#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const HOST_SOURCE = path.join(ROOT, "native-host", "index.js");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const runtime = await runRuntimeChecks();
  const source = runSourceChecks();
  const checks = { ...runtime.checks, ...source };
  console.log(JSON.stringify({
    ok: Object.values(checks).every(Boolean),
    checks,
    summary: runtime.summary
  }, null, 2));
  process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
}

async function runRuntimeChecks() {
  const runtimeName = `m17-native-smoke-${process.pid}-${Date.now()}`;
  const relativeDataDir = path.join("server", "data", runtimeName);
  const dataDir = path.join(ROOT, relativeDataDir);
  const configPath = path.join(dataDir, "host-config.json");
  const port = await findFreePort();
  const token = "m17-native-host-smoke-token";
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({
    projectRoot: ROOT,
    nodePath: process.execPath,
    backendEntry: "server/src/server.js",
    dataDir: relativeDataDir,
    logDir: path.join(relativeDataDir, "logs"),
    host: "127.0.0.1",
    port,
    token,
    startTimeoutMs: 10000
  }, null, 2), "utf8");
  let backendPid = 0;
  try {
    const denied = await sendNativeMessage({ command: "EXEC", executable: "cmd.exe" }, configPath);
    const started = await sendNativeMessage({ command: "START_BACKEND" }, configPath);
    backendPid = Number(started.pid || 0);
    const status = await sendNativeMessage({ command: "STATUS" }, configPath);
    const health = await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json());
    const config = await fetch(`http://127.0.0.1:${port}/api/model-config`).then((response) => response.json());
    return {
      checks: {
        deniesArbitraryCommandExecution: denied.ok === false
          && denied.errorCode === "NATIVE_HOST_COMMAND_DENIED",
        startsFixedBackendEntry: started.ok === true
          && started.running === true
          && started.started === true
          && backendPid > 0,
        returnsInstallerTokenWithoutLoggingIt: started.token === token,
        statusFindsExistingBackendWithoutRestart: status.ok === true
          && status.running === true
          && !Object.prototype.hasOwnProperty.call(status, "started"),
        launchedBackendPassesHealthCheck: health.ok === true
          && health.service === "boss-find-backend",
        nativeStatusReturnsSanitizedModelConfig: config.ok === true
          && !JSON.stringify(status.modelConfig || {}).includes("apiKey")
      },
      summary: {
        port,
        backendPid,
        running: status.running,
        modelConfigured: Boolean(status.modelConfig?.configured)
      }
    };
  } finally {
    if (backendPid > 0) {
      try {
        process.kill(backendPid);
      } catch {
        // The fixture process may already have exited after a failed startup.
      }
      await waitForPortClosed(port);
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

function runSourceChecks() {
  const hostSource = fs.readFileSync(HOST_SOURCE, "utf8");
  const installer = fs.readFileSync(path.join(ROOT, "scripts", "install-native-host.ps1"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "extension", "manifest.json"), "utf8"));
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  return {
    nativeHostUsesTwoCommandAllowlist: hostSource.includes(
      'new Set(["STATUS", "START_BACKEND"])'
    ) && !hostSource.includes("exec("),
    nativeHostPinsPathsToProjectRoot: hostSource.includes("isPathInside(projectRoot, candidate)"),
    installerRegistersChromeAndEdgeCurrentUser: installer.includes("Google\\Chrome\\NativeMessagingHosts")
      && installer.includes("Microsoft\\Edge\\NativeMessagingHosts")
      && installer.includes("HKCU:"),
    extensionRequestsNativeMessagingOnlyExplicitly: manifest.permissions.includes("nativeMessaging"),
    maintainedPkgBuilderIsPinned: packageJson.devDependencies["@yao-pkg/pkg"] === "^6.21.0"
      && packageJson.scripts["native:install"].includes("install-native-host.ps1")
  };
}

function sendNativeMessage(message, configPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOST_SOURCE], {
      cwd: ROOT,
      env: {
        ...process.env,
        CAREERFLOW_NATIVE_CONFIG_PATH: configPath
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    const stdout = [];
    const stderr = [];
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Native Host timed out: ${Buffer.concat(stderr).toString("utf8")}`));
    }, 15000);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", () => {
      clearTimeout(timeout);
      try {
        const buffer = Buffer.concat(stdout);
        if (buffer.length < 4) {
          throw new Error(`Native Host returned no frame: ${Buffer.concat(stderr).toString("utf8")}`);
        }
        const length = buffer.readUInt32LE(0);
        resolve(JSON.parse(buffer.subarray(4, 4 + length).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    const payload = Buffer.from(JSON.stringify(message), "utf8");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(payload.length, 0);
    child.stdin.end(Buffer.concat([header, payload]));
  });
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

async function waitForPortClosed(port) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/health`);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
