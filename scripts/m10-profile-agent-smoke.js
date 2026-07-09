#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { buildCareerContext } = require("../server/src/profile-agent");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m10-profile-agent-"));
  let serverProcess = null;
  try {
    const directResult = runDirectModuleChecks();
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
    const apiResult = await runApiChecks(port, dataDir);
    const wiring = runWiringChecks();
    const checks = {
      ...directResult.checks,
      ...apiResult.checks,
      ...wiring.checks
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      directResult: directResult.summary,
      apiResult: apiResult.summary
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    if (serverProcess) {
      serverProcess.kill();
      await waitForExit(serverProcess).catch(() => {});
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

function runDirectModuleChecks() {
  const result = buildCareerContext({
    profileBundle: sampleProfileBundle(),
    answers: {
      target_roles_missing: "AI Product Manager and AI Product Engineer"
    }
  }, {
    now: "2026-07-08T00:00:00.000Z"
  });
  const markdown = result.result.markdown;
  return {
    checks: {
      directBuildsMarkdown: result.ok === true
        && markdown.includes("# Career Agent Context")
        && markdown.includes("## 6. 关键项目与经历素材库"),
      directKeepsPendingAsExpressionRisk: result.result.context.expressionRiskFacts.some((item) => item.riskLevel === "expression-risk")
        && !result.result.context.resumeReadyFacts.some((item) => /Boundary Draft/.test(item.title)),
      directAddsProjectLinks: markdown.includes("https://github.com/MissingDanial/SmartStor-EduHub"),
      directIncludesRewriteRules: markdown.includes("学历背景 -> 实习与项目")
    },
    summary: result.result.summary
  };
}

async function runApiChecks(port, dataDir) {
  await seedProfile(port);
  const resume = await requestJson(port, "POST", "/api/profile/resume-sources", {
    sourceType: "text",
    fileName: "m10-profile-agent-resume.txt",
    rawText: sampleResumeText()
  });
  const drafts = await requestJson(port, "POST", `/api/profile/resume-sources/${resume.id}/drafts`, {});
  const pendingBefore = await requestJson(port, "GET", "/api/profile/fact-drafts?status=PENDING&limit=100");
  const generated = await requestJson(port, "POST", "/api/profile/career-context", {
    resumeSourceId: resume.id,
    answers: [
      {
        id: "target_roles_missing",
        answer: "优先 AI 产品、AI 产品工程和产品经理。"
      }
    ]
  });
  const fetched = await requestJson(port, "GET", "/api/profile/career-context");
  const pendingAfter = await requestJson(port, "GET", "/api/profile/fact-drafts?status=PENDING&limit=100");
  const agentRuns = await requestJson(port, "GET", "/api/agent-runs?limit=20");
  const workflowEvents = await requestJson(port, "GET", "/api/workflow-events?limit=50");
  const workflowErrors = await requestJson(port, "GET", "/api/workflow-errors?sourceType=agent_run&limit=50");
  const stats = await requestJson(port, "GET", "/api/stats");
  const contextPath = path.join(dataDir, "career_context", "career_agent_context.md");

  return {
    checks: {
      apiCreatesPendingDrafts: drafts.created > 0
        && pendingBefore.drafts.length === drafts.created,
      apiGeneratesCareerContextFile: generated.ok === true
        && generated.careerContext.file
        && fs.existsSync(contextPath)
        && fs.readFileSync(contextPath, "utf8").includes("# Career Agent Context"),
      apiReadsCareerContextFile: fetched.careerContext.exists === true
        && fetched.careerContext.markdown.includes("后续 Agent 必须追问的问题"),
      apiKeepsPendingDraftsPending: pendingAfter.drafts.length === pendingBefore.drafts.length
        && pendingAfter.drafts.every((draft) => draft.status === "PENDING"),
      apiRecordsProfileAgentRun: agentRuns.runs.some((run) => run.agentName === "ProfileAgent"
        && run.step === "generate_career_context"
        && run.status === "SUCCEEDED"),
      apiRecordsWorkflowEventsAndWarnings: workflowEvents.events.some((event) => event.eventType === "CAREER_CONTEXT_GENERATED")
        && workflowEvents.events.some((event) => event.eventType === "AGENT_RUN_SUCCEEDED" && event.metadata?.agentName === "ProfileAgent"),
      apiOpenQuestionsAreInspectable: generated.missingQuestions.length > 0
        && workflowErrors.errors.some((event) => event.errorCode === "CAREER_CONTEXT_HAS_OPEN_QUESTIONS"),
      apiStatsReflectAgentAndWorkflowEvents: stats.agentRunCount >= 1
        && stats.workflowEventCount >= 2
    },
    summary: {
      resumeSourceId: resume.id,
      createdDrafts: drafts.created,
      pendingDraftsBefore: pendingBefore.drafts.length,
      pendingDraftsAfter: pendingAfter.drafts.length,
      contextFile: generated.careerContext.file?.filePath || "",
      missingQuestions: generated.missingQuestions.length,
      workflowEvents: workflowEvents.events.length
    }
  };
}

async function seedProfile(port) {
  await requestJson(port, "PUT", "/api/profile", {
    displayName: "M10 Profile Candidate",
    headline: "AI Product Candidate",
    location: "Nanning",
    target: {
      roles: ["AI Product Manager", "AI Product Engineer"],
      cities: ["Nanning", "Shenzhen"]
    },
    summary: "面向 AI 产品和产品工程岗位，突出真实项目、用户需求拆解和本地自动化系统搭建经验。"
  });
  await requestJson(port, "POST", "/api/profile/experiences", {
    kind: "education",
    title: "Example University",
    organization: "Example University",
    role: "Information Management",
    startDate: "2022-09",
    endDate: "2026-06",
    facts: ["Bachelor candidate with product and AI project practice."],
    skills: ["Product analysis"],
    evidenceText: "Confirmed education background for ProfileAgent smoke.",
    evidenceSource: "manual_seed",
    confidence: "user_confirmed"
  });
  await requestJson(port, "POST", "/api/profile/experiences", {
    kind: "project",
    title: "SmartStor-EduHub",
    organization: "Local Project",
    role: "Product owner",
    startDate: "2025-10",
    endDate: "2026-03",
    facts: [
      "Built an AI education copilot workflow around lesson planning and teacher productivity.",
      "Designed user scenarios, prompt flow, and local delivery demos."
    ],
    skills: ["AI Product", "Prompt Engineering", "Node.js"],
    evidenceText: "Confirmed project evidence. Repo: https://github.com/MissingDanial/SmartStor-EduHub",
    evidenceSource: "manual_seed",
    confidence: "user_confirmed"
  });
  await requestJson(port, "POST", "/api/profile/skills", {
    name: "AI Product",
    category: "product",
    proficiency: "proficient",
    evidence: ["SmartStor-EduHub"]
  });
  await requestJson(port, "POST", "/api/profile/skills", {
    name: "Node.js",
    category: "engineering",
    proficiency: "familiar",
    evidence: ["SmartStor-EduHub"]
  });
  await requestJson(port, "POST", "/api/profile/constraints", {
    ruleType: "excluded_direction",
    content: "销售",
    severity: "blocker"
  });
}

function runWiringChecks() {
  const packageJson = read("package.json");
  const serverJs = read("server/src/server.js");
  const profileServiceJs = read("server/src/services/profile-service.js");
  const profileAgentJs = read("server/src/profile-agent.js");
  const readme = read("README.md");
  const docsWorkflow = read("docs/03_AGENT_WORKFLOW.md");
  const docsPlan = read("docs/04_DEVELOPMENT_PLAN.md");
  return {
    checks: {
      packageRunsProfileAgentSmokeAndCheck: packageJson.includes("server/src/profile-agent.js")
        && packageJson.includes("server/src/services/profile-service.js")
        && packageJson.includes("m10:profile-agent:smoke"),
      serverExposesCareerContextEndpoints: serverJs.includes("/api/profile/career-context")
        && serverJs.includes("profileService.generateCareerContext")
        && profileServiceJs.includes("buildCareerContext"),
      profileAgentDefinesFilePersistence: profileAgentJs.includes("writeCareerContextFile")
        && profileAgentJs.includes("readCareerContextFile")
        && profileAgentJs.includes("expression-risk")
        && profileServiceJs.includes("pendingFactsRemainPending"),
      docsRecordProfileAgentPersistence: readme.includes("M10.2d")
        && docsWorkflow.includes("M10.2d")
        && docsPlan.includes("M10.2d")
    }
  };
}

function sampleProfileBundle() {
  return {
    profile: {
      id: 1,
      displayName: "Direct Candidate",
      headline: "AI Product Candidate",
      target: {
        roles: ["AI Product Manager"]
      }
    },
    resumeSources: [
      {
        id: 1,
        fileName: "direct-resume.txt",
        rawText: sampleResumeText()
      }
    ],
    experiences: [
      {
        id: 1,
        kind: "project",
        title: "SmartStor-EduHub",
        organization: "Local Project",
        role: "Product owner",
        facts: ["Built AI education copilot workflow."],
        skills: ["AI Product", "Node.js"],
        evidenceText: "Repo: https://github.com/MissingDanial/SmartStor-EduHub",
        evidenceSource: "manual_seed",
        confidence: "user_confirmed"
      }
    ],
    skills: [
      {
        id: 1,
        name: "AI Product",
        category: "product",
        proficiency: "proficient",
        evidence: ["SmartStor-EduHub"]
      }
    ],
    constraints: [
      {
        id: 1,
        ruleType: "excluded_direction",
        content: "直播",
        severity: "blocker"
      }
    ],
    pendingFactDrafts: [
      {
        id: 10,
        draftType: "experience",
        status: "PENDING",
        title: "Boundary Draft Project",
        content: {
          title: "Boundary Draft Project",
          facts: ["Commercial boundary needs confirmation."],
          skills: ["Product analysis"]
        },
        evidenceText: "Boundary Draft Project evidence from resume."
      }
    ]
  };
}

function sampleResumeText() {
  return [
    "Projects",
    "Boundary Draft Project | Product Practice | 2025.01-2025.06",
    "- Participated in a commercial-style AI product validation project with unclear public boundary.",
    "- Used Node.js, SQLite, Prompt Engineering, and product analysis to build a demo.",
    "Skills",
    "Node.js, SQLite, Prompt Engineering, AI Product, Product analysis",
    "Education",
    "Example University | Information Management | 2022.09-2026.06"
  ].join("\n");
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
