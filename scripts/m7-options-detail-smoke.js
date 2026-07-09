#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

main();

function main() {
  const optionsHtml = read("extension/src/options.html");
  const optionsJs = read("extension/src/options.js");
  const optionsCss = read("extension/src/options.css");
  const backgroundJs = read("extension/src/background.js");
  const packageJson = read("package.json");

  const detailIds = [
    "resumeDetailPanel",
    "resumeDetailTitle",
    "resumeDetailStatus",
    "resumeFieldPreview",
    "resumeDiffSummary",
    "resumeSourceMapping",
    "resumeAuditRisk",
    "toggleResumeEditor",
    "saveResumeRevision",
    "approveResumeLocal",
    "resumeEditor",
    "resumeEditSummary",
    "resumeEditSkills",
    "resumeEditProjects",
    "resumeEditAwards",
    "resumeEditReason"
  ];

  const checks = {
    optionsHasResumeDetailPanel: optionsHtml.includes("简历详情")
      && detailIds.every((id) => optionsHtml.includes(`id="${id}"`)),
    optionsReadsDetailIds: detailIds
      .filter((id) => id !== "resumeDetailPanel")
      .every((id) => optionsJs.includes(`getElementById("${id}")`)),
    backgroundHandlesDetailMessages: backgroundJs.includes('case "GET_RESUME_VERSION"')
      && backgroundJs.includes('case "GET_RESUME_AUDIT"'),
    backgroundCallsDetailEndpoints: backgroundJs.includes("/api/resume-versions/${id}")
      && backgroundJs.includes("/api/resume-audits/${id}"),
    backgroundHandlesRevisionAndApprovalMessages: backgroundJs.includes('case "REVISE_RESUME"')
      && backgroundJs.includes('case "APPROVE_RESUME_LOCAL"')
      && backgroundJs.includes("/api/resume-versions/${id}/revise")
      && backgroundJs.includes("/api/resume-versions/${id}/approve-local"),
    optionsCanLoadVersionAndAuditDetails: optionsJs.includes("showResumeVersionDetail")
      && optionsJs.includes("GET_RESUME_VERSION")
      && optionsJs.includes("GET_RESUME_AUDITS")
      && optionsJs.includes("showResumeAuditDetail")
      && optionsJs.includes("GET_RESUME_AUDIT"),
    optionsCanEditAndApproveDetails: optionsJs.includes("saveResumeRevision")
      && optionsJs.includes("APPROVE_RESUME_LOCAL")
      && optionsJs.includes("REVISE_RESUME")
      && optionsJs.includes("readResumeRevisionFields")
      && optionsJs.includes("splitProjectBlocks")
      && optionsJs.includes("localApproval"),
    optionsRendersResumeEvidenceAndRisk: optionsJs.includes("renderResumeDetail")
      && optionsJs.includes("resumeFields")
      && optionsJs.includes("sourceMapping")
      && optionsJs.includes("renderAuditRisk")
      && optionsJs.includes("unsupportedClaims"),
    optionsListItemsAreClickable: optionsJs.includes("actionLabel")
      && optionsJs.includes("onClick")
      && optionsJs.includes("inline-action"),
    optionsAutoloadsDetailsAfterActions: optionsJs.includes("await showResumeVersionDetail(resumeVersion.id)")
      && optionsJs.includes("await showResumeAuditDetail(audit.id)"),
    cssHasDetailPanel: optionsCss.includes(".detail-panel")
      && optionsCss.includes(".detail-grid")
      && optionsCss.includes(".detail-section")
      && optionsCss.includes(".pill-group")
      && optionsCss.includes(".inline-action")
      && optionsCss.includes(".editor-panel")
      && optionsCss.includes(".editor-grid"),
    packageRunsThisSmoke: packageJson.includes("m7-options-detail-smoke.js")
      && packageJson.includes("m7:options-detail:smoke")
  };

  const ok = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ ok, checks }, null, 2));
  process.exitCode = ok ? 0 : 1;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}
