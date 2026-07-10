const path = require("path");
const { runResumeWorkflowGraph } = require("../resume-workflow-graph");
const { replayResumeWorkflowRun } = require("../resume-workflow-replay");

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
    },

    getWorkflowRun(workflowRunId) {
      return store.getWorkflowRun(workflowRunId);
    },

    getWorkflowRuns(options = {}) {
      return store.getWorkflowRuns(options);
    },

    replayWorkflowRun(workflowRunId, payload = {}) {
      return replayResumeWorkflowRun({
        store,
        workflowRunId,
        mode: payload.mode || "",
        modelConfig: payload.modelConfig,
        maxRevisions: payload.maxRevisions
      });
    }
  };
}

module.exports = {
  createResumeWorkflowService
};
