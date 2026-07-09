const path = require("path");
const { runResumeWorkflowGraph } = require("../resume-workflow-graph");

function createResumeWorkflowService({ store, dataDir }) {
  if (!store) {
    throw new Error("ResumeWorkflowService requires a store");
  }

  return {
    runGraph(applicationId, payload = {}) {
      return runResumeWorkflowGraph({
        store,
        applicationId,
        mode: payload.mode || "rules",
        modelConfig: payload.modelConfig || {},
        userRules: payload.userRules || {},
        maxRevisions: payload.maxRevisions ?? 1,
        renderDocx: payload.renderDocx !== false,
        renderOptions: {
          outputDir: path.join(dataDir, "generated_resumes"),
          ...(payload.renderOptions && typeof payload.renderOptions === "object" ? payload.renderOptions : {})
        }
      });
    }
  };
}

module.exports = {
  createResumeWorkflowService
};
