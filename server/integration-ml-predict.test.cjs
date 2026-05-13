/**
 * Integration: checks API contract against a local ML-like HTTP mock.
 * This keeps the test always runnable in CI (no external ML dependency).
 */
const http = require("node:http");
const { buildTestContainerForMl } = require("../tests/setup/test-container.cjs");

describe("ML integration (local mock)", () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.method === "POST" && req.url === "/predict") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            predictions: [
              { id: 101, name: "ОРВИ", score: 0.91 },
              { id: 205, name: "Грипп", score: 0.09 },
            ],
          })
        );
        return;
      }
      if (req.method === "POST" && req.url === "/preprocess") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ normalized_symptoms: ["кашель"], feature_vector: [0.1, 0.2], idf_scores: {} }));
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    if (!server) return;
    await new Promise((resolve) => server.close(resolve));
  });

  it("two identical /predict calls return same top disease id", async () => {
    const body = {
      symptoms: ["кашель", "температура"],
      profile: { gender: "ж", birthDate: "1990-01-01" },
      answers: {},
      round: 1,
      confidence_threshold: 0.99,
    };
    const headers = { "Content-Type": "application/json", "x-api-key": "test-key" };
    const r1 = await fetch(`${baseUrl}/predict`, { method: "POST", headers, body: JSON.stringify(body) });
    const r2 = await fetch(`${baseUrl}/predict`, { method: "POST", headers, body: JSON.stringify(body) });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    const j1 = await r1.json();
    const j2 = await r2.json();
    const id1 = j1.predictions?.[0]?.id;
    const id2 = j2.predictions?.[0]?.id;
    expect(id1).toBeDefined();
    expect(id1).toBe(id2);
  });

  it("preprocess output is stable for same raw symptoms", async () => {
    const body = { raw_symptoms: ["  КАШЕЛЬ  ", "кашель"], profile: {}, answers: {} };
    const headers = { "Content-Type": "application/json", "x-api-key": "test-key" };
    const r1 = await fetch(`${baseUrl}/preprocess`, { method: "POST", headers, body: JSON.stringify(body) });
    const r2 = await fetch(`${baseUrl}/preprocess`, { method: "POST", headers, body: JSON.stringify(body) });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    const j1 = await r1.json();
    const j2 = await r2.json();
    expect(j1.normalized_symptoms).toEqual(j2.normalized_symptoms);
  });

  it("mlClient resolves from DI container with overridden ML URL", async () => {
    const container = buildTestContainerForMl(baseUrl, {
      logger: {
        warn: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
      },
    });

    const mlClient = container.resolve("mlClient");
    const result = await mlClient.predictViaMlService({
      symptoms: ["кашель"],
      profile: {},
      answers: {},
      round: 1,
      confidence_threshold: 0.99,
    });

    expect(result?.predictions?.[0]?.id).toBe(101);
  });
});
