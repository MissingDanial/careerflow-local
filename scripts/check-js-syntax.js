#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const EXCLUDED_DIRECTORY_NAMES = new Set([
  ".git",
  ".firecrawl",
  ".codex",
  "node_modules",
  "__pycache__",
  "coverage",
  "dist"
]);

main();

function main() {
  const files = discoverJavaScriptFiles(ROOT);
  const failures = [];

  for (const filePath of files) {
    const result = spawnSync(process.execPath, ["--check", filePath], {
      cwd: ROOT,
      encoding: "utf8"
    });
    if (result.status !== 0) {
      failures.push({
        file: normalizeRelativePath(filePath),
        output: String(result.stderr || result.stdout || "").trim()
      });
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`\n[syntax] ${failure.file}`);
      console.error(failure.output || "node --check failed without output");
    }
    console.error(`\nJavaScript syntax check failed: ${failures.length}/${files.length} files.`);
    process.exitCode = 1;
    return;
  }

  console.log(`JavaScript syntax check passed: ${files.length} files.`);
}

function discoverJavaScriptFiles(directory) {
  const files = [];
  walk(directory, files);
  return files.sort((left, right) => normalizeRelativePath(left).localeCompare(normalizeRelativePath(right), "en"));
}

function walk(directory, files) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"));

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(ROOT, absolutePath);
    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(relativePath, entry.name)) {
        walk(absolutePath, files);
      }
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(absolutePath);
    }
  }
}

function shouldSkipDirectory(relativePath, directoryName) {
  if (EXCLUDED_DIRECTORY_NAMES.has(directoryName) || directoryName.startsWith(".venv")) {
    return true;
  }
  const normalized = relativePath.replaceAll("\\", "/");
  return normalized === "server/data"
    || normalized.startsWith("server/data/")
    || normalized === "server/logs"
    || normalized.startsWith("server/logs/");
}

function normalizeRelativePath(filePath) {
  return path.relative(ROOT, filePath).replaceAll("\\", "/");
}
