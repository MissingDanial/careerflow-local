const fs = require("fs");
const mammoth = require("mammoth");

const HEADING_BY_SECTION = {
  summary: "求职摘要",
  skills: "技能",
  education: "教育经历",
  projects: "项目经历",
  awards: "奖项与证书"
};

async function evaluateResumeRenderQuality(input = {}) {
  const filePath = String(input.filePath || input.rendered?.filePath || "");
  const fields = input.resumeFields && typeof input.resumeFields === "object" ? input.resumeFields : {};
  const renderMetadata = input.renderMetadata && typeof input.renderMetadata === "object" ? input.renderMetadata : {};
  const rendered = input.rendered && typeof input.rendered === "object" ? input.rendered : {};
  const text = filePath && fs.existsSync(filePath) ? await extractDocxText(filePath) : "";
  return evaluateResumeRenderText({
    text,
    resumeFields: fields,
    renderMetadata,
    rendered
  });
}

function evaluateResumeRenderText(input = {}) {
  const text = normalizeText(input.text || "");
  const fields = input.resumeFields && typeof input.resumeFields === "object" ? input.resumeFields : {};
  const renderMetadata = input.renderMetadata && typeof input.renderMetadata === "object" ? input.renderMetadata : {};
  const rendered = input.rendered && typeof input.rendered === "object" ? input.rendered : {};
  const template = String(renderMetadata.template || rendered.template || "");
  const expectedOrder = Array.isArray(renderMetadata.templateOrder || rendered.templateOrder)
    ? (renderMetadata.templateOrder || rendered.templateOrder)
    : [];
  const maxPages = Number(renderMetadata.maxPages || rendered.maxPages || 2) || 2;
  const estimatedPages = Number(rendered.estimatedPages || renderMetadata.estimatedPages || estimatePagesFromFields(fields)) || 1;
  const missingExpectedHeadings = getMissingExpectedHeadings(text, expectedOrder, fields, renderMetadata);
  const checks = {
    docxTextExtracted: text.length > 0,
    templateRecorded: Boolean(template),
    requiredFieldsPresent: hasRequiredFields(fields),
    expectedHeadingsPresent: missingExpectedHeadings.length === 0,
    sectionOrderPassed: sectionOrderPassed(text, expectedOrder),
    summarySectionPolicyPassed: renderMetadata.showSummarySection === false ? !text.includes(HEADING_BY_SECTION.summary) : true,
    skillsSectionPolicyPassed: renderMetadata.showSkillsSection === false ? !hasStandaloneSkillsHeading(text) : true,
    pageEstimatePassed: estimatedPages <= maxPages,
    noMojibakeHeadings: !/[锛绠鍘姹鎶椤鏁濂]/.test(headingsOnly(text))
  };
  const blockingChecks = {
    docxTextExtracted: checks.docxTextExtracted,
    templateRecorded: checks.templateRecorded,
    expectedHeadingsPresent: checks.expectedHeadingsPresent,
    sectionOrderPassed: checks.sectionOrderPassed,
    summarySectionPolicyPassed: checks.summarySectionPolicyPassed,
    skillsSectionPolicyPassed: checks.skillsSectionPolicyPassed,
    pageEstimatePassed: checks.pageEstimatePassed,
    noMojibakeHeadings: checks.noMojibakeHeadings
  };
  const warnings = buildWarnings(checks, { estimatedPages, maxPages, template, missingExpectedHeadings });
  return {
    ok: Object.values(blockingChecks).every(Boolean),
    checks,
    blockingChecks,
    warnings,
    textLength: text.length,
    estimatedPages,
    maxPages,
    template,
    extractedHeadings: extractKnownHeadings(text),
    missingExpectedHeadings,
    evaluatedAt: new Date().toISOString()
  };
}

async function extractDocxText(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || "";
  } catch {
    return "";
  }
}

function hasRequiredFields(fields = {}) {
  const hasName = Boolean(clean(fields.name));
  const hasTarget = Boolean(clean(fields.headline || fields.targetRole));
  const hasProjects = Array.isArray(fields.projects) && fields.projects.some((project) => {
    return clean(project?.title) || normalizeStringArray(project?.bullets).length > 0;
  });
  const hasEducation = Array.isArray(fields.education) && fields.education.some((item) => clean(item?.title || item?.organization));
  return hasName && hasTarget && hasProjects && hasEducation;
}

