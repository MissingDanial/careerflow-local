const http = require("http");
const path = require("path");
const { createJobStore } = require("./sqlite-store");
const { extractResumeSource } = require("./resume-extractor");
const { generateProfileFactDrafts } = require("./profile-draft-generator");
const { runScreeningAgent } = require("./screening-agent");
const { evaluateJobRiskGate } = require("./job-risk-gate");
const { runResumeAgent } = require("./resume-agent");
const { runAuditAgent } = require("./audit-agent");
const { runResumeFitEvaluator } = require("./resume-fit-evaluator");
const { runClaimVerifier } = require("./claim-verifier");
const { runResumeRevisionAgent } = require("./resume-revision-agent");
const { runMessageAgent } = require("./message-agent");
const { renderResumeDocx } = require("./document-renderer");
const { planApplicationWorkflow } = require("./workflow-orchestrator");
const { createProfileService } = require("./services/profile-service");
const { createResumeWorkflowService } = require("./services/resume-workflow-service");
const {
  httpError,
  structuredError,
  summarizeProfileForTrace
} = require("./server-utils");

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const REQUIRED_TOKEN = process.env.BOSS_SYNC_TOKEN || "";
const DATA_DIR = process.env.BOSS_DATA_DIR || path.join(__dirname, "..", "data");
const store = createJobStore({ dataDir: DATA_DIR });
const profileService = createProfileService({ store, dataDir: DATA_DIR });
const resumeWorkflowService = createResumeWorkflowService({ store, dataDir: DATA_DIR });

