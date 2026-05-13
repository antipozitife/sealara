const { normalizeDiseaseText } = require("./text-diseases.cjs");

function normalizeGender(input) {
  const value = normalizeDiseaseText(input);
  if (value === "м" || value === "male" || value === "мужской") return "м";
  if (value === "ж" || value === "female" || value === "женский") return "ж";
  return "";
}

function normalizePhone(input) {
  const digits = String(input ?? "").replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length >= 11) return `+${digits}`;
  return null;
}

function phoneRegionHint(phone) {
  const digits = String(phone ?? "").replace(/\D+/g, "");
  if (digits.length < 4) return "";
  const normalized = digits.startsWith("7") || digits.startsWith("8") ? digits.slice(1) : digits;
  const code3 = normalized.slice(0, 3);
  if (code3 === "495" || code3 === "499") return "Москва";
  if (code3 === "812") return "Санкт-Петербург";
  if (code3 === "343") return "Екатеринбург";
  if (code3 === "383") return "Новосибирск";
  if (code3 === "391") return "Красноярск";
  if (code3 === "381") return "Омск";
  if (code3 === "863") return "Ростов-на-Дону";
  if (code3 === "846") return "Самара";
  if (code3 === "421") return "Хабаровск";
  if (code3 === "861") return "Краснодар";
  return "";
}

function parseBirthDate(value) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const minYear = 1900;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [yearStr, monthStr, dayStr] = raw.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    if (!Number.isFinite(d.getTime())) return null;
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    if (d > now) return null;
    if (year < minYear || year > currentYear) return null;
    let age = currentYear - year;
    const hadBirthday = now.getMonth() > month - 1 || (now.getMonth() === month - 1 && now.getDate() >= day);
    if (!hadBirthday) age -= 1;
    if (age > 120) return null;
    return raw;
  }
  const ru = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!ru) return null;
  const day = Number(ru[1]);
  const month = Number(ru[2]);
  const year = Number(ru[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < minYear || year > currentYear) return null;
  const date = new Date(year, month - 1, day);
  if (!Number.isFinite(date.getTime())) return null;
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  if (date > now) return null;
  let age = currentYear - year;
  const hadBirthday = now.getMonth() > month - 1 || (now.getMonth() === month - 1 && now.getDate() >= day);
  if (!hadBirthday) age -= 1;
  if (age > 120) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

module.exports = {
  normalizeGender,
  normalizePhone,
  phoneRegionHint,
  parseBirthDate,
};
