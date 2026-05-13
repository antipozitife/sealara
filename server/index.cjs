const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const envalid = require("envalid");
const client = require("prom-client");
const { AsyncLocalStorage } = require("node:async_hooks");
const jwt = require("jsonwebtoken");

/** @type {(token: string, secret: string) => Promise<object>} */
function jwtVerifyAsync(token, secret) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, secret, (err, payload) => {
      if (err) reject(err);
      else resolve(payload);
    });
  });
}
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const pino = require("pino");
const mysql = require("mysql2/promise");
const Redis = require("ioredis");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const NodeCache = require("node-cache");
const diseasesData = require("../src/data/diseases.json");
const { stableStringify, makePredictionCacheKey } = require("./lib/stable-stringify.cjs");
const { parseJsonSafe } = require("./lib/safe-json.cjs");
const { normalizeDiseaseText, splitPipeSymptomsForSync } = require("./lib/text-diseases.cjs");
const { normalizeGender, normalizePhone, phoneRegionHint, parseBirthDate } = require("./lib/profile-utils.cjs");
const { buildHelmetSecurityConfig } = require("./config/csp.config.cjs");
const { doctorOnly } = require("./middleware/auth.cjs");
const { validateBody } = require("./middleware/validation.cjs");
const { buildSchemas, KEY_QUESTIONS } = require("./validators/schemas.cjs");
const { createAppContainer, asValue } = require("./container.cjs");

const { str, num } = envalid;
const isTestEnv = process.env.NODE_ENV === "test" || Boolean(process.env.JEST_WORKER_ID);
const env = envalid.cleanEnv(
  process.env,
  {
    NODE_ENV: str({ choices: ["development", "production", "test"], default: "development" }),
    PORT: num({ default: 3001 }),
    FRONTEND_ORIGIN: str({ default: "http://localhost:5173" }),
    LOG_LEVEL: str({ default: "info" }),
    JWT_SECRET: str({
      default: isTestEnv ? "jest-jwt-secret-must-be-at-least-32-chars-long!" : "",
      allowEmpty: true,
    }),
    ML_API_KEY: str({
      default: isTestEnv ? "jest-ml-api-key" : "",
      allowEmpty: true,
    }),
    ML_SERVICE_URL: str({ default: "" }),
    DB_HOST: str({ default: "localhost" }),
    DB_PORT: num({ default: 3306 }),
    DB_USER: str({ default: "root" }),
    DB_PASSWORD: str({ default: "", allowEmpty: true }),
    DB_NAME: str({ default: "Sealara" }),
    REDIS_URL: str({ default: "", allowEmpty: true }),
    ML_TIMEOUT_MS: num({ default: 2000 }),
    ML_RETRIES: num({ default: 2 }),
    ML_HEALTHCHECK_RETRIES: num({ default: 8 }),
    ML_HEALTHCHECK_DELAY_MS: num({ default: 1500 }),
    CONFIDENCE_THRESHOLD: num({ default: 0.7 }),
    RATE_LIMIT_WINDOW_MS: num({ default: 60_000 }),
    RATE_LIMIT_MAX: num({ default: 120 }),
    LOGIN_RATE_LIMIT_WINDOW_MS: num({ default: 15 * 60 * 1000 }),
    LOGIN_RATE_LIMIT_MAX: num({ default: 10 }),
    REFRESH_RATE_LIMIT_WINDOW_MS: num({ default: 15 * 60 * 1000 }),
    REFRESH_RATE_LIMIT_MAX: num({ default: 30 }),
    REFRESH_TOKEN_LIMIT: num({ default: 5 }),
    ML_PREDICT_USER_WINDOW_MS: num({ default: 60_000 }),
    ML_PREDICT_USER_MAX: num({ default: 60 }),
    DOCTOR_CONFIRM_WINDOW_MS: num({ default: 60 * 60 * 1000 }),
    DOCTOR_CONFIRM_MAX: num({ default: 30 }),
    AUTH_EVENTS_RETENTION_DAYS: num({ default: 365 }),
    REDIS_FEEDBACK_QUEUE_KEY: str({ default: "sealara:pending_feedback" }),
    REDIS_CONNECT_RETRIES: num({ default: 8 }),
    REDIS_CONNECT_DELAY_MS: num({ default: 1200 }),
    DOCTOR_FEEDBACK_RETENTION_DAYS: num({ default: 365 }),
    ML_RESPONSE_CACHE_TTL_MS: num({ default: 300_000 }),
    ACCESS_TOKEN_TTL: str({ default: "15m" }),
    REFRESH_TOKEN_TTL_DAYS: num({ default: 30 }),
    RECENT_QUERIES_RETENTION_DAYS: num({ default: 90 }),
    RECENT_QUERIES_CLEANUP_INTERVAL_MS: num({ default: 6 * 60 * 60 * 1000 }),
    ML_CIRCUIT_ERROR_THRESHOLD: num({ default: 50 }),
    ML_CIRCUIT_RESET_MS: num({ default: 30_000 }),
    ML_CIRCUIT_VOLUME_THRESHOLD: num({ default: 5 }),
    SECURITY_ALERT_QUEUE_KEY: str({ default: "sealara:security:alerts" }),
    GOSUSLUGI_BASE_URL: str({ default: "", allowEmpty: true }),
    GOSUSLUGI_API_KEY: str({ default: "", allowEmpty: true }),
    GOSUSLUGI_TIMEOUT_MS: num({ default: 7000 }),
    GOSUSLUGI_MODE: str({ default: "mock" }),
    GOSUSLUGI_GUID: str({ default: "SealaraGUID" }),
    /** Публичный базовый URL API для абсолютных ссылок на /uploads (фронт на другом домене). Без завершающего /. */
    PUBLIC_API_URL: str({ default: "", allowEmpty: true }),
    /** Доверять X-Forwarded-* от reverse-proxy (nginx). Обычно 1 в проде. */
    TRUST_PROXY_HOPS: num({ default: 0 }),
    /** Макс. размер аватара после декодирования base64 (байты). По умолчанию 15 МиБ. */
    AVATAR_MAX_BYTES: num({ default: 15 * 1024 * 1024 }),
  },
  { strict: false }
);

