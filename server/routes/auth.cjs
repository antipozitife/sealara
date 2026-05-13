function registerAuthRoutes(app, deps) {
  const {
    sqlPool,
    loginLimiter,
    refreshLimiter,
    authMiddleware,
    jwtVerifyAsync,
    jwtSecret,
    tokenCookie,
    getUserById,
    refreshCookie,
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
  } = deps;

  app.post("/api/auth/register", async (req, res) => {
    const payload = req.body || {};
    const surname = String(payload.surname || "").trim();
    const name = String(payload.name || "").trim();
    const patronymic = String(payload.patronymic || "").trim();
    const birthDate = parseBirthDate(payload.birthDate);
    const gender = normalizeGender(payload.gender);
    const phone = normalizePhone(payload.phone);
    const email = String(payload.email || "").trim().toLowerCase();
    const manualRegion = String(payload.region || "").trim();
    const region = manualRegion || phoneRegionHint(phone);
    const password = String(payload.password || "");
    if (!surname || !name || !gender) return res.status(400).json({ error: "Заполните обязательные поля: фамилия, имя, пол" });
    if (!phone) return res.status(400).json({ error: "Введите корректный номер телефона" });
    if (!email) return res.status(400).json({ error: "Введите email" });
    if (!birthDate) return res.status(400).json({ error: "Введите корректную дату рождения" });
    if (password.length < 8) return res.status(400).json({ error: "Пароль должен быть не короче 8 символов" });
    const connection = await sqlPool.getConnection();
    try {
      await connection.beginTransaction();
      const [existingRows] = await connection.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
      if (Array.isArray(existingRows) && existingRows.length > 0) {
        await connection.rollback();
        return res.status(409).json({ error: "Пользователь с таким email уже существует" });
      }
      const [insertResult] = await connection.query(
        "INSERT INTO users (surname, name, patronymic, birth_date, gender, phone, email, region) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [surname, name, patronymic || null, birthDate, gender, phone, email, region || null]
      );
      const userId = Number(insertResult.insertId);
      const passwordHashStrong = await hashPasswordScrypt(password);
      await connection.query("INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)", [userId, passwordHashStrong]);
      const [rows] = await connection.query(
        "SELECT id, surname, name, patronymic, birth_date, gender, phone, email, region, is_doctor, created_at FROM users WHERE id = ? LIMIT 1",
        [userId]
      );
      const appUser = mapSqlUserRow(rows[0]);
      await connection.commit();
      await issueAuthSession(res, appUser.id, {
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      });
      await logAuthEvent("register_success", { userAgent: req.headers["user-agent"], ipAddress: req.ip }, appUser.id);
      return res.status(201).json({ user: sanitizeUser(appUser) });
    } catch (error) {
      await connection.rollback();
      logger.error({ error: String(error?.message || error) }, "Registration failed");
      return res.status(500).json({ error: "Не удалось зарегистрировать пользователя" });
    } finally {
      connection.release();
    }
  });

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) return res.status(400).json({ error: "Введите email и пароль" });
    const [rows] = await sqlPool.query(
      `
      SELECT u.id, u.surname, u.name, u.patronymic, u.birth_date, u.gender, u.phone, u.email, u.region, u.is_doctor, u.created_at,
             c.password_hash
      FROM users u
      JOIN user_credentials c ON c.user_id = u.id
      WHERE u.email = ?
      LIMIT 1
      `,
      [email]
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      await logAuthEvent("login_failed", { userAgent: req.headers["user-agent"], ipAddress: req.ip }, null, { email });
      return res.status(401).json({ error: "Неверный email или пароль" });
    }
    const row = rows[0];
    const isValid = await verifyPasswordScrypt(password, row.password_hash);
    if (!isValid) {
      await logAuthEvent("login_failed", { userAgent: req.headers["user-agent"], ipAddress: req.ip }, row.id, { email });
      return res.status(401).json({ error: "Неверный email или пароль" });
    }
    const user = mapSqlUserRow(row);
    await issueAuthSession(res, user.id, {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });
    await logAuthEvent("login_success", { userAgent: req.headers["user-agent"], ipAddress: req.ip }, user.id);
    return res.json({ user: sanitizeUser(user) });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const refreshToken = String(req.cookies?.[refreshCookie] || "");
    if (refreshToken) {
      try {
        const payload = await jwtVerifyAsync(refreshToken, jwtSecret);
        if (payload?.jti) {
          await revokeRefreshTokenById(payload.jti);
        }
        await logAuthEvent("logout", { userAgent: req.headers["user-agent"], ipAddress: req.ip }, payload?.sub || null);
      } catch {
        await logAuthEvent("logout_invalid_refresh", { userAgent: req.headers["user-agent"], ipAddress: req.ip });
      }
    }
    clearAuthCookie(res);
    return res.json({ ok: true });
  });

  app.post("/api/auth/logout-all", authMiddleware, async (req, res) => {
    await revokeAllRefreshTokensForUser(req.user.id);
    clearAuthCookie(res);
    await logAuthEvent("logout_all", { userAgent: req.headers["user-agent"], ipAddress: req.ip }, req.user.id);
    return res.json({ ok: true });
  });

  app.post("/api/auth/refresh", refreshLimiter, async (req, res) => {
    const refreshToken = String(req.cookies?.[refreshCookie] || "");
    if (!refreshToken) return res.status(401).json({ error: "Refresh token missing" });
    try {
      const payload = await jwtVerifyAsync(refreshToken, jwtSecret);
      if (payload?.typ !== "refresh" || !payload?.jti) {
        await logAuthEvent("refresh_failed_invalid_payload", { userAgent: req.headers["user-agent"], ipAddress: req.ip }, payload?.sub || null);
        return res.status(401).json({ error: "Invalid refresh token" });
      }
      const tokenHash = hashToken(refreshToken);
      const [rows] = await sqlPool.query(
        `
        SELECT token_id, user_id, token_hash, fingerprint_hash, revoked_at, expires_at
        FROM refresh_tokens
        WHERE token_id = ?
        LIMIT 1
        `,
        [String(payload.jti)]
      );
      if (!Array.isArray(rows) || rows.length === 0) {
        clearAuthCookie(res);
        await logAuthEvent("refresh_failed_revoked", { userAgent: req.headers["user-agent"], ipAddress: req.ip }, payload?.sub || null);
        return res.status(401).json({ error: "Refresh token revoked" });
      }
      const row = rows[0];
      const isExpired = row.expires_at ? new Date(row.expires_at).getTime() < Date.now() : true;
      const reqFingerprint = makeRefreshFingerprint({
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      });
      if (row.fingerprint_hash && String(row.fingerprint_hash) !== reqFingerprint) {
        clearAuthCookie(res);
        refreshFingerprintMismatchTotal.inc();
        await revokeAllRefreshTokensForUser(row.user_id);
        logger.warn({ userId: Number(row.user_id), tokenId: String(row.token_id || "").slice(0, 8) }, "refresh fingerprint mismatch");
        await logAuthEvent("refresh_failed_fingerprint_mismatch", { userAgent: req.headers["user-agent"], ipAddress: req.ip }, row.user_id);
        await enqueueSecurityNotification(row.user_id, "security_alert", {
          reason: "refresh_fingerprint_mismatch",
          ipAddress: String(req.ip || ""),
          userAgent: String(req.headers["user-agent"] || ""),
        });
        return res.status(401).json({ error: "Refresh token invalid" });
      }
      if (row.revoked_at || isExpired || String(row.token_hash) !== tokenHash) {
        clearAuthCookie(res);
        await logAuthEvent(
          "refresh_failed_validation",
          { userAgent: req.headers["user-agent"], ipAddress: req.ip },
          row.user_id,
          { revoked: Boolean(row.revoked_at), expired: isExpired, fingerprintMismatch: false }
        );
        return res.status(401).json({ error: "Refresh token invalid" });
      }
      await revokeRefreshTokenById(payload.jti);
      await issueAuthSession(res, Number(row.user_id), {
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      });
      await logAuthEvent("refresh_success", { userAgent: req.headers["user-agent"], ipAddress: req.ip }, row.user_id);
      return res.json({ ok: true });
    } catch {
      clearAuthCookie(res);
      await logAuthEvent("refresh_failed_expired", { userAgent: req.headers["user-agent"], ipAddress: req.ip });
      return res.status(401).json({ error: "Refresh token expired" });
    }
  });

  /** Всегда 200 — без 401 в консоли браузера при проверке «гость или нет». */
  app.get("/api/auth/session", async (req, res) => {
    const token = String(req.cookies?.[tokenCookie] || "").trim();
    if (!token) return res.json({ user: null });
    try {
      const payload = await jwtVerifyAsync(token, jwtSecret);
      if (payload?.typ !== "access") return res.json({ user: null });
      const user = await getUserById(payload.sub);
      if (!user) return res.json({ user: null });
      return res.json({ user: sanitizeUser(user) });
    } catch {
      return res.json({ user: null });
    }
  });

  app.get("/api/auth/me", authMiddleware, async (req, res) => {
    return res.json({ user: sanitizeUser(req.user) });
  });

  app.post("/api/auth/detect-region", async (req, res) => {
    const phone = normalizePhone(req.body?.phone || "");
    if (!phone || phone.replace(/\D/g, "").length < 11) return res.status(400).json({ error: "Номер слишком короткий" });
    return res.json({ region: phoneRegionHint(phone) });
  });
}

module.exports = {
  registerAuthRoutes,
};
