const request = require("supertest");
const {
  mockCreateAppContainerWithSqlPool,
  createMockSqlPool,
  resetMockSqlPool,
} = require("../tests/setup/test-container.cjs");

const mockPool = createMockSqlPool({
  query: jest.fn().mockResolvedValue([[{ ok: 1 }]]),
});
mockCreateAppContainerWithSqlPool(mockPool);

afterEach(() => {
  resetMockSqlPool(mockPool);
});

const { app, normalizeDiseaseText, stableStringify, makePredictionCacheKey } = require("./index.cjs");

describe("API health", () => {
  it("returns structured health (200 when deps up, 503 when degraded)", async () => {
    const res = await request(app).get("/api/health");
    expect([200, 503]).toContain(res.statusCode);
    expect(res.body).toHaveProperty("ok");
    if (res.statusCode === 200) {
      expect(res.body.ok).toBe(true);
    }
  });
});

describe("Disease text helpers (parity with ml_service normalization)", () => {
  it("normalizes text consistently", () => {
    expect(normalizeDiseaseText("  КАШЕЛЬ   сильный ")).toBe("кашель сильный");
  });

  it("builds stable prediction cache keys", () => {
    const a = makePredictionCacheKey(["кашель", "температура"], {}, {}, 1);
    const b = makePredictionCacheKey(["температура", "кашель"], {}, {}, 1);
    expect(a).toBe(b);
    expect(stableStringify({ z: 1, a: 2 })).toBe(stableStringify({ a: 2, z: 1 }));
  });
});
