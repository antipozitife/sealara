const nock = require("nock");
const { app, ensureSqlSchema } = require("../../server/index.cjs");
const { withCsrfAgent } = require("../setup/http-helpers.cjs");
const { deleteUserByEmail, ensureDisease, getTestPool } = require("../setup/test-db.cjs");

const ML = process.env.ML_SERVICE_URL || "http://127.0.0.1:19999";

const describeDb =
  process.env.SEALARA_DB_INTEGRATION === "1" ? describe : describe.skip;

/**
 * E2E chain for diploma narrative: register → diagnosis → doctor confirm → ML /feedback.
 * Batch retrain on ML side is covered by pytest; here we assert the API reaches /feedback after confirm.
 */
describeDb("E2E: registration → diagnosis → doctor confirm → ML feedback", () => {
  const patientEmail = "e2e-diploma-patient@sealara.test";
  const doctorEmail = "e2e-diploma-doctor@sealara.test";
  const password = "password123";
  const diseaseId = 880020;
  let feedbackPostCount = 0;
  let trainPostCount = 0;

  beforeAll(async () => {
    await ensureSqlSchema();
    await ensureDisease(diseaseId, "E2E diploma disease");
    await deleteUserByEmail(patientEmail);
    await deleteUserByEmail(doctorEmail);

    for (const em of [patientEmail, doctorEmail]) {
      const reg = await withCsrfAgent(app);
      const regRes = await reg.agent
        .post("/api/auth/register")
        .set("Origin", reg.origin)
        .set("x-csrf-token", reg.csrf)
        .send({
          surname: "E2E",
          name: "Diploma",
          birthDate: "1992-04-04",
          gender: "female",
          phone: em === patientEmail ? "+79994444441" : "+79994444442",
          email: em,
          password,
        });
      expect(regRes.status).toBe(201);
    }

    const pool = await getTestPool();
    await pool.query("UPDATE users SET is_doctor = TRUE WHERE email = ?", [doctorEmail]);

    nock.cleanAll();
    const scope = nock(ML.replace(/\/+$/, "")).persist();
    scope.post("/preprocess").reply(200, { normalized_symptoms: ["кашель"], normalized_profile: {} });
    scope.post("/predict").reply(200, {
      predictions: [{ id: diseaseId, name: "E2E diploma disease", score: 0.88 }],
      needClarification: false,
    });
    scope.post("/train").reply(() => {
      trainPostCount += 1;
      return [200, { ok: true, models_ready: true }];
    });
    scope.post("/fallback/cosine").reply(200, {
      predictions: [{ id: diseaseId, name: "fb", score: 0.2 }],
      needClarification: true,
    });
    scope.get("/catalog/symptom-vocabulary").reply(200, { symptoms: ["кашель"] });
    scope.get("/health").reply(200, { ok: true, models_ready: true });
    scope.post("/feedback").reply(() => {
      feedbackPostCount += 1;
      return [200, { ok: true, retrained: false }];
    });
  });

  afterAll(() => {
    nock.cleanAll();
  });

  it("sends ML /feedback after doctor confirms diagnosis", async () => {
    feedbackPostCount = 0;
    trainPostCount = 0;

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

    expect(feedbackPostCount).toBeGreaterThanOrEqual(1);
    expect(trainPostCount).toBeGreaterThanOrEqual(0);
  });
});
