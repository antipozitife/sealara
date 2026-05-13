const mysql = require("mysql2/promise");

let pool;

async function getTestPool() {
  if (pool) return pool;
  pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "Sealara",
    waitForConnections: true,
    connectionLimit: 4,
  });
  return pool;
}

async function pingDb() {
  const p = await getTestPool();
  await p.query("SELECT 1 AS ok");
  return true;
}

/** @param {string} email */
async function deleteUserByEmail(email) {
  const p = await getTestPool();
  const em = String(email || "").toLowerCase();
  const [rows] = await p.query("SELECT id FROM users WHERE email = ? LIMIT 1", [em]);
  const id = rows?.[0]?.id;
  if (!id) return;
  await p.query("DELETE FROM users WHERE id = ?", [id]);
}

/**
 * Ensure a disease row exists for doctor confirm FK checks.
 * @param {number} id
 * @param {string} name
 */
async function ensureDisease(id, name = "Integration disease") {
  const p = await getTestPool();
  await p.query(
    `INSERT INTO diseases (id, icd10_code, name, definition, about, diagnosis, treatment, prevention, specialist, prevalence)
     VALUES (?, 'Z00', ?, 'x', 'x', 'x', 'x', 'x', 'x', 0.01)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [id, name]
  );
}

module.exports = { getTestPool, pingDb, deleteUserByEmail, ensureDisease };