const PORT = env.PORT;
const FRONTEND_ORIGIN = env.FRONTEND_ORIGIN;
const JWT_SECRET = env.JWT_SECRET.trim();
const CONFIDENCE_THRESHOLD = env.CONFIDENCE_THRESHOLD;
const ML_SERVICE_URL = env.ML_SERVICE_URL.trim();
const TOKEN_COOKIE = "sealara_token";
const DISEASES = Array.isArray(diseasesData) ? diseasesData : [];
const DB_HOST = env.DB_HOST;
const DB_PORT = env.DB_PORT;
const DB_USER = env.DB_USER;
const DB_PASSWORD = env.DB_PASSWORD;
const DB_NAME = env.DB_NAME;
const ML_TIMEOUT_MS = env.ML_TIMEOUT_MS;
const ML_RETRIES = env.ML_RETRIES;
const ML_API_KEY = env.ML_API_KEY.trim();
const RATE_LIMIT_WINDOW_MS = env.RATE_LIMIT_WINDOW_MS;
const RATE_LIMIT_MAX = env.RATE_LIMIT_MAX;
const MAX_SYMPTOMS = 50;
const MAX_SYMPTOM_LENGTH = 200;
const IS_PRODUCTION = env.NODE_ENV === "production";
const RECENT_QUERIES_RETENTION_DAYS = env.RECENT_QUERIES_RETENTION_DAYS;
const RECENT_QUERIES_CLEANUP_INTERVAL_MS = env.RECENT_QUERIES_CLEANUP_INTERVAL_MS;
const ML_HEALTHCHECK_RETRIES = env.ML_HEALTHCHECK_RETRIES;
const ML_HEALTHCHECK_DELAY_MS = env.ML_HEALTHCHECK_DELAY_MS;
const LOGIN_RATE_LIMIT_WINDOW_MS = env.LOGIN_RATE_LIMIT_WINDOW_MS;
const LOGIN_RATE_LIMIT_MAX = env.LOGIN_RATE_LIMIT_MAX;
const REFRESH_RATE_LIMIT_WINDOW_MS = env.REFRESH_RATE_LIMIT_WINDOW_MS;
const REFRESH_RATE_LIMIT_MAX = env.REFRESH_RATE_LIMIT_MAX;
const REFRESH_TOKEN_LIMIT = env.REFRESH_TOKEN_LIMIT;
const ML_PREDICT_USER_WINDOW_MS = env.ML_PREDICT_USER_WINDOW_MS;
const ML_PREDICT_USER_MAX = env.ML_PREDICT_USER_MAX;
const DOCTOR_CONFIRM_WINDOW_MS = env.DOCTOR_CONFIRM_WINDOW_MS;
const DOCTOR_CONFIRM_MAX = env.DOCTOR_CONFIRM_MAX;
const AUTH_EVENTS_RETENTION_DAYS = env.AUTH_EVENTS_RETENTION_DAYS;
const REDIS_URL = env.REDIS_URL.trim();
const REDIS_FEEDBACK_QUEUE_KEY = env.REDIS_FEEDBACK_QUEUE_KEY;
const REDIS_CONNECT_RETRIES = env.REDIS_CONNECT_RETRIES;
const REDIS_CONNECT_DELAY_MS = env.REDIS_CONNECT_DELAY_MS;
const DOCTOR_FEEDBACK_RETENTION_DAYS = env.DOCTOR_FEEDBACK_RETENTION_DAYS;
const CSRF_COOKIE = "sealara_csrf";
const CSRF_HEADER = "x-csrf-token";
const ML_RESPONSE_CACHE_TTL_MS = env.ML_RESPONSE_CACHE_TTL_MS;
const ACCESS_TOKEN_TTL = env.ACCESS_TOKEN_TTL;
const REFRESH_TOKEN_TTL_DAYS = env.REFRESH_TOKEN_TTL_DAYS;
const REFRESH_COOKIE = "sealara_refresh";
const ML_CIRCUIT_ERROR_THRESHOLD = env.ML_CIRCUIT_ERROR_THRESHOLD;
const ML_CIRCUIT_RESET_MS = env.ML_CIRCUIT_RESET_MS;
const ML_CIRCUIT_VOLUME_THRESHOLD = env.ML_CIRCUIT_VOLUME_THRESHOLD;
const SECURITY_ALERT_QUEUE_KEY = env.SECURITY_ALERT_QUEUE_KEY;
const GOSUSLUGI_BASE_URL = env.GOSUSLUGI_BASE_URL.trim();
const GOSUSLUGI_API_KEY = env.GOSUSLUGI_API_KEY.trim();
const GOSUSLUGI_TIMEOUT_MS = env.GOSUSLUGI_TIMEOUT_MS;
const GOSUSLUGI_MODE = env.GOSUSLUGI_MODE;
const GOSUSLUGI_GUID = env.GOSUSLUGI_GUID;
const PUBLIC_API_URL = env.PUBLIC_API_URL.trim();
const TRUST_PROXY_HOPS = env.TRUST_PROXY_HOPS;
process.env.PUBLIC_API_URL = PUBLIC_API_URL;

