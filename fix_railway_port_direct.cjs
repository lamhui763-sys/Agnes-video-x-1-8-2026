/**
 * Direct permanent patch of server.ts — do not rely only on fragile regex.
 * Root cause of Railway "Application failed to respond":
 *   const PORT = 3000  → app listens 3000, Railway routes to $PORT (e.g. 8080)
 */
const fs = require('fs');
const path = require('path');
const p = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(p)) {
  console.error('server.ts not found');
  process.exit(1);
}
let s = fs.readFileSync(p, 'utf8');

// 1) PORT
const before = s;
s = s.replace(
  /const PORT = 3000;?/,
  'const PORT = Number(process.env.PORT) || 3000;'
);
if (s === before) {
  // already patched or different format
  if (!s.includes('process.env.PORT')) {
    console.error('PORT line not found — abort');
    process.exit(1);
  }
  console.log('PORT already uses process.env.PORT');
} else {
  console.log('Patched: const PORT = Number(process.env.PORT) || 3000');
}

// 2) CORS + health if missing
if (!s.includes("/api/health")) {
  s = s.replace(
    'const app = express();\nconst PORT',
    `const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', port: Number(process.env.PORT) || 3000, uptime: process.uptime() });
});

const PORT`
  );
  console.log('Inserted CORS + /api/health');
}

// 3) Listen log
s = s.replace(
  'console.log(`Server running on http://localhost:${PORT}`);',
  'console.log("[Toonflow] Listening 0.0.0.0:" + PORT + " env.PORT=" + (process.env.PORT || "unset"));'
);

fs.writeFileSync(p, s);
console.log('server.ts written OK');
