#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");
const { findBrowserExecutable } = require("../server/src/browser-executor/local-playwright-adapter");

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = path.join(ROOT, "server", "data", "ui-smoke");

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

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
    await page.locator('tr[data-application-id="3"] .row-action', { hasText: "更多" }).click();
    const jobDetailVisible = await page.locator("#jobDetailDialog").isVisible();
    const jobDetailHasResume = (await page.locator("#jobDetailResume").innerText()).includes("ui-resume-3.docx");
    await page.locator("#closeJobDetailDialog").click();

    await page.locator("#profileTab").click();
    const profileVisible = await page.locator("#profileAgentPortal").isVisible();
    await page.locator("#settingsTab").click();
    const advancedInitiallyClosed = !(await page.locator("#advancedDiagnostics").getAttribute("open"));
    await page.locator("#advancedDiagnostics > summary").click();
    const workflowLogPanelVisible = await page.getByRole("heading", { name: "Workflow progress", exact: true }).isVisible();
    const hiddenRealActionPanels = !(await page.getByRole("heading", { name: "打招呼 dry-run", exact: true }).isVisible())
      && !(await page.getByRole("heading", { name: "真实岗位 Shadow 评审", exact: true }).isVisible());

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
      defaultVisibleButtonsRemainFocused: defaultVisibleButtons <= 24,
      defaultHasExpectedQueueControls: defaultVisibleButtons >= 10 && defaultVisibleButtons <= 24,
      applicationTableIsPrimaryView: defaultState.applicationRows === 6 && defaultState.queueBeforeAction,
      contextualActionTracksStatus: actionLabels[1] === "评估岗位"
        && actionLabels[2] === "生成定制简历"
        && actionLabels[3] === "打开岗位页面"
        && actionLabels[4] === "打开岗位页面"
        && actionLabels[5] === "取消过滤并信任",
      manualStageOnlyOpensBossPage: calls.some((call) => call.type === "OPEN_BOSS_TAB"),
      jobDetailShowsResumePath: jobDetailVisible && jobDetailHasResume,
      profileHasDedicatedView: profileVisible,
      diagnosticsCollapsedByDefault: advancedInitiallyClosed && workflowLogPanelVisible,
      settingsHideExperimentalActionPanels: hiddenRealActionPanels,
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
      application(5, "SKIPPED", "商业化产品经理", "Signal", "2026-07-11T10:01:00.000Z", "RISK_GATE_EXCLUDED_DIRECTION"),
      application(6, "SUBMITTED", "产品运营", "Archive Co", "2026-07-11T10:00:00.000Z")
    ];
    let queues = [
      queue(1, "产品", true, applications.map((item) => item.id)),
      queue(2, "算法", false, [1, 2])
    ];
    const queueApplicationIds = new Map([
      [1, new Set(applications.map((item) => item.id))],
      [2, new Set([1, 2])]
    ]);
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
    let settings = {
      backendUrl: "http://127.0.0.1:8787",
      syncPath: "/api/jobs/sync",
      token: "",
      autoSync: true,
      maxCachedJobs: 500,
      crawlMaxJobs: 30,
      crawlDelayMs: 1600,
      resumeTemplateName: "resume-to-word-campus-product-v1",
      agentExecutionMode: "hybrid",
      activeApplicationQueueId: 1,
      riskGateEnabled: true,
      excludedDirections: ["销售", "直播"]
    };
    const shadowRun = {
      id: 8,
      status: "SUCCEEDED",
      mode: "hybrid",
      selectedCount: 3,
      completedCount: 3,
      failedCount: 0,
      sampleCount: 7,
      modelInvocationCount: 7,
      telemetry: {
        usage: { totalTokens: 4200 },
        failedSampleCount: 0
      },
      options: { limit: 20, topK: 2, samplesPerTopJob: 3, plannedSampleCount: 7 }
    };
    const shadowItems = [
      shadowItem(801, 1, 92, 1.25, "auto_prepare", applications[3]),
      shadowItem(802, 2, 86, 2.5, "review_needed", applications[1]),
      shadowItem(803, 3, 72, 0, "review_needed", applications[0])
    ];
    let shadowReviewId = 900;
    let queueId = 2;
    let modelConfig = {
      configured: false,
      hasApiKey: false,
      baseUrl: "https://api.openai.com/v1",
      model: "",
      wireApi: "responses",
      reasoningEffort: "",
      timeoutMs: 45000,
      maxRetries: 1,
      source: "default"
    };

    function responseFor(message) {
      calls.push(message);
      switch (message.type) {
        case "GET_SETTINGS":
          return structuredClone(settings);
        case "SAVE_SETTINGS":
          settings = { ...settings, ...(message.settings || {}) };
          return structuredClone(settings);
        case "GET_APPLICATION_QUEUES":
          refreshQueueCounts();
          return { response: { queues: structuredClone(queues) } };
        case "CREATE_APPLICATION_QUEUE": {
          const created = queue(++queueId, message.queue?.name || `Queue ${queueId}`, false, []);
          created.description = message.queue?.description || "";
          queues.push(created);
          queueApplicationIds.set(created.id, new Set());
          return { response: { queue: structuredClone(created) } };
        }
        case "ARCHIVE_APPLICATION_QUEUE": {
          const queueIdToArchive = Number(message.queueId);
          const queueToArchive = queues.find((item) => item.id === queueIdToArchive);
          if (!queueToArchive || queueToArchive.isDefault) {
            throw new Error("Queue cannot be archived");
          }
          queues = queues.filter((item) => item.id !== queueIdToArchive);
          queueApplicationIds.delete(queueIdToArchive);
          refreshQueueCounts();
          return { response: { ok: true, queueId: queueIdToArchive, archived: true } };
        }
        case "REMOVE_APPLICATION_QUEUE_ITEMS": {
          const ids = queueApplicationIds.get(Number(message.queueId)) || new Set();
          let removed = 0;
          for (const applicationId of message.options?.applicationIds || []) {
            if (ids.delete(Number(applicationId))) {
              removed += 1;
            }
          }
          refreshQueueCounts();
          return { response: { ok: true, queueId: Number(message.queueId), removed } };
        }
        case "REMOVE_MISSING_DESCRIPTION_ITEMS": {
          const ids = queueApplicationIds.get(Number(message.queueId)) || new Set();
          const removed = ids.delete(1) ? 1 : 0;
          refreshQueueCounts();
          return { response: { ok: true, queueId: Number(message.queueId), removed } };
        }
        case "TRUST_APPLICATION_QUEUE_ITEM": {
          const item = applications.find((applicationItem) => applicationItem.id === Number(message.applicationId));
          if (!item) {
            throw new Error("Application not found");
          }
          item.trusted = true;
          item.status = "DETAIL_CAPTURED";
          item.statusReason = "queue_trust_override";
          return {
            response: {
              ok: true,
              queueId: Number(message.queueId),
              applicationId: item.id,
              trusted: true
            }
          };
        }
        case "UPDATE_MANUAL_APPLICATION_STATUS": {
          const item = applications.find((applicationItem) => applicationItem.id === Number(message.applicationId));
          if (!item) {
            throw new Error("Application not found");
          }
          item.manualStatus = message.options?.manualStatus || "NOT_CONTACTED";
          return {
            response: {
              ok: true,
              applicationId: item.id,
              manualStatus: item.manualStatus,
              changed: true
            }
          };
        }
        case "GET_APPLICATIONS": {
          const selectedQueueId = Number(message.options?.queueId || settings.activeApplicationQueueId || 1);
          const ids = queueApplicationIds.get(selectedQueueId) || new Set();
          const scoped = applications
            .filter((item) => ids.has(item.id))
            .map((item) => ({ ...item, queueId: selectedQueueId }));
          return {
            response: {
              queueId: selectedQueueId,
              applications: scoped,
              totalApplications: scoped.length
            }
          };
        }
        case "GET_CACHE":
          return { jobs: [], pages: {}, stats: {} };
        case "GET_QUALITY":
          return { report: { latest: { receivedJobs: 6, validJobs: 6, describedJobs: 5, descriptionCoverage: 0.83, requiredFieldCoverage: 1, invalidJobs: 0 } } };
        case "GET_EVENTS":
          return { events: [] };
        case "GET_BROWSER_TASK_DIAGNOSTICS":
          return { diagnostics: { counts: { queued: 0, running: 0, succeeded: 4, failed: 0 }, recentTasks: [], failuresByReason: [] } };
        case "GET_MISSING_DESCRIPTIONS": {
          const selectedQueueId = Number(message.options?.queueId || settings.activeApplicationQueueId || 1);
          const hasMissing = (queueApplicationIds.get(selectedQueueId) || new Set()).has(1);
          return {
            queueId: selectedQueueId,
            jobs: hasMissing
              ? [{ applicationId: 1, queueId: selectedQueueId, title: "待补岗位", company: "Example" }]
              : [],
            totalMissingDescriptions: hasMissing ? 1 : 0
          };
        }
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
        case "SCREEN_APPLICATION_BATCH": {
          const results = [];
          for (const applicationId of message.options?.applicationIds || []) {
            const item = applications.find((applicationItem) => applicationItem.id === Number(applicationId));
            if (!item) {
              continue;
            }
            const existing = screenings.find((screeningItem) => screeningItem.applicationId === item.id);
            const next = {
              ...(existing || screening(item.id, 82, 12, "auto_prepare", item.title, item.company)),
              matchScore: 82,
              riskScore: 12,
              recommendation: "auto_prepare"
            };
            if (existing) {
              Object.assign(existing, next);
            } else {
              screenings.push(next);
            }
            item.latestScreeningId = next.id;
            item.latestMatchScore = next.matchScore;
            item.latestRiskScore = next.riskScore;
            item.latestScreeningRecommendation = next.recommendation;
            item.status = "SHORTLISTED";
            results.push({ ok: true, applicationId: item.id, ...next });
          }
          return {
            response: {
              ok: true,
              succeeded: results.length,
              failed: 0,
              results
            }
          };
        }
        case "GET_AGENT_RUNS":
          return { response: { runs: [], totalAgentRuns: 0 } };
        case "GET_AGENT_QUALITY":
          return {
            response: {
              invocationCount: 12,
              totals: { totalTokens: 3456, fallbackCount: 1, failedCount: 0 },
              latencyMs: { p50: 820, p95: 1450, max: 1700 },
              evaluations: [{
                id: 7,
                status: "SUCCEEDED",
                metrics: {
                  structuredOutputSuccessRate: { value: 1, threshold: 0.95, passed: true },
                  generatedClaimSupportRate: { value: 1, threshold: 0.95, passed: true }
                }
              }]
            }
          };
        case "GET_MODEL_CONFIG":
          return {
            response: {
              ok: true,
              config: structuredClone(modelConfig),
              configFileExists: modelConfig.hasApiKey
            }
          };
        case "SAVE_MODEL_CONFIG":
          modelConfig = {
            ...modelConfig,
            baseUrl: message.config?.baseUrl || modelConfig.baseUrl,
            model: message.config?.model || modelConfig.model,
            wireApi: message.config?.wireApi || modelConfig.wireApi,
            reasoningEffort: message.config?.reasoningEffort || "",
            timeoutMs: Number(message.config?.timeoutMs || modelConfig.timeoutMs),
            maxRetries: Number(message.config?.maxRetries ?? modelConfig.maxRetries),
            hasApiKey: message.config?.clearApiKey
              ? false
              : Boolean(message.config?.apiKey || modelConfig.hasApiKey),
            configured: !message.config?.clearApiKey
              && Boolean((message.config?.apiKey || modelConfig.hasApiKey) && message.config?.model),
            source: "model_provider_local"
          };
          return {
            response: {
              ok: true,
              config: structuredClone(modelConfig),
              configFileExists: true
            }
          };
        case "TEST_MODEL_CONFIG":
          return {
            response: {
              ok: true,
              config: structuredClone(modelConfig),
              probe: { ok: true, message: "connected" },
              telemetry: { durationMs: 18, attemptCount: 1, usage: { totalTokens: 3 } }
            }
          };
        case "GET_AGENT_SHADOW_RUNS":
          return { response: { totalRuns: 1, runs: [structuredClone(shadowRun)] } };
        case "GET_AGENT_SHADOW_RUN":
          return { response: { run: structuredClone(shadowRun), items: structuredClone(shadowItems) } };
        case "START_AGENT_SHADOW_RUN":
          shadowRun.status = "SUCCEEDED";
          return { response: { accepted: true, run: structuredClone(shadowRun) } };
        case "REVIEW_AGENT_SHADOW_ITEM": {
          const item = shadowItems.find((candidate) => candidate.id === Number(message.itemId));
          const review = {
            id: ++shadowReviewId,
            shadowItemId: Number(message.itemId),
            label: message.review?.label || "CORRECT",
            correctedRecommendation: message.review?.correctedRecommendation || "",
            reviewer: message.review?.reviewer || "local-user",
            note: message.review?.note || "",
            createdAt: "2026-07-13T10:00:00.000Z"
          };
          if (item) {
            item.reviews.unshift(review);
            item.latestReview = review;
          }
          return { response: { review: structuredClone(review) } };
        }
        case "GET_AGENT_SHADOW_FAILURES":
          return { response: { failureCandidates: [] } };
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
      const screeningByApplication = {
        2: { id: 102, matchScore: 88, riskScore: 10, recommendation: "auto_prepare" },
        3: { id: 103, matchScore: 84, riskScore: 12, recommendation: "auto_prepare" },
        4: { id: 104, matchScore: 92, riskScore: 8, recommendation: "auto_prepare" },
        5: { id: 105, matchScore: 62, riskScore: 35, recommendation: "review_needed" },
        6: { id: 106, matchScore: 76, riskScore: 18, recommendation: "auto_prepare" }
      };
      const screening = screeningByApplication[id] || {};
      const hasResume = [3, 4, 6].includes(id);
      return {
        id,
        status,
        statusReason,
        title,
        company,
        location: "北京",
        salary: "20-35K",
        description: `岗位 ${title} 的完整职位描述，包含产品设计、用户研究、数据分析、跨团队协作和 AI 能力落地要求。`.repeat(5),
        descriptionLength: 860,
        detailUrl: `https://www.zhipin.com/job_detail/ui-${id}.html`,
        manualStatus: id === 6 ? "APPLIED" : "NOT_CONTACTED",
        latestScreeningId: screening.id || 0,
        latestMatchScore: screening.matchScore ?? null,
        latestRiskScore: screening.riskScore ?? null,
        latestScreeningRecommendation: screening.recommendation || "",
        latestResumeVersionId: hasResume ? 30 + id : 0,
        latestResumeStatus: hasResume ? "APPROVED" : "",
        latestResumeFilePath: hasResume ? `C:\\resumes\\ui-resume-${id}.docx` : "",
        latestResumeErrorCode: "",
        trusted: false,
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

    function queue(id, name, isDefault, applicationIds) {
      return {
        id,
        name,
        description: "",
        searchUrl: "",
        isDefault,
        totalApplications: applicationIds.length,
        completeApplicationCount: applicationIds.length,
        pendingApplications: applicationIds.length,
        attentionApplications: 0,
        missingDescriptionCount: applicationIds.includes(1) ? 1 : 0,
        createdAt: "2026-07-13T10:00:00.000Z",
        updatedAt: "2026-07-13T10:00:00.000Z"
      };
    }

    function refreshQueueCounts() {
      queues = queues.map((item) => {
        const ids = queueApplicationIds.get(item.id) || new Set();
        const scoped = applications.filter((application) => ids.has(application.id));
        return {
          ...item,
          totalApplications: scoped.length,
          completeApplicationCount: scoped.filter((application) => application.descriptionLength >= 80).length,
          pendingApplications: scoped.filter((application) => (
            !["SUBMITTED", "SKIPPED"].includes(application.status)
          )).length,
          attentionApplications: scoped.filter((application) => (
            ["NEEDS_USER_REVIEW", "NEEDS_MANUAL_ACTION", "FAILED"].includes(application.status)
          )).length,
          missingDescriptionCount: ids.has(1) ? 1 : 0
        };
      });
    }

    function shadowItem(id, rank, averageMatchScore, screeningScoreStddev, recommendation, sourceApplication) {
      return {
        id,
        rank,
        applicationId: sourceApplication.id,
        status: "SUCCEEDED",
        sampleCount: rank <= 2 ? 3 : 1,
        successCount: rank <= 2 ? 3 : 1,
        averageMatchScore,
        screeningScoreStddev,
        maxRiskScore: 100 - averageMatchScore,
        recommendation,
        job: {
          title: sourceApplication.title,
          company: sourceApplication.company,
          location: sourceApplication.location
        },
        reviews: [],
        latestReview: null
      };
    }

    window.__bossFindWorkspaceSmoke = { calls };
    window.chrome = {
      runtime: {
        sendMessage: async (message) => ({ ok: true, result: responseFor(message || {}) })
      },
      tabs: {
        query: async () => [],
        sendMessage: async () => ({ ok: true, result: {} }),
        create: async ({ url }) => {
          calls.push({ type: "OPEN_BOSS_TAB", url });
          return { id: 99, url };
        }
      }
    };
  });
}

module.exports = {
  ARTIFACT_DIR,
  ROOT,
  installChromeMock
};

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
