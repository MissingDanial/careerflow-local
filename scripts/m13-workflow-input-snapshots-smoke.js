#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createJobStore, SCHEMA_VERSION } = require("../server/src/sqlite-store");
const {
  AGENT_VERSION,
  GRAPH_VERSION,
  PROMPT_VERSION,
  runResumeWorkflowGraph
} = require("../server/src/resume-workflow-graph");
const { createResumeWorkflowService } = require("../server/src/services/resume-workflow-service");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m13-workflow-inputs-"));
  const store = createJobStore({ dataDir });
  try {
    seedProfile(store);
    store.syncJobs(jobPayload("AI Product Workflow Intern", originalDescription()));
    const application = store.getApplications({ limit: 10 }).applications[0];
    const service = createResumeWorkflowService({ store, dataDir });
    const graphResult = await runResumeWorkflowGraph({
      store,
      applicationId: application.id,
      mode: "rules",
      modelConfig: {
        model: "local-rules-fixture",
        baseUrl: "http://127.0.0.1:9999",
        apiKey: "must-not-be-persisted"
      },
      userRules: {
        excludedDirections: ["销售", "直播"]
      },
      maxRevisions: 0,
      renderDocx: false
    });
    const original = service.getWorkflowRun(graphResult.workflowRunId);
    const originalFrozenCopy = JSON.stringify({
      application: original.application,
      profile: original.profile,
      job: original.job,
      inputSnapshot: original.inputSnapshot
    });
    const expectedAgents = [
      "ScreeningAgent",
      "ResumeAgent",
      "ResumeFitEvaluator",
      "ClaimVerifier",
      "AuditAgent"
    ];

    store.updateProfile({
      displayName: "Changed Candidate",
      summary: "This mutable profile text must not affect the historical workflow run."
    });
    store.syncJobs(jobPayload("Changed Senior 销售 Role", changedDescription()));

    const historicalAfterEdit = service.getWorkflowRun(graphResult.workflowRunId);
    const historicalAfterEditCopy = JSON.stringify({
      application: historicalAfterEdit.application,
      profile: historicalAfterEdit.profile,
      job: historicalAfterEdit.job,
      inputSnapshot: historicalAfterEdit.inputSnapshot
    });
    const changedGraphResult = await runResumeWorkflowGraph({
      store,
      applicationId: application.id,
      mode: "rules",
      modelConfig: {
        model: "local-rules-fixture-v2",
        apiKey: "must-also-not-be-persisted"
      },
      userRules: {
        excludedDirections: ["销售", "直播"]
      },
      maxRevisions: 0,
      renderDocx: false
    });
    const freshRun = service.getWorkflowRun(changedGraphResult.workflowRunId);

    const beforeReplay = immutableCounts(store, application.id);
    const replay = await service.replayWorkflowRun(graphResult.workflowRunId, {});
    const afterReplay = immutableCounts(store, application.id);
    const listed = service.getWorkflowRuns({
      applicationId: application.id,
      limit: 10
    });
    const apiScenario = await runApiScenario();
    const serverSource = fs.readFileSync(path.join(__dirname, "..", "server", "src", "server.js"), "utf8");
    const stats = store.getStats();
    const agentRuns = original.agentRuns;
    const checks = {
      schemaMigratedToCurrentVersion: stats.schemaVersion === SCHEMA_VERSION
        && SCHEMA_VERSION === 14,
      graphCompletesWithWorkflowRun: graphResult.ok
        && graphResult.workflowRunId > 0
        && graphResult.inputSnapshot.profileSnapshotId > 0
        && graphResult.inputSnapshot.jobSnapshotId > 0,
      workflowRunFinishesWithFrozenManifest: original.workflowRun.status === "SUCCEEDED"
        && original.inputSnapshot.graphVersion === GRAPH_VERSION
        && original.inputSnapshot.promptVersion === PROMPT_VERSION
        && original.inputSnapshot.agentVersion === AGENT_VERSION
        && original.inputSnapshot.inputHash.length === 64,
      modelSecretsAreNotPersisted: original.inputSnapshot.modelConfig.model === "local-rules-fixture"
        && !Object.hasOwn(original.inputSnapshot.modelConfig, "apiKey")
        && agentRuns.every((run) => !Object.hasOwn(run.modelConfig, "apiKey")),
      allGraphAgentsUseOneSnapshotSet: expectedAgents.every((agentName) => (
        agentRuns.some((run) => run.agentName === agentName)
      )) && agentRuns.every((run) => (
        run.workflowRunId === graphResult.workflowRunId
        && run.profileSnapshotId === original.inputSnapshot.profileSnapshotId
        && run.jobSnapshotId === original.inputSnapshot.jobSnapshotId
        && run.promptVersion === PROMPT_VERSION
        && run.agentVersion === AGENT_VERSION
        && run.graphVersion === GRAPH_VERSION
      )),
      profileAndJdEditsDoNotChangeHistory: originalFrozenCopy === historicalAfterEditCopy
        && historicalAfterEdit.profile.profile.displayName === "Snapshot Candidate"
        && historicalAfterEdit.job.title === "AI Product Workflow Intern"
        && historicalAfterEdit.job.description === originalDescription(),
      newRunCapturesNewSnapshotIds: changedGraphResult.ok === false
        && changedGraphResult.stopReason === "screening_recommendation_skip"
        && freshRun.workflowRun.status === "STOPPED"
        && freshRun.inputSnapshot.profileSnapshotId !== original.inputSnapshot.profileSnapshotId
        && freshRun.inputSnapshot.jobSnapshotId !== original.inputSnapshot.jobSnapshotId
        && freshRun.inputSnapshot.inputHash !== original.inputSnapshot.inputHash
        && freshRun.profile.profile.displayName === "Changed Candidate"
        && freshRun.job.title === "Changed Senior 销售 Role",
      replayUsesHistoricalInputs: replay.replay.sourceWorkflowRunId === graphResult.workflowRunId
        && replay.replay.inputSnapshot.inputHash === original.inputSnapshot.inputHash
        && replay.comparison.matches === true,
      replayIsReadOnly: JSON.stringify(beforeReplay) === JSON.stringify(afterReplay)
        && replay.replay.noPersistentWrites === true
        && replay.replay.noApplicationStatusChange === true
        && replay.replay.noBrowserTaskCreated === true,
      serviceListsRuns: listed.workflowRuns.length === 2
        && listed.workflowRuns.some((run) => run.id === graphResult.workflowRunId)
        && listed.workflowRuns.some((run) => run.id === changedGraphResult.workflowRunId),
      statsExposeSnapshotCounts: stats.profileSnapshotCount === 2
        && stats.workflowRunCount === 2
        && stats.workflowInputSnapshotCount === 2,
      replayAndReadRoutesExist: serverSource.includes('url.pathname === "/api/workflow-runs"')
        && serverSource.includes("workflowRunMatch")
        && serverSource.includes("workflowReplayMatch"),
      replayAndReadRoutesWork: apiScenario.readWorkflowRun
        && apiScenario.listWorkflowRuns
        && apiScenario.replayWorkflowRun
        && apiScenario.replayReadOnly
    };

    console.log(JSON.stringify({
      ok: Object.values(checks).every(Boolean),
      checks,
      summary: {
        applicationId: application.id,
        workflowRunId: graphResult.workflowRunId,
        profileSnapshotId: original.inputSnapshot.profileSnapshotId,
        jobSnapshotId: original.inputSnapshot.jobSnapshotId,
        freshWorkflowRunId: changedGraphResult.workflowRunId,
        agentRunCount: agentRuns.length,
        replayMatches: replay.comparison.matches,
        apiWorkflowRunId: apiScenario.workflowRunId,
        applicationStatus: afterReplay.applicationStatus
      }
    }, null, 2));
    process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
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
    displayName: "Snapshot Candidate",
    headline: "AI Product Candidate",
    location: "Shenzhen",
    target: {
      roles: ["AI Product Intern"]
    },
    summary: "Confirmed user research and local Agent workflow experience."
  });
  store.createSkill({
    name: "用户研究",
    category: "product",
    proficiency: "proficient",
    evidence: ["Confirmed project interviews."]
  });
  store.createSkill({
    name: "Node.js",
    category: "engineering",
    proficiency: "familiar",
    evidence: ["Confirmed local workflow implementation."]
  });
  store.createExperience({
    kind: "project",
    title: "CareerFlow Local",
    organization: "Personal Project",
    role: "Product Owner",
    facts: [
      "Built a local-first Agent workflow for job capture, JD evaluation, resume generation, and audit.",
      "Interviewed users and converted workflow problems into product requirements and smoke tests."
    ],
    skills: ["用户研究", "Node.js", "Agent Workflow"],
    evidenceText: "Confirmed local project evidence.",
    evidenceSource: "m13-workflow-inputs-smoke",
    confidence: "user_confirmed"
  });
}

