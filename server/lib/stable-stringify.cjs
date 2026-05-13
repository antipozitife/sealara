const crypto = require("crypto");

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function makePredictionCacheKey(symptoms, profile, answers, round) {
  const list = Array.isArray(symptoms) ? [...symptoms].filter(Boolean).sort() : [];
  const payload = stableStringify({
    symptoms: list,
    profile: profile || {},
    answers: answers || {},
    round: Number(round) || 1,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

module.exports = { stableStringify, makePredictionCacheKey };
