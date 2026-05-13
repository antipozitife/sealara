/**
 * HEIC/HEIF в большинстве браузеров не отображаются в <img>; конвертируем в JPEG через sharp.
 * AVIF/WebP и др. оставляем как есть — поддерживаются современными браузерами.
 */
async function prepareAvatarFile(buf, detected, logger) {
  if (detected.kind !== "heic" && detected.kind !== "heif") {
    return { buf, ext: detected.ext, ok: true };
  }

  let sharpMod;
  try {
    sharpMod = require("sharp");
  } catch {
    logger.info("HEIC/HEIF: sharp не установлен — сохраняем файл как есть");
    return { buf, ext: detected.ext, ok: true };
  }

  try {
    const out = await sharpMod(buf).rotate().jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    return { buf: out, ext: ".jpg", ok: true };
  } catch {
    /** Частый случай: libheif без нужного кодека — не warning, длинный stack не пишем */
    logger.info({ kind: detected.kind }, "HEIC→JPEG в sharp недоступен для этого файла, сохраняем исходный HEIC/HEIF");
    return { buf, ext: detected.ext, ok: true };
  }
}

module.exports = {
  prepareAvatarFile,
};
