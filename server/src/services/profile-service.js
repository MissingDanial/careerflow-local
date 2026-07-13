const {
  buildCareerContext,
  readCareerContextFile,
  writeCareerContextFile
} = require("../profile-agent");
const {
  httpError,
  structuredError,
  summarizeProfileForTrace
} = require("../server-utils");

function createProfileService({ store, dataDir }) {
  if (!store) {
    throw new Error("ProfileService requires a store");
  }

  return {
    readCareerContext() {
      const fileContext = readCareerContextFile({ dataDir });
      const contextVersion = store.getLatestProfileContextVersion();
      const versionIsNewer = contextVersion?.id
        && (!fileContext.exists || Date.parse(contextVersion.createdAt || 0) > Date.parse(fileContext.updatedAt || 0));
      const careerContext = versionIsNewer
        ? {
          ...fileContext,
          exists: true,
          markdown: contextVersion.markdown,
          bytes: Buffer.byteLength(contextVersion.markdown, "utf8"),
          updatedAt: contextVersion.createdAt,
          persistenceSource: "sqlite_version"
        }
        : {
          ...fileContext,
          persistenceSource: fileContext.exists ? "file" : "missing"
        };
      return {
        ok: true,
        storage: "file",
        careerContext,
        contextVersion,
        freshness: contextVersion
          ? store.getProfileContextVersionFreshness(contextVersion)
          : store.getCareerContextFreshness(careerContext.updatedAt)
      };
    },

    async generateCareerContext(payload = {}) {
      const profileBundle = store.getProfile();
      const resumeSource = payload.resumeSourceId || payload.sourceId
        ? store.getResumeSource(Number(payload.resumeSourceId || payload.sourceId))
        : null;
      const agentRun = store.startAgentRun({
        agentName: "ProfileAgent",
        step: "generate_career_context",
        provider: "rules",
        input: {
          resumeSourceId: resumeSource?.id || profileBundle.resumeSources?.[0]?.id || null,
          profileSummary: summarizeProfileForTrace(profileBundle),
          pendingFactDraftCount: Array.isArray(profileBundle.pendingFactDrafts) ? profileBundle.pendingFactDrafts.length : 0,
          answerCount: Array.isArray(payload.answers) ? payload.answers.length : payload.answers && typeof payload.answers === "object" ? Object.keys(payload.answers).length : 0,
          writeFile: payload.writeFile !== false
        }
      });

      try {
        const agentResult = buildCareerContext({
          profileBundle,
          resumeSource,
          answers: payload.answers || {}
        });
        let file = null;
        if (payload.writeFile !== false) {
          file = writeCareerContextFile(agentResult.result.markdown, { dataDir });
        }
        const contextVersion = store.createProfileContextVersion({
          sourceSessionId: payload.sourceSessionId || payload.sessionId || 0,
          sourceMessageId: payload.sourceMessageId || payload.messageId || 0,
          structured: agentResult.result.context,
          markdown: agentResult.result.markdown
        });
        const output = {
          summary: agentResult.result.summary,
          missingQuestions: agentResult.result.missingQuestions,
          file,
          contextVersionId: contextVersion.id,
          profileHash: contextVersion.profileHash,
          contentHash: contextVersion.contentHash,
          markdownLength: agentResult.result.markdown.length
        };
        const finishedRun = store.finishAgentRun(agentRun.id, {
          status: "SUCCEEDED",
          provider: agentResult.provider,
          output,
          fallbackUsed: agentResult.fallbackUsed
        });
        store.recordWorkflowEvent({
          sourceType: "agent_run",
          sourceId: finishedRun.id,
          eventType: "CAREER_CONTEXT_GENERATED",
          severity: agentResult.result.missingQuestions.length ? "warning" : "info",
          status: "SUCCEEDED",
          progressCurrent: 1,
          progressTotal: 1,
          message: file
            ? `ProfileAgent generated career context at ${file.filePath}.`
            : "ProfileAgent generated career context without writing a file.",
          errorCode: agentResult.result.missingQuestions.length ? "CAREER_CONTEXT_HAS_OPEN_QUESTIONS" : "",
          errorMessage: agentResult.result.missingQuestions.length
            ? `${agentResult.result.missingQuestions.length} question(s) still need user confirmation.`
            : "",
          metadata: {
            summary: agentResult.result.summary,
            file,
            contextVersion,
            pendingFactsRemainPending: true
          }
        });
        return {
          ok: true,
          storage: "file",
          agentRun: finishedRun,
          careerContext: {
            context: agentResult.result.context,
            markdown: agentResult.result.markdown,
            file,
            contextVersion
          },
          contextVersion,
          freshness: store.getProfileContextVersionFreshness(contextVersion),
          missingQuestions: agentResult.result.missingQuestions
        };
      } catch (error) {
        const finishedRun = store.finishAgentRun(agentRun.id, {
          status: "FAILED",
          provider: "rules",
          output: {
            error: structuredError(error)
          },
          errorCode: error.code || "PROFILE_AGENT_FAILED",
          errorMessage: error.message || String(error)
        });
        store.recordWorkflowEvent({
          sourceType: "agent_run",
          sourceId: finishedRun.id,
          eventType: "CAREER_CONTEXT_FAILED",
          severity: "error",
          status: "FAILED",
          progressCurrent: 0,
          progressTotal: 1,
          message: "ProfileAgent failed to generate career context.",
          errorCode: error.code || "PROFILE_AGENT_FAILED",
          errorMessage: error.message || String(error),
          metadata: {
            error: structuredError(error)
          }
        });
        const httpErrorObject = httpError(502, error.message || "ProfileAgent failed");
        httpErrorObject.code = error.code || "PROFILE_AGENT_FAILED";
        throw httpErrorObject;
      }
    },

    generateFactDraftsFromCareerContext(payload = {}) {
      const answers = normalizeCareerContextAnswers(payload.answers || []);
      const drafts = buildFactDraftsFromAnswers(answers, payload);
      const created = store.createProfileFactDrafts({
        resumeSourceId: payload.resumeSourceId || payload.sourceId || 0,
        drafts,
        summary: {
          source: "career_context_answers",
          answerCount: answers.length,
          draftCount: drafts.length
        }
      });
      store.recordWorkflowEvent({
        sourceType: "api",
        sourceId: 0,
        eventType: "PROFILE_FACT_DRAFTS_GENERATED",
        severity: created.created ? "info" : "warning",
        status: "SUCCEEDED",
        progressCurrent: created.created,
        progressTotal: drafts.length,
        message: created.created
          ? `Generated ${created.created} profile fact draft(s) from ProfileAgent answers.`
          : "No new profile fact drafts were generated from ProfileAgent answers.",
        errorCode: created.created ? "" : "PROFILE_FACT_DRAFTS_EMPTY_OR_DUPLICATE",
        errorMessage: created.created ? "" : "Answers were empty, unsupported, or duplicate existing pending/confirmed drafts.",
        metadata: {
          source: "career_context_answers",
          answerCount: answers.length,
          requestedDraftCount: drafts.length,
          created: created.created,
          skipped: created.skipped,
          pendingUntilUserConfirmation: true
        }
      });
      return {
        ok: true,
        storage: "sqlite",
        source: "career_context_answers",
        answers,
        created: created.created,
        skipped: created.skipped,
        drafts: created.drafts,
        summary: created.summary
      };
    }
  };
}

