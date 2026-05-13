function registerDiagnosisRoutes(app, deps) {
  const {
    authMiddleware,
    validateBody,
    diagnosisPreliminarySchema,
    diagnosisPredictSchema,
    KEY_QUESTIONS,
    catalogSymptomsViaMlService,
    preliminaryViaMlService,
    preprocessViaMlService,
    checkMlPredictUserRateLimit,
    makePredictionCacheKey,
    predictViaMlService,
    readRecentMlPrediction,
    fallbackCosineViaMlService,
    appendRecentQuery,
    sqlPool,
    confidenceThreshold,
    rememberMlPrediction,
  } = deps;

  app.get("/api/diagnosis/options", authMiddleware, async (_, res) => {
    const vocab = await catalogSymptomsViaMlService();
    if (!vocab || vocab._error) {
      return res.status(Number(vocab?.status || 503)).json({
        error: vocab?.detail || vocab?.error || "Не удалось получить словарь симптомов (ML)",
      });
    }
    return res.json({ symptoms: Array.isArray(vocab.symptoms) ? vocab.symptoms : [] });
  });

  app.get("/api/diagnosis/questions", authMiddleware, (_, res) => {
    res.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    return res.json({ questions: KEY_QUESTIONS });
  });

  app.post("/api/diagnosis/preliminary", authMiddleware, validateBody(diagnosisPreliminarySchema), async (req, res) => {
    const answers = req.body?.answers || {};
    const serviceResult = await preliminaryViaMlService({
      profile: req.user.profile || {},
      answers,
    });
    if (!serviceResult) {
      return res.status(503).json({ error: "ML service unavailable" });
    }
    if (serviceResult._error) {
      return res.status(Number(serviceResult.status || 503)).json({ error: serviceResult.detail || "ML service error" });
    }
    return res.json(serviceResult);
  });

  app.post("/api/diagnosis/predict", authMiddleware, validateBody(diagnosisPredictSchema), async (req, res) => {
    const round = Number(req.body?.round) || 1;
    const symptomsRaw = Array.isArray(req.body?.symptoms) ? req.body.symptoms : [];
    if (symptomsRaw.length === 0) return res.status(400).json({ error: "Выберите хотя бы один симптом" });

    const pre = await preprocessViaMlService({
      raw_symptoms: symptomsRaw,
      profile: req.user.profile || {},
      answers: req.body?.answers || {},
    });
    if (!pre || pre._error || !Array.isArray(pre.normalized_symptoms) || pre.normalized_symptoms.length === 0) {
      return res.status(pre?._error ? Number(pre.status || 503) : 400).json({
        error: pre?.detail || pre?.error || "Не удалось нормализовать симптомы через ML /preprocess",
      });
    }
    const symptoms = pre.normalized_symptoms;

    const burst = await checkMlPredictUserRateLimit(req.user.id);
    if (!burst.ok) {
      return res.status(429).json({ error: "Слишком много запросов к диагностике. Подождите немного." });
    }

    const cacheKey = makePredictionCacheKey(symptoms, req.user.profile || {}, req.body?.answers || {}, round);
    const serviceResult = await predictViaMlService({
      symptoms,
      profile: req.user.profile || {},
      answers: req.body?.answers || {},
      round,
      confidence_threshold: confidenceThreshold,
    });
    if (!serviceResult) {
      const cached = readRecentMlPrediction(cacheKey);
      if (cached) {
        return res.json({ ...cached, stale: true, staleSource: "last-successful-ml-response" });
      }
      const fallback = await fallbackCosineViaMlService({
        symptoms,
        profile: req.user.profile || {},
        round,
      });
      if (fallback && !fallback._error) {
        return res.json({
          ...fallback,
          modelInfo: { name: "Python cosine fallback (via ML)", strategy: "symptom overlap cosine" },
        });
      }
      return res.status(503).json({ error: "ML service unavailable" });
    }
    if (serviceResult._error) {
      const cached = readRecentMlPrediction(cacheKey);
      if (cached) {
        return res.json({ ...cached, stale: true, staleSource: "last-successful-ml-response" });
      }
      const fallback = await fallbackCosineViaMlService({
        symptoms,
        profile: req.user.profile || {},
        round,
      });
      if (fallback && !fallback._error) {
        return res.json({
          ...fallback,
          modelInfo: { name: "Python cosine fallback (via ML)", strategy: "symptom overlap cosine" },
        });
      }
      return res.status(Number(serviceResult.status || 503)).json({
        error: serviceResult.detail || "ML service error",
      });
    }
    const queryId = await appendRecentQuery(req.user.id, {
      symptoms,
      answers: req.body?.answers || {},
      timestamp: new Date().toISOString(),
      source: "ml-service",
    });
    if (serviceResult.predictions?.[0]?.score > confidenceThreshold) {
      await sqlPool.query(
        "INSERT INTO doctor_feedback (user_id, predicted_disease_id, confidence, query_id) VALUES (?, ?, ?, ?)",
        [req.user.id, serviceResult.predictions[0].id, serviceResult.predictions[0].score, queryId || null]
      );
    }
    const responsePayload = {
      ...serviceResult,
      modelInfo: {
        name: "FastAPI ML Service",
        estimators: 0,
        strategy: "Python-only feature engineering and inference",
      },
    };
    rememberMlPrediction(cacheKey, responsePayload);
    return res.json(responsePayload);
  });
}

module.exports = {
  registerDiagnosisRoutes,
};
