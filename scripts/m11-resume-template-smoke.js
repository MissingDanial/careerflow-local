#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const mammoth = require("mammoth");
const { renderResumeDocx } = require("../server/src/document-renderer");
const {
  DEFAULT_RESUME_TEMPLATE,
  listResumeTemplates,
  resolveResumeTemplate
} = require("../server/src/resume-template-registry");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-m11-template-"));
  try {
    const defaultRendered = await renderResumeDocx(sampleResumeVersion({ id: 1 }), {
      outputDir: dataDir
    });
    const legacyRendered = await renderResumeDocx(sampleResumeVersion({ id: 2 }), {
      outputDir: dataDir,
      templateName: "boss-find-fixed-docx-v1"
    });
    const defaultText = await extractText(defaultRendered.filePath);
    const legacyText = await extractText(legacyRendered.filePath);
    const defaultHeadings = defaultRendered.renderQuality?.extractedHeadings || [];
    const legacyHeadings = legacyRendered.renderQuality?.extractedHeadings || [];
    const templates = listResumeTemplates();
    const defaultTemplate = resolveResumeTemplate(DEFAULT_RESUME_TEMPLATE);
    const serverJs = read("server/src/server.js");
    const backgroundJs = read("extension/src/background.js");
    const optionsJs = read("extension/src/options.js");
    const checks = {
      defaultTemplateIsResumeToWordSkill: defaultTemplate.key === "resume-to-word-campus-product-v1"
        && defaultTemplate.skillName === "resume-to-word",
      registryListsDefaultAndLegacy: templates.some((item) => item.key === "resume-to-word-campus-product-v1")
        && templates.some((item) => item.key === "boss-find-fixed-docx-v1"),
      registryListIsUiSafe: templates.every((item) => item.key && item.label && Array.isArray(item.order))
        && templates.every((item) => !("bodyFontSize" in item) && !("margin" in item)),
      backendExposesTemplateRegistry: serverJs.includes("/api/resume-templates")
        && serverJs.includes("listResumeTemplates")
        && serverJs.includes("DEFAULT_RESUME_TEMPLATE"),
      extensionLoadsTemplateRegistry: backgroundJs.includes('case "GET_RESUME_TEMPLATES"')
        && backgroundJs.includes("/api/resume-templates")
        && optionsJs.includes("refreshResumeTemplates")
        && optionsJs.includes("renderResumeTemplateOptions"),
      extensionPersistsTemplateSelection: backgroundJs.includes("resumeTemplateName")
        && backgroundJs.includes("normalizeResumeTemplateName")
        && optionsJs.includes("saveResumeTemplateSelection")
        && optionsJs.includes("dataset.pendingValue"),
      defaultRenderRecordsTemplate: defaultRendered.template === "resume-to-word-campus-product-v1"
        && defaultRendered.templateSkill === "resume-to-word"
        && defaultRendered.showSummarySection === false
        && defaultRendered.showSkillsSection === false
        && defaultRendered.renderQuality?.ok === true,
      defaultRenderUsesEducationBeforeProjects: defaultRendered.renderQuality?.checks?.sectionOrderPassed === true
        && defaultHeadings.includes("教育经历")
        && defaultHeadings.includes("项目经历"),
      defaultRenderOmitsStandaloneSummaryAndSkills: defaultRendered.renderQuality?.checks?.summarySectionPolicyPassed === true
        && defaultRendered.renderQuality?.checks?.skillsSectionPolicyPassed === true
        && defaultText.includes("AI Teaching Assistant Agent"),
      legacyRenderStillSupportsStandaloneSections: legacyRendered.template === "boss-find-fixed-docx-v1"
        && legacyRendered.showSummarySection === true
        && legacyRendered.renderQuality?.ok === true
        && legacyHeadings.includes("求职摘要")
        && legacyHeadings.includes("技能")
        && legacyText.includes("AI Teaching Assistant Agent"),
      generatedDocxFilesExist: fs.existsSync(defaultRendered.filePath)
        && fs.existsSync(legacyRendered.filePath)
        && fs.statSync(defaultRendered.filePath).size > 1000
        && fs.statSync(legacyRendered.filePath).size > 1000
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      summary: {
        defaultTemplate: defaultRendered.template,
        legacyTemplate: legacyRendered.template,
        defaultBytes: defaultRendered.byteLength,
        legacyBytes: legacyRendered.byteLength
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
        phone: "100-0000-0000",
        email: "sample@example.com",
        website: "https://example.com/portfolio",
        github: "https://github.com/example"
      },
      summary: "JD-tailored summary should be embedded through ordering and bullets in the default skill template.",
      skills: ["用户研究", "PRD", "Agent 工作流", "RAG", "LangGraph", "Node.js"],
      education: [{
        title: "Human-Computer Interaction Graduate Program",
        organization: "Sample University",
        role: "Graduate Student",
        period: "2024.09 - 2027.06",
        bullets: ["Trained in user research, workflow analysis, product discovery, and evidence-based product decisions."]
      }],
      projects: [{
        title: "AI Teaching Assistant Agent",
        organization: "Sample EdTech Team",
        role: "AI Product Intern",
        period: "2026.03 - 2026.06",
        skills: ["用户研究", "Agent 工作流", "RAG", "LLM-as-Judge"],
        bullets: [
          "Interviewed educators to map lesson-planning bottlenecks and quality review needs.",
          "Designed a Generator / Evaluator Agent workflow with revision limits, audit states, and progress logs.",
          "Collaborated with engineering partners on RAG retrieval, query rewriting, reranking, and citation snippets."
        ]
      }],
      awards: ["Sample scholarship"]
    },
    renderMetadata: {}
  };
}

async function extractText(filePath) {
  return (await mammoth.extractRawText({ path: filePath })).value || "";
}

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}
