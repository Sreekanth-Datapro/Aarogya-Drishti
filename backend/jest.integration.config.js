module.exports = {
  testEnvironment: "node",
  // DB-backed API + SQL suites only. Pure mock unit suites stay on jest.config.js
  // (moduleNameMapper → unitConfig / forbiddenDb) so MFA/AI mocks are not diluted.
  testMatch: [
    "<rootDir>/tests/api/**/*.test.js",
    "<rootDir>/tests/db/**/*.test.js",
  ],
  testPathIgnorePatterns: [
    "<rootDir>/tests/api/lgdClient.test.js",
    "<rootDir>/tests/api/syntheticAiScreeningWorkflow.test.js",
  ],
  setupFiles: ["<rootDir>/tests/setupEnv.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/setupAfterEnv.js"],
  globalSetup: "<rootDir>/tests/globalSetup.js",
  maxWorkers: 1,
  testTimeout: 30000,
  // Shared pg Pool is intentionally left open across files; force exit after suites.
  forceExit: true,
};
