/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/tests/setup/test-env.cjs"],
  testTimeout: 30_000,
  testMatch: ["<rootDir>/server/**/*.test.cjs", "<rootDir>/tests/integration/**/*.test.cjs"],
};
