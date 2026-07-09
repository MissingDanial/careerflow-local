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
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-events-smoke-"));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const server = spawn(process.execPath, ["server/src/server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      BOSS_DATA_DIR: dataDir,
      BOSS_SKIP_LEGACY_IMPORT: "1",
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const output = [];
  server.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
  server.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));

  try {
    await waitForHealth(port);
    const payload = createPayload();
    const sync = await requestJson(port, "POST", "/api/jobs/sync", payload);
    const eventsResponse = await requestJson(port, "GET", "/api/events?limit=10");
    const qualityResponse = await requestJson(port, "GET", "/api/quality?limit=1");

    const popupHtml = read("extension/src/popup.html");
    const popupJs = read("extension/src/popup.js");
    const optionsHtml = read("extension/src/options.html");
    const optionsJs = read("extension/src/options.js");
    const backgroundJs = read("extension/src/background.js");
    const serverJs = read("server/src/server.js");
    const css = read("extension/src/options.css");

    const eventTypes = new Set((eventsResponse.events || []).map((event) => event.eventType));
    const checks = {
      syncAcceptedOneJob: sync.received === 1,
      eventsEndpointReturnsList: Array.isArray(eventsResponse.events) && eventsResponse.events.length >= 3,
      includesLoginRequired: eventTypes.has("LOGIN_REQUIRED"),
      includesCaptchaRequired: eventTypes.has("CAPTCHA_REQUIRED"),
      includesSelectorChanged: eventTypes.has("SELECTOR_CHANGED"),
      qualityStillAvailable: qualityResponse.latest?.loginRequiredPages === 1 && qualityResponse.latest?.captchaRequiredPages === 1,
      serverExposesEventsEndpoint: serverJs.includes('url.pathname === "/api/events"'),
      backgroundHandlesEventsMessage: backgroundJs.includes('case "GET_EVENTS"') && backgroundJs.includes("/api/events?limit="),
      popupHasEventIds: ["recentEventCount", "recentEvents"].every((id) => popupHtml.includes(`id="${id}"`)),
      popupRequestsEvents: popupJs.includes('type: "GET_EVENTS"') && popupJs.includes("renderBrowserEvents"),
      optionsHasEventIds: ["recentEventCount", "recentEvents"].every((id) => optionsHtml.includes(`id="${id}"`)),
      optionsRequestsEvents: optionsJs.includes('type: "GET_EVENTS"') && optionsJs.includes("renderEvents"),
      cssHasEventList: css.includes(".list") && css.includes(".list-item")
    };

    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      sync,
      eventTypes: Array.from(eventTypes),
      latestEvents: eventsResponse.events.slice(0, 3)
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    server.kill();
    await waitForExit(server);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

function createPayload() {
  return {
    source: "m3-events-smoke",
    exportedAt: new Date().toISOString(),
    stats: {
      jobCount: 1,
      pageCount: 2
    },
    pages: {
      jobs: {
        url: "https://www.zhipin.com/web/geek/jobs?query=agent&city=101300100",
        title: "BOSS jobs",
        visibleJobCount: 1,
        validJobCount: 1,
        loginRequired: false,
        captchaRequired: false,
        selectorCounts: {
          jobDetailLinks: 1
        },
        diagnostics: {
          selectorCounts: {
            jobDetailLinks: 1
          }
        }
      },
      blocked: {
        url: "https://www.zhipin.com/web/user/security",
        title: "BOSS security",
        visibleJobCount: 0,
        validJobCount: 0,
        loginRequired: true,
        captchaRequired: true,
        selectorCounts: {
          jobDetailLinks: 0
        },
        diagnostics: {
          loginRequired: true,
          captchaRequired: true,
          selectorCounts: {
            jobDetailLinks: 0
          }
        }
      }
    },
    jobs: [
      {
        title: "AI Product Manager",
        company: "Gamma",
        salary: "15-25K",
        location: "Nanning",
        detailUrl: "https://www.zhipin.com/job_detail/m3-event-one.html",
        description: "Own product requirements, agent workflows, and delivery quality. ".repeat(3)
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
