#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const mammoth = require("mammoth");
const { createJobStore } = require("../server/src/sqlite-store");
const { runResumeWorkflowGraph, GRAPH_VERSION } = require("../server/src/resume-workflow-graph");

const SAMPLE_DIR = process.env.BOSS_FIND_SAMPLE_RESUME_DIR ? path.resolve(process.env.BOSS_FIND_SAMPLE_RESUME_DIR) : "";
const CAREER_CONTEXT_PATH = process.env.BOSS_FIND_SAMPLE_CAREER_CONTEXT
  || (SAMPLE_DIR ? path.join(SAMPLE_DIR, "career_agent_context.md") : "");
const REFERENCE_DOCX_PATH = process.env.BOSS_FIND_SAMPLE_REFERENCE_DOCX
  || (SAMPLE_DIR ? path.join(SAMPLE_DIR, "resume.docx") : "");
const PHOTO_PATH = process.env.BOSS_FIND_SAMPLE_PHOTO
  || (SAMPLE_DIR ? path.join(SAMPLE_DIR, "photo.jpg") : "");
const SAMPLE_OWNER = {
  displayName: process.env.BOSS_FIND_SAMPLE_NAME || "Sample Candidate",
  headline: "AI Product / Agent Workflow Candidate",
  location: "Local",
  phone: process.env.BOSS_FIND_SAMPLE_PHONE || "",
  email: process.env.BOSS_FIND_SAMPLE_EMAIL || "",
  website: process.env.BOSS_FIND_SAMPLE_WEBSITE || "https://example.com/portfolio",
  github: process.env.BOSS_FIND_SAMPLE_GITHUB || "https://github.com/example"
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "boss-find-langgraph-resume-"));
  const outputDir = process.env.LANGGRAPH_RESUME_OUTPUT_DIR
    ? path.resolve(process.env.LANGGRAPH_RESUME_OUTPUT_DIR)
    : path.join(dataDir, "generated_resumes");
  const store = createJobStore({ dataDir });
  try {
    const sample = await readSampleInputs();
    seedProfileFromCareerContext(store, sample);
    store.syncJobs(createSampleJobPayload(sample));
    const application = store.getApplications({ limit: 10 }).applications[0];
    const graphResult = await runResumeWorkflowGraph({
      store,
      applicationId: application.id,
      mode: "rules",
      maxRevisions: 1,
      renderDocx: true,
      renderOptions: {
        outputDir,
        photoPath: sample.photoPath,
        referenceDocxPath: sample.referenceDocxPath,
        templateName: "sample-reference-docx-layout"
      }
    });
    const stats = store.getStats();
    const runs = store.getAgentRuns({ applicationId: application.id, limit: 30 }).runs;
    const events = store.getWorkflowEvents({ applicationId: application.id, limit: 200 }).events;
    const timeline = store.getApplicationTimeline(application.id, { limit: 200 });
    const outputDocxExists = Boolean(graphResult.resumeVersion?.filePath && fs.existsSync(graphResult.resumeVersion.filePath));
    const outputDocxBytes = outputDocxExists ? fs.statSync(graphResult.resumeVersion.filePath).size : 0;
    const outputText = outputDocxExists ? (await mammoth.extractRawText({ path: graphResult.resumeVersion.filePath })).value : "";
    const checks = {
      sampleCareerContextReadable: sample.usedExternalContext
        ? sample.careerContext.length > 1000
        : sample.careerContext.includes(SAMPLE_OWNER.displayName) && sample.careerContext.length > 1000,
      sampleReferenceDocxReadable: sample.usedExternalReferenceDocx ? sample.referenceText.length > 100 : sample.referenceText === "",
      samplePhotoReadable: sample.usedExternalPhoto ? sample.photoBytes > 1000 : sample.photoBytes === 0,
      graphCompletes: graphResult.ok && graphResult.graphVersion === GRAPH_VERSION,
      graphRunsExpectedAgents: ["ScreeningAgent", "ResumeAgent", "ResumeFitEvaluator", "ClaimVerifier", "AuditAgent"]
        .every((agentName) => runs.some((run) => run.agentName === agentName)),
      graphPersistsChecks: stats.resumeVersionCount >= 1
        && stats.resumeFitEvaluationCount >= 1
        && stats.resumeClaimVerificationCount >= 1
        && stats.resumeAuditCount >= 1,
      graphRecordsWorkflowEvents: events.some((event) => event.eventType === "RESUME_WORKFLOW_GRAPH_STARTED")
        && events.some((event) => event.eventType === "RESUME_WORKFLOW_GRAPH_COMPLETED"),
      graphRendersDocx: outputDocxExists && outputDocxBytes > 1000,
      graphEmbedsRenderMetadata: graphResult.resumeVersion?.renderMetadata?.photoPath === sample.photoPath
        && graphResult.resumeVersion?.renderMetadata?.referenceDocxPath === sample.referenceDocxPath,
      graphUsesSkillBackedDefaultTemplate: graphResult.resumeVersion?.renderMetadata?.template === "resume-to-word-campus-product-v1"
        && graphResult.resumeVersion?.renderMetadata?.templateSkill === "resume-to-word",
      graphPersistsRenderQuality: graphResult.resumeVersion?.renderMetadata?.renderQuality?.ok === true
        && graphResult.resumeAudit?.renderMetadata?.renderQualityPassed === true,
      generatedDocxHasExpectedText: outputText.includes(SAMPLE_OWNER.displayName)
        && outputText.includes("AI")
        && outputText.length > 200,
      workflowTimelineIncludesGraph: timeline.items.some((item) => String(item.title || item.eventType || "").includes("RESUME_WORKFLOW_GRAPH"))
        || events.some((event) => event.eventType === "RESUME_WORKFLOW_GRAPH_COMPLETED")
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify({
      ok,
      checks,
      summary: {
        applicationId: application.id,
        finalApplicationStatus: store.getApplications({ limit: 10 }).applications[0]?.status || "",
        screeningId: graphResult.screening?.id || null,
        resumeVersionId: graphResult.resumeVersion?.id || null,
        resumeAuditId: graphResult.resumeAudit?.id || null,
        revisionCount: graphResult.revisionCount,
        nodeCount: graphResult.nodeEvents.length,
        docxPath: graphResult.resumeVersion?.filePath || "",
        docxBytes: outputDocxBytes,
        sampleMode: sample.mode,
        referenceTextLength: sample.referenceText.length,
        workflowEventCount: events.length
      }
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    store.close();
    if (process.exitCode === 0) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } else {
      console.error(`Smoke data retained for debugging: ${dataDir}`);
    }
  }
}

async function readSampleInputs() {
  const usedExternalContext = Boolean(CAREER_CONTEXT_PATH && fs.existsSync(CAREER_CONTEXT_PATH));
  const usedExternalReferenceDocx = Boolean(REFERENCE_DOCX_PATH && fs.existsSync(REFERENCE_DOCX_PATH));
  const usedExternalPhoto = Boolean(PHOTO_PATH && fs.existsSync(PHOTO_PATH));
  const careerContext = usedExternalContext
    ? fs.readFileSync(CAREER_CONTEXT_PATH, "utf8")
    : buildEmbeddedCareerContext();
  const reference = usedExternalReferenceDocx
    ? await mammoth.extractRawText({ path: REFERENCE_DOCX_PATH })
    : { value: "" };
  const photoBytes = usedExternalPhoto ? fs.statSync(PHOTO_PATH).size : 0;
  return {
    mode: usedExternalContext ? "external" : "embedded",
    careerContext,
    referenceText: reference.value || "",
    photoBytes,
    careerContextPath: usedExternalContext ? CAREER_CONTEXT_PATH : "embedded:career-context",
    referenceDocxPath: usedExternalReferenceDocx ? REFERENCE_DOCX_PATH : "",
    photoPath: usedExternalPhoto ? PHOTO_PATH : "",
    usedExternalContext,
    usedExternalReferenceDocx,
    usedExternalPhoto
  };
}

function buildEmbeddedCareerContext() {
  return `
# Career Context: ${SAMPLE_OWNER.displayName}

## Basic Positioning

- Name: ${SAMPLE_OWNER.displayName}
- Target direction: AI product manager, AI 产品经理, agent workflow product manager, Agent 工作流产品, local-first automation tools.
- Location preference: remote, Shenzhen, Shanghai, Hangzhou, Guangzhou.
- Contact: use environment variables when running with a private sample. Public smoke tests intentionally omit phone and email.
- Portfolio: ${SAMPLE_OWNER.website}
- GitHub: ${SAMPLE_OWNER.github}

## Education

### Sample University, Human-Computer Interaction Graduate Program

The candidate is trained in user research, 用户研究, AI 产品 discovery, Agent 工作流 design, prototype evaluation, and evidence-based product decisions. The graduate work emphasizes turning ambiguous user needs into structured requirements, validating assumptions through interviews, and translating workflow observations into measurable product improvements.

### Sample Institute, Design and Technology Bachelor Program

The candidate built a foundation in scenario analysis, systems thinking, visual communication, and structured project presentation. This background helps the candidate explain complex technical products in language that both users and engineers can act on.

## Work Experience

### AI Teaching Assistant Agent, Product Intern

- 岗位负责 AI Agent 产品从需求发现、用户研究、流程设计到 Demo 验证的闭环推进。
- Interviewed more than 12 educators and operators to map lesson-planning bottlenecks, quality review pain points, and workflow handoff risks.
- Converted interview notes into product requirements, acceptance criteria, and an evaluation rubric covering completeness, factual grounding, structure, and teaching usability.
- Designed a Generator / Evaluator Agent 工作流 with an explicit revision limit, audit states, and progress logs to prevent uncontrolled loops.
- Worked with engineering partners to reason about RAG retrieval, query rewriting, reranking, citation snippets, and human review boundaries.
- Prepared demo scripts and release notes that connected model capabilities to user-facing product value.

## Projects

### CareerFlow Local

- Built a local-first AI 产品 job application assistant using a Chrome MV3 extension, a Node.js backend, SQLite persistence, and rule-based agent services.
- Implemented visible-page job capture, JD completion, local sync, application state tracking, browser task logging, and resumable processing for job pages that lazy-load detail content.
- Added ScreeningAgent, ResumeAgent, ResumeFitEvaluator, ClaimVerifier, ResumeRevisionAgent, AuditAgent, and a LangGraph resume workflow that can score a selected JD, generate a tailored resume draft, evaluate fit, revise evidence-sensitive claims, render DOCX, and record workflow events.
- Designed risk-gate filtering so the user can exclude directions such as sales, livestreaming, or other unwanted work before spending agent budget on match scoring.
- Kept platform actions behind explicit local tasks and dry-run gates, so the system can prepare greetings, refresh read-only conversation state, and assess submission readiness without silently sending messages or submitting applications.

### AI Writing Quality Control Tool

- Prototyped a writing workflow with retrieval, generation, review, and revision stages.
- Stored review artifacts as structured JSON so errors and suggested revisions can be inspected instead of hidden inside a single model response.
- Used staged evaluation to separate style imitation, factual consistency, and final readability.

### Knowledge Workflow Prototype

- Explored personal knowledge management flows that connect notes, project evidence, JD requirements, and resume claims.
- Tested how structured career context can reduce repeated interviews and keep generated resume content grounded in reusable evidence.

## Skills

- Product: user interview, 用户研究, scenario decomposition, PRD writing, workflow design, metrics definition, demo planning.
- AI product: AI 产品, RAG concepts, Agent 工作流, LLM-as-judge evaluation, prompt design, safety review, human-in-the-loop gates.
- Engineering collaboration: Node.js, SQLite, Chrome extension concepts, API contracts, structured logs, local smoke tests.
- Communication: turning ambiguous needs into clear product decisions, writing acceptance criteria, explaining technical tradeoffs to non-engineers.

## Resume Constraints

- Do not invent companies, degrees, awards, dates, or metrics that are not present in the career context.
- Small wording changes are allowed when they improve JD fit, but factual claims must remain traceable to the provided evidence.
- Prioritize education, work experience, project experience, and JD-relevant project links. Avoid unnecessary skill keyword blocks when building a two-page resume.
- For public smoke tests, treat this as anonymous sample data only. Private resume data must be injected through environment variables and ignored by git.
`.trim();
}

function seedProfileFromCareerContext(store, sample) {
  store.createResumeSource({
    sourceType: "markdown",
    fileName: path.basename(sample.careerContextPath),
    filePath: sample.careerContextPath,
    rawText: sample.careerContext,
    parsed: {
      importedBy: "m10-langgraph-resume-flow-smoke"
    },
    metadata: {
      sample: true,
      sampleMode: sample.mode,
      graphVersion: GRAPH_VERSION
    }
  });
  store.updateProfile({
    displayName: SAMPLE_OWNER.displayName,
    headline: SAMPLE_OWNER.headline,
    location: SAMPLE_OWNER.location,
    target: {
      roles: ["AI Product Manager", "Agent Product Manager", "AIGC Product Manager"],
      cities: ["Remote", "Shenzhen", "Shanghai", "Hangzhou", "Guangzhou"],
      contact: {
        phone: SAMPLE_OWNER.phone,
        email: SAMPLE_OWNER.email,
        website: SAMPLE_OWNER.website,
        github: SAMPLE_OWNER.github
      }
    },
    summary: "AI product candidate focused on user research, agent workflow design, local-first automation, and evidence-grounded resume generation."
  });
  [
    ["AI 产品", "product"],
    ["用户研究", "product"],
    ["Agent 工作流", "ai-product"],
    ["User Research", "product"],
    ["PRD", "product"],
    ["Agent Workflow", "ai-product"],
    ["RAG", "ai"],
    ["LangGraph", "ai"],
    ["Python", "engineering"],
    ["Web Frontend", "engineering"],
    ["Node.js", "engineering"],
    ["SQLite", "database"],
    ["Chrome MV3", "browser"]
  ].forEach(([name, category]) => {
    store.createSkill({
      name,
      category,
      proficiency: ["Node.js", "SQLite", "Chrome MV3"].includes(name) ? "familiar" : "proficient",
      evidence: [`Confirmed by ${path.basename(sample.careerContextPath)}.`]
    });
  });
  store.createExperience({
    kind: "education",
    title: "Human-Computer Interaction Graduate Program",
    organization: "Sample University",
    role: "Graduate Student",
    startDate: "2024.09",
    endDate: "2027.06",
    facts: ["Trained in user research, 用户研究, AI 产品 discovery, Agent 工作流 analysis, product discovery, and evidence-based product decisions."],
    skills: ["User Research", "用户研究", "AI 产品", "Agent 工作流", "Workflow Analysis", "Product Discovery"],
    evidenceText: "Embedded career context education section.",
    evidenceSource: sample.careerContextPath,
    confidence: "user_confirmed"
  });
  store.createExperience({
    kind: "education",
    title: "Design and Technology Bachelor Program",
    organization: "Sample Institute",
    role: "Bachelor Student",
    startDate: "2019.09",
    endDate: "2024.06",
    facts: ["Built a foundation in scenario analysis, systems thinking, visual communication, and structured project presentation."],
    skills: ["Systems Thinking", "Scenario Analysis", "Communication"],
    evidenceText: "Embedded career context education section.",
    evidenceSource: sample.careerContextPath,
    confidence: "user_confirmed"
  });
  store.createExperience({
    kind: "work",
    title: "AI Teaching Assistant Agent",
    organization: "Sample EdTech Team",
    role: "AI Product Intern",
    startDate: "2026.03",
    endDate: "2026.06",
    facts: [
      "岗位负责 AI Agent 产品从需求发现、用户研究、流程设计到 Demo 验证的闭环推进。",
      "Interviewed more than 12 educators and operators to map lesson-planning bottlenecks and quality review needs.",
      "Converted qualitative findings into product requirements, acceptance criteria, and evaluation rubrics.",
      "Designed a Generator / Evaluator Agent 工作流 with revision limits, audit states, and progress logs.",
      "Collaborated with engineering partners on RAG retrieval, query rewriting, reranking, and citation snippets."
    ],
    skills: ["用户研究", "User Research", "AI 产品", "Agent 工作流", "Agent Workflow", "RAG", "LLM-as-Judge", "Metrics"],
    evidenceText: "Embedded career context work experience section.",
    evidenceSource: sample.careerContextPath,
    confidence: "user_confirmed"
  });
  store.createExperience({
    kind: "project",
    title: "CareerFlow Local",
    organization: "Personal Project",
    role: "Product and Engineering Owner",
    facts: [
      "Built a local-first AI 产品 job application assistant with Chrome MV3, Node.js, SQLite, and rule-based agent services.",
      "Implemented visible-page job capture, JD completion, local sync, application state tracking, and browser task logs.",
      "Added ScreeningAgent, ResumeAgent, ResumeFitEvaluator, ClaimVerifier, ResumeRevisionAgent, AuditAgent, and a LangGraph resume workflow.",
      "Designed risk-gate filtering for unwanted job directions before deeper matching and resume generation."
    ],
    skills: ["Node.js", "SQLite", "Chrome MV3", "AI 产品", "Agent 工作流", "Agent Workflow", "LangGraph"],
    evidenceText: "Embedded career context CareerFlow Local project section.",
    evidenceSource: sample.careerContextPath,
    confidence: "user_confirmed"
  });
  store.createExperience({
    kind: "project",
    title: "AI Writing Quality Control Tool",
    organization: "Personal Project",
    role: "Product and Engineering Owner",
    facts: [
      "Prototyped a writing workflow with retrieval, generation, review, and revision stages.",
      "Stored review artifacts as structured JSON so errors and suggested revisions can be inspected.",
      "Separated style imitation, factual consistency, and final readability checks into staged evaluation."
    ],
    skills: ["RAG", "LangChain", "FAISS", "AI Writing", "Quality Evaluation"],
    evidenceText: "Embedded career context writing quality project section.",
    evidenceSource: sample.careerContextPath,
    confidence: "user_confirmed"
  });
  store.createConstraint({
    ruleType: "forbidden_claim",
    content: "Do not invent internships, projects, companies, awards, technology stacks, or metrics; unverified numbers must be expressed conservatively.",
    severity: "blocker"
  });
  store.createConstraint({
    ruleType: "preference",
    content: "Prefer AI product, agent product, AIGC product, education technology, local-first automation, and job-search tooling roles.",
    severity: "info"
  });
}

function createSampleJobPayload(sample) {
  return {
    source: "m10-langgraph-resume-flow-smoke",
    exportedAt: new Date().toISOString(),
    pages: {
      sampleCareerContextPath: sample.careerContextPath,
      referenceDocxPath: sample.referenceDocxPath
    },
    jobs: [{
      jobId: "m10-langgraph-ai-product-manager",
      title: "AI Agent 产品经理实习生",
      company: "Local Sample AI",
      salary: "150-250/天",
      location: "深圳",
      experience: "在校/应届",
      education: "本科及以上",
      tags: ["AI 产品", "Agent 工作流", "用户研究", "PRD", "RAG", "LangGraph"],
      welfare: ["成长空间", "导师制"],
      detailUrl: "https://www.zhipin.com/job_detail/m10-langgraph-ai-product-manager.html",
      description: [
        "岗位负责 AI Agent 产品从需求发现、用户研究、流程设计到 Demo 验证的闭环推进。",
        "需要能够理解 RAG、LangGraph、多 Agent 工作流、LLM-as-Judge 等能力边界，并将其转化为可落地的产品方案。",
        "候选人需要能独立完成竞品分析、PRD、用户访谈、指标体系设计，并和工程同学协作推进 Node.js 或 Python 原型。",
        "有教育科技、个人成长、求职工具、知识管理或 AIGC 产品经验者优先。",
        "请重点展示真实用户研究、Agent 工作流设计、RAG 检索策略、可演示 Demo 和本地数据闭环经验。",
        `候选人上下文摘要长度 ${sample.careerContext.length} 字。`
      ].join("\n")
    }]
  };
}
