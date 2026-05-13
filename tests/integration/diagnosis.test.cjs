const nock = require("nock");
const { app, ensureSqlSchema } = require("../../server/index.cjs");
const { withCsrfAgent } = require("../setup/http-helpers.cjs");
const { mockMlHappyPath } = require("../setup/mock-ml.cjs");
const { deleteUserByEmail } = require("../setup/test-db.cjs");

const ML = process.env.ML_SERVICE_URL || "http://127.0.0.1:19999";
const describeDb =
  process.env.SEALARA_DB_INTEGRATION === "1" ? describe : describe.skip;

describeDb("Diagnosis predict (mocked ML)", () => {
  const email = "integration-diagnosis@sealara.test";
  const password = "password123";

  beforeAll(async () => {
    mockMlHappyPath(ML);
    await ensureSqlSchema();
    await deleteUserByEmail(email);
    const reg = await withCsrfAgent(app);
    const regRes = await reg.agent
      .post("/api/auth/register")
      .set("Origin", reg.origin)
      .set("x-csrf-token", reg.csrf)
      .send({
        surname: "Dx",
        name: "User",
        birthDate: "1991-02-02",
        gender: "female",
        phone: "+79992222222",
        email,
        password,
      });
    expect(regRes.status).toBe(201);
  });

  afterAll(() => {
    nock.cleanAll();
  });

  it("returns predictions from mocked ML", async () => {
    const { agent, csrf, origin } = await withCsrfAgent(app);
    const loginRes = await agent
      .post("/api/auth/login")
      .set("Origin", origin)
      .set("x-csrf-token", csrf)
      .send({ email, password });
    expect(loginRes.status).toBe(200);
    const cookies = loginRes.headers["set-cookie"];

    const predCtx = await withCsrfAgent(app);
    const res = await predCtx.agent
      .post("/api/diagnosis/predict")
      .set("Origin", predCtx.origin)
      .set("x-csrf-token", predCtx.csrf)
      .set("Cookie", cookies)
      .send({ symptoms: ["кашель"], answers: {}, round: 1 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.predictions)).toBe(true);
    expect(res.body.predictions.length).toBeGreaterThan(0);
  });
});
