#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");
const { findBrowserExecutable } = require("../server/src/browser-executor/local-playwright-adapter");
const { ARTIFACT_DIR, ROOT } = require("./m14-options-workspace-ui-smoke");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    throw new Error("No local Chrome/Edge executable was found for M17 popup UI smoke.");
  }
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push(`console: ${message.text()}`);
    }
  });
  page.on("dialog", (dialog) => dialog.accept());
  try {
    await installPopupChromeMock(page);
    await page.goto(pathToFileURL(path.join(ROOT, "extension", "src", "popup.html")).toString(), {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(() => document.querySelector("#backendStateText")?.textContent === "本地后端运行中"
      && document.querySelector("#missingDescriptionCount")?.textContent === "2");
    const initial = await inspectPopup(page);

    await page.locator("#clearMissingDescriptions").click();
    await page.waitForFunction(() => document.querySelector("#missingDescriptionCount")?.textContent === "0"
      && document.querySelector("#clearMissingDescriptions")?.disabled
      && document.querySelector("#status")?.textContent.includes("已移出 2 个待补 JD 岗位"));
    const afterClear = await inspectPopup(page);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "m17-popup-missing-jd-cleared.png"),
      fullPage: true
    });

    const calls = await page.evaluate(() => window.__m17PopupSmoke.calls);
    const checks = {
      popupLoadsActiveQueueAndRuntime: initial.backendRunning
        && initial.activeQueue.includes("产品")
        && initial.missingCount === "2",
      missingJdCleanupUpdatesRenderedState: afterClear.missingCount === "0"
        && afterClear.clearDisabled
        && afterClear.status.includes("已移出 2 个待补 JD 岗位"),
      cleanupUsesActiveQueueContract: calls.some((call) => call.type === "REMOVE_MISSING_DESCRIPTION_ITEMS"
        && call.queueId === 1
        && call.options?.minDescriptionLength === 80
        && call.options?.reason === "popup_bulk_remove_missing_jd"),
      popupHasNoHorizontalOverflow: initial.noDocumentOverflow && afterClear.noDocumentOverflow,
      renderedInteractionHasNoRuntimeErrors: runtimeErrors.length === 0,
      cleanupTriggersNoBossAction: !calls.some((call) => new Set([
        "CREATE_BROWSER_TASK",
        "CLAIM_BROWSER_TASK",
        "TRANSITION_BROWSER_TASK",
        "ARM_REAL_ACTION_AUTHORIZATION",
        "QUEUE_REAL_ACTION_AUTHORIZATION",
        "SEND_GREETING_REAL"
      ]).has(call.type))
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      initial,
      afterClear,
      runtimeErrors,
      messageTypes: calls.map((call) => call.type),
      screenshot: path.join(ARTIFACT_DIR, "m17-popup-missing-jd-cleared.png")
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    await browser.close();
  }
}

async function installPopupChromeMock(page) {
  await page.addInitScript(() => {
    const calls = [];
    let missingCount = 2;
    let settings = {
      backendUrl: "http://127.0.0.1:8787",
      syncPath: "/api/jobs/sync",
      token: "",
      autoSync: true,
      crawlDelayMs: 1600,
      crawlMaxJobs: 30,
      activeApplicationQueueId: 1
    };

    function resultFor(message = {}) {
      calls.push(structuredClone(message));
      switch (message.type) {
        case "GET_SETTINGS":
          return structuredClone(settings);
        case "SAVE_SETTINGS":
          settings = { ...settings, ...(message.settings || {}) };
          return structuredClone(settings);
        case "GET_BACKEND_STATUS":
          return {
            running: true,
            nativeHostAvailable: true,
            modelConfig: { configured: true, model: "popup-smoke-model" }
          };
        case "GET_APPLICATION_QUEUES":
          return {
            response: {
              queues: [{
                id: 1,
                name: "产品",
                isDefault: true,
                completeApplicationCount: 5,
                missingDescriptionCount: missingCount
              }]
            }
          };
        case "GET_CACHE":
          return {
            jobs: [{
              title: "AI 产品经理",
              company: "Example",
              description: "完整职位描述".repeat(50),
              detailUrl: "https://www.zhipin.com/job_detail/popup-smoke.html"
            }],
            pages: { "boss-list": {} },
            stats: {}
          };
        case "GET_QUALITY":
          return {
            report: {
              latest: {
                receivedJobs: 7,
                validJobs: 7,
                describedJobs: 5,
                descriptionCoverage: 5 / 7,
                requiredFieldCoverage: 1,
                invalidJobs: 0
              }
            }
          };
        case "GET_EVENTS":
          return { events: [] };
        case "GET_BROWSER_TASK_DIAGNOSTICS":
          return { diagnostics: { counts: { queued: 0, running: 0, succeeded: 5, failed: 0 }, failuresByReason: [] } };
        case "GET_MISSING_DESCRIPTIONS":
          return {
            jobs: missingCount > 0
              ? [
                  { title: "待补岗位 A", company: "A Co", descriptionLength: 0 },
                  { title: "待补岗位 B", company: "B Co", descriptionLength: 20 }
                ]
              : [],
            totalMissingDescriptions: missingCount
          };
        case "REMOVE_MISSING_DESCRIPTION_ITEMS": {
          const removed = missingCount;
          missingCount = 0;
          return { response: { ok: true, queueId: Number(message.queueId), removed } };
        }
        case "REMEMBER_BOSS_PAGE":
          return { ok: true };
        default:
          return {};
      }
    }

    window.__m17PopupSmoke = { calls };
    globalThis.chrome = {
      runtime: {
        sendMessage: async (message) => ({ ok: true, result: resultFor(message) }),
        openOptionsPage: async () => {},
        getURL: (relativePath) => `chrome-extension://popup-smoke/${relativePath}`
      },
      tabs: {
        query: async () => [{ id: 7, url: "https://www.zhipin.com/web/geek/job" }],
        sendMessage: async (_tabId, message) => ({
          ok: true,
          result: message.type === "WATCH_STATUS"
            ? { watching: true, autoCrawl: { running: false, status: "idle" } }
            : { running: false, status: "idle" }
        }),
        create: async ({ url }) => ({ id: 8, url })
      }
    };
  });
}

function inspectPopup(page) {
  return page.evaluate(() => ({
    backendRunning: document.querySelector("#backendStateText")?.textContent === "本地后端运行中",
    activeQueue: document.querySelector("#activeApplicationQueue")?.selectedOptions[0]?.textContent || "",
    missingCount: document.querySelector("#missingDescriptionCount")?.textContent || "",
    clearDisabled: Boolean(document.querySelector("#clearMissingDescriptions")?.disabled),
    status: document.querySelector("#status")?.textContent || "",
    noDocumentOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
    viewport: { width: window.innerWidth, height: window.innerHeight }
  }));
}
