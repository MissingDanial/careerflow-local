"use strict";

const TEST_TIERS = Object.freeze({
  baseline: Object.freeze([
    "m13:repository-baseline:smoke"
  ]),
  profile: Object.freeze([
    "m5:profile:smoke",
    "m5:resume:smoke",
    "m5:drafts:smoke",
    "m10:career-skill:smoke",
    "m10:profile-agent:smoke",
    "m10:profile-facts:smoke",
    "m15:profile-conversation:smoke"
  ]),
  agents: Object.freeze([
    "m6:screening:smoke",
    "m6:screening-batch:smoke",
    "m6:risk-gate:smoke",
    "m7:resume-audit:smoke",
    "m10:resume-fit:smoke",
    "m10:claim-verifier:smoke",
    "m10:resume-revision:smoke",
    "m13:agent-evaluation:smoke",
    "m16:real-model-agents:smoke",
    "m16:agent-quality-evaluation:smoke",
    "m16:shadow-review:smoke"
  ]),
  extension: Object.freeze([
    "m3:popup:smoke",
    "m3:events:smoke",
    "m4:extension-task:smoke",
    "m6:options-screening:smoke",
    "m7:options-resume:smoke",
    "m7:options-detail:smoke",
    "m8:extension-send-greeting:smoke",
    "m14:extension-real-greeting:smoke",
    "m14:options-workspace-ui:smoke",
    "m15:options-profile-conversation:smoke",
    "m16:options-agent-quality:smoke",
    "m16:options-shadow-review:smoke",
    "m17:popup-runtime:smoke",
    "m17:options-queues-runtime:smoke",
    "m10:options-profile-agent:smoke",
    "m10:options-profile-facts:smoke",
    "m10:options-profile-facts-ui:smoke",
    "m10:options-observability:smoke",
    "m10:options-resume-fit:smoke",
    "m10:options-claim-verifier:smoke",
    "m10:options-resume-revision:smoke",
    "m10:options-resume-workflow:smoke"
  ]),
  workflow: Object.freeze([
    "m2:sqlite:smoke",
    "m3:quality:smoke",
    "m3:missing:smoke",
    "m3:autocrawl:smoke",
    "m3:keys:smoke",
    "m4:applications:smoke",
    "m4:browser-tasks:smoke",
    "m4:queue-hygiene:smoke",
    "m7:resume-approval:smoke",
    "m8:greeting-dry-run:smoke",
    "m8:read-only-conversation:smoke",
    "m9:upload-resume-dry-run:smoke",
    "m9:submit-application-dry-run:smoke",
    "m9:submission-readiness:smoke",
    "m9:submission-readiness-queue:smoke",
    "m9:submission-readiness-review:smoke",
    "m10:workflow-orchestrator:smoke",
    "m10:backend-structure:smoke",
    "m10:observability:smoke",
    "m10:langgraph-resume:smoke",
    "m11:resume-template:smoke",
    "m11:render-qa:smoke",
    "m11:execution-package:smoke",
    "m12:submission-evidence:smoke",
    "m13:sqlite-migrations:smoke",
    "m13:workflow-inputs:smoke",
    "m13:application-transitions:smoke",
    "m14:real-action:smoke",
    "m17:application-queues:smoke",
    "m17:model-config:smoke",
    "m17:native-host:smoke",
    "m18:agent-latency:smoke"
  ])
});

const TEST_TIER_NAMES = Object.freeze(Object.keys(TEST_TIERS));

function getTestScripts(tierName) {
  if (tierName === "ci") {
    return TEST_TIER_NAMES.flatMap((name) => TEST_TIERS[name]);
  }
  return TEST_TIERS[tierName] || null;
}

module.exports = {
  TEST_TIERS,
  TEST_TIER_NAMES,
  getTestScripts
};
