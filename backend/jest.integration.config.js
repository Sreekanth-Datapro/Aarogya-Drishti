module.exports = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  setupFiles: ["<rootDir>/tests/setupEnv.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/setupAfterEnv.js"],
  globalSetup: "<rootDir>/tests/globalSetup.js",
  maxWorkers: 1,
  testTimeout: 30000,
};
