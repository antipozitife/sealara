const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { detectImageFormat } = require("../lib/image-format.cjs");
const { prepareAvatarFile } = require("../lib/avatar-transcode.cjs");

const UPLOADS_ROOT = path.join(__dirname, "..", "..", "uploads");
const AVATARS_DIR = path.join(UPLOADS_ROOT, "avatars");

function ensureAvatarDirs() {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

function safeUnlinkAvatar(publicUrlPath, logger) {
  if (!publicUrlPath || typeof publicUrlPath !== "string") return;
  if (!publicUrlPath.startsWith("/uploads/avatars/")) return;
  const base = path.basename(publicUrlPath);
  if (!base || base.includes("..")) return;
  const full = path.join(AVATARS_DIR, base);
  const resolvedDir = path.resolve(AVATARS_DIR);
  if (!full.startsWith(resolvedDir)) return;
  fs.unlink(full, (err) => {
    if (err && err.code !== "ENOENT") {
      logger.warn({ err: String(err?.message || err), full }, "avatar file unlink failed");
    }
  });
}

function registerProfileRoutes(app, deps) {
  const {
    authMiddleware,
    validateBody,
    profileUpdateSchema,
    avatarUploadSchema,
    avatarMaxBytes = 15 * 1024 * 1024,
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
  } = deps;

  app.post("/api/profile/avatar", authMiddleware, validateBody(avatarUploadSchema), async (req, res) => {
    const userId = Number(req.user.id);
    let buf;
    try {
      buf = Buffer.from(String(req.body?.data || ""), "base64");
    } catch {
      return res.status(400).json({ error: "Некорректные данные изображения" });
    }
    if (buf.length === 0) {
      return res.status(400).json({ error: "Пустой файл" });
    }
    if (buf.length > avatarMaxBytes) {
      const mb = Math.max(1, Math.round(avatarMaxBytes / (1024 * 1024)));
      return res.status(413).json({ error: `Размер файла не больше ${mb} МБ` });
    }
    const detected = detectImageFormat(buf);
    if (!detected) {
      return res.status(400).json({
        error:
          "Не удалось распознать изображение по содержимому файла (JPEG, PNG, GIF, WebP, BMP, TIFF, ICO, SVG, AVIF, HEIC, JP2, PSD и др.)",
      });
    }

    let prepared = await prepareAvatarFile(buf, detected, logger);
    /** Явно только ok === false; без поля ok не считаем ошибкой (избегаем ложного 415). */
    if (prepared.ok === false) {
      logger.warn(
        { msg: prepared.message, kind: detected.kind },
        "prepareAvatarFile: конвертация не удалась — сохраняем исходный файл"
      );
      prepared = { buf, ext: detected.ext, ok: true };
    }

    const filename = `${userId}-${crypto.randomUUID()}${prepared.ext}`;
    ensureAvatarDirs();
    const fullPath = path.join(AVATARS_DIR, filename);
    const publicUrl = `/uploads/avatars/${filename}`;
    try {
      await fs.promises.writeFile(fullPath, prepared.buf);
      await fs.promises.access(fullPath, fs.constants.R_OK);
    } catch (error) {
      logger.error({ error: String(error?.message || error), fullPath }, "avatar write or verify failed");
      return res.status(500).json({ error: "Не удалось сохранить файл" });
    }

    const connection = await sqlPool.getConnection();
    try {
      const [prevRows] = await connection.query("SELECT avatar_url FROM users WHERE id = ? LIMIT 1", [userId]);
      const previousUrl =
        Array.isArray(prevRows) && prevRows[0]?.avatar_url ? String(prevRows[0].avatar_url) : "";
      await connection.query("UPDATE users SET avatar_url = ? WHERE id = ?", [publicUrl, userId]);
      if (previousUrl && previousUrl !== publicUrl) {
        safeUnlinkAvatar(previousUrl, logger);
      }
    } catch (error) {
      logger.error({ error: String(error?.message || error) }, "Avatar upload DB update failed");
      await fs.promises.unlink(fullPath).catch(() => {});
      return res.status(500).json({ error: "Не удалось сохранить фото" });
    } finally {
      connection.release();
    }
    const refreshed = await getUserById(userId);
    if (refreshed) req.user = refreshed;
    return res.status(201).json({ profile: (refreshed || req.user).profile });
  });

  app.delete("/api/profile/avatar", authMiddleware, async (req, res) => {
    const userId = Number(req.user.id);
    const connection = await sqlPool.getConnection();
    let previousUrl = "";
    try {
      const [prevRows] = await connection.query("SELECT avatar_url FROM users WHERE id = ? LIMIT 1", [userId]);
      if (Array.isArray(prevRows) && prevRows[0]?.avatar_url) {
        previousUrl = String(prevRows[0].avatar_url);
      }
      await connection.query("UPDATE users SET avatar_url = NULL WHERE id = ?", [userId]);
    } catch (error) {
      logger.error({ error: String(error?.message || error) }, "Avatar delete failed");
      return res.status(500).json({ error: "Не удалось удалить фото" });
    } finally {
      connection.release();
    }
    if (previousUrl) safeUnlinkAvatar(previousUrl, logger);
    const refreshed = await getUserById(userId);
    if (refreshed) req.user = refreshed;
    return res.json({ profile: (refreshed || req.user).profile });
  });

  app.put("/api/profile", authMiddleware, validateBody(profileUpdateSchema), async (req, res) => {
    const payload = req.body || {};
    const newPassword = String(payload.newPassword ?? "").trim();
    const currentPassword = String(payload.currentPassword ?? "").trim();

    const profilePatch = {
      surname: payload.surname ?? payload.profile?.surname,
      name: payload.firstName ?? payload.name ?? payload.profile?.firstName,
      patronymic: payload.middleName ?? payload.patronymic ?? payload.profile?.middleName,
      birth_date: parseBirthDate(payload.birthDate ?? payload.profile?.birthDate) || undefined,
      gender: normalizeGender(payload.gender ?? payload.profile?.gender) || undefined,
      phone: normalizePhone(payload.phone ?? payload.profile?.phone) || undefined,
      region: String(payload.region ?? payload.profile?.region ?? "").trim() || undefined,
    };

    const connection = await sqlPool.getConnection();
    try {
      await connection.beginTransaction();

      if (newPassword) {
        if (newPassword.length < 8) {
          await connection.rollback();
          return res.status(400).json({ error: "Новый пароль должен быть не короче 8 символов" });
        }
        if (!currentPassword) {
          await connection.rollback();
          return res.status(400).json({ error: "Укажите текущий пароль (currentPassword)" });
        }
        const [credRows] = await connection.query(
          "SELECT password_hash FROM user_credentials WHERE user_id = ? LIMIT 1",
          [Number(req.user.id)]
        );
        if (!Array.isArray(credRows) || credRows.length === 0) {
          await connection.rollback();
          return res.status(400).json({ error: "Учётные данные не найдены" });
        }
        const ok = await verifyPasswordScrypt(currentPassword, credRows[0].password_hash);
        if (!ok) {
          await connection.rollback();
          return res.status(401).json({ error: "Неверный текущий пароль" });
        }
        const nextHash = await hashPasswordScrypt(newPassword);
        await connection.query("UPDATE user_credentials SET password_hash = ? WHERE user_id = ?", [nextHash, Number(req.user.id)]);
      }

      const [currentRows] = await connection.query(
        "SELECT id, surname, name, patronymic, birth_date, gender, phone, email, region, is_doctor, avatar_url, created_at FROM users WHERE id = ? LIMIT 1",
        [Number(req.user.id)]
      );
      if (!Array.isArray(currentRows) || currentRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: "Пользователь не найден" });
      }
      const current = currentRows[0];
      await connection.query(
        `
        UPDATE users
        SET surname = ?, name = ?, patronymic = ?, birth_date = ?, gender = ?, phone = ?, region = ?
        WHERE id = ?
        `,
        [
          profilePatch.surname ?? current.surname,
          profilePatch.name ?? current.name,
          profilePatch.patronymic ?? current.patronymic,
          profilePatch.birth_date ?? current.birth_date,
          profilePatch.gender ?? current.gender,
          profilePatch.phone ?? current.phone,
          profilePatch.region ?? current.region,
          Number(req.user.id),
        ]
      );
      const [updatedRows] = await connection.query(
        "SELECT id, surname, name, patronymic, birth_date, gender, phone, email, region, is_doctor, avatar_url, created_at FROM users WHERE id = ? LIMIT 1",
        [Number(req.user.id)]
      );
      const mapped = mapSqlUserRow(updatedRows[0]);
      await connection.commit();
      const refreshed = await getUserById(Number(req.user.id));
      if (refreshed) {
        req.user = refreshed;
      }
      if (newPassword) {
        await revokeAllRefreshTokensForUser(req.user.id);
        await issueAuthSession(res, Number(req.user.id), {
          userAgent: req.headers["user-agent"],
          ipAddress: req.ip,
        });
      }
      return res.json({ profile: (refreshed || mapped).profile });
    } catch (error) {
      await connection.rollback();
      logger.error({ error: String(error?.message || error) }, "Profile update failed");
      return res.status(500).json({ error: "Не удалось обновить профиль" });
    } finally {
      connection.release();
    }
  });
}

module.exports = {
  registerProfileRoutes,
};
