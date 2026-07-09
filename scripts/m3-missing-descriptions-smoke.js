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
  const storeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-missing-store-"));
  const apiDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-missing-api-"));
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
    const sync = store.syncJobs(createPayload());
    const stats = store.getStats();
    const missing = store.getMissingDescriptions({ limit: 10 });
    const titles = missing.jobs.map((job) => job.title);
    const checks = {
      storeAcceptsPayload: sync.received === 3,
      statsCountMissingDescriptions: stats.missingDescriptionCount === 2,
      returnsMissingOnly: missing.totalMissingDescriptions === 2 && missing.jobs.length === 2,
      excludesLongDescription: !titles.includes("Complete JD"),
      prioritizesEmptyDescription: titles[0] === "No JD",
      exposesDetailUrl: missing.jobs.every((job) => job.detailUrl.includes("/job_detail/"))
    };
    return {
      checks,
      summary: {
        sync,
        missingCount: missing.totalMissingDescriptions,
        titles,
        statsMissingDescriptionCount: stats.missingDescriptionCount
      }
    };
  } finally {
    store.close();
  }
}

async function runApiChecks(dataDir) {
  const port = 19000 + Math.floor(Math.random() * 1000);
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
    const missing = await requestJson(port, "GET", "/api/jobs/missing-descriptions?limit=1");
    const checks = {
      apiReturnsMissingEndpoint: missing.totalMissingDescriptions === 2,
      apiHonorsLimit: missing.jobs.length === 1,
      apiReturnsQueueShape: Boolean(missing.jobs[0]?.title && missing.jobs[0]?.detailUrl)
    };
    return {
      checks,
      summary: {
        totalMissingDescriptions: missing.totalMissingDescriptions,
        firstJob: missing.jobs[0] || null
      }
    };
  } finally {
    server.kill();
    await waitForExit(server);
  }
}

function runWiringChecks() {
  const popupHtml = read("extension/src/popup.html");
  const popupJs = read("extension/src/popup.js");
  const optionsHtml = read("extension/src/options.html");
  const optionsJs = read("extension/src/options.js");
  const backgroundJs = read("extension/src/background.js");
  const serverJs = read("server/src/server.js");
  const css = read("extension/src/options.css");
  return {
    checks: {
      serverExposesMissingEndpoint: serverJs.includes('url.pathname === "/api/jobs/missing-descriptions"'),
      backgroundHandlesMissingMessage: backgroundJs.includes('case "GET_MISSING_DESCRIPTIONS"') && backgroundJs.includes("/api/jobs/missing-descriptions?limit="),
      popupHasMissingIds: ["missingDescriptionCount", "missingDescriptions"].every((id) => popupHtml.includes(`id="${id}"`)),
      popupRequestsMissingDescriptions: popupJs.includes('type: "GET_MISSING_DESCRIPTIONS"') && popupJs.includes("renderMissingDescriptions"),
      optionsHasMissingIds: ["missingDescriptionCount", "missingDescriptions"].every((id) => optionsHtml.includes(`id="${id}"`)),
      optionsRequestsMissingDescriptions: optionsJs.includes('type: "GET_MISSING_DESCRIPTIONS"') && optionsJs.includes("renderMissingDescriptions"),
      cssHasMissingList: css.includes(".list") && css.includes(".list-item")
    }
  };
}

function createPayload() {
  return {
    source: "m3-missing-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        title: "No JD",
        company: "Alpha",
        salary: "10-20K",
        location: "Nanning",
        detailUrl: "https://www.zhipin.com/job_detail/missing-one.html"
      },
      {
        title: "Short JD",
        company: "Beta",
        salary: "12-18K",
        location: "Nanning",
        detailUrl: "https://www.zhipin.com/job_detail/missing-two.html",
        description: "Short"
      },
      {
        title: "Complete JD",
        company: "Gamma",
        salary: "20-30K",
        location: "Nanning",
        detailUrl: "https://www.zhipin.com/job_detail/missing-three.html",
        description: "Complete description with responsibilities and requirements. ".repeat(4)
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
