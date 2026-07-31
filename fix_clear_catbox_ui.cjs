/**
 * fix_clear_catbox_ui.cjs
 * Hardcode "清除 Catbox 檔案" button + handler into src/App.tsx
 * Also ensure server.ts has /api/clear-catbox endpoint + CATBOX_USERHASH support
 */
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'src', 'App.tsx');
const serverPath = path.join(process.cwd(), 'server.ts');

// ========== 1. Fix App.tsx ==========
if (fs.existsSync(appPath)) {
  let src = fs.readFileSync(appPath, 'utf8');

  if (src.includes('handleClearCatbox') && src.includes('清除 Catbox 檔案')) {
    console.log('[fix] App.tsx already has Clear Catbox button + handler');
  } else {
    // 1a. Insert handler near handleClearAllKeyframes
    if (!src.includes('handleClearCatbox')) {
      const handlerCode = `
  // Clear Catbox uploaded files (permanent account cleanup)
  const handleClearCatbox = async () => {
    if (!window.confirm('確定要刪除本 App 上傳到 Catbox 帳戶的所有檔案嗎？此操作無法還原。')) return;
    try {
      const res = await fetch('/api/clear-catbox', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || '清除失敗');
        return;
      }
      alert(data.message || \`已清除 \${data.deleted || 0} 個檔案\`);
    } catch (e) {
      alert('清除請求失敗: ' + (e?.message || e));
    }
  };
`;
      if (src.includes('const handleClearAllKeyframes')) {
        src = src.replace(
          'const handleClearAllKeyframes',
          handlerCode + '\n  const handleClearAllKeyframes'
        );
        console.log('[fix] Inserted handleClearCatbox handler');
      } else {
        console.log('[fix] WARNING: could not find handleClearAllKeyframes');
      }
    }

    // 1b. Insert button after the clear button's </button>
    if (!src.includes('清除 Catbox 檔案')) {
      const buttonJsx = `
                        <button
                          type="button"
                          onClick={handleClearCatbox}
                          className="py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] relative z-20 border bg-orange-600/90 border-orange-400/50 hover:bg-orange-500 text-white shadow-lg shadow-orange-900/20"
                          title="刪除本 App 上傳到 Catbox 帳戶的檔案（永久）"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-white" />
                          <span>清除 Catbox 檔案</span>
                        </button>`;

      const clearTextIdx = src.indexOf('一鍵清除已生成 (重頭再來)');
      if (clearTextIdx !== -1) {
        const closeBtnIdx = src.indexOf('</button>', clearTextIdx);
        if (closeBtnIdx !== -1) {
          const insertAt = closeBtnIdx + '</button>'.length;
          src = src.slice(0, insertAt) + buttonJsx + src.slice(insertAt);
          console.log('[fix] Inserted Clear Catbox button after clear button');
        }
      } else {
        const altIdx = src.indexOf('一鍵清除已生成');
        if (altIdx !== -1) {
          const closeBtnIdx = src.indexOf('</button>', altIdx);
          if (closeBtnIdx !== -1) {
            const insertAt = closeBtnIdx + '</button>'.length;
            src = src.slice(0, insertAt) + buttonJsx + src.slice(insertAt);
            console.log('[fix] Inserted Clear Catbox button (alt match)');
          }
        } else {
          console.log('[fix] WARNING: could not find clear button text');
        }
      }
    }

    fs.writeFileSync(appPath, src, 'utf8');
    console.log('[fix] App.tsx updated');
  }
} else {
  console.log('[fix] src/App.tsx not found');
}

