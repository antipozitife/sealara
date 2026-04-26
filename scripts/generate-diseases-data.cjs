/**
 * Читает Database/deseases.xlsx и пишет src/data/diseases.json
 * для страницы заболеваний и карточки болезни.
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const root = path.resolve(__dirname, "..");
const xlsxPath = path.join(root, "Database", "deseases.xlsx");
const outPath = path.join(root, "src", "data", "diseases.json");

function asText(v) {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function getHeaders(sheet) {
  const firstRow = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })[0] || [];
  return firstRow.map((h) => asText(h));
}

function getHyperlink(sheet, rowIndex1Based, colIndex1Based) {
  const ref = XLSX.utils.encode_cell({ r: rowIndex1Based - 1, c: colIndex1Based - 1 });
  const cell = sheet[ref];
  if (!cell || !cell.l || !cell.l.Target) return "";
  return asText(cell.l.Target);
}

function normalizeImageLink(text) {
  const s = asText(text);
  if (!s || s === "-") return "";
  return s;
}

const wb = XLSX.readFile(xlsxPath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
const headers = getHeaders(sheet);
const imageCol = headers.findIndex((h) => h.toLowerCase() === "картинка");

const list = rows
  .map((row, idx) => {
    const id = Number(row["№"]);
    const name = asText(row["болезнь"]);
    const definition = asText(row["определение"]);

    let image = normalizeImageLink(row["картинка"]);
    if (!image && imageCol >= 0) {
      const rowNumber = idx + 2;
      image = normalizeImageLink(getHyperlink(sheet, rowNumber, imageCol + 1));
    }

    const raw = { ...row };
    if (image) raw["картинка"] = image;

    return {
      id: Number.isFinite(id) ? id : 0,
      name,
      definition,
      raw,
    };
  })
  .filter((x) => x.id > 0 && x.name.length > 0);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(list, null, 2), "utf8");
console.log(`Wrote ${list.length} rows -> ${path.relative(root, outPath)}`);
