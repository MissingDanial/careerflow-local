#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createJobStore } = require("../server/src/sqlite-store");
const { evaluateJobRiskGate, runScreeningAgent } = require("../server/src/screening-agent");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const storeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m6-risk-store-"));
  const apiDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m6-risk-api-"));
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
    store.syncJobs(createPayload("m6-risk-sales", {
      title: "AI 产品销售顾问",
      tags: ["销售", "客户开发"],
      description: [
        "岗位需要负责 AI 产品销售、客户开发、电话邀约和商务转化。",
        "需要根据线索进行陌拜和销售跟进，完成销售业绩目标。"
      ].join(" ")
    }));
    store.syncJobs(createPayload("m6-risk-product", {
      title: "AI 产品经理实习生",
      tags: ["AI 产品", "用户研究", "Agent"],
      description: goodProductDescription()
    }));

    const applications = store.getApplications({ limit: 10 }).applications;
    const salesApp = applications.find((item) => item.bossJobId === "m6-risk-sales");
    const productApp = applications.find((item) => item.bossJobId === "m6-risk-product");
    const salesInput = store.getApplicationScreeningInput(salesApp.id);
    const productInput = store.getApplicationScreeningInput(productApp.id);
    const directGate = evaluateJobRiskGate(salesInput);
    const salesAgentResult = await runScreeningAgent(salesInput, { mode: "rules" });
    const productAgentResult = await runScreeningAgent(productInput, { mode: "rules" });
    const agentRun = store.startAgentRun({
      agentName: "ScreeningAgent",
      applicationId: salesApp.id,
      step: "risk_gate_smoke",
      provider: salesAgentResult.provider,
      input: { job: salesInput.job }
    });
    const finishedRun = store.finishAgentRun(agentRun.id, {
      status: "SUCCEEDED",
      provider: salesAgentResult.provider,
      output: salesAgentResult.result
    });
    const saved = store.createScreening({
      applicationId: salesApp.id,
      agentRunId: finishedRun.id,
      provider: salesAgentResult.provider,
      result: salesAgentResult.result,
      metadata: { smoke: "risk_gate_store" }
    });
    const skippedApplication = store.getApplications({ limit: 10 }).applications.find((item) => item.id === salesApp.id);
    return {
      checks: {
        storeAcceptsExcludedDirectionConstraint: salesInput.profile.constraints.some((item) => item.ruleType === "excluded_direction"),
        directGateBlocksSalesDirection: directGate.blocked
          && directGate.level === "high"
          && directGate.matchedDirections.includes("销售"),
        agentShortCircuitsBeforeFitScore: salesAgentResult.provider === "risk_gate"
          && salesAgentResult.result.recommendation === "skip"
          && salesAgentResult.result.matchScore === 0
          && salesAgentResult.result.riskScore === 100,
        agentAllowsNormalProductJob: productAgentResult.provider === "rules"
          && productAgentResult.result.recommendation !== "skip"
          && productAgentResult.result.matchScore > 0,
        storePersistsRiskGateMetadata: saved.screening.metadata?.riskGate?.blocked === true
          && saved.screening.riskPoints.some((point) => point.includes("Excluded direction matched")),
        storeTransitionsRiskGateToSkipped: skippedApplication.status === "SKIPPED"
          && saved.transition.toStatus === "SKIPPED"
      },
      summary: {
        salesProvider: salesAgentResult.provider,
        salesRecommendation: salesAgentResult.result.recommendation,
        salesStatus: skippedApplication.status,
        productProvider: productAgentResult.provider,
        productRecommendation: productAgentResult.result.recommendation
      }
    };
  } finally {
    store.close();
  }
}

