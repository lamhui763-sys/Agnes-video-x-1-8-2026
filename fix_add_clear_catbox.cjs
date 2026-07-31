/**
 * fix_add_clear_catbox.cjs — LAST prebuild step
 * Bulletproof inject of /api/clear-catbox + handleClearCatbox + UI button
 */
const fs = require('fs');
const path = require('path');

function read(p) { return fs.readFileSync(p, 'utf8'); }
function write(p, c, label) { fs.writeFileSync(p, c, 'utf8'); console.log('✅', label); }

// ========== server.ts ==========
const serverPath = path.join(__dirname, 'server.ts');
if (fs.existsSync(serverPath)) {
  let server = read(serverPath);
  if (!server.includes('/api/clear-catbox')) {
    const markers = [
      '// Serve assets folder statically',
      'app.use("/assets"',
      'app.use(\'/assets\'',
      'startServer()',
    ];
    let inserted = false;
    for (const marker of markers) {
      const idx = server.lastIndexOf(marker);
      if (idx === -1) continue;
      const endpoint = `
// Clear all Catbox files that this app has uploaded (requires CATBOX_USERHASH)
app.post("/api/clear-catbox", async (req, res) => {
  try {
    const userhash = process.env.CATBOX_USERHASH || "";
    let mapping: Record<string, string> = {};
    try { mapping = typeof loadCloudMapping === "function" ? loadCloudMapping() : {}; } catch {}
    const catboxUrls = Object.keys(mapping || {}).filter(u => String(u).includes("catbox.moe"));

    let deleted = 0;
    let failed = 0;
    const errors: string[] = [];

    if (userhash && catboxUrls.length > 0) {
      const filenames = catboxUrls.map(u => {
        try { return u.split("/").pop()?.split("?")[0] || null; } catch { return null; }
      }).filter(Boolean) as string[];

      const batchSize = 40;
      for (let i = 0; i < filenames.length; i += batchSize) {
        const batch = filenames.slice(i, i + batchSize);
        try {
          const form = new FormData();
          form.append("reqtype", "deletefiles");
          form.append("userhash", userhash);
          form.append("files", batch.join(" "));
          const resp = await fetch("https://catbox.moe/user/api.php", {
            method: "POST",
            body: form,
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          const text = await resp.text();
          if (resp.ok && (text.includes("success") || text.includes("Files successfully deleted") || text.trim() === "")) {
            deleted += batch.length;
          } else {
            failed += batch.length;
            errors.push(text.substring(0, 120));
          }
        } catch (e: any) {
          failed += batch.length;
          errors.push(e?.message || String(e));
        }
      }
    }

    try {
      if (typeof saveCloudMapping === "function") {
        const newMapping: Record<string, string> = {};
        for (const [url, local] of Object.entries(mapping || {})) {
          if (!String(url).includes("catbox.moe")) newMapping[url] = local as string;
        }
        saveCloudMapping(newMapping);
      }
    } catch {}

    const msg = userhash
      ? \`已嘗試清除 \${catboxUrls.length} 個 Catbox 檔案（成功 \${deleted}，失敗 \${failed}）。本地對照表已清空。\`
      : \`未設定 CATBOX_USERHASH，無法遠端刪除。已清空本地 \${catboxUrls.length} 筆記錄。\`;

    console.log("[Clear Catbox]", msg);
    res.json({ success: true, total: catboxUrls.length, deleted, failed, message: msg, hasUserhash: !!userhash });
  } catch (err: any) {
    console.error("[Clear Catbox] Error:", err);
    res.status(500).json({ error: err?.message || "Clear Catbox failed" });
  }
});

`;
      server = server.slice(0, idx) + endpoint + server.slice(idx);
      write(serverPath, server, 'server.ts: /api/clear-catbox');
      inserted = true;
      break;
    }
    if (!inserted) console.log('[fix] server: could not find insert marker');
  } else {
    console.log('[fix] server: /api/clear-catbox already present');
  }
}

// ========== App.tsx ==========
const appPath = path.join(__dirname, 'src', 'App.tsx');
if (!fs.existsSync(appPath)) {
  console.error('App.tsx missing');
  process.exit(0);
}

let app = read(appPath);
let changed = false;

