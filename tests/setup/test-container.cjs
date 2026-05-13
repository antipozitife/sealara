const { createTestContainer } = require("../../server/container.cjs");

function buildTestContainerForMl(baseUrl, overrides = {}) {
  return createTestContainer({
    values: {
      logger: {
        warn: () => {},
        info: () => {},
        error: () => {},
      },
      stableStringify: JSON.stringify,
      getRequestId: () => "",
      mlServiceUrl: baseUrl,
      mlApiKey: "test-key",
      mlRetries: 0,
      mlTimeoutMs: 1_500,
      mlCircuitErrorThreshold: 50,
      mlCircuitResetMs: 1_000,
      mlCircuitVolumeThreshold: 1,
      ...overrides,
    },
  });
}

function mockCreateAppContainerWithSqlPool(mockPool) {
  jest.mock("../../server/container.cjs", () => {
    const actual = jest.requireActual("../../server/container.cjs");
    return {
      ...actual,
      __mockPool: mockPool,
      createAppContainer: jest.fn((values = {}) =>
        actual.createTestContainer({
          values,
          overrides: {
            sqlPool: mockPool,
          },
        })
      ),
    };
  });
}

function createMockSqlPool(overrides = {}) {
  return {
    query: jest.fn(),
    getConnection: jest.fn(),
    end: jest.fn(),
    ...overrides,
  };
}

function resetMockSqlPool(mockPool) {
  if (!mockPool || typeof mockPool !== "object") return;
  if (typeof mockPool.query?.mockReset === "function") mockPool.query.mockReset();
  if (typeof mockPool.getConnection?.mockReset === "function") mockPool.getConnection.mockReset();
  if (typeof mockPool.end?.mockReset === "function") mockPool.end.mockReset();
}

module.exports = {
  buildTestContainerForMl,
  mockCreateAppContainerWithSqlPool,
  createMockSqlPool,
  resetMockSqlPool,
};