function normalizeCareerContextAnswers(value) {
  const entries = Array.isArray(value)
    ? value
    : Object.entries(value && typeof value === "object" ? value : {}).map(([id, answer]) => ({ id, answer }));
  return entries
    .map((item, index) => ({
      id: cleanToken(item?.id || item?.questionId || `answer_${index + 1}`),
      prompt: cleanMultiline(item?.prompt || item?.question || ""),
      answer: cleanMultiline(item?.answer || item?.content || item?.value || "")
    }))
    .filter((item) => item.id && item.answer)
    .slice(0, 50);
}

function buildFactDraftsFromAnswers(answers, payload = {}) {
  const drafts = [];
  for (const answer of answers) {
    const answerDrafts = buildDraftsForAnswer(answer, payload);
    drafts.push(...answerDrafts);
  }
  return drafts.slice(0, 80);
}

function buildDraftsForAnswer(answer, payload = {}) {
  const text = answer.answer;
  const id = answer.id;
  const lowerId = id.toLowerCase();
  const evidenceText = [
    answer.prompt ? `Q: ${answer.prompt}` : "",
    `A: ${text}`
  ].filter(Boolean).join("\n");
  const metadata = {
    generator: "profile-service-career-context-answer",
    questionId: id,
    prompt: answer.prompt || "",
    source: "career_context_answers"
  };

  if (/excluded|risk|direction|不想|排斥|销售|直播/.test(`${lowerId} ${text}`)) {
    return splitAnswerList(text).map((item) => ({
      draftType: "constraint",
      title: `排斥方向：${item}`,
      confidence: "needs_review",
      evidenceText,
      content: {
        ruleType: "excluded_direction",
        content: item,
        severity: "blocker",
        metadata: {
          sourceQuestionId: id
        }
      },
      metadata
    }));
  }

  if (/skill|技能|能力/.test(lowerId)) {
    return splitAnswerList(text).map((item) => ({
      draftType: "skill",
      title: item,
      confidence: "needs_review",
      evidenceText,
      content: {
        name: item,
        category: inferSkillCategory(item),
        proficiency: "familiar",
        evidence: [`career_context_answer:${id}`]
      },
      metadata
    }));
  }

  if (/target_roles|role|岗位|方向/.test(lowerId)) {
    return [{
      draftType: "constraint",
      title: "目标岗位方向",
      confidence: "needs_review",
      evidenceText,
      content: {
        ruleType: "target_role",
        content: text,
        severity: "preference",
        metadata: {
          sourceQuestionId: id
        }
      },
      metadata
    }];
  }

  const title = inferExperienceTitle(answer, payload);
  return [{
    draftType: "experience",
    title,
    confidence: "needs_review",
    evidenceText,
    content: {
      kind: inferExperienceKind(id),
      title,
      organization: "",
      role: "",
      startDate: "",
      endDate: "",
      facts: splitAnswerFacts(text),
      skills: extractInlineSkills(text),
      evidenceSource: `career_context_answer:${id}`,
      confidence: "needs_review",
      allowedRewrites: ["用户确认后可改写表达和调整顺序"],
      forbiddenClaims: ["未确认前不得用于投递简历", "不得新增回答中没有支持的事实"]
    },
    metadata
  }];
}

