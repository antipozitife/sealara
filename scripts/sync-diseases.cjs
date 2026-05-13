#!/usr/bin/env node
/**
 * Copies src/data/diseases.json → ml-service/data/diseases.json so ML can read a stable path in Docker.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const src = path.join(root, "src", "data", "diseases.json");
const destDir = path.join(root, "ml-service", "data");
const dest = path.join(destDir, "diseases.json");

if (!fs.existsSync(src)) {
  console.error("sync-diseases: missing", src);
  process.exit(1);
}
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log("sync-diseases:", dest, "<-", src);
