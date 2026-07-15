#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createJobStore } = require("../server/src/sqlite-store");
const { createProfileService } = require("../server/src/services/profile-service");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m10-profile-confirm-store-"));
  const apiDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m10-profile-confirm-api-"));
  try {
    const serviceResult = runServiceChecks(storeDir);
    const apiResult = await runApiChecks(apiDir);
    const wiring = runWiringChecks();
    const checks = {
      ...serviceResult.checks,
      ...apiResult.checks,
      ...wiring.checks
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      serviceResult: serviceResult.summary,
      apiResult: apiResult.summary
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    fs.rmSync(storeDir, { recursive: true, force: true });
    fs.rmSync(apiDir, { recursive: true, force: true });
  }
}

function runServiceChecks(dataDir) {
  const store = createJobStore({ dataDir });
  try {
    const service = createProfileService({ store, dataDir });
    const created = service.generateFactDraftsFromCareerContext({
      answers: sampleAnswers()
    });
    const duplicate = service.generateFactDraftsFromCareerContext({
      answers: sampleAnswers()
    });
    const pending = store.getProfileFactDrafts({ status: "PENDING", limit: 100 });
    const experienceDraft = pending.drafts.find((draft) => draft.draftType === "experience");
    const skillDraft = pending.drafts.find((draft) => draft.draftType === "skill" && draft.title === "LangGraph");
    const constraintDraft = pending.drafts.find((draft) => draft.draftType === "constraint" && /销售/.test(draft.title));
    const confirmedExperience = store.confirmProfileFactDraft(experienceDraft.id, {
      content: {
        role: "Product and workflow owner",
        confidence: "user_confirmed"
      }
    });
    const confirmedSkill = store.confirmProfileFactDraft(skillDraft.id);
    const rejectedConstraint = store.rejectProfileFactDraft(constraintDraft.id, {
      reason: "service_smoke_rejected"
    });
    const bundle = store.getProfile();
    const events = store.getWorkflowEvents({ limit: 20 });

    return {
      checks: {
        serviceCreatesPendingDrafts: created.created >= 4
          && created.drafts.every((draft) => draft.status === "PENDING"),
        serviceSkipsDuplicateDrafts: duplicate.created === 0
          && duplicate.skipped >= created.created,
        serviceDraftsCoverTypes: created.drafts.some((draft) => draft.draftType === "experience")
          && created.drafts.some((draft) => draft.draftType === "skill")
          && created.drafts.some((draft) => draft.draftType === "constraint"),
        serviceConfirmWritesExperience: confirmedExperience.createdEntity.role === "Product and workflow owner"
          && confirmedExperience.draft.status === "CONFIRMED",
        serviceConfirmWritesSkill: confirmedSkill.createdEntity.name === "LangGraph"
          && confirmedSkill.draft.status === "CONFIRMED",
        serviceRejectDoesNotWriteConstraint: rejectedConstraint.draft.status === "REJECTED"
          && !bundle.constraints.some((constraint) => constraint.content === "销售"),
        serviceRecordsWorkflowEvent: events.events.some((event) => event.eventType === "PROFILE_FACT_DRAFTS_GENERATED"
          && event.metadata?.pendingUntilUserConfirmation === true)
      },
      summary: {
        created: created.created,
        duplicateSkipped: duplicate.skipped,
        pendingAfterActions: bundle.pendingFactDrafts.length,
        experiences: bundle.experiences.length,
        skills: bundle.skills.length,
        constraints: bundle.constraints.length
      }
    };
  } finally {
    store.close();
  }
}

