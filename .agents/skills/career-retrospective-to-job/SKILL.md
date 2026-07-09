---
name: career-retrospective-to-job
description: Builds a structured career retrospective and job-positioning context from resumes, projects, portfolio evidence, and interview answers. Use when a user uploads a resume, wants to review career/life experience, prepare for campus recruiting, choose target roles, adapt resumes to JDs, or create an agent-readable career context before resume generation.
---

# Career Retrospective To Job

## Purpose

Use this skill before job matching or resume rewriting. Its output is not the final resume. Its output is a durable career context that later agents can use to choose evidence, rewrite safely, evaluate JD fit, and prepare interview narratives.

In this repo, the skill belongs upstream of `ProfileAgent` and `ResumeAgent`:

```text
resume upload / interview answers
-> career_agent_context.md
-> resume-ready evidence library
-> risk-ranked expression strategy
-> profile_experiences / profile_skills / profile_constraints
-> ScreeningAgent / ResumeAgent / AuditAgent
```

## Core Rules

- Start with evidence before positioning.
- Separate strong facts, expression-risk facts, major-risk facts, user self-assessment, interpretation, and open questions.
- Optimize for application conversion and JD fit while keeping claims self-consistent and explainable.
- Do not treat every uncertain boundary as a blocker. For real participation with unclear employment/project boundaries, prefer flexible wording such as `产品实践`, `商业化项目`, `合作项目`, `创业项目`, or `项目负责人` instead of deleting high-fit evidence.
- Preserve project names, dates, metrics, links, role boundaries, and evidence sources.
- Convert anxiety or scattered stories into professional positioning without self-denigration.
- Do not fabricate internships, employers, awards, metrics, technical depth, publications, or launched-product claims.
- Treat unfinished or boundary-complex projects as usable evidence for learning, validation, product judgment, or engineering execution when the candidate has real participation and can explain the role.
- `PENDING` means the item needs expression strategy or interview explanation. Exclude it only when it is obviously fabricated, unrelated to the candidate's contribution, or likely to create major background-check risk.

## Inputs To Read First

If files or paths are provided, inspect them before asking broad questions:

- Existing resumes: DOCX, PDF, Markdown, TXT, or images.
- Portfolio links, GitHub repos, project folders, READMEs, screenshots, demos, videos.
- Target roles, industries, cities, internship/full-time constraints, salary expectations.
- Job descriptions if available.
- Extra project stories not already in the resume.
- Truth and conversion boundaries: what can be stated aggressively, what needs safer wording, and what is too risky to use.

## Workflow

1. Build an evidence map from all provided artifacts.
2. Summarize visible positioning, strong evidence, weak evidence, risky claims, and missing information.
3. Interview in rounds instead of asking everything at once:
   - goals and constraints
   - motivations and values
   - project depth
   - skill boundaries
   - truth and risk
4. Create or update `career_agent_context.md`.
5. Attach reliable project links when public repos or portfolio pages can be verified. Use [references/project_links.md](references/project_links.md) for known links and do not invent missing GitHub URLs.
6. Convert candidate facts into resume-ready evidence with a risk level: `strong`, `expression-risk`, or `major-risk`.
7. Use `strong` and `expression-risk` evidence in JD-tailored resumes; only `major-risk` evidence requires exclusion or explicit user confirmation before use.

## Output Contract

The main output should include:

- one-sentence positioning
- target role clusters
- resume-ready facts
- expression-risk facts and interview explanation notes
- project material library
- skill map with proficiency boundaries
- rewrite rules
- forbidden claims
- JD matching guidance
- recommended resume versions
- next actions for later agents

Use [references/context_template.md](references/context_template.md) for the full document shape.

## References

- [references/context_template.md](references/context_template.md)
- [references/interview_questions.md](references/interview_questions.md)
- [references/project_links.md](references/project_links.md)
- [references/role_clusters.md](references/role_clusters.md)
- [references/resume_boundaries.md](references/resume_boundaries.md)
- [examples/career_agent_context.example.md](examples/career_agent_context.example.md)
