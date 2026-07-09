#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createJobStore } = require("../server/src/sqlite-store");
const { generateProfileFactDrafts } = require("../server/src/profile-draft-generator");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const storeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m5-drafts-store-"));
  const apiDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m5-drafts-api-"));
  try {
    const generatorResult = runGeneratorChecks();
    const storeResult = runStoreChecks(storeDataDir);
    const apiResult = await runApiChecks(apiDataDir);
    const wiring = runWiringChecks();
    const checks = {
      ...generatorResult.checks,
      ...storeResult.checks,
      ...apiResult.checks,
      ...wiring.checks
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      generatorResult: generatorResult.summary,
      storeResult: storeResult.summary,
      apiResult: apiResult.summary
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    fs.rmSync(storeDataDir, { recursive: true, force: true });
    fs.rmSync(apiDataDir, { recursive: true, force: true });
  }
}

function runGeneratorChecks() {
  const generated = generateProfileFactDrafts({
    id: 1,
    rawText: sampleResumeText()
  });
  const experienceDrafts = generated.drafts.filter((draft) => draft.draftType === "experience");
  const skillDrafts = generated.drafts.filter((draft) => draft.draftType === "skill");
  const questionDrafts = generated.drafts.filter((draft) => draft.draftType === "question");
  return {
    checks: {
      generatorCreatesExperienceDrafts: experienceDrafts.length >= 2
        && experienceDrafts.some((draft) => draft.title.includes("Boss Find")),
      generatorCreatesSkillDrafts: skillDrafts.some((draft) => draft.title === "Node.js")
        && skillDrafts.some((draft) => draft.title === "SQLite"),
      generatorCreatesQuestions: questionDrafts.length > 0
    },
    summary: generated.summary
  };
}

function runStoreChecks(dataDir) {
  const store = createJobStore({ dataDir });
  try {
    const resume = store.createResumeSource({
      sourceType: "text",
      fileName: "profile-draft-resume.txt",
      rawText: sampleResumeText()
    });
    const generated = generateProfileFactDrafts(resume);
    const created = store.createProfileFactDraftsFromResumeSource(resume.id, generated);
    const secondRun = store.createProfileFactDraftsFromResumeSource(resume.id, generated);
    const pendingBefore = store.getProfileFactDrafts({ status: "PENDING", limit: 100 });
    const experienceDraft = pendingBefore.drafts.find((draft) => draft.draftType === "experience");
    const skillDraft = pendingBefore.drafts.find((draft) => draft.draftType === "skill" && draft.title === "Node.js");
    const questionDraft = pendingBefore.drafts.find((draft) => draft.draftType === "question");
    const confirmedExperience = store.confirmProfileFactDraft(experienceDraft.id, {
      content: {
        role: "Product and engineering owner",
        confidence: "user_confirmed"
      }
    });
    const confirmedSkill = store.confirmProfileFactDraft(skillDraft.id);
    const rejectedQuestion = store.rejectProfileFactDraft(questionDraft.id, {
      reason: "answered_elsewhere"
    });
    const bundle = store.getProfile();
    const stats = store.getStats();

    const checks = {
      storeCreatesDraftsFromResumeSource: created.created >= 4
        && created.drafts.every((draft) => draft.status === "PENDING"),
      storeSkipsDuplicateDrafts: secondRun.created === 0
        && secondRun.skipped >= created.created,
      storeConfirmsExperienceDraft: confirmedExperience.createdEntity.id > 0
        && confirmedExperience.createdEntity.role === "Product and engineering owner"
        && confirmedExperience.draft.status === "CONFIRMED",
      storeConfirmsSkillDraft: confirmedSkill.createdEntity.name === "Node.js"
        && confirmedSkill.draft.status === "CONFIRMED",
      storeRejectsQuestionDraft: rejectedQuestion.draft.status === "REJECTED"
        && rejectedQuestion.draft.metadata.rejectReason === "answered_elsewhere",
      storeProfileBundleIncludesPendingDrafts: bundle.pendingFactDrafts.length === stats.pendingFactDraftCount,
      storeStatsExposeDraftCounts: stats.factDraftCount >= created.created
        && stats.pendingFactDraftCount === created.created - 3
    };

    return {
      checks,
      summary: {
        createdDrafts: created.created,
        duplicateSkipped: secondRun.skipped,
        factDraftCount: stats.factDraftCount,
        pendingFactDraftCount: stats.pendingFactDraftCount,
        experiences: bundle.experiences.length,
        skills: bundle.skills.length
      }
    };
  } finally {
    store.close();
  }
}