async function runApiChecks(dataDir) {
  const port = await findFreePort();
  const server = spawn(process.execPath, ["server/src/server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      BOSS_DATA_DIR: dataDir,
      BOSS_SKIP_LEGACY_IMPORT: "1",
      HOST: "127.0.0.1",
      PORT: String(port)
    },
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true
  });

  try {
    await waitForHealth(port);
    const created = await requestJson(port, "POST", "/api/profile/career-context/fact-drafts", {
      answers: sampleAnswers()
    });
    const pending = await requestJson(port, "GET", "/api/profile/fact-drafts?status=PENDING&limit=100");
    const experienceDraft = pending.drafts.find((draft) => draft.draftType === "experience");
    const skillDraft = pending.drafts.find((draft) => draft.draftType === "skill" && draft.title === "LangGraph");
    const constraintDraft = pending.drafts.find((draft) => draft.draftType === "constraint" && /直播/.test(draft.title));
    const confirmedExperience = await requestJson(port, "POST", `/api/profile/fact-drafts/${experienceDraft.id}/confirm`, {
      content: {
        confidence: "user_confirmed"
      }
    });
    const confirmedSkill = await requestJson(port, "POST", `/api/profile/fact-drafts/${skillDraft.id}/confirm`, {});
    const rejectedConstraint = await requestJson(port, "POST", `/api/profile/fact-drafts/${constraintDraft.id}/reject`, {
      reason: "api_smoke_rejected"
    });
    const bundle = await requestJson(port, "GET", "/api/profile");
    const events = await requestJson(port, "GET", "/api/workflow-events?limit=30");

    return {
      checks: {
        apiCreatesAnswerDrafts: created.created >= 4
          && created.source === "career_context_answers",
        apiLeavesDraftsPendingBeforeConfirmation: pending.drafts.length === created.created
          && pending.drafts.every((draft) => draft.status === "PENDING"),
        apiConfirmsExperienceDraft: confirmedExperience.draft.status === "CONFIRMED"
          && confirmedExperience.createdEntity.id > 0,
        apiConfirmsSkillDraft: confirmedSkill.createdEntity.name === "LangGraph"
          && confirmedSkill.draft.status === "CONFIRMED",
        apiRejectsConstraintDraft: rejectedConstraint.draft.status === "REJECTED"
          && !bundle.constraints.some((constraint) => constraint.content === "直播"),
        apiConfirmedFactsEnterProfileBundle: bundle.experiences.length >= 1
          && bundle.skills.some((skill) => skill.name === "LangGraph"),
        apiWorkflowEventVisible: events.events.some((event) => event.eventType === "PROFILE_FACT_DRAFTS_GENERATED")
      },
      summary: {
        created: created.created,
        pendingBeforeActions: pending.drafts.length,
        experiences: bundle.experiences.length,
        skills: bundle.skills.length,
        events: events.events.length
      }
    };
  } finally {
    server.kill();
    await waitForExit(server).catch(() => {});
  }
}

function runWiringChecks() {
  const serverJs = read("server/src/server.js");
  const profileServiceJs = read("server/src/services/profile-service.js");
  const storeJs = read("server/src/sqlite-store.js");
  const packageJson = read("package.json");
  const planDoc = read("docs/04_DEVELOPMENT_PLAN.md");
  return {
    checks: {
      serverExposesAnswerDraftEndpoint: serverJs.includes("/api/profile/career-context/fact-drafts")
        && serverJs.includes("profileService.generateFactDraftsFromCareerContext"),
      profileServiceDefinesAnswerDraftGeneration: profileServiceJs.includes("generateFactDraftsFromCareerContext")
        && profileServiceJs.includes("PROFILE_FACT_DRAFTS_GENERATED")
        && profileServiceJs.includes("pendingUntilUserConfirmation: true"),
      storeHasGenericDraftCreator: storeJs.includes("createProfileFactDrafts(input = {})")
        && storeJs.includes("createProfileFactDraftsFromResumeSource"),
      packageRunsThisSmoke: packageJson.includes("m10-profile-fact-confirmation-smoke.js")
        && packageJson.includes("m10:profile-facts:smoke"),
      docsMentionM102f: planDoc.includes("M10.2f Profile Fact Confirmation")
    }
  };
}

function sampleAnswers() {
  return [
    {
      id: "pending_experience_100",
      prompt: "请确认「Boss Find」的经历性质、个人职责、可公开指标、项目状态和链接。",
      answer: "Boss Find 本地求职自动化项目；负责产品流程、Chrome 插件采集、Node.js 后端和 LangGraph 简历闭环；项目状态为本地 POC；可公开 GitHub 链接待补。"
    },
    {
      id: "skills_missing",
      prompt: "请确认可公开使用的技能。",
      answer: "LangGraph、Node.js、SQLite、Chrome Extension、产品设计"
    },
    {
      id: "excluded_directions",
      prompt: "请确认不想去的方向。",
      answer: "销售、直播"
    },
    {
      id: "target_roles_missing",
      prompt: "请确认目标岗位。",
      answer: "AI 产品经理、AI 产品工程、产品经理"
    }
  ];
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
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        text += chunk;
      });
      response.on("end", () => {
        let parsed = {};
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch (error) {
          reject(error);
          return;
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

function waitForHealth(port) {
  const deadline = Date.now() + 8000;
  return new Promise((resolve, reject) => {
    const tick = () => {
      requestJson(port, "GET", "/health")
        .then(resolve)
        .catch((error) => {
          if (Date.now() > deadline) {
            reject(error);
          } else {
            setTimeout(tick, 150);
          }
        });
    };
    tick();
  });
}

function waitForExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once("exit", resolve);
  });
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
