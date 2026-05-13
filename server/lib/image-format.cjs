/**
 * Определяет тип изображения по сигнатуре файла (не по заголовку клиента).
 */
function detectImageFormat(buf) {
  if (!buf || buf.length < 4) return null;

  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { kind: "jpeg", ext: ".jpg" };
  }

  const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buf.length >= 8 && buf.subarray(0, 8).equals(pngSig)) {
    return { kind: "png", ext: ".png" };
  }

  const gifHdr = buf.subarray(0, 6).toString("ascii");
  if (gifHdr === "GIF87a" || gifHdr === "GIF89a") {
    return { kind: "gif", ext: ".gif" };
  }

  if (buf.length >= 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") {
    return { kind: "webp", ext: ".webp" };
  }

  if (buf[0] === 0x42 && buf[1] === 0x4d) {
    return { kind: "bmp", ext: ".bmp" };
  }

  if (
    (buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
    (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a)
  ) {
    return { kind: "tiff", ext: ".tif" };
  }

  if (buf.length >= 4 && buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) {
    return { kind: "ico", ext: ".ico" };
  }

  if (buf.length >= 12 && buf.subarray(4, 8).toString() === "ftyp") {
    const brand = buf
      .subarray(8, 12)
      .toString("ascii")
      .replace(/\0/g, "")
      .toLowerCase();
    const ISO_IMAGE_BRANDS = new Set([
      "avif",
      "avis",
      "heic",
      "heix",
      "hevc",
      "hevx",
      "mif1",
      "msf1",
      "jpg ",
      "jpeg",
      "png ",
    ]);
    if (brand.startsWith("avif") || brand === "avis") {
      return { kind: "avif", ext: ".avif" };
    }
    if (
      brand.startsWith("heic") ||
      brand.startsWith("heix") ||
      brand.startsWith("hevc") ||
      brand.startsWith("hevx") ||
      brand === "mif1" ||
      brand === "msf1"
    ) {
      return { kind: "heic", ext: ".heic" };
    }
    if (ISO_IMAGE_BRANDS.has(brand)) {
      return { kind: "heif", ext: ".heif" };
    }
  }

  if (buf.length >= 12 && buf[4] === 0x6a && buf[5] === 0x50 && buf[6] === 0x20 && buf[7] === 0x20) {
    return { kind: "jp2", ext: ".jp2" };
  }

  if (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "8BPS") {
    return { kind: "psd", ext: ".psd" };
  }

  const scanLen = Math.min(buf.length, 8192);
  let text = buf.slice(0, scanLen).toString("utf8").trimStart();
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  if (/^<\?xml/i.test(text) || /^<svg[\s>/]/i.test(text)) {
    return { kind: "svg", ext: ".svg" };
  }

  return null;
}

module.exports = {
  detectImageFormat,
};
