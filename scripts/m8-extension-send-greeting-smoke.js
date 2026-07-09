#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

main();

function main() {
  const contentJs = read("extension/src/content.js");
  const optionsJs = read("extension/src/options.js");
  const manifest = JSON.parse(read("extension/manifest.json"));
  const serverJs = read("server/src/server.js");
  const storeJs = read("server/src/sqlite-store.js");
  const packageJson = read("package.json");

  const checks = {
    contentHandlesSendGreeting: contentJs.includes('taskType === "SEND_GREETING"')
      && contentJs.includes("runSendGreetingTask")
      && contentJs.includes("DRY_RUN_READY")
      && contentJs.includes("clickedSend: false"),
    contentFailsClosedWithDiagnostics: contentJs.includes("GREETING_ENTRY_NOT_FOUND")
      && contentJs.includes("GREETING_INPUT_NOT_FOUND")
      && contentJs.includes("GREETING_BUTTON_NOT_FOUND")
      && contentJs.includes("PAGE_MISMATCH")
      && contentJs.includes("SECURITY_CHECK")
      && contentJs.includes("LOGIN_REQUIRED"),
    optionsCanClaimRunAndTransitionGreetingTask: optionsJs.includes("runGreetingDryRunTask")
      && optionsJs.includes('taskTypes: ["SEND_GREETING"]')
      && optionsJs.includes("RUN_BROWSER_TASK")
      && optionsJs.includes("TRANSITION_BROWSER_TASK")
      && optionsJs.includes("getBossExecutionTab"),
    manifestAllowsOptionsToFindBossTabs: Array.isArray(manifest.permissions)
      && manifest.permissions.includes("tabs"),
    backendPayloadHasJobContext: serverJs.includes("jobId: greetingInput.job.jobId")
      && serverJs.includes("sourceUrl: greetingInput.job.sourceUrl")
      && storeJs.includes("jobId: cleanText(input.jobId")
      && storeJs.includes("sourceUrl: cleanText(input.sourceUrl")
      && storeJs.includes("detailUrl && detailUrl === requestedSourceUrl"),
    packageRunsThisSmoke: packageJson.includes("m8-extension-send-greeting-smoke.js")
      && packageJson.includes("m8:extension-send-greeting:smoke")
  };

  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ ok, checks }, null, 2));
  process.exitCode = ok ? 0 : 1;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
