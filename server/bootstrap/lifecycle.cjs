function createLifecycleManager(deps) {
  const {
    logger,
    redisClient,
    sqlPool,
    waitForMlHealth,
    waitForMlModelsReady,
    ensureSqlSchema,
    syncNormalizedCatalog,
    trainMlService,
    diseases,
    redisConnectRetries,
    redisConnectDelayMs,
    mlHealthcheckRetries,
    mlHealthcheckDelayMs,
    recentQueriesCleanupIntervalMs,
    recentQueriesRetentionDays,
    doctorFeedbackRetentionDays,
    authEventsRetentionDays,
    processPendingFeedbackQueueBatch,
    setHttpServer,
    getHttpServer,
    port,
  } = deps;

  async function waitForRedisReady() {
    if (!redisClient) return true;
    for (let attempt = 1; attempt <= redisConnectRetries; attempt += 1) {
      try {
        if (redisClient.status !== "ready") {
          await redisClient.connect();
        }
        await redisClient.ping();
        logger.info({ attempt }, "Redis is healthy");
        return true;
      } catch (error) {
        logger.warn({ attempt, error: String(error?.message || error) }, "Redis health check failed");
        if (attempt < redisConnectRetries) {
          await new Promise((resolve) => setTimeout(resolve, redisConnectDelayMs));
        }
      }
    }
    return false;
  }

  async function cleanupRecentQueries() {
    try {
      const [result] = await sqlPool.query(
        `
        DELETE FROM recent_queries
        WHERE created_at < (NOW() - INTERVAL ? DAY)
        `,
        [recentQueriesRetentionDays]
      );
      logger.info(
        { retentionDays: recentQueriesRetentionDays, removed: Number(result?.affectedRows || 0) },
        "Recent queries cleanup complete"
      );
    } catch (error) {
      logger.error({ error: String(error?.message || error) }, "Recent queries cleanup failed");
    }
  }

  async function cleanupDoctorFeedback() {
    try {
      const [result] = await sqlPool.query(
        `
        DELETE FROM doctor_feedback
        WHERE created_at < (NOW() - INTERVAL ? DAY)
        `,
        [doctorFeedbackRetentionDays]
      );
      logger.info(
        { retentionDays: doctorFeedbackRetentionDays, removed: Number(result?.affectedRows || 0) },
        "Doctor feedback cleanup complete"
      );
    } catch (error) {
      logger.error({ error: String(error?.message || error) }, "Doctor feedback cleanup failed");
    }
  }

  async function cleanupRefreshTokens() {
    try {
      const [result] = await sqlPool.query(
        `
        DELETE FROM refresh_tokens
        WHERE expires_at < NOW()
           OR (revoked_at IS NOT NULL AND revoked_at < (NOW() - INTERVAL 30 DAY))
        `
      );
      logger.info({ removed: Number(result?.affectedRows || 0) }, "Refresh tokens cleanup complete");
    } catch (error) {
      logger.error({ error: String(error?.message || error) }, "Refresh tokens cleanup failed");
    }
  }

  async function cleanupAuthEvents() {
    try {
      const [result] = await sqlPool.query(
        `
        DELETE FROM auth_events
        WHERE created_at < (NOW() - INTERVAL ? DAY)
        `,
        [authEventsRetentionDays]
      );
      logger.info({ retentionDays: authEventsRetentionDays, removed: Number(result?.affectedRows || 0) }, "Auth events cleanup complete");
    } catch (error) {
      logger.error({ error: String(error?.message || error) }, "Auth events cleanup failed");
    }
  }

  async function gracefulShutdown(signal) {
    logger.info({ signal }, "Received shutdown signal, closing SQL pool");
    try {
      const httpServer = getHttpServer ? getHttpServer() : null;
      if (httpServer) {
        await new Promise((resolve) => httpServer.close(resolve));
        logger.info("HTTP server closed");
      }
      if (redisClient) {
        await redisClient.quit();
        logger.info("Redis client closed");
      }
      await sqlPool.end();
    } catch (error) {
      logger.error({ error: String(error?.message || error) }, "Failed to close SQL pool gracefully");
    } finally {
      process.exit(0);
    }
  }

  async function bootstrap(app) {
    if (redisClient) {
      const redisReady = await waitForRedisReady();
      if (!redisReady) {
        logger.error("Redis did not become healthy during startup window");
        process.exit(1);
      }
      logger.info("Redis feedback queue enabled");
    }
    try {
      await ensureSqlSchema();
    } catch (error) {
      logger.error({ error: String(error?.message || error) }, "ensureSqlSchema failed at startup");
    }

    try {
      await syncNormalizedCatalog();
    } catch (error) {
      logger.error({ error: String(error?.message || error) }, "syncNormalizedCatalog failed at startup");
    }

    const mlReady = await waitForMlHealth();
    if (!mlReady) {
      logger.error("ML service did not become healthy during startup window");
      process.exit(1);
    }

    if (!Array.isArray(diseases) || diseases.length === 0) {
      logger.error("src/data/diseases.json is missing or empty; cannot seed ML /train");
      process.exit(1);
    }

    const trainPayload = { diseases };
    let trainOk = false;
    for (let attempt = 1; attempt <= mlHealthcheckRetries; attempt += 1) {
      try {
        const result = await trainMlService(trainPayload);
        if (result && !result._error && result.ok) {
          trainOk = true;
          break;
        }
        logger.warn({ attempt, detail: result?.detail, status: result?.status }, "trainMlService returned error or incomplete");
      } catch (err) {
        logger.warn({ attempt, error: String(err?.message || err) }, "trainMlService failed");
      }
      await new Promise((resolve) => setTimeout(resolve, mlHealthcheckDelayMs));
    }
    if (!trainOk) {
      logger.error("Failed to train ML service with local diseases.json after retries");
      process.exit(1);
    }
    const modelsReady = await waitForMlModelsReady();
    if (!modelsReady) {
      logger.error("ML models did not become ready after /train (timeout waiting for models_ready)");
      process.exit(1);
    }

    await cleanupRecentQueries();
    await cleanupDoctorFeedback();
    await cleanupRefreshTokens();
    await cleanupAuthEvents();

    const timers = [
      setInterval(() => void cleanupRecentQueries(), recentQueriesCleanupIntervalMs),
      setInterval(() => void cleanupDoctorFeedback(), recentQueriesCleanupIntervalMs),
      setInterval(() => void cleanupRefreshTokens(), recentQueriesCleanupIntervalMs),
      setInterval(() => void cleanupAuthEvents(), recentQueriesCleanupIntervalMs),
      setInterval(() => void processPendingFeedbackQueueBatch(10), 2000),
    ];
    timers.forEach((t) => {
      if (typeof t.unref === "function") t.unref();
    });

    const server = app.listen(port, () => {
      logger.info({ port }, `Sealara API running on http://localhost:${port}`);
    });
    setHttpServer(server);
  }

  function registerSignalHandlers() {
    process.on("SIGTERM", () => {
      void gracefulShutdown("SIGTERM");
    });
    process.on("SIGINT", () => {
      void gracefulShutdown("SIGINT");
    });
  }

  return {
    bootstrap,
    registerSignalHandlers,
    gracefulShutdown,
  };
}

module.exports = {
  createLifecycleManager,
};
