#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");
const { findBrowserExecutable } = require("../server/src/browser-executor/local-playwright-adapter");
const { ARTIFACT_DIR, ROOT, installChromeMock } = require("./m14-options-workspace-ui-smoke");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    throw new Error("No local Chrome/Edge executable was found for M16.1 Shadow review UI smoke.");
  }
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  try {
    await installChromeMock(page);
    await page.goto(pathToFileURL(path.join(ROOT, "extension", "src", "options.html")).toString(), {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("诊断已刷新"));
    await page.locator("#settingsTab").click();
    await page.locator("#advancedDiagnostics > summary").click();
    await page.waitForFunction(() => document.querySelector("#agentShadowRunBadge")?.textContent === "已完成");
    const desktop = await inspectShadowPanel(page);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "m16-1-shadow-review-desktop.png"),
      fullPage: true
    });

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await inspectShadowPanel(page);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "m16-1-shadow-review-mobile.png"),
      fullPage: true
    });
    const calls = await page.evaluate(() => window.__bossFindWorkspaceSmoke.calls);
    const checks = {
      shadowPanelIsRetainedButHiddenFromUsers: desktop.settingsVisible
        && desktop.advancedOpen
        && desktop.panelRetained
        && !desktop.panelVisible,
      defaultBudgetIsVisible: desktop.budget.includes("20 岗位") && desktop.budget.includes("上限 30"),
      persistedRunMetricsStillLoad: desktop.progress === "3/3"
        && desktop.samples === "7"
        && desktop.tokens.includes("4")
        && desktop.failures === "0",
      rankingAndReviewSelectorRender: desktop.itemCount === 3 && desktop.reviewOptionCount === 3,
      hiddenCompatibilityPanelDoesNotMutateData: !calls.some((call) => new Set([
        "START_AGENT_SHADOW_RUN",
        "REVIEW_AGENT_SHADOW_ITEM"
      ]).has(call.type)),
      desktopHasNoOverflow: desktop.noDocumentOverflow && desktop.controlsInsideViewport && desktop.textFits,
      mobileHasNoOverflow: mobile.noDocumentOverflow && mobile.controlsInsideViewport && mobile.textFits,
      noBossActionTriggered: !calls.some((call) => new Set([
        "CREATE_BROWSER_TASK",
        "CLAIM_BROWSER_TASK",
        "ARM_REAL_ACTION_AUTHORIZATION",
        "QUEUE_REAL_ACTION_AUTHORIZATION",
        "SEND_GREETING_REAL"
      ]).has(call.type))
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      desktop,
      mobile,
      screenshots: [
        path.join(ARTIFACT_DIR, "m16-1-shadow-review-desktop.png"),
        path.join(ARTIFACT_DIR, "m16-1-shadow-review-mobile.png")
      ]
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    await browser.close();
  }
}

function inspectShadowPanel(page) {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const panel = document.querySelector("#agentShadowPanel")?.getBoundingClientRect();
    const form = document.querySelector("#agentShadowReviewForm")?.getBoundingClientRect();
    const start = document.querySelector("#startAgentShadowRun")?.getBoundingClientRect();
    const inside = (rect) => !rect || (rect.left >= -1 && rect.right <= viewportWidth + 1);
    const controls = Array.from(document.querySelectorAll("#agentShadowPanel button, #agentShadowPanel select, #agentShadowPanel input"))
      .filter((control) => control.getClientRects().length > 0);
    return {
      settingsVisible: !document.querySelector("#settingsPanel")?.hidden,
      advancedOpen: Boolean(document.querySelector("#advancedDiagnostics")?.open),
      panelRetained: Boolean(document.querySelector("#retainedCompatibilityPanels")?.contains(document.querySelector("#agentShadowPanel"))),
      panelVisible: Boolean(panel && panel.width > 0 && panel.height > 0),
      budget: document.querySelector("#startAgentShadowRun")?.nextElementSibling?.textContent || "",
      progress: document.querySelector("#agentShadowProgress")?.textContent || "",
      samples: document.querySelector("#agentShadowSamples")?.textContent || "",
      tokens: document.querySelector("#agentShadowTokens")?.textContent || "",
      failures: document.querySelector("#agentShadowFailures")?.textContent || "",
      itemCount: document.querySelectorAll("#agentShadowItems .list-item").length,
      reviewOptionCount: document.querySelectorAll("#agentShadowReviewItem option").length,
      listText: document.querySelector("#agentShadowItems")?.textContent || "",
      noDocumentOverflow: document.documentElement.scrollWidth <= viewportWidth + 1,
      controlsInsideViewport: inside(panel) && inside(form) && inside(start),
      textFits: controls.every((control) => control.scrollWidth <= control.clientWidth + 1 && control.scrollHeight <= control.clientHeight + 1),
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };
  });
}
