/**
 * Text rules aligned with ml_service/normalization.normalize_text (DB/catalog sync only).
 * Symptom strings for /predict come exclusively from ML POST /preprocess.
 */
function normalizeDiseaseText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 200);
}

function splitPipeSymptomsForSync(value) {
  return String(value ?? "")
    .split("|")
    .map((item) => normalizeDiseaseText(item))
    .filter(Boolean);
}

module.exports = { normalizeDiseaseText, splitPipeSymptomsForSync };
