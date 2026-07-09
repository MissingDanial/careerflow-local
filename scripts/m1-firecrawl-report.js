#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");

const DEFAULT_DIR = path.join(__dirname, "..", "server", "data", "poc", "firecrawl");

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const { options } = parseArgs(process.argv.slice(2));
  const resultDir = path.resolve(options.dir || DEFAULT_DIR);
  const results = await loadResults(resultDir);

  if (!results.length) {
    console.log(JSON.stringify({
      resultDir,
      resultCount: 0,
      latestByTask: {},
      decision: {
        status: "insufficient_data",
        reason: "No Firecrawl POC result files were found."
      }
    }, null, 2));
    return;
  }

  const latestByTask = getLatestByTask(results);
  const checks = evaluateChecks(latestByTask);
  const decision = decide(checks);

  console.log(JSON.stringify({
    resultDir,
    resultCount: results.length,
    latestByTask: Object.fromEntries(
      Object.entries(latestByTask).map(([taskType, result]) => [taskType, summarizeResult(result)])
    ),
    checks,
    decision
  }, null, 2));
}

async function loadResults(resultDir) {
  let entries;
  try {
    entries = await fs.readdir(resultDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(resultDir, entry.name));

  const results = [];
  for (const filePath of files) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(raw);
      results.push({
        ...data,
        resultPath: filePath
      });
    } catch (error) {
      results.push({
        taskType: "unreadable",
        status: "failed",
        resultPath: filePath,
        createdAt: new Date(0).toISOString(),
        error: {
          message: error.message || String(error)
        }
      });
    }
  }

  return results.sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0));
}

function getLatestByTask(results) {
  const latest = {};
  for (const result of results) {
    if (!result.taskType) {
      continue;
    }
    const current = latest[result.taskType];
    if (!current || Date.parse(result.createdAt || 0) >= Date.parse(current.createdAt || 0)) {
      latest[result.taskType] = result;
    }
  }
  return latest;
}

function evaluateChecks(latestByTask) {
  return {
    profilePersistence: evaluateProfilePersistence(latestByTask.profile_persistence_check),
    scrapeBaseline: evaluateScrapeBaseline(latestByTask.scrape_baseline),
    profileCheck: evaluateProfileCheck(latestByTask.profile_check),
    collectJobs: evaluateCollectJobs(latestByTask.collect_jobs),
    greetingDryRun: evaluateGreetingDryRun(latestByTask.greeting_dry_run),
    resumeGate: evaluateResumeGate(latestByTask.resume_gate_check)
  };
}

function evaluateScrapeBaseline(result) {
  if (!result) {
    return missing("Run scrape-baseline against a BOSS URL.");
  }
  return {
    ok: result.status === "succeeded" && Boolean(result.output?.readable),
    status: result.status,
    readable: result.output?.readable,
    markdownLength: result.output?.markdownLength,
    htmlLength: result.output?.htmlLength,
    loginRequired: result.output?.loginRequired,
    captchaRequired: result.output?.captchaRequired,
    jobSignals: result.output?.jobSignals,
    resultPath: result.resultPath,
    reason: result.output?.readable
      ? "Firecrawl scrape returned readable page content."
      : "Firecrawl scrape did not return readable page content."
  };
}

function evaluateProfilePersistence(result) {
  if (!result) {
    return missing("Run profile-persistence first.");
  }
  const apiKeyIssue = isApiKeyIssue(result);
  if (apiKeyIssue) {
    return {
      ok: false,
      status: "needs_api_key",
      persisted: false,
      resultPath: result.resultPath,
      reason: "Firecrawl refused keyless mode from this environment. Configure FIRECRAWL_API_KEY and rerun."
    };
  }
  const persisted = Boolean(result.output?.persisted);
  return {
    ok: result.status === "succeeded" && persisted,
    status: result.status,
    persisted,
    resultPath: result.resultPath,
    reason: persisted ? "Profile data persisted across Firecrawl sessions." : "Profile data did not persist."
  };
}

function evaluateProfileCheck(result) {
  if (!result) {
    return missing("Run profile-check against a BOSS page.");
  }
  const loginRequired = Boolean(result.output?.loginRequired);
  const captchaRequired = Boolean(result.output?.captchaRequired);
  const blankPage = isBlankProfileOutput(result.output);
  return {
    ok: result.status === "succeeded" && !loginRequired && !captchaRequired && !blankPage,
    status: result.status,
    loginRequired,
    captchaRequired,
    blankPage,
    jobCardCount: result.output?.jobCardCount,
    detailLinkCount: result.output?.detailLinkCount,
    resultPath: result.resultPath,
    reason: blankPage
      ? "Firecrawl session ended on about:blank or an empty page."
      : loginRequired || captchaRequired
      ? "BOSS page needs manual login/captcha handling."
      : "BOSS page looks readable from Firecrawl."
  };
}

function evaluateCollectJobs(result) {
  if (!result) {
    return missing("Run collect-jobs against a BOSS search URL.");
  }
  const jobs = Array.isArray(result.output?.jobs) ? result.output.jobs : [];
  const jobsWithDescription = jobs.filter((job) => String(job.description || "").trim().length >= 80).length;
  return {
    ok: result.status === "succeeded" && jobs.length >= 10 && jobsWithDescription >= 8,
    status: result.status,
    jobCount: jobs.length,
    jobsWithDescription,
    failureCount: Array.isArray(result.output?.failures) ? result.output.failures.length : undefined,
    resultPath: result.resultPath,
    reason: `${jobs.length} jobs, ${jobsWithDescription} with usable descriptions.`
  };
}

