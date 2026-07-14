#!/usr/bin/env node

const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");
const { findBrowserExecutable } = require("../server/src/browser-executor/local-playwright-adapter");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    throw new Error("No local Chrome/Edge executable was found for options UI smoke. Set LOCAL_CHROME_PATH or install a Playwright browser.");
  }
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      const calls = [];
      let contextFreshness = {
        status: "FRESH",
        isFresh: true,
        contextUpdatedAt: "2026-07-08T10:02:00.000Z",
        latestProfileChangedAt: "2026-07-08T10:01:00.000Z",
        latestProfileChangeSource: "fact_draft",
        staleReasons: []
      };
      let drafts = [
        {
          id: 101,
          draftType: "experience",
          status: "PENDING",
          title: "Boss Find",
          confidence: "needs_review",
          evidenceText: "A: Boss Find 本地求职自动化项目",
          createdAt: "2026-07-08T10:00:00.000Z"
        },
        {
          id: 102,
          draftType: "skill",
          status: "PENDING",
          title: "LangGraph",
          confidence: "needs_review",
          evidenceText: "A: LangGraph、Node.js",
          createdAt: "2026-07-08T10:01:00.000Z"
        }
      ];
      const careerQuestions = [
        {
          id: "pending_experience_100",
          prompt: "请确认 Boss Find 的职责、指标和项目状态。",
          priority: "high",
          metadata: {}
        },
        {
          id: "skills_missing",
          prompt: "请确认可公开使用的技能。",
          priority: "medium",
          metadata: {}
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
              activeApplicationQueueId: 1,
              riskGateEnabled: false,
              excludedDirections: []
            };
          case "GET_APPLICATION_QUEUES":
            return {
              response: {
                queues: [{
                  id: 1,
                  name: "默认意向",
                  isDefault: true,
                  totalApplications: 0,
                  completeApplicationCount: 0,
                  pendingApplications: 0,
                  attentionApplications: 0,
                  missingDescriptionCount: 0
                }]
              }
            };
          case "GET_APPLICATIONS":
            return { response: { queueId: 1, applications: [], totalApplications: 0 } };
          case "GET_CACHE":
            return { jobs: [], pages: {}, stats: {} };
          case "GET_QUALITY":
            return { report: { metrics: {}, events: [] } };
          case "GET_EVENTS":
            return { events: [] };
          case "GET_BROWSER_TASK_DIAGNOSTICS":
            return { diagnostics: { counts: {}, recentTasks: [] } };
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
            return { response: { reviews: [], totalReviews: 0 } };
          case "GET_CAREER_CONTEXT":
            return {
              response: {
                ok: true,
                careerContext: {
                  markdown: "# Career Context\n\n待确认问题。",
                  filePath: "server/data/career_context/career_agent_context.md",
                  updatedAt: "2026-07-08T10:02:00.000Z",
                  context: {
                    missingQuestions: careerQuestions
                  }
                },
                freshness: contextFreshness,
                missingQuestions: careerQuestions
              }
            };
          case "GENERATE_CAREER_CONTEXT":
            contextFreshness = {
              status: "FRESH",
              isFresh: true,
              contextUpdatedAt: "2026-07-08T10:04:00.000Z",
              latestProfileChangedAt: "2026-07-08T10:03:00.000Z",
              latestProfileChangeSource: "fact_draft",
              staleReasons: []
            };
            return {
              response: {
                ok: true,
                careerContext: {
                  markdown: "# Career Context\n\n已根据确认事实刷新。",
                  filePath: "server/data/career_context/career_agent_context.md",
                  updatedAt: "2026-07-08T10:04:00.000Z",
                  context: {
                    missingQuestions: []
                  }
                },
                freshness: contextFreshness,
                missingQuestions: []
              }
            };
          case "GET_PROFILE_FACT_DRAFTS":
            return {
              response: {
                storage: "sqlite",
                totalDrafts: drafts.length,
                drafts
              }
            };
          case "GENERATE_PROFILE_FACT_DRAFTS":
            drafts = [
              ...drafts,
              {
                id: 103,
                draftType: "constraint",
                status: "PENDING",
                title: "目标岗位方向",
                confidence: "needs_review",
                evidenceText: "A: AI 产品经理",
                createdAt: "2026-07-08T10:03:00.000Z"
              }
            ];
            return {
              response: {
                ok: true,
                source: "career_context_answers",
                created: 1,
                skipped: 0,
                drafts: drafts.filter((draft) => draft.id === 103)
              }
            };
          case "CONFIRM_PROFILE_FACT_DRAFT":
            drafts = drafts.filter((draft) => draft.id !== Number(message.draftId));
            contextFreshness = {
              status: "STALE",
              isFresh: false,
              contextUpdatedAt: "2026-07-08T10:02:00.000Z",
              latestProfileChangedAt: "2026-07-08T10:03:00.000Z",
              latestProfileChangeSource: "experience",
              staleReasons: ["profile_changed_after_career_context"]
            };
            return {
              response: {
                ok: true,
                action: "confirm",
                draft: { id: Number(message.draftId), status: "CONFIRMED" },
                createdEntity: { id: 201 }
              }
            };
          case "REJECT_PROFILE_FACT_DRAFT":
            drafts = drafts.filter((draft) => draft.id !== Number(message.draftId));
            contextFreshness = {
              status: "STALE",
              isFresh: false,
              contextUpdatedAt: "2026-07-08T10:04:00.000Z",
              latestProfileChangedAt: "2026-07-08T10:05:00.000Z",
              latestProfileChangeSource: "fact_draft",
              staleReasons: ["profile_changed_after_career_context"]
            };
            return {
              response: {
                ok: true,
                action: "reject",
                draft: { id: Number(message.draftId), status: "REJECTED" }
              }
            };
          default:
            return {};
        }
      }

      window.__bossFindSmoke = {
        calls
      };
      window.chrome = {
        runtime: {
          sendMessage: async (message) => ({
            ok: true,
            result: responseFor(message || {})
          })
        },
        tabs: {
          query: async () => [],
          sendMessage: async () => ({ ok: true, result: {} })
        }
      };
    });

    const optionsUrl = pathToFileURL(path.join(ROOT, "extension", "src", "options.html")).toString();
    await page.goto(optionsUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("诊断已刷新"));
    await page.click("#profileTab");
    await page.waitForFunction(() => document.querySelector("#profilePanel")?.hidden === false);

    const initialDraftText = await page.locator("#profileFactDrafts").innerText();
    await page.locator(".profile-rule-fallback > summary").click();
    await page.fill("#profileAgentUserUpdate", "新增项目：ProfileAgent 画像入口，用于补充经历、目标岗位和风险约束，先生成待确认草稿。");
    await page.click("#stageProfileAgentUpdate");
    await page.waitForFunction(() => document.querySelector("#profileAgentUpdateStatus")?.textContent.includes("已生成"));
    const portalStatus = await page.locator("#profileAgentUpdateStatus").innerText();
    await page.fill('textarea[data-question-id="pending_experience_100"]', "Boss Find 本地求职自动化项目，负责产品流程、Chrome 插件采集、Node.js 后端和 LangGraph 简历闭环。");
    await page.fill('textarea[data-question-id="skills_missing"]', "LangGraph、Node.js、SQLite、Chrome Extension、产品设计");
    await page.click("#generateProfileFactDrafts");
    await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("事实草稿生成完成"));
    const afterGenerateText = await page.locator("#profileFactDrafts").innerText();

    const experienceItem = page.locator("#profileFactDrafts .list-item", { hasText: "#101" });
    await experienceItem.locator('[data-field="role"]').fill("Product workflow owner");
    await experienceItem.locator('[data-field="facts"]').fill("负责 Chrome 插件采集\n负责 LangGraph 简历闭环\n完成本地 SQLite 入库");
    await experienceItem.getByRole("button", { name: "确认" }).click();
    await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("事实草稿 #101 已确认"));
    const afterConfirmText = await page.locator("#profileFactDrafts").innerText();
    const staleText = await page.locator("#careerContextFreshnessStatus").innerText();

    await page.click("#regenerateCareerContextAfterFacts");
    await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("ProfileAgent 已生成 career_agent_context.md"));
    const freshText = await page.locator("#careerContextFreshnessStatus").innerText();

    await page.locator("#profileFactDrafts .list-item", { hasText: "#102" }).getByRole("button", { name: "拒绝" }).click();
    await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("事实草稿 #102 已拒绝"));
    const afterRejectText = await page.locator("#profileFactDrafts").innerText();

    const calls = await page.evaluate(() => window.__bossFindSmoke.calls);
    const portalGenerateCall = calls.find((call) => call.type === "GENERATE_PROFILE_FACT_DRAFTS"
      && call.options?.answers?.some((answer) => answer.id === "profile_user_update"));
    const generateCall = calls.find((call) => call.type === "GENERATE_PROFILE_FACT_DRAFTS"
      && call.options?.answers?.some((answer) => answer.id === "pending_experience_100"));
    const confirmCall = calls.find((call) => call.type === "CONFIRM_PROFILE_FACT_DRAFT" && Number(call.draftId) === 101);
    const checks = {
      pageLoadedProfileFactPanel: initialDraftText.includes("#101")
        && initialDraftText.includes("Boss Find")
        && initialDraftText.includes("#102")
        && initialDraftText.includes("LangGraph"),
      profilePortalStagesUserUpdate: Boolean(portalGenerateCall)
        && portalGenerateCall.options.answers.length === 1
        && portalGenerateCall.options.answers[0].answer.includes("ProfileAgent 画像入口")
        && portalStatus.includes("已生成"),
      generateUsesCurrentAnswers: Boolean(generateCall)
        && Array.isArray(generateCall.options?.answers)
        && generateCall.options.answers.length === 3
        && generateCall.options.answers.some((answer) => answer.id === "pending_experience_100" && answer.answer.includes("Boss Find"))
        && generateCall.options.answers.some((answer) => answer.id === "skills_missing" && answer.answer.includes("LangGraph"))
        && generateCall.options.answers.some((answer) => answer.id === "profile_user_update" && answer.answer.includes("ProfileAgent 画像入口")),
      generateRefreshesPendingDrafts: afterGenerateText.includes("#103")
        && afterGenerateText.includes("目标岗位方向")
        && calls.filter((call) => call.type === "GET_PROFILE_FACT_DRAFTS").length >= 2,
      confirmSendsExpectedMessage: Boolean(confirmCall)
        && confirmCall.options?.content?.role === "Product workflow owner"
        && Array.isArray(confirmCall.options?.content?.facts)
        && confirmCall.options.content.facts.includes("负责 LangGraph 简历闭环")
        && !afterConfirmText.includes("#101")
        && afterConfirmText.includes("#102"),
      factChangeMarksCareerContextStale: staleText.includes("事实库已变更")
        && calls.some((call) => call.type === "GENERATE_CAREER_CONTEXT")
        && freshText.includes("直接复用持久化画像"),
      rejectSendsExpectedMessage: calls.some((call) => call.type === "REJECT_PROFILE_FACT_DRAFT"
        && Number(call.draftId) === 102
        && call.options?.reason === "options_profile_fact_rejected")
        && !afterRejectText.includes("#102")
        && afterRejectText.includes("#103"),
      workflowRefreshedAfterActions: calls.filter((call) => call.type === "GET_WORKFLOW_EVENTS").length >= 3
        && calls.filter((call) => call.type === "GET_WORKFLOW_ERRORS").length >= 3,
      noBossBrowserTasksCreated: !calls.some((call) => [
        "CREATE_BROWSER_TASK",
        "CLAIM_BROWSER_TASK",
        "TRANSITION_BROWSER_TASK",
        "RUN_RESUME_WORKFLOW_GRAPH",
        "PREPARE_RESUME",
        "PREPARE_GREETING"
      ].includes(call.type))
    };

    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      messageTypes: calls.map((call) => call.type)
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    await browser.close();
  }
}
