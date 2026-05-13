function parseExtraSources(envVar) {
  const list = String(process.env[envVar] || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return list;
}

function parseOrigins(frontendOrigin, publicApiUrl) {
  const list = parseExtraSources("CSP_CONNECT_SRC_EXTRA");
  if (frontendOrigin) list.push(frontendOrigin);
  const pub = String(publicApiUrl || "").trim();
  if (pub) {
    try {
      const u = new URL(pub);
      list.push(`${u.protocol}//${u.host}`);
    } catch {
      // ignore
    }
  }
  return Array.from(new Set(["'self'", ...list]));
}

function imgSources(publicApiUrl) {
  const extra = [...parseExtraSources("CSP_IMG_SRC_EXTRA")];
  const pub = String(publicApiUrl || "").trim();
  if (pub) {
    try {
      const u = new URL(pub);
      extra.push(`${u.protocol}//${u.host}`);
    } catch {
      // ignore invalid PUBLIC_API_URL
    }
  }
  return Array.from(new Set(["'self'", "data:", "blob:", ...extra]));
}

function buildHelmetSecurityConfig(frontendOrigin, publicApiUrl = "") {
  const reportOnly = String(process.env.CSP_REPORT_ONLY || "0").toLowerCase() === "1";
  const coepPolicy = String(process.env.COEP_POLICY || "credentialless").trim() || "credentialless";
  const connectSrc = parseOrigins(frontendOrigin, publicApiUrl);
  const scriptSrc = Array.from(new Set(["'self'", ...parseExtraSources("CSP_SCRIPT_SRC_EXTRA")]));
  const directives = {
    defaultSrc: ["'self'"],
    scriptSrc,
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: imgSources(publicApiUrl),
    connectSrc,
    frameAncestors: ["'none'"],
    upgradeInsecureRequests: [],
  };
  const reportUri = String(process.env.CSP_REPORT_URI || "").trim();
  if (reportUri) {
    directives.reportUri = [reportUri];
  }
  return {
    contentSecurityPolicy: {
      directives,
      reportOnly,
    },
    crossOriginEmbedderPolicy: { policy: coepPolicy },
  };
}

module.exports = {
  buildHelmetSecurityConfig,
};
