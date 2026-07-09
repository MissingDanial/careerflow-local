#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");
const { FirecrawlAdapter } = require("../server/src/browser-executor/firecrawl-adapter");
const { TASK_TYPES } = require("../server/src/browser-executor/types");
const {
  buildProfileCheckCode,
  buildCollectJobsCode,
  buildGreetingDryRunCode,
  buildResumeGateCheckCode
} = require("../server/src/browser-executor/firecrawl-tasks");

const RESULT_DIR = path.join(__dirname, "..", "server", "data", "poc", "firecrawl");

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command || command === "help") {
    printHelp();
    return;
  }

  if (command === "plan") {
    printPlan();
    return;
  }

  const adapter = new FirecrawlAdapter({
    apiKey: options.apiKey,
    allowKeyless: parseOptionalBoolean(options.allowKeyless),
    apiUrl: options.apiUrl,
    profileName: options.profileName,
    timeoutMs: options.timeoutMs,
    interactTimeoutSeconds: options.interactTimeoutSeconds
  });

  if (!adapter.isConfigured()) {
    printMissingKey(command);
    process.exitCode = 2;
    return;
  }

  const url = options.url || process.env.BOSS_POC_URL || "https://www.zhipin.com/web/geek/job";
  let result;

  if (command === "profile-persistence") {
    const profileUrl = options.url || "https://example.com";
    result = await adapter.runProfilePersistenceCheck({
      url: profileUrl,
      input: { url: profileUrl, profileName: adapter.profileName }
    });
  } else if (command === "scrape-baseline") {
    result = await adapter.runScrapeBaseline({
      url,
      waitFor: Number(options.waitFor || 3000),
      onlyMainContent: parseBoolean(options.onlyMainContent, true),
      input: {
        url,
        waitFor: Number(options.waitFor || 3000),
        onlyMainContent: parseBoolean(options.onlyMainContent, true)
      }
    });
  } else if (command === "profile-check") {
    result = await adapter.runCodeTask({
      taskType: TASK_TYPES.PROFILE_CHECK,
      url,
      code: buildProfileCheckCode(),
      saveProfile: parseBoolean(options.saveProfile, true),
      input: { url, profileName: adapter.profileName }
    });
  } else if (command === "collect-jobs") {
    result = await adapter.runCodeTask({
      taskType: TASK_TYPES.COLLECT_JOBS,
      url,
      code: buildCollectJobsCode({
        maxJobs: Number(options.maxJobs || 10),
        delayMs: Number(options.delayMs || 1400)
      }),
      saveProfile: parseBoolean(options.saveProfile, false),
      input: {
        url,
        profileName: adapter.profileName,
        maxJobs: Number(options.maxJobs || 10),
        delayMs: Number(options.delayMs || 1400)
      }
    });
  } else if (command === "greeting-dry-run") {
    const allowSend = parseBoolean(options.allowSend, false);
    if (allowSend && options.confirmRealAction !== "I_UNDERSTAND_REAL_BOSS_ACTION") {
      throw new Error("Real BOSS send action requires --confirmRealAction I_UNDERSTAND_REAL_BOSS_ACTION.");
    }
    result = await adapter.runCodeTask({
      taskType: TASK_TYPES.GREETING_DRY_RUN,
      url,
      code: buildGreetingDryRunCode({
        greetingText: options.text || "你好，我对这个岗位比较感兴趣，想进一步了解一下。",
        allowSend
      }),
      saveProfile: parseBoolean(options.saveProfile, false),
      input: {
        url,
        profileName: adapter.profileName,
        allowSend
      }
    });
  } else if (command === "resume-gate") {
    result = await adapter.runCodeTask({
      taskType: TASK_TYPES.RESUME_GATE_CHECK,
      url,
      code: buildResumeGateCheckCode(),
      saveProfile: parseBoolean(options.saveProfile, false),
      input: { url, profileName: adapter.profileName }
    });
  } else {
    throw new Error(`Unsupported command: ${command}`);
  }

  const filePath = await writeResult(command, result);
  console.log(JSON.stringify({
    status: result.status,
    taskType: result.taskType,
    resultPath: filePath,
    outputSummary: summarizeOutput(result.output),
    diagnostics: result.diagnostics,
    error: result.error
  }, null, 2));
}

