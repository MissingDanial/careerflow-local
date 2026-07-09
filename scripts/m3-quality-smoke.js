#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createJobStore } = require("../server/src/sqlite-store");

main();

function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-quality-smoke-"));
  const store = createJobStore({ dataDir });
  try {
    const payload = {
      source: "m3-quality-smoke",
      exportedAt: new Date().toISOString(),
      stats: {
        jobCount: 2,
        pageCount: 2
      },
      pages: {
        search: {
          url: "https://www.zhipin.com/web/geek/jobs?query=pm&city=101300100",
          title: "BOSS jobs",
          visibleJobCount: 2,
          validJobCount: 2,
          describedJobCount: 1,
          loginRequired: false,
          captchaRequired: false,
          selectorCounts: {
            jobCardWrapper: 2,
            jobDetailLinks: 2
          },
          diagnostics: {
            loginRequired: false,
            captchaRequired: false,
            selectorCounts: {
              jobCardWrapper: 2,
              jobDetailLinks: 2
            }
          },
          searchContext: {
            url: "https://www.zhipin.com/web/geek/jobs?query=pm&city=101300100",
            title: "BOSS jobs",
            query: "pm",
            city: "101300100"
          }
        },
        security: {
          url: "https://www.zhipin.com/web/user/?from=passport-zp",
          title: "login",
          visibleJobCount: 0,
          validJobCount: 0,
          loginRequired: true,
          captchaRequired: true,
          selectorCounts: {
            jobDetailLinks: 0
          },
          diagnostics: {
            loginRequired: true,
            captchaRequired: true,
            selectorCounts: {
              jobDetailLinks: 0
            }
          }
        }
      },
      jobs: [
        {
          title: "Project Manager",
          company: "Alpha",
          salary: "10-20K",
          location: "Nanning",
          detailUrl: "https://www.zhipin.com/job_detail/m3-one.html",
          description: "Complete description with responsibilities and requirements. ".repeat(3)
        },
        {
          title: "Delivery Manager",
          company: "Beta",
          detailUrl: "https://www.zhipin.com/job_detail/m3-two.html"
        },
        {
          title: "Noise",
          company: "Noise",
          detailUrl: "https://www.zhipin.com/gongsi/noise.html"
        }
      ]
    };

    const sync = store.syncJobs(payload);
    const stats = store.getStats();
    const quality = store.getQualityReport();
    const eventReport = store.getBrowserEvents();
    const latest = quality.latest;

    const checks = {
      syncFiltersNoise: sync.received === 2,
      recordsQuality: stats.qualityCount === 1 && Boolean(latest),
      computesDescriptionCoverage: latest?.describedJobs === 1 && latest?.validJobs === 2 && latest?.descriptionCoverage === 0.5,
      computesMissingFields: latest?.missingFields?.salary === 1 && latest?.missingFields?.location === 1 && latest?.missingFields?.description === 1,
      recordsSecurityPages: latest?.loginRequiredPages === 1 && latest?.captchaRequiredPages === 1,
      recordsBrowserEvents: stats.browserEventCount >= 3,
      readsBrowserEvents: eventReport.events.length >= 3 && eventReport.events[0]?.eventType === "SELECTOR_CHANGED",
      keepsSearchContext: latest?.searchContext?.[0]?.query === "pm",
      mergesSelectorCounts: latest?.selectorCounts?.jobDetailLinks === 2
    };

    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      sync,
      checks,
      stats,
      latestQuality: latest,
      latestEvents: eventReport.events.slice(0, 3)
    }, null, 2));

    process.exitCode = ok ? 0 : 1;
  } finally {
    store.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