// Handler
if (!app.includes('handleClearCatbox')) {
  const insertCandidates = [
    '\n  // One-click generate all keyframe-based transition videos sequentially',
    '\n  const handleGenerateAllKeyframesSequentially',
    '\n  const handleRestoreFromBackup',
  ];
  let insertAt = -1;
  for (const c of insertCandidates) {
    insertAt = app.indexOf(c);
    if (insertAt !== -1) break;
  }
  // Fallback: after handleClearAllKeyframes body ends (look for next "  const handle")
  if (insertAt === -1) {
    const fn = app.indexOf('const handleClearAllKeyframes');
    if (fn !== -1) {
      const next = app.indexOf('\n  const handle', fn + 10);
      if (next !== -1) insertAt = next;
    }
  }

  if (insertAt !== -1) {
    const handler = `
  // Clear Catbox permanent files that this app uploaded
  const handleClearCatbox = async () => {
    if (!window.confirm('確定要清除所有已上傳到 Catbox 的永久檔案嗎？此操作無法復原。')) return;
    try {
      showToast('正在清除 Catbox 檔案...', 'info');
      const res = await fetch('/api/clear-catbox', { method: 'POST' });
      const data = await res.json().catch(() => ({} as any));
      if (res.ok) {
        showToast((data as any).message || 'Catbox 清除完成', 'success');
      } else {
        showToast((data as any).error || '清除失敗', 'error');
      }
    } catch (e: any) {
      showToast('清除 Catbox 失敗: ' + (e?.message || e), 'error');
    }
  };

`;
    app = app.slice(0, insertAt) + handler + app.slice(insertAt);
    changed = true;
    console.log('✅ App: handleClearCatbox handler');
  } else {
    console.log('[fix] App: could not find handler insert point');
  }
} else {
  console.log('[fix] App: handleClearCatbox already present');
}

// Button UI — inject right after the clear-all keyframes button
if (!app.includes('清除 Catbox 檔案')) {
  // Match the closing of the clear button that contains handleClearAllKeyframes
  const btnRe = /onClick=\{handleClearAllKeyframes\}[\s\S]{0,800}?<\/button>/;
  const m = app.match(btnRe);
  if (m && m.index !== undefined) {
    const insertPos = m.index + m[0].length;
    const newBtn = `
                        <button
                          type="button"
                          onClick={handleClearCatbox}
                          className="py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] relative z-20 border bg-slate-900 border-orange-500/40 hover:bg-orange-950/20 text-orange-400"
                          title="清除本 App 已上傳到 Catbox 的永久檔案（需要設定 CATBOX_USERHASH）"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-orange-400" />
                          <span>清除 Catbox 檔案</span>
                        </button>`;
    app = app.slice(0, insertPos) + newBtn + app.slice(insertPos);
    changed = true;
    console.log('✅ App: Clear Catbox button UI');
  } else {
    // Text-based fallback
    const texts = ['一鍵清除已生成 (重頭再來)', '一鍵清除已生成(重頭再來)', '再次點擊以確認清除'];
    for (const t of texts) {
      const p = app.indexOf(t);
      if (p === -1) continue;
      const btnEnd = app.indexOf('</button>', p);
      if (btnEnd === -1) continue;
      const insertPos = btnEnd + '</button>'.length;
      const newBtn = `
                        <button
                          type="button"
                          onClick={handleClearCatbox}
                          className="py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] relative z-20 border bg-slate-900 border-orange-500/40 hover:bg-orange-950/20 text-orange-400"
                          title="清除本 App 已上傳到 Catbox 的永久檔案（需要設定 CATBOX_USERHASH）"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-orange-400" />
                          <span>清除 Catbox 檔案</span>
                        </button>`;
      app = app.slice(0, insertPos) + newBtn + app.slice(insertPos);
      changed = true;
      console.log('✅ App: Clear Catbox button UI (text marker)');
      break;
    }
    if (!changed) console.log('[fix] App: clear button text not found');
  }
} else {
  console.log('[fix] App: Clear Catbox button already in UI');
}

if (changed) write(appPath, app, 'App.tsx catbox updates');
else console.log('[fix] App.tsx: no changes');

console.log('fix_add_clear_catbox done.');
