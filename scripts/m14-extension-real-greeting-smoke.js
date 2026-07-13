#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { findBrowserExecutable } = require("../server/src/browser-executor/local-playwright-adapter");
const {
  hashGreetingMessage,
  hashTargetJob,
  hashTargetPage
} = require("../server/src/services/real-action-authorization-service");

const ROOT = path.join(__dirname, "..");
const TARGET_URL = "https://www.zhipin.com/job_detail/m14-fixture.html";
const MESSAGE_TEXT = "您好，我的 AI 产品与 Agent 工作流经历和这个岗位匹配，期待进一步沟通。";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    throw new Error("No local Chrome/Edge executable was found for M14 extension smoke.");
  }
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const confirmed = await runDomScenario(browser, "confirmed");
    const uncertain = await runDomScenario(browser, "uncertain");
    const mismatch = await runDomScenario(browser, "message_hash_mismatch");
    const staticChecks = inspectStaticContracts();
    const checks = {
      fixtureNeverUsesRealNetwork: confirmed.onlyInterceptedFixture
        && uncertain.onlyInterceptedFixture
        && mismatch.onlyInterceptedFixture,
      confirmedClicksExactlyOnce: confirmed.clickCount === 1
        && confirmed.result.ok === true
        && confirmed.result.realAction.outcome === "CONFIRMED",
      confirmedRequiresPreflightAndReadback: confirmed.result.realAction.preflightValidated === true
        && confirmed.result.realAction.postSendReadback === true
        && confirmed.result.realAction.observedMessageHash === confirmed.result.realAction.messageHash,
      uncertainNeverRetriesClick: uncertain.clickCount === 1
        && uncertain.result.ok === false
        && uncertain.result.errorCode === "REAL_ACTION_OUTCOME_UNCERTAIN"
        && uncertain.result.realAction.clickedSend === true
        && uncertain.result.realAction.clickCount === 1
        && uncertain.result.realAction.postSendReadback === false,
      hashMismatchStopsBeforeClick: mismatch.clickCount === 0
        && mismatch.result.ok === false
        && mismatch.result.errorCode === "REAL_ACTION_PREFLIGHT_HASH_MISMATCH"
        && mismatch.result.realAction.clickedSend === false,
      optionsExposeExplicitThreeStepControl: staticChecks.optionsExposeExplicitThreeStepControl,
      backgroundUsesDedicatedAuthorizationApis: staticChecks.backgroundUsesDedicatedAuthorizationApis,
      contentHasSeparateRealTaskPath: staticChecks.contentHasSeparateRealTaskPath,
      noBackgroundAutomaticRealSend: staticChecks.noBackgroundAutomaticRealSend
    };
    console.log(JSON.stringify({
      ok: Object.values(checks).every(Boolean),
      checks,
      confirmed,
      uncertain,
      mismatch,
      staticChecks
    }, null, 2));
    process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
  } finally {
    await browser.close();
  }
}

async function runDomScenario(browser, scenario) {
  const context = await browser.newContext();
  const requestedUrls = [];
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    requestedUrls.push(url);
    if (url === TARGET_URL) {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: fixtureHtml(scenario)
      });
      return;
    }
    await route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      window.__bossFindMessageListener = null;
      window.chrome = {
        runtime: {
          onMessage: {
            addListener(listener) {
              window.__bossFindMessageListener = listener;
            }
          }
        }
      };
      window.__runBossFindContentMessage = (message) => new Promise((resolve, reject) => {
        if (typeof window.__bossFindMessageListener !== "function") {
          reject(new Error("Boss Find content listener is not registered"));
          return;
        }
        window.__bossFindMessageListener(message, {}, (response) => {
          if (!response?.ok) {
            reject(new Error(response?.error || "Content message failed"));
            return;
          }
          resolve(response.result);
        });
      });
    });
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ path: path.join(ROOT, "extension", "src", "content.js") });
    await page.waitForFunction(() => typeof window.__bossFindMessageListener === "function");
    const target = {
      jobId: "m14-fixture",
      title: "AI Product Manager",
      company: "M14 Fixture Co",
      detailUrl: TARGET_URL
    };
    const task = {
      id: 1401,
      applicationId: 1401,
      taskType: "SEND_GREETING_REAL",
      payload: {
        authorizationId: 1401,
        actionType: "SEND_GREETING_REAL",
        messageId: 1401,
        messageText: MESSAGE_TEXT,
        messageHash: scenario === "message_hash_mismatch"
          ? "0".repeat(64)
          : hashGreetingMessage(MESSAGE_TEXT),
        targetJobHash: hashTargetJob(target),
        targetPageHash: hashTargetPage(target),
        jobId: target.jobId,
        title: target.title,
        company: target.company,
        detailUrl: target.detailUrl,
        sourceUrl: target.detailUrl,
        authorizationExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        requiresExplicitAuthorization: true,
        actionMode: "real_canary",
        maxClickCount: 1,
        noAutomaticRetry: true
      }
    };
    const result = await page.evaluate((input) => window.__runBossFindContentMessage({
      type: "RUN_BROWSER_TASK",
      task: input
    }), task);
    const clickCount = await page.evaluate(() => Number(window.__fixtureSendClickCount || 0));
    return {
      scenario,
      result,
      clickCount,
      requestedUrls,
      onlyInterceptedFixture: requestedUrls.length === 1 && requestedUrls[0] === TARGET_URL
    };
  } finally {
    await context.close();
  }
}

