const nock = require("nock");
const { app, ensureSqlSchema } = require("../../server/index.cjs");
const { withCsrfAgent } = require("../setup/http-helpers.cjs");
const { mockMlHappyPath } = require("../setup/mock-ml.cjs");
const { deleteUserByEmail } = require("../setup/test-db.cjs");

const ML = process.env.ML_SERVICE_URL || "http://127.0.0.1:19999";
const describeDb =
  process.env.SEALARA_DB_INTEGRATION === "1" ? describe : describe.skip;

describeDb("Auth (JWT cookies + refresh)", () => {
  const patientEmail = "integration-patient@sealara.test";
  const password = "password123";

  beforeAll(async () => {
    mockMlHappyPath(ML);
    await ensureSqlSchema();
    await deleteUserByEmail(patientEmail);
  });

  afterAll(() => {
    nock.cleanAll();
  });

  it("registers and sets auth cookies", async () => {
    const { agent, csrf, origin } = await withCsrfAgent(app);
    const res = await agent
      .post("/api/auth/register")
      .set("Origin", origin)
      .set("x-csrf-token", csrf)
      .send({
        surname: "Test",
        name: "User",
        birthDate: "1990-01-01",
        gender: "male",
        phone: "+79991234567",
        email: patientEmail,
        password,
      });
    expect(res.status).toBe(201);
    expect(res.body.user?.email).toBe(patientEmail);
    const cookies = res.headers["set-cookie"];
    expect(Array.isArray(cookies)).toBe(true);
    expect(cookies.some((c) => String(c).includes("sealara_token"))).toBe(true);
    expect(cookies.some((c) => String(c).includes("sealara_refresh"))).toBe(true);
  });

  it("logs in", async () => {
    const { agent, csrf, origin } = await withCsrfAgent(app);
    const res = await agent
      .post("/api/auth/login")
      .set("Origin", origin)
      .set("x-csrf-token", csrf)
      .send({ email: patientEmail, password });
    expect(res.status).toBe(200);
    expect(res.body.user?.email).toBe(patientEmail);
  });

  it("refreshes session", async () => {
    const loginCtx = await withCsrfAgent(app);
    const loginRes = await loginCtx.agent
      .post("/api/auth/login")
      .set("Origin", loginCtx.origin)
      .set("x-csrf-token", loginCtx.csrf)
      .send({ email: patientEmail, password });
    expect(loginRes.status).toBe(200);

    const refreshCtx = await withCsrfAgent(app);
    const refreshCookie = (Array.isArray(loginRes.headers["set-cookie"]) ? loginRes.headers["set-cookie"] : []).find((c) =>
      String(c).includes("sealara_refresh")
    );
    expect(refreshCookie).toBeTruthy();
    const res = await refreshCtx.agent
      .post("/api/auth/refresh")
      .set("Origin", refreshCtx.origin)
      .set("x-csrf-token", refreshCtx.csrf)
      .set("Cookie", [refreshCookie]);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("logout then refresh is rejected", async () => {
    const loginCtx = await withCsrfAgent(app);
    const loginRes = await loginCtx.agent
      .post("/api/auth/login")
      .set("Origin", loginCtx.origin)
      .set("x-csrf-token", loginCtx.csrf)
      .send({ email: patientEmail, password });
    expect(loginRes.status).toBe(200);
    const cookies = loginRes.headers["set-cookie"];
    const refreshCookie = cookies.find((c) => String(c).includes("sealara_refresh"));

    const logoutCtx = await withCsrfAgent(app);
    const logoutRes = await logoutCtx.agent
      .post("/api/auth/logout")
      .set("Origin", logoutCtx.origin)
      .set("x-csrf-token", logoutCtx.csrf)
      .set("Cookie", cookies);
    expect(logoutRes.status).toBe(200);

    const refreshCtx = await withCsrfAgent(app);
    const refreshRes = await refreshCtx.agent
      .post("/api/auth/refresh")
      .set("Origin", refreshCtx.origin)
      .set("x-csrf-token", refreshCtx.csrf)
      .set("Cookie", [refreshCookie]);
    expect(refreshRes.status).toBe(401);
  });
});
