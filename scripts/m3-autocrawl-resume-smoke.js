#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

main();

function main() {
  const contentJs = read("extension/src/content.js");
  const popupJs = read("extension/src/popup.js");
  const packageJson = read("package.json");

  const checks = {
    contentKeepsAttemptedSet: contentJs.includes("autoCrawlAttemptedKeys") && contentJs.includes("autoCrawlDescribedKeys"),
    contentSeedsProgress: contentJs.includes("seedAutoCrawlProgress(options)") && contentJs.includes("completedJobKeys"),
    contentReadsBackgroundCache: contentJs.includes('chrome.runtime.sendMessage({ type: "GET_CACHE" })'),
    contentFiltersTargets: contentJs.includes("scanAutoCrawlTargets({ excludeKeys })") && contentJs.includes("excludeKeys.has(key)"),
    contentUsesDynamicLoop: contentJs.includes("while (processedThisRun < options.maxJobs)") && !contentJs.includes("for (let index = 0; index < targets.length; index += 1)"),
    contentScrollsForLazyLoad: contentJs.includes("scrollForMoreTargets()") && contentJs.includes("getListFingerprint()"),
    contentScansWithDiagnostics: contentJs.includes("function scanAutoCrawlTargets(options = {})") && contentJs.includes("updateAutoCrawlDiagnostics(scan"),
    contentTracksVisibleAndPending: contentJs.includes("visibleTargets") && contentJs.includes("pendingTargets") && contentJs.includes("visibleSkipped"),
    contentTracksScrollAndAction: contentJs.includes("scrollCount") && contentJs.includes("idleScrolls") && contentJs.includes("lastAction"),
    contentDetectsAutoCrawlBlockers: contentJs.includes("function getAutoCrawlBlocker(scan") && contentJs.includes("markAutoCrawlBlocked(blocker)"),
    contentBlocksOnLoginCaptchaSelector: contentJs.includes('reason: "LOGIN_REQUIRED"') && contentJs.includes('reason: "CAPTCHA_REQUIRED"') && contentJs.includes('reason: "SELECTOR_CHANGED"'),
    contentDoesNotMarkBlockedAsDone: contentJs.includes('autoCrawlState.status !== "blocked"'),
    popupPassesCompletedKeys: popupJs.includes("completedJobKeys: mergeUniqueStrings(getDescribedJobKeys(cache), backendKeys)"),
    popupDefinesStableKey: popupJs.includes("function getJobKey(job)") && popupJs.includes("function extractJobId(url)"),
    checkRunsThisSmoke: packageJson.includes("m3-autocrawl-resume-smoke.js")
  };

  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ ok, checks }, null, 2));
  process.exitCode = ok ? 0 : 1;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
