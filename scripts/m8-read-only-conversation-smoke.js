#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createJobStore } = require("../server/src/sqlite-store");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const storeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m8-readonly-store-"));
  const apiDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m8-readonly-api-"));
  try {
    const storeResult = runStoreChecks(storeDataDir);
    const apiResult = await runApiChecks(apiDataDir);
    const wiring = runWiringChecks();
    const checks = {
      ...storeResult.checks,
      ...apiResult.checks,
      ...wiring.checks
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      storeResult: storeResult.summary,
      apiResult: apiResult.summary
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    fs.rmSync(storeDataDir, { recursive: true, force: true });
    fs.rmSync(apiDataDir, { recursive: true, force: true });
  }
}

function runStoreChecks(dataDir) {
  const store = createJobStore({ dataDir });
  try {
    const application = seedApplication(store);
    seedApplicationTransition(store, application.id, "SCORED", "SCREENING_COMPLETED", "m8_read_only_seed");
    seedApplicationTransition(store, application.id, "SHORTLISTED", "SCREENING_SHORTLISTED", "m8_read_only_seed");
    seedApplicationTransition(store, application.id, "GREETING_READY", "GREETING_READY", "m8_read_only_seed");

    const refreshTask = store.createBrowserTask({
      applicationId: application.id,
      taskType: "REFRESH_CONVERSATION",
      payload: {
        jobId: application.bossJobId,
        title: application.title,
        company: application.company,
        detailUrl: application.detailUrl,
        sourceUrl: "https://www.zhipin.com/web/geek/jobs?query=agent",
        readOnly: true
      }
    });
    const claimedRefresh = store.claimBrowserTask({
      taskTypes: ["REFRESH_CONVERSATION"],
      sourceUrl: application.detailUrl
    });
    const refreshTransition = store.transitionBrowserTask(refreshTask.id, {
      toStatus: "SUCCEEDED",
      result: {
        ok: true,
        taskType: "REFRESH_CONVERSATION",
        statusReason: "CONVERSATION_READ",
        conversation: {
          chatOpened: true,
          status: "CHAT_OPENED",
          recruiterName: "Li",
          messageCount: 2,
          messages: [
            { direction: "outbound", text: "hello" },
            { direction: "inbound", text: "send resume" }
          ]
        },
        resumeUnlock: {
          unlocked: false,
          status: "RESUME_LOCKED_OR_UNKNOWN"
        },
        readOnly: {
          noRealBossAction: true,
          clicked: false,
          uploaded: false,
          submitted: false
        },
        page: {
          url: application.detailUrl,
          title: "BOSS chat"
        }
      }
    });
    const afterChat = store.getApplications().applications.find((item) => item.id === application.id);
    const conversationsAfterChat = store.getConversations({ applicationId: application.id });
    const messagesAfterChat = store.getMessages({ applicationId: application.id, limit: 10 });

    const duplicateRefreshTask = store.createBrowserTask({
      applicationId: application.id,
      taskType: "REFRESH_CONVERSATION",
      payload: {
        jobId: application.bossJobId,
        title: application.title,
        company: application.company,
        detailUrl: application.detailUrl,
        sourceUrl: application.detailUrl,
        readOnly: true,
        duplicateProbe: true
      }
    });
    store.claimBrowserTask({
      taskTypes: ["REFRESH_CONVERSATION"],
      sourceUrl: application.detailUrl
    });
    store.transitionBrowserTask(duplicateRefreshTask.id, {
      toStatus: "SUCCEEDED",
      result: {
        ok: true,
        taskType: "REFRESH_CONVERSATION",
        statusReason: "CONVERSATION_READ",
        conversation: {
          chatOpened: true,
          status: "CHAT_OPENED",
          recruiterName: "Li",
          messageCount: 2,
          recentMessages: [
            { direction: "OUTBOUND", text: "hello" },
            { direction: "INBOUND", text: "send resume" }
          ]
        },
        resumeUnlock: {
          unlocked: false,
          status: "RESUME_LOCKED_OR_UNKNOWN"
        },
        readOnly: {
          noRealBossAction: true,
          clicked: false,
          uploaded: false,
          submitted: false
        },
        page: {
          url: application.detailUrl,
          title: "BOSS chat"
        }
      }
    });
    const messagesAfterDuplicateRefresh = store.getMessages({ applicationId: application.id, limit: 10 });
    const conversationAfterAssessment = store.getConversations({ applicationId: application.id }).conversations[0];

    const unlockTask = store.createBrowserTask({
      applicationId: application.id,
      taskType: "CHECK_RESUME_UNLOCK",
      payload: {
        jobId: application.bossJobId,
        title: application.title,
        company: application.company,
        detailUrl: application.detailUrl,
        sourceUrl: application.detailUrl,
        readOnly: true
      }
    });
    const claimedUnlock = store.claimBrowserTask({
      taskTypes: ["CHECK_RESUME_UNLOCK"],
      sourceUrl: application.detailUrl
    });
    const unlockTransition = store.transitionBrowserTask(unlockTask.id, {
      toStatus: "SUCCEEDED",
      result: {
        ok: true,
        taskType: "CHECK_RESUME_UNLOCK",
        statusReason: "RESUME_UNLOCKED",
        conversation: {
          chatOpened: true,
          status: "CHAT_OPENED",
          messageCount: 3
        },
        resumeUnlock: {
          unlocked: true,
          status: "RESUME_UNLOCKED",
          actionLabels: ["发送简历"]
        },
        readOnly: {
          noRealBossAction: true,
          clicked: false,
          uploaded: false,
          submitted: false
        },
        page: {
          url: application.detailUrl,
          title: "BOSS chat"
        }
      }
    });
    const afterUnlock = store.getApplications().applications.find((item) => item.id === application.id);
    const conversationsAfterUnlock = store.getConversations({ applicationId: application.id });
    const waitingResult = runWaitingForReplyStoreCheck(store);
    const tasks = store.getBrowserTasks({ status: "SUCCEEDED", limit: 10 });
    const events = store.getApplicationEvents(20);

    return {
      checks: {
        storeClaimsRefreshByDetailJobId: claimedRefresh.claimed === true && claimedRefresh.task.id === refreshTask.id,
        storeAppliesConversationReadOnlyResult: refreshTransition.toStatus === "SUCCEEDED"
          && afterChat.status === "CHAT_OPENED"
          && conversationsAfterChat.conversations[0]?.metadata?.lastResult?.conversation?.messageCount === 2,
        storeArchivesConversationMessages: messagesAfterChat.totalMessages === 2
          && messagesAfterChat.messages.every((message) => message.channel === "boss_chat" && message.status === "CAPTURED")
          && messagesAfterChat.messages.some((message) => message.direction === "INBOUND" && message.messageText === "send resume"),
        storeDedupesArchivedConversationMessages: messagesAfterDuplicateRefresh.totalMessages === 2,
        storeAssessesResumeRequested: conversationAfterAssessment.metadata?.communicationAssessment?.state === "RESUME_REQUESTED"
          && conversationAfterAssessment.metadata?.communicationAssessment?.resumeRequested === true,
        storeRecommendsResumeUploadDryRun: conversationAfterAssessment.metadata?.nextActionRecommendation?.action === "PREPARE_RESUME_UPLOAD_DRY_RUN"
          && conversationAfterAssessment.metadata?.nextActionRecommendation?.blockedTaskTypes?.includes("UPLOAD_RESUME"),
        storeAssessesWaitingForReply: waitingResult.ok,
        storeRecommendsWaitingForReply: waitingResult.nextAction === "WAIT_FOR_REPLY",
        storeClaimsUnlockBySourceUrl: claimedUnlock.claimed === true && claimedUnlock.task.id === unlockTask.id,
        storeAppliesResumeUnlockWithoutSubmissionReady: unlockTransition.toStatus === "SUCCEEDED"
          && afterUnlock.status === "RESUME_UNLOCKED"
          && afterUnlock.status !== "SUBMISSION_READY",
        storeConversationMetadataKeepsReadOnlySnapshot: conversationsAfterUnlock.conversations[0]?.metadata?.lastResult?.resumeUnlock?.unlocked === true
          && conversationsAfterUnlock.conversations[0]?.metadata?.lastBrowserTaskType === "CHECK_RESUME_UNLOCK",
        storeDoesNotCreateUploadOrSubmitTasks: tasks.tasks.every((task) => !["UPLOAD_RESUME", "SUBMIT_APPLICATION"].includes(task.taskType)),
        storeRecordsReadOnlyApplicationEvents: events.events.some((event) => event.toStatus === "CHAT_OPENED" && event.metadata?.readOnly === true)
          && events.events.some((event) => event.toStatus === "RESUME_UNLOCKED" && event.metadata?.readOnly === true)
      },
      summary: {
        applicationId: application.id,
        afterChatStatus: afterChat.status,
        afterUnlockStatus: afterUnlock.status,
        conversationStatus: conversationsAfterUnlock.conversations[0]?.status,
        archivedMessageCount: messagesAfterDuplicateRefresh.totalMessages,
        communicationState: conversationsAfterUnlock.conversations[0]?.metadata?.communicationAssessment?.state,
        nextAction: conversationsAfterUnlock.conversations[0]?.metadata?.nextActionRecommendation?.action,
        waitingState: waitingResult.state,
        waitingNextAction: waitingResult.nextAction,
        succeededTaskTypes: tasks.tasks.map((task) => task.taskType)
      }
    };
  } finally {
    store.close();
  }
}

