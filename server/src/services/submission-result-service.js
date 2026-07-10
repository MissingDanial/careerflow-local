const EVIDENCE_VERSION = "m12.submission-evidence.v1";

const RESULT_STATUSES = new Set([
  "MANUAL_SUBMISSION_CONFIRMED",
  "GREETING_SENT_CONFIRMED",
  "RESUME_UPLOAD_CONFIRMED",
  "BLOCKED_BY_BOSS",
  "NEEDS_USER_ACTION",
  "UNKNOWN"
]);

function createSubmissionResultService({ store }) {
  if (!store) {
    throw new Error("SubmissionResultService requires a store");
  }

  return {
    getEvidence(applicationId, options = {}) {
      const events = getEvidenceEvents(store, applicationId, options.limit || 20);
      return {
        ok: true,
        storage: "sqlite",
        applicationId: number(applicationId),
        totalEvidence: events.length,
        latestEvidence: events[0] || null,
        evidence: events
      };
    },

    recordEvidence(applicationId, input = {}) {
      const evidence = normalizeEvidenceInput(input);
      const assessment = assessSubmissionEvidence(evidence);
      const event = store.recordWorkflowEvent({
        applicationId,
        sourceType: "workflow",
        eventType: "SUBMISSION_EVIDENCE_RECORDED",
        severity: assessment.resultStatus === "BLOCKED_BY_BOSS" || assessment.resultStatus === "NEEDS_USER_ACTION" ? "warning" : "info",
        status: assessment.resultStatus,
        progressCurrent: assessment.confirmed ? 1 : 0,
        progressTotal: 1,
        message: `Submission evidence recorded for application ${applicationId}: ${assessment.resultStatus}.`,
        errorCode: assessment.resultStatus === "BLOCKED_BY_BOSS" ? "BOSS_SUBMISSION_BLOCKED" : "",
        errorMessage: assessment.blockers.join(", "),
        metadata: {
          version: EVIDENCE_VERSION,
          evidence,
          assessment,
          noRealBossAction: true,
          noBrowserTaskCreated: true,
          createsBrowserTasks: false,
          realActionsBlocked: ["SEND_GREETING_REAL", "UPLOAD_RESUME_REAL", "SUBMIT_APPLICATION_REAL"]
        }
      });
      return {
        ok: true,
        storage: "sqlite",
        persisted: true,
        workflowEvent: event,
        evidence,
        assessment,
        applicationStatusChanged: false,
        noRealBossAction: true,
        noBrowserTaskCreated: true,
        createsBrowserTasks: false
      };
    }
  };
}

function getEvidenceEvents(store, applicationId, limit) {
  if (!store || typeof store.getWorkflowEvents !== "function") {
    return [];
  }
  const events = store.getWorkflowEvents({
    applicationId,
    limit: Math.max(1, Math.min(100, Number(limit) || 20))
  }).events || [];
  return events.filter((event) => event.eventType === "SUBMISSION_EVIDENCE_RECORDED");
}

function normalizeEvidenceInput(input = {}) {
  const pageResult = isPlainObject(input.pageResult) ? input.pageResult : {};
  const manualEvidence = isPlainObject(input.manualEvidence) ? input.manualEvidence : {};
  const notes = cleanText(input.notes || input.note || manualEvidence.notes || "");
  return {
    source: cleanText(input.source || pageResult.source || "manual"),
    evidenceType: cleanText(input.evidenceType || input.type || "manual_or_readonly_page"),
    notes,
    pageUrl: cleanText(input.pageUrl || pageResult.pageUrl || pageResult.page?.url || ""),
    pageTitle: cleanText(input.pageTitle || pageResult.pageTitle || pageResult.page?.title || ""),
    screenshotPath: cleanText(input.screenshotPath || manualEvidence.screenshotPath || ""),
    userDecision: normalizeResultStatus(input.userDecision || input.resultStatus || ""),
    pageResult: sanitizePageResult(pageResult),
    manualEvidence: {
      text: cleanMultiline(input.evidenceText || manualEvidence.text || ""),
      url: cleanText(input.evidenceUrl || manualEvidence.url || ""),
      noRealBossAction: true
    },
    recordedBy: cleanText(input.recordedBy || input.reviewer || "user"),
    recordedAt: new Date().toISOString(),
    noRealBossAction: true,
    noBrowserTaskCreated: true,
    createsBrowserTasks: false
  };
}

function sanitizePageResult(pageResult = {}) {
  return {
    ok: pageResult.ok !== false,
    resultStatus: normalizeResultStatus(pageResult.resultStatus || ""),
    confidence: normalizeConfidence(pageResult.confidence),
    signals: Array.isArray(pageResult.signals) ? pageResult.signals.map(cleanText).filter(Boolean).slice(0, 30) : [],
    blockers: Array.isArray(pageResult.blockers) ? pageResult.blockers.map(cleanText).filter(Boolean).slice(0, 20) : [],
    pageTextSample: cleanText(pageResult.pageTextSample || "").slice(0, 800),
    conversation: isPlainObject(pageResult.conversation) ? pageResult.conversation : null,
    resumeUnlock: isPlainObject(pageResult.resumeUnlock) ? pageResult.resumeUnlock : null,
    uploadDryRun: isPlainObject(pageResult.uploadDryRun) ? pageResult.uploadDryRun : null,
    submitDryRun: isPlainObject(pageResult.submitDryRun) ? pageResult.submitDryRun : null,
    readOnly: {
      noRealBossAction: true,
      clicked: false,
      uploaded: false,
      submitted: false
    }
  };
}