const RAW_AVATAR_MAX_BYTES = env.AVATAR_MAX_BYTES;
const AVATAR_MAX_BYTES = Math.min(100 * 1024 * 1024, Math.max(256 * 1024, RAW_AVATAR_MAX_BYTES));
/** Лимит JSON-тела: base64 ~×4/3 + поля JSON; не даём раздувать все POST целиком без верха. */
const EXPRESS_JSON_LIMIT_BYTES = Math.min(
  120 * 1024 * 1024,
  Math.max(4 * 1024 * 1024, Math.ceil(AVATAR_MAX_BYTES * 1.37) + 512 * 1024)
);

// FIXED: стабильный «перец» для refresh fingerprint (без IP в хэше); привязан к JWT_SECRET, переживает рестарт
const REFRESH_FINGERPRINT_PEPPER = crypto.createHash("sha256").update(`${JWT_SECRET}:sealara_refresh_fp_v2`).digest("hex");

const requestContext = new AsyncLocalStorage();

const promRegister = new client.Registry();
if (!isTestEnv) {
  client.collectDefaultMetrics({ register: promRegister, prefix: "api_" });
}
const httpRequestsTotal = new client.Counter({
  name: "api_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "path", "status"],
  registers: [promRegister],
});
const pendingFeedbackQueueGauge = new client.Gauge({
  name: "api_pending_feedback_queue_length",
  help: "Pending doctor feedback items waiting for ML reprocessing (Redis list or in-memory queue)",
  registers: [promRegister],
});
const refreshFingerprintMismatchTotal = new client.Counter({
  name: "api_auth_refresh_fingerprint_mismatch_total",
  help: "Refresh rejected due to fingerprint mismatch (strict check; legacy tokens with null fingerprint_hash are exempt)",
  registers: [promRegister],
});

const logger = pino({
  level: env.LOG_LEVEL,
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: {
        ...req.headers,
        cookie: undefined,
        authorization: undefined,
      },
    }),
  },
  redact: {
    paths: [
      "password",
      "token",
      "jwt",
      "req.headers.cookie",
      "req.headers.authorization",
      "*.password",
      "*.token",
      "*.jwt",
    ],
    censor: "**REDACTED**",
  },
});

const app = express();
if (Number(TRUST_PROXY_HOPS) > 0) {
  app.set("trust proxy", Number(TRUST_PROXY_HOPS));
}
let httpServer = null;
const pendingFeedbackQueue = [];
const redisClient = REDIS_URL
  ? new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 10_000,
      commandTimeout: 5_000,
    })
  : null;
// FIXED: ограниченный TTL-кэш ответов ML (без неограниченного роста Map)
const mlPredictionCache = new NodeCache({
  stdTTL: Math.max(1, Math.floor(ML_RESPONSE_CACHE_TTL_MS / 1000)),
  maxKeys: 1000,
  useClones: false,
});

if (!JWT_SECRET) {
  logger.error("JWT_SECRET must be set");
  process.exit(1);
}
if (!ML_API_KEY) {
  logger.error("ML_API_KEY must be set");
  process.exit(1);
}
if (IS_PRODUCTION) {
  if (!ML_SERVICE_URL) {
    logger.error("ML_SERVICE_URL must be set in production");
    process.exit(1);
  }
}

const initialSqlPool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  enableKeepAlive: true,
});

app.use(helmet(buildHelmetSecurityConfig(FRONTEND_ORIGIN, PUBLIC_API_URL)));
app.use(express.json({ limit: EXPRESS_JSON_LIMIT_BYTES }));
app.use(cookieParser());
app.use((req, res, next) => {
  const requestId = String(req.headers["x-request-id"] || "").trim() || crypto.randomUUID();
  res.setHeader("x-request-id", requestId);
  requestContext.run({ requestId }, next);
});
app.use((req, res, next) => {
  res.on("finish", () => {
    try {
      const pathLabel = req.route?.path ? `${req.baseUrl || ""}${req.route.path}` : req.path || "unknown";
      httpRequestsTotal.labels(req.method, pathLabel, String(res.statusCode)).inc();
    } catch {
      // ignore metrics label errors
    }
  });
  next();
});
app.use(
  rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Слишком много запросов, попробуйте позже" },
  })
);
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);

const UPLOADS_ROOT = path.join(__dirname, "..", "uploads");
try {
  fs.mkdirSync(path.join(UPLOADS_ROOT, "avatars"), { recursive: true });
} catch {
  // ignore startup mkdir races / read-only test env
}
app.use("/uploads", express.static(UPLOADS_ROOT));

function issueCsrfToken() {
  return crypto.randomBytes(24).toString("hex");
}

