#!/usr/bin/env node
/**
 * Запуск uvicorn для ML: предпочитает .venv из корня репозитория (там обычно стоят зависимости из ml-service/requirements.txt).
 * Использование: из корня репозитория — npm run ml:serve
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const candidates = [
  path.join(root, ".venv", "bin", "python"),
  path.join(root, ".venv", "Scripts", "python.exe"),
];
let python = candidates.find((p) => fs.existsSync(p));
if (!python) {
  python = process.platform === "win32" ? "python" : "python3";
  console.warn(
    "ml-serve: .venv не найден, используется системный Python. Если нет uvicorn: python3 -m venv .venv && .venv/bin/pip install -r ml-service/requirements.txt"
  );
}

const env = { ...process.env, PYTHONPATH: path.join(root, "ml-service") };
const child = spawn(
  python,
  ["-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8001"],
  { cwd: root, env, stdio: "inherit" }
);
child.on("exit", (code) => process.exit(code == null ? 0 : code));
