---
name: resume-to-word
description: Convert a career context, resume source, personal project library, and target JD into a polished two-page Word resume. Use when the user asks to generate, revise, tailor, or export a resume/CV as DOCX for a specific job, especially Chinese campus recruiting, AI product, agent product, AIGC, data product, or product-manager roles.
---

# Resume To Word

## Purpose

Create a job-submission Word resume, not an agent reasoning report. Prioritize recruiter scan order, JD evidence density, and page control.

## Required Inputs

- Career context or resume source.
- Target JD or target role cluster.
- Existing reference DOCX/photo when provided.
- Project links from `references/project_links.md` when project names appear in the resume.

## Output Structure

Use this order by default:

1. Header: name, phone, email, and one short portfolio/GitHub hint.
2. Education background.
3. Internships and project experience.

Do not add standalone sections named `求职摘要`, `核心匹配点`, `技能关键词`, or `补充经历` by default. Convert those ideas into project ordering, project titles, and bullet wording.

## Header Rules

- Keep contact to one compact line when possible.
- Include personal website and GitHub as a hint, not as a large section.
- Recommended format: `作品集: https://missingdanial.github.io | GitHub: https://github.com/MissingDanial`.

## Education Rules

- Put education before projects for campus, internship, and junior roles.
- Include school, degree/major, dates, and major honors.
- Keep education concise. Do not expand architecture coursework unless the JD values spatial analysis, research, design, or human behavior.

## Project Selection

- Select 3-5 projects based on JD fit.
- Prefer internships and high-signal projects over broad coverage.
- Every selected project should map to at least one JD requirement.
- Add a project link after the project title when a reliable public link exists.
- Do not fabricate links. If no public repo exists, omit the link or write `本地项目 / GitHub 待发布` only when useful.

Use `references/project_links.md` for known links.

## Bullet Rules

Write bullets as evidence:

`context/problem -> action/method -> result/metric -> JD capability`

Prefer:

- user research, PRD, product workflow, metrics, prototype, pilot, cross-functional communication
- RAG, Prompt Engineering, LLM-as-Judge, Agent workflow, ComfyUI, SQL/Python only inside project evidence

Avoid:

- generic self-evaluation
- long skill lists
- repeating every tool
- describing internal agent/audit framework unless it helps JD fit

## Conversion-First Truth Policy

Optimize for application conversion and JD fit. Boundary-complex but real participation can be used with safer labels such as `产品实践`, `商业化项目`, `合作项目`, `创业项目`, or `项目负责人`.

Exclude only major-risk material: clearly fabricated, not the user's contribution, impossible to explain, or likely to create serious background-check risk.

## Page Control

Hard target: 2 pages or less.

Compression order:

1. Remove standalone summary, core-match, and skills sections.
2. Remove supplementary experience.
3. Reduce each project to 3-5 bullets.
4. Reduce older/non-core projects to 1-2 bullets or omit.
5. Keep education and the top 2 JD-matched projects intact as long as possible.

Estimate page risk before finalizing. If the Word output exceeds 2 pages, revise content rather than shrinking fonts below a readable level.

## DOCX Generation Rules

- Use the `docx` skill rules for Word files.
- Use stable A4 page sizing and compact margins for Chinese resumes.
- Use real bullet numbering, not manual bullet characters.
- Keep typography simple: Microsoft YaHei or SimSun, readable 9-10.5 pt body text.
- Validate by extracting text from the generated DOCX and checking required project names and links.