function ensureCsrfCookie(req, res, next) {
  const existing = String(req.cookies?.[CSRF_COOKIE] || "").trim();
  if (existing) return next();
  res.cookie(CSRF_COOKIE, issueCsrfToken(), {
    httpOnly: false,
    sameSite: "strict",
    secure: IS_PRODUCTION,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return next();
}
app.use(ensureCsrfCookie);

function csrfGuard(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  if (!req.path.startsWith("/api/")) return next();
  const origin = String(req.headers.origin || "");
  const referer = String(req.headers.referer || "");
  const csrfCookie = String(req.cookies?.[CSRF_COOKIE] || "");
  const csrfHeader = String(req.headers[CSRF_HEADER] || "");
  const allowed = origin === FRONTEND_ORIGIN || referer.startsWith(`${FRONTEND_ORIGIN}/`) || referer === FRONTEND_ORIGIN;
  if (!allowed || !csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({ error: "CSRF validation failed" });
  }
  return next();
}
app.use(csrfGuard);

async function syncPendingFeedbackQueueGauge() {
  let len = pendingFeedbackQueue.length;
  if (redisClient) {
    try {
      len = Number(await redisClient.llen(REDIS_FEEDBACK_QUEUE_KEY) || 0);
    } catch {
      len = pendingFeedbackQueue.length;
    }
  }
  pendingFeedbackQueueGauge.set(len);
}

app.get("/metrics", async (_req, res) => {
  try {
    await syncPendingFeedbackQueueGauge();
    res.set("Content-Type", promRegister.contentType);
    res.end(await promRegister.metrics());
  } catch (error) {
    res.status(500).type("text/plain").send(String(error?.message || error));
  }
});

const openapiSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: { title: "Sealara API", version: "1.0.0" },
    paths: {
      "/api/health": {
        get: {
          summary: "Service health",
          responses: { "200": { description: "OK" } },
        },
      },
      "/api/diagnosis/predict": {
        post: {
          summary: "Get diagnosis prediction",
          responses: { "200": { description: "Prediction response" } },
        },
      },
    },
  },
  apis: [],
});
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

const loginLimiter = rateLimit({
  windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
  max: LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много попыток входа. Попробуйте позже." },
});
const refreshLimiter = rateLimit({
  windowMs: REFRESH_RATE_LIMIT_WINDOW_MS,
  max: REFRESH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много обновлений сессии. Попробуйте позже." },
});

const doctorConfirmLimiter = rateLimit({
  windowMs: DOCTOR_CONFIRM_WINDOW_MS,
  max: DOCTOR_CONFIRM_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.user?.id != null) return `user:${req.user.id}`;
    return ipKeyGenerator(req.ip);
  },
  message: { error: "Слишком много подтверждений, попробуйте позже" },
});

const {
  diagnosisPredictSchema,
  diagnosisPreliminarySchema,
  doctorConfirmSchema,
  appointmentCreateSchema,
  appointmentStatusUpdateSchema,
  avatarUploadSchema,
  profileUpdateSchema,
} = buildSchemas({
  maxSymptoms: MAX_SYMPTOMS,
  maxSymptomLength: MAX_SYMPTOM_LENGTH,
});

function sanitizeUser(user) {
  return {
    id: String(user.id),
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    profile: user.profile,
    recentQueries: user.recentQueries || [],
  };
}

async function enqueueSecurityNotification(userId, type, payload = {}) {
  const item = {
    userId: Number(userId),
    type: String(type || "security_alert"),
    payload: payload && typeof payload === "object" ? payload : {},
    createdAt: new Date().toISOString(),
  };
  if (!redisClient) {
    logger.warn({ userId: Number(userId), type: item.type }, "Security alert queue skipped: Redis disabled");
    return;
  }
  try {
    await redisClient.lpush(SECURITY_ALERT_QUEUE_KEY, JSON.stringify(item));
  } catch (error) {
    logger.warn({ userId: Number(userId), type: item.type, error: String(error?.message || error) }, "Security alert queue push failed");
  }
}

