const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { EXECUTOR_NAMES, TASK_STATUS, createExecutorResult } = require("./types");

const DEFAULT_PROFILE_DIR = path.join(__dirname, "..", "..", "data", "poc", "local-playwright-profile");

class LocalPlaywrightAdapter {
  constructor(options = {}) {
    this.executablePath = options.executablePath || process.env.LOCAL_CHROME_PATH || findBrowserExecutable();
    this.profileDir = path.resolve(options.profileDir || process.env.LOCAL_PLAYWRIGHT_PROFILE_DIR || DEFAULT_PROFILE_DIR);
    this.headless = parseBooleanOption(options.headless ?? process.env.LOCAL_PLAYWRIGHT_HEADLESS, false);
    this.keepOpen = parseBooleanOption(options.keepOpen ?? process.env.LOCAL_PLAYWRIGHT_KEEP_OPEN, false);
    this.timeoutMs = Number(options.timeoutMs || process.env.LOCAL_PLAYWRIGHT_TIMEOUT_MS || 90000);
    this.slowMoMs = Number(options.slowMoMs || process.env.LOCAL_PLAYWRIGHT_SLOW_MO_MS || 80);
  }

  isConfigured() {
    return Boolean(this.executablePath && fs.existsSync(this.executablePath));
  }

  assertConfigured() {
    if (!this.isConfigured()) {
      throw new Error("No local Chrome/Edge executable was found. Set LOCAL_CHROME_PATH to continue LocalPlaywright POC.");
    }
  }

  async runCodeTask({ taskType, url, code, input = {} }) {
    this.assertConfigured();
    const startedAt = Date.now();
    let context = null;
    let page = null;

    try {
      fs.mkdirSync(this.profileDir, { recursive: true });
      context = await chromium.launchPersistentContext(this.profileDir, {
        executablePath: this.executablePath,
        headless: this.headless,
        slowMo: this.slowMoMs,
        viewport: { width: 1365, height: 900 },
        timeout: this.timeoutMs
      });
      for (const existingPage of context.pages()) {
        await existingPage.close().catch(() => null);
      }
      page = await context.newPage();
      page.setDefaultTimeout(Math.min(this.timeoutMs, 30000));
      page.setDefaultNavigationTimeout(Math.min(this.timeoutMs, 45000));
      let navigationError = null;
      const navigationResponse = await page.goto(url, { waitUntil: "domcontentloaded", timeout: Math.min(this.timeoutMs, 45000) }).catch((error) => {
        navigationError = error;
        return null;
      });
      await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => null);
      await page.waitForTimeout(1500);

      const rawResult = await executePageCodeWithRetry(page, code);
      const output = parsePossibleJson(rawResult);
      const status = classifyStatus(output);

      return createExecutorResult({
        executor: EXECUTOR_NAMES.LOCAL_PLAYWRIGHT,
        taskType,
        status,
        input,
        output,
        diagnostics: {
          elapsedMs: Date.now() - startedAt,
          executablePath: this.executablePath,
          profileDir: this.profileDir,
          navigationStatus: navigationResponse ? navigationResponse.status() : null,
          navigationError: navigationError ? navigationError.message || String(navigationError) : null,
          finalUrl: page.url(),
          title: await page.title().catch(() => ""),
          rawResultType: typeof rawResult
        }
      });
    } catch (error) {
      return createExecutorResult({
        executor: EXECUTOR_NAMES.LOCAL_PLAYWRIGHT,
        taskType,
        status: TASK_STATUS.FAILED,
        input,
        diagnostics: {
          elapsedMs: Date.now() - startedAt,
          executablePath: this.executablePath,
          profileDir: this.profileDir,
          finalUrl: page ? page.url() : null
        },
        error: {
          message: error.message || String(error),
          stack: error.stack || null
        }
      });
    } finally {
      if (context && !this.keepOpen) {
        await context.close().catch(() => null);
      }
    }
  }
}

async function executePageCode(page, code) {
  const normalizedCode = normalizePageCode(code);
  const fn = new Function("page", `"use strict"; return (async () => { ${normalizedCode} })();`);
  return fn(page);
}

async function executePageCodeWithRetry(page, code) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await executePageCode(page, code);
    } catch (error) {
      lastError = error;
      if (!String(error.message || error).includes("Execution context was destroyed")) {
        throw error;
      }
      await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => null);
      await page.waitForTimeout(1200);
    }
  }
  throw lastError;
}

function classifyStatus(output) {
  if (output === undefined || output === null || output === "") {
    return TASK_STATUS.FAILED;
  }
  if (output && typeof output === "object" && (output.loginRequired || output.captchaRequired)) {
    return TASK_STATUS.NEEDS_MANUAL_ACTION;
  }
  if (output && typeof output === "object" && String(output.url || "").toLowerCase() === "about:blank") {
    return TASK_STATUS.FAILED;
  }
  return TASK_STATUS.SUCCEEDED;
}

function normalizePageCode(code) {
  const trimmed = String(code || "").trim();
  if (trimmed.endsWith("JSON.stringify(result);")) {
    return `${trimmed.slice(0, -"JSON.stringify(result);".length)}return JSON.stringify(result);`;
  }
  return trimmed;
}

function findBrowserExecutable() {
  const candidates = [
    process.env.LOCAL_CHROME_PATH,
    getPlaywrightChromiumExecutable(),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe")
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function getPlaywrightChromiumExecutable() {
  try {
    return chromium.executablePath();
  } catch {
    return "";
  }
}

function parsePossibleJson(value) {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function parseBooleanOption(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return !["false", "0", "no", "off"].includes(String(value).toLowerCase());
}

module.exports = {
  LocalPlaywrightAdapter,
  findBrowserExecutable
};
