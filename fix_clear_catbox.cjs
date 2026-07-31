/**
 * fix_clear_catbox.cjs
 * 1. Track Catbox filenames uploaded with userhash
 * 2. Add POST /api/clear-catbox endpoint to delete them
 * Run via package.json prebuild
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.log('[fix_clear_catbox] server.ts not found, skip');
  process.exit(0);
}

let src = fs.readFileSync(serverPath, 'utf8');

if (src.includes('/api/clear-catbox') && src.includes('catbox_uploaded_files.json')) {
  console.log('[fix_clear_catbox] Already patched');
  process.exit(0);
}

// --- 1. Add tracking helpers near cloud mapping ---
const trackingHelpers = `
// Track Catbox files uploaded with account (for later bulk delete)
const CATBOX_TRACK_FILE = path.join(process.cwd(), "assets", "catbox_uploaded_files.json");

function loadCatboxTrackedFiles(): string[] {
  try {
    if (fs.existsSync(CATBOX_TRACK_FILE)) {
      const data = JSON.parse(fs.readFileSync(CATBOX_TRACK_FILE, "utf-8"));
      return Array.isArray(data.files) ? data.files : [];
    }
  } catch (e) {}
  return [];
}

function saveCatboxTrackedFiles(files: string[]) {
  try {
    const dir = path.dirname(CATBOX_TRACK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // keep unique, newest last, max 500 entries
    const unique = Array.from(new Set(files)).slice(-500);
    fs.writeFileSync(CATBOX_TRACK_FILE, JSON.stringify({ files: unique, updatedAt: new Date().toISOString() }, null, 2), "utf-8");
  } catch (e) {
    console.warn("[Catbox Track] Failed to save tracked files:", e);
  }
}

function trackCatboxUpload(url: string) {
  if (!url || !url.includes("catbox.moe")) return;
  try {
    const filename = url.split("/").pop()?.split("?")[0];
    if (!filename || filename.length < 3) return;
    const list = loadCatboxTrackedFiles();
    if (!list.includes(filename)) {
      list.push(filename);
      saveCatboxTrackedFiles(list);
      console.log("[Catbox Track] Recorded: " + filename);
    }
  } catch (e) {}
}
`;

if (!src.includes('catbox_uploaded_files.json')) {
  // Insert after registerCloudMapping function if possible
  const anchor = 'function registerCloudMapping(cloudUrl: string, localPath: string) {';
  if (src.includes(anchor)) {
    // find end of registerCloudMapping roughly and insert after mapping helpers block
    const insertAfter = 'console.log(`[Cloud Mapping] Registered: ${cloudUrl} -> ${localPath}`);\n}';
    if (src.includes(insertAfter)) {
      src = src.replace(insertAfter, insertAfter + '\n' + trackingHelpers);
      console.log('[fix_clear_catbox] Added tracking helpers');
    } else {
      // fallback insert near top of file after imports area is risky; put before uploadToCatbox
      const uAnchor = 'async function uploadToCatbox(localPath: string)';
      if (src.includes(uAnchor)) {
        src = src.replace(uAnchor, trackingHelpers + '\n' + uAnchor);
        console.log('[fix_clear_catbox] Added tracking helpers before uploadToCatbox');
      }
    }
  }
}

// --- 2. Track successful Catbox uploads inside uploadToCatbox ---
// Look for successful return of finalUrl and inject track call
const successLog = 'console.log(`[Toonflow CDN] File successfully uploaded to Catbox${userhash ? " (PERMANENT)" : ""}: ${finalUrl}`);';
const successLogAlt = 'console.log(`[Toonflow CDN] File successfully uploaded to Catbox: ${finalUrl}`);';

if (src.includes(successLog) && !src.includes('trackCatboxUpload(finalUrl)')) {
  src = src.replace(
    successLog,
    successLog + '\n      if (userhash) trackCatboxUpload(finalUrl);'
  );
  console.log('[fix_clear_catbox] Injected trackCatboxUpload (permanent path)');
} else if (src.includes(successLogAlt) && !src.includes('trackCatboxUpload(finalUrl)')) {
  src = src.replace(
    successLogAlt,
    successLogAlt + '\n      trackCatboxUpload(finalUrl);'
  );
  console.log('[fix_clear_catbox] Injected trackCatboxUpload (alt path)');
}

// --- 3. Add /api/clear-catbox endpoint ---
const clearEndpoint = `
// Clear Catbox files that this app has uploaded (tracked list)
app.post("/api/clear-catbox", async (req, res) => {
  try {
    const userhash = (process.env.CATBOX_USERHASH || process.env.CATBOX_HASH || "").trim();
    if (!userhash) {
      return res.status(400).json({ error: "CATBOX_USERHASH 未設定，無法刪除帳戶檔案" });
    }

    const tracked = loadCatboxTrackedFiles();
    if (tracked.length === 0) {
      return res.json({ success: true, deleted: 0, message: "沒有記錄到由本 App 上傳的 Catbox 檔案" });
    }

    // Catbox allows space-separated filenames in one request; batch in chunks of 50
    const chunkSize = 50;
    let deleted = 0;
    const errors: string[] = [];

    for (let i = 0; i < tracked.length; i += chunkSize) {
      const chunk = tracked.slice(i, i + chunkSize);
      const formData = new FormData();
      formData.append("reqtype", "deletefiles");
      formData.append("userhash", userhash);
      formData.append("files", chunk.join(" "));

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const response = await fetch("https://catbox.moe/user/api.php", {
          method: "POST",
          body: formData,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        const text = await response.text();
        console.log("[Clear Catbox] delete response:", text.slice(0, 200));
        if (response.ok) {
          deleted += chunk.length;
        } else {
          errors.push(text.slice(0, 100));
        }
      } catch (e: any) {
        errors.push(e?.message || String(e));
      }
    }

    // Clear the tracking list after attempt
    saveCatboxTrackedFiles([]);

    res.json({
      success: true,
      deleted,
      totalTracked: tracked.length,
      message: `已嘗試刪除 ${deleted} 個由本 App 上傳的 Catbox 檔案`,
      errors: errors.length ? errors : undefined
    });
  } catch (err: any) {
    console.error("[Clear Catbox] Error:", err);
    res.status(500).json({ error: err?.message || "清除失敗" });
  }
});

// List currently tracked Catbox files (for UI)
app.get("/api/catbox-tracked", (req, res) => {
  const files = loadCatboxTrackedFiles();
  res.json({ count: files.length, files });
});
`;

if (!src.includes('/api/clear-catbox')) {
  // Insert before startServer or near other API routes
  const insertBefore = 'async function startServer()';
  if (src.includes(insertBefore)) {
    src = src.replace(insertBefore, clearEndpoint + '\n' + insertBefore);
    console.log('[fix_clear_catbox] Added /api/clear-catbox endpoint');
  } else {
    // fallback: append before last few lines
    src = src + '\n' + clearEndpoint;
    console.log('[fix_clear_catbox] Appended clear endpoint at end');
  }
}

fs.writeFileSync(serverPath, src, 'utf8');
console.log('[fix_clear_catbox] Done');
