#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { assessSubmissionEvidence } = require("../server/src/services/submission-result-service");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m12-submission-evidence-"));
  let serverProcess = null;
  try {
    const port = await findFreePort();
    serverProcess = spawn(process.execPath, ["server/src/server.js"], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        BOSS_DATA_DIR: dataDir,
        BOSS_SKIP_LEGACY_IMPORT: "1"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let serverOutput = "";
    serverProcess.stdout.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
    serverProcess.stderr.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
    await waitForHealth(port, serverProcess, () => serverOutput);
    const apiResult = await runApiChecks(port);
    const wiring = runWiringChecks();
    const checks = {
      ...apiResult.checks,
      ...wiring.checks
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({ ok, checks, apiResult: apiResult.summary }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    if (serverProcess) {
      serverProcess.kill();
      await waitForExit(serverProcess).catch(() => {});
    }
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function runApiChecks(port) {
  await requestJson(port, "POST", "/api/jobs/sync", createPayload());
  const applicationsBefore = await requestJson(port, "GET", "/api/applications?limit=5");
  const application = applicationsBefore.applications[0];
  const tasksBefore = await requestJson(port, "GET", "/api/browser-tasks?limit=50");
  const signalAssessment = assessSubmissionEvidence({
    pageResult: {
      signals: ["submitted_signal_visible"],
      confidence: 0.86
    }
  });
  const recorded = await requestJson(port, "POST", `/api/applications/${application.id}/submission-evidence`, {
    source: "m12-smoke",
    evidenceType: "manual",
    notes: "BOSS page shows application sent",
    pageResult: {
      resultStatus: "MANUAL_SUBMISSION_CONFIRMED",
      confidence: 0.9,
      signals: ["submitted_signal_visible"],
      pageTextSample: "application sent",
      page: {
        url: application.detailUrl,
        title: "BOSS submission result"
      }
    },
    manualEvidence: {
      text: "User manually confirmed the BOSS page result."
    },
    recordedBy: "m12-submission-evidence-smoke"
  });
  const fetched = await requestJson(port, "GET", `/api/applications/${application.id}/submission-evidence?limit=5`);
  const workflowEvents = await requestJson(port, "GET", `/api/workflow-events?applicationId=${application.id}&limit=20`);
  const tasksAfter = await requestJson(port, "GET", "/api/browser-tasks?limit=50");
  const applicationsAfter = await requestJson(port, "GET", "/api/applications?limit=5");
  const latestEvent = fetched.latestEvidence || {};
  const eventMetadata = latestEvent.metadata || {};
  const beforeApplication = currentApplication(applicationsBefore, application.id);
  const afterApplication = currentApplication(applicationsAfter, application.id);

  return {
    checks: {
      serviceInfersSignalStatus: signalAssessment.resultStatus === "MANUAL_SUBMISSION_CONFIRMED"
        && signalAssessment.confirmed === true,
      apiRecordsSubmissionEvidenceEvent: recorded.ok === true
        && recorded.persisted === true
        && recorded.workflowEvent?.eventType === "SUBMISSION_EVIDENCE_RECORDED"
        && recorded.assessment?.resultStatus === "MANUAL_SUBMISSION_CONFIRMED"
        && recorded.assessment?.confirmed === true,
      apiEvidenceHasSafetyBoundary: recorded.noRealBossAction === true
        && recorded.noBrowserTaskCreated === true
        && recorded.createsBrowserTasks === false
        && recorded.workflowEvent?.metadata?.noRealBossAction === true
        && recorded.workflowEvent?.metadata?.noBrowserTaskCreated === true
        && recorded.workflowEvent?.metadata?.createsBrowserTasks === false
        && recorded.workflowEvent?.metadata?.realActionsBlocked?.includes("SUBMIT_APPLICATION_REAL"),
      apiGetReturnsLatestEvidence: fetched.ok === true
        && fetched.totalEvidence === 1
        && latestEvent.eventType === "SUBMISSION_EVIDENCE_RECORDED"
        && eventMetadata.assessment?.resultStatus === "MANUAL_SUBMISSION_CONFIRMED"
        && eventMetadata.evidence?.pageResult?.signals?.includes("submitted_signal_visible"),
      apiWorkflowEventQueryable: workflowEvents.events.some((event) => event.eventType === "SUBMISSION_EVIDENCE_RECORDED"
        && event.status === "MANUAL_SUBMISSION_CONFIRMED"
        && event.metadata?.noBrowserTaskCreated === true),
      apiDoesNotCreateBrowserTasks: Number(tasksAfter.totalTasks || 0) === Number(tasksBefore.totalTasks || 0),
      apiDoesNotChangeApplicationStatus: beforeApplication.status === afterApplication.status
        && recorded.applicationStatusChanged === false
    },
    summary: {
      applicationId: application.id,
      applicationStatusBefore: beforeApplication.status,
      applicationStatusAfter: afterApplication.status,
      taskCountBefore: tasksBefore.totalTasks,
      taskCountAfter: tasksAfter.totalTasks,
      evidenceStatus: recorded.assessment?.resultStatus || "",
      latestEvidenceId: latestEvent.id || null
    }
  };
}

function runWiringChecks() {
  const packageJson = read("package.json");
  const serverJs = read("server/src/server.js");
  const serviceJs = read("server/src/services/submission-result-service.js");
  const backgroundJs = read("extension/src/background.js");
  const contentJs = read("extension/src/content.js");
  const optionsHtml = read("extension/src/options.html");
  const optionsJs = read("extension/src/options.js");
  const readme = read("README.md");
  const docsWorkflow = read("docs/03_AGENT_WORKFLOW.md");
  const docsPlan = read("docs/04_DEVELOPMENT_PLAN.md");
  const docsReuse = read("docs/05_OPEN_SOURCE_REUSE.md");
  const docsBoss = read("docs/06_BOSS_PLATFORM_LOGIC.md");
  return {
    checks: {
      serverExposesSubmissionEvidenceEndpoint: serverJs.includes("/submission-evidence")
        && serverJs.includes("createSubmissionResultService")
        && serverJs.includes("submissionResultService.recordEvidence"),
      serviceRecordsEvidenceOnly: serviceJs.includes("SUBMISSION_EVIDENCE_RECORDED")
        && serviceJs.includes("MANUAL_SUBMISSION_CONFIRMED")
        && serviceJs.includes("noApplicationStatusChange")
        && serviceJs.includes("noBrowserTaskCreated")
        && serviceJs.includes("SUBMIT_APPLICATION_REAL")
        && serviceJs.includes("submitted_signal_visible"),
      extensionReadsPageResultOnly: contentJs.includes("READ_SUBMISSION_PAGE_RESULT")
        && contentJs.includes("readSubmissionPageResult")
        && contentJs.includes("extractSubmissionResultSignals")
        && contentJs.includes("noBrowserTaskCreated: true")
        && contentJs.includes("createsBrowserTasks: false"),
      backgroundAndOptionsExposeEvidenceFlow: backgroundJs.includes("GET_SUBMISSION_EVIDENCE")
        && backgroundJs.includes("RECORD_SUBMISSION_EVIDENCE")
        && optionsHtml.includes("readSubmissionPageResult")
        && optionsHtml.includes("recordSubmissionPageResult")
        && optionsHtml.includes("submissionEvidenceDetail")
        && optionsJs.includes("READ_SUBMISSION_PAGE_RESULT")
        && optionsJs.includes("RECORD_SUBMISSION_EVIDENCE")
        && optionsJs.includes("renderSubmissionEvidenceDetail"),
      packageRunsM12SmokeAndCheck: packageJson.includes("m12-submission-evidence-smoke.js")
        && packageJson.includes("m12:submission-evidence:smoke"),
      docsRecordM12Boundary: readme.includes("M12.1")
        && readme.includes("M12.2")
        && docsWorkflow.includes("M12.1")
        && docsPlan.includes("M12.2")
        && docsReuse.includes("M12")
        && docsBoss.includes("SUBMISSION_EVIDENCE_RECORDED")
    }
  };
}

function createPayload() {
  return {
    source: "m12-submission-evidence-smoke",
    exportedAt: new Date().toISOString(),
    pages: {},
    jobs: [
      {
        jobId: "m12-submission-evidence-one",
        title: "AI Product Intern",
        company: "Evidence Co",
        salary: "20-30K",
        location: "Beijing",
        experience: "1-3 years",
        education: "Bachelor",
        tags: ["AI", "Product"],
        detailUrl: "https://www.zhipin.com/job_detail/m12-submission-evidence-one.html",
        sourceUrl: "https://www.zhipin.com/web/geek/jobs?query=ai-product",
        description: "Build AI product workflows and work with local evidence ledgers."
      }
    ]
  };
}

function currentApplication(applications, applicationId) {
  return applications.applications.find((application) => application.id === applicationId) || {};
}

function requestJson(port, method, pathname, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method,
      headers: payload ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      } : {}
    }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        text += chunk;
      });
      response.on("end", () => {
        let data = null;
        try {
          data = text ? JSON.parse(text) : {};
        } catch (error) {
          reject(error);
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(data?.error || `HTTP ${response.statusCode}`));
          return;
        }
        resolve(data);
      });
    });
    request.on("error", reject);
    if (payload) {
      request.write(payload);
    }
    request.end();
  });
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

async function waitForHealth(port, processHandle, getOutput) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Server exited early: ${getOutput()}`);
    }
    try {
      const health = await requestJson(port, "GET", "/health");
      if (health.ok) {
        return;
      }
    } catch {
      await delay(150);
    }
  }
  throw new Error(`Server did not become healthy: ${getOutput()}`);
}

function waitForExit(processHandle) {
  return new Promise((resolve) => {
    if (processHandle.exitCode !== null) {
      resolve();
      return;
    }
    processHandle.once("exit", resolve);
    setTimeout(resolve, 1000);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