function jobPayload(title, description) {
  return {
    source: "m13-workflow-inputs-smoke",
    exportedAt: new Date().toISOString(),
    jobs: [{
      jobId: "m13-workflow-input-job",
      title,
      company: "Snapshot AI",
      salary: "150-250/day",
      location: "Shenzhen",
      experience: "Intern",
      education: "Bachelor",
      tags: ["用户研究", "Node.js"],
      welfare: ["Mentorship"],
      detailUrl: "https://www.zhipin.com/job_detail/m13-workflow-input-job.html",
      description
    }]
  };
}

function originalDescription() {
  return [
    "Participate in AI product discovery, user research, and Agent workflow design.",
    "Translate requirements into Node.js prototypes, acceptance criteria, and measurable workflow improvements.",
    "Use confirmed project evidence to communicate product decisions with engineering partners."
  ].join("\n");
}

function changedDescription() {
  return [
    "Changed mutable JD for a senior sales and livestream direction.",
    "Own sales targets, livestream conversion, customer acquisition, and commercial closing.",
    "This text is intentionally longer than the original description so the mutable jobs row is replaced.",
    "Historical workflow input must continue to expose the original AI product JD."
  ].join("\n");
}

function immutableCounts(store, applicationId) {
  const stats = store.getStats();
  const application = store.getApplications({ limit: 10 }).applications
    .find((item) => item.id === applicationId);
  return {
    workflowRunCount: stats.workflowRunCount,
    workflowInputSnapshotCount: stats.workflowInputSnapshotCount,
    profileSnapshotCount: stats.profileSnapshotCount,
    agentRunCount: stats.agentRunCount,
    screeningCount: stats.screeningCount,
    resumeVersionCount: stats.resumeVersionCount,
    resumeFitEvaluationCount: stats.resumeFitEvaluationCount,
    resumeClaimVerificationCount: stats.resumeClaimVerificationCount,
    resumeAuditCount: stats.resumeAuditCount,
    workflowEventCount: stats.workflowEventCount,
    browserTaskCount: stats.browserTaskCount,
    applicationStatus: application?.status || ""
  };
}