function getMissingExpectedHeadings(text, order = [], fields = {}, renderMetadata = {}) {
  return order
    .filter((section) => !new Set(["header"]).has(section))
    .filter((section) => HEADING_BY_SECTION[section])
    .filter((section) => sectionHasContent(section, fields, renderMetadata))
    .map((section) => HEADING_BY_SECTION[section])
    .filter((heading) => !text.includes(heading));
}

function sectionHasContent(section, fields = {}, renderMetadata = {}) {
  if (section === "summary") {
    return renderMetadata.showSummarySection !== false && Boolean(clean(fields.summary));
  }
  if (section === "skills") {
    return renderMetadata.showSkillsSection !== false && normalizeStringArray(fields.skills).length > 0;
  }
  if (section === "education") {
    return Array.isArray(fields.education) && fields.education.some((item) => {
      return clean(item?.title || item?.organization) || normalizeStringArray(item?.bullets).length > 0;
    });
  }
  if (section === "projects") {
    return Array.isArray(fields.projects) && fields.projects.some((project) => {
      return clean(project?.title || project?.organization) || normalizeStringArray(project?.bullets).length > 0;
    });
  }
  if (section === "awards") {
    return normalizeStringArray(fields.awards).length > 0;
  }
  return false;
}

function hasStandaloneSkillsHeading(text) {
  return text.split(/\r?\n/).some((line) => clean(line) === HEADING_BY_SECTION.skills);
}

function sectionOrderPassed(text, order = []) {
  const positions = order
    .map((section) => ({ heading: HEADING_BY_SECTION[section], index: HEADING_BY_SECTION[section] ? text.indexOf(HEADING_BY_SECTION[section]) : -1 }))
    .filter((item) => item.heading && item.index >= 0);
  return positions.every((item, index) => index === 0 || item.index >= positions[index - 1].index);
}

function headingsOnly(text) {
  return extractKnownHeadings(text).join(" ");
}

function extractKnownHeadings(text) {
  return Object.values(HEADING_BY_SECTION).filter((heading) => text.includes(heading));
}

function buildWarnings(checks, context = {}) {
  const warnings = [];
  if (!checks.docxTextExtracted) warnings.push("DOCX text extraction failed or returned empty text.");
  if (!checks.templateRecorded) warnings.push("Render template metadata is missing.");
  if (!checks.requiredFieldsPresent) warnings.push("Resume is missing required name, target, education, or project fields.");
  if (!checks.expectedHeadingsPresent) {
    const missing = normalizeStringArray(context.missingExpectedHeadings).join(", ");
    warnings.push(`Generated DOCX is missing expected headings for rendered content${missing ? `: ${missing}` : "."}`);
  }
  if (!checks.sectionOrderPassed) warnings.push("Generated DOCX section order does not match selected template order.");
  if (!checks.summarySectionPolicyPassed) warnings.push("Default template should not render standalone summary heading.");
  if (!checks.skillsSectionPolicyPassed) warnings.push("Default template should not render standalone skills heading.");
  if (!checks.pageEstimatePassed) warnings.push(`Estimated page count ${context.estimatedPages} exceeds template limit ${context.maxPages}.`);
  if (!checks.noMojibakeHeadings) warnings.push("Generated headings appear to contain mojibake text.");
  return warnings;
}

function estimatePagesFromFields(fields = {}) {
  const totalChars = [
    fields.name,
    fields.headline,
    fields.targetRole,
    fields.summary,
    ...(fields.skills || []),
    ...(fields.awards || []),
    ...(fields.projects || []).flatMap((project) => [
      project.title,
      project.organization,
      project.role,
      ...(project.skills || []),
      ...(project.bullets || [])
    ]),
    ...(fields.education || []).flatMap((item) => [
      item.title,
      item.organization,
      item.role,
      ...(item.bullets || [])
    ])
  ].join(" ").length;
  return Math.max(1, Math.ceil(totalChars / 1800));
}

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

module.exports = {
  evaluateResumeRenderQuality,
  evaluateResumeRenderText
};
