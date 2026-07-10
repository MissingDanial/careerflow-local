#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createJobStore } = require("../server/src/sqlite-store");

main();

function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-sqlite-smoke-"));
  const store = createJobStore({ dataDir });
  try {
    const shortPayload = {
      source: "m2-smoke",
      exportedAt: new Date().toISOString(),
      pages: {
        search: {
          url: "https://www.zhipin.com/web/geek/jobs",
          title: "BOSS jobs"
        }
      },
      jobs: [
        {
          title: "Project Manager",
          company: "Alpha",
          salary: "10-20K",
          detailUrl: "https://www.zhipin.com/job_detail/m2-smoke.html",
          tags: ["Project"],
          welfare: ["Weekend"],
          description: "Short description"
        },
        {
          title: "Company page noise",
          company: "Noise",
          detailUrl: "https://www.zhipin.com/gongsi/noise.html?from=top-card"
        }
      ]
    };
    const longDescription = "Long job description with responsibilities and requirements. ".repeat(4);
    const longPayload = {
      source: "m2-smoke",
      exportedAt: new Date().toISOString(),
      pages: {},
      jobs: [
        {
          title: "Project Manager",
          company: "Alpha",
          salary: "10-20K",
          detailUrl: "https://www.zhipin.com/job_detail/m2-smoke.html",
          description: longDescription
        }
      ]
    };

    const first = store.syncJobs(shortPayload);
    const second = store.syncJobs(longPayload);
    const current = store.readStore();
    const stats = store.getStats();
    const job = current.jobs[0];

    const checks = {
      filtersNonJobNoise: first.received === 1,
      upsertsDuplicateJob: second.stored === 1 && current.totalJobs === 1,
      keepsLongerDescription: job.description === longDescription.trim(),
      recordsSnapshots: stats.snapshotCount === 2,
      recordsBatches: stats.batchCount === 2,
      recordsCompany: stats.companyCount === 1,
      reportsSqlite: current.storage === "sqlite",
      appliesOrderedMigrations: stats.migrationStatus.currentVersion === 0
        && stats.migrationStatus.finalVersion === stats.schemaVersion
        && stats.migrationStatus.applied.length === stats.schemaVersion,
      doesNotBackupFreshDatabase: stats.migrationStatus.backupCreated === false
    };

    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      dataDir,
      first,
      second,
      checks,
      stats,
      jobPreview: {
        title: job.title,
        company: job.company,
        descriptionLength: job.description.length,
        detailUrl: job.detailUrl
      }
    }, null, 2));

    process.exitCode = ok ? 0 : 1;
  } finally {
    store.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
