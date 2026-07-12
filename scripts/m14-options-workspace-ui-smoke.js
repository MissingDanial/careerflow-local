#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");
const { findBrowserExecutable } = require("../server/src/browser-executor/local-playwright-adapter");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = path.join(ROOT, "server", "data", "ui-smoke");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    throw new Error("No local Chrome/Edge executable was found for workspace UI smoke.");
  }
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await installChromeMock(page);
    const optionsUrl = pathToFileURL(path.join(ROOT, "extension", "src", "options.html")).toString();
    await page.goto(optionsUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("诊断已刷新"));

    const defaultVisibleButtons = await page.locator("button:visible").count();
    const defaultState = await page.evaluate(inspectWorkspaceLayout);
    const actionLabels = {};
    for (const applicationId of [1, 2, 3, 4, 5]) {
      await page.locator(`tr[data-application-id="${applicationId}"]`).click();
      actionLabels[applicationId] = await page.locator("#workspaceNextAction").innerText();
    }

    await page.locator('tr[data-application-id="4"]').click();
    await page.locator("#workspaceNextAction").click();
    const greetingTargetText = await page.locator("#realGreetingTarget").innerText();
    await page.locator("#realGreetingConfirmRationale").fill("UI smoke only; do not execute the final action");
    await page.locator("#realGreetingConfirmAcknowledgement").check();
    const continueEnabled = await page.locator("#realGreetingContinue").isEnabled();
    await page.locator("#realGreetingContinue").click();
    const secondConfirmationVisible = await page.locator("#realGreetingStepTwo").isVisible();
    await page.locator("#closeRealGreetingDialog").click();

    await page.locator("#profileTab").click();
    const profileVisible = await page.locator("#profileAgentPortal").isVisible();
    await page.locator("#settingsTab").click();
    const advancedInitiallyClosed = !(await page.locator("#advancedDiagnostics").getAttribute("open"));
    await page.locator("#advancedDiagnostics > summary").click();
    const advancedTaskPanelVisible = await page.getByRole("heading", { name: "浏览器任务", exact: true }).isVisible();

    await page.locator("#workspaceTab").click();
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "m14-workspace-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileState = await page.evaluate(inspectWorkspaceLayout);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "m14-workspace-mobile.png"), fullPage: true });

    await page.locator("#workspaceTab").focus();
    await page.keyboard.press("ArrowRight");
    const keyboardTabsWork = await page.locator("#profilePanel").isVisible()
      && await page.locator("#profileTab").getAttribute("aria-selected") === "true";

    const calls = await page.evaluate(() => window.__bossFindWorkspaceSmoke.calls);
    const forbiddenMessages = new Set([
      "CREATE_BROWSER_TASK",
      "CLAIM_BROWSER_TASK",
      "TRANSITION_BROWSER_TASK",
      "UPDATE_REAL_ACTION_POLICY",
      "ARM_REAL_ACTION_AUTHORIZATION",
      "QUEUE_REAL_ACTION_AUTHORIZATION",
      "REVOKE_REAL_ACTION_AUTHORIZATION"
    ]);
    const checks = {
      defaultIsWorkspace: defaultState.workspaceVisible && defaultState.profileHidden && defaultState.settingsHidden,
      defaultVisibleButtonsAtMostFive: defaultVisibleButtons <= 5,
      defaultHasExpectedFiveControls: defaultVisibleButtons === 5,
      applicationTableIsPrimaryView: defaultState.applicationRows === 5 && defaultState.queueBeforeAction,
      contextualActionTracksStatus: actionLabels[1] === "评估岗位"
        && actionLabels[2] === "生成定制简历"
        && actionLabels[3] === "查看并审批"
        && actionLabels[4] === "发送一次"
        && actionLabels[5] === "查看并处理",
      confirmationTargetsGreetingDraftOnly: greetingTargetText.includes("消息 #41")
        && !greetingTargetText.includes("请介绍一下相关项目"),
      realActionUsesTwoStepConfirmation: continueEnabled && secondConfirmationVisible,
      profileHasDedicatedView: profileVisible,
      diagnosticsCollapsedByDefault: advancedInitiallyClosed && advancedTaskPanelVisible,
      desktopHasNoOverflowOrOverlap: defaultState.noDocumentOverflow
        && defaultState.tabsDoNotOverlap
        && defaultState.visibleButtonsFit
        && defaultState.workspaceColumnsDoNotOverlap,
      mobileHasNoOverflowOrOverlap: mobileState.noDocumentOverflow
        && mobileState.tabsDoNotOverlap
        && mobileState.visibleButtonsFit
        && mobileState.workspaceColumnsDoNotOverlap,
      keyboardTabsAreAccessible: keyboardTabsWork,
      readsApplicationsThroughExistingBackend: calls.some((call) => call.type === "GET_APPLICATIONS"),
      uiSmokeCreatesNoBossOrRealTask: !calls.some((call) => forbiddenMessages.has(call.type))
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      actionLabels,
      defaultVisibleButtons,
      desktop: defaultState,
      mobile: mobileState,
      screenshots: [
        path.join(ARTIFACT_DIR, "m14-workspace-desktop.png"),
        path.join(ARTIFACT_DIR, "m14-workspace-mobile.png")
      ],
      messageTypes: calls.map((call) => call.type)
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    await browser.close();
  }
}

