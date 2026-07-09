const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const skillDir = path.join(repoRoot, ".agents", "skills", "career-retrospective-to-job");
const resumeToWordSkillDir = path.join(repoRoot, ".agents", "skills", "resume-to-word");

const requiredFiles = [
  "SKILL.md",
  "references/context_template.md",
  "references/interview_questions.md",
  "references/project_links.md",
  "references/role_clusters.md",
  "references/resume_boundaries.md",
  "examples/career_agent_context.example.md"
];

const docsToCheck = [
  "README.md",
  "docs/03_AGENT_WORKFLOW.md",
  "docs/04_DEVELOPMENT_PLAN.md",
  "docs/05_OPEN_SOURCE_REUSE.md"
];

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const relative of requiredFiles) {
  const filePath = path.join(skillDir, relative);
  assert(fs.existsSync(filePath), `Missing skill file: ${relative}`);
  assert(fs.statSync(filePath).size > 100, `Skill file is unexpectedly small: ${relative}`);
}

const skill = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
assert(skill.includes("description:"), "SKILL.md is missing description metadata");
assert(skill.includes("Use when"), "SKILL.md description should include trigger guidance");
assert(skill.includes("application conversion and JD fit"), "SKILL.md must preserve conversion-first resume strategy");
assert(skill.includes("expression-risk"), "SKILL.md must classify expression-risk facts");
assert(skill.includes("ResumeAgent"), "SKILL.md must explain ResumeAgent boundary");
assert(skill.includes("references/project_links.md"), "career skill must reference project links");

const careerProjectLinks = fs.readFileSync(path.join(skillDir, "references", "project_links.md"), "utf8");
const careerTemplate = fs.readFileSync(path.join(skillDir, "references", "context_template.md"), "utf8");
const careerBoundaries = fs.readFileSync(path.join(skillDir, "references", "resume_boundaries.md"), "utf8");
assert(careerProjectLinks.includes("SmartStor-EduHub"), "career project links must include SmartStor-EduHub");
assert(careerProjectLinks.includes("MissingDanial.github.io"), "career project links must include portfolio mapping");
assert(careerTemplate.includes("项目链接："), "career context template must include project link field");
assert(careerBoundaries.includes("产品实践"), "career boundaries must allow flexible labels for real boundary-complex experience");

const resumeToWordSkill = fs.readFileSync(path.join(resumeToWordSkillDir, "SKILL.md"), "utf8");
const projectLinks = fs.readFileSync(path.join(resumeToWordSkillDir, "references", "project_links.md"), "utf8");
assert(resumeToWordSkill.includes("Do not add standalone sections named `求职摘要`, `核心匹配点`, `技能关键词`, or `补充经历` by default."), "resume-to-word must delete summary/core-match/skills/supplementary sections by default");
assert(resumeToWordSkill.includes("Hard target: 2 pages or less."), "resume-to-word must preserve two-page limit");
assert(projectLinks.includes("SmartStor-EduHub"), "project links must include SmartStor-EduHub");
assert(projectLinks.includes("No public GitHub repo was found"), "project links must document missing public repos");

for (const relative of docsToCheck) {
  const text = readText(relative);
  assert(text.includes("career-retrospective-to-job"), `${relative} does not mention the career skill`);
}

console.log(JSON.stringify({
  ok: true,
  checkedFiles: requiredFiles.length + docsToCheck.length + 2,
  skillDir
}, null, 2));