function fixtureHtml(scenario) {
  const appendReadback = scenario === "confirmed";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>AI Product Manager - M14 Fixture Co</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; }
    .job-detail { padding: 20px; }
    .chat-panel { position: fixed; left: 20px; right: 20px; bottom: 20px; padding: 16px; border: 1px solid #ccc; background: #fff; }
    .chat-input { display: flex; gap: 8px; }
    textarea { width: 620px; height: 72px; }
    button { width: 88px; height: 44px; }
    .message-bubble { width: fit-content; max-width: 620px; margin: 8px 0; padding: 8px; background: #e8f4ff; }
  </style>
</head>
<body>
  <main class="job-detail">
    <h1>AI Product Manager</h1>
    <div class="company-name">M14 Fixture Co</div>
    <p>负责 AI 产品设计、用户研究与 Agent 工作流迭代。</p>
  </main>
  <section class="chat-panel">
    <div id="messages" class="message-list">消息</div>
    <div class="chat-input">
      <textarea aria-label="输入消息" placeholder="输入消息"></textarea>
      <button class="send-button" type="button">发送</button>
    </div>
  </section>
  <script>
    window.__fixtureSendClickCount = 0;
    document.querySelector('.send-button').addEventListener('click', () => {
      window.__fixtureSendClickCount += 1;
      const input = document.querySelector('textarea');
      const text = input.value;
      input.value = '';
      ${appendReadback ? `
      const bubble = document.createElement('div');
      bubble.className = 'message-bubble';
      bubble.dataset.bossFindMessage = 'outbound';
      bubble.textContent = text;
      document.querySelector('#messages').appendChild(bubble);` : ""}
    });
  </script>
</body>
</html>`;
}

function inspectStaticContracts() {
  const optionsHtml = read("extension/src/options.html");
  const optionsJs = read("extension/src/options.js");
  const backgroundJs = read("extension/src/background.js");
  const contentJs = read("extension/src/content.js");
  return {
    optionsExposeExplicitThreeStepControl: optionsHtml.includes('id="realGreetingEnabled"')
      && optionsHtml.includes('id="armRealGreeting"')
      && optionsHtml.includes('id="runRealGreetingOnce"')
      && optionsJs.includes("realActionAuthorizationToken")
      && optionsJs.includes("令牌只保留在当前页面内存中"),
    backgroundUsesDedicatedAuthorizationApis: backgroundJs.includes("/api/real-actions/policy")
      && backgroundJs.includes("/api/real-actions/authorizations")
      && backgroundJs.includes("QUEUE_REAL_ACTION_AUTHORIZATION"),
    contentHasSeparateRealTaskPath: contentJs.includes('taskType === "SEND_GREETING_REAL"')
      && contentJs.includes("runSendGreetingRealTask")
      && contentJs.includes("REAL_ACTION_OUTCOME_UNCERTAIN")
      && contentJs.includes("waitForGreetingDomReadback"),
    noBackgroundAutomaticRealSend: !backgroundJs.includes('taskTypes: ["SEND_GREETING_REAL"]')
      && !backgroundJs.includes("setInterval(runAuthorizedRealGreetingOnce")
  };
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
