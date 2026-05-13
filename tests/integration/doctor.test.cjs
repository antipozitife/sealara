const nock = require("nock");
const { app, ensureSqlSchema } = require("../../server/index.cjs");
const { withCsrfAgent } = require("../setup/http-helpers.cjs");
const { mockMlHappyPath } = require("../setup/mock-ml.cjs");
const { deleteUserByEmail, ensureDisease, getTestPool } = require("../setup/test-db.cjs");

const ML = process.env.ML_SERVICE_URL || "http://127.0.0.1:19999";
const describeDb =
  process.env.SEALARA_DB_INTEGRATION === "1" ? describe : describe.skip;

describeDb("Doctor feedback confirm", () => {
  const patientEmail = "integration-doc-patient@sealara.test";
  const doctorEmail = "integration-doc@sealara.test";
  const password = "password123";
  const diseaseId = 880010;

  beforeAll(async () => {
    mockMlHappyPath(ML);
    await ensureSqlSchema();
    await ensureDisease(diseaseId, "Integration confirm target");
    await deleteUserByEmail(patientEmail);
    await deleteUserByEmail(doctorEmail);

    for (const em of [patientEmail, doctorEmail]) {
      const reg = await withCsrfAgent(app);
      const regRes = await reg.agent
        .post("/api/auth/register")
        .set("Origin", reg.origin)
        .set("x-csrf-token", reg.csrf)
        .send({
          surname: "Doc",
          name: "Flow",
          birthDate: "1988-03-03",
          gender: "male",
          phone: em === patientEmail ? "+79993333331" : "+79993333332",
          email: em,
          password,
        });
      expect(regRes.status).toBe(201);
    }

    const pool = await getTestPool();
    await pool.query("UPDATE users SET is_doctor = TRUE WHERE email = ?", [doctorEmail]);

    nock.cleanAll();
    nock(ML.replace(/\/+$/, ""))
      .persist()
      .post("/preprocess")
      .reply(200, { normalized_symptoms: ["кашель"], normalized_profile: {} })
      .post("/predict")
      .reply(200, {
        predictions: [{ id: diseaseId, name: "Integration disease", score: 0.86 }],
        needClarification: false,
      })
      .post("/train")
      .reply(200, { ok: true, models_ready: true })
      .post("/fallback/cosine")
      .reply(200, { predictions: [{ id: diseaseId, name: "fb", score: 0.2 }], needClarification: true })
      .get("/catalog/symptom-vocabulary")
      .reply(200, { symptoms: ["кашель"] })
      .get("/health")
      .reply(200, { ok: true, models_ready: true })
      .post("/feedback")
      .reply(200, { ok: true });
  });

  afterAll(() => {
    nock.cleanAll();
  });

  it("creates feedback on high-confidence predict and doctor can confirm", async () => {
    const pLogin = await withCsrfAgent(app);
    const pLoginRes = await pLogin.agent
      .post("/api/auth/login")
      .set("Origin", pLogin.origin)
      .set("x-csrf-token", pLogin.csrf)
      .send({ email: patientEmail, password });
    expect(pLoginRes.status).toBe(200);
    const patientCookies = pLoginRes.headers["set-cookie"];

    const predCtx = await withCsrfAgent(app);
    const predRes = await predCtx.agent
      .post("/api/diagnosis/predict")
      .set("Origin", predCtx.origin)
      .set("x-csrf-token", predCtx.csrf)
      .set("Cookie", patientCookies)
      .send({ symptoms: ["кашель"], answers: {}, round: 1 });
    expect(predRes.status).toBe(200);

    const pool = await getTestPool();
    const [uRows] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [patientEmail]);
    const uid = uRows[0].id;
    const [fbRows] = await pool.query(
      "SELECT id FROM doctor_feedback WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      [uid]
    );
    expect(fbRows.length).toBeGreaterThan(0);
    const feedbackId = fbRows[0].id;

    const dLogin = await withCsrfAgent(app);
    const dLoginRes = await dLogin.agent
      .post("/api/auth/login")
      .set("Origin", dLogin.origin)
      .set("x-csrf-token", dLogin.csrf)
      .send({ email: doctorEmail, password });
    expect(dLoginRes.status).toBe(200);
    const doctorCookies = dLoginRes.headers["set-cookie"];

    const confCtx = await withCsrfAgent(app);
    const confRes = await confCtx.agent
      .post("/api/doctor/confirm")
      .set("Origin", confCtx.origin)
      .set("x-csrf-token", confCtx.csrf)
      .set("Cookie", doctorCookies)
      .send({ feedbackId, confirmedDiseaseId: diseaseId });
    expect(confRes.status).toBe(200);
    expect(confRes.body.ok).toBe(true);

    const [check] = await pool.query(
      "SELECT confirmed_by_doctor, confirmed_disease_id FROM doctor_feedback WHERE id = ?",
      [feedbackId]
    );
    expect(Boolean(check[0].confirmed_by_doctor)).toBe(true);
    expect(Number(check[0].confirmed_disease_id)).toBe(diseaseId);
  });
});
