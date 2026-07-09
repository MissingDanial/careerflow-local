#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");
const { LocalPlaywrightAdapter, findBrowserExecutable } = require("../server/src/browser-executor/local-playwright-adapter");
const { TASK_TYPES } = require("../server/src/browser-executor/types");
const {
  buildProfileCheckCode,
  buildCollectJobsCode,
  buildGreetingDryRunCode,
  buildResumeGateCheckCode
} = require("../server/src/browser-executor/firecrawl-tasks");

const RESULT_DIR = path.join(__dirname, "..", "server", "data", "poc", "local-playwright");

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

  if (command === "detect-browser") {
    const detected = findBrowserExecutable();
    console.log(JSON.stringify({
      detected: Boolean(detected),
      executablePath: detected || null,
      hint: detected ? null : "Set LOCAL_CHROME_PATH to Chrome or Edge executable path."
    }, null, 2));
    return;
  }

  const adapter = new LocalPlaywrightAdapter({
    executablePath: options.executablePath,
    profileDir: options.profileDir,
    headless: parseBoolean(options.headless, false),
    keepOpen: parseBoolean(options.keepOpen, false),
    timeoutMs: options.timeoutMs,
    slowMoMs: options.slowMoMs
  });

  if (!adapter.isConfigured()) {
    console.error("LocalPlaywright is not configured: no local Chrome/Edge executable found.");
    console.error("Run 'npm run poc:local -- detect-browser' or set LOCAL_CHROME_PATH.");
    process.exitCode = 2;
    return;
  }

  const url = options.url || process.env.BOSS_POC_URL || "https://www.zhipin.com/web/geek/job";
  let result;

  if (command === "profile-check") {
    result = await adapter.runCodeTask({
      taskType: TASK_TYPES.PROFILE_CHECK,
      url,
      code: buildProfileCheckCode(),
      input: { url }
    });
  } else if (command === "collect-jobs") {
    result = await adapter.runCodeTask({
      taskType: TASK_TYPES.COLLECT_JOBS,
      url,
      code: buildCollectJobsCode({
        maxJobs: Number(options.maxJobs || 10),
        delayMs: Number(options.delayMs || 1400)
      }),
      input: {
        url,
        maxJobs: Number(options.maxJobs || 10),
        delayMs: Number(options.delayMs || 1400)
      }
    });
  } else if (command === "greeting-dry-run") {
    result = await adapter.runCodeTask({
      taskType: TASK_TYPES.GREETING_DRY_RUN,
      url,
      code: buildGreetingDryRunCode({
        greetingText: options.text || "你好，我对这个岗位比较感兴趣，想进一步了解一下。",
        allowSend: false
      }),
      input: { url, allowSend: false }
    });
  } else if (command === "resume-gate") {
    result = await adapter.runCodeTask({
      taskType: TASK_TYPES.RESUME_GATE_CHECK,
      url,
      code: buildResumeGateCheckCode(),
      input: { url }
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

function printPlan() {
  console.log(`M1 LocalPlaywright POC plan:
1. detect-browser: find local Chrome/Edge executable.
2. profile-check: open BOSS in a visible persistent browser profile and detect login/captcha/job-card signals.
3. collect-jobs: click visible job cards and collect JD text.
4. greeting-dry-run: fill greeting text only, never send.
5. resume-gate: detect resume lock/unlock and file input candidates.

Set LOCAL_CHROME_PATH if browser detection fails.
`);
}

function printHelp() {
  console.log(`Usage:
  npm run poc:local -- plan
  npm run poc:local -- detect-browser
  npm run poc:local -- profile-check --url <boss-url>
  npm run poc:local -- collect-jobs --url <boss-url> [--maxJobs 10] [--delayMs 1400]
  npm run poc:local -- greeting-dry-run --url <boss-job-or-chat-url> [--text "..."]
  npm run poc:local -- resume-gate --url <boss-job-or-chat-url>

Environment:
  LOCAL_CHROME_PATH optional explicit Chrome/Edge executable path
  LOCAL_PLAYWRIGHT_PROFILE_DIR optional persistent profile dir
  LOCAL_PLAYWRIGHT_HEADLESS optional, default false
  LOCAL_PLAYWRIGHT_KEEP_OPEN optional, default false
  BOSS_POC_URL optional target URL
`);
}
