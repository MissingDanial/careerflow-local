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
    throw new Error("No local Chrome/Edge executable was found for ProfileAgent UI smoke.");
  }
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push(`console: ${message.text()}`);
    }
  });
  try {
    await installChromeMock(page);
    await page.goto(pathToFileURL(path.join(ROOT, "extension", "src", "options.html")).toString(), {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("诊断已刷新"));
    await page.locator("#profileTab").click();
    await page.waitForFunction(() => document.querySelectorAll(".profile-dialog-message").length === 2);

    const initial = await inspectProfile(page);
    await page.locator("#profileDialogComposer").fill("Boss Find 项目中，我负责产品流程和 Agent 编排。 ");
    await page.locator("#sendProfileDialogMessage").click();
    await page.waitForFunction(() => document.querySelectorAll(".profile-dialog-message").length === 4);
    await page.waitForFunction(() => document.querySelectorAll("#profileFactDrafts > .list-item[data-draft-id]").length === 1);
    const afterTurn = await inspectProfile(page);

    await page.locator("#profileResumeFile").setInputFiles({
      name: "career-profile-smoke.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Candidate\n\nAI product manager with Agent workflow experience.", "utf8")
    });
    await page.locator("#importProfileResume").click();
    await page.waitForFunction(() => document.querySelector("#profileResumeImportStatus")?.textContent.includes("新增 1 条待确认草稿")
      && document.querySelectorAll("#profileResumeSources > .list-item").length === 1
      && document.querySelectorAll("#profileFactDrafts > .list-item[data-draft-id]").length === 2);
    const afterResumeImport = await inspectProfile(page);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "m15-profile-dialog-desktop.png"),
      fullPage: true
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await inspectProfile(page);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "m15-profile-dialog-mobile.png"),
      fullPage: true
    });

    const calls = await page.evaluate(() => window.__m15ProfileDialogSmoke.calls);
    const checks = {
      profileConversationIsPrimary: initial.profileVisible
        && initial.messageCount === 2
        && initial.ruleFallbackClosed,
      existingConversationIsRestored: initial.messageText.includes("AI 产品经理")
        && initial.summaryText.includes("AI 产品经理")
        && initial.questionText.includes("可验证指标"),
      sendPersistsAndRendersTurn: afterTurn.messageCount === 4
        && afterTurn.messageText.includes("产品流程和 Agent 编排")
        && afterTurn.messageText.includes("已整理这段项目职责")
        && afterTurn.draftCount === 1,
      updateDraftIsClearlyLabeled: afterTurn.draftText.includes("更新 experience #7")
        && afterTurn.draftText.includes("Boss Find 职责"),
      resumeUploadPersistsSourceAndCreatesDraft: afterResumeImport.resumeSourceCount === 1
        && afterResumeImport.draftCount === 2
        && afterResumeImport.resumeImportStatus.includes("新增 1 条待确认草稿")
        && calls.some((call) => call.type === "IMPORT_PROFILE_RESUME"
          && call.resume?.fileName === "career-profile-smoke.md"
          && Boolean(call.resume?.contentBase64))
        && calls.some((call) => call.type === "CREATE_PROFILE_RESUME_DRAFTS"
          && call.resumeSourceId === 21),
      desktopHasNoOverflow: initial.noDocumentOverflow && afterTurn.noDocumentOverflow,
      mobileHasNoOverflow: mobile.noDocumentOverflow
        && mobile.messagesInsideViewport
        && mobile.controlsInsideViewport,
      uiUsesProfileApis: calls.some((call) => call.type === "GET_PROFILE_DIALOG_SESSIONS")
        && calls.some((call) => call.type === "GET_PROFILE_DIALOG_SESSION")
        && calls.some((call) => call.type === "SEND_PROFILE_DIALOG_MESSAGE")
        && calls.some((call) => call.type === "GET_PROFILE_RESUME_SOURCES"),
      renderedInteractionsHaveNoRuntimeErrors: runtimeErrors.length === 0,
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
      initial,
      afterTurn,
      afterResumeImport,
      mobile,
      messageTypes: calls.map((call) => call.type),
      runtimeErrors,
      screenshots: [
        path.join(ARTIFACT_DIR, "m15-profile-dialog-desktop.png"),
        path.join(ARTIFACT_DIR, "m15-profile-dialog-mobile.png")
      ]
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    await browser.close();
  }
}

async function inspectProfile(page) {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const rectInside = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return !rect || (rect.left >= -1 && rect.right <= viewportWidth + 1);
    };
    return {
      profileVisible: !document.querySelector("#profilePanel")?.hidden,
      messageCount: document.querySelectorAll(".profile-dialog-message").length,
      messageText: document.querySelector("#profileDialogMessages")?.textContent || "",
      summaryText: document.querySelector("#profileDialogSummary")?.textContent || "",
      questionText: document.querySelector("#profileDialogOpenQuestions")?.textContent || "",
      draftCount: document.querySelectorAll("#profileFactDrafts > .list-item[data-draft-id]").length,
      draftText: document.querySelector("#profileFactDrafts")?.textContent || "",
      resumeSourceCount: document.querySelectorAll("#profileResumeSources > .list-item").length,
      resumeImportStatus: document.querySelector("#profileResumeImportStatus")?.textContent || "",
      ruleFallbackClosed: !document.querySelector(".profile-rule-fallback")?.hasAttribute("open"),
      noDocumentOverflow: document.documentElement.scrollWidth <= viewportWidth + 1,
      messagesInsideViewport: rectInside("#profileDialogMessages"),
      controlsInsideViewport: rectInside(".profile-dialog-toolbar") && rectInside(".profile-dialog-actions")
    };
  });
}