async function logAuthEvent(eventType, reqMeta = {}, userId = null, details = null) {
  try {
    const userAgent = String(reqMeta.userAgent || "").slice(0, 500) || null;
    const ipAddress = String(reqMeta.ipAddress || "").slice(0, 64) || null;
    await sqlPool.query(
      `
      INSERT INTO auth_events (event_type, user_id, ip_address, user_agent, details_json)
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        String(eventType || "unknown").slice(0, 64),
        userId === null || userId === undefined ? null : Number(userId),
        ipAddress,
        userAgent,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (error) {
    logger.warn({ error: String(error?.message || error), eventType }, "Failed to write auth event");
  }
}

async function verifyPasswordScrypt(password, encoded) {
  const [scheme, saltHex, hashHex] = String(encoded || "").split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const stored = Buffer.from(hashHex, "hex");
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, stored.length, (err, key) => {
      if (err) return reject(err);
      return resolve(key);
    });
  });
  return crypto.timingSafeEqual(stored, Buffer.from(derived));
}

function rememberMlPrediction(cacheKey, result) {
  mlPredictionCache.set(cacheKey, result);
}

function readRecentMlPrediction(cacheKey) {
  const data = mlPredictionCache.get(cacheKey);
  return data != null ? data : null;
}

async function appendRecentQuery(userId, queryPayload) {
  try {
    const [result] = await sqlPool.query(
      "INSERT INTO recent_queries (user_id, symptoms_json, answers_json) VALUES (?, ?, ?)",
      [
        Number(userId),
        JSON.stringify(queryPayload?.symptoms || []),
        JSON.stringify(queryPayload?.answers || {}),
      ]
    );
    return Number(result?.insertId || 0);
  } catch (error) {
    logger.error({ userId: Number(userId), error: String(error?.message || error) }, "Failed to insert recent query");
    return 0;
  }
}

async function learnFromDoctorFeedback(userId, confirmedDiseaseId, queryId = null) {
  const [uRows] = await sqlPool.query(
    "SELECT id, birth_date, gender, region FROM users WHERE id = ? LIMIT 1",
    [Number(userId)]
  );
  if (!Array.isArray(uRows) || uRows.length === 0) return;
  const user = uRows[0];
  let queryIdToUse = Number(queryId);
  if (!Number.isFinite(queryIdToUse) || queryIdToUse <= 0) {
    const [lastRows] = await sqlPool.query(
      "SELECT id FROM recent_queries WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
      [Number(userId)]
    );
    if (!Array.isArray(lastRows) || lastRows.length === 0) return;
    queryIdToUse = Number(lastRows[0].id);
  }
  const [qRows] = await sqlPool.query(
    "SELECT symptoms_json, answers_json FROM recent_queries WHERE id = ? LIMIT 1",
    [queryIdToUse]
  );
  if (!Array.isArray(qRows) || qRows.length === 0) return;
  const last = qRows[0];
  const symptoms = parseJsonSafe(last.symptoms_json, []);
  const answers = parseJsonSafe(last.answers_json, {});
  const feedbackPayload = {
    symptoms: Array.isArray(symptoms) ? symptoms : [],
    profile: {
      birthDate: user.birth_date ? new Date(user.birth_date).toISOString().slice(0, 10) : "",
      gender: String(user.gender || ""),
      region: String(user.region || ""),
    },
    answers: answers && typeof answers === "object" ? answers : {},
    confirmed_disease_id: Number(confirmedDiseaseId),
  };
  for (let attempt = 0; attempt <= ML_RETRIES; attempt += 1) {
    const result = await feedbackViaMlService(feedbackPayload);
    if (result && result.ok) return;
    if (attempt >= ML_RETRIES) {
      logger.error(
        { userId: Number(userId), confirmedDiseaseId: Number(confirmedDiseaseId), attempts: attempt + 1 },
        "Failed to send doctor feedback to ML service"
      );
      await enqueuePendingFeedback({
        userId: Number(userId),
        confirmedDiseaseId: Number(confirmedDiseaseId),
        queryId: queryIdToUse,
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
}

async function enqueuePendingFeedback(item) {
  if (redisClient) {
    try {
      await redisClient.lpush(REDIS_FEEDBACK_QUEUE_KEY, JSON.stringify(item));
      return;
    } catch (error) {
      logger.warn({ error: String(error?.message || error) }, "Failed to enqueue feedback to Redis, using memory queue");
    }
  }
  pendingFeedbackQueue.push(item);
}

async function dequeuePendingFeedback() {
  if (redisClient) {
    try {
      const result = await redisClient.brpop(REDIS_FEEDBACK_QUEUE_KEY, 1);
      if (!Array.isArray(result) || result.length < 2) return null;
      const raw = result[1];
      const parsed = parseJsonSafe(String(raw), null);
      if (parsed && typeof parsed === "object") return parsed;
      logger.warn({ raw: String(raw).slice(0, 300) }, "Invalid feedback payload in Redis queue");
    } catch (error) {
      logger.warn({ error: String(error?.message || error) }, "Failed to dequeue feedback from Redis");
    }
  }
  if (pendingFeedbackQueue.length === 0) return null;
  return pendingFeedbackQueue.shift();
}

async function processPendingFeedbackQueue() {
  await processPendingFeedbackQueueBatch(1);
}

let feedbackReprocessBatchRunning = false;

// FIXED: обрабатываем до batchSize элементов за один тик (не параллелим тики setInterval)
async function processPendingFeedbackQueueBatch(batchSize = 10) {
  if (feedbackReprocessBatchRunning) return;
  feedbackReprocessBatchRunning = true;
  let processed = 0;
  try {
    while (processed < batchSize) {
      const item = await dequeuePendingFeedback();
      if (!item) break;
      try {
        await learnFromDoctorFeedback(item.userId, item.confirmedDiseaseId, item.queryId);
        processed += 1;
      } catch (error) {
        logger.error({ error: String(error?.message || error) }, "Failed while reprocessing feedback queue item");
      }
    }
  } finally {
    feedbackReprocessBatchRunning = false;
  }
}

function getRequestId() {
  return String(requestContext.getStore()?.requestId || "").trim();
}
const container = createAppContainer({
  app,
  logger,
  sqlPool: initialSqlPool,
  redisClient,
  stableStringify,
  getRequestId,
  jwtVerifyAsync,
  jwtSecret: JWT_SECRET,
  tokenCookie: TOKEN_COOKIE,
  refreshCookie: REFRESH_COOKIE,
  refreshTokenTtlDays: REFRESH_TOKEN_TTL_DAYS,
  refreshTokenLimit: REFRESH_TOKEN_LIMIT,
  accessTokenTtl: ACCESS_TOKEN_TTL,
  isProduction: IS_PRODUCTION,
  refreshFingerprintPepper: REFRESH_FINGERPRINT_PEPPER,
  mlServiceUrl: ML_SERVICE_URL,
  mlApiKey: ML_API_KEY,
  mlRetries: ML_RETRIES,
  mlTimeoutMs: ML_TIMEOUT_MS,
  mlCircuitErrorThreshold: ML_CIRCUIT_ERROR_THRESHOLD,
  mlCircuitResetMs: ML_CIRCUIT_RESET_MS,
  mlCircuitVolumeThreshold: ML_CIRCUIT_VOLUME_THRESHOLD,
  gosuslugiBaseUrl: GOSUSLUGI_BASE_URL,
  gosuslugiApiKey: GOSUSLUGI_API_KEY,
  gosuslugiTimeoutMs: GOSUSLUGI_TIMEOUT_MS,
  gosuslugiMode: GOSUSLUGI_MODE,
  gosuslugiGuid: GOSUSLUGI_GUID,
});
const sqlPool = container.resolve("sqlPool");

const authRepository = container.resolve("authRepository");
const authSessionService = container.resolve("authSessionService");
const authMiddleware = container.resolve("authMiddleware");
const parsePaginationQuery = container.resolve("parsePaginationQuery");
const mlClient = container.resolve("mlClient");
const gosuslugiClient = container.resolve("gosuslugiClient");
const { mapSqlUserRow, getUserById, revokeRefreshTokenById, revokeAllRefreshTokensForUser } = authRepository;
const { issueAuthSession, clearAuthCookie, hashToken, makeRefreshFingerprint } = authSessionService;

const {
  predictViaMlService,
  preprocessViaMlService,
  trainMlService,
  preliminaryViaMlService,
  feedbackViaMlService,
  catalogSymptomsViaMlService,
  fallbackCosineViaMlService,
  fetchMlGetWithTimeout,
} = mlClient;

async function checkMlPredictUserRateLimit(userId) {
  if (!redisClient || !ML_PREDICT_USER_MAX || ML_PREDICT_USER_MAX <= 0) {
    return { ok: true };
  }
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return { ok: true };
  const key = `sealara:ml_predict_rl:${uid}`;
  try {
    if (redisClient.status !== "ready") {
      await redisClient.connect().catch(() => {});
    }
    if (redisClient.status !== "ready") {
      logger.warn("Redis not ready, skipping ML predict user rate limit");
      return { ok: true };
    }
    const n = await redisClient.incr(key);
    if (n === 1) {
      await redisClient.pexpire(key, Math.max(1000, ML_PREDICT_USER_WINDOW_MS));
    }
    if (n > ML_PREDICT_USER_MAX) {
      return { ok: false };
    }
  } catch (error) {
    logger.warn({ error: String(error?.message || error), userId: uid }, "ML predict user rate limit skipped (Redis error)");
  }
  return { ok: true };
}

async function waitForMlHealth() {
  return mlClient.waitForMlHealth({ retries: ML_HEALTHCHECK_RETRIES, delayMs: ML_HEALTHCHECK_DELAY_MS });
}

/** After POST /train (async on ML), poll until RF is loaded — background training may take a while. */
async function waitForMlModelsReady() {
  return mlClient.waitForMlModelsReady({ maxAttempts: 150, delayMs: ML_HEALTHCHECK_DELAY_MS });
}

async function ensureColumnExists(tableName, columnName, ddlSql) {
  const [rows] = await sqlPool.query(
    `
    SELECT COUNT(*) AS cnt
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = ?
      AND column_name = ?
    `,
    [tableName, columnName]
  );
  const exists = Number(rows?.[0]?.cnt || 0) > 0;
  if (!exists) {
    await sqlPool.query(ddlSql);
  }
}

async function ensureIndexExists(tableName, indexName, ddlSql) {
  const [rows] = await sqlPool.query(
    `
    SELECT COUNT(*) AS cnt
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = ?
      AND index_name = ?
    `,
    [tableName, indexName]
  );
  const exists = Number(rows?.[0]?.cnt || 0) > 0;
  if (!exists) {
    await sqlPool.query(ddlSql);
  }
}


async function ensureSqlSchema() {
  await sqlPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      surname VARCHAR(100) NOT NULL,
      name VARCHAR(100) NOT NULL,
      patronymic VARCHAR(100),
      birth_date DATE NOT NULL,
      gender VARCHAR(10) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      region VARCHAR(255),
      is_doctor BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await sqlPool.query(`
    CREATE TABLE IF NOT EXISTS user_credentials (
      user_id INT PRIMARY KEY,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_user_credentials_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);
  await sqlPool.query(`
    CREATE TABLE IF NOT EXISTS recent_queries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      symptoms_json TEXT,
      answers_json TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await sqlPool.query(`
    CREATE TABLE IF NOT EXISTS diseases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      icd10_code VARCHAR(20),
      snomed_code VARCHAR(50),
      name VARCHAR(255) NOT NULL,
      definition TEXT,
      about TEXT,
      diagnosis TEXT,
      treatment TEXT,
      prevention TEXT,
      specialist VARCHAR(255),
      prevalence FLOAT DEFAULT 0.01
    )
  `);
  await sqlPool.query(`
    CREATE TABLE IF NOT EXISTS symptoms (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) UNIQUE,
      category VARCHAR(100),
      severity_weight FLOAT DEFAULT 1.0
    )
  `);
  await sqlPool.query(`
    CREATE TABLE IF NOT EXISTS disease_symptoms (
      disease_id INT,
      symptom_id INT,
      probability FLOAT DEFAULT 0.5,
      FOREIGN KEY (disease_id) REFERENCES diseases(id),
      FOREIGN KEY (symptom_id) REFERENCES symptoms(id)
    )
  `);
  await sqlPool.query(`
    CREATE TABLE IF NOT EXISTS lab_markers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255),
      unit VARCHAR(50),
      normal_min FLOAT,
      normal_max FLOAT
    )
  `);
  await sqlPool.query(`
    CREATE TABLE IF NOT EXISTS disease_lab_patterns (
      disease_id INT,
      marker_id INT,
      direction ENUM('high','low','normal'),
      weight FLOAT DEFAULT 1.0,
      FOREIGN KEY (disease_id) REFERENCES diseases(id),
      FOREIGN KEY (marker_id) REFERENCES lab_markers(id)
    )
  `);
  await sqlPool.query(`
    CREATE TABLE IF NOT EXISTS doctor_feedback (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(255),
      predicted_disease_id INT,
      confirmed_disease_id INT,
      query_id INT NULL,
      doctor_id INT NULL,
      confidence FLOAT,
      confirmed_by_doctor BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (query_id) REFERENCES recent_queries(id) ON DELETE SET NULL,
      FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await sqlPool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      token_id VARCHAR(64) NOT NULL UNIQUE,
      user_id INT NOT NULL,
      token_hash CHAR(64) NOT NULL,
      user_agent VARCHAR(500) NULL,
      ip_address VARCHAR(64) NULL,
      fingerprint_hash CHAR(64) NULL,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await sqlPool.query(`
    CREATE TABLE IF NOT EXISTS auth_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      event_type VARCHAR(64) NOT NULL,
      user_id INT NULL,
      ip_address VARCHAR(64) NULL,
      user_agent VARCHAR(500) NULL,
      details_json TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await sqlPool.query(`
    CREATE TABLE IF NOT EXISTS patient_appointments (
      id VARCHAR(80) NOT NULL PRIMARY KEY,
      patient_user_id INT NOT NULL,
      doctor_external_id VARCHAR(255) NOT NULL,
      doctor_name VARCHAR(255) NOT NULL,
      specialization VARCHAR(255) NOT NULL,
      starts_at VARCHAR(64) NOT NULL,
      reason TEXT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'booked',
      source VARCHAR(64) NOT NULL DEFAULT 'gosuslugi-mock',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await ensureColumnExists("users", "avatar_url", "ALTER TABLE users ADD COLUMN avatar_url VARCHAR(512) NULL");
  await ensureColumnExists(
    "refresh_tokens",
    "fingerprint_hash",
    "ALTER TABLE refresh_tokens ADD COLUMN fingerprint_hash CHAR(64) NULL"
  );
  await ensureColumnExists("doctor_feedback", "query_id", "ALTER TABLE doctor_feedback ADD COLUMN query_id INT NULL");
  await ensureColumnExists("doctor_feedback", "doctor_id", "ALTER TABLE doctor_feedback ADD COLUMN doctor_id INT NULL");
  await ensureIndexExists("recent_queries", "idx_recent_queries_user_id", "CREATE INDEX idx_recent_queries_user_id ON recent_queries(user_id)");
  await ensureIndexExists("doctor_feedback", "idx_feedback_user_id", "CREATE INDEX idx_feedback_user_id ON doctor_feedback(user_id)");
  await ensureIndexExists(
    "doctor_feedback",
    "idx_feedback_confirmed",
    "CREATE INDEX idx_feedback_confirmed ON doctor_feedback(confirmed_by_doctor)"
  );
  await ensureIndexExists(
    "doctor_feedback",
    "idx_feedback_created_at",
    "CREATE INDEX idx_feedback_created_at ON doctor_feedback(created_at DESC)"
  );
  await ensureIndexExists(
    "refresh_tokens",
    "idx_refresh_tokens_user",
    "CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id, expires_at)"
  );
  await ensureIndexExists(
    "refresh_tokens",
    "idx_refresh_tokens_active",
    "CREATE INDEX idx_refresh_tokens_active ON refresh_tokens(token_id, revoked_at, expires_at)"
  );
  await ensureIndexExists(
    "refresh_tokens",
    "idx_refresh_tokens_fingerprint",
    "CREATE INDEX idx_refresh_tokens_fingerprint ON refresh_tokens(fingerprint_hash)"
  );
  await ensureIndexExists(
    "refresh_tokens",
    "idx_refresh_tokens_user_revoked_created",
    "CREATE INDEX idx_refresh_tokens_user_revoked_created ON refresh_tokens(user_id, revoked_at, created_at)"
  );
  await ensureIndexExists(
    "auth_events",
    "idx_auth_events_type_created",
    "CREATE INDEX idx_auth_events_type_created ON auth_events(event_type, created_at)"
  );
  await ensureIndexExists(
    "auth_events",
    "idx_auth_events_user_created",
    "CREATE INDEX idx_auth_events_user_created ON auth_events(user_id, created_at)"
  );
  await ensureIndexExists(
    "auth_events",
    "idx_auth_events_created_at",
    "CREATE INDEX idx_auth_events_created_at ON auth_events(created_at DESC)"
  );
  await ensureIndexExists(
    "disease_symptoms",
    "uq_disease_symptom_pair",
    "CREATE UNIQUE INDEX uq_disease_symptom_pair ON disease_symptoms(disease_id, symptom_id)"
  );
  await ensureIndexExists(
    "patient_appointments",
    "idx_patient_appointments_user_created",
    "CREATE INDEX idx_patient_appointments_user_created ON patient_appointments(patient_user_id, created_at DESC)"
  );
}

async function syncNormalizedCatalog() {
  for (const disease of DISEASES) {
    const diseaseId = Number(disease.id);
    if (!Number.isFinite(diseaseId)) continue;
    const prevalence = Number(disease?.prevalence || disease?.raw?.["распространенность"] || 0.01);
    await sqlPool.query(
      `
      INSERT INTO diseases (id, name, definition, specialist, prevalence)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        definition = VALUES(definition),
        specialist = VALUES(specialist),
        prevalence = VALUES(prevalence)
      `,
      [diseaseId, disease.name, disease.definition || "", String(disease?.raw?.["специалист"] || ""), prevalence]
    );

    const symptoms = splitPipeSymptomsForSync(disease?.raw?.["симптомы"]);
    for (const symptom of symptoms) {
      await sqlPool.query(
        `
        INSERT INTO symptoms (name, category, severity_weight)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          category = VALUES(category),
          severity_weight = VALUES(severity_weight)
        `,
        [symptom, "general", 1]
      );
      const [rows] = await sqlPool.query("SELECT id FROM symptoms WHERE name = ? LIMIT 1", [symptom]);
      const symptomId = Array.isArray(rows) && rows[0] ? Number(rows[0].id) : null;
      if (!Number.isFinite(symptomId)) continue;
      await sqlPool.query(
        `
        INSERT INTO disease_symptoms (disease_id, symptom_id, probability)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE probability = VALUES(probability)
        `,
        [diseaseId, symptomId, 0.7]
      );
    }
  }
}

async function hashPasswordScrypt(password) {
  const salt = crypto.randomBytes(16);
  const hash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      return resolve(derivedKey);
    });
  });
  return `scrypt$${salt.toString("hex")}$${Buffer.from(hash).toString("hex")}`;
}