function runWaitingForReplyStoreCheck(store) {
  store.syncJobs({
    source: "m8-read-only-waiting-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId: "m8-readonly-waiting",
        title: "Workflow Assistant",
        company: "Waiting Co",
        salary: "15-25K",
        location: "Nanning",
        detailUrl: "https://www.zhipin.com/job_detail/m8-readonly-waiting.html",
        sourceUrl: "https://www.zhipin.com/web/geek/jobs?query=workflow",
        description: "Workflow assistant role with Chrome extension and Node.js responsibilities. ".repeat(3)
      }
    ]
  });
  const application = store.getApplications().applications.find((item) => item.bossJobId === "m8-readonly-waiting");
  seedApplicationTransition(store, application.id, "SCORED", "SCREENING_COMPLETED", "waiting_seed");
  seedApplicationTransition(store, application.id, "SHORTLISTED", "SCREENING_SHORTLISTED", "waiting_seed");
  seedApplicationTransition(store, application.id, "GREETING_READY", "GREETING_READY", "waiting_seed");
  const task = store.createBrowserTask({
    applicationId: application.id,
    taskType: "REFRESH_CONVERSATION",
    payload: {
      jobId: application.bossJobId,
      detailUrl: application.detailUrl,
      sourceUrl: application.detailUrl,
      readOnly: true
    }
  });
  store.claimBrowserTask({
    taskTypes: ["REFRESH_CONVERSATION"],
    sourceUrl: application.detailUrl
  });
  store.transitionBrowserTask(task.id, {
    toStatus: "SUCCEEDED",
    result: {
      ok: true,
      taskType: "REFRESH_CONVERSATION",
      conversation: {
        chatOpened: true,
        status: "CHAT_OPENED",
        requiresReply: true,
        recentMessages: [
          { direction: "OUTBOUND", text: "您好，我对这个岗位很感兴趣。" }
        ]
      },
      resumeUnlock: {
        unlocked: false,
        status: "RESUME_LOCKED_OR_UNKNOWN"
      },
      readOnly: {
        noRealBossAction: true,
        clicked: false,
        uploaded: false,
        submitted: false
      },
      page: {
        url: application.detailUrl,
        title: "BOSS chat"
      }
    }
  });
  const conversation = store.getConversations({ applicationId: application.id }).conversations[0];
  const state = conversation?.metadata?.communicationAssessment?.state;
  const nextAction = conversation?.metadata?.nextActionRecommendation?.action;
  return {
    ok: state === "WAITING_FOR_REPLY" && conversation.metadata.communicationAssessment.waitingForReply === true,
    state,
    nextAction
  };
}