async function runApiChecks(dataDir) {
  const port = 29500 + Math.floor(Math.random() * 1000);
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
    await requestJson(port, "POST", "/api/jobs/sync", createPayload("m6-risk-api-live", {
      title: "直播电商产品运营",
      tags: ["直播", "带货", "中控"],
      description: [
        "负责直播间商品节奏、主播协同、直播带货转化和场控执行。",
        "需要长期关注直播数据并推动 GMV 目标达成。"
      ].join(" ")
    }));
    await requestJson(port, "POST", "/api/jobs/sync", createPayload("m6-risk-api-product", {
      title: "AI Agent 产品经理",
      tags: ["AI 产品", "Agent", "用户研究"],
      description: goodProductDescription()
    }));
    const apps = await requestJson(port, "GET", "/api/applications?limit=10");
    const liveApp = apps.applications.find((item) => item.bossJobId === "m6-risk-api-live");
    const productApp = apps.applications.find((item) => item.bossJobId === "m6-risk-api-product");
    const blocked = await requestJson(port, "POST", `/api/applications/${liveApp.id}/screen`, { mode: "rules" });
    const allowed = await requestJson(port, "POST", `/api/applications/${productApp.id}/screen`, { mode: "rules" });
    await requestJson(port, "POST", "/api/jobs/sync", createPayload("m6-risk-api-sales-rescreen", {
      title: "AI 产品销售顾问",
      tags: ["销售", "客户开发"],
      description: [
        "负责 AI 产品销售、客户开发、电话邀约和商务转化。",
        "需要根据线索进行陌拜和销售跟进，完成销售业绩目标。",
        "候选人需要持续拓展客户资源，推进合同签约、回款计划和客户复购，岗位核心目标是商业销售结果而非产品设计。"
      ].join(" ")
    }));
    await requestJson(port, "POST", "/api/jobs/sync", createPayload("m6-risk-api-product-rescreen", {
      title: "AI Agent 增长产品经理",
      tags: ["AI 产品", "Agent", "用户研究"],
      description: goodProductDescription()
    }));
    const rescreenCandidates = await requestJson(port, "GET", "/api/screening-candidates?limit=20&includeAlreadyScreened=1&status=DETAIL_CAPTURED&status=SCORED&status=SHORTLISTED&status=NEEDS_USER_REVIEW");
    const salesRescreenApp = rescreenCandidates.candidates.find((item) => item.bossJobId === "m6-risk-api-sales-rescreen");
    const productRescreenApp = rescreenCandidates.candidates.find((item) => item.bossJobId === "m6-risk-api-product-rescreen");
    const riskOnly = await requestJson(port, "POST", "/api/applications/screen-batch", {
      mode: "rules",
      limit: 20,
      continueOnError: true,
      riskGateOnly: true,
      includeAlreadyScreened: true,
      statuses: ["DETAIL_CAPTURED", "SCORED", "SHORTLISTED", "NEEDS_USER_REVIEW"],
      userRules: {
        excludedDirections: ["销售"]
      }
    });
    const screeningsAfterRiskOnly = await requestJson(port, "GET", "/api/screenings?limit=20");
    const after = await requestJson(port, "GET", "/api/applications?limit=10");
    const blockedApp = after.applications.find((item) => item.id === liveApp.id);
    const allowedApp = after.applications.find((item) => item.id === productApp.id);
    const salesRescreenAfter = after.applications.find((item) => item.bossJobId === "m6-risk-api-sales-rescreen");
    const productRescreenAfter = after.applications.find((item) => item.bossJobId === "m6-risk-api-product-rescreen");
    const salesRiskOnlyResult = riskOnly.results.find((item) => item.applicationId === salesRescreenApp.id);
    const productRiskOnlyResult = riskOnly.results.find((item) => item.applicationId === productRescreenApp.id);
    const productRiskOnlyScreenings = screeningsAfterRiskOnly.screenings.filter((item) => item.applicationId === productRescreenApp.id);
    return {
      checks: {
        apiBlocksExcludedLivestreamDirection: blocked.screening.provider === "risk_gate"
          && blocked.screening.recommendation === "skip"
          && blocked.screening.metadata?.riskGate?.blocked === true,
        apiTransitionsBlockedApplicationToSkipped: blockedApp.status === "SKIPPED",
        apiKeepsNormalJobInScoringFlow: allowed.screening.provider === "rules"
          && allowed.screening.matchScore > 0
          && allowedApp.status !== "SKIPPED",
        apiRiskOnlyRescreenSkipsMatchingDirection: riskOnly.ok
          && salesRiskOnlyResult?.recommendation === "skip"
          && salesRiskOnlyResult?.riskScore === 100
          && salesRescreenAfter.status === "SKIPPED",
        apiRiskOnlyRescreenLeavesNonMatchesUntouched: productRiskOnlyResult?.skipped === true
          && productRiskOnlyResult?.reason === "risk_gate_not_matched"
          && productRescreenAfter.status === "DETAIL_CAPTURED"
          && productRiskOnlyScreenings.length === 0
      },
      summary: {
        blockedProvider: blocked.screening.provider,
        blockedStatus: blockedApp.status,
        allowedProvider: allowed.screening.provider,
        allowedStatus: allowedApp.status,
        riskOnlySucceeded: riskOnly.succeeded,
        riskOnlySkippedNoMatch: riskOnly.results.filter((item) => item.skipped).length
      }
    };
  } finally {
    server.kill();
    await waitForExit(server);
  }
}