function parseArgs(args) {
  const [command, ...rest] = args;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = "true";
    } else {
      options[key] = next;
      index += 1;
    }
  }
  return { command, options };
}

async function writeResult(command, result) {
  await fs.mkdir(RESULT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(RESULT_DIR, `${stamp}-${command}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return filePath;
}

function summarizeOutput(output) {
  if (!output || typeof output !== "object") {
    return output;
  }
  return {
    url: output.url,
    title: output.title,
    jobCount: Array.isArray(output.jobs) ? output.jobs.length : undefined,
    failureCount: Array.isArray(output.failures) ? output.failures.length : undefined,
    loginRequired: output.loginRequired,
    captchaRequired: output.captchaRequired,
    resumeLocked: output.resumeLocked,
    resumeUnlocked: output.resumeUnlocked,
    persisted: output.persisted,
    readable: output.readable,
    markdownLength: output.markdownLength,
    htmlLength: output.htmlLength,
    jobSignals: output.jobSignals,
    dryRun: output.dryRun
  };
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return !["false", "0", "no", "off"].includes(String(value).toLowerCase());
}

function parseOptionalBoolean(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return parseBoolean(value, false);
}

function printMissingKey(command) {
  console.error(`Cannot run '${command}' without FIRECRAWL_API_KEY.`);
  console.error("Run 'npm run poc:firecrawl -- plan' to inspect the POC plan without calling Firecrawl.");
  console.error("For non-BOSS smoke tests only, you may pass '--allowKeyless true' to try Firecrawl's keyless mode.");
}

function printPlan() {
  console.log(`M1 BrowserExecutor POC plan:
1. profile-persistence: verify Firecrawl profile storage without touching BOSS.
2. scrape-baseline: verify Firecrawl scrape can read a BOSS page without interact.
3. profile-check: verify Firecrawl profile/session and login/captcha signals.
4. collect-jobs: extract BOSS job cards and click details for JD text.
5. greeting-dry-run: find/fill greeting entry points without sending by default.
6. resume-gate: detect resume submission lock/unlock and upload entry points.

Required env for real calls:
- FIRECRAWL_API_KEY
- FIRECRAWL_ALLOW_KEYLESS optional, use only for non-BOSS smoke tests
- FIRECRAWL_PROFILE_NAME optional, default boss-find-poc
- BOSS_POC_URL optional, default https://www.zhipin.com/web/geek/job

Result files are written under server/data/poc/firecrawl/.
`);
}

function printHelp() {
  console.log(`Usage:
  npm run poc:firecrawl -- plan
  npm run poc:firecrawl -- profile-persistence [--url https://example.com]
  npm run poc:firecrawl -- scrape-baseline --url <boss-url> [--waitFor 3000]
  npm run poc:firecrawl -- profile-check --url <boss-url> [--saveProfile true]
  npm run poc:firecrawl -- collect-jobs --url <boss-url> [--maxJobs 10] [--delayMs 1400]
  npm run poc:firecrawl -- greeting-dry-run --url <boss-job-or-chat-url> [--text "..."] [--allowSend false]
  npm run poc:firecrawl -- resume-gate --url <boss-job-or-chat-url>

Environment:
  FIRECRAWL_API_KEY       required for real calls
  FIRECRAWL_API_URL       optional, default https://api.firecrawl.dev
  FIRECRAWL_PROFILE_NAME  optional, default boss-find-poc
  FIRECRAWL_INTERACT_TIMEOUT_SECONDS optional, default 120, max 300
  FIRECRAWL_ALLOW_KEYLESS optional, use only for non-BOSS smoke tests
  BOSS_POC_URL            optional target URL

Safety:
  greeting-dry-run will not send by default. Real send requires both
  --allowSend true and --confirmRealAction I_UNDERSTAND_REAL_BOSS_ACTION.
`);
}
