/**
 * fix_railway_port_cors_health.cjs
 *
 * 根因：Railway 將流量導去 process.env.PORT，
 * 若 app 寫死 listen(3000) → Application failed to respond
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.log('[railway-fix] server.ts missing');
  process.exit(0);
}

let src = fs.readFileSync(serverPath, 'utf8');
let changes = 0;

// Always re-apply PORT (idempotent)
if (src.includes('const PORT = 3000')) {
  src = src.replace(
    /const PORT = 3000;?/,
    "const PORT = Number(process.env.PORT) || 3000; // RAILWAY_PORT_V2"
  );
  changes++;
  console.log('[railway-fix] PORT -> process.env.PORT');
} else if (!src.includes('process.env.PORT')) {
  // try other patterns
  src = src.replace(
    /const PORT\s*=\s*[^;\n]+/,
    "const PORT = Number(process.env.PORT) || 3000 // RAILWAY_PORT_V2"
  );
  changes++;
}

// Force listen on 0.0.0.0 with clear log
if (src.includes('app.listen(PORT')) {
  const listenRe = /app\.listen\(\s*PORT\s*,\s*["']0\.0\.0\.0["']\s*,\s*\(\)\s*=>\s*\{[^}]*\}\s*\)/;
  if (listenRe.test(src)) {
    src = src.replace(
      listenRe,
      `app.listen(PORT, "0.0.0.0", () => {
    console.log("[Toonflow] Listening on 0.0.0.0:" + PORT + " (Railway PORT=" + (process.env.PORT || "unset") + ")");
  })`
    );
    changes++;
    console.log('[railway-fix] listen log strengthened');
  } else if (src.includes('app.listen(PORT)')) {
    src = src.replace(
      /app\.listen\(\s*PORT\s*\)/,
      `app.listen(PORT, "0.0.0.0", () => {
    console.log("[Toonflow] Listening on 0.0.0.0:" + PORT);
  })`
    );
    changes++;
  }
}

// CORS + health after const app = express();
if (!src.includes("/api/health")) {
  const marker = 'const app = express();';
  const idx = src.indexOf(marker);
  if (idx !== -1) {
    const insert = `
const app = express();

// RAILWAY_PORT_V2 — CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Health check for Railway
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    time: new Date().toISOString(),
    uptime: process.uptime(),
    port: Number(process.env.PORT) || 3000,
    message: 'Toonflow server is alive',
  });
});
`;
    src = src.slice(0, idx) + insert + src.slice(idx + marker.length);
    changes++;
    console.log('[railway-fix] + CORS + /api/health');
  }
}

fs.writeFileSync(serverPath, src, 'utf8');
console.log('[railway-fix] done, changes:', changes);
