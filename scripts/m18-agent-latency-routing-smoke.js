#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { ResumePlanOutputSchema } = require("../server/src/agent-output-schemas");
const { resolveAgentRuntime } = require("../server/src/agent-runtime-policy");
const {
  assessRevisionOpportunity,
  runResumeWorkflowGraph,
  selectRevisionOutcome
} = require("../server/src/resume-workflow-graph");
const { createJobStore } = require("../server/src/sqlite-store");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m18-latency-"));
  const store = createJobStore({ dataDir });
  try {
    seedProfile(store);
    store.syncJobs(jobPayload());
    const application = store.getApplications({ limit: 10 }).applications[0];
    const commonInput = {
      store,
      applicationId: application.id,
      mode: "rules",
      modelConfig: { model: "rules-fixture" },
      maxRevisions: 1,
      renderDocx: false,
      renderOptions: { templateName: "m18-cache-fixture" }
    };

    const firstStarted = Date.now();
    const first = await runResumeWorkflowGraph(commonInput);
    const firstDurationMs = Date.now() - firstStarted;
    const firstSnapshot = store.getWorkflowRun(first.workflowRunId);

    const cachedStarted = Date.now();
    const cached = await runResumeWorkflowGraph(commonInput);
    const cachedDurationMs = Date.now() - cachedStarted;
    const cachedSnapshot = store.getWorkflowRun(cached.workflowRunId);

    const forced = await runResumeWorkflowGraph({
      ...commonInput,
      reuseCompletedRun: false
    });
    const forcedSnapshot = store.getWorkflowRun(forced.workflowRunId);
    const latestFit = store.getLatestResumeFitEvaluationForResumeVersion(first.resumeVersion.id);
    const noEvidenceDecision = assessRevisionOpportunity({
      maxRevisions: 1,
      revisionCount: 0,
      resumeFitEvaluation: {
        policy: { requiresResumeRevision: true, canProceedToAudit: true },
        coverageItems: [{
          status: "missing",
          requirement: "Post-launch metrics",
          evidenceField: "",
          evidenceText: ""
        }]
      },
      resumeClaimVerification: {
        unsupportedCount: 0,
        needsUserConfirmationCount: 0,
        policy: {}
      }
    });
    const actionableDecision = assessRevisionOpportunity({
      maxRevisions: 1,
      revisionCount: 0,
      resumeFitEvaluation: {
        policy: { requiresResumeRevision: true, canProceedToAudit: true },
        coverageItems: [{
          status: "weak",
          requirement: "User research",
          evidenceField: "projects[0].bullets[0]",
          evidenceText: "Interviewed 20 users."
        }]
      },
      resumeClaimVerification: {
        unsupportedCount: 0,
        needsUserConfirmationCount: 0,
        policy: {}
      }
    });
    const hiddenSkillDecision = assessRevisionOpportunity({
      maxRevisions: 1,
      revisionCount: 0,
      profile: store.getProfile(),
      resumeVersion: first.resumeVersion,
      resumeFitEvaluation: {
        policy: { requiresResumeRevision: true, canProceedToAudit: false },
        coverageItems: [{
          type: "skill",
          status: "missing",
          requirement: "PRD",
          evidenceField: "",
          evidenceText: ""
        }]
      },
      resumeClaimVerification: {
        unsupportedCount: 0,
        needsUserConfirmationCount: 0,
        policy: {}
      }
    });
    const rejectedRevision = selectRevisionOutcome({
      revisionBaseResumeVersion: { id: 10 },
      revisionBaseFitEvaluation: { coverageScore: 67, blockers: [] },
      revisionBaseClaimVerification: { unsupportedCount: 0, needsUserConfirmationCount: 0 },
      resumeVersion: { id: 11 },
      resumeFitEvaluation: { coverageScore: 66, blockers: [] },
      resumeClaimVerification: { unsupportedCount: 0, needsUserConfirmationCount: 0 }
    });
    const resumeRuntime = resolveAgentRuntime({
      mode: "hybrid",
      modelConfig: { model: "gpt-5.4-mini", wireApi: "chat" },
      modelRoutes: {
        ResumeAgent: {
          model: "gpt-5.5",
          wireApi: "responses",
          reasoningEffort: "low",
          maxRetries: 1
        }
      }
    }, "ResumeAgent");
    const screeningRuntime = resolveAgentRuntime({
      mode: "hybrid",
      modelConfig: { model: "gpt-5.4-mini", wireApi: "chat" },
      modelRoutes: {
        ResumeAgent: { model: "gpt-5.5", wireApi: "responses" }
      }
    }, "ScreeningAgent");
    const providerStringIds = ResumePlanOutputSchema.safeParse({
      headline: "AI Product Intern",
      summary: "",
      selectedSkillIds: ["1", "2"],
      projects: [{
        sourceExperienceId: "3",
        skills: ["AI Product"],
        bullets: [{ text: "Confirmed evidence.", sourceFact: "Confirmed evidence." }]
      }],
      diffSummary: ["Tailored to JD."],
      compressionNotes: ["Two-page layout."]
    });

    const checks = {
      firstRunCompletesNormally: first.ok && first.reused === false && firstSnapshot.agentRuns.length >= 5,
      identicalRunUsesWorkflowCache: cached.ok
        && cached.reused === true
        && cached.reusedFromWorkflowRunId === first.workflowRunId
        && cachedSnapshot.agentRuns.length === 0,
      semanticHashIgnoresApplicationProgress: first.inputSnapshot.inputHash === cached.inputSnapshot.inputHash,
      forcedRunBypassesWorkflowCache: forced.ok && forced.reused === false,
      forcedRunReusesScreening: !forcedSnapshot.agentRuns.some((run) => run.agentName === "ScreeningAgent")
        && forced.screening.id === first.screening.id,
      fitObjectsSurviveSqliteRoundTrip: Array.isArray(latestFit.coverageItems)
        && latestFit.coverageItems.length > 0
        && latestFit.coverageItems.every((item) => item && typeof item === "object"),
      hiddenTemplateFieldsDoNotEnterQualityGates: first.resumeVersion.resumeFields.summary === ""
        && first.resumeVersion.resumeFields.skills.length === 0
        && first.resumeVersion.sourceMapping.every((mapping) => {
          return mapping.resumeField !== "summary" && !/^skills\[[0-9]+\]$/.test(mapping.resumeField);
        }),
      missingWithoutEvidenceSkipsRevision: noEvidenceDecision.shouldRevise === false
        && noEvidenceDecision.skippedNoActionableEvidence === true
        && noEvidenceDecision.canProceedToAudit === true,
      weakWithEvidenceAllowsRevision: actionableDecision.shouldRevise === true
        && actionableDecision.actionableCoverageCount === 1,
      hiddenSkillWithProjectEvidenceAllowsRevision: hiddenSkillDecision.shouldRevise === true
        && hiddenSkillDecision.actionableCoverageCount === 1,
      lowerQualityRevisionIsRejected: rejectedRevision?.accepted === false
        && rejectedRevision.baseFitScore === 67
        && rejectedRevision.revisedFitScore === 66,
      resumeAgentCanRouteToGpt55Responses: resumeRuntime.mode === "hybrid"
        && resumeRuntime.modelConfig.model === "gpt-5.5"
        && resumeRuntime.modelConfig.wireApi === "responses"
        && resumeRuntime.modelConfig.reasoningEffort === "low"
        && resumeRuntime.modelConfig.maxRetries === 1,
      otherAgentsKeepBaseModel: screeningRuntime.modelConfig.model === "gpt-5.4-mini"
        && screeningRuntime.modelConfig.wireApi === "chat",
      providerNumericStringIdsAreNormalized: providerStringIds.success
        && providerStringIds.data.selectedSkillIds.every((id) => Number.isInteger(id))
        && Number.isInteger(providerStringIds.data.projects[0].sourceExperienceId)
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      summary: {
        firstWorkflowRunId: first.workflowRunId,
        cachedWorkflowRunId: cached.workflowRunId,
        forcedWorkflowRunId: forced.workflowRunId,
        firstAgentRunCount: firstSnapshot.agentRuns.length,
        cachedAgentRunCount: cachedSnapshot.agentRuns.length,
        forcedAgentRunCount: forcedSnapshot.agentRuns.length,
        firstDurationMs,
        cachedDurationMs,
        fitCoverageItemCount: latestFit.coverageItems.length
      }
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    store.close();
    if (process.exitCode === 0) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } else {
      console.error(`Smoke data retained for debugging: ${dataDir}`);
    }
  }
}

