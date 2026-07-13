#!/usr/bin/env node

"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { runAuditAgent } = require("../server/src/audit-agent");
const { requestStructuredCompletion } = require("../server/src/model-client");
const { runResumeAgent } = require("../server/src/resume-agent");
const { runResumeWorkflowGraph } = require("../server/src/resume-workflow-graph");
const { normalizeScreeningOutput } = require("../server/src/screening-agent");
const { createJobStore, SCHEMA_VERSION } = require("../server/src/sqlite-store");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_FACT = "Built a local-first job assistant with Chrome MV3, Node.js, SQLite, and LangGraph.";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m16-real-model-"));
  const modelServer = await startModelServer();
  const store = createJobStore({ dataDir });
  try {
    seedProfile(store);
    store.syncJobs(sampleJobPayload());
    const application = store.getApplications({ limit: 10 }).applications[0];
    const modelConfig = {
      configured: true,
      apiKey: "m16-fixture-key",
      baseUrl: `http://127.0.0.1:${modelServer.address().port}`,
      model: "m16-fixture-model",
      wireApi: "responses",
      timeoutMs: 5000,
      maxRetries: 1
    };
    const result = await runResumeWorkflowGraph({
      store,
      applicationId: application.id,
      mode: "hybrid",
      modelConfig,
      maxRevisions: 1,
      renderDocx: false
    });
    const runs = store.getAgentRuns({ applicationId: application.id, limit: 30 }).runs;
    const quality = store.getAgentModelQualitySummary({ limit: 100 });
    const screeningRun = runs.find((run) => run.agentName === "ScreeningAgent");
    const modelRuns = runs.filter((run) => [
      "ScreeningAgent",
      "ResumeAgent",
      "ResumeFitEvaluator",
      "AuditAgent"
    ].includes(run.agentName));
    const evidenceError = await assertEvidenceGate(modelConfig);
    const auditResult = await assertAuditCannotWeaken(modelConfig);
    const wrappedChat = await assertWrappedChatCompatibility(modelConfig);
    const calibratedScreening = assertHybridRecommendationCalibration();
    const noSummaryAudit = assertNoSummaryResumeIsValid();
    const checks = {
      schemaMigratedToM16: SCHEMA_VERSION >= 15 && store.getStats().schemaVersion === SCHEMA_VERSION,
      hybridGraphCompletes: result.ok === true && result.resumeAudit?.recommendation === "approve",
      hybridGraphUsesExpectedModelAgents: modelRuns.length === 4
        && modelRuns.every((run) => run.provider === "hybrid"),
      claimVerifierRemainsDeterministic: runs.some((run) => run.agentName === "ClaimVerifier" && run.provider === "rules"),
      schemaFailureRetriesOnce: screeningRun?.modelTelemetry?.attemptCount === 2
        && screeningRun.modelTelemetry.attempts?.[0]?.errorCode === "AGENT_OUTPUT_SCHEMA_INVALID"
        && screeningRun.modelTelemetry.attempts?.[0]?.usage?.totalTokens === 150
        && screeningRun.modelTelemetry.usage?.totalTokens === 300,
      usageTelemetryPersists: quality.invocationCount === 4
        && quality.totals.totalTokens === 750
        && quality.totals.attempts === 5
        && quality.modelCounts["m16-fixture-model"] === 4,
      qualitySummaryHasLatency: quality.latencyMs.p50 > 0 && quality.latencyMs.p95 >= quality.latencyMs.p50,
      invalidEvidenceIsRejected: evidenceError === "AGENT_OUTPUT_EVIDENCE_INVALID",
      modelCannotRelaxAuditBlock: auditResult.result.recommendation === "block"
        && auditResult.result.metadata.modelRecommendation === "approve",
      wrappedChatResponseIsNormalized: wrappedChat.data?.ok === true
        && wrappedChat.telemetry?.wireApi === "chat"
        && wrappedChat.telemetry?.usage?.totalTokens === 30,
      hybridRecommendationUsesScorePolicy: calibratedScreening.recommendation === "auto_prepare"
        && calibratedScreening.metadata.modelRecommendation === "review_needed"
        && calibratedScreening.metadata.recommendationAdjusted === true
        && calibratedScreening.matchScore === 81
        && calibratedScreening.metadata.scoreEnsemble?.baselineWeight === 0.7,
      noSummaryResumePassesFormatGate: noSummaryAudit.result.formatPassed === true
        && noSummaryAudit.result.recommendation === "approve",
      graphCreatesNoBrowserTasks: store.getStats().browserTaskCount === 0,
      fixtureUsesOfficialSdkTransport: modelServer.calls() === 6
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      summary: {
        workflowRunId: result.workflowRunId,
        applicationId: application.id,
        agentRunCount: runs.length,
        modelInvocationCount: quality.invocationCount,
        totalTokens: quality.totals.totalTokens,
        p50LatencyMs: quality.latencyMs.p50,
        p95LatencyMs: quality.latencyMs.p95,
        httpModelCalls: modelServer.calls()
      }
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    store.close();
    await closeServer(modelServer);
    if (process.exitCode === 0) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } else {
      console.error(`M16 smoke data retained for debugging: ${dataDir}`);
    }
  }
}

