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
    throw new Error("No local Chrome/Edge executable was found for M16 Agent quality UI smoke.");
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
    await page.waitForFunction(() => document.querySelector("#agentQualityGate")?.textContent === "通过");
    const desktop = await inspectSettings(page);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "m16-agent-quality-desktop.png"),
      fullPage: true
    });

    await page.locator("#workspaceTab").click();
    await page.locator('[data-workbench-stage="resume"]').click();
    await page.waitForFunction(() => document.querySelector("#agentExecutionMode")?.getBoundingClientRect().width > 0);
    const resumeStage = await inspectSettings(page);
    await page.locator("#agentExecutionMode").selectOption("auto");
    await page.waitForFunction(() => window.__bossFindWorkspaceSmoke.calls.some((call) => call.type === "SAVE_SETTINGS"));
    const savedMode = await page.locator("#agentExecutionMode").inputValue();

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await inspectSettings(page);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "m16-agent-quality-mobile.png"),
      fullPage: true
    });
    const calls = await page.evaluate(() => window.__bossFindWorkspaceSmoke.calls);
    const checks = {
      advancedQualityPanelStaysHiddenFromSettings: desktop.settingsVisible && !desktop.qualityVisible,
      executionModeLivesInResumeStage: resumeStage.workspaceVisible
        && resumeStage.activeStage === "resume"
        && resumeStage.modeVisible,
      hybridModeLoadsFromSettings: resumeStage.mode === "hybrid",
      qualityMetricsRender: desktop.invocations === "12"
        && desktop.tokens.includes("3")
        && desktop.latency === "1450 ms"
        && desktop.gate === "通过",
      modeSelectionPersists: savedMode === "auto"
        && calls.some((call) => call.type === "SAVE_SETTINGS" && call.settings?.agentExecutionMode === "auto"),
      qualityApiIsUsed: calls.some((call) => call.type === "GET_AGENT_QUALITY"),
      desktopHasNoOverflow: desktop.noDocumentOverflow && desktop.controlsInsideViewport,
      mobileHasNoOverflow: mobile.noDocumentOverflow && mobile.controlsInsideViewport,
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
      resumeStage,
      mobile,
      savedMode,
      screenshots: [
        path.join(ARTIFACT_DIR, "m16-agent-quality-desktop.png"),
        path.join(ARTIFACT_DIR, "m16-agent-quality-mobile.png")
      ]
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    await browser.close();
  }
}
function inspectSettings(page) {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const quality = document.querySelector(".agent-quality-settings")?.getBoundingClientRect();
    const mode = document.querySelector("#agentExecutionMode")?.getBoundingClientRect();
    const refresh = document.querySelector("#refreshAgentQuality")?.getBoundingClientRect();
    const inside = (rect) => !rect || (rect.left >= -1 && rect.right <= viewportWidth + 1);
    return {
      settingsVisible: !document.querySelector("#settingsPanel")?.hidden,
      workspaceVisible: !document.querySelector("#workspacePanel")?.hidden,
      activeStage: document.querySelector(".pipeline-stat.is-active")?.dataset.workbenchStage || "",
      qualityVisible: Boolean(quality && quality.width > 0 && quality.height > 0),
      modeVisible: Boolean(mode && mode.width > 0 && mode.height > 0),
      mode: document.querySelector("#agentExecutionMode")?.value || "",
      invocations: document.querySelector("#agentQualityInvocations")?.textContent || "",
      tokens: document.querySelector("#agentQualityTokens")?.textContent || "",
      latency: document.querySelector("#agentQualityLatency")?.textContent || "",
      gate: document.querySelector("#agentQualityGate")?.textContent || "",
      noDocumentOverflow: document.documentElement.scrollWidth <= viewportWidth + 1,
      controlsInsideViewport: inside(quality) && inside(mode) && inside(refresh),
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };
  });
}
