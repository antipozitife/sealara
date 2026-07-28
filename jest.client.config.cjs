/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/tests/client/polyfills.cjs"],
  setupFilesAfterEnv: ["<rootDir>/tests/client/setup.ts"],
  testMatch: ["<rootDir>/src/**/*.test.ts?(x)"],
  transform: {
    "^.+\\.[jt]sx?$": [
      "babel-jest",
      {
        presets: [
          ["@babel/preset-env", { targets: { node: "current" } }],
          ["@babel/preset-react", { runtime: "automatic" }],
          ["@babel/preset-typescript", { allExtensions: true, isTSX: true }],
        ],
      },
    ],
  },
  moduleNameMapper: {
    "\\.(css|less|scss)$": "<rootDir>/tests/client/style-mock.cjs",
    "\\.(png|jpe?g|gif|svg|webp)$": "<rootDir>/tests/client/file-mock.cjs",
  },
  clearMocks: true,
  restoreMocks: true,
};