function assertNoSummaryResumeIsValid() {
  return runAuditAgent({
    resumeVersionId: 100,
    job: { title: "AI Product Manager" },
    screening: { matchScore: 90, riskScore: 10, recommendation: "auto_prepare" },
    profile: { experiences: [], skills: [], constraints: [] },
    resumeFields: {
      name: "Candidate",
      headline: "AI Product Manager",
      skills: [],
      projects: [],
      education: [{ title: "Sample University", bullets: [] }]
    },
    sourceMapping: [],
    unsupportedClaims: [],
    renderMetadata: { renderQuality: { ok: true } }
  }, { mode: "rules" });
}

function assertHybridRecommendationCalibration() {
  return normalizeScreeningOutput({
    matchScore: 83,
    riskScore: 20,
    recommendation: "review_needed",
    hardConditions: [{ name: "jd_description", passed: true, reason: "complete" }],
    matchedPoints: ["confirmed evidence"],
    riskPoints: [],
    resumeStrategy: ["use confirmed evidence"],
    requiresUserConfirmation: false,
    confidence: "high"
  }, {
    matchScore: 80,
    riskScore: 20,
    recommendation: "auto_prepare",
    hardConditions: [{ name: "jd_description", passed: true, reason: "complete" }],
    matchedPoints: [],
    riskPoints: [],
    resumeStrategy: [],
    requiresUserConfirmation: false,
    confidence: "medium"
  }, "hybrid");
}

function assertWrappedChatCompatibility(modelConfig) {
  return requestStructuredCompletion({
    system: "WrappedChatCompatibilityProbe",
    user: "Return JSON.",
    config: {
      ...modelConfig,
      wireApi: "chat",
      maxRetries: 0
    },
    schemaName: "wrapped_chat_probe"
  });
}

function seedProfile(store) {
  store.updateProfile({
    displayName: "M16 Candidate",
    headline: "AI Product and Agent Workflow",
    location: "Shanghai",
    target: { roles: ["AI Product Manager"] },
    summary: "Builds evidence-bound AI workflow products."
  });
  store.createExperience({
    kind: "education",
    title: "Human Computer Interaction",
    organization: "Sample University",
    role: "Graduate Student",
    startDate: "2024.09",
    endDate: "2027.06",
    facts: ["Studied user research and AI product design."],
    skills: ["User Research", "AI Product"],
    evidenceText: "Confirmed education",
    evidenceSource: "m16-smoke",
    confidence: "user_confirmed"
  });
  store.createExperience({
    kind: "project",
    title: "CareerFlow Local",
    organization: "Personal Project",
    role: "Product and Engineering Owner",
    facts: [
      SOURCE_FACT,
      "Designed evidence-bound resume generation and deterministic claim verification."
    ],
    skills: ["Node.js", "LangGraph", "SQLite", "Chrome MV3"],
    evidenceText: "Confirmed project evidence",
    evidenceSource: "m16-smoke",
    confidence: "user_confirmed"
  });
  store.createSkill({
    name: "Node.js",
    category: "engineering",
    proficiency: "proficient",
    evidence: [SOURCE_FACT]
  });
  store.createSkill({
    name: "LangGraph",
    category: "agent",
    proficiency: "proficient",
    evidence: [SOURCE_FACT]
  });
}

function sampleJobPayload() {
  return {
    source: "m16-real-model-agents-smoke",
    exportedAt: new Date().toISOString(),
    jobs: [{
      jobId: "m16-ai-product",
      title: "AI Agent Product Manager",
      company: "Quality Lab",
      salary: "20-30K",
      location: "Shanghai",
      experience: "1-3 years",
      education: "Bachelor",
      tags: ["Node.js", "LangGraph"],
      detailUrl: "https://www.zhipin.com/job_detail/m16-ai-product.html",
      description: [
        "负责 AI Agent 产品需求分析、工作流设计和质量评估。",
        "需要理解 Node.js、LangGraph 和本地数据工作流。",
        "参与用户研究并与工程团队协作完成产品落地。"
      ].join("\n")
    }]
  };
}

async function assertEvidenceGate(modelConfig) {
  try {
    await runResumeAgent(sampleResumeInput(), {
      mode: "llm",
      modelConfig,
      requestStructuredCompletion: async () => ({
        data: {
          headline: "AI Product Manager",
          summary: "",
          selectedSkillIds: [1],
          projects: [{
            sourceExperienceId: 2,
            skills: ["Node.js"],
            bullets: [{ text: "Invented a 500% result.", sourceFact: "Invented evidence" }]
          }],
          diffSummary: ["test"],
          compressionNotes: []
        },
        telemetry: {}
      })
    });
    return "";
  } catch (error) {
    return error.code || "";
  }
}