function inferExperienceTitle(answer, payload = {}) {
  const titleFromMetadata = cleanText(payload.title || payload.targetDraftTitle || "");
  if (titleFromMetadata) {
    return titleFromMetadata;
  }
  const promptMatch = String(answer.prompt || "").match(/「([^」]{2,80})」/);
  if (promptMatch) {
    return cleanText(promptMatch[1]);
  }
  const firstSentence = splitAnswerFacts(answer.answer)[0] || answer.id;
  return cleanText(firstSentence).slice(0, 80) || "ProfileAgent 回答补充经历";
}

function inferExperienceKind(id) {
  const text = String(id || "").toLowerCase();
  if (/education|学历|学校/.test(text)) {
    return "education";
  }
  if (/work|intern|实习|工作/.test(text)) {
    return "work";
  }
  if (/award|honor|奖/.test(text)) {
    return "award";
  }
  return "project";
}

function splitAnswerFacts(value) {
  return String(value || "")
    .split(/[\n；;。]+/)
    .map((item) => cleanText(item.replace(/^[-*•\d.、\s]+/, "")))
    .filter(Boolean)
    .slice(0, 10);
}

function splitAnswerList(value) {
  return String(value || "")
    .split(/[\n,，、；;]+/)
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 20);
}

function extractInlineSkills(value) {
  const known = [
    "JavaScript", "TypeScript", "Node.js", "React", "Vue", "Python", "FastAPI", "Flask",
    "SQLite", "PostgreSQL", "MySQL", "Redis", "Docker", "Git", "Chrome Extension",
    "Playwright", "LangChain", "LangGraph", "OpenAI", "Prompt Engineering", "RAG",
    "用户调研", "需求分析", "竞品分析", "原型设计", "产品设计", "数据分析", "项目管理"
  ];
  const text = String(value || "").toLowerCase();
  return known.filter((skill) => text.includes(skill.toLowerCase())).slice(0, 12);
}

function inferSkillCategory(skill) {
  const text = String(skill || "").toLowerCase();
  if (/node|javascript|typescript|react|vue|python|sqlite|postgres|mysql|docker|git|playwright|langchain|langgraph/.test(text)) {
    return "engineering";
  }
  if (/用户|需求|竞品|原型|产品|项目|数据|figma|axure/.test(text)) {
    return "product";
  }
  return "general";
}

function cleanToken(value) {
  return String(value || "").replace(/\s+/g, "_").trim();
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanMultiline(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map(cleanText)
    .filter(Boolean)
    .join("\n");
}

module.exports = {
  createProfileService
};