async function runApiChecks(dataDir) {
  const port = 31000 + Math.floor(Math.random() * 1000);
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
    await requestJson(port, "POST", "/api/jobs/sync", createPayload());
    const applications = await requestJson(port, "GET", "/api/applications?limit=10");
    const application = applications.applications[0];
    await requestJson(port, "POST", `/api/applications/${application.id}/transition`, {
      toStatus: "SCORED",
      eventType: "SCREENING_COMPLETED",
      reason: "m8_api_seed",
      ...operatorTransitionEvidence("m8 api score seed", "m8:api:scored")
    });
    await requestJson(port, "POST", `/api/applications/${application.id}/transition`, {
      toStatus: "SHORTLISTED",
      eventType: "SCREENING_SHORTLISTED",
      reason: "m8_api_seed",
      ...operatorTransitionEvidence("m8 api shortlist seed", "m8:api:shortlisted")
    });
    await requestJson(port, "POST", `/api/applications/${application.id}/transition`, {
      toStatus: "GREETING_READY",
      eventType: "GREETING_READY",
      reason: "m8_api_seed",
      ...operatorTransitionEvidence("m8 api greeting seed", "m8:api:greeting-ready")
    });
    const task = await requestJson(port, "POST", "/api/browser-tasks", {
      applicationId: application.id,
      taskType: "REFRESH_CONVERSATION",
      payload: {
        jobId: application.bossJobId,
        title: application.title,
        company: application.company,
        detailUrl: application.detailUrl,
        sourceUrl: application.detailUrl,
        readOnly: true
      }
    });
    const claim = await requestJson(port, "POST", "/api/browser-tasks/claim", {
      taskTypes: ["REFRESH_CONVERSATION"],
      sourceUrl: application.detailUrl
    });
    const transition = await requestJson(port, "POST", `/api/browser-tasks/${task.id}/transition`, {
      toStatus: "SUCCEEDED",
      result: {
        ok: true,
        taskType: "REFRESH_CONVERSATION",
        conversation: {
          chatOpened: true,
          status: "CHAT_OPENED",
          messageCount: 1,
          recentMessages: [
            { direction: "INBOUND", text: "please send your resume" }
          ]
        },
        resumeUnlock: {
          unlocked: false,
          status: "RESUME_LOCKED_OR_UNKNOWN"
        },
        readOnly: {
          noRealBossAction: true,
          clicked: false,
          uploaded: false,
          submitted: false
        },
        page: {
          url: application.detailUrl,
          title: "BOSS chat"
        }
      }
    });
    const conversations = await requestJson(port, "GET", `/api/conversations?applicationId=${application.id}&limit=10`);
    const messages = await requestJson(port, "GET", `/api/messages?applicationId=${application.id}&limit=10`);
    const after = await requestJson(port, "GET", "/api/applications?limit=10");
    const diagnostics = await requestJson(port, "GET", "/api/browser-tasks/diagnostics?limit=20");

    return {
      checks: {
        apiCreatesReadOnlyBrowserTask: task.taskType === "REFRESH_CONVERSATION" && task.payload.readOnly === true,
        apiClaimsReadOnlyTask: claim.claimed === true && claim.task.id === task.id,
        apiTransitionsReadOnlyTaskSucceeded: transition.toStatus === "SUCCEEDED" && transition.task.result.readOnly.clicked === false,
        apiListsConversations: conversations.totalConversations === 1
          && conversations.conversations[0]?.status === "CHAT_OPENED"
          && conversations.conversations[0]?.metadata?.lastResult?.conversation?.messageCount === 1,
        apiReturnsCommunicationAssessment: conversations.conversations[0]?.metadata?.communicationAssessment?.state === "RESUME_REQUESTED"
          && conversations.conversations[0]?.metadata?.communicationAssessment?.resumeRequested === true,
        apiReturnsNextActionRecommendation: conversations.conversations[0]?.metadata?.nextActionRecommendation?.action === "PREPARE_RESUME_UPLOAD_DRY_RUN"
          && conversations.conversations[0]?.metadata?.nextActionRecommendation?.noRealBossAction === true,
        apiArchivesReadOnlyMessages: messages.totalMessages === 1
          && messages.messages[0]?.channel === "boss_chat"
          && messages.messages[0]?.status === "CAPTURED",
        apiMovesGreetingReadyToChatOpened: after.applications[0]?.status === "CHAT_OPENED",
        apiDiagnosticsIncludeReadOnlyTask: diagnostics.recentTasks.some((item) => item.taskType === "REFRESH_CONVERSATION")
      },
      summary: {
        applicationId: application.id,
        taskId: task.id,
        finalStatus: after.applications[0]?.status,
        conversationCount: conversations.totalConversations,
        messageCount: messages.totalMessages
      }
    };
  } finally {
    server.kill();
    await waitForExit(server);
  }
}