function evaluateGreetingDryRun(result) {
  if (!result) {
    return missing("Run greeting-dry-run against a BOSS job or chat URL.");
  }
  const actionButtonCount = Array.isArray(result.output?.actionButtons) ? result.output.actionButtons.length : 0;
  return {
    ok: result.status === "succeeded" && result.output?.dryRun === true && (result.output?.filled || actionButtonCount > 0),
    status: result.status,
    dryRun: result.output?.dryRun,
    filled: result.output?.filled,
    inputCount: result.output?.inputCount,
    actionButtonCount,
    resultPath: result.resultPath,
    reason: result.output?.filled ? "Greeting text was filled in dry-run mode." : "Dry-run did not confirm a filled greeting input."
  };
}

function evaluateResumeGate(result) {
  if (!result) {
    return missing("Run resume-gate against a BOSS job or chat URL.");
  }
  const actionCandidateCount = Array.isArray(result.output?.actionCandidates) ? result.output.actionCandidates.length : 0;
  const fileInputCount = Array.isArray(result.output?.fileInputs) ? result.output.fileInputs.length : 0;
  const gateDetected = Boolean(result.output?.resumeLocked || result.output?.resumeUnlocked || actionCandidateCount);
  return {
    ok: result.status === "succeeded" && gateDetected,
    status: result.status,
    resumeLocked: result.output?.resumeLocked,
    resumeUnlocked: result.output?.resumeUnlocked,
    actionCandidateCount,
    fileInputCount,
    resultPath: result.resultPath,
    reason: gateDetected ? "Resume gate or related action candidates were detected." : "No resume gate signal was detected."
  };
}

function decide(checks) {
  const needsApiKey = Object.entries(checks)
    .filter(([, check]) => check.status === "needs_api_key")
    .map(([name]) => name);
  if (needsApiKey.length) {
    return {
      status: "needs_api_key",
      reason: `Firecrawl keyless mode is not usable for: ${needsApiKey.join(", ")}. Configure FIRECRAWL_API_KEY before judging executor feasibility.`
    };
  }

  const profileCheckRan = checks.profileCheck.status !== "missing";
  if (!checks.profilePersistence.ok || (profileCheckRan && !checks.profileCheck.ok)) {
    if (checks.profilePersistence.ok && checks.scrapeBaseline.ok && !checks.profileCheck.ok) {
      return {
        status: "scrape_only_candidate",
        route: "Firecrawl scrape may help content extraction; ChromeExtensionAdapter or LocalPlaywrightAdapter still needed for BOSS interaction",
        reason: "Firecrawl scrape can read content, but interact/profile-check did not prove BOSS page control."
      };
    }
    return {
      status: "firecrawl_not_ready",
      route: "ChromeExtensionAdapter or LocalPlaywrightAdapter",
      reason: "Profile persistence or BOSS login/page readability failed."
    };
  }

  const missingChecks = Object.entries(checks)
    .filter(([, check]) => check.status === "missing")
    .map(([name]) => name);
  if (missingChecks.length) {
    return {
      status: "insufficient_data",
      reason: `Missing checks: ${missingChecks.join(", ")}.`
    };
  }

  if (checks.collectJobs.ok && checks.greetingDryRun.ok && checks.resumeGate.ok) {
    return {
      status: "firecrawl_primary_candidate",
      route: "FirecrawlAdapter",
      reason: "Profile, collection, greeting dry-run, and resume gate checks all passed."
    };
  }

  if (checks.collectJobs.ok && (checks.greetingDryRun.ok || checks.resumeGate.ok)) {
    return {
      status: "hybrid_candidate",
      route: "FirecrawlAdapter for collection, LocalPlaywrightAdapter for unstable actions",
      reason: "Collection passed, but one downstream action gate is not fully proven."
    };
  }

  return {
    status: "fallback_candidate",
    route: "ChromeExtensionAdapter or LocalPlaywrightAdapter",
    reason: "Firecrawl has not proven enough BOSS workflow coverage."
  };
}

function isApiKeyIssue(result) {
  const message = String(result.error?.message || "").toLowerCase();
  return message.includes("api key")
    || message.includes("keyless")
    || message.includes("suspicious")
    || message.includes("unauthorized")
    || message.includes("forbidden");
}

function isBlankProfileOutput(output) {
  if (!output || typeof output !== "object") {
    return true;
  }
  return String(output.url || "").toLowerCase() === "about:blank"
    || (!output.title && !output.bodySample && Number(output.jobCardCount || 0) === 0 && Number(output.detailLinkCount || 0) === 0);
}

function summarizeResult(result) {
  return {
    status: result.status,
    createdAt: result.createdAt,
    resultPath: result.resultPath,
    outputSummary: {
      persisted: result.output?.persisted,
      loginRequired: result.output?.loginRequired,
      captchaRequired: result.output?.captchaRequired,
      jobCount: Array.isArray(result.output?.jobs) ? result.output.jobs.length : undefined,
      readable: result.output?.readable,
      markdownLength: result.output?.markdownLength,
      dryRun: result.output?.dryRun,
      resumeLocked: result.output?.resumeLocked,
      resumeUnlocked: result.output?.resumeUnlocked
    },
    error: result.error?.message
  };
}

function missing(reason) {
  return {
    ok: false,
    status: "missing",
    reason
  };
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = "true";
    } else {
      options[key] = next;
      index += 1;
    }
  }
  return { options };
}
