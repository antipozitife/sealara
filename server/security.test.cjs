const request = require("supertest");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { withCsrfAgent } = require("../tests/setup/http-helpers.cjs");
const {
  mockCreateAppContainerWithSqlPool,
  createMockSqlPool,
  resetMockSqlPool,
} = require("../tests/setup/test-container.cjs");

const sqlPool = createMockSqlPool();
mockCreateAppContainerWithSqlPool(sqlPool);

const { app } = require("./index.cjs");

const JWT_SECRET = process.env.JWT_SECRET || "jest-jwt-secret-must-be-at-least-32-chars-long!";

function makeTestFingerprint(userAgent) {
  const pepper = crypto.createHash("sha256").update(`${JWT_SECRET}:sealara_refresh_fp_v2`).digest("hex");
  return crypto.createHash("sha256").update(`${userAgent}|${pepper}`).digest("hex");
}

function makeScryptHash(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

describe("Security features", () => {
  afterEach(() => {
    resetMockSqlPool(sqlPool);
    jest.clearAllMocks();
  });

  it("responds with Content-Security-Policy header", async () => {
    sqlPool.query.mockResolvedValue([[]]);
    const res = await request(app).get("/api/health");
    expect(res.headers).toHaveProperty("content-security-policy");
    const csp = res.headers["content-security-policy"];
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).toMatch(/img-src 'self' data: blob:/);
  });

  it("responds with COEP and baseline security headers", async () => {
    sqlPool.query.mockResolvedValue([[]]);
    const res = await request(app).get("/api/health");
    expect(res.headers["cross-origin-embedder-policy"]).toBe("credentialless");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("refresh succeeds with matching fingerprint", async () => {
    const userId = 1;
    const tokenId = crypto.randomUUID();
    const userAgent = "test-agent/1.0";
    const fingerprint = makeTestFingerprint(userAgent);

    const refreshToken = jwt.sign({ sub: userId, typ: "refresh", jti: tokenId }, JWT_SECRET, { expiresIn: "30d" });
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([[]]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    sqlPool.getConnection.mockResolvedValue(connection);

    sqlPool.query.mockImplementation((sql) => {
      const q = String(sql || "");
      if (q.includes("FROM refresh_tokens") && q.includes("WHERE token_id = ?")) {
        return Promise.resolve([
          [
            {
              token_id: tokenId,
              user_id: userId,
              token_hash: tokenHash,
              fingerprint_hash: fingerprint,
              revoked_at: null,
              expires_at: new Date(Date.now() + 86_400_000),
            },
          ],
        ]);
      }
      if (q.includes("UPDATE refresh_tokens") && q.includes("WHERE token_id = ?")) {
        return Promise.resolve([{ affectedRows: 1 }]);
      }
      if (q.includes("INSERT INTO auth_events")) {
        return Promise.resolve([{ affectedRows: 1 }]);
      }
      return Promise.resolve([[]]);
    });

    const { agent, csrf, origin } = await withCsrfAgent(app);
    const res = await agent
      .post("/api/auth/refresh")
      .set("Origin", origin)
      .set("x-csrf-token", csrf)
      .set("User-Agent", userAgent)
      .set("Cookie", `sealara_refresh=${refreshToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(sqlPool.query).toHaveBeenCalledWith(expect.stringContaining("WHERE token_id = ?"), [tokenId]);
    expect(connection.beginTransaction).toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalled();
  });

  it("refresh fails on fingerprint mismatch and revokes all tokens", async () => {
    const userId = 2;
    const tokenId = crypto.randomUUID();
    const userAgent = "attacker-agent";
    const storedFingerprint = makeTestFingerprint("real-agent");
    const refreshToken = jwt.sign({ sub: userId, typ: "refresh", jti: tokenId }, JWT_SECRET, { expiresIn: "30d" });
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

    sqlPool.query.mockImplementation((sql) => {
      const q = String(sql || "");
      if (q.includes("FROM refresh_tokens") && q.includes("WHERE token_id = ?")) {
        return Promise.resolve([
          [
            {
              token_id: tokenId,
              user_id: userId,
              token_hash: tokenHash,
              fingerprint_hash: storedFingerprint,
              revoked_at: null,
              expires_at: new Date(Date.now() + 86_400_000),
            },
          ],
        ]);
      }
      if (q.includes("UPDATE refresh_tokens") && q.includes("WHERE user_id = ?")) {
        return Promise.resolve([{ affectedRows: 3 }]);
      }
      if (q.includes("INSERT INTO auth_events")) {
        return Promise.resolve([{ affectedRows: 1 }]);
      }
      return Promise.resolve([[]]);
    });

    const { agent, csrf, origin } = await withCsrfAgent(app);
    const res = await agent
      .post("/api/auth/refresh")
      .set("Origin", origin)
      .set("x-csrf-token", csrf)
      .set("User-Agent", userAgent)
      .set("Cookie", `sealara_refresh=${refreshToken}`);

    expect(res.status).toBe(401);
    expect(String(res.body.error || "").toLowerCase()).toContain("invalid");
    expect(sqlPool.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE user_id = ? AND revoked_at IS NULL"),
      [userId]
    );
  });

  it("/logout-all invalidates all refresh tokens for user", async () => {
    const userId = 7;
    const accessToken = jwt.sign({ sub: userId, typ: "access" }, JWT_SECRET, { expiresIn: "15m" });

    sqlPool.query.mockImplementation((sql, params) => {
      const q = String(sql || "");
      if (q.includes("FROM users WHERE id = ? LIMIT 1")) {
        return Promise.resolve([
          [
            {
              id: userId,
              surname: "Test",
              name: "User",
              patronymic: "",
              birth_date: "1990-01-01",
              gender: "м",
              phone: "+79990000000",
              email: "user@example.com",
              region: "Москва",
              is_doctor: 0,
              created_at: new Date(),
            },
          ],
        ]);
      }
      if (q.includes("UPDATE refresh_tokens") && q.includes("WHERE user_id = ?")) {
        return Promise.resolve([{ affectedRows: 5 }]);
      }
      if (q.includes("INSERT INTO auth_events")) {
        return Promise.resolve([{ affectedRows: 1 }]);
      }
      return Promise.resolve([[]]);
    });

    const { agent, csrf, origin } = await withCsrfAgent(app);
    const res = await agent
      .post("/api/auth/logout-all")
      .set("Origin", origin)
      .set("x-csrf-token", csrf)
      .set("Cookie", `sealara_token=${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(sqlPool.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE user_id = ? AND revoked_at IS NULL"),
      [userId]
    );
  });

  it("login sets auth cookies with HttpOnly and SameSite=Strict", async () => {
    const email = "cookie-user@example.com";
    const password = "password123";
    const passwordHash = makeScryptHash(password);

    const connection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([[]]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    sqlPool.getConnection.mockResolvedValue(connection);

    sqlPool.query.mockImplementation((sql, params) => {
      const q = String(sql || "");
      if (q.includes("JOIN user_credentials") && q.includes("WHERE u.email = ?")) {
        return Promise.resolve([
          [
            {
              id: 11,
              surname: "Cookie",
              name: "User",
              patronymic: "",
              birth_date: "1990-01-01",
              gender: "м",
              phone: "+79990000001",
              email,
              region: "Москва",
              is_doctor: 0,
              created_at: new Date(),
              password_hash: passwordHash,
            },
          ],
        ]);
      }
      if (q.includes("INSERT INTO auth_events")) {
        return Promise.resolve([{ affectedRows: 1 }]);
      }
      if (q.includes("UPDATE refresh_tokens")) {
        return Promise.resolve([{ affectedRows: 0 }]);
      }
      return Promise.resolve([[]]);
    });

    const { agent, csrf, origin } = await withCsrfAgent(app);
    const res = await agent
      .post("/api/auth/login")
      .set("Origin", origin)
      .set("x-csrf-token", csrf)
      .send({ email, password });

    expect(res.status).toBe(200);
    const cookies = Array.isArray(res.headers["set-cookie"]) ? res.headers["set-cookie"] : [];
    const tokenCookie = cookies.find((c) => String(c).startsWith("sealara_token="));
    const refreshCookie = cookies.find((c) => String(c).startsWith("sealara_refresh="));
    expect(tokenCookie).toBeTruthy();
    expect(refreshCookie).toBeTruthy();
    expect(tokenCookie).toMatch(/HttpOnly/i);
    expect(tokenCookie).toMatch(/SameSite=Strict/i);
    expect(refreshCookie).toMatch(/HttpOnly/i);
    expect(refreshCookie).toMatch(/SameSite=Strict/i);
  });
});

