#!/usr/bin/env node

"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createAgentShadowService } = require("../server/src/services/agent-shadow-service");
const { createJobStore, SCHEMA_VERSION } = require("../server/src/sqlite-store");

const ROOT = path.resolve(__dirname, "..");
const TOKEN = "m16-shadow-smoke-token";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const direct = await runDirectChecks();
  const api = await runApiChecks();
  const source = runSourceChecks();
  const checks = { ...direct.checks, ...api.checks, ...source };
  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({
    ok,
    checks,
    summary: {
      direct: direct.summary,
      api: api.summary
    }
  }, null, 2));
  process.exitCode = ok ? 0 : 1;
}

async function runDirectChecks() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m16-shadow-direct-"));
  const store = createJobStore({ dataDir });
  try {
    seedStore(store, "direct");
    const before = businessState(store);
    const calls = new Map();
    const observedProfileHeadlines = [];
    const observedDescriptions = [];
    const service = createAgentShadowService({
      store,
      modelConfigLoader: () => ({ configured: true, model: "shadow-fixture", wireApi: "chat" }),
      screeningRunner: async (input) => {
        const title = input.job.title;
        const count = Number(calls.get(title) || 0) + 1;
        calls.set(title, count);
        observedProfileHeadlines.push(input.profile.profile?.headline || "");
        observedDescriptions.push(input.job.description || "");
        if (title === "Flaky Shadow Role") {
          const error = new Error("Fixture transport failed");
          error.code = "SHADOW_FIXTURE_FAILURE";
          error.telemetry = fixtureTelemetry(5);
          throw error;
        }
        const score = Number(title.match(/(90|80|40)/)?.[1] || 20);
        return {
          provider: "hybrid",
          result: {
            matchScore: score,
            riskScore: 100 - score,
            recommendation: score >= 70 ? "auto_prepare" : "review_needed",
            matchedPoints: ["Confirmed Node.js evidence"],
            riskPoints: [],
            resumeStrategy: ["Use confirmed Agent workflow evidence"]
          },
          telemetry: fixtureTelemetry(15)
        };
      }
    });
    const prepared = service.prepareRun({
      mode: "hybrid",
      limit: 4,
      topK: 2,
      samplesPerTopJob: 3,
      requestDelayMs: 0
    });
    const queued = service.createRun(prepared);
    const frozen = service.getRun(queued.id);
    const activeReviewCode = captureErrorCode(() => service.addReview(frozen.items[0].id, {
      label: "CORRECT",
      reviewer: "shadow-smoke"
    }));
    store.updateProfile({ headline: "MUTATED AFTER SHADOW START" });
    store.database.prepare("UPDATE jobs SET description = ?").run(
      "MUTATED AFTER SHADOW START. This replacement remains a complete JD for later failure and recovery probes. ".repeat(3)
    );
    const completed = await service.executeRun(queued.id, prepared);
    const after = businessState(store);
    const strong = completed.items.find((item) => item.job.title === "Shadow Role 90");
    const medium = completed.items.find((item) => item.job.title === "Shadow Role 80");
    const low = completed.items.find((item) => item.job.title === "Shadow Role 40");
    const flaky = completed.items.find((item) => item.job.title === "Flaky Shadow Role");

    const firstReview = service.addReview(strong.id, {
      label: "CORRECT",
      reviewer: "shadow-smoke"
    });
    const correctedReview = service.addReview(strong.id, {
      label: "BAD_REASON",
      correctedRecommendation: "auto_prepare",
      reviewer: "shadow-smoke",
      note: "Ranking is correct but the explanation omitted product discovery evidence."
    });
    const reviewed = service.getRun(completed.run.id);
    const reviewedStrong = reviewed.items.find((item) => item.id === strong.id);
    const failureCandidates = service.listFailureCandidates({ limit: 20 });
    const missingNoteCode = captureErrorCode(() => service.addReview(medium.id, {
      label: "RISK_MISSED",
      reviewer: "shadow-smoke"
    }));

    const failedService = createAgentShadowService({
      store,
      modelConfigLoader: () => ({ configured: true, model: "shadow-fixture", wireApi: "chat" }),
      screeningRunner: async () => {
        const error = new Error("All samples failed");
        error.code = "SHADOW_ALL_FAILED_FIXTURE";
        throw error;
      }
    });
    const allFailed = await failedService.runNow({
      mode: "hybrid",
      applicationIds: [completed.items[0].applicationId],
      limit: 1,
      topK: 1,
      samplesPerTopJob: 1,
      requestDelayMs: 0
    });
    const interruptedPrepared = failedService.prepareRun({
      mode: "rules",
      applicationIds: [completed.items[1].applicationId],
      limit: 1,
      topK: 1,
      samplesPerTopJob: 1,
      requestDelayMs: 0
    });
    const interrupted = failedService.createRun(interruptedPrepared);
    const recoveredCount = failedService.recoverInterruptedRuns();
    const recovered = failedService.getRun(interrupted.id);

    return {
      checks: {
        schemaMigratedToShadowReview: SCHEMA_VERSION >= 16
          && store.getStats().schemaVersion === SCHEMA_VERSION,
        initialPassCoversEverySelectedJob: calls.size === 4,
        onlyTopKReceivesExtraSamples: strong.sampleCount === 3
          && medium.sampleCount === 3
          && low.sampleCount === 1
          && flaky.sampleCount === 1,
        sampleBudgetIsEnforced: completed.run.options.plannedSampleCount === 8
          && completed.run.sampleCount === 8,
        rankingUsesRepeatedAverage: strong.rank === 1 && medium.rank === 2 && low.rank === 3,
        partialFailureIsInspectable: completed.run.status === "PARTIAL"
          && flaky.status === "FAILED"
          && flaky.errors[0]?.code === "SHADOW_FIXTURE_FAILURE",
        snapshotsRemainImmutable: frozen.run.profileHash === completed.run.profileHash
          && observedProfileHeadlines.every((value) => value === "Shadow Candidate")
          && observedDescriptions.every((value) => !value.includes("MUTATED AFTER")),
        businessStateIsUnchanged: JSON.stringify(before) === JSON.stringify(after),
        telemetryAggregatesSamples: completed.run.modelInvocationCount === 8
          && completed.run.telemetry.usage.totalTokens === 110,
        reviewWaitsForTerminalRanking: activeReviewCode === "AGENT_SHADOW_REVIEW_RUN_ACTIVE",
        reviewsAreAppendOnly: firstReview.review.id < correctedReview.review.id
          && reviewedStrong.reviews.length === 2
          && reviewedStrong.latestReview.label === "BAD_REASON",
        failuresBecomePromotionCandidates: failureCandidates.failureCandidates.length === 1
          && failureCandidates.failureCandidates[0].review.label === "BAD_REASON",
        riskyReviewRequiresCorrectionNote: missingNoteCode === "AGENT_SHADOW_REVIEW_NOTE_REQUIRED",
        allSampleFailureIsTerminal: allFailed.run.status === "FAILED"
          && allFailed.run.errorCode === "AGENT_SHADOW_ALL_SAMPLES_FAILED",
        interruptedRunIsNotSilentlyResumed: recoveredCount === 1
          && recovered.run.status === "FAILED"
          && recovered.run.errorCode === "AGENT_SHADOW_RUN_INTERRUPTED"
      },
      summary: {
        runId: completed.run.id,
        status: completed.run.status,
        sampleCount: completed.run.sampleCount,
        ranks: completed.items.map((item) => ({ title: item.job.title, rank: item.rank })),
        reviewCount: reviewedStrong.reviews.length
      }
    };
  } finally {
    store.close();
    if (process.exitCode !== 1) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }
}

