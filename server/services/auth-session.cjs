const jwt = require("jsonwebtoken");
const crypto = require("crypto");

function createAuthSessionService({
  sqlPool,
  jwtSecret,
  accessTokenTtl,
  refreshTokenTtlDays,
  isProduction,
  tokenCookie,
  refreshCookie,
  refreshFingerprintPepper,
  authRepository,
}) {
  function issueAccessToken(userId) {
    return jwt.sign({ sub: userId, typ: "access" }, jwtSecret, { expiresIn: accessTokenTtl });
  }

  function issueRefreshToken(userId) {
    const tokenId = crypto.randomUUID();
    const token = jwt.sign({ sub: userId, typ: "refresh", jti: tokenId }, jwtSecret, {
      expiresIn: `${refreshTokenTtlDays}d`,
    });
    return { token, tokenId };
  }

  function setAuthCookie(res, token) {
    res.cookie(tokenCookie, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: isProduction,
      maxAge: 15 * 60 * 1000,
    });
  }

  function setRefreshCookie(res, token) {
    res.cookie(refreshCookie, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: isProduction,
      maxAge: refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    });
  }

  function clearAuthCookie(res) {
    res.clearCookie(tokenCookie, {
      httpOnly: true,
      sameSite: "strict",
      secure: isProduction,
    });
    res.clearCookie(refreshCookie, {
      httpOnly: true,
      sameSite: "strict",
      secure: isProduction,
    });
  }

  function hashToken(token) {
    return crypto.createHash("sha256").update(String(token)).digest("hex");
  }

  function makeRefreshFingerprint(reqMeta = {}) {
    const userAgent = String(reqMeta.userAgent || "").slice(0, 500);
    return crypto.createHash("sha256").update(`${userAgent}|${refreshFingerprintPepper}`).digest("hex");
  }

  async function issueAuthSession(res, userId, reqMeta = {}) {
    const connection = await sqlPool.getConnection();
    try {
      await connection.beginTransaction();
      const accessToken = issueAccessToken(userId);
      const { token: refreshToken, tokenId } = issueRefreshToken(userId);
      await authRepository.persistRefreshTokenInConnection(connection, userId, refreshToken, tokenId, reqMeta);
      await authRepository.pruneActiveRefreshTokensByDate(connection, userId);
      await connection.commit();
      setAuthCookie(res, accessToken);
      setRefreshCookie(res, refreshToken);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  return {
    issueAccessToken,
    issueRefreshToken,
    setAuthCookie,
    setRefreshCookie,
    clearAuthCookie,
    hashToken,
    makeRefreshFingerprint,
    issueAuthSession,
  };
}

module.exports = {
  createAuthSessionService,
};
