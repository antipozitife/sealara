const crypto = require("crypto");
const { createContainer, asValue, asFunction } = require("awilix");
const { createMlClient } = require("./services/ml-client.cjs");
const { createAuthRepository } = require("./db/auth-repository.cjs");
const { createAuthSessionService } = require("./services/auth-session.cjs");
const { createAuthMiddleware } = require("./middleware/auth.cjs");
const { createPaginationParser } = require("./middleware/validation.cjs");
const { createLifecycleManager } = require("./bootstrap/lifecycle.cjs");
const { createGosuslugiClient } = require("./services/gosuslugi-client.cjs");
const { registerAuthRoutes } = require("./routes/auth.cjs");
const { registerDoctorRoutes } = require("./routes/doctor.cjs");
const { registerDiagnosisRoutes } = require("./routes/diagnosis.cjs");
const { registerProfileRoutes } = require("./routes/profile.cjs");
const { registerMetricsRoutes } = require("./routes/metrics.cjs");

function createAppContainer(values = {}) {
  const container = createContainer();

  container.register({
    ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, asValue(v)])),
    registerAuthRoutes: asValue(registerAuthRoutes),
    registerDoctorRoutes: asValue(registerDoctorRoutes),
    registerDiagnosisRoutes: asValue(registerDiagnosisRoutes),
    registerProfileRoutes: asValue(registerProfileRoutes),
    registerMetricsRoutes: asValue(registerMetricsRoutes),
    hashToken: asFunction(() => (token) => crypto.createHash("sha256").update(String(token)).digest("hex")).singleton(),
    makeRefreshFingerprint: asFunction(
      ({ refreshFingerprintPepper }) =>
        (reqMeta = {}) => {
          const userAgent = String(reqMeta.userAgent || "").slice(0, 500);
          return crypto.createHash("sha256").update(`${userAgent}|${refreshFingerprintPepper}`).digest("hex");
        }
    ).singleton(),
    authRepository: asFunction(
      ({ sqlPool, refreshTokenTtlDays, refreshTokenLimit, hashToken, makeRefreshFingerprint }) =>
        createAuthRepository({
          sqlPool,
          refreshTokenTtlDays,
          refreshTokenLimit,
          hashToken,
          makeRefreshFingerprint,
        })
    ).singleton(),
    getUserById: asFunction(({ authRepository }) => authRepository.getUserById).singleton(),
    mapSqlUserRow: asFunction(({ authRepository }) => authRepository.mapSqlUserRow).singleton(),
    revokeRefreshTokenById: asFunction(({ authRepository }) => authRepository.revokeRefreshTokenById).singleton(),
    revokeAllRefreshTokensForUser: asFunction(({ authRepository }) => authRepository.revokeAllRefreshTokensForUser).singleton(),
    authSessionService: asFunction(
      ({
        sqlPool,
        jwtSecret,
        accessTokenTtl,
        refreshTokenTtlDays,
        isProduction,
        tokenCookie,
        refreshCookie,
        refreshFingerprintPepper,
        authRepository,
      }) =>
        createAuthSessionService({
          sqlPool,
          jwtSecret,
          accessTokenTtl,
          refreshTokenTtlDays,
          isProduction,
          tokenCookie,
          refreshCookie,
          refreshFingerprintPepper,
          authRepository,
        })
    ).singleton(),
    issueAuthSession: asFunction(({ authSessionService }) => authSessionService.issueAuthSession).singleton(),
    clearAuthCookie: asFunction(({ authSessionService }) => authSessionService.clearAuthCookie).singleton(),
    mlClient: asFunction(
      ({
        logger,
        stableStringify,
        getRequestId,
        mlServiceUrl,
        mlApiKey,
        mlRetries,
        mlTimeoutMs,
        mlCircuitErrorThreshold,
        mlCircuitResetMs,
        mlCircuitVolumeThreshold,
      }) =>
        createMlClient({
          logger,
          stableStringify,
          getRequestId,
          mlServiceUrl,
          mlApiKey,
          mlRetries,
          mlTimeoutMs,
          mlCircuitErrorThreshold,
          mlCircuitResetMs,
          mlCircuitVolumeThreshold,
        })
    ).singleton(),
    gosuslugiClient: asFunction(({ logger, sqlPool, gosuslugiBaseUrl, gosuslugiApiKey, gosuslugiTimeoutMs, gosuslugiMode, gosuslugiGuid }) =>
      createGosuslugiClient({
        logger,
        sqlPool,
        baseUrl: gosuslugiBaseUrl,
        apiKey: gosuslugiApiKey,
        timeoutMs: gosuslugiTimeoutMs,
        mode: gosuslugiMode,
        guid: gosuslugiGuid,
      })
    ).singleton(),
    authMiddleware: asFunction(({ tokenCookie, jwtVerifyAsync, jwtSecret, getUserById }) =>
      createAuthMiddleware({
        tokenCookie,
        jwtVerifyAsync,
        jwtSecret,
        getUserById,
      })
    ).singleton(),
    parsePaginationQuery: asFunction(() => createPaginationParser({ defaultLimit: 50, maxLimit: 100 })).singleton(),
    lifecycle: asFunction(
      ({
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
      }) =>
        createLifecycleManager({
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
        })
    ).singleton(),
  });

  return container;
}

function createTestContainer({ values = {}, overrides = {} } = {}) {
  const container = createAppContainer(values);
  if (overrides && typeof overrides === "object" && Object.keys(overrides).length > 0) {
    container.register(
      Object.fromEntries(Object.entries(overrides).map(([key, value]) => [key, asValue(value)]))
    );
  }
  return container;
}

module.exports = {
  createAppContainer,
  createTestContainer,
  asValue,
};