async function runApiChecks() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m16-shadow-api-"));
  const store = createJobStore({ dataDir });
  seedStore(store, "api");
  const before = businessState(store);
  const applicationIds = store.getApplications({ limit: 10 }).applications.slice(0, 3).map((item) => item.id);
  store.close();
  const port = await findFreePort();
  const server = spawn(process.execPath, ["server/src/server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      BOSS_DATA_DIR: dataDir,
      BOSS_SKIP_LEGACY_IMPORT: "1",
      BOSS_SYNC_TOKEN: TOKEN
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk.toString(); });
  server.stderr.on("data", (chunk) => { output += chunk.toString(); });
  try {
    await waitForHealth(port, server, () => output);
    const started = await requestJson(port, "POST", "/api/agent-shadow-runs", {
      mode: "rules",
      applicationIds,
      limit: 3,
      topK: 1,
      samplesPerTopJob: 2,
      requestDelayMs: 0
    }, TOKEN);
    const completed = await waitForShadowRun(port, started.run.id);
    const listed = await requestJson(port, "GET", "/api/agent-shadow-runs?limit=10");
    const review = await requestJson(port, "POST", `/api/agent-shadow-items/${completed.items[0].id}/reviews`, {
      label: "FALSE_POSITIVE",
      correctedRecommendation: "skip",
      reviewer: "api-shadow-smoke",
      note: "Fixture correction"
    }, TOKEN);
    const failures = await requestJson(port, "GET", "/api/agent-shadow-failures?limit=10");
    const afterStore = createJobStore({ dataDir });
    const after = businessState(afterStore);
    const stats = afterStore.getStats();
    afterStore.close();
    return {
      checks: {
        apiStartsAsynchronousRun: started.accepted === true && started.run.status === "QUEUED",
        apiRunReachesTerminalState: completed.run.status === "SUCCEEDED",
        apiTopKSamplingIsBounded: completed.run.sampleCount === 4
          && completed.items.filter((item) => item.sampleCount === 2).length === 1,
        apiListsPersistedRuns: listed.totalRuns === 1 && listed.runs[0].id === completed.run.id,
        apiStoresReview: review.review.label === "FALSE_POSITIVE",
        apiListsFailureCandidates: failures.failureCandidates.length === 1
          && failures.failureCandidates[0].review.id === review.review.id,
        apiStatsExposeShadowCounts: stats.agentShadowRunCount === 1 && stats.agentShadowReviewCount === 1,
        apiShadowHasNoBusinessSideEffects: JSON.stringify(before) === JSON.stringify(after)
      },
      summary: {
        runId: completed.run.id,
        status: completed.run.status,
        selectedCount: completed.run.selectedCount,
        sampleCount: completed.run.sampleCount,
        failureCandidates: failures.failureCandidates.length
      }
    };
  } finally {
    server.kill();
    await waitForExit(server).catch(() => {});
    if (process.exitCode !== 1) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } else {
      console.error(`M16.1 API smoke data retained: ${dataDir}\n${output}`);
    }
  }
}