app.get("/api/health", async (_, res) => {
  const details = {
    db: false,
    redis: !redisClient,
    ml: false,
  };
  try {
    await sqlPool.query("SELECT 1");
    details.db = true;
  } catch (error) {
    logger.warn({ error: String(error?.message || error) }, "DB health check failed");
  }
  if (redisClient) {
    try {
      const pong = await redisClient.ping();
      details.redis = String(pong).toUpperCase() === "PONG";
    } catch (error) {
      logger.warn({ error: String(error?.message || error) }, "Redis health check failed");
    }
  }
  if (ML_SERVICE_URL) {
    try {
      const response = await fetchMlGetWithTimeout(`${ML_SERVICE_URL.replace(/\/+$/, "")}/health`);
      details.ml = response.ok;
    } catch (error) {
      logger.warn({ error: String(error?.message || error) }, "ML health check through API failed");
    }
  }
  const ok = details.db && details.redis && details.ml;
  return res.status(ok ? 200 : 503).json({ ok, services: details });
});

container.resolve("registerMetricsRoutes")(app, {
  authMiddleware,
  doctorOnly,
  sqlPool,
  pendingFeedbackQueue,
  redisClient,
  redisFeedbackQueueKey: REDIS_FEEDBACK_QUEUE_KEY,
  mlServiceUrl: ML_SERVICE_URL,
  fetchMlGetWithTimeout,
  logger,
});

