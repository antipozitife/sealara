const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = Number(process.env.PORT || 3001);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const JWT_SECRET = process.env.JWT_SECRET || "sealara-dev-secret";
const TOKEN_COOKIE = "sealara_token";
const USERS_DB_PATH = path.join(__dirname, "data", "users.json");

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);

async function ensureDb() {
  const dir = path.dirname(USERS_DB_PATH);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(USERS_DB_PATH);
  } catch {
    await fs.writeFile(USERS_DB_PATH, "[]", "utf8");
  }
}

async function readUsers() {
  await ensureDb();
  const raw = await fs.readFile(USERS_DB_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeUsers(users) {
  await fs.writeFile(USERS_DB_PATH, JSON.stringify(users, null, 2), "utf8");
}

function issueToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "7d" });
}

function setAuthCookie(res, token) {
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(TOKEN_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
  });
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    profile: user.profile,
    recentQueries: user.recentQueries,
  };
}

async function getUserById(id) {
  const users = await readUsers();
  return users.find((u) => u.id === id);
}

async function authMiddleware(req, res, next) {
  const token = req.cookies[TOKEN_COOKIE];
  if (!token) return res.status(401).json({ error: "Не авторизован" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await getUserById(payload.sub);
    if (!user) return res.status(401).json({ error: "Пользователь не найден" });
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: "Сессия истекла" });
  }
}

app.get("/api/health", (_, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/register", async (req, res) => {
  const { email, password, name } = req.body || {};

  if (!email || !password || !name) {
    return res.status(400).json({ error: "Заполните имя, email и пароль" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "Пароль должен быть не короче 6 символов" });
  }

  const users = await readUsers();
  const normalizedEmail = String(email).trim().toLowerCase();
  const exists = users.some((u) => u.email.toLowerCase() === normalizedEmail);
  if (exists) return res.status(409).json({ error: "Пользователь с таким email уже существует" });

  const passwordHash = await bcrypt.hash(String(password), 10);
  const user = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    passwordHash,
    name: String(name).trim(),
    createdAt: new Date().toISOString(),
    profile: {
      surname: "",
      firstName: "",
      middleName: "",
      birthDate: "",
      gender: "",
      phone: "",
      region: "",
    },
    recentQueries: [
      "Боль в горле и повышенная температура",
      "Головная боль и усталость",
      "Сухой кашель более 5 дней",
    ],
  };

  users.push(user);
  await writeUsers(users);

  setAuthCookie(res, issueToken(user.id));
  return res.status(201).json({ user: sanitizeUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Введите email и пароль" });

  const users = await readUsers();
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = users.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (!user) return res.status(401).json({ error: "Неверный email или пароль" });

  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Неверный email или пароль" });

  setAuthCookie(res, issueToken(user.id));
  return res.json({ user: sanitizeUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

app.get("/api/profile", authMiddleware, async (req, res) => {
  res.json({ profile: req.user.profile, recentQueries: req.user.recentQueries });
});

app.put("/api/profile", authMiddleware, async (req, res) => {
  const allowed = ["surname", "firstName", "middleName", "birthDate", "gender", "phone", "region"];
  const nextProfile = { ...req.user.profile };

  for (const key of allowed) {
    if (key in (req.body || {})) {
      nextProfile[key] = String(req.body[key] || "");
    }
  }

  const users = await readUsers();
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: "Пользователь не найден" });

  users[idx] = { ...users[idx], profile: nextProfile };
  await writeUsers(users);

  res.json({ profile: nextProfile });
});

app.listen(PORT, async () => {
  await ensureDb();
  console.log(`Sealara API running on http://localhost:${PORT}`);
});
