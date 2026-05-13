function registerMetricsRoutes(app, deps) {
  const {
    authMiddleware,
    doctorOnly,
    sqlPool,
    pendingFeedbackQueue,
    redisClient,
    redisFeedbackQueueKey,
    mlServiceUrl,
    fetchMlGetWithTimeout,
    logger,
  } = deps;

  app.get("/api/metrics", authMiddleware, doctorOnly, async (_, res) => {
    const [recentRows] = await sqlPool.query("SELECT COUNT(*) AS cnt FROM recent_queries");
    const [feedbackRows] = await sqlPool.query("SELECT COUNT(*) AS cnt FROM doctor_feedback");
    let pendingFeedbackQueueLength = pendingFeedbackQueue.length;
    let feedbackQueueBackend = "memory";
    if (redisClient) {
      try {
        const redisLen = await redisClient.llen(redisFeedbackQueueKey);
        pendingFeedbackQueueLength = Number(redisLen || 0);
        feedbackQueueBackend = "redis";
      } catch (error) {
        logger.warn({ error: String(error?.message || error) }, "Failed to read Redis queue length, using memory queue length");
      }
    }
    return res.json({
      recent_queries_total: Number(recentRows?.[0]?.cnt || 0),
      doctor_feedback_total: Number(feedbackRows?.[0]?.cnt || 0),
      pending_feedback_queue_total: pendingFeedbackQueueLength,
      pending_feedback_queue_backend: feedbackQueueBackend,
    });
  });

  app.get("/api/ml/metrics", authMiddleware, doctorOnly, async (_, res) => {
    if (!mlServiceUrl) {
      return res.status(400).json({ error: "ML_SERVICE_URL не настроен" });
    }
    try {
      const response = await fetchMlGetWithTimeout(`${mlServiceUrl.replace(/\/+$/, "")}/health`);
      if (!response.ok) return res.status(502).json({ error: "ML service unavailable" });
      const data = await response.json();
      return res.json(data);
    } catch (error) {
      logger.error({ error: String(error?.message || error) }, "Failed to fetch /health from ML service");
      return res.status(502).json({ error: "ML service unavailable" });
    }
  });
}

module.exports = {
  registerMetricsRoutes,
};
