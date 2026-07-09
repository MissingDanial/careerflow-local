#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");

const DEFAULT_DIR = path.join(__dirname, "..", "server", "data", "poc", "local-playwright");

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const resultDir = path.resolve(parseDir(process.argv.slice(2)) || DEFAULT_DIR);
  const results = await loadResults(resultDir);
  const latestByTask = getLatestByTask(results);
  const checks = {
    profileCheck: evaluateProfileCheck(latestByTask.profile_check),
    localBrowserStability: evaluateLocalBrowserStability(results),
    collectJobs: evaluateCollectJobs(latestByTask.collect_jobs),
    greetingDryRun: evaluateGreetingDryRun(latestByTask.greeting_dry_run),
    resumeGate: evaluateResumeGate(latestByTask.resume_gate_check)
  };

  console.log(JSON.stringify({
    resultDir,
    resultCount: results.length,
    latestByTask: Object.fromEntries(
      Object.entries(latestByTask).map(([taskType, result]) => [taskType, summarizeResult(result)])
    ),
    checks,
    decision: decide(checks)
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

  const results = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(resultDir, entry.name);
    try {
      results.push({
        ...JSON.parse(await fs.readFile(filePath, "utf8")),
        resultPath: filePath
      });
    } catch (error) {
      results.push({
        taskType: "unreadable",
        status: "failed",
        createdAt: new Date(0).toISOString(),
        resultPath: filePath,
        error: { message: error.message || String(error) }
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

function evaluateProfileCheck(result) {
  if (!result) {
    return missing("Run LocalPlaywright profile-check.");
  }
  const blankPage = String(result.output?.url || result.diagnostics?.finalUrl || "").toLowerCase() === "about:blank";
  const needsManual = result.status === "needs_manual_action";
  return {
    ok: result.status === "succeeded" && !blankPage,
    status: result.status,
    needsManual,
    blankPage,
    loginRequired: result.output?.loginRequired,
    captchaRequired: result.output?.captchaRequired,
    finalUrl: result.diagnostics?.finalUrl,
    title: result.output?.title || result.diagnostics?.title,
    jobCardCount: result.output?.jobCardCount,
    detailLinkCount: result.output?.detailLinkCount,
    resultPath: result.resultPath,
    reason: needsManual
      ? "BOSS requires manual login/captcha/security handling in the visible local browser."
      : blankPage
      ? "Local browser ended at about:blank."
      : "Local browser can read the target page."
  };
}

function evaluateLocalBrowserStability(results) {
  const profileResults = results.filter((result) => result.taskType === "profile_check");
  const closedResults = profileResults.filter(hasControlledBrowserClosedSignal);
  const manualResults = profileResults.filter((result) =>
    result.status === "needs_manual_action" || result.output?.loginRequired || result.output?.captchaRequired
  );
  const latestClosed = closedResults[closedResults.length - 1] || null;

  if (closedResults.length > 0) {
    return {
      ok: false,
      status: "controlled_browser_closed",
      closedCount: closedResults.length,
      manualSignalCount: manualResults.length,
      latestClosedResultPath: latestClosed.resultPath,
      reason: "The controlled browser profile has closed during launch or navigation, which makes LocalPlaywright unsafe as the BOSS primary executor."
    };
  }

  if (manualResults.length > 0) {
    return {
      ok: false,
      status: "login_or_security_redirect",
      closedCount: 0,
      manualSignalCount: manualResults.length,
      latestClosedResultPath: null,
      reason: "BOSS redirects the controlled browser profile to login/security validation."
    };
  }

  return {
    ok: true,
    status: profileResults.length ? "no_blocking_signal" : "missing",
    closedCount: 0,
    manualSignalCount: 0,
    latestClosedResultPath: null,
    reason: profileResults.length
      ? "No controlled-browser close or login/security redirect signal was found."
      : "Run LocalPlaywright profile-check."
  };
}

function hasControlledBrowserClosedSignal(result) {
  const message = `${result.error?.message || ""}\n${result.error?.stack || ""}`;
  return /Target page, context or browser has been closed/i.test(message)
    || /browser has been closed/i.test(message)
    || /process did exit/i.test(message);
}

function evaluateCollectJobs(result) {
  if (!result) {
    return missing("Run LocalPlaywright collect-jobs.");
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
    return missing("Run LocalPlaywright greeting-dry-run.");
  }
  return {
    ok: result.status === "succeeded" && result.output?.dryRun === true && (result.output?.filled || result.output?.inputCount > 0),
    status: result.status,
    dryRun: result.output?.dryRun,
    filled: result.output?.filled,
    inputCount: result.output?.inputCount,
    resultPath: result.resultPath,
    reason: result.output?.filled ? "Greeting input filled in dry-run mode." : "Greeting dry-run did not confirm fill."
  };
}

function evaluateResumeGate(result) {
  if (!result) {
    return missing("Run LocalPlaywright resume-gate.");
  }
  const actionCandidateCount = Array.isArray(result.output?.actionCandidates) ? result.output.actionCandidates.length : 0;
  return {
    ok: result.status === "succeeded" && (result.output?.resumeLocked || result.output?.resumeUnlocked || actionCandidateCount > 0),
    status: result.status,
    resumeLocked: result.output?.resumeLocked,
    resumeUnlocked: result.output?.resumeUnlocked,
    actionCandidateCount,
    fileInputCount: Array.isArray(result.output?.fileInputs) ? result.output.fileInputs.length : 0,
    resultPath: result.resultPath,
    reason: actionCandidateCount ? "Resume related action candidates detected." : "No resume gate signals detected."
  };
}

function decide(checks) {
  if (checks.profileCheck.status === "missing") {
    return { status: "insufficient_data", reason: "LocalPlaywright profile-check has not run." };
  }
  if (checks.localBrowserStability.status === "controlled_browser_closed") {
    return {
      status: "local_playwright_not_primary_candidate",
      route: "Use ChromeExtensionAdapter as the BOSS primary executor; keep LocalPlaywright only for later user-approved file-upload experiments.",
      reason: checks.localBrowserStability.reason
    };
  }
  if (checks.profileCheck.needsManual) {
    return {
      status: "local_playwright_not_primary_candidate",
      route: "Use ChromeExtensionAdapter as the BOSS primary executor; do not keep forcing controlled-browser login for M1.",
      reason: checks.profileCheck.reason
    };
  }
  if (!checks.profileCheck.ok) {
    return {
      status: "local_playwright_not_ready",
      route: "Investigate local browser launch/profile before using it as executor.",
      reason: checks.profileCheck.reason
    };
  }
  if (checks.collectJobs.ok && checks.greetingDryRun.ok && checks.resumeGate.ok) {
    return {
      status: "local_playwright_primary_candidate",
      route: "LocalPlaywrightAdapter",
      reason: "Profile, collection, greeting dry-run, and resume gate checks passed."
    };
  }
  return {
    status: "profile_ready_more_checks_needed",
    route: "Continue LocalPlaywright collect-jobs, greeting-dry-run, and resume-gate.",
    reason: "Local browser page read passed, downstream workflow checks are incomplete."
  };
}

function summarizeResult(result) {
  return {
    status: result.status,
    createdAt: result.createdAt,
    resultPath: result.resultPath,
    outputSummary: {
      url: result.output?.url,
      title: result.output?.title,
      loginRequired: result.output?.loginRequired,
      captchaRequired: result.output?.captchaRequired,
      jobCount: Array.isArray(result.output?.jobs) ? result.output.jobs.length : undefined,
      dryRun: result.output?.dryRun,
      resumeLocked: result.output?.resumeLocked,
      resumeUnlocked: result.output?.resumeUnlocked
    },
    diagnostics: {
      finalUrl: result.diagnostics?.finalUrl,
      title: result.diagnostics?.title,
      navigationStatus: result.diagnostics?.navigationStatus,
      navigationError: result.diagnostics?.navigationError
    },
    error: result.error?.message
  };
}

function missing(reason) {
  return { ok: false, status: "missing", reason };
}

function parseDir(args) {
  const index = args.indexOf("--dir");
  if (index >= 0 && args[index + 1]) {
    return args[index + 1];
  }
  return "";
}