const server = http.createServer(async (request, response) => {
  setCors(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true, service: "boss-find-backend" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/jobs") {
      sendJson(response, 200, store.readStore());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/jobs/keys") {
      sendJson(response, 200, store.getJobKeys({
        describedOnly: parseBoolean(url.searchParams.get("described"), true),
        minDescriptionLength: Number(url.searchParams.get("minDescriptionLength") || 50)
      }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/jobs.csv") {
      const data = store.readStore();
      sendText(response, 200, toCsv(data.jobs || []), "text/csv; charset=utf-8");
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/stats") {
      sendJson(response, 200, store.getStats());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/profile") {
      sendJson(response, 200, store.getProfile());
      return;
    }

    if (request.method === "PUT" && url.pathname === "/api/profile") {
      const payload = await readJson(request);
      sendJson(response, 200, store.updateProfile(payload));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/profile/resume-sources") {
      sendJson(response, 200, store.getResumeSources(Number(url.searchParams.get("limit") || 20)));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/profile/resume-sources/extract") {
      const payload = await readJson(request);
      const extracted = await extractResumeSource(payload);
      const resumeSource = store.createResumeSource(extracted);
      sendJson(response, 201, {
        ok: true,
        textLength: resumeSource.textLength,
        sourceType: resumeSource.sourceType,
        fileName: resumeSource.fileName,
        parsed: resumeSource.parsed,
        metadata: resumeSource.metadata,
        resumeSource
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/profile/resume-sources") {
      const payload = await readJson(request);
      sendJson(response, 201, store.createResumeSource(payload));
      return;
    }

    const resumeDraftMatch = url.pathname.match(/^\/api\/profile\/resume-sources\/([0-9]+)\/drafts$/);
    if (request.method === "POST" && resumeDraftMatch) {
      const resumeSource = store.getResumeSource(Number(resumeDraftMatch[1]));
      const generated = generateProfileFactDrafts(resumeSource);
      sendJson(response, 201, store.createProfileFactDraftsFromResumeSource(resumeSource.id, generated));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/profile/fact-drafts") {
      sendJson(response, 200, store.getProfileFactDrafts({
        status: url.searchParams.get("status") || "",
        draftType: url.searchParams.get("draftType") || url.searchParams.get("type") || "",
        resumeSourceId: url.searchParams.get("resumeSourceId") || url.searchParams.get("sourceId") || "",
        limit: Number(url.searchParams.get("limit") || 100)
      }));
      return;
    }

    const factDraftMatch = url.pathname.match(/^\/api\/profile\/fact-drafts\/([0-9]+)$/);
    if (request.method === "GET" && factDraftMatch) {
      sendJson(response, 200, store.getProfileFactDraft(Number(factDraftMatch[1])));
      return;
    }

    const factDraftConfirmMatch = url.pathname.match(/^\/api\/profile\/fact-drafts\/([0-9]+)\/confirm$/);
    if (request.method === "POST" && factDraftConfirmMatch) {
      const payload = await readJson(request);
      sendJson(response, 200, store.confirmProfileFactDraft(Number(factDraftConfirmMatch[1]), payload));
      return;
    }

    const factDraftRejectMatch = url.pathname.match(/^\/api\/profile\/fact-drafts\/([0-9]+)\/reject$/);
    if (request.method === "POST" && factDraftRejectMatch) {
      const payload = await readJson(request);
      sendJson(response, 200, store.rejectProfileFactDraft(Number(factDraftRejectMatch[1]), payload));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/profile/experiences") {
      sendJson(response, 200, store.getExperiences());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/profile/experiences") {
      const payload = await readJson(request);
      sendJson(response, 201, store.createExperience(payload));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/profile/skills") {
      sendJson(response, 200, store.getSkills());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/profile/skills") {
      const payload = await readJson(request);
      sendJson(response, 201, store.createSkill(payload));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/profile/constraints") {
      sendJson(response, 200, store.getConstraints());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/profile/constraints") {
      const payload = await readJson(request);
      sendJson(response, 201, store.createConstraint(payload));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/profile/career-context") {
      sendJson(response, 200, profileService.readCareerContext());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/profile/career-context") {
      const payload = await readJson(request);
      sendJson(response, 200, await profileService.generateCareerContext(payload));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/profile/career-context/fact-drafts") {
      const payload = await readJson(request);
      sendJson(response, 201, profileService.generateFactDraftsFromCareerContext(payload));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/quality") {
      sendJson(response, 200, store.getQualityReport(Number(url.searchParams.get("limit") || 20)));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/events") {
      sendJson(response, 200, store.getBrowserEvents(Number(url.searchParams.get("limit") || 20)));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/applications") {
      sendJson(response, 200, store.getApplications({
        limit: Number(url.searchParams.get("limit") || 100)
      }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/application-events") {
      sendJson(response, 200, store.getApplicationEvents(Number(url.searchParams.get("limit") || 50)));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/agent-runs") {
      sendJson(response, 200, store.getAgentRuns({
        applicationId: url.searchParams.get("applicationId") || "",
        limit: Number(url.searchParams.get("limit") || 100)
      }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/workflow-events") {
      sendJson(response, 200, store.getWorkflowEvents({
        applicationId: url.searchParams.get("applicationId") || "",
        severity: url.searchParams.get("severity") || "",
        resolutionStatus: url.searchParams.get("resolutionStatus") || url.searchParams.get("status") || "",
        limit: Number(url.searchParams.get("limit") || 100)
      }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/workflow-errors") {
      sendJson(response, 200, store.getWorkflowErrors({
        applicationId: url.searchParams.get("applicationId") || "",
        sourceType: url.searchParams.get("sourceType") || "",
        status: url.searchParams.get("status") || url.searchParams.get("resolutionStatus") || "OPEN",
        limit: Number(url.searchParams.get("limit") || 100)
      }));
      return;
    }

    const workflowErrorResolveMatch = url.pathname.match(/^\/api\/workflow-errors\/([0-9]+)\/resolve$/);
    if (request.method === "POST" && workflowErrorResolveMatch) {
      const payload = await readJson(request);
      sendJson(response, 200, store.resolveWorkflowError(Number(workflowErrorResolveMatch[1]), payload));
      return;
    }

    const applicationTimelineMatch = url.pathname.match(/^\/api\/applications\/([0-9]+)\/timeline$/);
    if (request.method === "GET" && applicationTimelineMatch) {
      sendJson(response, 200, store.getApplicationTimeline(Number(applicationTimelineMatch[1]), {
        limit: Number(url.searchParams.get("limit") || 200)
      }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/screenings") {
      sendJson(response, 200, store.getScreenings({
        applicationId: url.searchParams.get("applicationId") || "",
        limit: Number(url.searchParams.get("limit") || 100)
      }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/resume-versions") {
      sendJson(response, 200, store.getResumeVersions({
        applicationId: url.searchParams.get("applicationId") || "",
        limit: Number(url.searchParams.get("limit") || 100)
      }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/resume-candidates") {
      sendJson(response, 200, store.getResumeCandidates({
        status: url.searchParams.getAll("status").length ? url.searchParams.getAll("status") : (url.searchParams.get("statuses") || "SHORTLISTED"),
        recommendation: url.searchParams.getAll("recommendation").length
          ? url.searchParams.getAll("recommendation")
          : (url.searchParams.get("recommendations") || "auto_prepare"),
        minDescriptionLength: Number(url.searchParams.get("minDescriptionLength") || 80),
        minMatchScore: Number(url.searchParams.get("minMatchScore") || 0),
        excludeExistingResume: parseBoolean(url.searchParams.get("excludeExistingResume"), true),
        limit: Number(url.searchParams.get("limit") || 10)
      }));
      return;
    }

    const resumeVersionMatch = url.pathname.match(/^\/api\/resume-versions\/([0-9]+)$/);
    if (request.method === "GET" && resumeVersionMatch) {
      sendJson(response, 200, store.getResumeVersion(Number(resumeVersionMatch[1])));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/resume-fit-evaluations") {
      sendJson(response, 200, store.getResumeFitEvaluations({
        applicationId: url.searchParams.get("applicationId") || "",
        resumeVersionId: url.searchParams.get("resumeVersionId") || "",
        limit: Number(url.searchParams.get("limit") || 100)
      }));
      return;
    }

    const resumeFitEvaluationMatch = url.pathname.match(/^\/api\/resume-fit-evaluations\/([0-9]+)$/);
    if (request.method === "GET" && resumeFitEvaluationMatch) {
      sendJson(response, 200, store.getResumeFitEvaluation(Number(resumeFitEvaluationMatch[1])));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/resume-claim-verifications") {
      sendJson(response, 200, store.getResumeClaimVerifications({
        applicationId: url.searchParams.get("applicationId") || "",
        resumeVersionId: url.searchParams.get("resumeVersionId") || "",
        limit: Number(url.searchParams.get("limit") || 100)
      }));
      return;
    }

    const resumeClaimVerificationMatch = url.pathname.match(/^\/api\/resume-claim-verifications\/([0-9]+)$/);
    if (request.method === "GET" && resumeClaimVerificationMatch) {
      sendJson(response, 200, store.getResumeClaimVerification(Number(resumeClaimVerificationMatch[1])));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/resume-audits") {
      sendJson(response, 200, store.getResumeAudits({
        applicationId: url.searchParams.get("applicationId") || "",
        resumeVersionId: url.searchParams.get("resumeVersionId") || "",
        limit: Number(url.searchParams.get("limit") || 100)
      }));
      return;
    }

    const resumeAuditMatch = url.pathname.match(/^\/api\/resume-audits\/([0-9]+)$/);
    if (request.method === "GET" && resumeAuditMatch) {
      sendJson(response, 200, store.getResumeAudit(Number(resumeAuditMatch[1])));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/messages") {
      sendJson(response, 200, store.getMessages({
        applicationId: url.searchParams.get("applicationId") || "",
        limit: Number(url.searchParams.get("limit") || 100)
      }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/conversations") {
      sendJson(response, 200, store.getConversations({
        applicationId: url.searchParams.get("applicationId") || "",
        limit: Number(url.searchParams.get("limit") || 100)
      }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/submission-readiness") {
      sendJson(response, 200, store.getSubmissionReadinessQueue({
        status: url.searchParams.getAll("status").length ? url.searchParams.getAll("status") : (url.searchParams.get("statuses") || "READY_FOR_MANUAL_REVIEW"),
        limit: Number(url.searchParams.get("limit") || 100)
      }));
      return;
    }

    const submissionReadinessReviewMatch = url.pathname.match(/^\/api\/submission-readiness\/([0-9]+)\/review$/);
    if (request.method === "POST" && submissionReadinessReviewMatch) {
      const payload = await readJson(request);
      sendJson(response, 200, store.reviewSubmissionReadiness(Number(submissionReadinessReviewMatch[1]), payload));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/screening-candidates") {
      sendJson(response, 200, store.getScreeningCandidates({
        status: url.searchParams.getAll("status").length ? url.searchParams.getAll("status") : (url.searchParams.get("statuses") || "DETAIL_CAPTURED"),
        minDescriptionLength: Number(url.searchParams.get("minDescriptionLength") || 80),
        includeAlreadyScreened: parseBoolean(url.searchParams.get("includeAlreadyScreened"), false),
        limit: Number(url.searchParams.get("limit") || 10)
      }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/applications/screen-batch") {
      const payload = await readJson(request);
      sendJson(response, 200, await screenApplicationsBatch(payload));
      return;
    }

    const prepareResumeMatch = url.pathname.match(/^\/api\/applications\/([0-9]+)\/prepare-resume$/);
    if (request.method === "POST" && prepareResumeMatch) {
      const payload = await readJson(request);
      sendJson(response, 200, await prepareResume(Number(prepareResumeMatch[1]), payload));
      return;
    }

    const prepareGreetingMatch = url.pathname.match(/^\/api\/applications\/([0-9]+)\/prepare-greeting$/);
    if (request.method === "POST" && prepareGreetingMatch) {
      const payload = await readJson(request);
      sendJson(response, 200, await prepareGreeting(Number(prepareGreetingMatch[1]), payload));
      return;
    }

    const workflowPlanMatch = url.pathname.match(/^\/api\/applications\/([0-9]+)\/workflow-plan$/);
    if (request.method === "GET" && workflowPlanMatch) {
      sendJson(response, 200, planWorkflow(Number(workflowPlanMatch[1]), { persist: false }));
      return;
    }

    if (request.method === "POST" && workflowPlanMatch) {
      const payload = await readJson(request);
      sendJson(response, 200, planWorkflow(Number(workflowPlanMatch[1]), {
        persist: true,
        provider: payload.provider || "rules",
        requestedBy: payload.requestedBy || payload.reviewer || "user"
      }));
      return;
    }

    const resumeWorkflowGraphMatch = url.pathname.match(/^\/api\/applications\/([0-9]+)\/resume-workflow-graph$/);
    if (request.method === "POST" && resumeWorkflowGraphMatch) {
      const payload = await readJson(request);
      sendJson(response, 200, await resumeWorkflowService.runGraph(Number(resumeWorkflowGraphMatch[1]), payload));
      return;
    }

    const screenApplicationMatch = url.pathname.match(/^\/api\/applications\/([0-9]+)\/screen$/);
    if (request.method === "POST" && screenApplicationMatch) {
      const payload = await readJson(request);
      sendJson(response, 200, await screenApplication(Number(screenApplicationMatch[1]), payload));
      return;
    }

    const auditResumeMatch = url.pathname.match(/^\/api\/resume-versions\/([0-9]+)\/audit$/);
    if (request.method === "POST" && auditResumeMatch) {
      const payload = await readJson(request);
      sendJson(response, 200, await auditResume(Number(auditResumeMatch[1]), payload));
      return;
    }

    const evaluateResumeFitMatch = url.pathname.match(/^\/api\/resume-versions\/([0-9]+)\/evaluate-fit$/);
    if (request.method === "POST" && evaluateResumeFitMatch) {
      const payload = await readJson(request);
      sendJson(response, 200, await evaluateResumeFit(Number(evaluateResumeFitMatch[1]), payload));
      return;
    }

    const verifyResumeClaimsMatch = url.pathname.match(/^\/api\/resume-versions\/([0-9]+)\/verify-claims$/);
    if (request.method === "POST" && verifyResumeClaimsMatch) {
      const payload = await readJson(request);
      sendJson(response, 200, await verifyResumeClaims(Number(verifyResumeClaimsMatch[1]), payload));
      return;
    }

    const reviseResumeFromChecksMatch = url.pathname.match(/^\/api\/resume-versions\/([0-9]+)\/revise-from-checks$/);
    if (request.method === "POST" && reviseResumeFromChecksMatch) {
      const payload = await readJson(request);
      sendJson(response, 200, await reviseResumeFromChecks(Number(reviseResumeFromChecksMatch[1]), payload));
      return;
    }

    const reviseResumeMatch = url.pathname.match(/^\/api\/resume-versions\/([0-9]+)\/revise$/);
    if (request.method === "POST" && reviseResumeMatch) {
      const payload = await readJson(request);
      sendJson(response, 200, await reviseResume(Number(reviseResumeMatch[1]), payload));
      return;
    }

    const approveResumeMatch = url.pathname.match(/^\/api\/resume-versions\/([0-9]+)\/approve-local$/);
    if (request.method === "POST" && approveResumeMatch) {
      const payload = await readJson(request);
      sendJson(response, 200, store.approveResumeVersion(Number(approveResumeMatch[1]), payload));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/browser-tasks") {
      sendJson(response, 200, store.getBrowserTasks({
        status: url.searchParams.get("status") || "",
        sourceUrl: url.searchParams.get("sourceUrl") || url.searchParams.get("pageUrl") || "",
        limit: Number(url.searchParams.get("limit") || 100)
      }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/browser-tasks/diagnostics") {
      sendJson(response, 200, store.getBrowserTaskDiagnostics({
        limit: Number(url.searchParams.get("limit") || 20),
        sourceUrl: url.searchParams.get("sourceUrl") || url.searchParams.get("pageUrl") || ""
      }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/browser-tasks") {
      const payload = await readJson(request);
      sendJson(response, 201, store.createBrowserTask(payload));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/browser-tasks/claim") {
      const payload = await readJson(request);
      sendJson(response, 200, store.claimBrowserTask(payload));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/browser-tasks/cancel") {
      const payload = await readJson(request);
      sendJson(response, 200, store.cancelBrowserTasks(payload));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/browser-tasks/requeue") {
      const payload = await readJson(request);
      sendJson(response, 200, store.requeueBrowserTasks(payload));
      return;
    }

    const browserTaskMatch = url.pathname.match(/^\/api\/browser-tasks\/([0-9]+)$/);
    if (request.method === "GET" && browserTaskMatch) {
      sendJson(response, 200, store.getBrowserTask(Number(browserTaskMatch[1])));
      return;
    }

    const browserTaskTransitionMatch = url.pathname.match(/^\/api\/browser-tasks\/([0-9]+)\/transition$/);
    if (request.method === "POST" && browserTaskTransitionMatch) {
      const payload = await readJson(request);
      sendJson(response, 200, store.transitionBrowserTask(Number(browserTaskTransitionMatch[1]), payload));
      return;
    }

    const transitionMatch = url.pathname.match(/^\/api\/applications\/([0-9]+)\/transition$/);
    if (request.method === "POST" && transitionMatch) {
      const payload = await readJson(request);
      sendJson(response, 200, store.transitionApplication(Number(transitionMatch[1]), payload));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/jobs/missing-descriptions") {
      sendJson(response, 200, store.getMissingDescriptions({
        limit: Number(url.searchParams.get("limit") || 50),
        minDescriptionLength: Number(url.searchParams.get("minDescriptionLength") || 80)
      }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/jobs/sync") {
      assertAuthorized(request);
      const payload = await readJson(request);
      const result = store.syncJobs(payload);
      sendJson(response, 200, result);
      return;
    }

    sendJson(response, 404, { ok: false, error: "Not found" });
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(response, status, { ok: false, error: error.message || String(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Boss Find backend listening on http://${HOST}:${PORT}`);
});

async function screenApplication(applicationId, payload = {}) {
  const screeningInput = store.getApplicationScreeningInput(applicationId, {
    userRules: payload.userRules || {}
  });
  const agentRun = store.startAgentRun({
    agentName: "ScreeningAgent",
    applicationId,
    step: "score_job",
    provider: payload.mode || "auto",
    input: {
      application: screeningInput.application,
      job: screeningInput.job,
      profileSummary: summarizeProfileForTrace(screeningInput.profile),
      userRules: screeningInput.userRules
    }
  });

  try {
    const agentResult = await runScreeningAgent(screeningInput, {
      mode: payload.mode || "auto",
      modelConfig: payload.modelConfig || {}
    });
    const finishedRun = store.finishAgentRun(agentRun.id, {
      status: "SUCCEEDED",
      provider: agentResult.provider,
      output: {
        result: agentResult.result,
        fallbackUsed: agentResult.fallbackUsed,
        fallbackReason: agentResult.fallbackReason || "",
        modelConfig: agentResult.modelConfig
      },
      fallbackUsed: agentResult.fallbackUsed
    });
    const saved = store.createScreening({
      applicationId,
      agentRunId: finishedRun.id,
      provider: agentResult.provider,
      result: agentResult.result,
      metadata: {
        fallbackUsed: agentResult.fallbackUsed,
        fallbackReason: agentResult.fallbackReason || "",
        fallbackMessage: agentResult.fallbackMessage || "",
        modelConfig: agentResult.modelConfig
      }
    });
    return {
      ok: true,
      storage: "sqlite",
      agentRun: finishedRun,
      screening: saved.screening,
      transition: saved.transition
    };
  } catch (error) {
    const finishedRun = store.finishAgentRun(agentRun.id, {
      status: "FAILED",
      provider: payload.mode || "auto",
      output: {
        error: structuredError(error)
      },
      errorCode: error.code || "SCREENING_AGENT_FAILED",
      errorMessage: error.message || String(error)
    });
    try {
      store.transitionApplication(applicationId, {
        toStatus: "NEEDS_USER_REVIEW",
        eventType: "SCREENING_FAILED",
        reason: error.code || "SCREENING_AGENT_FAILED",
        metadata: {
          agentRunId: finishedRun.id,
          error: structuredError(error)
        }
      });
    } catch {
      // Keep the original agent failure as the API error.
    }
    const httpErrorObject = httpError(502, error.message || "ScreeningAgent failed");
    httpErrorObject.code = error.code || "SCREENING_AGENT_FAILED";
    throw httpErrorObject;
  }
}

async function screenApplicationRiskGateOnly(applicationId, payload = {}) {
  const screeningInput = store.getApplicationScreeningInput(applicationId, {
    userRules: payload.userRules || {}
  });
  const riskGate = evaluateJobRiskGate(screeningInput);
  if (!riskGate.blocked) {
    return {
      ok: true,
      storage: "sqlite",
      skipped: true,
      reason: "risk_gate_not_matched",
      riskGate
    };
  }
  return screenApplication(applicationId, {
    mode: "rules",
    userRules: payload.userRules || {}
  });
}

function normalizeBatchScreeningResult(applicationId, result = {}) {
  if (result.skipped) {
    return {
      applicationId,
      ok: true,
      skipped: true,
      reason: result.reason || "skipped",
      riskGate: result.riskGate || null
    };
  }
  return {
    applicationId,
    ok: true,
    screeningId: result.screening.id,
    agentRunId: result.agentRun.id,
    toStatus: result.transition.toStatus,
    matchScore: result.screening.matchScore,
    riskScore: result.screening.riskScore,
    recommendation: result.screening.recommendation
  };
}

async function screenApplicationsBatch(payload = {}) {
  const explicitApplicationIds = Array.isArray(payload.applicationIds)
    ? payload.applicationIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];
  const candidates = explicitApplicationIds.length
    ? explicitApplicationIds.map((id) => ({ id }))
    : store.getScreeningCandidates({
      status: payload.statuses || payload.status || ["DETAIL_CAPTURED"],
      minDescriptionLength: Number(payload.minDescriptionLength || 80),
      includeAlreadyScreened: Boolean(payload.includeAlreadyScreened),
      limit: Number(payload.limit || 10)
    }).candidates;
  const limit = Math.max(1, Math.min(50, Number(payload.limit || candidates.length || 10)));
  const selected = candidates.slice(0, limit);
  const results = [];
  const batchId = `screen-batch-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  store.recordWorkflowEvent({
    sourceType: "workflow",
    sourceId: null,
    eventType: "SCREENING_BATCH_STARTED",
    severity: "info",
    status: "RUNNING",
    progressCurrent: 0,
    progressTotal: selected.length,
    message: `Screening batch started for ${selected.length} application(s).`,
    metadata: {
      batchId,
      requested: explicitApplicationIds.length || candidates.length,
      selected: selected.length,
      mode: payload.mode || "rules",
      continueOnError: Boolean(payload.continueOnError),
      riskGateOnly: Boolean(payload.riskGateOnly)
    }
  });
  for (const candidate of selected) {
    try {
      const result = payload.riskGateOnly
        ? await screenApplicationRiskGateOnly(candidate.id, {
          userRules: payload.userRules || {}
        })
        : await screenApplication(candidate.id, {
          mode: payload.mode || "rules",
          userRules: payload.userRules || {},
          modelConfig: payload.modelConfig || {}
        });
      const batchResult = normalizeBatchScreeningResult(candidate.id, result);
      results.push(batchResult);
      store.recordWorkflowEvent({
        applicationId: candidate.id,
        sourceType: "workflow",
        sourceId: null,
        eventType: "SCREENING_BATCH_ITEM_SUCCEEDED",
        severity: "info",
        status: "RUNNING",
        progressCurrent: results.length,
        progressTotal: selected.length,
        message: batchResult.skipped
          ? `Risk gate did not match application ${candidate.id}; no screening was created.`
          : `Batch screening succeeded for application ${candidate.id}.`,
        metadata: {
          batchId,
          riskGateOnly: Boolean(payload.riskGateOnly),
          screeningId: batchResult.screeningId || null,
          agentRunId: batchResult.agentRunId || null,
          recommendation: batchResult.recommendation || "",
          matchScore: batchResult.matchScore ?? null,
          riskScore: batchResult.riskScore ?? null,
          skipped: Boolean(batchResult.skipped),
          reason: batchResult.reason || ""
        }
      });
    } catch (error) {
      results.push({
        applicationId: candidate.id,
        ok: false,
        error: structuredError(error)
      });
      store.recordWorkflowEvent({
        applicationId: candidate.id,
        sourceType: "workflow",
        sourceId: null,
        eventType: "SCREENING_BATCH_ITEM_FAILED",
        severity: "error",
        status: "RUNNING",
        progressCurrent: results.length,
        progressTotal: selected.length,
        message: `Batch screening failed for application ${candidate.id}.`,
        errorCode: error.code || "SCREENING_BATCH_ITEM_FAILED",
        errorMessage: error.message || String(error),
        metadata: {
          batchId,
          error: structuredError(error)
        }
      });
      if (!payload.continueOnError) {
        break;
      }
    }
  }
  const succeeded = results.filter((item) => item.ok).length;
  const failed = results.filter((item) => !item.ok).length;
  store.recordWorkflowEvent({
    sourceType: "workflow",
    sourceId: null,
    eventType: failed ? "SCREENING_BATCH_COMPLETED_WITH_ERRORS" : "SCREENING_BATCH_COMPLETED",
    severity: failed ? "warning" : "info",
    status: "SUCCEEDED",
    progressCurrent: results.length,
    progressTotal: selected.length,
    message: `Screening batch completed: ${succeeded} succeeded, ${failed} failed.`,
    errorCode: failed ? "SCREENING_BATCH_HAS_FAILURES" : "",
    errorMessage: failed ? `${failed} application(s) failed in screening batch.` : "",
    metadata: {
      batchId,
      requested: explicitApplicationIds.length || candidates.length,
      selected: selected.length,
      succeeded,
      failed
    }
  });
  return {
    ok: failed === 0,
    storage: "sqlite",
    mode: payload.mode || "rules",
    requested: explicitApplicationIds.length || candidates.length,
    selected: selected.length,
    succeeded,
    failed,
    results
  };
}

async function prepareResume(applicationId, payload = {}) {
  const resumeInput = store.getApplicationResumeInput(applicationId, {
    screeningId: payload.screeningId || "",
    userRules: payload.userRules || {}
  });
  const agentRun = store.startAgentRun({
    agentName: "ResumeAgent",
    applicationId,
    step: "prepare_resume",
    provider: payload.mode || "rules",
    input: {
      application: resumeInput.application,
      job: resumeInput.job,
      screening: resumeInput.screening,
      profileSummary: summarizeProfileForTrace(resumeInput.profile),
      userRules: resumeInput.userRules
    }
  });

  try {
    const agentResult = runResumeAgent(resumeInput, {
      mode: payload.mode || "rules"
    });
    const finishedRun = store.finishAgentRun(agentRun.id, {
      status: "SUCCEEDED",
      provider: agentResult.provider,
      output: {
        result: agentResult.result,
        fallbackUsed: agentResult.fallbackUsed
      },
      fallbackUsed: agentResult.fallbackUsed
    });
    const saved = store.createResumeVersion({
      applicationId,
      screeningId: resumeInput.screening.id,
      agentRunId: finishedRun.id,
      provider: agentResult.provider,
      result: agentResult.result,
      metadata: {
        generatedBy: "ResumeAgent",
        mode: payload.mode || "rules"
      }
    });
    let rendered = null;
    if (payload.renderDocx !== false) {
      rendered = await renderResumeDocx(saved.resumeVersion, {
        outputDir: path.join(DATA_DIR, "generated_resumes")
      });
      saved.resumeVersion = store.attachResumeFile(saved.resumeVersion.id, rendered);
    }
    return {
      ok: true,
      storage: "sqlite",
      agentRun: finishedRun,
      resumeVersion: saved.resumeVersion,
      rendered
    };
  } catch (error) {
    const finishedRun = store.finishAgentRun(agentRun.id, {
      status: "FAILED",
      provider: payload.mode || "rules",
      output: {
        error: structuredError(error)
      },
      errorCode: error.code || "RESUME_AGENT_FAILED",
      errorMessage: error.message || String(error)
    });
    try {
      store.transitionApplication(applicationId, {
        toStatus: "NEEDS_USER_REVIEW",
        eventType: "RESUME_AGENT_FAILED",
        reason: error.code || "RESUME_AGENT_FAILED",
        metadata: {
          agentRunId: finishedRun.id,
          error: structuredError(error)
        }
      });
    } catch {
      // Keep the original resume failure as the API error.
    }
    const httpErrorObject = httpError(502, error.message || "ResumeAgent failed");
    httpErrorObject.code = error.code || "RESUME_AGENT_FAILED";
    throw httpErrorObject;
  }
}

async function evaluateResumeFit(resumeVersionId, payload = {}) {
  const resumeVersion = store.getResumeVersion(resumeVersionId);
  const resumeInput = store.getApplicationResumeInput(resumeVersion.applicationId, {
    screeningId: resumeVersion.screeningId || ""
  });
  const agentRun = store.startAgentRun({
    agentName: "ResumeFitEvaluator",
    applicationId: resumeVersion.applicationId,
    step: "evaluate_resume_fit",
    provider: payload.mode || "rules",
    input: {
      resumeVersionId,
      application: resumeInput.application,
      job: resumeInput.job,
      screening: resumeInput.screening,
      resumeFields: resumeVersion.resumeFields
    }
  });

  try {
    const agentResult = runResumeFitEvaluator({
      application: resumeInput.application,
      job: resumeInput.job,
      resumeVersion
    }, {
      mode: payload.mode || "rules"
    });
    const finishedRun = store.finishAgentRun(agentRun.id, {
      status: "SUCCEEDED",
      provider: agentResult.provider,
      output: {
        result: agentResult.result,
        fallbackUsed: agentResult.fallbackUsed
      },
      fallbackUsed: agentResult.fallbackUsed
    });
    const saved = store.createResumeFitEvaluation({
      resumeVersionId,
      agentRunId: finishedRun.id,
      provider: agentResult.provider,
      result: agentResult.result,
      metadata: {
        evaluatedBy: "ResumeFitEvaluator",
        mode: payload.mode || "rules"
      }
    });
    const evaluation = saved.resumeFitEvaluation;
    store.recordWorkflowEvent({
      applicationId: resumeVersion.applicationId,
      sourceType: "agent_run",
      sourceId: finishedRun.id,
      eventType: "RESUME_FIT_EVALUATED",
      severity: evaluation.blockers.length || evaluation.coverageScore < 55 ? "warning" : "info",
      status: "SUCCEEDED",
      progressCurrent: 1,
      progressTotal: 1,
      message: `Resume fit evaluated for resume version ${resumeVersionId}: ${evaluation.coverageScore}/100.`,
      errorCode: evaluation.blockers.length ? "RESUME_FIT_HAS_BLOCKERS" : "",
      errorMessage: evaluation.blockers.length ? `${evaluation.blockers.length} must-have JD requirement(s) are missing.` : "",
      metadata: {
        resumeVersionId,
        resumeFitEvaluationId: evaluation.id,
        coverageScore: evaluation.coverageScore,
        fitLevel: evaluation.fitLevel,
        blockerCount: evaluation.blockers.length,
        noRealBossAction: true,
        noApplicationStatusChange: true
      }
    });
    return {
      ok: true,
      storage: "sqlite",
      agentRun: finishedRun,
      resumeFitEvaluation: evaluation
    };
  } catch (error) {
    const finishedRun = store.finishAgentRun(agentRun.id, {
      status: "FAILED",
      provider: payload.mode || "rules",
      output: {
        error: structuredError(error)
      },
      errorCode: error.code || "RESUME_FIT_EVALUATOR_FAILED",
      errorMessage: error.message || String(error)
    });
    const httpErrorObject = httpError(502, error.message || "ResumeFitEvaluator failed");
    httpErrorObject.code = error.code || "RESUME_FIT_EVALUATOR_FAILED";
    httpErrorObject.agentRunId = finishedRun.id;
    throw httpErrorObject;
  }
}

async function verifyResumeClaims(resumeVersionId, payload = {}) {
  const resumeVersion = store.getResumeVersion(resumeVersionId);
  const resumeInput = store.getApplicationResumeInput(resumeVersion.applicationId, {
    screeningId: resumeVersion.screeningId || ""
  });
  const agentRun = store.startAgentRun({
    agentName: "ClaimVerifier",
    applicationId: resumeVersion.applicationId,
    step: "verify_resume_claims",
    provider: payload.mode || "rules",
    input: {
      resumeVersionId,
      application: resumeInput.application,
      profileSummary: summarizeProfileForTrace(resumeInput.profile),
      resumeFields: resumeVersion.resumeFields,
      sourceMapping: resumeVersion.sourceMapping
    }
  });

  try {
    const agentResult = runClaimVerifier({
      application: resumeInput.application,
      profile: resumeInput.profile,
      resumeVersion,
      sourceMapping: resumeVersion.sourceMapping
    }, {
      mode: payload.mode || "rules"
    });
    const finishedRun = store.finishAgentRun(agentRun.id, {
      status: "SUCCEEDED",
      provider: agentResult.provider,
      output: {
        result: agentResult.result,
        fallbackUsed: agentResult.fallbackUsed
      },
      fallbackUsed: agentResult.fallbackUsed
    });
    const saved = store.createResumeClaimVerification({
      resumeVersionId,
      agentRunId: finishedRun.id,
      provider: agentResult.provider,
      result: agentResult.result,
      metadata: {
        verifiedBy: "ClaimVerifier",
        mode: payload.mode || "rules"
      }
    });
    const verification = saved.resumeClaimVerification;
    store.recordWorkflowEvent({
      applicationId: resumeVersion.applicationId,
      sourceType: "agent_run",
      sourceId: finishedRun.id,
      eventType: "RESUME_CLAIMS_VERIFIED",
      severity: verification.truthfulnessPassed ? "info" : "warning",
      status: "SUCCEEDED",
      progressCurrent: 1,
      progressTotal: 1,
      message: `Resume claims verified for resume version ${resumeVersionId}: ${verification.supportedCount}/${verification.totalClaims} supported.`,
      errorCode: verification.unsupportedCount || verification.needsUserConfirmationCount ? "RESUME_CLAIMS_NEED_REVIEW" : "",
      errorMessage: verification.unsupportedCount || verification.needsUserConfirmationCount
        ? `${verification.unsupportedCount} unsupported claim(s), ${verification.needsUserConfirmationCount} claim(s) need confirmation.`
        : "",
      metadata: {
        resumeVersionId,
        resumeClaimVerificationId: verification.id,
        totalClaims: verification.totalClaims,
        supportedCount: verification.supportedCount,
        weakCount: verification.weakCount,
        unsupportedCount: verification.unsupportedCount,
        needsUserConfirmationCount: verification.needsUserConfirmationCount,
        noRealBossAction: true,
        noApplicationStatusChange: true
      }
    });
    return {
      ok: true,
      storage: "sqlite",
      agentRun: finishedRun,
      resumeClaimVerification: verification
    };
  } catch (error) {
    const finishedRun = store.finishAgentRun(agentRun.id, {
      status: "FAILED",
      provider: payload.mode || "rules",
      output: {
        error: structuredError(error)
      },
      errorCode: error.code || "CLAIM_VERIFIER_FAILED",
      errorMessage: error.message || String(error)
    });
    const httpErrorObject = httpError(502, error.message || "ClaimVerifier failed");
    httpErrorObject.code = error.code || "CLAIM_VERIFIER_FAILED";
    httpErrorObject.agentRunId = finishedRun.id;
    throw httpErrorObject;
  }
}

async function reviseResumeFromChecks(resumeVersionId, payload = {}) {
  const resumeVersion = store.getResumeVersion(resumeVersionId);
  const resumeInput = store.getApplicationResumeInput(resumeVersion.applicationId, {
    screeningId: resumeVersion.screeningId || ""
  });
  const resumeFitEvaluation = payload.resumeFitEvaluationId
    ? store.getResumeFitEvaluation(payload.resumeFitEvaluationId)
    : store.getLatestResumeFitEvaluationForResumeVersion(resumeVersionId);
  const resumeClaimVerification = payload.resumeClaimVerificationId
    ? store.getResumeClaimVerification(payload.resumeClaimVerificationId)
    : store.getLatestResumeClaimVerificationForResumeVersion(resumeVersionId);
  const agentRun = store.startAgentRun({
    agentName: "ResumeRevisionAgent",
    applicationId: resumeVersion.applicationId,
    step: "revise_resume_from_checks",
    provider: payload.mode || "rules",
    input: {
      resumeVersionId,
      resumeFitEvaluationId: resumeFitEvaluation?.id || null,
      resumeClaimVerificationId: resumeClaimVerification?.id || null,
      application: resumeInput.application,
      job: resumeInput.job,
      screening: resumeInput.screening,
      profileSummary: summarizeProfileForTrace(resumeInput.profile),
      noRealBossAction: true
    }
  });

  try {
    const agentResult = runResumeRevisionAgent({
      application: resumeInput.application,
      job: resumeInput.job,
      profile: resumeInput.profile,
      resumeVersion,
      resumeFitEvaluation,
      resumeClaimVerification
    }, {
      mode: payload.mode || "rules"
    });
    const finishedRun = store.finishAgentRun(agentRun.id, {
      status: "SUCCEEDED",
      provider: agentResult.provider,
      output: {
        result: agentResult.result,
        fallbackUsed: agentResult.fallbackUsed
      },
      fallbackUsed: agentResult.fallbackUsed
    });
    const saved = store.createResumeVersion({
      applicationId: resumeVersion.applicationId,
      screeningId: resumeVersion.screeningId || "",
      agentRunId: finishedRun.id,
      provider: agentResult.provider,
      result: agentResult.result,
      skipApplicationTransition: true,
      metadata: {
        generatedBy: "ResumeRevisionAgent",
        mode: payload.mode || "rules",
        revisedFromVersionId: resumeVersion.id,
        resumeFitEvaluationId: resumeFitEvaluation?.id || null,
        resumeClaimVerificationId: resumeClaimVerification?.id || null,
        revisionSource: "checks"
      }
    });
    let rendered = null;
    if (payload.renderDocx !== false) {
      rendered = await renderResumeDocx(saved.resumeVersion, {
        outputDir: path.join(DATA_DIR, "generated_resumes")
      });
      saved.resumeVersion = store.attachResumeFile(saved.resumeVersion.id, rendered);
    }
    const actionCount = Array.isArray(agentResult.result.metadata?.actions)
      ? agentResult.result.metadata.actions.length
      : 0;
    store.recordWorkflowEvent({
      applicationId: resumeVersion.applicationId,
      sourceType: "agent_run",
      sourceId: finishedRun.id,
      eventType: "RESUME_REVISION_PREPARED",
      severity: actionCount ? "info" : "warning",
      status: "SUCCEEDED",
      progressCurrent: 1,
      progressTotal: 1,
      message: `Resume revision prepared from version ${resumeVersionId} into version ${saved.resumeVersion.id}.`,
      errorCode: actionCount ? "" : "RESUME_REVISION_NO_SAFE_CHANGE",
      errorMessage: actionCount ? "" : "No safe evidence-bound revision was available.",
      metadata: {
        baseResumeVersionId: resumeVersionId,
        resumeVersionId: saved.resumeVersion.id,
        agentRunId: finishedRun.id,
        actionCount,
        resumeFitEvaluationId: resumeFitEvaluation?.id || null,
        resumeClaimVerificationId: resumeClaimVerification?.id || null,
        noRealBossAction: true,
        noApplicationStatusChange: true,
        noBrowserTaskCreated: true
      }
    });
    return {
      ok: true,
      storage: "sqlite",
      agentRun: finishedRun,
      baseResumeVersion: resumeVersion,
      resumeFitEvaluation: resumeFitEvaluation || null,
      resumeClaimVerification: resumeClaimVerification || null,
      resumeVersion: saved.resumeVersion,
      rendered
    };
  } catch (error) {
    const finishedRun = store.finishAgentRun(agentRun.id, {
      status: "FAILED",
      provider: payload.mode || "rules",
      output: {
        error: structuredError(error)
      },
      errorCode: error.code || "RESUME_REVISION_AGENT_FAILED",
      errorMessage: error.message || String(error)
    });
    store.recordWorkflowEvent({
      applicationId: resumeVersion.applicationId,
      sourceType: "agent_run",
      sourceId: finishedRun.id,
      eventType: "RESUME_REVISION_FAILED",
      severity: "error",
      status: "FAILED",
      progressCurrent: 1,
      progressTotal: 1,
      message: `ResumeRevisionAgent failed for resume version ${resumeVersionId}.`,
      errorCode: error.code || "RESUME_REVISION_AGENT_FAILED",
      errorMessage: error.message || String(error),
      metadata: {
        resumeVersionId,
        agentRunId: finishedRun.id,
        error: structuredError(error),
        noRealBossAction: true,
        noApplicationStatusChange: true,
        noBrowserTaskCreated: true
      }
    });
    const httpErrorObject = httpError(502, error.message || "ResumeRevisionAgent failed");
    httpErrorObject.code = error.code || "RESUME_REVISION_AGENT_FAILED";
    httpErrorObject.agentRunId = finishedRun.id;
    throw httpErrorObject;
  }
}

async function auditResume(resumeVersionId, payload = {}) {
  const resumeVersion = store.getResumeVersion(resumeVersionId);
  const resumeInput = store.getApplicationResumeInput(resumeVersion.applicationId, {
    screeningId: resumeVersion.screeningId || ""
  });
  const agentRun = store.startAgentRun({
    agentName: "AuditAgent",
    applicationId: resumeVersion.applicationId,
    step: "audit_resume",
    provider: payload.mode || "rules",
    input: {
      resumeVersionId,
      application: resumeInput.application,
      job: resumeInput.job,
      screening: resumeInput.screening,
      profileSummary: summarizeProfileForTrace(resumeInput.profile),
      resumeFields: resumeVersion.resumeFields,
      sourceMapping: resumeVersion.sourceMapping,
      renderMetadata: resumeVersion.renderMetadata
    }
  });

  try {
    const agentResult = runAuditAgent({
      resumeVersionId,
      job: resumeInput.job,
      screening: resumeInput.screening,
      profile: resumeInput.profile,
      resumeFields: resumeVersion.resumeFields,
      sourceMapping: resumeVersion.sourceMapping,
      unsupportedClaims: resumeVersion.unsupportedClaims,
      renderMetadata: resumeVersion.renderMetadata
    }, {
      mode: payload.mode || "rules"
    });
    const finishedRun = store.finishAgentRun(agentRun.id, {
      status: "SUCCEEDED",
      provider: agentResult.provider,
      output: {
        result: agentResult.result,
        fallbackUsed: agentResult.fallbackUsed
      },
      fallbackUsed: agentResult.fallbackUsed
    });
    const saved = store.createResumeAudit({
      resumeVersionId,
      agentRunId: finishedRun.id,
      provider: agentResult.provider,
      result: agentResult.result,
      metadata: {
        auditedBy: "AuditAgent",
        mode: payload.mode || "rules"
      }
    });
    return {
      ok: true,
      storage: "sqlite",
      agentRun: finishedRun,
      resumeAudit: saved.resumeAudit,
      resumeVersion: saved.resumeVersion
    };
  } catch (error) {
    const finishedRun = store.finishAgentRun(agentRun.id, {
      status: "FAILED",
      provider: payload.mode || "rules",
      output: {
        error: structuredError(error)
      },
      errorCode: error.code || "AUDIT_AGENT_FAILED",
      errorMessage: error.message || String(error)
    });
    try {
      store.transitionApplication(resumeVersion.applicationId, {
        toStatus: "NEEDS_USER_REVIEW",
        eventType: "AUDIT_AGENT_FAILED",
        reason: error.code || "AUDIT_AGENT_FAILED",
        metadata: {
          resumeVersionId,
          agentRunId: finishedRun.id,
          error: structuredError(error)
        }
      });
    } catch {
      // Keep the original audit failure as the API error.
    }
    const httpErrorObject = httpError(502, error.message || "AuditAgent failed");
    httpErrorObject.code = error.code || "AUDIT_AGENT_FAILED";
    throw httpErrorObject;
  }
}

async function reviseResume(resumeVersionId, payload = {}) {
  const saved = store.reviseResumeVersion(resumeVersionId, {
    resumeFields: payload.resumeFields || {},
    reason: payload.reason || "user_revision",
    provider: payload.provider || "user_edit"
  });
  let rendered = null;
  if (payload.renderDocx !== false) {
    rendered = await renderResumeDocx(saved.resumeVersion, {
      outputDir: path.join(DATA_DIR, "generated_resumes")
    });
    saved.resumeVersion = store.attachResumeFile(saved.resumeVersion.id, rendered);
  }
  return {
    ok: true,
    storage: "sqlite",
    baseResumeVersion: saved.baseResumeVersion,
    resumeVersion: saved.resumeVersion,
    rendered
  };
}

async function prepareGreeting(applicationId, payload = {}) {
  const greetingInput = store.getApplicationGreetingInput(applicationId, {
    resumeVersionId: payload.resumeVersionId || "",
    userRules: payload.userRules || {}
  });
  const agentRun = store.startAgentRun({
    agentName: "MessageAgent",
    applicationId,
    step: "prepare_greeting",
    provider: payload.mode || "rules",
    input: {
      application: greetingInput.application,
      job: greetingInput.job,
      screening: greetingInput.screening,
      resumeVersion: {
        id: greetingInput.resumeVersion.id,
        status: greetingInput.resumeVersion.status,
        versionNumber: greetingInput.resumeVersion.versionNumber,
        localApproval: greetingInput.resumeVersion.metadata?.localApproval || null
      },
      profileSummary: summarizeProfileForTrace(greetingInput.profile),
      userRules: greetingInput.userRules
    }
  });

  try {
    const agentResult = runMessageAgent(greetingInput, {
      mode: payload.mode || "rules"
    });
    const finishedRun = store.finishAgentRun(agentRun.id, {
      status: "SUCCEEDED",
      provider: agentResult.provider,
      output: {
        result: agentResult.result,
        fallbackUsed: agentResult.fallbackUsed
      },
      fallbackUsed: agentResult.fallbackUsed
    });
    const saved = store.createGreetingDraft({
      applicationId,
      resumeVersionId: greetingInput.resumeVersion.id,
      agentRunId: finishedRun.id,
      provider: agentResult.provider,
      result: agentResult.result,
      jobId: greetingInput.job.jobId || greetingInput.application.bossJobId || "",
      title: greetingInput.job.title || greetingInput.application.title || "",
      company: greetingInput.job.company || greetingInput.application.company || "",
      detailUrl: greetingInput.job.detailUrl || greetingInput.application.detailUrl || "",
      sourceUrl: greetingInput.job.sourceUrl || "",
      metadata: {
        generatedBy: "MessageAgent",
        mode: payload.mode || "rules",
        noRealBossAction: true
      }
    });
    return {
      ok: true,
      storage: "sqlite",
      agentRun: finishedRun,
      conversation: saved.conversation,
      message: saved.message,
      browserTask: saved.browserTask
    };
  } catch (error) {
    const finishedRun = store.finishAgentRun(agentRun.id, {
      status: "FAILED",
      provider: payload.mode || "rules",
      output: {
        error: structuredError(error)
      },
      errorCode: error.code || "MESSAGE_AGENT_FAILED",
      errorMessage: error.message || String(error)
    });
    try {
      store.transitionApplication(applicationId, {
        toStatus: "NEEDS_USER_REVIEW",
        eventType: "MESSAGE_AGENT_FAILED",
        reason: error.code || "MESSAGE_AGENT_FAILED",
        metadata: {
          agentRunId: finishedRun.id,
          error: structuredError(error)
        }
      });
    } catch {
      // Keep the original message failure as the API error.
    }
    const httpErrorObject = httpError(502, error.message || "MessageAgent failed");
    httpErrorObject.code = error.code || "MESSAGE_AGENT_FAILED";
    throw httpErrorObject;
  }
}

function planWorkflow(applicationId, options = {}) {
  const snapshot = store.getApplicationWorkflowSnapshot(applicationId);
  const plan = planApplicationWorkflow(snapshot);
  if (!options.persist) {
    return {
      ok: true,
      storage: "sqlite",
      persisted: false,
      plan
    };
  }

  const agentRun = store.startAgentRun({
    agentName: "WorkflowOrchestrator",
    applicationId,
    step: "plan_application_workflow",
    provider: options.provider || "rules",
    input: {
      application: snapshot.application,
      latestEvidence: {
        screeningId: snapshot.latestScreening?.id || null,
        resumeVersionId: snapshot.latestResumeVersion?.id || null,
        resumeFitEvaluationId: snapshot.latestResumeFitEvaluation?.id || null,
        resumeAuditId: snapshot.latestResumeAudit?.id || null,
        conversationId: snapshot.latestConversation?.id || null,
        greetingDraftId: snapshot.latestGreetingDraft?.id || null,
        browserTaskCount: snapshot.latestBrowserTasks.length
      },
      requestedBy: options.requestedBy || "user",
      noRealBossAction: true
    }
  });
  store.recordWorkflowEvent({
    applicationId,
    sourceType: "workflow",
    sourceId: agentRun.id,
    eventType: "WORKFLOW_PLAN_STARTED",
    severity: "info",
    status: "RUNNING",
    progressCurrent: 0,
    progressTotal: 1,
    message: "WorkflowOrchestrator started application workflow planning.",
    metadata: {
      agentRunId: agentRun.id,
      requestedBy: options.requestedBy || "user",
      currentStatus: snapshot.application.status,
      noRealBossAction: true
    }
  });
  const finishedRun = store.finishAgentRun(agentRun.id, {
    status: "SUCCEEDED",
    provider: options.provider || "rules",
    output: {
      plan,
      noRealBossAction: true,
      noBrowserTaskCreated: true
    },
    fallbackUsed: false
  });
  store.recordWorkflowEvent({
    applicationId,
    sourceType: "workflow",
    sourceId: finishedRun.id,
    eventType: "WORKFLOW_PLAN_SUCCEEDED",
    severity: "info",
    status: "SUCCEEDED",
    progressCurrent: 1,
    progressTotal: 1,
    message: `Workflow plan prepared. Next action: ${plan.nextAction?.action || "UNKNOWN"}.`,
    metadata: {
      agentRunId: finishedRun.id,
      nextAction: plan.nextAction || null,
      stageCount: Array.isArray(plan.stages) ? plan.stages.length : 0,
      noRealBossAction: true,
      noBrowserTaskCreated: true
    }
  });
  return {
    ok: true,
    storage: "sqlite",
    persisted: true,
    agentRun: finishedRun,
    plan
  };
}

function assertAuthorized(request) {
  if (!REQUIRED_TOKEN) {
    return;
  }
  const auth = request.headers.authorization || "";
  if (auth !== `Bearer ${REQUIRED_TOKEN}`) {
    throw httpError(401, "Unauthorized");
  }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 10 * 1024 * 1024) {
      throw httpError(413, "Request body is too large");
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw httpError(400, "Invalid JSON body");
  }
}

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(response, status, body) {
  sendText(response, status, JSON.stringify(body, null, 2), "application/json; charset=utf-8");
}

function sendText(response, status, body, contentType) {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function toCsv(jobs) {
  const headers = ["title", "company", "salary", "location", "experience", "education", "recruiter", "detailUrl", "description"];
  const rows = [headers.join(",")];
  for (const job of jobs) {
    rows.push(headers.map((header) => csvCell(job[header] || "")).join(","));
  }
  return `${rows.join("\n")}\n`;
}

function csvCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function parseBoolean(value, fallback) {
  if (value === null || value === undefined || value === "") {
    return Boolean(fallback);
  }
  return value === "1" || value === "true" || value === "yes";
}
