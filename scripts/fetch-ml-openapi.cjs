#!/usr/bin/env node
/**
 * Downloads ML OpenAPI schema for openapi-typescript-codegen.
 * - CI: ML allows GET /openapi.json without a key (see APIKeyMiddleware).
 * - Local: if you still see 401, export ML_API_KEY and restart ML, or this script retries with the header.
 */
const fs = require("fs");
const http = require("http");

const outPath = process.argv[2] || ".openapi-sealara.tmp.json";

function fetchOnce(headers, cb) {
  const req = http.request(
    {
      hostname: "127.0.0.1",
      port: 8001,
      path: "/openapi.json",
      method: "GET",
      headers: headers || {},
    },
    (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        cb(res.statusCode || 0, body);
      });
    }
  );
  req.on("error", (err) => cb(-1, String(err.message || err)));
  req.setTimeout(15_000, () => {
    req.destroy();
    cb(-2, "timeout");
  });
  req.end();
}

fetchOnce({}, (code, body) => {
  if (code === 200 && body.trim().startsWith("{")) {
    fs.writeFileSync(outPath, body, "utf8");
    console.log(`fetch-ml-openapi: wrote ${outPath} (${body.length} bytes)`);
    return;
  }

  const key = String(process.env.ML_API_KEY || "").trim();
  if (code === 401 && key) {
    fetchOnce({ "x-api-key": key }, (code2, body2) => {
      if (code2 === 200 && body2.trim().startsWith("{")) {
        fs.writeFileSync(outPath, body2, "utf8");
        console.log(`fetch-ml-openapi: wrote ${outPath} (${body2.length} bytes, with ML_API_KEY)`);
        return;
      }
      console.error(`fetch-ml-openapi: HTTP ${code2} after retry with ML_API_KEY`);
      process.exit(1);
    });
    return;
  }

  if (code === -1) {
    console.error("fetch-ml-openapi: cannot connect to http://127.0.0.1:8001 — start ML: npm run ml:serve");
    console.error(body);
    process.exit(1);
  }
  if (code === -2) {
    console.error("fetch-ml-openapi: request timed out");
    process.exit(1);
  }
  if (code === 401) {
    console.error(
      "fetch-ml-openapi: GET /openapi.json returned 401 without ML_API_KEY.\n" +
        "  Fix: pull latest ml-service/app.py (OpenAPI exempt from API key) and restart ML, or run:\n" +
        "  ML_API_KEY=your-key npm run generate:ml-client"
    );
    process.exit(1);
  }
  console.error(`fetch-ml-openapi: unexpected HTTP ${code} (body starts: ${body.slice(0, 120)}…)`);
  process.exit(1);
});