function assessSubmissionEvidence(evidence = {}) {
  const pageStatus = normalizeResultStatus(evidence.pageResult?.resultStatus || "");
  const userDecision = normalizeResultStatus(evidence.userDecision || "");
  const resultStatus = userDecision || pageStatus || inferResultStatusFromEvidence(evidence);
  const blockers = [
    ...(evidence.pageResult?.blockers || []),
    ...(resultStatus === "UNKNOWN" ? ["result_unknown"] : [])
  ].filter(Boolean);
  const confidence = Math.max(
    normalizeConfidence(evidence.pageResult?.confidence),
    userDecision ? 0.95 : 0,
    resultStatus === "UNKNOWN" ? 0.2 : 0.7
  );
  return {
    resultStatus,
    confirmed: ["MANUAL_SUBMISSION_CONFIRMED", "GREETING_SENT_CONFIRMED", "RESUME_UPLOAD_CONFIRMED"].includes(resultStatus),
    needsUserAction: resultStatus === "NEEDS_USER_ACTION",
    blocked: resultStatus === "BLOCKED_BY_BOSS",
    blockers,
    confidence,
    noApplicationStatusChange: true,
    noRealBossAction: true,
    noBrowserTaskCreated: true
  };
}

function inferResultStatusFromEvidenceLegacy(evidence = {}) {
  const textValue = [
    evidence.notes,
    evidence.manualEvidence?.text,
    evidence.pageResult?.pageTextSample,
    ...(evidence.pageResult?.signals || [])
  ].join(" ");
  if (/已投递|投递成功|简历已投递|已提交|申请成功|已发送简历/.test(textValue)) {
    return "MANUAL_SUBMISSION_CONFIRMED";
  }
  if (/已发送|消息已发送|沟通中|继续沟通|立即沟通/.test(textValue)) {
    return "GREETING_SENT_CONFIRMED";
  }
  if (/简历已上传|上传成功|附件已上传/.test(textValue)) {
    return "RESUME_UPLOAD_CONFIRMED";
  }
  if (/验证码|安全验证|登录|职位关闭|停止招聘|已下线|异常访问|访问过于频繁/.test(textValue)) {
    return "BLOCKED_BY_BOSS";
  }
  if (/待确认|需要手动|请选择|请上传|请完善/.test(textValue)) {
    return "NEEDS_USER_ACTION";
  }
  return "UNKNOWN";
}

function inferResultStatusFromEvidence(evidence = {}) {
  const signals = Array.isArray(evidence.pageResult?.signals) ? evidence.pageResult.signals : [];
  if (signals.includes("submitted_signal_visible")) {
    return "MANUAL_SUBMISSION_CONFIRMED";
  }
  if (signals.includes("greeting_or_chat_signal_visible") || signals.includes("conversation_messages_visible")) {
    return "GREETING_SENT_CONFIRMED";
  }
  if (signals.includes("resume_upload_signal_visible")) {
    return "RESUME_UPLOAD_CONFIRMED";
  }
  if (
    signals.includes("security_check_signal_visible")
    || signals.includes("login_required_signal_visible")
    || signals.includes("job_closed_signal_visible")
    || (evidence.pageResult?.blockers || []).some((item) => ["LOGIN_REQUIRED", "SECURITY_CHECK", "JOB_CLOSED"].includes(item))
  ) {
    return "BLOCKED_BY_BOSS";
  }
  const textValue = [
    evidence.notes,
    evidence.manualEvidence?.text,
    evidence.pageResult?.pageTextSample
  ].join(" ");
  if (/(\u5df2\u6295\u9012|\u6295\u9012\u6210\u529f|\u7b80\u5386\u5df2\u6295\u9012|\u5df2\u63d0\u4ea4|\u7533\u8bf7\u6210\u529f|\u5df2\u53d1\u9001\u7b80\u5386|submitted|application sent|resume sent)/i.test(textValue)) {
    return "MANUAL_SUBMISSION_CONFIRMED";
  }
  if (/(\u5df2\u53d1\u9001|\u6d88\u606f\u5df2\u53d1\u9001|\u6c9f\u901a\u4e2d|\u7ee7\u7eed\u6c9f\u901a|\u7acb\u5373\u6c9f\u901a|message sent|chatting)/i.test(textValue)) {
    return "GREETING_SENT_CONFIRMED";
  }
  if (/(\u7b80\u5386\u5df2\u4e0a\u4f20|\u4e0a\u4f20\u6210\u529f|\u9644\u4ef6\u5df2\u4e0a\u4f20|\u91cd\u65b0\u4e0a\u4f20|upload success|resume uploaded)/i.test(textValue)) {
    return "RESUME_UPLOAD_CONFIRMED";
  }
  if (/(\u767b\u5f55|\u9a8c\u8bc1\u7801|\u5b89\u5168\u9a8c\u8bc1|\u804c\u4f4d\u5173\u95ed|\u505c\u6b62\u62db\u8058|\u5df2\u4e0b\u7ebf|login|captcha|security check|job closed)/i.test(textValue)) {
    return "BLOCKED_BY_BOSS";
  }
  if (/(\u5f85\u786e\u8ba4|\u9700\u8981\u624b\u52a8|\u8bf7\u9009\u62e9|\u8bf7\u4e0a\u4f20|\u8bf7\u5b8c\u6210|needs user action)/i.test(textValue)) {
    return "NEEDS_USER_ACTION";
  }
  return "UNKNOWN";
}

function normalizeResultStatus(value) {
  const status = cleanText(value).toUpperCase();
  return RESULT_STATUSES.has(status) ? status : "";
}

function normalizeConfidence(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(1, parsed));
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanMultiline(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
}

module.exports = {
  EVIDENCE_VERSION,
  createSubmissionResultService,
  assessSubmissionEvidence
};
