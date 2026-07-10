#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { renderResumeDocx } = require("../server/src/document-renderer");
const { runAuditAgent } = require("../server/src/audit-agent");
const { evaluateResumeRenderText } = require("../server/src/resume-render-qa");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m11-render-qa-"));
  try {
    const defaultRendered = await renderResumeDocx(sampleResumeVersion({ id: 1 }), {
      outputDir: dataDir
    });
    const legacyRendered = await renderResumeDocx(sampleResumeVersion({ id: 2 }), {
      outputDir: dataDir,
      templateName: "boss-find-fixed-docx-v1"
    });
    const failedQa = evaluateResumeRenderText({
      text: "Sample Candidate\n项目经历\nBuilt agent workflow\n教育经历\nSample University\n技能",
      resumeFields: sampleResumeVersion({ id: 3 }).resumeFields,
      renderMetadata: {
        template: "resume-to-word-campus-product-v1",
        templateOrder: ["header", "education", "projects", "awards"],
        showSummarySection: false,
        showSkillsSection: false,
        maxPages: 2
      },
      rendered: { estimatedPages: 1 }
    });
    const blockedAudit = runAuditAgent({
      resumeVersionId: 3,
      screening: { matchScore: 90, riskScore: 10, recommendation: "auto_prepare" },
      profile: { experiences: [], skills: [] },
      resumeFields: sampleResumeVersion({ id: 3 }).resumeFields,
      sourceMapping: fullSourceMapping(),
      unsupportedClaims: [],
      renderMetadata: {
        renderQuality: failedQa
      }
    }, { mode: "rules" }).result;
    const rendererJs = read("server/src/document-renderer.js");
    const qaJs = read("server/src/resume-render-qa.js");
    const auditJs = read("server/src/audit-agent.js");
    const optionsJs = read("extension/src/options.js");
    const packageJson = read("package.json");
    const checks = {
      defaultRenderQaPasses: defaultRendered.renderQuality?.ok === true
        && defaultRendered.renderQuality.checks.sectionOrderPassed
        && defaultRendered.renderQuality.checks.summarySectionPolicyPassed
        && defaultRendered.renderQuality.checks.skillsSectionPolicyPassed,
      legacyRenderQaPasses: legacyRendered.renderQuality?.ok === true
        && legacyRendered.renderQuality.checks.expectedHeadingsPresent,
      qaDetectsBadOrderAndStandaloneSkills: failedQa.ok === false
        && failedQa.checks.sectionOrderPassed === false
        && failedQa.checks.skillsSectionPolicyPassed === false
        && failedQa.warnings.length >= 2,
      auditBlocksFailedRenderQa: blockedAudit.recommendation === "block"
        && blockedAudit.renderMetadata.renderQualityPassed === false
        && blockedAudit.riskFlags.some((item) => item.includes("Render QA")),
      rendererAttachesQa: rendererJs.includes("evaluateResumeRenderQuality")
        && rendererJs.includes("result.renderQuality"),
      qaUsesMammoth: qaJs.includes("mammoth.extractRawText"),
      auditReadsRenderQa: auditJs.includes("renderQualityPassed")
        && auditJs.includes("Render QA:"),
      optionsDisplaysRenderQa: optionsJs.includes("function appendRenderQuality")
        && optionsJs.includes("DOCX QA")
        && optionsJs.includes("renderMetadata.renderQuality"),
      packageRunsThisSmoke: packageJson.includes("m11-render-qa-smoke.js")
        && packageJson.includes("m11:render-qa:smoke")
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      summary: {
        defaultQa: defaultRendered.renderQuality,
        legacyQa: legacyRendered.renderQuality,
        failedWarnings: failedQa.warnings
      }
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

function sampleResumeVersion({ id }) {
  return {
    id,
    applicationId: 11,
    title: "AI Product Manager",
    resumeFields: {
      name: "Sample Candidate",
      headline: "AI Product / Agent Workflow Candidate",
      targetRole: "AI Product Manager Intern",
      contact: {
        email: "sample@example.com",
        website: "https://example.com/portfolio"
      },
      summary: "JD-tailored summary should be embedded through ordering and bullets in the default skill template.",
      skills: ["用户研究", "PRD", "Agent 工作流", "RAG"],
      education: [{
        title: "Human-Computer Interaction Graduate Program",
        organization: "Sample University",
        role: "Graduate Student",
        period: "2024.09 - 2027.06",
        bullets: ["Trained in user research, workflow analysis, and product decisions."]
      }],
      projects: [{
        title: "AI Teaching Assistant Agent",
        organization: "Sample EdTech Team",
        role: "AI Product Intern",
        period: "2026.03 - 2026.06",
        skills: ["用户研究", "Agent 工作流", "RAG"],
        bullets: [
          "Interviewed educators to map lesson-planning bottlenecks.",
          "Designed a Generator / Evaluator Agent workflow with audit states.",
          "Collaborated with engineering partners on RAG retrieval."
        ]
      }],
      awards: ["Sample scholarship"]
    },
    renderMetadata: {}
  };
}

function fullSourceMapping() {
  return [
    { resumeField: "summary", sourceType: "profile", sourceId: null, sourceFact: "summary source" },
    { resumeField: "projects[0].title", sourceType: "experience", sourceId: 1, sourceFact: "project title source" },
    { resumeField: "projects[0].bullets[0]", sourceType: "experience", sourceId: 1, sourceFact: "project bullet source" },
    { resumeField: "projects[0].bullets[1]", sourceType: "experience", sourceId: 1, sourceFact: "project bullet source" },
    { resumeField: "projects[0].bullets[2]", sourceType: "experience", sourceId: 1, sourceFact: "project bullet source" }
  ];
}

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}