async function runApiScenario() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m13-workflow-api-"));
  const seedStore = createJobStore({ dataDir });
  let workflowRunId;
  try {
    seedProfile(seedStore);
    seedStore.syncJobs(jobPayload("API Snapshot Role", originalDescription()));
    const application = seedStore.getApplications({ limit: 10 }).applications[0];
    const graphResult = await runResumeWorkflowGraph({
      store: seedStore,
      applicationId: application.id,
      mode: "rules",
      maxRevisions: 0,
      renderDocx: false
    });
    workflowRunId = graphResult.workflowRunId;
  } finally {
    seedStore.close();
  }

  const port = 32000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server", "src", "server.js")], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      BOSS_DATA_DIR: dataDir,
      BOSS_SKIP_LEGACY_IMPORT: "1"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForServer(port, child, output);
    const beforeStats = await requestJson(port, "GET", "/api/stats");
    const read = await requestJson(port, "GET", `/api/workflow-runs/${workflowRunId}`);
    const listed = await requestJson(port, "GET", "/api/workflow-runs?limit=10");
    const replay = await requestJson(port, "POST", `/api/workflow-runs/${workflowRunId}/replay`, {});
    const afterStats = await requestJson(port, "GET", "/api/stats");
    return {
      workflowRunId,
      readWorkflowRun: read.workflowRun?.id === workflowRunId
        && read.inputSnapshot?.inputHash?.length === 64,
      listWorkflowRuns: listed.workflowRuns?.some((run) => run.id === workflowRunId),
      replayWorkflowRun: replay.replay?.sourceWorkflowRunId === workflowRunId
        && replay.comparison?.matches === true,
      replayReadOnly: beforeStats.workflowRunCount === afterStats.workflowRunCount
        && beforeStats.agentRunCount === afterStats.agentRunCount
        && beforeStats.resumeVersionCount === afterStats.resumeVersionCount
        && beforeStats.applicationEventCount === afterStats.applicationEventCount
    };
  } finally {
    child.kill();
    await waitForExit(child, 3000);
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

async function waitForServer(port, child, output) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Backend exited before health check: ${output}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry while the local backend starts.
    }
    await delay(100);
  }
  throw new Error(`Backend did not become healthy: ${output}`);
}

async function requestJson(port, method, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${pathname} failed with ${response.status}: ${text}`);
  }
  return JSON.parse(text || "{}");
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) {
    return;
  }
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(timeoutMs)
  ]);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
