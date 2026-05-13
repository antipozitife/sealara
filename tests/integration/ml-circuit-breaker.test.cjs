const nock = require("nock");
const { app, ensureSqlSchema, resetMlBreakerForTests } = require("../../server/index.cjs");
const { withCsrfAgent } = require("../setup/http-helpers.cjs");
const { deleteUserByEmail } = require("../setup/test-db.cjs");

const ML = (process.env.ML_SERVICE_URL || "http://127.0.0.1:19999").replace(/\/+$/, "");
const describeDb =
  process.env.SEALARA_DB_INTEGRATION === "1" ? describe : describe.skip;

describeDb("ML circuit breaker (shared opossum)", () => {
  const email = "integration-cb@sealara.test";
  const password = "password123";

  beforeAll(async () => {
    await ensureSqlSchema();
    await deleteUserByEmail(email);
    const reg = await withCsrfAgent(app);
    const regRes = await reg.agent
      .post("/api/auth/register")
      .set("Origin", reg.origin)
      .set("x-csrf-token", reg.csrf)
      .send({
        surname: "Cb",
        name: "User",
        birthDate: "1992-04-04",
        gender: "female",
        phone: "+79994444444",
        email,
        password,
      });
    expect(regRes.status).toBe(201);
  });

  beforeEach(() => {
    nock.cleanAll();
    resetMlBreakerForTests();
  });

  afterAll(() => {
    nock.cleanAll();
    resetMlBreakerForTests();
  });

  it("eventually returns 503 when ML stays unhealthy (circuit + preprocess blocked)", async () => {
    nock(ML).persist().post("/preprocess").reply(500, { error: "ml down" });
    nock(ML).persist().post("/predict").reply(500, { error: "ml down" });

    const loginCtx = await withCsrfAgent(app);
    const loginRes = await loginCtx.agent
      .post("/api/auth/login")
      .set("Origin", loginCtx.origin)
      .set("x-csrf-token", loginCtx.csrf)
      .send({ email, password });
    expect(loginRes.status).toBe(200);
    const cookies = loginRes.headers["set-cookie"];

    let saw503 = false;
    for (let i = 0; i < 20; i += 1) {
      const ctx = await withCsrfAgent(app);
      const res = await ctx.agent
        .post("/api/diagnosis/predict")
        .set("Origin", ctx.origin)
        .set("x-csrf-token", ctx.csrf)
        .set("Cookie", cookies)
        .send({ symptoms: ["кашель"], answers: {}, round: 1 });
      if (res.status === 503) {
        saw503 = true;
        break;
      }
    }
    expect(saw503).toBe(true);
  });
});
