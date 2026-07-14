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
    throw new Error("No local Chrome/Edge executable was found for M17 queue UI smoke.");
  }
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push(`console: ${message.text()}`);
    }
  });
  page.on("dialog", (dialog) => dialog.accept());
  try {
    await installChromeMock(page);
    await page.goto(pathToFileURL(path.join(ROOT, "extension", "src", "options.html")).toString(), {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("诊断已刷新"));

    const initial = await inspectM17Layout(page);
    await page.locator("#workspaceQueueSelect").selectOption("2");
    await page.waitForFunction(() => document.querySelector("#workspaceApplicationCount")?.textContent === "2");
    const algorithm = await inspectM17Layout(page);

    await page.locator("#openCreateQueueDialog").click();
    await page.locator("#createQueueName").fill("AI 应用");
    await page.locator("#createQueueDescription").fill("Agent 和大模型应用岗位");
    await page.locator("#confirmCreateQueue").click();
    await page.waitForFunction(() => document.querySelector("#workspaceQueueSelect")?.selectedOptions[0]?.textContent.includes("AI 应用"));
    const created = await inspectM17Layout(page);

    await page.locator("#deleteApplicationQueue").click();
    await page.waitForFunction(() => document.querySelectorAll("#workspaceQueueSelect option").length === 2
      && document.querySelector("#workspaceQueueSelect")?.selectedOptions[0]?.textContent.includes("产品"));
    const afterArchive = await inspectM17Layout(page);

    const stageStates = {};
    for (const [stage, title] of [
      ["collected", "完整 JD 岗位"],
      ["screened", "岗位筛选结果"],
      ["resume", "定制简历结果"],
      ["manual", "人工联系与投递"]
    ]) {
      await page.locator(`[data-workbench-stage="${stage}"]`).click();
      await page.waitForFunction(([expectedStage, expectedTitle]) => (
        document.querySelector(".pipeline-stat.is-active")?.dataset.workbenchStage === expectedStage
          && document.querySelector("#workspaceListTitle")?.textContent === expectedTitle
      ), [stage, title]);
      stageStates[stage] = await inspectM17Layout(page);
    }

    await page.locator('[data-workbench-stage="screened"]').click();
    await page.locator('tr[data-application-id="5"]').getByRole("button", { name: "信任", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("已信任并重新评估")
      && !Array.from(document.querySelectorAll('tr[data-application-id="5"] button')).some((button) => button.textContent === "信任"));
    const afterTrust = await inspectM17Layout(page);

    await page.locator('[data-workbench-stage="manual"]').click();
    await page.locator('tr[data-application-id="3"] .manual-status-select').selectOption("GREETED");
    await page.waitForFunction(() => document.querySelector('tr[data-application-id="3"] .manual-status-select')?.value === "GREETED"
      && document.querySelector("#status")?.textContent.includes("人工状态已更新"));
    const afterManualStatus = await inspectM17Layout(page);

    await page.locator('[data-workbench-stage="collected"]').click();
    await page.waitForFunction(() => document.querySelector("#workspaceApplications")?.children.length === 6);
    const checkboxes = page.locator("#workspaceApplications .application-select");
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();
    await page.locator("#removeSelectedApplications").click();
    await page.waitForFunction(() => document.querySelector("#workspaceSelectionCount")?.textContent === "已选 0"
      && document.querySelector("#workspaceApplicationCount")?.textContent === "4");
    const afterBulkRemove = await inspectM17Layout(page);

    await page.locator("#workspaceQueueSelect").selectOption("2");
    await page.waitForFunction(() => document.querySelector("#missingDescriptionCount")?.textContent === "1");
    await page.locator("#settingsTab").click();
    await page.locator("#advancedDiagnostics > summary").click();
    await page.evaluate(() => document.querySelector("#removeMissingDescriptions")?.click());
    await page.waitForFunction(() => document.querySelector("#missingDescriptionCount")?.textContent === "0");

    await page.locator("#modelBaseUrl").fill("https://model.example.test/v1");
    await page.locator("#modelName").fill("careerflow-model");
    await page.locator("#modelWireApi").selectOption("chat");
    await page.locator("#modelApiKey").fill("ui-model-secret");
    await page.locator("#saveModelConfig").click();
    await page.waitForFunction(() => document.querySelector("#modelConfigBadge")?.textContent === "已配置");
    await page.locator("#testModelConfig").click();
    await page.waitForFunction(() => document.querySelector("#modelConfigStatus")?.textContent.includes("连接成功"));
    const settingsDesktop = await inspectM17Layout(page);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "m17-queues-model-desktop.png"),
      fullPage: true
    });

    await page.locator("#workspaceTab").click();
    await page.setViewportSize({ width: 390, height: 844 });
    const workspaceMobile = await inspectM17Layout(page);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "m17-queues-workspace-mobile.png"),
      fullPage: true
    });
    await page.locator("#settingsTab").click();
    const settingsMobile = await inspectM17Layout(page);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "m17-queues-settings-mobile.png"),
      fullPage: true
    });

    const calls = await page.evaluate(() => window.__bossFindWorkspaceSmoke.calls);
    const saveSettingsCalls = calls.filter((call) => call.type === "SAVE_SETTINGS");
    const checks = {
      initialQueueIsScopedAndNamed: initial.queueOptions === 2
        && initial.activeQueue.includes("产品")
        && initial.summaryTotal === "6",
      switchingQueueScopesRowsAndCounters: algorithm.activeQueue.includes("算法")
        && algorithm.rows === 2
        && algorithm.summaryTotal === "2",
      creatingQueueSelectsEmptyScope: created.queueOptions === 3
        && created.activeQueue.includes("AI 应用")
        && created.rows === 0,
      queueArchivePreservesHistoryAndReturnsToDefault: afterArchive.queueOptions === 2
        && afterArchive.activeQueue.includes("产品")
        && afterArchive.rows === 6
        && calls.some((call) => call.type === "ARCHIVE_APPLICATION_QUEUE" && call.queueId === 3),
      fourStagesFilterExpectedRows: stageStates.collected.activeStage === "collected"
        && stageStates.collected.stageTitle === "完整 JD 岗位"
        && stageStates.collected.rows === 6
        && stageStates.screened.activeStage === "screened"
        && stageStates.screened.stageTitle === "岗位筛选结果"
        && stageStates.screened.rows === 5
        && stageStates.resume.activeStage === "resume"
        && stageStates.resume.stageTitle === "定制简历结果"
        && stageStates.resume.rows === 3
        && stageStates.manual.activeStage === "manual"
        && stageStates.manual.stageTitle === "人工联系与投递"
        && stageStates.manual.rows === 3,
      trustedFilteredJobIsRescreened: afterTrust.activeStage === "screened"
        && calls.some((call) => call.type === "TRUST_APPLICATION_QUEUE_ITEM"
          && call.queueId === 1
          && call.applicationId === 5)
        && calls.some((call) => call.type === "SCREEN_APPLICATION_BATCH"
          && call.options?.queueId === 1
          && call.options?.applicationIds?.includes(5)),
      manualStatusIsRecordedWithoutBossAction: afterManualStatus.activeStage === "manual"
        && calls.some((call) => call.type === "UPDATE_MANUAL_APPLICATION_STATUS"
          && call.applicationId === 3
          && call.options?.manualStatus === "GREETED"),
      multiSelectBulkRemoveIsScoped: afterBulkRemove.summaryTotal === "4"
        && afterBulkRemove.rows === 4
        && calls.some((call) => call.type === "REMOVE_APPLICATION_QUEUE_ITEMS"
          && call.queueId === 1
          && call.options?.applicationIds?.length === 2),
      missingJdCanBeRemovedInOneAction: calls.some((call) => (
        call.type === "REMOVE_MISSING_DESCRIPTION_ITEMS" && call.queueId === 2
      )),
      modelConfigSavesAndTestsThroughBackend: calls.some((call) => (
        call.type === "SAVE_MODEL_CONFIG"
        && call.config?.model === "careerflow-model"
        && call.config?.apiKey === "ui-model-secret"
      )) && calls.some((call) => call.type === "TEST_MODEL_CONFIG"),
      modelApiKeyNeverEntersExtensionSettings: !saveSettingsCalls.some((call) => (
        Object.prototype.hasOwnProperty.call(call.settings || {}, "modelApiKey")
      )),
      desktopHasNoOverflow: settingsDesktop.noDocumentOverflow
        && settingsDesktop.controlsInsideViewport
        && settingsDesktop.textFits,
      mobileWorkspaceHasNoOverflow: workspaceMobile.noDocumentOverflow
        && workspaceMobile.controlsInsideViewport
        && workspaceMobile.textFits,
      mobileSettingsHasNoOverflow: settingsMobile.noDocumentOverflow
        && settingsMobile.controlsInsideViewport
        && settingsMobile.textFits,
      renderedInteractionsHaveNoRuntimeErrors: runtimeErrors.length === 0,
      queueManagementTriggersNoBossAction: !calls.some((call) => new Set([
        "CREATE_BROWSER_TASK",
        "ARM_REAL_ACTION_AUTHORIZATION",
        "QUEUE_REAL_ACTION_AUTHORIZATION",
        "SEND_GREETING_REAL"
      ]).has(call.type))
    };
    console.log(JSON.stringify({
      ok: Object.values(checks).every(Boolean),
      checks,
      initial,
      algorithm,
      created,
      afterArchive,
      stageStates,
      afterTrust,
      afterManualStatus,
      afterBulkRemove,
      settingsDesktop,
      workspaceMobile,
      settingsMobile,
      screenshots: [
        path.join(ARTIFACT_DIR, "m17-queues-model-desktop.png"),
        path.join(ARTIFACT_DIR, "m17-queues-workspace-mobile.png"),
        path.join(ARTIFACT_DIR, "m17-queues-settings-mobile.png")
      ],
      messageTypes: calls.map((call) => call.type),
      runtimeErrors
    }, null, 2));
    process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
  } finally {
    await browser.close();
  }
}

