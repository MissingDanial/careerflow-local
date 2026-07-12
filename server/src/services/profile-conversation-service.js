"use strict";

const {
  AGENT_VERSION,
  PROMPT_VERSION,
  runProfileConversationAgent
} = require("../profile-conversation-agent");
const { loadModelConfig } = require("../model-client");
const { httpError, structuredError, summarizeProfileForTrace } = require("../server-utils");

function createProfileConversationService(options = {}) {
  const { store } = options;
  const runAgent = options.runAgent || runProfileConversationAgent;
  if (!store) {
    throw new Error("ProfileConversationService requires a store");
  }

  return {
    createSession(payload = {}) {
      const session = store.createProfileDialogSession({
        title: payload.title,
        modelConfig: publicModelConfig(payload.modelConfig || {})
      });
      store.recordWorkflowEvent({
        sourceType: "profile_dialog_session",
        sourceId: session.id,
        eventType: "PROFILE_DIALOG_SESSION_CREATED",
        severity: "info",
        status: "SUCCEEDED",
        progressCurrent: 0,
        progressTotal: 1,
        message: `ProfileAgent dialog session ${session.id} created.`,
        metadata: {
          sessionId: session.id,
          noProfileFactMutation: true
        }
      });
      return {
        ok: true,
        storage: "sqlite",
        session
      };
    },

    listSessions(query = {}) {
      return {
        ok: true,
        ...store.getProfileDialogSessions(query)
      };
    },

    getSession(sessionId, query = {}) {
      const messages = store.getProfileDialogMessages(sessionId, {
        limit: query.messageLimit || query.limit || 80
      });
      const pendingDrafts = store.getProfileFactDrafts({
        status: "PENDING",
        sourceSessionId: sessionId,
        limit: query.draftLimit || 100
      });
      return {
        ok: true,
        storage: "sqlite",
        session: messages.session,
        messages: messages.messages,
        totalMessages: messages.totalMessages,
        pendingDrafts: pendingDrafts.drafts,
        pendingDraftCount: pendingDrafts.totalDrafts
      };
    },

    async sendMessage(sessionId, payload = {}) {
      const session = store.getProfileDialogSession(sessionId);
      if (session.status !== "OPEN") {
        throw serviceError(409, "PROFILE_DIALOG_SESSION_CLOSED", "Only OPEN ProfileAgent sessions accept messages", {
          sessionId: session.id
        });
      }
      const content = cleanMultiline(payload.content || payload.message || "");
      if (!content) {
        throw serviceError(400, "PROFILE_DIALOG_MESSAGE_REQUIRED", "ProfileAgent message content is required", {
          sessionId: session.id
        });
      }
      const userMessage = store.createProfileDialogMessage(session.id, {
        role: "user",
        status: "COMPLETED",
        content
      });
      return executeTurn({
        store,
        runAgent,
        session,
        userMessage,
        payload
      });
    },

    async retryMessage(sessionId, messageId, payload = {}) {
      const session = store.getProfileDialogSession(sessionId);
      const userMessage = store.getProfileDialogMessage(messageId);
      if (userMessage.sessionId !== session.id || userMessage.role !== "user") {
        throw serviceError(400, "PROFILE_DIALOG_RETRY_TARGET_INVALID", "Retry requires a user message from this session", {
          sessionId: session.id,
          messageId: userMessage.id
        });
      }
      if (session.status !== "OPEN") {
        throw serviceError(409, "PROFILE_DIALOG_SESSION_CLOSED", "Only OPEN ProfileAgent sessions can retry messages", {
          sessionId: session.id,
          messageId: userMessage.id
        });
      }
      return executeTurn({
        store,
        runAgent,
        session,
        userMessage,
        payload: {
          ...payload,
          retryOfMessageId: userMessage.id
        }
      });
    }
  };
}

