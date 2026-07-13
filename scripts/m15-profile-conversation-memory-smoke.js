#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createJobStore, SCHEMA_VERSION } = require("../server/src/sqlite-store");
const { createProfileService } = require("../server/src/services/profile-service");
const { createProfileConversationService } = require("../server/src/services/profile-conversation-service");
const {
  loadProfileConversationSkill,
  runProfileConversationAgent
} = require("../server/src/profile-conversation-agent");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m15-profile-dialog-"));
  try {
    const agent = await runAgentChecks();
    const service = await runServiceChecks(path.join(rootDir, "service"));
    const api = await runApiChecks(path.join(rootDir, "api"));
    const wiring = runWiringChecks();
    const checks = {
      ...agent.checks,
      ...service.checks,
      ...api.checks,
      ...wiring.checks
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      summaries: {
        agent: agent.summary,
        service: service.summary,
        api: api.summary
      }
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

async function runAgentChecks() {
  const skill = loadProfileConversationSkill();
  const result = await runProfileConversationAgent({
    session: { id: 1, status: "OPEN", summary: {} },
    profileBundle: sampleProfileBundle(),
    recentMessages: [],
    userMessage: { id: 1, role: "user", content: "目标岗位改为 AI 产品经理" }
  }, {
    modelConfig: {
      configured: true,
      apiKey: "test-key",
      baseUrl: "http://127.0.0.1:1",
      model: "profile-test-model",
      wireApi: "responses"
    },
    requestJsonCompletion: async ({ system, user }) => {
      if (!system.includes("Profile Dialog Contract") || !user.includes("confirmedProfile")) {
        throw new Error("Profile skill or structured prompt was not loaded");
      }
      return profileModelOutput();
    }
  });
  return {
    checks: {
      runtimeLoadsCareerSkill: skill.files.includes("SKILL.md")
        && skill.files.some((file) => file.endsWith("profile_dialog_contract.md")),
      modelOutputUsesStrictProfileDraft: result.provider === "llm"
        && result.result.factDrafts.length === 1
        && result.result.factDrafts[0].draftType === "profile"
        && result.result.factDrafts[0].operation === "UPDATE"
        && result.result.factDrafts[0].targetEntityId === 1,
      modelOutputKeepsConversationState: result.result.followupQuestions.length === 1
        && result.result.sessionSummaryPatch.goals.includes("AI 产品经理")
    },
    summary: {
      skillFiles: skill.files,
      draftCount: result.result.factDrafts.length
    }
  };
}

async function runServiceChecks(dataDir) {
  const store = createJobStore({ dataDir });
  try {
    const existing = store.createExperience({
      kind: "project",
      title: "Boss Find",
      role: "产品设计",
      facts: ["完成岗位采集 POC"],
      confidence: "user_confirmed"
    });
    let callCount = 0;
    const service = createProfileConversationService({
      store,
      runAgent: async ({ userMessage }) => {
        callCount += 1;
        if (userMessage.content.includes("失败后重试") && callCount === 2) {
          const error = new Error("stub model timeout");
          error.code = "LLM_REQUEST_FAILED";
          error.retryable = true;
          throw error;
        }
        return stubAgentResult(existing.id, userMessage.content);
      }
    });
    const session = service.createSession({ title: "M15 service smoke" }).session;
    const firstTurn = await service.sendMessage(session.id, {
      content: "Boss Find 的职责补充为产品与工作流负责人"
    });
    const beforeConfirm = store.getExperience(existing.id);
    const updateDraft = firstTurn.drafts.find((draft) => draft.operation === "UPDATE");
    const confirmed = store.confirmProfileFactDraft(updateDraft.id);
    const afterConfirm = store.getExperience(existing.id);

    let failure;
    try {
      await service.sendMessage(session.id, { content: "失败后重试" });
    } catch (error) {
      failure = error;
    }
    const failedState = service.getSession(session.id);
    const retry = await service.retryMessage(session.id, failure.context.userMessageId);
    const retriedState = service.getSession(session.id);

    const profileService = createProfileService({ store, dataDir });
    const context = await profileService.generateCareerContext({
      sourceSessionId: session.id,
      sourceMessageId: retry.userMessage.id,
      writeFile: true
    });
    const latestVersion = store.getLatestProfileContextVersion();
    const revisions = store.getProfileEntityRevisions({ entityType: "experience", entityId: existing.id });

    return {
      checks: {
        schemaIncludesConversationMemory: SCHEMA_VERSION === 15
          && store.getStats().schemaVersion === 15,
        servicePersistsBothSides: firstTurn.userMessage.id > 0
          && firstTurn.assistantMessage.id > firstTurn.userMessage.id
          && service.getSession(session.id).totalMessages >= 2,
        modelCannotMutateBeforeConfirmation: beforeConfirm.role === "产品设计"
          && updateDraft.status === "PENDING",
        confirmedUpdateMutatesExistingEntity: confirmed.operation === "UPDATE"
          && confirmed.resolvedEntity.id === existing.id
          && afterConfirm.role === "产品与工作流负责人",
        updateKeepsBeforeAfterRevision: revisions.revisions.length >= 1
          && revisions.revisions[0].before.role === "产品设计"
          && revisions.revisions[0].after.role === "产品与工作流负责人",
        failurePreservesUserMessage: failure.code === "LLM_REQUEST_FAILED"
          && failure.context.userMessagePersisted === true
          && failedState.messages.some((message) => message.id === failure.context.userMessageId && message.role === "user")
          && failedState.messages.some((message) => message.status === "FAILED"),
        retryDoesNotDuplicateUserMessage: retry.userMessage.id === failure.context.userMessageId
          && retriedState.messages.filter((message) => message.id === failure.context.userMessageId).length === 1
          && retry.assistantMessage.status === "COMPLETED",
        careerContextIsVersionedByHash: context.contextVersion.id === latestVersion.id
          && context.freshness.status === "FRESH"
          && latestVersion.sourceSessionId === session.id
      },
      summary: {
        sessionId: session.id,
        totalMessages: retriedState.totalMessages,
        updateDraftId: updateDraft.id,
        revisionCount: revisions.revisions.length,
        contextVersionId: latestVersion.id
      }
    };
  } finally {
    store.close();
  }
}

async function runApiChecks(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const modelServer = await startModelServer();
  const backendPort = await findFreePort();
  const backend = spawn(process.execPath, ["server/src/server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      BOSS_DATA_DIR: dataDir,
      BOSS_SKIP_LEGACY_IMPORT: "1",
      HOST: "127.0.0.1",
      PORT: String(backendPort),
      OPENAI_API_KEY: "m15-smoke-key",
      OPENAI_BASE_URL: `http://127.0.0.1:${modelServer.address().port}`,
      OPENAI_MODEL: "m15-profile-smoke",
      OPENAI_WIRE_API: "responses"
    },
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true
  });

  try {
    await waitForHealth(backendPort);
    const created = await requestJson(backendPort, "POST", "/api/profile/dialog-sessions", {
      title: "API profile conversation"
    });
    const sessionId = created.data.session.id;
    const turn = await requestJson(backendPort, "POST", `/api/profile/dialog-sessions/${sessionId}/messages`, {
      content: "我的目标岗位是 AI 产品经理"
    });
    const detail = await requestJson(backendPort, "GET", `/api/profile/dialog-sessions/${sessionId}`);
    const draftId = turn.data.drafts[0].id;
    const confirmed = await requestJson(backendPort, "POST", `/api/profile/fact-drafts/${draftId}/confirm`, {});
    const profile = await requestJson(backendPort, "GET", "/api/profile");
    const revisions = await requestJson(backendPort, "GET", "/api/profile/entity-revisions?entityType=profile&limit=10");
    return {
      checks: {
        apiCreatesPersistentSession: created.status === 201 && sessionId > 0,
        apiRunsSkillGroundedModelTurn: turn.status === 200
          && turn.data.assistantMessage.content.includes("AI 产品经理")
          && turn.data.createdDraftCount === 1,
        apiReadsConversationHistory: detail.data.totalMessages === 2
          && detail.data.messages[0].role === "user"
          && detail.data.messages[1].role === "assistant",
        apiConfirmsProfileUpdate: confirmed.data.operation === "UPDATE"
          && profile.data.profile.target.roles.includes("AI 产品经理"),
        apiExposesRevisionAudit: revisions.data.revisions.length === 1
          && revisions.data.revisions[0].entityType === "profile"
      },
      summary: {
        sessionId,
        messageCount: detail.data.totalMessages,
        draftId,
        modelCalls: modelServer.calls()
      }
    };
  } finally {
    backend.kill();
    await waitForExit(backend).catch(() => {});
    await new Promise((resolve) => modelServer.close(resolve));
  }
}

function runWiringChecks() {
  const server = read("server/src/server.js");
  const background = read("extension/src/background.js");
  const options = read("extension/src/options.js");
  const html = read("extension/src/options.html");
  const packageJson = read("package.json");
  return {
    checks: {
      serverExposesDialogContract: server.includes("/api/profile/dialog-sessions")
        && server.includes("profileConversationService.sendMessage")
        && server.includes("profileConversationService.retryMessage"),
      extensionProxiesDialogContract: background.includes('case "SEND_PROFILE_DIALOG_MESSAGE"')
        && background.includes('case "RETRY_PROFILE_DIALOG_MESSAGE"'),
      profilePageHasConversationSurface: html.includes('id="profileDialogMessages"')
        && html.includes('id="profileDialogComposer"')
        && html.includes('id="retryProfileDialogMessage"')
        && options.includes("sendProfileDialogTurn")
        && options.includes("renderProfileDialogMessages"),
      packageRegistersM15Smoke: packageJson.includes("m15-profile-conversation-memory-smoke.js")
    }
  };
}

function stubAgentResult(experienceId, content) {
  return {
    ok: true,
    agent: "ProfileConversationAgent",
    provider: "llm",
    fallbackUsed: false,
    promptVersion: "m15.test.prompt",
    agentVersion: "m15.test.agent",
    modelConfig: { configured: true, model: "stub-profile-model", wireApi: "responses" },
    result: {
      assistantReply: `已整理：${content}`,
      factDrafts: [{
        draftType: "experience",
        operation: "UPDATE",
        targetEntityType: "experience",
        targetEntityId: experienceId,
        title: "修正 Boss Find 职责",
        confidence: "user_confirmed",
        evidenceText: content,
        content: { role: "产品与工作流负责人" },
        metadata: { generator: "m15-smoke" }
      }],
      followupQuestions: [{ id: "project_metric", prompt: "有哪些可验证指标？", priority: "high" }],
      conflicts: [],
      sessionSummaryPatch: { projectThemes: ["本地求职工作流"] }
    }
  };
}

function profileModelOutput() {
  return {
    assistantReply: "已把 AI 产品经理记录为目标岗位。接下来需要补充最能证明产品能力的项目。",
    factDrafts: [{
      draftType: "profile",
      operation: "UPDATE",
      targetEntityType: "profile",
      targetEntityId: 1,
      title: "更新目标岗位",
      confidence: "user_confirmed",
      evidenceText: "目标岗位改为 AI 产品经理",
      content: { target: { roles: ["AI 产品经理"] } },
      reason: "用户明确修改目标岗位"
    }],
    followupQuestions: [{
      id: "primary_project",
      prompt: "哪个项目最能证明你的产品判断和落地能力？",
      reason: "用于选择简历主项目",
      priority: "high"
    }],
    conflicts: [],
    sessionSummaryPatch: { goals: ["AI 产品经理"] }
  };
}

function sampleProfileBundle() {
  return {
    profile: { id: 1, target: {}, summary: "" },
    resumeSources: [],
    experiences: [],
    skills: [],
    constraints: [],
    pendingFactDrafts: []
  };
}

async function startModelServer() {
  let callCount = 0;
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      callCount += 1;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ output_text: JSON.stringify(profileModelOutput()) }));
    });
  });
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.on("error", reject);
  });
  server.calls = () => callCount;
  return server;
}

function requestJson(port, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? "" : JSON.stringify(body);
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
        resolve({ status: response.statusCode, data: parsed });
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
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await requestJson(port, "GET", "/health");
      if (response.status === 200) {
        return;
      }
    } catch {
      // Backend is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Backend did not become healthy for M15 smoke");
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

function waitForExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once("exit", resolve);
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
