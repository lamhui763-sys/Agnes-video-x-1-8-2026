/**
 * fix_catbox_permanent.cjs
 * Makes Catbox uploads permanent by attaching CATBOX_USERHASH when available.
 * Run automatically via package.json prebuild on Railway.
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.log('[fix_catbox] server.ts not found, skip');
  process.exit(0);
}

let src = fs.readFileSync(serverPath, 'utf8');

// Already patched?
if (src.includes('CATBOX_USERHASH') && src.includes('userhash')) {
  console.log('[fix_catbox] Already patched (CATBOX_USERHASH present)');
  process.exit(0);
}

const oldFn = `async function uploadToCatbox(localPath: string): Promise<string> {
  try {
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(localPath);
    let mimeType = "application/octet-stream";
    if (localPath.endsWith(".mp4")) mimeType = "video/mp4";
    else if (localPath.endsWith(".png")) mimeType = "image/png";
    else if (localPath.endsWith(".jpg") || localPath.endsWith(".jpeg")) mimeType = "image/jpeg";
    else if (localPath.endsWith(".gif")) mimeType = "image/gif";
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append("reqtype", "fileupload");
    formData.append("fileToUpload", blob, path.basename(localPath));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: formData,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(\`Catbox upload did not succeed\`);
    }
    const fileUrl = await response.text();
    if (fileUrl && fileUrl.startsWith("http")) {
      const finalUrl = fileUrl.trim();
      console.log(\`[Toonflow CDN] File successfully uploaded to Catbox: \${finalUrl}\`);
      return finalUrl;
    }
    throw new Error(\`Invalid response from Catbox\`);
  } catch (err: any) {
    console.log(\`[Toonflow CDN] Upload to Catbox bypassed\`);
    throw err;
  }
}`;

const newFn = `async function uploadToCatbox(localPath: string): Promise<string> {
  try {
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(localPath);
    let mimeType = "application/octet-stream";
    if (localPath.endsWith(".mp4")) mimeType = "video/mp4";
    else if (localPath.endsWith(".png")) mimeType = "image/png";
    else if (localPath.endsWith(".jpg") || localPath.endsWith(".jpeg")) mimeType = "image/jpeg";
    else if (localPath.endsWith(".gif")) mimeType = "image/gif";
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append("reqtype", "fileupload");
    formData.append("fileToUpload", blob, path.basename(localPath));

    // Permanent account upload when CATBOX_USERHASH is set in Railway env
    const userhash = (process.env.CATBOX_USERHASH || process.env.CATBOX_HASH || "").trim();
    if (userhash) {
      formData.append("userhash", userhash);
      console.log("[Toonflow CDN] Using Catbox ACCOUNT upload (permanent storage)");
    } else {
      console.log("[Toonflow CDN] Using Catbox anonymous upload (set CATBOX_USERHASH for permanent)");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // longer for videos
    const response = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: formData,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(\`Catbox upload did not succeed (HTTP \${response.status})\`);
    }
    const fileUrl = await response.text();
    if (fileUrl && fileUrl.startsWith("http")) {
      const finalUrl = fileUrl.trim();
      console.log(\`[Toonflow CDN] File successfully uploaded to Catbox\${userhash ? " (PERMANENT)" : ""}: \${finalUrl}\`);
      return finalUrl;
    }
    throw new Error(\`Invalid response from Catbox: \${String(fileUrl).slice(0, 200)}\`);
  } catch (err: any) {
    console.log(\`[Toonflow CDN] Upload to Catbox bypassed: \${err?.message || err}\`);
    throw err;
  }
}`;

if (!src.includes('async function uploadToCatbox')) {
  console.log('[fix_catbox] uploadToCatbox function not found');
  process.exit(0);
}

if (src.includes(oldFn)) {
  src = src.replace(oldFn, newFn);
  fs.writeFileSync(serverPath, src, 'utf8');
  console.log('[fix_catbox] Patched uploadToCatbox with permanent userhash support');
} else {
  // Fallback: smaller unique anchor replacement
  const anchor = 'formData.append("reqtype", "fileupload");\n    formData.append("fileToUpload", blob, path.basename(localPath));';
  const replacement = `formData.append("reqtype", "fileupload");\n    formData.append("fileToUpload", blob, path.basename(localPath));\n\n    // Permanent account upload when CATBOX_USERHASH is set in Railway env\n    const userhash = (process.env.CATBOX_USERHASH || process.env.CATBOX_HASH || "").trim();\n    if (userhash) {\n      formData.append("userhash", userhash);\n      console.log("[Toonflow CDN] Using Catbox ACCOUNT upload (permanent storage)");\n    } else {\n      console.log("[Toonflow CDN] Using Catbox anonymous upload (set CATBOX_USERHASH for permanent)");\n    }`;

  if (src.includes(anchor) && !src.includes('CATBOX_USERHASH')) {
    src = src.replace(anchor, replacement);
    // also bump timeout a bit if still 15000
    src = src.replace(
      'const timeoutId = setTimeout(() => controller.abort(), 15000);\n    const response = await fetch("https://catbox.moe/user/api.php"',
      'const timeoutId = setTimeout(() => controller.abort(), 60000);\n    const response = await fetch("https://catbox.moe/user/api.php"'
    );
    fs.writeFileSync(serverPath, src, 'utf8');
    console.log('[fix_catbox] Patched via anchor (userhash + longer timeout)');
  } else {
    console.log('[fix_catbox] Could not find exact match to patch (may already be patched or code drifted)');
  }
}
