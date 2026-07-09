#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");
const { createJobStore } = require("../server/src/sqlite-store");

const DEFAULT_STORE = path.join(__dirname, "..", "server", "data", "jobs.json");
const DEFAULT_DATA_DIR = path.join(__dirname, "..", "server", "data");

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const args = process.argv.slice(2);
  const explicitStorePath = parsePath(args);
  const storePath = explicitStorePath ? path.resolve(explicitStorePath) : "";
  const store = explicitStorePath
    ? JSON.parse(await fs.readFile(storePath, "utf8"))
    : readSqliteStore(args);
  const jobs = Array.isArray(store.jobs) ? store.jobs : [];
  const describedJobs = jobs.filter((job) => String(job.description || "").trim().length >= 80);
  const validJobs = jobs.filter((job) => Boolean(job.jobId && job.title && job.detailUrl));
  const nonJobLike = jobs.filter((job) => !job.jobId || !String(job.detailUrl || "").includes("/job_detail/"));
  const companyCount = new Set(jobs.map((job) => job.company).filter(Boolean)).size;
  const latestSeenAt = jobs.map((job) => Date.parse(job.lastSeenAt || job.capturedAt || 0)).filter(Boolean).sort((a, b) => b - a)[0] || null;

  const checks = {
    hasJobs: {
      ok: jobs.length >= 10,
      value: jobs.length,
      target: 10
    },
    hasDescriptions: {
      ok: describedJobs.length >= 8,
      value: describedJobs.length,
      target: 8
    },
    validJobShape: {
      ok: validJobs.length >= Math.min(10, jobs.length),
      value: validJobs.length,
      target: Math.min(10, jobs.length)
    },
    nonJobNoise: {
      ok: nonJobLike.length <= Math.max(2, Math.round(jobs.length * 0.1)),
      value: nonJobLike.length,
      target: `<= ${Math.max(2, Math.round(jobs.length * 0.1))}`
    }
  };

  console.log(JSON.stringify({
    storePath: storePath || store.databasePath || path.join(DEFAULT_DATA_DIR, "boss_find.sqlite3"),
    storage: store.storage || "json",
    updatedAt: store.updatedAt || null,
    latestSeenAt: latestSeenAt ? new Date(latestSeenAt).toISOString() : null,
    totalJobs: jobs.length,
    describedJobCount: describedJobs.length,
    validJobCount: validJobs.length,
    companyCount,
    nonJobLikeCount: nonJobLike.length,
    lastBatch: store.lastBatch || null,
    checks,
    decision: decide(checks),
    examples: jobs.slice(0, 5).map((job) => ({
      title: job.title,
      company: job.company,
      hasDescription: String(job.description || "").trim().length >= 80,
      detailUrl: job.detailUrl
    })),
    nonJobLikeExamples: nonJobLike.slice(0, 5).map((job) => ({
      title: job.title,
      company: job.company,
      detailUrl: job.detailUrl
    }))
  }, null, 2));
}

function readSqliteStore(args) {
  const dataDir = path.resolve(parseDataDir(args) || DEFAULT_DATA_DIR);
  const store = createJobStore({ dataDir });
  try {
    return {
      ...store.readStore(),
      databasePath: store.dbPath
    };
  } finally {
    store.close();
  }
}

function decide(checks) {
  if (checks.hasJobs.ok && checks.hasDescriptions.ok && checks.validJobShape.ok) {
    return {
      status: "chrome_extension_primary_candidate",
      route: "ChromeExtensionAdapter",
      reason: "Existing extension data meets M1 collection/JD thresholds."
    };
  }
  if (checks.hasJobs.ok) {
    return {
      status: "chrome_extension_needs_quality_loop",
      route: "ChromeExtensionAdapter",
      reason: "Extension can capture jobs, but JD completeness or noise needs improvement."
    };
  }
  return {
    status: "insufficient_data",
    reason: "No enough extension-captured jobs were found."
  };
}

function parsePath(args) {
  const index = args.indexOf("--store");
  if (index >= 0 && args[index + 1]) {
    return args[index + 1];
  }
  return "";
}

function parseDataDir(args) {
  const index = args.indexOf("--data-dir");
  if (index >= 0 && args[index + 1]) {
    return args[index + 1];
  }
  return "";
}