function runWiringChecks() {
  const contentJs = read("extension/src/content.js");
  const optionsJs = read("extension/src/options.js");
  const backgroundJs = read("extension/src/background.js");
  const serverJs = read("server/src/server.js");
  const storeJs = read("server/src/sqlite-store.js");
  const packageJson = read("package.json");
  const docsReuse = read("docs/05_OPEN_SOURCE_REUSE.md");
  return {
    checks: {
      contentHandlesReadOnlyTasks: contentJs.includes('taskType === "REFRESH_CONVERSATION"')
        && contentJs.includes('taskType === "CHECK_RESUME_UNLOCK"')
        && contentJs.includes("runRefreshConversationTask")
        && contentJs.includes("runCheckResumeUnlockTask")
        && contentJs.includes("noRealBossAction")
        && contentJs.includes("uploaded: false")
        && contentJs.includes("submitted: false"),
      optionsCanQueueAndRunReadOnlyTasks: optionsJs.includes("queueReadOnlyBossTask")
        && optionsJs.includes('"REFRESH_CONVERSATION"')
        && optionsJs.includes('"CHECK_RESUME_UNLOCK"')
        && optionsJs.includes("runReadOnlyBossTask")
        && optionsJs.includes("GET_CONVERSATIONS")
        && optionsJs.includes("CREATE_BROWSER_TASK")
        && optionsJs.includes("RUN_BROWSER_TASK")
        && optionsJs.includes("TRANSITION_BROWSER_TASK"),
      backgroundAndServerExposeConversations: backgroundJs.includes('case "GET_CONVERSATIONS"')
        && backgroundJs.includes("/api/conversations")
        && serverJs.includes('url.pathname === "/api/conversations"')
        && storeJs.includes("getConversations(options")
        && storeJs.includes("countConversations"),
      storeAppliesReadOnlyTransitions: storeJs.includes("applySuccessfulBrowserTaskResult")
        && storeJs.includes('"REFRESH_CONVERSATION"')
        && storeJs.includes('"CHECK_RESUME_UNLOCK"')
        && storeJs.includes('"UPLOAD_RESUME"')
        && storeJs.includes("CHAT_OPENED")
        && storeJs.includes("RESUME_UNLOCKED")
        && storeJs.includes("readOnly: true"),
      storeArchivesReadOnlyConversationMessages: storeJs.includes("archiveConversationMessagesWithinTransaction")
        && storeJs.includes("normalizeConversationMessageSnapshots")
        && storeJs.includes('"boss_chat"')
        && storeJs.includes('"CAPTURED"'),
      storeAssessesCommunicationState: storeJs.includes("assessCommunicationWithinTransaction")
        && storeJs.includes("assessCommunicationState")
        && storeJs.includes("RESUME_REQUESTED")
        && storeJs.includes("WAITING_FOR_REPLY"),
      storeRecommendsNextConversationAction: storeJs.includes("recommendNextConversationAction")
        && storeJs.includes("PREPARE_RESUME_UPLOAD_DRY_RUN")
        && storeJs.includes("WAIT_FOR_REPLY")
        && storeJs.includes("blockedTaskTypes"),
      packageRunsThisSmoke: packageJson.includes("m8-read-only-conversation-smoke.js")
        && packageJson.includes("m8:read-only-conversation:smoke"),
      docsRecordM83ReuseCheck: docsReuse.includes("M8.3")
        && docsReuse.includes("REFRESH_CONVERSATION")
        && docsReuse.includes("CHECK_RESUME_UNLOCK")
    }
  };
}

