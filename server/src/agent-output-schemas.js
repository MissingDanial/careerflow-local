"use strict";

const { z } = require("zod");

const boundedText = (maximum = 4000) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum = 4000) => z.string().trim().max(maximum).default("");
const positiveIntegerId = z.preprocess(
  (value) => typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value,
  z.number().int().positive()
);
const textList = (maximumItems = 30, maximumLength = 1500) => z.array(
  boundedText(maximumLength)
).max(maximumItems);

const ScreeningOutputSchema = z.object({
  matchScore: z.number().min(0).max(100),
  riskScore: z.number().min(0).max(100),
  recommendation: z.enum(["auto_prepare", "review_needed", "skip"]),
  hardConditions: z.array(z.object({
    name: boundedText(160),
    passed: z.boolean(),
    reason: boundedText(800)
  }).strict()).max(20),
  matchedPoints: textList(20, 800),
  riskPoints: textList(20, 800),
  resumeStrategy: textList(20, 800),
  requiresUserConfirmation: z.boolean(),
  confidence: z.enum(["low", "medium", "high"])
}).strict();

const ResumeProjectPlanSchema = z.object({
  sourceExperienceId: positiveIntegerId,
  skills: textList(12, 120),
  bullets: z.array(z.object({
    text: boundedText(500),
    sourceFact: boundedText(1200)
  }).strict()).min(1).max(5)
}).strict();

const ResumePlanOutputSchema = z.object({
  headline: optionalText(180),
  summary: optionalText(1200),
  selectedSkillIds: z.array(positiveIntegerId).max(18),
  projects: z.array(ResumeProjectPlanSchema).max(4),
  diffSummary: textList(12, 500),
  compressionNotes: textList(12, 500)
}).strict();

const FitReviewOutputSchema = z.object({
  items: z.array(z.object({
    requirementIndex: z.number().int().min(0),
    status: z.enum(["covered", "weak", "missing"]),
    evidenceField: optionalText(240),
    evidenceText: optionalText(1200),
    reason: boundedText(800)
  }).strict()).max(30),
  recommendations: textList(15, 800),
  confidence: z.enum(["low", "medium", "high"])
}).strict();

const AuditReviewOutputSchema = z.object({
  jobFitReview: z.enum(["good", "mixed", "weak"]),
  recommendation: z.enum(["approve", "revise", "block"]),
  requiresUserConfirmation: z.boolean(),
  confidence: z.enum(["low", "medium", "high"]),
  qualityIssues: textList(20, 800),
  recommendations: textList(15, 800)
}).strict();

const ProfileConversationOutputSchema = z.object({
  assistantReply: boundedText(12000),
  factDrafts: z.array(z.object({
    draftType: z.enum(["profile", "experience", "skill", "constraint"]),
    operation: z.enum(["CREATE", "UPDATE"]),
    targetEntityType: z.enum(["profile", "experience", "skill", "constraint"]).optional(),
    targetEntityId: z.number().int().positive().optional(),
    title: boundedText(180),
    confidence: z.enum(["confirmed", "user_confirmed", "inferred", "needs_review"]),
    evidenceText: boundedText(8000),
    content: z.record(z.string(), z.unknown()),
    reason: optionalText(500)
  }).strict()).max(12),
  followupQuestions: z.array(z.object({
    id: boundedText(80),
    prompt: boundedText(800),
    reason: optionalText(400),
    priority: z.enum(["high", "medium", "low"])
  }).strict()).max(3),
  conflicts: z.array(z.object({
    type: z.enum(["contradiction", "ambiguous_boundary", "missing_evidence"]),
    summary: optionalText(800),
    existingEntityType: z.enum(["profile", "experience", "skill", "constraint"]).optional(),
    existingEntityId: z.number().int().positive().nullable().optional(),
    proposedValue: optionalText(1000),
    resolutionQuestion: optionalText(800)
  }).strict()).max(12),
  sessionSummaryPatch: z.record(z.string(), z.array(boundedText(1500)).max(40))
}).strict();

module.exports = {
  AuditReviewOutputSchema,
  FitReviewOutputSchema,
  ProfileConversationOutputSchema,
  ResumePlanOutputSchema,
  ScreeningOutputSchema
};
