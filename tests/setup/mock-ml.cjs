const nock = require("nock");

/**
 * @param {string} baseUrl e.g. http://127.0.0.1:19999
 * @param {{ persist?: boolean }} opts
 */
function mockMlHappyPath(baseUrl, opts = {}) {
  const base = baseUrl.replace(/\/+$/, "");
  const b = opts.persist === false ? nock(base) : nock(base).persist();
  return b
    .post("/preprocess")
    .reply(200, {
      normalized_symptoms: ["кашель"],
      normalized_profile: {},
    })
    .post("/predict")
    .reply(200, {
      predictions: [{ id: 1, name: "Тестовая болезнь", score: 0.86 }],
      needClarification: false,
    })
    .post("/train")
    .reply(200, { ok: true, models_ready: true })
    .post("/fallback/cosine")
    .reply(200, {
      predictions: [{ id: 2, name: "Cosine fallback", score: 0.4 }],
      needClarification: true,
    })
    .get("/catalog/symptom-vocabulary")
    .reply(200, { symptoms: ["кашель", "температура"] })
    .get("/health")
    .reply(200, { ok: true, models_ready: true });
}

module.exports = { mockMlHappyPath };
