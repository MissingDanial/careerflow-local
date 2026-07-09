#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { createJobStore } = require("../server/src/sqlite-store");

const ROOT = path.join(__dirname, "..");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const storeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m5-profile-store-"));
  const apiDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m5-profile-api-"));
  try {
    const storeResult = runStoreChecks(storeDataDir);
    const apiResult = await runApiChecks(apiDataDir);
    const wiring = runWiringChecks();
    const checks = {
      ...storeResult.checks,
      ...apiResult.checks,
      ...wiring.checks
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      storeResult: storeResult.summary,
      apiResult: apiResult.summary
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    fs.rmSync(storeDataDir, { recursive: true, force: true });
    fs.rmSync(apiDataDir, { recursive: true, force: true });
  }
}

function runStoreChecks(dataDir) {
  const store = createJobStore({ dataDir });
  try {
    const initial = store.getProfile();
    const updated = store.updateProfile({
      displayName: "Candidate",
      headline: "AI Product Intern",
      location: "Nanning",
      summary: "Focus on AI product workflows.",
      target: {
        cities: ["南宁", "深圳"],
        jobTypes: ["internship"],
        directions: ["AI 产品"]
      }
    });
    const resume = store.createResumeSource({
      sourceType: "text",
      fileName: "base-resume.txt",
      rawText: "Candidate\nAI product project\nBuilt a local job workflow prototype.",
      metadata: {
        importedBy: "m5-profile-smoke"
      }
    });
    const experience = store.createExperience({
      kind: "project",
      title: "Boss Find",
      organization: "Personal",
      role: "Product and engineering owner",
      facts: [
        "Built a local-first BOSS job capture workflow.",
        "Added SQLite task queue diagnostics."
      ],
      skills: ["Node.js", "Chrome Extension", "SQLite"],
      evidenceText: "Repository implementation and smoke tests.",
      confidence: "user_confirmed",
      allowedRewrites: ["Can describe as local-first job automation prototype."],
      forbiddenClaims: ["Do not claim production-scale multi-user SaaS."]
    });
    const skill = store.createSkill({
      name: "SQLite",
      category: "backend",
      proficiency: "familiar",
      evidence: [String(experience.id)]
    });
    const constraint = store.createConstraint({
      ruleType: "forbidden_claim",
      content: "Do not fabricate employment history.",
      severity: "blocker",
      metadata: {
        source: "user_rule"
      }
    });
    const bundle = store.getProfile();
    const stats = store.getStats();

    const checks = {
      createsDefaultProfile: initial.profile.id > 0,
      updatesProfileTarget: updated.profile.displayName === "Candidate"
        && updated.profile.target.cities?.includes("深圳"),
      storesResumeSource: resume.id > 0
        && resume.textLength > 20
        && resume.metadata.importedBy === "m5-profile-smoke",
      storesExperienceFacts: experience.id > 0
        && experience.facts.length === 2
        && experience.forbiddenClaims[0].includes("production-scale"),
      upsertsSkill: skill.name === "SQLite"
        && skill.evidence.includes(String(experience.id)),
      storesConstraint: constraint.ruleType === "forbidden_claim"
        && constraint.severity === "blocker",
      bundleContainsFactLibrary: bundle.experiences.length === 1
        && bundle.skills.length === 1
        && bundle.constraints.length === 1
        && bundle.resumeSources.length === 1,
      statsExposeProfileCounts: stats.profileCount === 1
        && stats.experienceCount === 1
        && stats.skillCount === 1
        && stats.constraintCount === 1
        && stats.resumeSourceCount === 1
    };

    return {
      checks,
      summary: {
        profileId: bundle.profile.id,
        resumeSources: bundle.resumeSources.length,
        experiences: bundle.experiences.length,
        skills: bundle.skills.length,
        constraints: bundle.constraints.length,
        schemaVersion: stats.schemaVersion
      }
    };
  } finally {
    store.close();
  }
}

