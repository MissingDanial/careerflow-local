#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { TEST_TIERS } = require("./test-tiers");

const ROOT = path.join(__dirname, "..");
const packageJson = readJson("package.json");
const sqliteStoreSource = readText("server/src/sqlite-store.js");
const ciWorkflowSource = readText(".github/workflows/ci.yml");
const developmentPlan = readText("docs/04_DEVELOPMENT_PLAN.md");
const readme = readText("README.md");
const readmeZh = readText("README.zh-CN.md");

main();

function main() {
  const requiredPaths = [
    ".gitignore",
    "README.md",
    "README.zh-CN.md",
    "boss-model.example.json",
    "package-lock.json",
    "extension/manifest.json",
    "extension/src/background.js",
    "extension/src/content.js",
    "server/data/.gitkeep",
    "server/src/server.js",
    "server/src/sqlite-store.js",
    "server/src/sqlite-migrations.js",
    "server/src/services/application-transition-service.js",
    "server/src/services/real-action-authorization-service.js",
    "server/src/services/profile-conversation-service.js",
    "server/src/services/agent-shadow-service.js",
    "server/src/services/model-config-service.js",
    "server/src/profile-conversation-agent.js",
    "server/src/agent-evaluation-runner.js",
    "server/src/agent-output-schemas.js",
    "server/src/real-model-evaluation-runner.js",
    "server/src/resume-workflow-graph.js",
    "evaluation/fixtures/m13-agent-evaluation.v1.json",
    "scripts/check-js-syntax.js",
    "scripts/run-agent-evaluation.js",
    "scripts/run-test-tier.js",
    "scripts/test-tiers.js",
    "scripts/m13-repository-baseline-smoke.js",
    "scripts/m13-sqlite-migrations-smoke.js",
    "scripts/m13-workflow-input-snapshots-smoke.js",
    "scripts/m13-application-transition-invariants-smoke.js",
    "scripts/m13-agent-evaluation-smoke.js",
    "scripts/m14-real-action-authorization-smoke.js",
    "scripts/m14-extension-real-greeting-smoke.js",
    "scripts/m15-profile-conversation-memory-smoke.js",
    "scripts/m15-options-profile-conversation-smoke.js",
    "scripts/m16-real-model-agents-smoke.js",
    "scripts/m16-agent-quality-evaluation-smoke.js",
    "scripts/m16-options-agent-quality-smoke.js",
    "scripts/m16-1-agent-shadow-review-smoke.js",
    "scripts/m16-1-options-shadow-review-smoke.js",
    "scripts/m17-application-queues-smoke.js",
    "scripts/m17-model-config-smoke.js",
    "scripts/m17-native-host-smoke.js",
    "scripts/m17-popup-runtime-smoke.js",
    "scripts/m17-options-queues-runtime-smoke.js",
    "scripts/build-native-host.js",
    "scripts/install-native-host.ps1",
    "native-host/index.js",
    "scripts/run-real-model-evaluation.js",
    ".github/workflows/ci.yml",
    ...Array.from({ length: 18 }, (_, index) => {
      const version = String(index + 1).padStart(3, "0");
      const migrationNames = [
        "core_job_capture",
        "capture_quality",
        "applications",
        "browser_tasks",
        "candidate_profile",
        "agent_screening",
        "resume_workflow",
        "workflow_observability",
        "resume_fit_evaluations",
        "resume_claim_verifications",
        "workflow_input_snapshots",
        "application_transition_invariants",
        "real_action_authorization",
        "profile_conversation_memory",
        "agent_model_quality",
        "agent_shadow_review",
        "application_queues",
        "manual_application_tracking"
      ];
      return `server/migrations/${version}_${migrationNames[index]}.sql`;
    }),
    ...Array.from({ length: 8 }, (_, index) => `docs/${String(index + 1).padStart(2, "0")}_${
      [
        "PRD",
        "TECH_ARCHITECTURE",
        "AGENT_WORKFLOW",
        "DEVELOPMENT_PLAN",
        "OPEN_SOURCE_REUSE",
        "BOSS_PLATFORM_LOGIC",
        "BROWSER_EXECUTOR_POC",
        "FIRECRAWL_DECISION"
      ][index]
    }.md`)
  ];
  const requiredScripts = [
    "check",
    "check:syntax",
    "test:profile",
    "test:agents",
    "test:extension",
    "test:workflow",
    "test:baseline",
    "test:ci",
    "agent:evaluate",
    "agent:evaluate:real",
    "m13:repository-baseline:smoke",
    "m13:sqlite-migrations:smoke",
    "m13:workflow-inputs:smoke",
    "m13:application-transitions:smoke",
    "m13:agent-evaluation:smoke",
    "m14:real-action:smoke",
    "m14:extension-real-greeting:smoke",
    "m15:profile-conversation:smoke",
    "m15:options-profile-conversation:smoke",
    "m16:real-model-agents:smoke",
    "m16:agent-quality-evaluation:smoke",
    "m16:options-agent-quality:smoke",
    "m16:shadow-review:smoke",
    "m16:options-shadow-review:smoke",
    "m17:application-queues:smoke",
    "m17:model-config:smoke",
    "m17:native-host:smoke",
    "m17:popup-runtime:smoke",
    "m17:options-queues-runtime:smoke",
    "native:build",
    "native:install"
  ];
  const ignoredSentinels = [
    ".env",
    ".env.local",
    "gpt5.5.txt",
    "boss-model.local.json",
    "private.docx",
    "private.pdf",
    "server/data/boss_find.sqlite3",
    "server/logs/server.log"
  ];
  const trackedFiles = listTrackedFiles();
  const milestoneSmokeScripts = Object.keys(packageJson.scripts || {})
    .filter((name) => /^m\d+:.+:smoke$/.test(name))
    .sort();
  const assignedSmokeScripts = Object.values(TEST_TIERS).flat();
  const uniqueAssignedSmokeScripts = [...new Set(assignedSmokeScripts)].sort();
  const checks = {
    requiredPathsPresent: requiredPaths.every((relativePath) => fs.existsSync(path.join(ROOT, relativePath))),
    requiredPackageScriptsPresent: requiredScripts.every((name) => typeof packageJson.scripts?.[name] === "string"),
    nodeRuntimePinned: packageJson.engines?.node === ">=24",
    schemaVersionPinned: /const SCHEMA_VERSION = 18;/.test(sqliteStoreSource)
      && /runSqliteMigrations\(\{/.test(sqliteStoreSource)
      && !/applySchema\(\)/.test(sqliteStoreSource),
    privateArtifactsIgnored: ignoredSentinels.every(isIgnoredByGit),
    envExampleRemainsTrackable: !isIgnoredByGit(".env.example"),
    noTrackedGeneratedArtifacts: trackedFiles.every(isAllowedTrackedFile),
    everyMilestoneSmokeAssigned: arraysEqual(milestoneSmokeScripts, uniqueAssignedSmokeScripts),
    noSmokeAssignedTwice: assignedSmokeScripts.length === uniqueAssignedSmokeScripts.length,
    ciUsesOfficialActions: ciWorkflowSource.includes("actions/checkout@v6")
      && ciWorkflowSource.includes("actions/setup-node@v6")
      && ciWorkflowSource.includes("node-version: 24")
      && ciWorkflowSource.includes("npm ci")
      && ciWorkflowSource.includes("npm run test:ci"),
    m13PlanDocumented: developmentPlan.includes("## 13. M13 质量基线与可回放工作流")
      && developmentPlan.includes("### M13.1 仓库基线、测试分层与 CI")
      && developmentPlan.includes("### M13.2 SQLite 有序迁移")
      && developmentPlan.includes("### M13.3 不可变工作流输入")
      && developmentPlan.includes("### M13.4 application 状态迁移收敛")
      && developmentPlan.includes("### M13.5 Agent 评测集")
      && developmentPlan.includes("m13:agent-evaluation:smoke"),
    readmeUsesCurrentMilestone: readme.includes("M13.1")
      && readme.includes("M14.1")
      && readme.includes("M16.1")
      && readme.includes("M18")
      && readme.includes("npm run test:ci"),
    readmeLanguageNavigation: readme.includes("[简体中文](README.zh-CN.md)")
      && readmeZh.includes("[English](README.md)"),
    readmeQuickStartContract: readme.includes("## 10-Minute Quick Start")
      && readme.includes("npm ci")
      && readme.includes("chrome://extensions/")
      && readme.includes("npm run native:install")
      && readme.includes("npm run server")
      && readme.includes("http://127.0.0.1:8787/health")
      && readme.includes("server/data/model-provider.local.json"),
    chineseReadmeKeepsDetailedOnboarding: readmeZh.includes("## 10 分钟开始使用")
      && readmeZh.includes("npm run native:install")
      && readmeZh.includes("M10.5 Backend Service Structure")
  };

  console.log(JSON.stringify({
    ok: Object.values(checks).every(Boolean),
    checks,
    counts: {
      trackedFiles: trackedFiles.length,
      milestoneSmokeScripts: milestoneSmokeScripts.length,
      assignedSmokeScripts: assignedSmokeScripts.length,
      testTiers: Object.keys(TEST_TIERS).length
    }
  }, null, 2));

  if (Object.values(checks).some((value) => !value)) {
    process.exitCode = 1;
  }
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function listTrackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(String(result.stderr || "git ls-files failed").trim());
  }
  return result.stdout.split("\0").filter(Boolean).map(normalizePath);
}

function isIgnoredByGit(relativePath) {
  const result = spawnSync("git", ["check-ignore", "--no-index", "-q", relativePath], {
    cwd: ROOT,
    encoding: "utf8"
  });
  return result.status === 0;
}

function isAllowedTrackedFile(relativePath) {
  const normalized = normalizePath(relativePath);
  if (normalized === ".env.example" || normalized === "server/data/.gitkeep") {
    return true;
  }
  if (normalized === "gpt5.5.txt" || /^\.env(?:\.|$)/.test(normalized)) {
    return false;
  }
  if (normalized.startsWith("server/data/") || normalized.startsWith("server/logs/")) {
    return false;
  }
  return !/\.(?:sqlite3?(?:-.+)?|db(?:-.+)?|docx|pdf|log)$/i.test(normalized);
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/");
}
