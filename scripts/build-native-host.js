#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const packageRoot = path.dirname(require.resolve("@yao-pkg/pkg/package.json"));
const pkgCli = path.join(packageRoot, "lib-es5", "bin.js");
const source = path.join(ROOT, "native-host", "index.js");
const outputDir = path.join(ROOT, "server", "data", "native-host");
const output = path.join(outputDir, "careerflow-native-host.exe");

fs.mkdirSync(outputDir, { recursive: true });
const result = spawnSync(process.execPath, [
  pkgCli,
  source,
  "--targets",
  "node22-win-x64",
  "--output",
  output
], {
  cwd: ROOT,
  stdio: "inherit"
});

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.exit(result.status || 1);
}
console.log(`Native Host built: ${output}`);
