const fs = require("fs");
const path = require("path");

const AVATARS_DIR = path.join(__dirname, "..", "..", "uploads", "avatars");

/** Абсолютный URL для CDN/отдельного домена API (PUBLIC_API_URL в окружении). */
function resolvePublicAvatarUrl(stored) {
  if (!stored) return "";
  let s = String(stored).trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (!s.startsWith("/")) {
    s = `/${s}`;
  }
  const base = String(process.env.PUBLIC_API_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (!base) return s;
  return `${base}${s}`;
}

function pathnameFromStoredAvatarUrl(stored) {
  if (!stored) return "";
  let s = String(stored).trim();
  if (/^https?:\/\//i.test(s)) {
    try {
      return new URL(s).pathname;
    } catch {
      return "";
    }
  }
  return s.startsWith("/") ? s : `/${s}`;
}

function safeLocalAvatarPath(stored) {
  const pathname = pathnameFromStoredAvatarUrl(stored);
  const prefix = "/uploads/avatars/";
  if (!pathname.startsWith(prefix)) return null;
  const base = path.basename(pathname);
  if (!base || base.includes("..")) return null;
  const full = path.join(AVATARS_DIR, base);
  const resolvedDir = path.resolve(AVATARS_DIR);
  if (!full.startsWith(resolvedDir)) return null;
  return full;
}

/**
 * Если файла аватара нет на локальном диске — обнуляем avatar_url (устраняет вечный GET 404).
 * Не вызывается при заданном PUBLIC_API_URL (файлы могут быть на другом хосте/CDN).
 */
async function clearStaleAvatarUrlIfFileMissing(sqlPool, row) {
  if (String(process.env.PUBLIC_API_URL || "").trim()) {
    return row;
  }
  const uid = Number(row.id);
  if (!Number.isFinite(uid) || uid <= 0) return row;
  const stored = row.avatar_url;
  if (!stored) return row;
  const localPath = safeLocalAvatarPath(stored);
  if (!localPath || fs.existsSync(localPath)) return row;
  await sqlPool.query("UPDATE users SET avatar_url = NULL WHERE id = ?", [uid]);
  return { ...row, avatar_url: null };
}

function mapSqlUserRow(row) {
  return {
    id: String(row.id),
    email: String(row.email || ""),
    name: `${String(row.surname || "").trim()} ${String(row.name || "").trim()}`.trim(),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    profile: {
      surname: String(row.surname || ""),
      firstName: String(row.name || ""),
      middleName: String(row.patronymic || ""),
      birthDate: row.birth_date ? new Date(row.birth_date).toISOString().slice(0, 10) : "",
      gender: String(row.gender || ""),
      phone: String(row.phone || ""),
      region: String(row.region || ""),
      isDoctor: Boolean(row.is_doctor),
      avatarUrl: resolvePublicAvatarUrl(row.avatar_url),
    },
    recentQueries: [],
  };
}

function createAuthRepository({ sqlPool, refreshTokenTtlDays, refreshTokenLimit, hashToken, makeRefreshFingerprint }) {
  async function getUserById(id) {
    const [rows] = await sqlPool.query(
      `
      SELECT id, surname, name, patronymic, birth_date, gender, phone, email, region, is_doctor, avatar_url, created_at
      FROM users WHERE id = ? LIMIT 1
      `,
      [Number(id)]
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const cleaned = await clearStaleAvatarUrlIfFileMissing(sqlPool, rows[0]);
    return mapSqlUserRow(cleaned);
  }

  async function persistRefreshTokenInConnection(connection, userId, refreshToken, tokenId, reqMeta = {}) {
    const tokenHash = hashToken(refreshToken);
    const userAgent = String(reqMeta.userAgent || "").slice(0, 500) || null;
    const ipAddress = String(reqMeta.ipAddress || "").slice(0, 64) || null;
    const fingerprintHash = makeRefreshFingerprint(reqMeta);
    await connection.query(
      `
      INSERT INTO refresh_tokens (token_id, user_id, token_hash, user_agent, ip_address, fingerprint_hash, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))
      `,
      [tokenId, Number(userId), tokenHash, userAgent, ipAddress, fingerprintHash, refreshTokenTtlDays]
    );
  }

  async function pruneActiveRefreshTokensByDate(connection, userId) {
    const uid = Number(userId);
    if (!Number.isFinite(uid) || uid <= 0 || !refreshTokenLimit) return;
    const [rows] = await connection.query(
      `SELECT created_at
       FROM refresh_tokens
       WHERE user_id = ? AND revoked_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1 OFFSET ?`,
      [uid, refreshTokenLimit - 1]
    );
    if (!Array.isArray(rows) || rows.length === 0) return;
    const threshold = rows[0].created_at;
    await connection.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = ? AND revoked_at IS NULL AND created_at < ?`,
      [uid, threshold]
    );
  }

  async function revokeRefreshTokenById(tokenId) {
    await sqlPool.query(
      `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE token_id = ? AND revoked_at IS NULL
      `,
      [String(tokenId)]
    );
  }

  async function revokeAllRefreshTokensForUser(userId) {
    const uid = Number(userId);
    if (!Number.isFinite(uid) || uid <= 0) return;
    await sqlPool.query(
      `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE user_id = ? AND revoked_at IS NULL
      `,
      [uid]
    );
  }

  return {
    mapSqlUserRow,
    getUserById,
    persistRefreshTokenInConnection,
    pruneActiveRefreshTokensByDate,
    revokeRefreshTokenById,
    revokeAllRefreshTokensForUser,
  };
}

module.exports = {
  createAuthRepository,
  mapSqlUserRow,
};
