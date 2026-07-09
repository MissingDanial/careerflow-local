#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createJobStore } = require("../server/src/sqlite-store");
const { runScreeningAgent } = require("../server/src/screening-agent");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const storeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m6-store-"));
  const apiDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m6-api-"));
  try {
    const storeResult = await runStoreChecks(storeDataDir);
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

async function runStoreChecks(dataDir) {
  const store = createJobStore({ dataDir });
  try {
    seedProfile(store);
    store.syncJobs(createPayload());
    const application = store.getApplications().applications[0];
    const input = store.getApplicationScreeningInput(application.id);
    const agentStarted = store.startAgentRun({
      agentName: "ScreeningAgent",
      applicationId: application.id,
      step: "score_job",
      provider: "rules",
      input: {
        application: input.application,
        job: input.job
      }
    });
    const agentResult = await runScreeningAgent(input, { mode: "rules" });
    const agentFinished = store.finishAgentRun(agentStarted.id, {
      status: "SUCCEEDED",
      provider: agentResult.provider,
      output: agentResult.result
    });
    const saved = store.createScreening({
      applicationId: application.id,
      agentRunId: agentFinished.id,
      provider: agentResult.provider,
      result: agentResult.result,
      metadata: { smoke: "store" }
    });
    const applications = store.getApplications();
    const screenings = store.getScreenings();
    const runs = store.getAgentRuns();
    const events = store.getApplicationEvents();
    const stats = store.getStats();

    return {
      checks: {
        storeBuildsScreeningInput: input.application.id === application.id
          && input.profile.skills.length >= 3
          && input.job.description.length > 300,
        storeRunsRuleScreeningAgent: agentResult.provider === "rules"
          && agentResult.result.matchScore >= 70
          && agentResult.result.recommendation === "auto_prepare",
        storePersistsAgentRun: agentFinished.status === "SUCCEEDED"
          && runs.runs[0]?.agentName === "ScreeningAgent",
        storePersistsScreening: saved.screening.id > 0
          && screenings.screenings[0]?.matchScore === agentResult.result.matchScore,
        storeAdvancesApplication: applications.applications[0]?.status === "SHORTLISTED"
          && saved.transition.toStatus === "SHORTLISTED",
        storeRecordsScreeningEvent: events.events[0]?.eventType === "SCREENING_COMPLETED",
        storeStatsExposeAgentAndScreeningCounts: stats.agentRunCount === 1
          && stats.screeningCount === 1
          && stats.schemaVersion >= 5
      },
      summary: {
        finalStatus: applications.applications[0]?.status,
        matchScore: saved.screening.matchScore,
        riskScore: saved.screening.riskScore,
        agentRunCount: stats.agentRunCount,
        screeningCount: stats.screeningCount
      }
    };
  } finally {
    store.close();
  }
}

async function runApiChecks(dataDir) {
  const port = 27000 + Math.floor(Math.random() * 1000);
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
    await seedProfileViaApi(port);
    await requestJson(port, "POST", "/api/jobs/sync", createPayload());
    const applications = await requestJson(port, "GET", "/api/applications?limit=10");
    const applicationId = applications.applications[0]?.id;
    const screened = await requestJson(port, "POST", `/api/applications/${applicationId}/screen`, {
      mode: "rules"
    });
    const screenings = await requestJson(port, "GET", "/api/screenings?limit=10");
    const runs = await requestJson(port, "GET", "/api/agent-runs?limit=10");
    const afterScreen = await requestJson(port, "GET", "/api/applications?limit=10");
    const stats = await requestJson(port, "GET", "/api/stats");

    await requestJson(port, "POST", "/api/jobs/sync", createPayload({
      jobId: "m6-force-llm-failure",
      title: "Failure Branch",
      detailUrl: "https://www.zhipin.com/job_detail/m6-force-llm-failure.html"
    }));
    const failureApp = (await requestJson(port, "GET", "/api/applications?limit=10"))
      .applications
      .find((item) => item.bossJobId === "m6-force-llm-failure");
    let llmFailureRejected = false;
    try {
      await requestJson(port, "POST", `/api/applications/${failureApp.id}/screen`, {
        mode: "llm",
        modelConfig: {
          configPath: path.join(dataDir, "missing-model-config.txt")
        }
      });
    } catch {
      llmFailureRejected = true;
    }
    const failureRuns = await requestJson(port, "GET", `/api/agent-runs?applicationId=${failureApp.id}&limit=10`);
    const failureApplications = await requestJson(port, "GET", "/api/applications?limit=10");
    const failedApplication = failureApplications.applications.find((item) => item.id === failureApp.id);

    return {
      checks: {
        apiScreensApplication: screened.ok
          && screened.screening.recommendation === "auto_prepare"
          && screened.transition.toStatus === "SHORTLISTED",
        apiListsScreenings: screenings.totalScreenings >= 1
          && screenings.screenings[0]?.applicationId === applicationId,
        apiListsAgentRuns: runs.totalAgentRuns >= 1
          && runs.runs[0]?.status === "SUCCEEDED",
        apiAdvancesApplication: afterScreen.applications[0]?.status === "SHORTLISTED",
        apiStatsExposeM6Counts: stats.agentRunCount >= 1
          && stats.screeningCount >= 1
          && stats.schemaVersion >= 5,
        apiRecordsForcedLlmFailure: llmFailureRejected
          && failureRuns.runs[0]?.status === "FAILED"
          && failureRuns.runs[0]?.errorCode === "LLM_CONFIG_INVALID",
        apiMovesForcedFailureToReview: failedApplication?.status === "NEEDS_USER_REVIEW"
      },
      summary: {
        screenedStatus: afterScreen.applications[0]?.status,
        matchScore: screened.screening.matchScore,
        runCount: runs.totalAgentRuns,
        screeningCount: screenings.totalScreenings,
        failureStatus: failedApplication?.status
      }
    };
  } finally {
    server.kill();
    await waitForExit(server);
  }
}

