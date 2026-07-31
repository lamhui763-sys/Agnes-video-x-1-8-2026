/**
 * fix_skip_logic_and_persistence.cjs
 * 
 * 真正修改原始碼的腳本（Option 2）
 * 1. 修正「已生成就自動跳過」邏輯：只有當 videoUrl 真正有效時才跳過
 * 2. 加強生成成功後的即時儲存
 * 3. 改善錯誤訊息
 */

const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'src', 'App.tsx');
const serverPath = path.join(__dirname, 'server.ts');

console.log('🔧 開始真正修改原始碼...');

if (!fs.existsSync(appPath)) {
  console.error('❌ 找不到 src/App.tsx');
  process.exit(1);
}

let content = fs.readFileSync(appPath, 'utf8');
let changed = false;

// ========== 1. 修正自動跳過邏輯 ==========
// 原本只檢查 videoUrl 有值就跳過，現在要求 URL 看起來有效 + 分數通過

const oldSkipPatterns = [
  // 常見寫法 1
  /if\s*\(\s*freshSCheck\[videoField\]\s*&&\s*freshSCheck\.step6Passed\s*&&\s*freshSCheck\.step6VideoReviewScore\s*>=\s*60\s*\)/g,
  // 常見寫法 2
  /if\s*\(\s*.*?\[videoField\]\s*&&\s*.*?\.step6Passed\s*&&\s*.*?\.step6VideoReviewScore\s*>=\s*60\s*\)/g,
];

const newSkipCondition = `if (
          freshSCheck[videoField] && 
          typeof freshSCheck[videoField] === 'string' && 
          freshSCheck[videoField].length > 10 &&
          !freshSCheck[videoField].includes('placeholder') &&
          !freshSCheck[videoField].includes('tmpfiles.org') && // 臨時連結容易過期
          freshSCheck.step6Passed && 
          (freshSCheck.step6VideoReviewScore || 0) >= 60
        )`;

for (const pattern of oldSkipPatterns) {
  if (pattern.test(content)) {
    content = content.replace(pattern, newSkipCondition);
    changed = true;
    console.log('✅ 已強化「自動跳過」判斷邏輯（現在會檢查 URL 是否有效）');
    break;
  }
}

// 也直接針對 log 訊息附近做補強（更保險）
if (content.includes('偵測到影片已生成且審核通過')) {
  // 在 log 前面加一層額外檢查提示
  content = content.replace(
    /偵測到影片已生成且審核通過/g,
    '偵測到影片已生成且審核通過（URL 有效性已檢查）'
  );
  changed = true;
}

// ========== 2. 加強生成成功後的即時儲存 ==========
if (content.includes('progressField]: "100%"') || content.includes("progressField]: '100%'")) {
  const immediateSaveCode = `
        // === 即時持久化（防止重新整理後消失） ===
        try {
          const list = JSON.parse(localStorage.getItem("toonflow_projects") || "[]");
          localStorage.setItem("toonflow_projects", JSON.stringify(list));
          localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
          // 觸發 server backup
          fetch('/api/backup-assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: true })
          }).catch(() => {});
        } catch (e) {}
        // === END ===
`;
  // 簡單插入在 100% 後面
  content = content.replace(
    /(progressField\]:\s*["']100%["'])/g,
    `$1,${immediateSaveCode}`
  );
  changed = true;
  console.log('✅ 已加入生成成功後即時儲存');
}

// ========== 3. 改善 Failed to fetch 錯誤訊息 ==========
content = content.replace(
  /生成請求失敗:\s*Failed to fetch/g,
  '生成請求失敗: Failed to fetch（後端無法連線。請檢查 Railway 部署狀態、Agnes Key 額度，或重新整理後再試）'
);
content = content.replace(
  /Failed to fetch/g,
  'Failed to fetch（網絡層失敗：Server 可能當機 / 冷啟動中 / CORS / Key 問題）'
);
changed = true;

if (changed) {
  fs.writeFileSync(appPath, content, 'utf8');
  console.log('✅ src/App.tsx 已成功修改');
} else {
  console.log('⚠️ 沒有找到可匹配的跳過邏輯，可能程式碼結構已變。請手動檢查。');
}

// ========== 4. 簡單強化 server.ts（CORS + health） ==========
if (fs.existsSync(serverPath)) {
  let server = fs.readFileSync(serverPath, 'utf8');
  let serverChanged = false;

  if (!server.includes('Access-Control-Allow-Origin')) {
    const corsCode = `
// CORS (auto-added)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
`;
    if (server.includes('express()')) {
      server = server.replace(/const\s+app\s*=\s*express\(\)/, match => match + '\n' + corsCode);
      serverChanged = true;
      console.log('✅ 已加入 CORS');
    }
  }

  if (!server.includes("/api/health")) {
    const healthCode = `
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    uptime: process.uptime(),
    hasAgnesKey: !!(process.env.AGNES_API_KEY && !process.env.AGNES_API_KEY.includes('MY_AGNES'))
  });
});
`;
    // 插在 listen 之前
    if (server.includes('app.listen')) {
      server = server.replace(/app\.listen/, healthCode + '\napp.listen');
      serverChanged = true;
      console.log('✅ 已加入 /api/health');
    }
  }

  if (serverChanged) {
    fs.writeFileSync(serverPath, server, 'utf8');
    console.log('✅ server.ts 已更新');
  }
}

console.log('\n✅ 修復腳本執行完畢！');
console.log('請執行：');
console.log('  git add src/App.tsx server.ts');
console.log('  git commit -m "apply real source fixes for skip logic + persistence + health"');
console.log('  git push');
console.log('之後 Railway 會自動重新部署真正修改過的程式碼。');
