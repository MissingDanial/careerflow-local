#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { TEST_TIER_NAMES, getTestScripts } = require("./test-tiers");

const ROOT = path.join(__dirname, "..");
const tierName = String(process.argv[2] || "").trim();

main();

function main() {
  const scripts = getTestScripts(tierName);
  if (!scripts) {
    console.error(`Unknown test tier "${tierName}". Expected one of: ${[...TEST_TIER_NAMES, "ci"].join(", ")}.`);
    process.exitCode = 1;
    return;
  }

  if (tierName === "ci") {
    runNodeScript("scripts/check-js-syntax.js", "JavaScript syntax");
  }

  console.log(`Running ${tierName} test tier (${scripts.length} smoke scripts).`);
  for (const scriptName of scripts) {
    runNpmScript(scriptName);
  }
  console.log(`${tierName} test tier passed.`);
}

function runNodeScript(relativePath, label) {
  const result = spawnSync(process.execPath, [path.join(ROOT, relativePath)], {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit"
  });
  assertSucceeded(result, label);
}

function runNpmScript(scriptName) {
  console.log(`\n[test] ${scriptName}`);
  const npmCliPath = process.env.npm_execpath;
  const command = npmCliPath && fs.existsSync(npmCliPath)
    ? process.execPath
    : process.platform === "win32" ? "npm.cmd" : "npm";
  const args = npmCliPath && fs.existsSync(npmCliPath)
    ? [npmCliPath, "run", "--silent", scriptName]
    : ["run", "--silent", scriptName];
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit"
  });
  assertSucceeded(result, scriptName);
}

function assertSucceeded(result, label) {
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    console.error(`${label} failed with exit code ${result.status}.`);
    process.exit(result.status || 1);
  }
}