function seedProfile(store) {
  store.updateProfile({
    displayName: "Latency Candidate",
    headline: "AI Product Candidate",
    location: "Shanghai",
    target: {
      roles: ["AI Product Intern"],
      cities: ["Shanghai"]
    },
    summary: "Confirmed AI product, user research, PRD, and Agent workflow experience."
  });
  for (const name of ["AI Product", "Agent Workflow", "User Research", "PRD", "Node.js"]) {
    store.createSkill({
      name,
      category: "product",
      proficiency: "proficient",
      evidence: [`Confirmed ${name} evidence.`]
    });
  }
  store.createExperience({
    kind: "education",
    title: "Design Master Program",
    organization: "Sample University",
    role: "Graduate Student",
    startDate: "2024.09",
    endDate: "2027.06",
    facts: ["Applied design research and systems thinking to AI product discovery."],
    skills: ["User Research", "AI Product"],
    evidenceText: "Confirmed education evidence.",
    evidenceSource: "m18-agent-latency-routing-smoke",
    confidence: "user_confirmed"
  });
  store.createExperience({
    kind: "project",
    title: "Agent Product Workflow",
    organization: "Personal Project",
    role: "Product Owner",
    facts: [
      "Interviewed 20 users and converted findings into product requirements and a PRD.",
      "Built a Node.js Agent workflow with explicit quality gates and structured evaluation.",
      "Delivered a working AI product prototype and reviewed results with engineering collaborators."
    ],
    skills: ["AI Product", "Agent Workflow", "User Research", "PRD", "Node.js"],
    evidenceText: "Confirmed project evidence.",
    evidenceSource: "m18-agent-latency-routing-smoke",
    confidence: "user_confirmed"
  });
}

function jobPayload() {
  return {
    source: "m18-agent-latency-routing-smoke",
    exportedAt: new Date().toISOString(),
    jobs: [{
      jobId: "m18-ai-product-intern",
      title: "AI Product Intern",
      company: "Sample AI Company",
      salary: "200-300/day",
      location: "Shanghai",
      experience: "Student",
      education: "Bachelor or above",
      tags: ["AI Product", "Agent Workflow", "User Research", "PRD", "Node.js"],
      detailUrl: "https://www.zhipin.com/job_detail/m18-ai-product-intern.html",
      description: [
        "Own AI product discovery, user research, requirement analysis, and PRD delivery.",
        "Design Agent workflows and collaborate with engineering to ship a working prototype.",
        "Track product quality, user feedback, and iteration results with structured evidence."
      ].join("\n")
    }]
  };
}