async function runApiChecks(dataDir) {
  const port = 24000 + Math.floor(Math.random() * 1000);
  const server = spawn(process.execPath, ["server/src/server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      BOSS_DATA_DIR: dataDir,
      BOSS_SKIP_LEGACY_IMPORT: "1",
      PORT: String(port)
    },
    stdio: ["ignore", "ignore", "ignore"]
  });

  try {
    await waitForHealth(port);
    const initial = await requestJson(port, "GET", "/api/profile");
    const updated = await requestJson(port, "PUT", "/api/profile", {
      displayName: "API Candidate",
      target: {
        cities: ["上海"],
        jobTypes: ["campus"]
      }
    });
    const resume = await requestJson(port, "POST", "/api/profile/resume-sources", {
      sourceType: "text",
      rawText: "API resume text with verified project facts."
    });
    const experience = await requestJson(port, "POST", "/api/profile/experiences", {
      kind: "project",
      title: "API Experience",
      facts: ["Verified API fact"],
      skills: ["API Design"],
      forbiddenClaims: ["Do not overstate ownership"]
    });
    const skill = await requestJson(port, "POST", "/api/profile/skills", {
      name: "API Design",
      proficiency: "proficient",
      evidence: [String(experience.id)]
    });
    const constraint = await requestJson(port, "POST", "/api/profile/constraints", {
      ruleType: "hard_limit",
      content: "Resume must stay under two pages.",
      severity: "blocker"
    });
    const bundle = await requestJson(port, "GET", "/api/profile");
    const resumes = await requestJson(port, "GET", "/api/profile/resume-sources?limit=5");
    const experiences = await requestJson(port, "GET", "/api/profile/experiences");
    const skills = await requestJson(port, "GET", "/api/profile/skills");
    const constraints = await requestJson(port, "GET", "/api/profile/constraints");

    let rejectsEmptyResume = false;
    try {
      await requestJson(port, "POST", "/api/profile/resume-sources", {
        rawText: ""
      });
    } catch {
      rejectsEmptyResume = true;
    }

    const checks = {
      apiCreatesDefaultProfile: initial.profile.id > 0,
      apiUpdatesProfile: updated.profile.displayName === "API Candidate"
        && updated.profile.target.jobTypes?.includes("campus"),
      apiStoresResumeSource: resume.id > 0 && resume.textLength > 20,
      apiStoresExperience: experience.id > 0 && experience.facts[0] === "Verified API fact",
      apiStoresSkill: skill.name === "API Design" && skill.proficiency === "proficient",
      apiStoresConstraint: constraint.ruleType === "hard_limit" && constraint.severity === "blocker",
      apiBundleListsFactLibrary: bundle.experiences.length === 1
        && bundle.skills.length === 1
        && bundle.constraints.length === 1,
      apiCollectionEndpointsWork: resumes.totalResumeSources === 1
        && experiences.experiences.length === 1
        && skills.skills.length === 1
        && constraints.constraints.length === 1,
      apiRejectsEmptyResumeText: rejectsEmptyResume
    };

    return {
      checks,
      summary: {
        profileId: bundle.profile.id,
        resumeSources: resumes.totalResumeSources,
        experiences: experiences.experiences.length,
        skills: skills.skills.length,
        constraints: constraints.constraints.length
      }
    };
  } finally {
    server.kill();
    await waitForExit(server);
  }
}

function runWiringChecks() {
  const serverJs = read("server/src/server.js");
  const storeJs = read("server/src/sqlite-store.js");
  const packageJson = read("package.json");
  return {
    checks: {
      serverExposesProfileEndpoints: serverJs.includes('url.pathname === "/api/profile"')
        && serverJs.includes("store.updateProfile"),
      serverExposesFactLibraryEndpoints: serverJs.includes("/api/profile/experiences")
        && serverJs.includes("/api/profile/skills")
        && serverJs.includes("/api/profile/constraints"),
      storeDefinesProfileTables: storeJs.includes("CREATE TABLE IF NOT EXISTS candidate_profiles")
        && storeJs.includes("CREATE TABLE IF NOT EXISTS profile_experiences")
        && storeJs.includes("CREATE TABLE IF NOT EXISTS resume_sources"),
      storeDefinesFactBoundaryFields: storeJs.includes("allowed_rewrites_json")
        && storeJs.includes("forbidden_claims_json")
        && storeJs.includes("evidence_text"),
      packageRunsThisSmoke: packageJson.includes("m5:profile:smoke")
    }
  };
}

function requestJson(port, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : "";
    const request = http.request({
      host: "127.0.0.1",
      port,
      method,
      path: pathname,
      headers: data ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      } : {}
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = null;
        try {
          parsed = JSON.parse(text || "{}");
        } catch {
          parsed = { raw: text };
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(parsed.error || `HTTP ${response.statusCode}`));
          return;
        }
        resolve(parsed);
      });
    });
    request.on("error", reject);
    if (data) {
      request.write(data);
    }
    request.end();
  });
}

async function waitForHealth(port) {
  const deadline = Date.now() + 8000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await requestJson(port, "GET", "/health");
      return;
    } catch (error) {
      lastError = error;
      await sleep(150);
    }
  }
  throw lastError || new Error("Timed out waiting for server");
}

function waitForExit(processHandle) {
  return new Promise((resolve) => {
    processHandle.once("exit", resolve);
    setTimeout(resolve, 1500);
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
