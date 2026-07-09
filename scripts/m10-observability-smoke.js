#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m10-observability-"));
  let serverProcess = null;
  try {
    const port = await findFreePort();
    serverProcess = spawn(process.execPath, ["server/src/server.js"], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        BOSS_DATA_DIR: dataDir,
        BOSS_SKIP_LEGACY_IMPORT: "1"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let serverOutput = "";
    serverProcess.stdout.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
    serverProcess.stderr.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
    await waitForHealth(port, serverProcess, () => serverOutput);
    const apiResult = await runApiChecks(port);
    const wiring = runWiringChecks();
    const checks = {
      ...apiResult.checks,
      ...wiring.checks
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({ ok, checks, apiResult: apiResult.summary }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    if (serverProcess) {
      serverProcess.kill();
      await waitForExit(serverProcess).catch(() => {});
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function runApiChecks(port) {
  await seedProfile(port);
  await requestJson(port, "POST", "/api/jobs/sync", createPayload());
  const applications = await requestJson(port, "GET", "/api/applications?limit=5");
  const application = applications.applications[0];
  await requestJson(port, "POST", `/api/applications/${application.id}/screen`, { mode: "rules" });
  await requestJson(port, "POST", `/api/applications/${application.id}/workflow-plan`, {
    provider: "rules",
    requestedBy: "m10-observability-smoke"
  });
  await requestJson(port, "POST", "/api/applications/screen-batch", {
    applicationIds: [application.id],
    mode: "rules",
    continueOnError: true
  });
  const task = await requestJson(port, "POST", "/api/browser-tasks", {
    applicationId: application.id,
    taskType: "CAPTURE_DETAIL",
    payload: {
      jobId: application.bossJobId,
      title: application.title,
      company: application.company,
      detailUrl: application.detailUrl,
      sourceUrl: application.detailUrl
    }
  });
  await requestJson(port, "POST", "/api/browser-tasks/claim", {
    taskTypes: ["CAPTURE_DETAIL"],
    sourceUrl: application.detailUrl
  });
  await requestJson(port, "POST", `/api/browser-tasks/${task.id}/transition`, {
    toStatus: "FAILED",
    errorMessage: "SELECTOR_CHANGED",
    result: {
      ok: false,
      errorCode: "SELECTOR_CHANGED",
      message: "No detail container found.",
      page: {
        url: application.detailUrl,
        title: "BOSS detail"
      }
    }
  });

  const timeline = await requestJson(port, "GET", `/api/applications/${application.id}/timeline?limit=100`);
  const events = await requestJson(port, "GET", `/api/workflow-events?applicationId=${application.id}&limit=100`);
  const errors = await requestJson(port, "GET", `/api/workflow-errors?applicationId=${application.id}&limit=50`);
  const browserError = errors.errors.find((event) => event.eventType === "BROWSER_TASK_FAILED");
  const resolved = await requestJson(port, "POST", `/api/workflow-errors/${browserError.id}/resolve`, {
    status: "RESOLVED",
    resolvedBy: "m10-observability-smoke",
    note: "Selector updated after diagnostics."
  });
  const afterResolve = await requestJson(port, "GET", `/api/workflow-errors?applicationId=${application.id}&limit=50`);
  const stats = await requestJson(port, "GET", "/api/stats");

  return {
    checks: {
      apiStatsExposeSchemaV8AndCounts: stats.schemaVersion === 8
        && stats.workflowEventCount >= 1
        && typeof stats.openWorkflowErrorCount === "number",
      apiTimelineIncludesAgentBrowserAndWorkflow: timeline.items.some((item) => item.sourceType === "agent_run")
        && timeline.items.some((item) => item.sourceType === "browser_task")
        && timeline.items.some((item) => item.eventType === "SCREENING_BATCH_ITEM_SUCCEEDED")
        && timeline.items.some((item) => item.eventType === "WORKFLOW_PLAN_SUCCEEDED"),
      apiWorkflowEventsExposeProgress: events.events.some((event) => event.eventType === "SCREENING_BATCH_ITEM_SUCCEEDED"
        && event.progress.current === 1
        && event.progress.total === 1),
      apiWorkflowErrorsExposeBrowserFailure: Boolean(browserError)
        && browserError.errorCode === "SELECTOR_CHANGED"
        && browserError.resolutionStatus === "OPEN",
      apiWorkflowErrorCanBeResolved: resolved.ok === true
        && resolved.event.resolutionStatus === "RESOLVED"
        && !afterResolve.errors.some((event) => event.id === browserError.id),
      apiTimelineKeepsDryRunBoundaryMetadata: timeline.items.some((item) => item.sourceType === "browser_task"
        && item.eventType === "BROWSER_TASK_FAILED"
        && item.metadata?.dryRunOnly === false)
    },
    summary: {
      applicationId: application.id,
      timelineItems: timeline.totalItems,
      workflowEventCount: events.events.length,
      openErrorsBeforeResolve: errors.totalErrors,
      openErrorsAfterResolve: afterResolve.totalErrors,
      resolvedEventId: resolved.event.id
    }
  };
}

function runWiringChecks() {
  const packageJson = read("package.json");
  const serverJs = read("server/src/server.js");
  const storeJs = read("server/src/sqlite-store.js");
  const readme = read("README.md");
  const docsWorkflow = read("docs/03_AGENT_WORKFLOW.md");
  const docsPlan = read("docs/04_DEVELOPMENT_PLAN.md");
  const docsReuse = read("docs/05_OPEN_SOURCE_REUSE.md");
  return {
    checks: {
      serverExposesObservabilityEndpoints: serverJs.includes("/api/workflow-events")
        && serverJs.includes("/api/workflow-errors")
        && serverJs.includes("/timeline"),
      storeDefinesWorkflowEventsAndTimeline: storeJs.includes("CREATE TABLE IF NOT EXISTS workflow_events")
        && storeJs.includes("getApplicationTimeline")
        && storeJs.includes("resolveWorkflowError")
        && storeJs.includes("recordWorkflowEvent"),
      packageRunsM10ObservabilitySmokeAndCheck: packageJson.includes("m10-observability-smoke.js")
        && packageJson.includes("m10:observability:smoke"),
      docsRecordM10Observability: readme.includes("M10.2b")
        && docsWorkflow.includes("M10.2b")
        && docsPlan.includes("M10.2b")
        && docsReuse.includes("M10.2b")
    }
  };
}

async function seedProfile(port) {
  await requestJson(port, "PUT", "/api/profile", {
    displayName: "M10 Observability Candidate",
    headline: "AI Product Engineer",
    target: {
      roles: ["AI Product Engineer"],
      cities: ["Nanning"]
    }
  });
  await requestJson(port, "POST", "/api/profile/skills", {
    name: "Node.js",
    category: "engineering",
    proficiency: "proficient"
  });
  await requestJson(port, "POST", "/api/profile/skills", {
    name: "SQLite",
    category: "database",
    proficiency: "proficient"
  });
  await requestJson(port, "POST", "/api/profile/experiences", {
    kind: "project",
    title: "Boss Find observability",
    organization: "Local Project",
    role: "Product engineer",
    facts: [
      "Designed SQLite-backed workflow timelines and error queues.",
      "Built local browser task diagnostics for BOSS job capture."
    ],
    skills: ["Node.js", "SQLite"],
    evidenceText: "Confirmed local project experience for smoke testing.",
    confidence: "user_confirmed"
  });
}

function createPayload() {
  return {
    source: "m10-observability-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId: "m10-observability-one",
        title: "AI Product Engineer Observability",
        company: "Workflow Logs Co",
        salary: "25-40K",
        location: "Nanning",
        experience: "1-3 years",
        education: "Bachelor",
        tags: ["Node.js", "SQLite", "Workflow"],
        detailUrl: "https://www.zhipin.com/job_detail/m10-observability-one.html",
        sourceUrl: "https://www.zhipin.com/web/geek/jobs?query=observability",
        description: [
          "Build local-first job application workflows with persistent progress hooks, error logs, and correction queues.",
          "Own browser extension task diagnostics, agent execution timeline, and SQLite-backed audit records.",
          "Candidates should understand Node.js, SQLite, deterministic workflow state, and safe automation boundaries."
        ].join(" ")
      }
    ]
  };
}

function requestJson(port, method, pathname, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method,
      headers: payload ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      } : {}
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        text += chunk;
      });
      response.on("end", () => {
        let data = null;
        try {
          data = text ? JSON.parse(text) : {};
        } catch (error) {
          reject(error);
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(data?.error || `HTTP ${response.statusCode}`));
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

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
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
      if (health?.ok) {
        return;
      }
    } catch {
      await sleep(150);
    }
  }
  throw new Error(`Timed out waiting for server health: ${getOutput()}`);
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("exit", () => resolve());
    child.once("error", reject);
    setTimeout(resolve, 2000);
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
