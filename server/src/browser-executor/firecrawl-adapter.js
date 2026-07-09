const { EXECUTOR_NAMES, TASK_STATUS, TASK_TYPES, createExecutorResult } = require("./types");

const DEFAULT_API_URL = "https://api.firecrawl.dev";

class FirecrawlAdapter {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.FIRECRAWL_API_KEY || "";
    this.allowKeyless = parseBooleanOption(options.allowKeyless ?? process.env.FIRECRAWL_ALLOW_KEYLESS, false);
    this.apiUrl = trimTrailingSlash(options.apiUrl || process.env.FIRECRAWL_API_URL || DEFAULT_API_URL);
    this.profileName = options.profileName || process.env.FIRECRAWL_PROFILE_NAME || "boss-find-poc";
    this.timeoutMs = Number(options.timeoutMs || process.env.FIRECRAWL_TIMEOUT_MS || 90000);
    this.interactTimeoutSeconds = clampInteractTimeout(
      options.interactTimeoutSeconds || process.env.FIRECRAWL_INTERACT_TIMEOUT_SECONDS || 120
    );
  }

  isConfigured() {
    return Boolean(this.apiKey || this.allowKeyless);
  }

  assertConfigured() {
    if (!this.isConfigured()) {
      throw new Error("FIRECRAWL_API_KEY is required to run Firecrawl POC calls.");
    }
  }

  async createSession({ url, saveProfile = false, formats = ["markdown"], waitFor = 1500 }) {
    this.assertConfigured();
    const body = {
      url,
      formats,
      waitFor,
      profile: {
        name: this.profileName,
        saveChanges: Boolean(saveProfile)
      }
    };

    const response = await this.request("/v2/scrape", {
      method: "POST",
      body
    });

    return {
      raw: response,
      scrapeId: extractScrapeId(response),
      liveViewUrl: response.liveViewUrl || response.data?.liveViewUrl || null,
      interactiveLiveViewUrl: response.interactiveLiveViewUrl || response.data?.interactiveLiveViewUrl || null,
      cdpUrl: response.cdpUrl || response.data?.cdpUrl || null
    };
  }

  async runScrapeBaseline({ url, formats = ["markdown"], waitFor = 3000, onlyMainContent = true, input = {} }) {
    const startedAt = Date.now();
    try {
      const response = await this.request("/v2/scrape", {
        method: "POST",
        body: {
          url,
          formats,
          waitFor: Number(waitFor),
          onlyMainContent: Boolean(onlyMainContent)
        }
      });
      const output = summarizeScrapeResponse(url, response);

      return createExecutorResult({
        executor: EXECUTOR_NAMES.FIRECRAWL,
        taskType: TASK_TYPES.SCRAPE_BASELINE,
        status: output.readable ? TASK_STATUS.SUCCEEDED : TASK_STATUS.FAILED,
        input,
        output,
        diagnostics: {
          scrapeId: extractScrapeIdLenient(response),
          elapsedMs: Date.now() - startedAt,
          responseKeys: Object.keys(response || {}),
          dataKeys: Object.keys(response?.data || {})
        }
      });
    } catch (error) {
      return createExecutorResult({
        executor: EXECUTOR_NAMES.FIRECRAWL,
        taskType: TASK_TYPES.SCRAPE_BASELINE,
        status: TASK_STATUS.FAILED,
        input,
        diagnostics: {
          scrapeId: null,
          elapsedMs: Date.now() - startedAt
        },
        error: {
          message: error.message || String(error),
          stack: error.stack || null
        }
      });
    }
  }

  async interact(scrapeId, { prompt, code, language = "node", timeoutSeconds = this.interactTimeoutSeconds }) {
    this.assertConfigured();
    if (!scrapeId) {
      throw new Error("scrapeId is required for Firecrawl interact.");
    }

    const body = {
      timeout: clampInteractTimeout(timeoutSeconds),
      origin: "boss-find-m1-poc"
    };
    if (prompt) {
      body.prompt = prompt;
    }
    if (code) {
      body.code = code;
      body.language = language;
    }

    return this.request(`/v2/scrape/${encodeURIComponent(scrapeId)}/interact`, {
      method: "POST",
      body
    });
  }

  async stopInteraction(scrapeId) {
    this.assertConfigured();
    if (!scrapeId) {
      return null;
    }
    return this.request(`/v2/scrape/${encodeURIComponent(scrapeId)}/interact`, {
      method: "DELETE"
    });
  }

  async runCodeTask({ taskType, url, code, saveProfile = false, formats = ["markdown"], input = {} }) {
    const startedAt = Date.now();
    let scrapeId = null;
    try {
      const session = await this.createSession({ url, saveProfile, formats });
      scrapeId = session.scrapeId;
      const interactResult = await this.interact(scrapeId, { code, language: "node" });
      const parsed = parseInteractPayload(interactResult);
      await this.stopInteraction(scrapeId);
      const status = classifyCodeTaskStatus(taskType, parsed.output, interactResult);

      return createExecutorResult({
        executor: EXECUTOR_NAMES.FIRECRAWL,
        taskType,
        status,
        input,
        output: parsed.output,
        diagnostics: {
          scrapeId,
          elapsedMs: Date.now() - startedAt,
          liveViewUrl: interactResult.liveViewUrl || interactResult.data?.liveViewUrl || session.liveViewUrl,
          interactiveLiveViewUrl: interactResult.interactiveLiveViewUrl || interactResult.data?.interactiveLiveViewUrl || session.interactiveLiveViewUrl,
          cdpUrl: interactResult.cdpUrl || interactResult.data?.cdpUrl || session.cdpUrl,
          stdout: parsed.stdout,
          stderr: parsed.stderr,
          exitCode: interactResult.exitCode ?? interactResult.data?.exitCode ?? null,
          killed: interactResult.killed ?? interactResult.data?.killed ?? null,
          rawResultType: parsed.rawResultType
        }
      });
    } catch (error) {
      if (scrapeId) {
        await this.stopInteraction(scrapeId).catch(() => null);
      }
      return createExecutorResult({
        executor: EXECUTOR_NAMES.FIRECRAWL,
        taskType,
        status: TASK_STATUS.FAILED,
        input,
        diagnostics: {
          scrapeId,
          elapsedMs: Date.now() - startedAt
        },
        error: {
          message: error.message || String(error),
          stack: error.stack || null
        }
      });
    }
  }

  async runProfilePersistenceCheck({ url = "https://example.com", input = {} } = {}) {
    const startedAt = Date.now();
    const marker = `boss-find-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let writeScrapeId = null;
    let readScrapeId = null;

    try {
      const writeSession = await this.createSession({
        url,
        saveProfile: true,
        formats: ["markdown"]
      });
      writeScrapeId = writeSession.scrapeId;
      const writeResult = await this.interact(writeScrapeId, {
        code: buildProfileWriteCode(marker)
      });
      const parsedWrite = parseInteractPayload(writeResult);
      await this.stopInteraction(writeScrapeId);

      const readSession = await this.createSession({
        url,
        saveProfile: false,
        formats: ["markdown"]
      });
      readScrapeId = readSession.scrapeId;
      const readResult = await this.interact(readScrapeId, {
        code: buildProfileReadCode(marker)
      });
      const parsedRead = parseInteractPayload(readResult);
      await this.stopInteraction(readScrapeId);

      const output = {
        url,
        profileName: this.profileName,
        marker,
        writeResult: parsedWrite.output,
        readResult: parsedRead.output,
        persisted: Boolean(parsedRead.output?.localStorageMatches && parsedRead.output?.cookieMatches)
      };

      return createExecutorResult({
        executor: EXECUTOR_NAMES.FIRECRAWL,
        taskType: TASK_TYPES.PROFILE_PERSISTENCE_CHECK,
        status: output.persisted ? TASK_STATUS.SUCCEEDED : TASK_STATUS.FAILED,
        input,
        output,
        diagnostics: {
          writeScrapeId,
          readScrapeId,
          elapsedMs: Date.now() - startedAt,
          writeExitCode: writeResult.exitCode ?? writeResult.data?.exitCode ?? null,
          readExitCode: readResult.exitCode ?? readResult.data?.exitCode ?? null,
          writeKilled: writeResult.killed ?? writeResult.data?.killed ?? null,
          readKilled: readResult.killed ?? readResult.data?.killed ?? null,
          writeStdout: parsedWrite.stdout,
          readStdout: parsedRead.stdout,
          writeStderr: parsedWrite.stderr,
          readStderr: parsedRead.stderr,
          writeLiveViewUrl: writeResult.liveViewUrl || writeResult.data?.liveViewUrl || writeSession.liveViewUrl,
          readLiveViewUrl: readResult.liveViewUrl || readResult.data?.liveViewUrl || readSession.liveViewUrl
        }
      });
    } catch (error) {
      if (writeScrapeId) {
        await this.stopInteraction(writeScrapeId).catch(() => null);
      }
      if (readScrapeId && readScrapeId !== writeScrapeId) {
        await this.stopInteraction(readScrapeId).catch(() => null);
      }
      return createExecutorResult({
        executor: EXECUTOR_NAMES.FIRECRAWL,
        taskType: TASK_TYPES.PROFILE_PERSISTENCE_CHECK,
        status: TASK_STATUS.FAILED,
        input,
        diagnostics: {
          writeScrapeId,
          readScrapeId,
          elapsedMs: Date.now() - startedAt
        },
        error: {
          message: error.message || String(error),
          stack: error.stack || null
        }
      });
    }
  }

  async request(path, { method, body }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = {
        "Content-Type": "application/json"
      };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.apiUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });

      const text = await response.text();
      const data = text ? safeJsonParse(text) : {};
      if (!response.ok) {
        const message = data?.error || data?.message || `Firecrawl HTTP ${response.status}`;
        throw new Error(message);
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function extractScrapeId(response) {
  const scrapeId = response?.data?.metadata?.scrapeId
    || response?.data?.metadata?.scrape_id
    || response?.metadata?.scrapeId
    || response?.metadata?.scrape_id
    || response?.scrapeId
    || response?.scrape_id;

  if (!scrapeId) {
    throw new Error("Firecrawl scrape response did not include a scrapeId.");
  }
  return scrapeId;
}

function extractScrapeIdLenient(response) {
  try {
    return extractScrapeId(response);
  } catch {
    return null;
  }
}

function summarizeScrapeResponse(inputUrl, response) {
  const data = response?.data || response || {};
  const metadata = data.metadata || response?.metadata || {};
  const markdown = typeof data.markdown === "string" ? data.markdown : "";
  const html = typeof data.html === "string" ? data.html : "";
  const text = `${markdown}\n${html}`;
  const bodySample = cleanWhitespace(markdown || html).slice(0, 1200);
  const finalUrl = metadata.sourceURL || metadata.url || data.url || inputUrl;
  const title = metadata.title || data.title || "";
  const loginRequired = /登录|注册|扫码登录|手机号登录|login|signin|passport/i.test(text)
    || /login|signin|passport/i.test(String(finalUrl));
  const captchaRequired = /验证码|安全验证|滑块|请完成验证|异常访问|访问过于频繁/.test(text);
  const jobSignals = countMatches(text, [/职位/g, /岗位/g, /招聘/g, /薪/g, /BOSS直聘/g, /Boss直聘/g]);
  const readable = Boolean((markdown.length >= 200 || html.length >= 500) && finalUrl !== "about:blank");

  return {
    inputUrl,
    url: finalUrl,
    title,
    markdownLength: markdown.length,
    htmlLength: html.length,
    bodySample,
    loginRequired,
    captchaRequired,
    jobSignals,
    readable,
    metadata: {
      statusCode: metadata.statusCode || metadata.status_code || null,
      sourceURL: metadata.sourceURL || null,
      language: metadata.language || null,
      scrapeId: metadata.scrapeId || metadata.scrape_id || null
    }
  };
}

function cleanWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function countMatches(text, patterns) {
  return patterns.reduce((total, pattern) => {
    const matches = String(text || "").match(pattern);
    return total + (matches ? matches.length : 0);
  }, 0);
}

function parseInteractPayload(response) {
  const raw = response?.data || response || {};
  const rawResult = raw.result ?? raw.output ?? raw.stdout ?? null;
  return {
    output: parsePossibleJson(rawResult),
    stdout: raw.stdout || "",
    stderr: raw.stderr || "",
    rawResultType: typeof rawResult
  };
}

function classifyCodeTaskStatus(taskType, output, response) {
  const raw = response?.data || response || {};
  if (raw.killed || (Number.isInteger(raw.exitCode) && raw.exitCode !== 0)) {
    return TASK_STATUS.FAILED;
  }
  if (output && typeof output === "object" && (output.loginRequired || output.captchaRequired)) {
    return TASK_STATUS.NEEDS_MANUAL_ACTION;
  }
  if (taskType === TASK_TYPES.PROFILE_CHECK && output && typeof output === "object" && isBlankBrowserPage(output)) {
    return TASK_STATUS.FAILED;
  }
  return TASK_STATUS.SUCCEEDED;
}

function isBlankBrowserPage(output) {
  return String(output.url || "").toLowerCase() === "about:blank"
    || (!output.title && !output.bodySample && Number(output.jobCardCount || 0) === 0 && Number(output.detailLinkCount || 0) === 0);
}

function buildProfileWriteCode(marker) {
  return `
const marker = ${JSON.stringify(marker)};
const result = await page.evaluate((value) => {
  localStorage.setItem("bossFindFirecrawlProfileCheck", value);
  document.cookie = "boss_find_firecrawl_profile_check=" + value + "; path=/; max-age=3600";
  return {
    localStorageValue: localStorage.getItem("bossFindFirecrawlProfileCheck"),
    cookieHasMarker: document.cookie.includes("boss_find_firecrawl_profile_check=" + value)
  };
}, marker);
JSON.stringify(result);
`;
}

function buildProfileReadCode(marker) {
  return `
const expected = ${JSON.stringify(marker)};
const result = await page.evaluate((value) => {
  const localStorageValue = localStorage.getItem("bossFindFirecrawlProfileCheck");
  const cookieMatches = document.cookie.includes("boss_find_firecrawl_profile_check=" + value);
  return {
    localStorageValue,
    localStorageMatches: localStorageValue === value,
    cookieMatches
  };
}, expected);
JSON.stringify(result);
`;
}

function parsePossibleJson(value) {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return safeJsonParse(trimmed, trimmed);
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function clampInteractTimeout(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 120;
  }
  return Math.max(1, Math.min(300, Math.round(parsed)));
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
  FirecrawlAdapter,
  parseInteractPayload
};
