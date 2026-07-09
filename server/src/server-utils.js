function summarizeProfileForTrace(profile = {}) {
  return {
    experienceCount: Array.isArray(profile.experiences) ? profile.experiences.length : 0,
    skillCount: Array.isArray(profile.skills) ? profile.skills.length : 0,
    constraintCount: Array.isArray(profile.constraints) ? profile.constraints.length : 0,
    target: profile.profile?.target || {}
  };
}

function structuredError(error) {
  return {
    code: error.code || "INTERNAL_ERROR",
    agent: error.agent || "",
    step: error.step || "",
    message: error.message || String(error),
    retryable: Boolean(error.retryable),
    severity: error.severity || "error",
    context: error.context || {}
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  summarizeProfileForTrace,
  structuredError,
  httpError
};