async function installChromeMock(page) {
  await page.addInitScript(() => {
    const calls = [];
    const applications = [
      application(1, "DETAIL_CAPTURED", "AI 产品经理", "月之暗面", "2026-07-11T10:05:00.000Z"),
      application(2, "SHORTLISTED", "Agent 产品经理", "Flow Labs", "2026-07-11T10:04:00.000Z"),
      application(3, "RESUME_DRAFTED", "智能硬件产品经理", "Northstar", "2026-07-11T10:03:00.000Z"),
      application(4, "GREETING_READY", "大模型应用产品经理", "Kite AI", "2026-07-11T10:02:00.000Z"),
      application(5, "NEEDS_USER_REVIEW", "商业化产品经理", "Signal", "2026-07-11T10:01:00.000Z", "RESUME_CLAIMS_NEED_REVIEW"),
      application(6, "SUBMITTED", "产品运营", "Archive Co", "2026-07-11T10:00:00.000Z")
    ];
    const screenings = [
      screening(4, 92, 8, "auto_prepare", "大模型应用产品经理", "Kite AI"),
      screening(3, 84, 12, "auto_prepare", "智能硬件产品经理", "Northstar"),
      screening(2, 88, 10, "auto_prepare", "Agent 产品经理", "Flow Labs")
    ];
    const resumeVersions = [{
      id: 31,
      applicationId: 3,
      versionNumber: 1,
      status: "DRAFTED",
      title: "智能硬件产品经理",
      company: "Northstar",
      resumeFields: { education: [], experiences: [], projects: [] },
      sourceMapping: [],
      diffSummary: [],
      unsupportedClaims: [],
      metadata: {},
      createdAt: "2026-07-11T10:03:00.000Z"
    }];
    const messages = [
      {
        id: 42,
        applicationId: 4,
        direction: "INBOUND",
        channel: "boss_chat",
        status: "CAPTURED",
        title: "大模型应用产品经理",
        company: "Kite AI",
        messageText: "请介绍一下相关项目。",
        metadata: {}
      },
      {
        id: 41,
        applicationId: 4,
        resumeVersionId: 40,
        direction: "OUTBOUND",
        channel: "boss_greeting",
        status: "DRAFT",
        title: "大模型应用产品经理",
        company: "Kite AI",
        messageText: "您好，我的 AI 产品与 Agent 工作流经历和岗位匹配，期待进一步沟通。",
        metadata: { actionMode: "dry_run" }
      }
    ];

    function responseFor(message) {
      calls.push(message);
      switch (message.type) {
        case "GET_SETTINGS":
          return {
            backendUrl: "http://127.0.0.1:8787",
            syncPath: "/api/jobs/sync",
            token: "",
            autoSync: true,
            maxCachedJobs: 500,
            crawlMaxJobs: 30,
            crawlDelayMs: 1600,
            resumeTemplateName: "resume-to-word-campus-product-v1",
            riskGateEnabled: true,
            excludedDirections: ["销售", "直播"]
          };
        case "GET_APPLICATIONS":
          return { response: { applications, totalApplications: applications.length } };
        case "GET_CACHE":
          return { jobs: [], pages: {}, stats: {} };
        case "GET_QUALITY":
          return { report: { latest: { receivedJobs: 6, validJobs: 6, describedJobs: 5, descriptionCoverage: 0.83, requiredFieldCoverage: 1, invalidJobs: 0 } } };
        case "GET_EVENTS":
          return { events: [] };
        case "GET_BROWSER_TASK_DIAGNOSTICS":
          return { diagnostics: { counts: { queued: 0, running: 0, succeeded: 4, failed: 0 }, recentTasks: [], failuresByReason: [] } };
        case "GET_MISSING_DESCRIPTIONS":
          return { jobs: [{ title: "待补岗位", company: "Example" }], totalMissingDescriptions: 1 };
        case "GET_LAST_BOSS_PAGE":
          return {};
        case "GET_WORKFLOW_ERRORS":
          return { response: { errors: [{ id: 501, applicationId: 5, severity: "error", status: "OPEN", eventType: "RESUME_CLAIMS_NEED_REVIEW" }], totalErrors: 1 } };
        case "GET_WORKFLOW_EVENTS":
          return { response: { events: [], totalEvents: 0 } };
        case "GET_APPLICATION_TIMELINE":
          return { response: { applicationId: Number(message.applicationId), items: [] } };
        case "GET_SCREENING_CANDIDATES":
          return { response: { candidates: [applications[0]], totalCandidates: 1 } };
        case "GET_SCREENINGS":
          return { response: { screenings, totalScreenings: screenings.length } };
        case "GET_AGENT_RUNS":
          return { response: { runs: [], totalAgentRuns: 0 } };
        case "GET_CAREER_CONTEXT":
          return { response: { ok: true, careerContext: null, freshness: { status: "MISSING", isFresh: false }, missingQuestions: [] } };
        case "GET_PROFILE_FACT_DRAFTS":
          return { response: { drafts: [], totalDrafts: 0 } };
        case "GET_RESUME_CANDIDATES":
          return { response: { candidates: [applications[1]], totalCandidates: 1 } };
        case "GET_RESUME_VERSIONS": {
          const applicationId = Number(message.options?.applicationId || 0);
          const scoped = applicationId ? resumeVersions.filter((item) => item.applicationId === applicationId) : resumeVersions;
          return { response: { resumeVersions: scoped, totalResumeVersions: scoped.length } };
        }
        case "GET_RESUME_VERSION":
          return { response: resumeVersions.find((item) => item.id === Number(message.resumeVersionId)) || {} };
        case "GET_RESUME_AUDITS":
          return { response: { resumeAudits: [], totalResumeAudits: 0 } };
        case "GET_RESUME_FIT_EVALUATIONS":
          return { response: { resumeFitEvaluations: [], totalResumeFitEvaluations: 0 } };
        case "GET_RESUME_CLAIM_VERIFICATIONS":
          return { response: { resumeClaimVerifications: [], totalResumeClaimVerifications: 0 } };
        case "GET_RESUME_TEMPLATES":
          return { response: { defaultTemplate: "resume-to-word-campus-product-v1", templates: [{ key: "resume-to-word-campus-product-v1", label: "教育优先模板" }] } };
        case "GET_MESSAGES":
          return { response: { messages, totalMessages: messages.length } };
        case "GET_CONVERSATIONS":
          return { response: { conversations: [], totalConversations: 0 } };
        case "GET_SUBMISSION_READINESS_QUEUE":
          return { response: { items: [], totalReviews: 0 } };
        case "GET_REAL_ACTION_POLICY":
          return { response: { policy: { enabled: false, dailyLimit: 1, usedToday: 0, remainingToday: 1, cooldownSeconds: 300 }, activeAuthorization: null } };
        case "GET_REAL_ACTION_AUTHORIZATIONS":
          return { response: { authorizations: [] } };
        default:
          return {};
      }
    }

    function application(id, status, title, company, updatedAt, statusReason = "") {
      return {
        id,
        status,
        statusReason,
        title,
        company,
        location: "北京",
        salary: "20-35K",
        descriptionLength: status === "LIST_CAPTURED" ? 0 : 860,
        detailUrl: `https://www.zhipin.com/job_detail/ui-${id}.html`,
        updatedAt
      };
    }

    function screening(applicationId, matchScore, riskScore, recommendation, title, company) {
      return {
        id: 100 + applicationId,
        applicationId,
        matchScore,
        riskScore,
        recommendation,
        title,
        company,
        provider: "rules",
        createdAt: "2026-07-11T10:00:00.000Z"
      };
    }

    window.__bossFindWorkspaceSmoke = { calls };
    window.chrome = {
      runtime: {
        sendMessage: async (message) => ({ ok: true, result: responseFor(message || {}) })
      },
      tabs: {
        query: async () => [],
        sendMessage: async () => ({ ok: true, result: {} })
      }
    };
  });
}