function runSourceChecks() {
  const server = fs.readFileSync(path.join(ROOT, "server/src/server.js"), "utf8");
  const migration = fs.readFileSync(path.join(ROOT, "server/migrations/016_agent_shadow_review.sql"), "utf8");
  const plan = fs.readFileSync(path.join(ROOT, "docs/04_DEVELOPMENT_PLAN.md"), "utf8");
  return {
    serverExposesShadowContract: server.includes('"/api/agent-shadow-runs"')
      && server.includes("agentShadowService.addReview")
      && server.includes('"/api/agent-shadow-failures"'),
    migrationSeparatesRunSampleAndReviewData: migration.includes("agent_shadow_runs")
      && migration.includes("agent_shadow_items")
      && migration.includes("agent_shadow_samples")
      && migration.includes("agent_shadow_reviews"),
    developmentPlanRecordsNoBossBoundary: plan.includes("M16.1 真实岗位 Shadow 评审")
      && plan.includes("不写入 `browser_tasks`")
  };
}

function seedStore(store, suffix) {
  store.updateProfile({
    displayName: "Shadow Candidate",
    headline: "Shadow Candidate",
    target: { roles: ["AI Product Manager"] }
  });
  store.createExperience({
    kind: "project",
    title: "Agent Workflow",
    role: "Product Owner",
    facts: ["Built a local-first Node.js Agent workflow with evidence gates."],
    skills: ["Node.js", "AI Product"],
    evidenceText: "Confirmed fixture evidence",
    evidenceSource: "m16-shadow-smoke",
    confidence: "user_confirmed"
  });
  store.createSkill({ name: "Node.js", category: "engineering", proficiency: "proficient" });
  store.syncJobs({
    source: `m16-shadow-${suffix}`,
    jobs: [
      ["shadow-90", "Shadow Role 90"],
      ["shadow-80", "Shadow Role 80"],
      ["shadow-40", "Shadow Role 40"],
      ["shadow-flaky", "Flaky Shadow Role"]
    ].map(([jobId, title]) => ({
      jobId: `${jobId}-${suffix}`,
      title,
      company: "Shadow Labs",
      salary: "20-30K",
      location: "Shanghai",
      detailUrl: `https://www.zhipin.com/job_detail/${jobId}-${suffix}.html`,
      description: "AI product discovery, Node.js workflow, user research, data analysis, and cross-functional delivery. ".repeat(4)
    }))
  });
}

function businessState(store) {
  return {
    applications: store.database.prepare("SELECT id, status, status_reason FROM applications ORDER BY id").all(),
    screenings: Number(store.database.prepare("SELECT COUNT(*) AS count FROM screenings").get().count || 0),
    browserTasks: Number(store.database.prepare("SELECT COUNT(*) AS count FROM browser_tasks").get().count || 0),
    applicationEvents: Number(store.database.prepare("SELECT COUNT(*) AS count FROM application_events").get().count || 0)
  };
}

function fixtureTelemetry(totalTokens) {
  return {
    model: "shadow-fixture",
    wireApi: "chat",
    durationMs: 10,
    attemptCount: 1,
    usage: {
      inputTokens: Math.max(0, totalTokens - 5),
      outputTokens: Math.min(5, totalTokens),
      reasoningTokens: 0,
      totalTokens
    }
  };
}

function captureErrorCode(callback) {
  try {
    callback();
    return "";
  } catch (error) {
    return error.code || "";
  }
}

function requestJson(port, method, pathname, body = null, token = "") {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const headers = payload ? {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload)
    } : {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const request = http.request({ hostname: "127.0.0.1", port, path: pathname, method, headers }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => {
        let data;
        try {
          data = text ? JSON.parse(text) : {};
        } catch (error) {
          reject(error);
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(data.error || `HTTP ${response.statusCode}`);
          error.code = data.code || "HTTP_ERROR";
          reject(error);
          return;
        }
        resolve(data);
      });
    });
    request.on("error", reject);
    if (payload) {
      request.write(payload);
    }
    request.end();
  });
}

async function waitForShadowRun(port, runId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    const run = await requestJson(port, "GET", `/api/agent-shadow-runs/${runId}`);
    if (new Set(["SUCCEEDED", "PARTIAL", "FAILED"]).has(run.run.status)) {
      return run;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for Shadow run ${runId}`);
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(port, child, getOutput) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before health check: ${getOutput()}`);
    }
    try {
      const health = await requestJson(port, "GET", "/health");
      if (health.ok) {
        return;
      }
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`Timed out waiting for server health: ${getOutput()}`);
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("exit", resolve);
    child.once("error", reject);
    setTimeout(resolve, 2000);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