async function runApiChecks(dataDir) {
  const port = 26000 + Math.floor(Math.random() * 1000);
  const server = spawn(process.execPath, ["server/src/server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      BOSS_DATA_DIR: dataDir,
      BOSS_SKIP_LEGACY_IMPORT: "1",
      PORT: String(port)
    },
    stdio: ["ignore", "ignore", "ignore"]
  });

  try {
    await waitForHealth(port);
    const resume = await requestJson(port, "POST", "/api/profile/resume-sources", {
      sourceType: "text",
      fileName: "api-profile-draft-resume.txt",
      rawText: sampleResumeText()
    });
    const created = await requestJson(port, "POST", `/api/profile/resume-sources/${resume.id}/drafts`, {});
    const pending = await requestJson(port, "GET", "/api/profile/fact-drafts?status=PENDING&limit=100");
    const experienceDraft = pending.drafts.find((draft) => draft.draftType === "experience");
    const skillDraft = pending.drafts.find((draft) => draft.draftType === "skill" && draft.title === "SQLite");
    const questionDraft = pending.drafts.find((draft) => draft.draftType === "question");
    const confirmedExperience = await requestJson(port, "POST", `/api/profile/fact-drafts/${experienceDraft.id}/confirm`, {
      content: {
        confidence: "user_confirmed"
      }
    });
    const confirmedSkill = await requestJson(port, "POST", `/api/profile/fact-drafts/${skillDraft.id}/confirm`, {});
    const rejectedQuestion = await requestJson(port, "POST", `/api/profile/fact-drafts/${questionDraft.id}/reject`, {
      reason: "api_smoke_rejected"
    });
    const stats = await requestJson(port, "GET", "/api/stats");
    const bundle = await requestJson(port, "GET", "/api/profile");

    return {
      checks: {
        apiCreatesDraftsFromResumeSource: created.created >= 4
          && created.resumeSource.id === resume.id,
        apiListsPendingDrafts: pending.totalDrafts === created.created
          && pending.drafts.some((draft) => draft.draftType === "question"),
        apiConfirmsExperienceDraft: confirmedExperience.createdEntity.id > 0
          && confirmedExperience.draft.status === "CONFIRMED",
        apiConfirmsSkillDraft: confirmedSkill.createdEntity.name === "SQLite"
          && confirmedSkill.draft.status === "CONFIRMED",
        apiRejectsDraft: rejectedQuestion.draft.status === "REJECTED"
          && rejectedQuestion.draft.metadata.rejectReason === "api_smoke_rejected",
        apiStatsAndBundleReflectDrafts: stats.factDraftCount >= created.created
          && bundle.pendingFactDrafts.length === stats.pendingFactDraftCount
      },
      summary: {
        createdDrafts: created.created,
        factDraftCount: stats.factDraftCount,
        pendingFactDraftCount: stats.pendingFactDraftCount
      }
    };
  } finally {
    server.kill();
    await waitForExit(server);
  }
}

function runWiringChecks() {
  const serverJs = read("server/src/server.js");
  const storeJs = read("server/src/sqlite-store.js");
  const packageJson = read("package.json");
  return {
    checks: {
      serverExposesProfileDraftEndpoints: serverJs.includes("/api/profile/fact-drafts")
        && serverJs.includes("/drafts")
        && serverJs.includes("generateProfileFactDrafts"),
      storeDefinesProfileDraftTable: storeJs.includes("CREATE TABLE IF NOT EXISTS profile_fact_drafts")
        && storeJs.includes("confirmProfileFactDraft")
        && storeJs.includes("pendingFactDraftCount"),
      packageRunsProfileDraftSmoke: packageJson.includes("m5:drafts:smoke")
        && packageJson.includes("server/src/profile-draft-generator.js")
    }
  };
}

function sampleResumeText() {
  return [
    "项目经历",
    "Boss Find 本地求职自动化项目 | Product Owner | 2026.01-2026.06",
    "- 使用 Node.js、SQLite、Chrome Extension 构建 BOSS 岗位采集和 JD 补齐流程",
    "- 设计 applications 状态机和 browser_tasks 队列，支持失败诊断和重试",
    "- 通过数据分析定位 JD 覆盖率问题，并输出产品流程方案",
    "技能",
    "Node.js, SQLite, Chrome Extension, 数据分析, 需求分析, 产品设计",
    "教育经历",
    "Example University | 信息管理 | 2022.09-2026.06"
  ].join("\n");
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
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = null;
        try {
          parsed = JSON.parse(text || "{}");
        } catch {
          parsed = { raw: text };
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

async function waitForHealth(port) {
  const deadline = Date.now() + 8000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await requestJson(port, "GET", "/health");
      return;
    } catch (error) {
      lastError = error;
      await sleep(150);
    }
  }
  throw lastError || new Error("Timed out waiting for server");
}

function waitForExit(processHandle) {
  return new Promise((resolve) => {
    processHandle.once("exit", resolve);
    setTimeout(resolve, 1500);
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
