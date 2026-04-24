/**
 * Читает Database/deseases.xlsx и пишет src/data/whyCarouselDiseases.json
 * для карусели на главной. Запуск: npm run generate:why-carousel
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const root = path.resolve(__dirname, "..");
const xlsxPath = path.join(root, "Database", "deseases.xlsx");
const outPath = path.join(root, "src", "data", "whyCarouselDiseases.json");

function excerptAfterDash(def) {
  const s = String(def ?? "").trim();
  const m = s.match(/[-–—]/u);
  if (!m || m.index === undefined) return s;
  return s.slice(m.index + m[0].length).trim();
}

const wb = XLSX.readFile(xlsxPath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

const list = rows
  .map((row) => {
    const id = Number(row["№"]);
    const disease = String(row["болезнь"] ?? "").trim();
    const excerpt = excerptAfterDash(row["определение"]);
    return { id: Number.isFinite(id) ? id : 0, disease, excerpt };
  })
  .filter((x) => x.disease.length > 0 && x.id > 0);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(list, null, 2), "utf8");
console.log(`Wrote ${list.length} rows -> ${path.relative(root, outPath)}`);
