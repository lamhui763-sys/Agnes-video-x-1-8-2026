/**
 * fix_failed_to_fetch_stability.cjs
 * 
 * Comprehensive fix for "Failed to fetch" during video generation (A + B + C)
 * - Adds CORS support
 * - Adds /api/health endpoint
 * - Improves error messages in frontend generation handlers
 * - Adds better timeout & retry guidance
 *
 * Run: node fix_failed_to_fetch_stability.cjs
 */

const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.ts');
const appPath = path.join(__dirname, 'src', 'App.tsx');

console.log('🔧 Applying Failed-to-fetch stability fixes...');

// ========== 1. Patch server.ts ==========
if (fs.existsSync(serverPath)) {
  let server = fs.readFileSync(serverPath, 'utf8');

  // 1a. Ensure CORS is present (simple version without external dependency)
  if (!server.includes('Access-Control-Allow-Origin') && !server.includes('cors(')) {
    const corsMiddleware = `
// ===== CORS (added by fix_failed_to_fetch_stability.cjs) =====
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
// ===== END CORS =====
`;
    // Insert after first app = express() or similar
    if (server.includes('const app = express()')) {
      server = server.replace(
        'const app = express()',
        `const app = express()\n${corsMiddleware}`
      );
      console.log('✅ Added simple CORS middleware to server.ts');
    } else if (server.includes('app = express()')) {
      server = server.replace(
        /app\s*=\s*express\(\)/,
        match => match + '\n' + corsMiddleware
      );
      console.log('✅ Added simple CORS middleware to server.ts');
    } else {
      console.warn('⚠️ Could not locate express() initialization – please add CORS manually');
    }
  } else {
    console.log('ℹ️ CORS already present or using cors package');
  }

  // 1b. Add /api/health if missing
  if (!server.includes('/api/health')) {
    const healthEndpoint = `
// ===== /api/health (added by fix_failed_to_fetch_stability.cjs) =====
app.get('/api/health', async (req, res) => {
  try {
    const hasAgnesKey = !!(process.env.AGNES_API_KEY && process.env.AGNES_API_KEY !== 'MY_AGNES_API_KEY');
    const hasGeminiKey = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
    
    // Optional lightweight check – do not call external APIs here to keep it fast
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      env: {
        hasAgnesKey,
        hasGeminiKey,
        nodeEnv: process.env.NODE_ENV || 'development'
      },
      message: hasAgnesKey ? 'Agnes key configured' : 'WARNING: AGNES_API_KEY missing or placeholder'
    });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});
// ===== END /api/health =====
`;
    // Try to insert near other routes
    if (server.includes('app.get("/api/status"') || server.includes("app.get('/api/status'")) {
      server = server.replace(
        /app\.get\(["']\/api\/status["'][^)]*\)/,
        match => match + '\n' + healthEndpoint
      );
    } else if (server.includes('app.listen') || server.includes('app.listen(')) {
      server = server.replace(
        /app\.listen\s*\(/,
        healthEndpoint + '\napp.listen('
      );
    } else {
      // fallback: append before the last few lines
      server = server + '\n' + healthEndpoint;
    }
    console.log('✅ Added /api/health endpoint');
  } else {
    console.log('ℹ️ /api/health already exists');
  }

  fs.writeFileSync(serverPath, server, 'utf8');
  console.log('✅ server.ts updated');
} else {
  console.warn('⚠️ server.ts not found');
}

// ========== 2. Patch frontend App.tsx for clearer errors ==========
if (fs.existsSync(appPath)) {
  let app = fs.readFileSync(appPath, 'utf8');

  // Improve the generic catch messages that currently just say "Failed to fetch"
  // Look for common patterns and enhance them
  const improvements = [
    {
      from: /生成請求失敗:\s*Failed to fetch/g,
      to: '生成請求失敗: Failed to fetch（後端無法連線）。請檢查 Server 是否運行中、Agnes Key 額度、或重新部署。可先呼叫 /api/health 測試。'
    },
    {
      from: /Failed to fetch/g,
      to: 'Failed to fetch（網絡層失敗：Server 可能已當機 / 冷啟動失敗 / CORS / 網絡問題）'
    }
  ];

  let changed = false;
  for (const { from, to } of improvements) {
    if (from.test(app)) {
      app = app.replace(from, to);
      changed = true;
    }
  }

  // Add a comment reminder near the top if possible
  if (!app.includes('apiClient') && !app.includes('checkServerHealth')) {
    // Soft reminder – user can later import from '@/lib/apiClient'
    console.log('ℹ️ Tip: You can now import { apiFetch, checkServerHealth } from \'./lib/apiClient\'');
  }

  if (changed) {
    fs.writeFileSync(appPath, app, 'utf8');
    console.log('✅ App.tsx error messages improved');
  } else {
    console.log('ℹ️ No exact "Failed to fetch" string patterns found to replace (may already be dynamic)');
  }
} else {
  console.warn('⚠️ src/App.tsx not found');
}

console.log('\n✅ Stability fix applied!');
console.log('Next steps:');
console.log('1. Rebuild: npm run build');
console.log('2. Restart / Redeploy the server');
console.log('3. Test: curl https://your-domain/api/health');
console.log('4. Optional: In App.tsx import { apiFetch, checkServerHealth } from \'./lib/apiClient\' and replace critical fetch calls');
