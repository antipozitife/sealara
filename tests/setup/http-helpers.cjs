const request = require("supertest");

const CSRF_COOKIE = "sealara_csrf";
const CSRF_HEADER = "x-csrf-token";

function parseCookiePair(setCookieHeaders, name) {
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [];
  for (const line of list) {
    const part = String(line || "").split(";")[0];
    if (part.startsWith(`${name}=`)) return part.slice(name.length + 1);
  }
  return "";
}

/**
 * @param {import('express').Express} app
 */
async function withCsrfAgent(app) {
  const agent = request.agent(app);
  const origin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
  const res = await agent.get("/api/health").set("Origin", origin);
  const csrf = parseCookiePair(res.headers["set-cookie"], CSRF_COOKIE);
  return { agent, csrf, origin };
}

module.exports = { parseCookiePair, withCsrfAgent, CSRF_COOKIE, CSRF_HEADER };
