/**
 * @template T
 * @param {unknown} raw
 * @param {T} fallback
 * @returns {T}
 */
function parseJsonSafe(raw, fallback) {
  try {
    const s = String(raw ?? "").trim();
    if (!s) return fallback;
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

module.exports = { parseJsonSafe };
