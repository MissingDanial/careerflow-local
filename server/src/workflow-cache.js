"use strict";

const crypto = require("crypto");

const WORKFLOW_INPUT_CACHE_VERSION = "m18.workflow-input-cache.v1";
const SCREENING_CACHE_VERSION = "m18.screening-cache.v1";
const VOLATILE_KEYS = new Set([
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "capturedAt",
  "captured_at",
  "firstSeenAt",
  "first_seen_at",
  "lastSeenAt",
  "last_seen_at"
]);

function buildWorkflowInputHash(input = {}) {
  return stableJsonHash({
    cacheVersion: WORKFLOW_INPUT_CACHE_VERSION,
    application: semanticApplication(input.application),
    profile: stripVolatileValues(input.profile),
    job: semanticJob(input.job),
    userRules: stripVolatileValues(input.userRules || {}),
    executionOptions: stripVolatileValues(input.executionOptions || {}),
    renderOptions: stripVolatileValues(input.renderOptions || {}),
    graphVersion: cleanText(input.graphVersion),
    promptVersion: cleanText(input.promptVersion),
    agentVersion: cleanText(input.agentVersion),
    modelConfig: sanitizeModelConfig(input.modelConfig || {})
  });
}

function buildScreeningCacheKey(input = {}) {
  return stableJsonHash({
    cacheVersion: SCREENING_CACHE_VERSION,
    application: semanticApplication(input.application),
    profile: stripVolatileValues(input.profile),
    job: semanticJob(input.job),
    userRules: stripVolatileValues(input.userRules || {}),
    mode: cleanText(input.mode).toLowerCase(),
    model: sanitizeModelConfig(input.modelIdentity || {}),
    promptVersion: cleanText(input.promptVersion),
    agentVersion: cleanText(input.agentVersion)
  });
}

function semanticApplication(application = {}) {
  return {
    id: Number(application.id || 0),
    jobId: Number(application.jobId || application.job_id || 0),
    sourceKey: cleanText(application.sourceKey || application.source_key),
    bossJobId: cleanText(application.bossJobId || application.boss_job_id),
    trusted: Boolean(application.trusted)
  };
}

function semanticJob(job = {}) {
  return {
    id: Number(job.id || 0),
    sourceKey: cleanText(job.sourceKey || job.source_key),
    jobId: cleanText(job.jobId || job.job_id),
    title: cleanText(job.title),
    company: cleanText(job.company || job.companyName || job.company_name),
    salary: cleanText(job.salary),
    location: cleanText(job.location),
    experience: cleanText(job.experience),
    education: cleanText(job.education),
    recruiter: cleanText(job.recruiter),
    tags: normalizeStringArray(job.tags),
    welfare: normalizeStringArray(job.welfare),
    description: cleanMultiline(job.description),
    detailUrl: cleanText(job.detailUrl || job.detail_url)
  };
}

function stripVolatileValues(value) {
  if (Array.isArray(value)) {
    return value.map(stripVolatileValues);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (!VOLATILE_KEYS.has(key)) {
      output[key] = stripVolatileValues(item);
    }
  }
  return output;
}

function sanitizeModelConfig(value) {
  const blocked = /(?:api[_-]?key|authorization|bearer|password|secret|token)/i;
  if (Array.isArray(value)) {
    return value.map(sanitizeModelConfig);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (!blocked.test(key)) {
      output[key] = sanitizeModelConfig(item);
    }
  }
  return output;
}

function stableJsonHash(value) {
  return crypto.createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function normalizeStringArray(value) {
  return Array.from(new Set((Array.isArray(value) ? value : []).map(cleanText).filter(Boolean)));
}

function cleanMultiline(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

module.exports = {
  SCREENING_CACHE_VERSION,
  WORKFLOW_INPUT_CACHE_VERSION,
  buildScreeningCacheKey,
  buildWorkflowInputHash,
  sanitizeModelConfig,
  stableJsonHash
};