async function assertAuditCannotWeaken(modelConfig) {
  return runAuditAgent({
    resumeVersionId: 99,
    job: { title: "AI Product Manager" },
    screening: { matchScore: 90, riskScore: 10, recommendation: "auto_prepare" },
    profile: {},
    resumeFields: {
      name: "Candidate",
      projects: [{ title: "Project", bullets: ["Unsupported 500% growth"] }]
    },
    sourceMapping: [],
    unsupportedClaims: ["projects[0].bullets[0]"],
    renderMetadata: { renderQuality: { ok: true } }
  }, {
    mode: "hybrid",
    modelConfig,
    requestStructuredCompletion: async () => ({
      data: {
        jobFitReview: "good",
        recommendation: "approve",
        requiresUserConfirmation: false,
        confidence: "high",
        qualityIssues: [],
        recommendations: []
      },
      telemetry: {}
    })
  });
}

function sampleResumeInput() {
  return {
    application: { id: 1 },
    job: { title: "AI Product Manager", description: "Node.js LangGraph product workflow" },
    screening: { id: 1, matchScore: 90, recommendation: "auto_prepare" },
    profile: {
      profile: { displayName: "M16 Candidate", headline: "AI Product" },
      experiences: [{
        id: 2,
        kind: "project",
        title: "CareerFlow Local",
        organization: "Personal Project",
        role: "Owner",
        facts: [SOURCE_FACT],
        skills: ["Node.js", "LangGraph"]
      }],
      skills: [{ id: 1, name: "Node.js" }],
      constraints: []
    }
  };
}

async function startModelServer() {
  let callCount = 0;
  let screeningCalls = 0;
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      callCount += 1;
      const payload = JSON.parse(body || "{}");
      if (request.url?.includes("/chat/completions")) {
        const chatResponse = {
          id: `m16-chat-response-${callCount}`,
          object: "chat.completion",
          model: "m16-fixture-model",
          choices: [{
            index: 0,
            message: { role: "assistant", content: JSON.stringify({ ok: true }) },
            finish_reason: "stop"
          }],
          usage: {
            prompt_tokens: 20,
            completion_tokens: 10,
            total_tokens: 30,
            completion_tokens_details: { reasoning_tokens: 2 }
          }
        };
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(JSON.stringify(chatResponse)));
        return;
      }
      const system = payload.input?.[0]?.content || "";
      const user = JSON.parse(payload.input?.[1]?.content || "{}");
      let output;
      if (system.includes("ScreeningAgent")) {
        screeningCalls += 1;
        output = screeningCalls === 1 ? { matchScore: 90 } : screeningOutput();
      } else if (system.includes("ResumeFitEvaluator")) {
        const evidence = user.resumeEvidence?.[0] || { field: "", text: "" };
        output = {
          items: (user.jdRequirements || []).map((requirement) => ({
            requirementIndex: requirement.index,
            status: "covered",
            evidenceField: evidence.field,
            evidenceText: evidence.text,
            reason: "Fixture semantic match backed by exact resume evidence."
          })),
          recommendations: [],
          confidence: "high"
        };
      } else if (system.includes("AuditAgent")) {
        output = {
          jobFitReview: "good",
          recommendation: "approve",
          requiresUserConfirmation: false,
          confidence: "high",
          qualityIssues: [],
          recommendations: []
        };
      } else if (system.includes("ResumeAgent")) {
        output = {
          headline: "AI Agent Product Manager",
          summary: "",
          selectedSkillIds: [1, 2],
          projects: [{
            sourceExperienceId: 2,
            skills: ["Node.js", "LangGraph"],
            bullets: [{ text: SOURCE_FACT, sourceFact: SOURCE_FACT }]
          }],
          diffSummary: ["围绕 AI Agent 产品岗位重排项目证据。"],
          compressionNotes: ["保留一项核心项目以控制两页。"]
        };
      } else {
        output = {};
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        id: `m16-response-${callCount}`,
        output_text: JSON.stringify(output),
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
          output_tokens_details: { reasoning_tokens: 10 }
        }
      }));
    });
  });
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.on("error", reject);
  });
  server.calls = () => callCount;
  return server;
}

function screeningOutput() {
  return {
    matchScore: 90,
    riskScore: 10,
    recommendation: "auto_prepare",
    hardConditions: [{ name: "jd_complete", passed: true, reason: "JD is complete." }],
    matchedPoints: ["Confirmed Node.js and LangGraph evidence."],
    riskPoints: [],
    resumeStrategy: ["Prioritize CareerFlow Local."],
    requiresUserConfirmation: false,
    confidence: "high"
  };
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

if (require.main !== module) {
  module.exports = { main };
}