container.resolve("registerDiagnosisRoutes")(app, {
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
  confidenceThreshold: CONFIDENCE_THRESHOLD,
  rememberMlPrediction,
});

container.resolve("registerDoctorRoutes")(app, {
  authMiddleware,
  doctorOnly,
  doctorConfirmLimiter,
  validateBody,
  doctorConfirmSchema,
  appointmentCreateSchema,
  appointmentStatusUpdateSchema,
  parsePaginationQuery,
  sqlPool,
  learnFromDoctorFeedback,
  gosuslugiClient,
  logger,
});

container.resolve("registerAuthRoutes")(app, {
  sqlPool,
  loginLimiter,
  refreshLimiter,
  authMiddleware,
  jwtVerifyAsync,
  jwtSecret: JWT_SECRET,
  tokenCookie: TOKEN_COOKIE,
  getUserById,
  refreshCookie: REFRESH_COOKIE,
  normalizeGender,
  normalizePhone,
  phoneRegionHint,
  parseBirthDate,
  hashPasswordScrypt,
  verifyPasswordScrypt,
  mapSqlUserRow,
  sanitizeUser,
  issueAuthSession,
  logAuthEvent,
  revokeRefreshTokenById,
  revokeAllRefreshTokensForUser,
  clearAuthCookie,
  hashToken,
  makeRefreshFingerprint,
  refreshFingerprintMismatchTotal,
  enqueueSecurityNotification,
  logger,
});

