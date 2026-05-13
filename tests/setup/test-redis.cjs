/**
 * Placeholder for Redis-aware integration helpers (e.g. rate-limit tests).
 * @returns {Promise<boolean>}
 */
async function pingRedis() {
  if (!process.env.REDIS_URL) return false;
  try {
    const Redis = require("ioredis");
    const c = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
    await c.connect();
    await c.ping();
    await c.quit();
    return true;
  } catch {
    return false;
  }
}

module.exports = { pingRedis };
