module.exports = {
  testEnvironment: "node",
  testMatch: [
    "<rootDir>/tests/api/lgdClient.test.js",
    "<rootDir>/tests/api/syntheticAiScreeningWorkflow.test.js",
    "<rootDir>/tests/unit/*.test.js",
  ],
  moduleNameMapper: {
    "^(?:\\.\\.\\/)+config/config$": "<rootDir>/tests/helpers/unitConfig.js",
    "^(?:\\.\\.\\/)+(?:db|database)(?:\\.js)?$": "<rootDir>/tests/helpers/forbiddenDb.js",
    "^(?:\\.\\.\\/)+(?:app|server)(?:\\.js)?$": "<rootDir>/tests/helpers/forbiddenDb.js",
    "^pg$": "<rootDir>/tests/helpers/forbiddenDb.js",
  },
};
