#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createJobStore } = require("../server/src/sqlite-store");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const storeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-keys-store-"));
  const apiDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-keys-api-"));
  try {
    const storeResult = runStoreChecks(storeDataDir);
    const apiResult = await runApiChecks(apiDataDir);
    const wiring = runWiringChecks();
    const checks = {
      ...storeResult.checks,
      ...apiResult.checks,
      ...wiring.checks
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      storeResult: storeResult.summary,
      apiResult: apiResult.summary
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    fs.rmSync(storeDataDir, { recursive: true, force: true });
    fs.rmSync(apiDataDir, { recursive: true, force: true });
  }
}

function runStoreChecks(dataDir) {
  const store = createJobStore({ dataDir });
  try {
    store.syncJobs(createPayload());
    const describedKeys = store.getJobKeys({ describedOnly: true, minDescriptionLength: 50 });
    const allKeys = store.getJobKeys({ describedOnly: false });
    const checks = {
      storeReturnsDescribedOnly: describedKeys.totalJobs === 1,
      storeReturnsAllWhenRequested: allKeys.totalJobs === 2,
      storeIncludesJobIdKey: describedKeys.keys.includes("key-complete"),
      storeIncludesDetailUrlKey: describedKeys.keys.includes("https://www.zhipin.com/job_detail/key-complete.html"),
      storeExcludesMissingDescription: !describedKeys.keys.includes("key-missing")
    };
    return {
      checks,
      summary: {
        describedTotalJobs: describedKeys.totalJobs,
        describedKeyCount: describedKeys.keyCount,
        allTotalJobs: allKeys.totalJobs
      }
    };
  } finally {
    store.close();
  }
}

async function runApiChecks(dataDir) {
  const port = 20000 + Math.floor(Math.random() * 1000);
  const server = spawn(process.execPath, ["server/src/server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      BOSS_DATA_DIR: dataDir,
      BOSS_SKIP_LEGACY_IMPORT: "1",
      PORT: String(port)
    },
    stdio: ["ignore", "ignore", "ignore"]
  });

  try {
    await waitForHealth(port);
    await requestJson(port, "POST", "/api/jobs/sync", createPayload());
    const describedKeys = await requestJson(port, "GET", "/api/jobs/keys?described=1&minDescriptionLength=50");
    const allKeys = await requestJson(port, "GET", "/api/jobs/keys?described=0");
    const checks = {
      apiReturnsKeysEndpoint: describedKeys.totalJobs === 1 && Array.isArray(describedKeys.keys),
      apiHonorsDescribedFilter: allKeys.totalJobs === 2 && describedKeys.totalJobs === 1,
      apiReturnsDedupKeys: new Set(describedKeys.keys).size === describedKeys.keys.length,
      apiIncludesUsefulKeyShape: describedKeys.keys.some((key) => key.includes("/job_detail/key-complete"))
    };
    return {
      checks,
      summary: {
        describedTotalJobs: describedKeys.totalJobs,
        describedKeyCount: describedKeys.keyCount,
        allTotalJobs: allKeys.totalJobs
      }
    };
  } finally {
    server.kill();
    await waitForExit(server);
  }
}

function runWiringChecks() {
  const serverJs = read("server/src/server.js");
  const storeJs = read("server/src/sqlite-store.js");
  const backgroundJs = read("extension/src/background.js");
  const popupJs = read("extension/src/popup.js");
  const packageJson = read("package.json");
  return {
    checks: {
      serverExposesJobKeysEndpoint: serverJs.includes('url.pathname === "/api/jobs/keys"'),
      storeExposesGetJobKeys: storeJs.includes("getJobKeys(options = {})") && storeJs.includes("rowToJobKeys"),
      backgroundHandlesJobKeys: backgroundJs.includes('case "GET_JOB_KEYS"') && backgroundJs.includes("/api/jobs/keys?described="),
      popupFetchesBackendKeys: popupJs.includes("getBackendDescribedJobKeys") && popupJs.includes('type: "GET_JOB_KEYS"'),
      popupMergesLocalAndBackendKeys: popupJs.includes("mergeUniqueStrings(getDescribedJobKeys(cache), backendKeys)"),
      packageRunsThisSmoke: packageJson.includes("m3-job-keys-smoke.js")
    }
  };
}

function createPayload() {
  return {
    source: "m3-job-keys-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId: "key-complete",
        title: "Complete JD",
        company: "Alpha",
        salary: "20-30K",
        location: "Nanning",
        detailUrl: "https://www.zhipin.com/job_detail/key-complete.html",
        description: "Complete description with responsibilities and requirements. ".repeat(4)
      },
      {
        jobId: "key-missing",
        title: "Missing JD",
        company: "Beta",
        salary: "10-15K",
        location: "Nanning",
        detailUrl: "https://www.zhipin.com/job_detail/key-missing.html"
      }
    ]
  };
}

function requestJson(port, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : "";
    const request = http.request({
      host: "127.0.0.1",
      port,
      method,
      path: pathname,
      headers: data ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      } : {}
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = null;
        try {
          parsed = JSON.parse(text || "{}");
        } catch {
          parsed = { raw: text };
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(parsed.error || `HTTP ${response.statusCode}`));
          return;
        }
        resolve(parsed);
      });
    });
    request.on("error", reject);
    if (data) {
      request.write(data);
    }
    request.end();
  });
}

async function waitForHealth(port) {
  const deadline = Date.now() + 8000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await requestJson(port, "GET", "/health");
      return;
    } catch (error) {
      lastError = error;
      await sleep(150);
    }
  }
  throw lastError || new Error("Timed out waiting for server");
}

function waitForExit(processHandle) {
  return new Promise((resolve) => {
    processHandle.once("exit", resolve);
    setTimeout(resolve, 1500);
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