function inspectWorkspaceLayout() {
  const visibleButtons = Array.from(document.querySelectorAll("button")).filter((button) => {
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  });
  const tabs = Array.from(document.querySelectorAll(".view-tab")).map((tab) => tab.getBoundingClientRect());
  const queue = document.querySelector(".queue-section")?.getBoundingClientRect();
  const action = document.querySelector(".next-action-panel")?.getBoundingClientRect();
  const isDesktopColumns = queue && action && Math.abs(queue.top - action.top) < 2;
  const columnsOverlap = isDesktopColumns
    ? rectanglesOverlap(queue, action)
    : Boolean(queue && action && queue.bottom > action.top + 1);
  return {
    workspaceVisible: !document.querySelector("#workspacePanel")?.hidden,
    profileHidden: Boolean(document.querySelector("#profilePanel")?.hidden),
    settingsHidden: Boolean(document.querySelector("#settingsPanel")?.hidden),
    applicationRows: document.querySelectorAll("#workspaceApplications tr").length,
    queueBeforeAction: Boolean(queue && action && (queue.left < action.left || queue.top < action.top)),
    noDocumentOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
    tabsDoNotOverlap: tabs.every((rect, index) => tabs.slice(index + 1).every((other) => !rectanglesOverlap(rect, other))),
    visibleButtonsFit: visibleButtons.every((button) => button.scrollWidth <= button.clientWidth + 1 && button.scrollHeight <= button.clientHeight + 1),
    workspaceColumnsDoNotOverlap: !columnsOverlap,
    visibleButtonCount: visibleButtons.length,
    viewport: { width: window.innerWidth, height: window.innerHeight }
  };

  function rectanglesOverlap(left, right) {
    return left.left < right.right - 1
      && left.right > right.left + 1
      && left.top < right.bottom - 1
      && left.bottom > right.top + 1;
  }
}
