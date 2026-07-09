const TASK_TYPES = Object.freeze({
  PROFILE_PERSISTENCE_CHECK: "profile_persistence_check",
  SCRAPE_BASELINE: "scrape_baseline",
  PROFILE_CHECK: "profile_check",
  COLLECT_JOBS: "collect_jobs",
  GREETING_DRY_RUN: "greeting_dry_run",
  RESUME_GATE_CHECK: "resume_gate_check"
});

const EXECUTOR_NAMES = Object.freeze({
  FIRECRAWL: "firecrawl",
  CHROME_EXTENSION: "chrome_extension",
  LOCAL_PLAYWRIGHT: "local_playwright"
});

const TASK_STATUS = Object.freeze({
  READY: "ready",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  NEEDS_MANUAL_ACTION: "needs_manual_action"
});

const BOSS_SIGNALS = Object.freeze({
  LOGIN_REQUIRED: "LOGIN_REQUIRED",
  CAPTCHA_REQUIRED: "CAPTCHA_REQUIRED",
  PAGE_READY: "PAGE_READY",
  SELECTOR_CHANGED: "SELECTOR_CHANGED",
  RESUME_LOCKED: "RESUME_LOCKED",
  RESUME_UNLOCKED: "RESUME_UNLOCKED"
});

function createExecutorResult({
  executor,
  taskType,
  status,
  input = {},
  output = null,
  diagnostics = {},
  error = null
}) {
  return {
    executor,
    taskType,
    status,
    input,
    output,
    diagnostics,
    error,
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  TASK_TYPES,
  EXECUTOR_NAMES,
  TASK_STATUS,
  BOSS_SIGNALS,
  createExecutorResult
};