async function executeTurn({ store, runAgent, session, userMessage, payload }) {
  const profileBundle = store.getProfile();
  const recentMessages = store.getProfileDialogMessages(session.id, { limit: 16 }).messages;
  const requestedModelConfig = publicModelConfig(loadModelConfig(payload.modelConfig || {}));
  const agentRun = store.startAgentRun({
    agentName: "ProfileConversationAgent",
    step: "profile_dialog_turn",
    provider: "llm",
    input: {
      sessionId: session.id,
      userMessageId: userMessage.id,
      retryOfMessageId: payload.retryOfMessageId || null,
      profileSummary: summarizeProfileForTrace(profileBundle),
      recentMessageCount: recentMessages.length,
      pendingFactDraftCount: Array.isArray(profileBundle.pendingFactDrafts) ? profileBundle.pendingFactDrafts.length : 0
    },
    promptVersion: PROMPT_VERSION,
    agentVersion: AGENT_VERSION,
    modelConfig: requestedModelConfig
  });

  try {
    const agentResult = await runAgent({
      profileBundle,
      session,
      recentMessages,
      userMessage
    }, {
      modelConfig: payload.modelConfig || {}
    });
    const assistantMessage = store.createProfileDialogMessage(session.id, {
      role: "assistant",
      status: "COMPLETED",
      content: agentResult.result.assistantReply,
      structured: {
        followupQuestions: agentResult.result.followupQuestions,
        conflicts: agentResult.result.conflicts,
        sessionSummaryPatch: agentResult.result.sessionSummaryPatch,
        proposedDraftCount: agentResult.result.factDrafts.length,
        promptVersion: agentResult.promptVersion,
        agentVersion: agentResult.agentVersion
      },
      retryOfMessageId: payload.retryOfMessageId || null,
      agentRunId: agentRun.id
    });
    const draftResult = store.createProfileFactDrafts({
      sourceSessionId: session.id,
      sourceMessageId: userMessage.id,
      drafts: agentResult.result.factDrafts.map((draft) => ({
        ...draft,
        metadata: {
          ...draft.metadata,
          sessionId: session.id,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
          agentRunId: agentRun.id,
          pendingUntilUserConfirmation: true
        }
      })),
      summary: {
        source: "profile_dialog_llm",
        sessionId: session.id,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id
      }
    });
    const updatedSession = store.updateProfileDialogSession(session.id, {
      title: session.messageCount === 0 ? makeSessionTitle(userMessage.content) : session.title,
      summary: mergeSummary(session.summary, agentResult.result.sessionSummaryPatch),
      openQuestions: agentResult.result.followupQuestions,
      conflicts: agentResult.result.conflicts,
      modelConfig: agentResult.modelConfig
    });
    const finishedRun = store.finishAgentRun(agentRun.id, {
      status: "SUCCEEDED",
      provider: agentResult.provider,
      output: {
        sessionId: session.id,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        proposedDraftCount: agentResult.result.factDrafts.length,
        createdDraftCount: draftResult.created,
        skippedDraftCount: draftResult.skipped,
        followupQuestionCount: agentResult.result.followupQuestions.length,
        conflictCount: agentResult.result.conflicts.length
      },
      fallbackUsed: false,
      promptVersion: agentResult.promptVersion,
      agentVersion: agentResult.agentVersion,
      modelConfig: agentResult.modelConfig
    });
    store.recordWorkflowEvent({
      sourceType: "profile_dialog_session",
      sourceId: session.id,
      eventType: "PROFILE_DIALOG_TURN_COMPLETED",
      severity: agentResult.result.conflicts.length ? "warning" : "info",
      status: "SUCCEEDED",
      progressCurrent: 1,
      progressTotal: 1,
      message: `ProfileAgent completed dialog turn for session ${session.id}.`,
      errorCode: agentResult.result.conflicts.length ? "PROFILE_DIALOG_CONFLICTS_REQUIRE_REVIEW" : "",
      errorMessage: agentResult.result.conflicts.length
        ? `${agentResult.result.conflicts.length} profile conflict(s) require user review.`
        : "",
      metadata: {
        sessionId: session.id,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        agentRunId: finishedRun.id,
        createdDraftCount: draftResult.created,
        skippedDraftCount: draftResult.skipped,
        pendingUntilUserConfirmation: true,
        noConfirmedProfileMutation: true
      }
    });
    return {
      ok: true,
      storage: "sqlite",
      session: updatedSession,
      userMessage,
      assistantMessage,
      drafts: draftResult.drafts,
      createdDraftCount: draftResult.created,
      skippedDraftCount: draftResult.skipped,
      followupQuestions: agentResult.result.followupQuestions,
      conflicts: agentResult.result.conflicts,
      agentRun: finishedRun,
      modelConfig: agentResult.modelConfig
    };
  } catch (error) {
    const finishedRun = store.finishAgentRun(agentRun.id, {
      status: "FAILED",
      provider: "llm",
      output: {
        sessionId: session.id,
        userMessageId: userMessage.id,
        error: structuredError(error)
      },
      errorCode: error.code || "PROFILE_CONVERSATION_AGENT_FAILED",
      errorMessage: error.message || String(error),
      fallbackUsed: false,
      promptVersion: PROMPT_VERSION,
      agentVersion: AGENT_VERSION,
      modelConfig: requestedModelConfig
    });
    const failedAssistantMessage = store.createProfileDialogMessage(session.id, {
      role: "assistant",
      status: "FAILED",
      content: "",
      errorCode: error.code || "PROFILE_CONVERSATION_AGENT_FAILED",
      errorMessage: error.message || String(error),
      retryOfMessageId: userMessage.id,
      agentRunId: finishedRun.id,
      structured: {
        retryable: error.retryable !== false,
        userMessagePersisted: true
      }
    });
    store.recordWorkflowEvent({
      sourceType: "profile_dialog_session",
      sourceId: session.id,
      eventType: "PROFILE_DIALOG_TURN_FAILED",
      severity: "error",
      status: "FAILED",
      progressCurrent: 0,
      progressTotal: 1,
      message: `ProfileAgent dialog turn failed for session ${session.id}; the user message was preserved.`,
      errorCode: error.code || "PROFILE_CONVERSATION_AGENT_FAILED",
      errorMessage: error.message || String(error),
      metadata: {
        sessionId: session.id,
        userMessageId: userMessage.id,
        failedAssistantMessageId: failedAssistantMessage.id,
        agentRunId: finishedRun.id,
        retryable: error.retryable !== false,
        userMessagePersisted: true,
        fallbackUsed: false
      }
    });
    throw serviceError(502, error.code || "PROFILE_CONVERSATION_AGENT_FAILED", error.message || String(error), {
      sessionId: session.id,
      userMessageId: userMessage.id,
      failedAssistantMessageId: failedAssistantMessage.id,
      retryable: error.retryable !== false,
      userMessagePersisted: true
    });
  }
}

function mergeSummary(current, patch) {
  const left = current && typeof current === "object" && !Array.isArray(current) ? current : {};
  const right = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
  const result = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (Array.isArray(value)) {
      result[key] = Array.from(new Set([
        ...(Array.isArray(left[key]) ? left[key] : []),
        ...value
      ].map((item) => cleanMultiline(item)).filter(Boolean))).slice(0, 40);
    } else if (value && typeof value === "object") {
      result[key] = mergeSummary(left[key], value);
    } else if (value !== "" && value !== null && value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function makeSessionTitle(content) {
  const title = cleanText(content).slice(0, 42);
  return title || "职业经历复盘";
}

function publicModelConfig(config = {}) {
  return {
    configured: Boolean(config.configured || (config.apiKey && config.baseUrl && config.model)),
    baseUrl: config.baseUrl || "",
    model: config.model || "",
    wireApi: config.wireApi || "",
    reasoningEffort: config.reasoningEffort || "",
    source: config.source || ""
  };
}

function serviceError(statusCode, code, message, context = {}) {
  const error = httpError(statusCode, message);
  error.code = code;
  error.context = context;
  return error;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanMultiline(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

module.exports = {
  createProfileConversationService,
  mergeSummary
};