function runWiringChecks() {
  const packageJson = read("package.json");
  const screeningAgent = read("server/src/screening-agent.js");
  const storeJs = read("server/src/sqlite-store.js");
  return {
    checks: {
      packageRunsRiskGateSmoke: packageJson.includes("m6:risk-gate:smoke")
        && packageJson.includes("scripts/m6-risk-gate-smoke.js"),
      screeningAgentUsesRiskGate: screeningAgent.includes("evaluateJobRiskGate")
        && screeningAgent.includes('provider: "risk_gate"'),
      storeAcceptsExcludedDirection: storeJs.includes("excluded_direction")
    }
  };
}

function seedProfile(store) {
  store.updateProfile({
    target: {
      roles: ["AI 产品经理", "Agent 产品"],
      cities: ["北京", "上海", "深圳"]
    }
  });
  store.createSkill({ name: "用户研究", category: "product", proficiency: "proficient" });
  store.createSkill({ name: "Agent", category: "ai", proficiency: "familiar" });
  store.createConstraint({ ruleType: "excluded_direction", content: "销售", severity: "blocker" });
  store.createConstraint({ ruleType: "excluded_direction", content: "直播", severity: "blocker" });
}

async function seedProfileViaApi(port) {
  await requestJson(port, "PUT", "/api/profile", {
    target: {
      roles: ["AI 产品经理", "Agent 产品"],
      cities: ["北京", "上海", "深圳"]
    }
  });
  await requestJson(port, "POST", "/api/profile/skills", { name: "用户研究", category: "product", proficiency: "proficient" });
  await requestJson(port, "POST", "/api/profile/skills", { name: "Agent", category: "ai", proficiency: "familiar" });
  await requestJson(port, "POST", "/api/profile/constraints", { ruleType: "excluded_direction", content: "销售", severity: "blocker" });
  await requestJson(port, "POST", "/api/profile/constraints", { ruleType: "excluded_direction", content: "直播", severity: "blocker" });
}

function createPayload(jobId, overrides = {}) {
  return {
    source: "m6-risk-gate-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId,
        title: overrides.title || "AI Product Job",
        company: "Risk Gate Co",
        salary: "20-30K",
        location: "Beijing",
        experience: "1-3 years",
        education: "Bachelor",
        tags: overrides.tags || [],
        welfare: [],
        detailUrl: `https://www.zhipin.com/job_detail/${jobId}.html`,
        description: overrides.description || goodProductDescription()
      }
    ]
  };
}

function goodProductDescription() {
  return [
    "负责 AI Agent 产品需求分析、用户研究、功能设计和迭代推进。",
    "需要理解大模型产品能力，与研发协作完成 PRD、原型、数据指标和用户体验优化。",
    "候选人需要有 AI 项目经验、提示词使用经验、跨部门沟通能力和产品落地意识。"
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
