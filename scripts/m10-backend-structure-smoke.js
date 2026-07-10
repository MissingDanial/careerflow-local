#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

main();

function main() {
  const serverJs = read("server/src/server.js");
  const profileServiceJs = read("server/src/services/profile-service.js");
  const resumeWorkflowServiceJs = read("server/src/services/resume-workflow-service.js");
  const serverUtilsJs = read("server/src/server-utils.js");
  const packageJson = read("package.json");
  const readme = read("README.md");
  const planDoc = read("docs/04_DEVELOPMENT_PLAN.md");

  const checks = {
    serverUsesProfileService: serverJs.includes('require("./services/profile-service")')
      && serverJs.includes("createProfileService")
      && serverJs.includes("profileService.readCareerContext()")
      && serverJs.includes("profileService.generateCareerContext(payload)"),
    serverUsesResumeWorkflowService: serverJs.includes('require("./services/resume-workflow-service")')
      && serverJs.includes("createResumeWorkflowService")
      && serverJs.includes("resumeWorkflowService.runGraph"),
    serverNoLongerOwnsMovedImplementations: !serverJs.includes("async function generateCareerContext")
      && !serverJs.includes("runResumeWorkflowGraph({")
      && !serverJs.includes("buildCareerContext"),
    profileServiceOwnsCareerContext: profileServiceJs.includes("createProfileService")
      && profileServiceJs.includes("readCareerContextFile")
      && profileServiceJs.includes("buildCareerContext")
      && profileServiceJs.includes("writeCareerContextFile")
      && profileServiceJs.includes("CAREER_CONTEXT_GENERATED")
      && profileServiceJs.includes("CAREER_CONTEXT_FAILED")
      && profileServiceJs.includes("pendingFactsRemainPending: true"),
    resumeWorkflowServiceOwnsGraphOptions: resumeWorkflowServiceJs.includes("createResumeWorkflowService")
      && resumeWorkflowServiceJs.includes("runResumeWorkflowGraph")
      && resumeWorkflowServiceJs.includes("generated_resumes")
      && resumeWorkflowServiceJs.includes("maxRevisions: payload.maxRevisions ?? 1"),
    sharedUtilsOwnErrorHelpers: serverUtilsJs.includes("function structuredError")
      && serverUtilsJs.includes("function httpError")
      && serverUtilsJs.includes("function summarizeProfileForTrace")
      && serverJs.includes('require("./server-utils")'),
    packageChecksNewFiles: packageJson.includes("check:syntax")
      && packageJson.includes("m10-backend-structure-smoke.js")
      && packageJson.includes("m10:backend-structure:smoke"),
    docsMentionStructure: readme.includes("M10.5 Backend Service Structure")
      && planDoc.includes("M10.5 Backend Service Structure")
  };

  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ ok, checks }, null, 2));
  process.exitCode = ok ? 0 : 1;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
