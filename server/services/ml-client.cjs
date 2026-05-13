const CircuitBreaker = require("opossum");

function createMlClient({
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
}) {
  let mlServiceBreaker = null;

  async function callMlServiceWithRetries(endpoint, payload, method = "POST") {
    const base = mlServiceUrl.replace(/\/+$/, "");
    let lastError = null;
    const upper = String(method || "POST").toUpperCase();
    for (let attempt = 0; attempt <= mlRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), mlTimeoutMs);
      try {
        const rid = getRequestId();
        const headers = {
          "x-api-key": mlApiKey,
          ...(rid ? { "x-request-id": rid } : {}),
        };
        if (upper !== "GET") {
          headers["Content-Type"] = "application/json";
        }
        const response = await fetch(`${base}${endpoint}`, {
          method: upper,
          headers,
          ...(upper === "GET" || payload == null ? {} : { body: JSON.stringify(payload) }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!response.ok) {
          let detail = "";
          try {
            const errBody = await response.json();
            detail = String(errBody?.detail || errBody?.error || "");
          } catch {
            detail = "";
          }
          lastError = { _error: true, status: response.status, detail };
          logger.warn(
            {
              endpoint,
              attempt: attempt + 1,
              status: response.status,
              payloadSample: payload != null ? stableStringify(payload).slice(0, 400) : "",
            },
            "ML service request failed"
          );
          continue;
        }
        const data = await Promise.race([
          response.json(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("ML response read timeout")), mlTimeoutMs)),
        ]);
        return data && typeof data === "object" ? data : null;
      } catch (error) {
        clearTimeout(timer);
        logger.error(
          {
            endpoint,
            attempt: attempt + 1,
            error: String(error?.message || error),
            payloadSample: payload != null ? stableStringify(payload).slice(0, 400) : "",
          },
          "ML service call error"
        );
        if (attempt >= mlRetries) return null;
      }
    }
    return lastError;
  }

  function getMlServiceBreaker() {
    if (!mlServiceUrl) return null;
    if (!mlServiceBreaker) {
      mlServiceBreaker = new CircuitBreaker(
        async (args) => {
          const result = await callMlServiceWithRetries(args.endpoint, args.payload, args.method || "POST");
          if (result && result._error) {
            const st = Number(result.status || 0);
            if (st >= 400 && st < 500) return result;
            const err = new Error(String(result.detail || "ML error"));
            err.mlResult = result;
            throw err;
          }
          if (result === null) {
            const err = new Error("ML unavailable");
            throw err;
          }
          return result;
        },
        {
          timeout: (mlRetries + 2) * (mlTimeoutMs + 500),
          errorThresholdPercentage: mlCircuitErrorThreshold,
          resetTimeout: mlCircuitResetMs,
          volumeThreshold: mlCircuitVolumeThreshold,
          name: "ml-service",
        }
      );
      mlServiceBreaker.fallback(() => ({
        _error: true,
        status: 503,
        detail: "ML circuit breaker open",
      }));
      mlServiceBreaker.on("open", () => logger.warn("ML circuit breaker opened"));
      mlServiceBreaker.on("close", () => logger.info("ML circuit breaker closed"));
    }
    return mlServiceBreaker;
  }

  async function callMlService(endpoint, payload, method = "POST") {
    if (!mlServiceUrl) {
      logger.error({ endpoint }, "ML_SERVICE_URL is not configured");
      return null;
    }
    const breaker = getMlServiceBreaker();
    if (!breaker) return callMlServiceWithRetries(endpoint, payload, method);
    try {
      return await breaker.fire({ endpoint, payload, method });
    } catch (error) {
      if (error && error.mlResult) return error.mlResult;
      logger.warn({ endpoint, error: String(error?.message || error) }, "ML circuit breaker execution error");
      return { _error: true, status: 503, detail: String(error?.message || error) };
    }
  }

  async function fetchMlGetWithTimeout(url) {
    const controller = new AbortController();
    const ms = Math.max(1500, mlTimeoutMs + 500);
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, {
        headers: { "x-api-key": mlApiKey },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function waitForMlHealth({ retries, delayMs }) {
    if (!mlServiceUrl) return false;
    const healthUrl = `${mlServiceUrl.replace(/\/+$/, "")}/health`;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const response = await fetchMlGetWithTimeout(healthUrl);
        if (response.ok) {
          logger.info({ attempt }, "ML service is healthy");
          return true;
        }
        logger.warn({ attempt, status: response.status }, "ML health check failed");
      } catch (error) {
        logger.warn({ attempt, error: String(error?.message || error) }, "ML health check error");
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return false;
  }

  async function waitForMlModelsReady({ maxAttempts, delayMs }) {
    if (!mlServiceUrl) return false;
    const healthUrl = `${mlServiceUrl.replace(/\/+$/, "")}/health`;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetchMlGetWithTimeout(healthUrl);
        if (response.ok) {
          const body = await response.json();
          if (body.models_ready) {
            logger.info({ attempt }, "ML models_ready");
            return true;
          }
        }
      } catch (error) {
        logger.warn({ attempt, error: String(error?.message || error) }, "ML models_ready poll error");
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return false;
  }

  return {
    predictViaMlService: (payload) => callMlService("/predict", payload),
    preprocessViaMlService: (payload) => callMlService("/preprocess", payload),
    trainMlService: async (payload) => {
      try {
        return await callMlService("/train", payload);
      } catch (error) {
        logger.error({ error: String(error?.message || error) }, "Failed to call /train on ML service");
        throw error;
      }
    },
    preliminaryViaMlService: (payload) => callMlService("/preliminary", payload),
    feedbackViaMlService: (payload) => callMlService("/feedback", payload),
    catalogSymptomsViaMlService: () => callMlService("/catalog/symptom-vocabulary", null, "GET"),
    fallbackCosineViaMlService: (payload) => callMlService("/fallback/cosine", payload),
    fetchMlGetWithTimeout,
    waitForMlHealth,
    waitForMlModelsReady,
    resetMlBreakerForTests: () => {
      mlServiceBreaker = null;
    },
  };
}

module.exports = {
  createMlClient,
};