function inspectM17Layout(page) {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const visibleControls = Array.from(document.querySelectorAll("button, input, select")).filter((control) => {
      const rect = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
    return {
      activeView: document.querySelector(".view-tab[aria-selected='true']")?.dataset.viewTarget || "",
      activeStage: document.querySelector(".pipeline-stat.is-active")?.dataset.workbenchStage || "",
      stageTitle: document.querySelector("#workspaceListTitle")?.textContent || "",
      visibleStageControl: document.querySelector("[data-stage-control]:not([hidden])")?.dataset.stageControl || "",
      queueOptions: document.querySelectorAll("#workspaceQueueSelect option").length,
      activeQueue: document.querySelector("#workspaceQueueSelect")?.selectedOptions[0]?.textContent || "",
      rows: document.querySelectorAll("#workspaceApplications tr").length,
      summaryTotal: document.querySelector("#workspaceApplicationCount")?.textContent || "",
      selectedCount: document.querySelector("#workspaceSelectionCount")?.textContent || "",
      noDocumentOverflow: document.documentElement.scrollWidth <= viewportWidth + 1,
      controlsInsideViewport: visibleControls.every((control) => {
        const rect = control.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= viewportWidth + 1;
      }),
      textFits: visibleControls.every((control) => (
        control.scrollWidth <= control.clientWidth + 1 && control.scrollHeight <= control.clientHeight + 1
      )),
      overflowingControls: visibleControls
        .filter((control) => (
          control.scrollWidth > control.clientWidth + 1 || control.scrollHeight > control.clientHeight + 1
        ))
        .map((control) => ({
          id: control.id,
          tagName: control.tagName,
          text: control.value || control.textContent?.trim() || control.getAttribute("aria-label") || "",
          scrollWidth: control.scrollWidth,
          clientWidth: control.clientWidth,
          scrollHeight: control.scrollHeight,
          clientHeight: control.clientHeight
        })),
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };
  });
}