function runWiringChecks() {
  const serverJs = read("server/src/server.js");
  const storeJs = read("server/src/sqlite-store.js");
  const packageJson = read("package.json");
  return {
    checks: {
      serverExposesScreeningEndpoint: serverJs.includes("/screen")
        && serverJs.includes("runScreeningAgent"),
      serverExposesAgentRunAndScreeningLists: serverJs.includes("/api/agent-runs")
        && serverJs.includes("/api/screenings"),
      storeDefinesM6Tables: storeJs.includes("CREATE TABLE IF NOT EXISTS agent_runs")
        && storeJs.includes("CREATE TABLE IF NOT EXISTS screenings"),
      storeDefinesScreeningPersistence: storeJs.includes("createScreening(input")
        && storeJs.includes("getApplicationScreeningInput"),
      packageRunsM6Smoke: packageJson.includes("m6:screening:smoke")
        && packageJson.includes("server/src/screening-agent.js")
    }
  };
}

function seedProfile(store) {
  store.updateProfile({
    target: {
      roles: ["AI product manager", "Node.js", "BOSS automation"],
      cities: ["Nanning"]
    }
  });
  store.createSkill({ name: "Node.js", category: "engineering", proficiency: "proficient" });
  store.createSkill({ name: "SQLite", category: "database", proficiency: "proficient" });
  store.createSkill({ name: "Chrome Extension", category: "browser", proficiency: "familiar" });
  store.createExperience({
    kind: "project",
    title: "Boss Find local workflow",
    role: "Product and engineering owner",
    facts: [
      "Built Chrome Extension and Node.js SQLite backend for BOSS job capture.",
      "Designed applications state machine and browser task queue for retryable JD capture.",
      "Implemented local-first resume fact library and screening workflow."
    ],
    skills: ["Node.js", "SQLite", "Chrome Extension"],
    evidenceText: "Confirmed project facts from local resume source.",
    confidence: "user_confirmed"
  });
}

async function seedProfileViaApi(port) {
  await requestJson(port, "PUT", "/api/profile", {
    target: {
      roles: ["AI product manager", "Node.js", "BOSS automation"],
      cities: ["Nanning"]
    }
  });
  await requestJson(port, "POST", "/api/profile/skills", { name: "Node.js", category: "engineering", proficiency: "proficient" });
  await requestJson(port, "POST", "/api/profile/skills", { name: "SQLite", category: "database", proficiency: "proficient" });
  await requestJson(port, "POST", "/api/profile/skills", { name: "Chrome Extension", category: "browser", proficiency: "familiar" });
  await requestJson(port, "POST", "/api/profile/experiences", {
    kind: "project",
    title: "Boss Find local workflow",
    role: "Product and engineering owner",
    facts: [
      "Built Chrome Extension and Node.js SQLite backend for BOSS job capture.",
      "Designed applications state machine and browser task queue for retryable JD capture.",
      "Implemented local-first resume fact library and screening workflow."
    ],
    skills: ["Node.js", "SQLite", "Chrome Extension"],
    evidenceText: "Confirmed project facts from local resume source.",
    confidence: "user_confirmed"
  });
}

function createPayload(overrides = {}) {
  const jobId = overrides.jobId || "m6-screening-one";
  return {
    source: "m6-screening-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId,
        title: overrides.title || "AI Product Manager Node.js",
        company: "Alpha",
        salary: "20-30K",
        location: "Nanning",
        experience: "1-3 years",
        education: "Bachelor",
        tags: ["Node.js", "SQLite", "Chrome Extension", "AI Agent"],
        welfare: ["Remote friendly"],
        detailUrl: overrides.detailUrl || `https://www.zhipin.com/job_detail/${jobId}.html`,
        description: overrides.description || [
          "We need an AI product manager who can own BOSS automation workflow design.",
          "The role requires Node.js, SQLite, Chrome Extension, browser task queue, and local-first data workflow experience.",
          "Responsibilities include job capture quality analysis, applications state machine design, retryable browser tasks, and agent screening strategy.",
          "Candidates with hands-on resume fact library and screening workflow experience are preferred."
        ].join(" ")
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
