#!/usr/bin/env node
/**
 * Exit 0 only if server/generated/ml-client matches git HEAD (for verify:ml-client-contract).
 */
const { execSync } = require("child_process");

const dir = "server/generated/ml-client";

let porcelain;
try {
  porcelain = execSync(`git status --porcelain -- ${dir}`, { encoding: "utf8" }).trim();
} catch {
  console.error("verify:ml-client-contract — git status failed (not a git repo?)");
  process.exit(1);
}

if (porcelain.includes("??")) {
  console.error("\nverify:ml-client-contract — каталог ещё не в git (untracked ??).");
  console.error("Один раз добавьте сгенерированный клиент и закоммитьте:\n");
  console.error(`  git add ${dir}`);
  console.error('  git commit -m "chore: add ML OpenAPI TypeScript client"\n');
  process.exit(1);
}

try {
  execSync(`git diff --exit-code -- ${dir}`, { stdio: "inherit" });
} catch {
  console.error("\nverify:ml-client-contract — сгенерированный клиент отличается от закоммиченного.");
  console.error("С ML на :8001 выполните:\n  npm run generate:ml-client\n  git add server/generated/ml-client\n  git commit -m \"chore: refresh ML OpenAPI client\"\n");
  process.exit(1);
}

const st = execSync(`git status --porcelain -- ${dir}`, { encoding: "utf8" }).trim();
if (st) {
  console.error("\nverify:ml-client-contract — неожиданный статус git под", dir + ":\n" + st);
  process.exit(1);
}