// ========== 2. Fix server.ts ==========
if (fs.existsSync(serverPath)) {
  let serverSrc = fs.readFileSync(serverPath, 'utf8');

  // Add CATBOX_USERHASH support to uploadToCatbox
  if (!serverSrc.includes('CATBOX_USERHASH') && serverSrc.includes('formData.append("reqtype", "fileupload")')) {
    serverSrc = serverSrc.replace(
      'formData.append("reqtype", "fileupload");',
      'formData.append("reqtype", "fileupload");\n    const userhash = process.env.CATBOX_USERHASH;\n    if (userhash) formData.append("userhash", userhash);'
    );
    console.log('[fix] Added CATBOX_USERHASH support');
  }

  if (serverSrc.includes('/api/clear-catbox')) {
    console.log('[fix] server.ts already has /api/clear-catbox');
  } else {
    const clearEndpointCode = `
// ========== Catbox Account File Tracking & Clear ==========
const CATBOX_TRACKED_FILE = path.join(process.cwd(), "catbox_uploaded.json");

function loadCatboxTracked() {
  try {
    if (fs.existsSync(CATBOX_TRACKED_FILE)) {
      const data = JSON.parse(fs.readFileSync(CATBOX_TRACKED_FILE, "utf-8"));
      return Array.isArray(data) ? data : [];
    }
  } catch (e) {}
  return [];
}

function saveCatboxTracked(files) {
  try {
    fs.writeFileSync(CATBOX_TRACKED_FILE, JSON.stringify(files, null, 2), "utf-8");
  } catch (e) {
    console.warn("[Catbox Track] Failed to save:", e);
  }
}

function trackCatboxUpload(url) {
  if (!url || !url.includes("catbox.moe")) return;
  const filename = url.split("/").pop()?.split("?")[0];
  if (!filename) return;
  const tracked = loadCatboxTracked();
  if (!tracked.includes(filename)) {
    tracked.push(filename);
    saveCatboxTracked(tracked);
    console.log(\`[Catbox Track] Tracked: \${filename}\`);
  }
}

app.post("/api/clear-catbox", async (req, res) => {
  try {
    const userhash = process.env.CATBOX_USERHASH;
    if (!userhash) {
      return res.status(400).json({ error: "未設定 CATBOX_USERHASH，無法刪除帳戶檔案。請先在 Railway Variables 加入 CATBOX_USERHASH。" });
    }
    const tracked = loadCatboxTracked();
    if (tracked.length === 0) {
      return res.json({ message: "目前沒有追蹤到的 Catbox 檔案需要清除。", deleted: 0 });
    }
    const formData = new FormData();
    formData.append("reqtype", "deletefiles");
    formData.append("userhash", userhash);
    formData.append("files", tracked.join(" "));
    const response = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: formData,
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const resultText = await response.text();
    console.log(\`[Catbox Clear] API: \${resultText}\`);
    const deletedCount = tracked.length;
    saveCatboxTracked([]);
    res.json({
      message: \`已向 Catbox 發送刪除請求，共 \${deletedCount} 個檔案。回應：\${resultText || "OK"}\`,
      deleted: deletedCount,
      raw: resultText
    });
  } catch (err) {
    console.error("[Catbox Clear] Error:", err);
    res.status(500).json({ error: err.message || "清除失敗" });
  }
});

app.get("/api/catbox-tracked", (req, res) => {
  const tracked = loadCatboxTracked();
  res.json({ files: tracked, count: tracked.length });
});
`;

    if (serverSrc.includes('async function startServer()')) {
      serverSrc = serverSrc.replace(
        'async function startServer()',
        clearEndpointCode + '\n\nasync function startServer()'
      );
      console.log('[fix] Inserted /api/clear-catbox before startServer');
    } else {
      serverSrc = serverSrc + '\n' + clearEndpointCode;
      console.log('[fix] Appended /api/clear-catbox');
    }

    // Track uploads on success
    if (!serverSrc.includes('trackCatboxUpload(')) {
      serverSrc = serverSrc.replace(
        /const finalUrl = fileUrl\.trim\(\);\n\s*console\.log\(`\[Toonflow CDN\] File successfully uploaded to Catbox: \$\{finalUrl\}`\);\n\s*return finalUrl;/
        ,
        'const finalUrl = fileUrl.trim();\n      console.log(`[Toonflow CDN] File successfully uploaded to Catbox: ${finalUrl}`);\n      try { trackCatboxUpload(finalUrl); } catch(e) {}\n      return finalUrl;'
      );
    }

    fs.writeFileSync(serverPath, serverSrc, 'utf8');
    console.log('[fix] server.ts updated');
  }
} else {
  console.log('[fix] server.ts not found');
}

console.log('[fix] Done');
