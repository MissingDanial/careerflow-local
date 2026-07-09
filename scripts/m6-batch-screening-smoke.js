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
  const apiDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m6-batch-api-"));
  try {
    const apiResult = await runApiChecks(apiDataDir);
    const wiring = runWiringChecks();
    const checks = {
      ...apiResult.checks,
      ...wiring.checks
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      apiResult: apiResult.summary
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    fs.rmSync(apiDataDir, { recursive: true, force: true });
  }
}

async function runApiChecks(dataDir) {
  const port = 28000 + Math.floor(Math.random() * 1000);
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
    await requestJson(port, "POST", "/api/jobs/sync", createPayload("m6-batch-high", {
      title: "Node.js AI Product Manager",
      tags: ["Node.js", "SQLite", "Chrome Extension", "AI Agent"],
      description: goodDescription("Node.js SQLite Chrome Extension AI Agent")
    }));
    await requestJson(port, "POST", "/api/jobs/sync", createPayload("m6-batch-review", {
      title: "General Product Assistant",
      tags: ["Research"],
      description: goodDescription("research documentation coordination")
    }));
    await requestJson(port, "POST", "/api/jobs/sync", createPayload("m6-batch-missing", {
      title: "Missing JD",
      tags: [],
      description: "short"
    }));

    const before = await requestJson(port, "GET", "/api/screening-candidates?limit=10");
    const batch = await requestJson(port, "POST", "/api/applications/screen-batch", {
      mode: "rules",
      limit: 10,
      continueOnError: true
    });
    const screenings = await requestJson(port, "GET", "/api/screenings?limit=10");
    const runs = await requestJson(port, "GET", "/api/agent-runs?limit=10");
    const after = await requestJson(port, "GET", "/api/screening-candidates?limit=10");
    const applications = await requestJson(port, "GET", "/api/applications?limit=20");

    const forcedFailure = await requestJson(port, "POST", "/api/applications/screen-batch", {
      applicationIds: batch.results.map((item) => item.applicationId),
      mode: "llm",
      modelConfig: {
        configPath: path.join(dataDir, "missing-model-config.txt")
      },
      continueOnError: true
    });
    const failedRuns = await requestJson(port, "GET", "/api/agent-runs?limit=20");

    return {
      checks: {
        apiListsOnlyDescribedCandidates: before.totalCandidates === 2
          && before.candidates.every((item) => item.descriptionLength >= 80),
        apiBatchScreensCandidates: batch.ok
          && batch.selected === 2
          && batch.succeeded === 2
          && batch.results.every((item) => item.ok),
        apiPersistsBatchScreenings: screenings.totalScreenings === 2
          && screenings.screenings.every((item) => item.matchScore >= 0 && item.riskScore >= 0),
        apiPersistsBatchRuns: runs.totalAgentRuns === 2
          && runs.runs.every((item) => item.status === "SUCCEEDED"),
        apiSkipsAlreadyScreenedCandidates: after.totalCandidates === 0,
        apiAdvancesApplicationStatuses: applications.applications.some((item) => item.status === "SHORTLISTED")
          && applications.applications.some((item) => item.status === "SCORED" || item.status === "SKIPPED"),
        apiBatchContinuesOnForcedFailures: !forcedFailure.ok
          && forcedFailure.failed === 2
          && forcedFailure.results.every((item) => !item.ok),
        apiForcedFailuresCreateFailedRuns: failedRuns.runs.filter((item) => item.status === "FAILED").length >= 2
      },
      summary: {
        candidatesBefore: before.totalCandidates,
        batchSelected: batch.selected,
        batchSucceeded: batch.succeeded,
        candidatesAfter: after.totalCandidates,
        forcedFailureCount: forcedFailure.failed
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
      serverExposesScreeningCandidates: serverJs.includes("/api/screening-candidates")
        && storeJs.includes("getScreeningCandidates"),
      serverExposesBatchScreening: serverJs.includes("/api/applications/screen-batch")
        && serverJs.includes("screenApplicationsBatch"),
      packageRunsBatchSmoke: packageJson.includes("m6:screening-batch:smoke")
    }
  };
}

async function seedProfileViaApi(port) {
  await requestJson(port, "PUT", "/api/profile", {
    target: {
      roles: ["AI Product Manager", "Node.js"],
      cities: ["Nanning"]
    }
  });
  await requestJson(port, "POST", "/api/profile/skills", { name: "Node.js", category: "engineering", proficiency: "proficient" });
  await requestJson(port, "POST", "/api/profile/skills", { name: "SQLite", category: "database", proficiency: "proficient" });
  await requestJson(port, "POST", "/api/profile/skills", { name: "Chrome Extension", category: "browser", proficiency: "familiar" });
  await requestJson(port, "POST", "/api/profile/experiences", {
    kind: "project",
    title: "Boss Find workflow",
    role: "Owner",
    facts: [
      "Built Node.js SQLite backend and Chrome Extension workflow.",
      "Designed agent screening workflow for BOSS job applications."
    ],
    skills: ["Node.js", "SQLite", "Chrome Extension"],
    evidenceText: "Confirmed smoke profile.",
    confidence: "user_confirmed"
  });
}

function createPayload(jobId, overrides = {}) {
  return {
    source: "m6-batch-screening-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId,
        title: overrides.title || "Screening Job",
        company: "Batch Co",
        salary: "20-30K",
        location: "Nanning",
        experience: "1-3 years",
        education: "Bachelor",
        tags: overrides.tags || [],
        welfare: ["Remote friendly"],
        detailUrl: `https://www.zhipin.com/job_detail/${jobId}.html`,
        description: overrides.description || goodDescription("")
      }
    ]
  };
}

function goodDescription(keywords) {
  return [
    "This role owns local-first job application workflow quality and delivery.",
    "The team expects strong product judgement, structured analysis, and practical implementation coordination.",
    `Relevant keywords include ${keywords}.`,
    "Responsibilities include requirement analysis, data quality review, workflow design, and cross-functional execution."
  ].join(" ");
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