container.resolve("registerProfileRoutes")(app, {
  authMiddleware,
  validateBody,
  profileUpdateSchema,
  avatarUploadSchema,
  avatarMaxBytes: AVATAR_MAX_BYTES,
  parseBirthDate,
  normalizeGender,
  normalizePhone,
  verifyPasswordScrypt,
  hashPasswordScrypt,
  mapSqlUserRow,
  getUserById,
  revokeAllRefreshTokensForUser,
  issueAuthSession,
  sqlPool,
  logger,
});

container.register({
  waitForMlHealth: asValue(waitForMlHealth),
  waitForMlModelsReady: asValue(waitForMlModelsReady),
  ensureSqlSchema: asValue(ensureSqlSchema),
  syncNormalizedCatalog: asValue(syncNormalizedCatalog),
  trainMlService: asValue(trainMlService),
  diseases: asValue(DISEASES),
  redisConnectRetries: asValue(REDIS_CONNECT_RETRIES),
  redisConnectDelayMs: asValue(REDIS_CONNECT_DELAY_MS),
  mlHealthcheckRetries: asValue(ML_HEALTHCHECK_RETRIES),
  mlHealthcheckDelayMs: asValue(ML_HEALTHCHECK_DELAY_MS),
  recentQueriesCleanupIntervalMs: asValue(RECENT_QUERIES_CLEANUP_INTERVAL_MS),
  recentQueriesRetentionDays: asValue(RECENT_QUERIES_RETENTION_DAYS),
  doctorFeedbackRetentionDays: asValue(DOCTOR_FEEDBACK_RETENTION_DAYS),
  authEventsRetentionDays: asValue(AUTH_EVENTS_RETENTION_DAYS),
  processPendingFeedbackQueueBatch: asValue(processPendingFeedbackQueueBatch),
  setHttpServer: asValue((server) => {
    httpServer = server;
  }),
  getHttpServer: asValue(() => httpServer),
  port: asValue(PORT),
});
const lifecycle = container.resolve("lifecycle");

lifecycle.registerSignalHandlers();

app.use((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  logger.error(
    { err: String(err?.message || err), stack: err?.stack, path: req.path, method: req.method },
    "Unhandled error"
  );
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

async function bootstrap() {
  return lifecycle.bootstrap(app);
}

if (require.main === module) {
  void bootstrap();
}

function resetMlBreakerForTests() {
  if (!isTestEnv) return;
  mlClient.resetMlBreakerForTests();
}

module.exports = {
  app,
  container,
  bootstrap,
  ensureSqlSchema,
  normalizeDiseaseText,
  stableStringify,
  makePredictionCacheKey,
  resetMlBreakerForTests,
};