async function installChromeMock(page) {
  await page.addInitScript(() => {
    const calls = [];
    const session = {
      id: 1,
      title: "AI 产品方向复盘",
      status: "OPEN",
      summary: { goals: ["AI 产品经理"], projectThemes: ["Agent 产品"] },
      openQuestions: [{ id: "metric", prompt: "项目有哪些可验证指标？", priority: "high" }],
      conflicts: [],
      modelConfig: { configured: true, model: "profile-ui-smoke" },
      messageCount: 2,
      pendingDraftCount: 0,
      updatedAt: "2026-07-11T12:00:00.000Z"
    };
    const messages = [
      {
        id: 1,
        sessionId: 1,
        role: "user",
        status: "COMPLETED",
        content: "我的目标岗位是 AI 产品经理。",
        createdAt: "2026-07-11T12:00:00.000Z"
      },
      {
        id: 2,
        sessionId: 1,
        role: "assistant",
        status: "COMPLETED",
        content: "已记录目标岗位。接下来补充一个最能证明产品能力的项目。",
        createdAt: "2026-07-11T12:00:01.000Z"
      }
    ];
    const drafts = [];
    const resumeSources = [];

    function resultFor(message) {
      calls.push(structuredClone(message));
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
            activeApplicationQueueId: 1,
            riskGateEnabled: true,
            excludedDirections: ["销售", "直播"]
          };
        case "GET_APPLICATION_QUEUES":
          return {
            response: {
              queues: [{
                id: 1,
                name: "默认意向",
                description: "",
                isDefault: true,
                totalApplications: 0,
                completeApplicationCount: 0,
                pendingApplications: 0,
                attentionApplications: 0,
                missingDescriptionCount: 0
              }]
            }
          };
        case "GET_PROFILE_RESUME_SOURCES":
          return {
            response: {
              resumeSources: structuredClone(resumeSources),
              totalResumeSources: resumeSources.length
            }
          };
        case "IMPORT_PROFILE_RESUME": {
          if (!message.resume?.fileName || !message.resume?.contentBase64) {
            throw new Error("Resume upload payload is incomplete");
          }
          const resumeSource = {
            id: 21,
            sourceType: "markdown",
            fileName: message.resume.fileName,
            textLength: 62,
            createdAt: "2026-07-14T09:00:00.000Z"
          };
          resumeSources.splice(0, resumeSources.length, resumeSource);
          return { response: { ok: true, resumeSource: structuredClone(resumeSource) } };
        }
        case "CREATE_PROFILE_RESUME_DRAFTS": {
          const alreadyCreated = drafts.some((draft) => draft.id === 12);
          if (!alreadyCreated) {
            drafts.push({
              id: 12,
              draftType: "experience",
              status: "PENDING",
              operation: "CREATE",
              targetEntityType: "experience",
              targetEntityId: null,
              title: "简历导入项目经历",
              content: {
                title: "Agent 求职工作流",
                role: "AI 产品经理",
                facts: ["负责 Agent 工作流设计与本地数据闭环"],
                skills: ["LangGraph"]
              },
              confidence: "source_extracted",
              evidenceText: "Imported from career-profile-smoke.md",
              createdAt: "2026-07-14T09:00:01.000Z"
            });
          }
          return {
            response: {
              ok: true,
              resumeSourceId: Number(message.resumeSourceId),
              created: alreadyCreated ? 0 : 1,
              skipped: alreadyCreated ? 1 : 0
            }
          };
        }
        case "GET_PROFILE_DIALOG_SESSIONS":
          session.messageCount = messages.length;
          session.pendingDraftCount = drafts.length;
          return { response: { sessions: [structuredClone(session)], totalSessions: 1 } };
        case "GET_PROFILE_DIALOG_SESSION":
          session.messageCount = messages.length;
          session.pendingDraftCount = drafts.length;
          return {
            response: {
              session: structuredClone(session),
              messages: structuredClone(messages),
              totalMessages: messages.length,
              pendingDrafts: structuredClone(drafts),
              pendingDraftCount: drafts.length
            }
          };
        case "SEND_PROFILE_DIALOG_MESSAGE": {
          const userMessage = {
            id: messages.length + 1,
            sessionId: 1,
            role: "user",
            status: "COMPLETED",
            content: message.options?.content || "",
            createdAt: "2026-07-11T12:01:00.000Z"
          };
          const assistantMessage = {
            id: userMessage.id + 1,
            sessionId: 1,
            role: "assistant",
            status: "COMPLETED",
            content: "已整理这段项目职责，并生成一条待确认的经历修改。",
            createdAt: "2026-07-11T12:01:01.000Z"
          };
          messages.push(userMessage, assistantMessage);
          drafts.push({
            id: 11,
            draftType: "experience",
            status: "PENDING",
            operation: "UPDATE",
            targetEntityType: "experience",
            targetEntityId: 7,
            title: "Boss Find 职责",
            content: {
              title: "Boss Find",
              role: "产品流程与 Agent 编排",
              facts: ["负责产品流程和 Agent 编排"],
              skills: ["LangGraph"]
            },
            confidence: "user_confirmed",
            evidenceText: userMessage.content,
            createdAt: assistantMessage.createdAt
          });
          session.summary.projectThemes = ["Agent 产品", "本地求职工作流"];
          return {
            response: {
              session: structuredClone(session),
              userMessage,
              assistantMessage,
              drafts: structuredClone(drafts),
              createdDraftCount: 1,
              skippedDraftCount: 0
            }
          };
        }
        case "GET_PROFILE_FACT_DRAFTS":
          return { response: { drafts: structuredClone(drafts), totalDrafts: drafts.length } };
        case "GET_CAREER_CONTEXT":
          return { response: { ok: true, careerContext: null, freshness: { status: "MISSING" } } };
        case "GET_RESUME_TEMPLATES":
          return {
            response: {
              defaultTemplate: "resume-to-word-campus-product-v1",
              templates: [{ key: "resume-to-word-campus-product-v1", label: "教育优先模板" }]
            }
          };
        case "GET_MODEL_CONFIG":
          return {
            response: {
              ok: true,
              config: {
                configured: true,
                hasApiKey: true,
                baseUrl: "https://model.example.test/v1",
                model: "profile-ui-smoke",
                wireApi: "responses",
                reasoningEffort: "",
                timeoutMs: 45000,
                maxRetries: 1,
                source: "test"
              }
            }
          };
        case "GET_AGENT_QUALITY":
          return { response: { invocationCount: 0, totals: {}, latencyMs: {}, evaluations: [] } };
        case "GET_AGENT_SHADOW_RUNS":
          return { response: { runs: [], totalRuns: 0 } };
        case "GET_AGENT_SHADOW_FAILURES":
          return { response: { failureCandidates: [] } };
        case "GET_APPLICATIONS":
          return { response: { applications: [], totalApplications: 0 } };
        case "GET_CACHE":
          return { jobs: [], pages: {}, stats: {} };
        case "GET_QUALITY":
          return { report: { latest: null } };
        case "GET_EVENTS":
          return { events: [] };
        case "GET_BROWSER_TASK_DIAGNOSTICS":
          return { diagnostics: { counts: {}, recentTasks: [], failuresByReason: [] } };
        case "GET_MISSING_DESCRIPTIONS":
          return { jobs: [], totalMissingDescriptions: 0 };
        case "GET_LAST_BOSS_PAGE":
          return {};
        case "GET_WORKFLOW_ERRORS":
          return { response: { errors: [], totalErrors: 0 } };
        case "GET_WORKFLOW_EVENTS":
          return { response: { events: [], totalEvents: 0 } };
        case "GET_SCREENING_CANDIDATES":
          return { response: { candidates: [], totalCandidates: 0 } };
        case "GET_SCREENINGS":
          return { response: { screenings: [], totalScreenings: 0 } };
        case "GET_AGENT_RUNS":
          return { response: { runs: [], totalAgentRuns: 0 } };
        case "GET_RESUME_CANDIDATES":
          return { response: { candidates: [], totalCandidates: 0 } };
        case "GET_RESUME_VERSIONS":
          return { response: { resumeVersions: [], totalResumeVersions: 0 } };
        case "GET_RESUME_AUDITS":
          return { response: { resumeAudits: [], totalResumeAudits: 0 } };
        case "GET_RESUME_FIT_EVALUATIONS":
          return { response: { resumeFitEvaluations: [], totalResumeFitEvaluations: 0 } };
        case "GET_RESUME_CLAIM_VERIFICATIONS":
          return { response: { resumeClaimVerifications: [], totalResumeClaimVerifications: 0 } };
        case "GET_MESSAGES":
          return { response: { messages: [], totalMessages: 0 } };
        case "GET_CONVERSATIONS":
          return { response: { conversations: [], totalConversations: 0 } };
        case "GET_SUBMISSION_READINESS_QUEUE":
          return { response: { items: [], totalReviews: 0 } };
        case "GET_REAL_ACTION_POLICY":
          return { response: { policy: { enabled: false }, activeAuthorization: null } };
        case "GET_REAL_ACTION_AUTHORIZATIONS":
          return { response: { authorizations: [] } };
        default:
          return {};
      }
    }

    window.__m15ProfileDialogSmoke = { calls };
    globalThis.chrome = {
      runtime: {
        sendMessage: async (message) => {
          try {
            return { ok: true, result: resultFor(message) };
          } catch (error) {
            return { ok: false, error: error.message, errorCode: error.code || "MOCK_ERROR", context: error.context || {} };
          }
        }
      }
    };
  });
}
