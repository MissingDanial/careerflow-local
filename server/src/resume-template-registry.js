const DEFAULT_RESUME_TEMPLATE = "resume-to-word-campus-product-v1";

const RESUME_TEMPLATES = {
  "resume-to-word-campus-product-v1": {
    key: "resume-to-word-campus-product-v1",
    skillName: "resume-to-word",
    label: "Resume To Word campus product template",
    description: "Education-first, internship/project-focused two-page resume layout for campus and product roles.",
    order: ["header", "education", "projects", "awards"],
    showSummarySection: false,
    showSkillsSection: false,
    embedSkillsInProjects: true,
    bodyFontSize: 20,
    headingFontSize: 23,
    nameFontSize: 30,
    sectionSpacingBefore: 110,
    sectionSpacingAfter: 50,
    paragraphSpacingAfter: 64,
    margin: {
      top: 640,
      right: 680,
      bottom: 640,
      left: 680
    },
    maxPages: 2
  },
  "boss-find-fixed-docx-v1": {
    key: "boss-find-fixed-docx-v1",
    skillName: "",
    label: "Boss Find legacy fixed DOCX template",
    description: "Legacy fixed structure with standalone summary and skills sections.",
    order: ["header", "summary", "skills", "projects", "education", "awards"],
    showSummarySection: true,
    showSkillsSection: true,
    embedSkillsInProjects: true,
    bodyFontSize: 21,
    headingFontSize: 24,
    nameFontSize: 30,
    sectionSpacingBefore: 120,
    sectionSpacingAfter: 60,
    paragraphSpacingAfter: 80,
    margin: {
      top: 720,
      right: 720,
      bottom: 720,
      left: 720
    },
    maxPages: 2
  }
};

const TEMPLATE_ALIASES = {
  "": DEFAULT_RESUME_TEMPLATE,
  default: DEFAULT_RESUME_TEMPLATE,
  "resume-to-word": DEFAULT_RESUME_TEMPLATE,
  "sample-reference-docx-layout": DEFAULT_RESUME_TEMPLATE,
  "boss-find-fixed-docx-v1": "boss-find-fixed-docx-v1"
};

function resolveResumeTemplate(templateKey) {
  const normalized = normalizeTemplateKey(templateKey);
  const resolvedKey = TEMPLATE_ALIASES[normalized] || normalized;
  return RESUME_TEMPLATES[resolvedKey] || RESUME_TEMPLATES[DEFAULT_RESUME_TEMPLATE];
}

function normalizeTemplateKey(value) {
  return String(value || "").trim().toLowerCase();
}

function listResumeTemplates() {
  return Object.values(RESUME_TEMPLATES).map((template) => ({
    key: template.key,
    skillName: template.skillName,
    label: template.label,
    description: template.description,
    order: template.order.slice(),
    showSummarySection: template.showSummarySection,
    showSkillsSection: template.showSkillsSection,
    maxPages: template.maxPages
  }));
}

module.exports = {
  DEFAULT_RESUME_TEMPLATE,
  listResumeTemplates,
  resolveResumeTemplate
};