function seedApplication(store) {
  store.syncJobs(createPayload());
  return store.getApplications().applications[0];
}

function seedApplicationTransition(store, applicationId, toStatus, eventType, reason) {
  return store.transitionApplication(applicationId, {
    toStatus,
    eventType,
    reason,
    ...operatorTransitionEvidence(`${reason} ${toStatus}`, `${reason}:${applicationId}:${toStatus}`)
  });
}

function operatorTransitionEvidence(rationale, idempotencyKey) {
  return {
    idempotencyKey,
    evidence: {
      type: "operator_override",
      actor: "m8-read-only-conversation-smoke",
      rationale
    }
  };
}

function createPayload() {
  return {
    source: "m8-read-only-conversation-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId: "m8-readonly-one",
        title: "AI Agent Workflow Engineer",
        company: "ReadOnly Co",
        salary: "25-35K",
        location: "Nanning",
        experience: "1-3 years",
        education: "Bachelor",
        recruiter: "Li",
        tags: ["Node.js", "Chrome Extension", "Workflow"],
        welfare: ["Five insurance"],
        detailUrl: "https://www.zhipin.com/job_detail/m8-readonly-one.html",
        sourceUrl: "https://www.zhipin.com/web/geek/jobs?query=agent",
        description: "Build browser task workflow and local-first agent pipeline. Requires Node.js, SQLite, Chrome extension, and process automation experience. ".repeat(3)
      }
    ]
  };
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
