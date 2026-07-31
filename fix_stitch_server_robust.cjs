/**
 * fix_stitch_server_robust.cjs
 * Hardens /api/stitch-videos for many clips (e.g. 13):
 * - Normalize each clip then concat demuxer (lighter than giant filter_complex)
 * - Frequent progress logs so proxies keep connection alive
 * - Always emit {type:'result'} or {type:'error'}
 * - Upload final film to Catbox for durable URL
 */
const fs = require("fs");
const path = require("path");

const SERVER = path.join(process.cwd(), "server.ts");
if (!fs.existsSync(SERVER)) {
  console.error("[fix_stitch_server_robust] server.ts not found");
  process.exit(0);
}

let src = fs.readFileSync(SERVER, "utf8");
const original = src;
const MARKER = "TOONFLOW_STITCH_SERVER_ROBUST_V1";

if (src.includes(MARKER)) {
  console.log("[fix_stitch_server_robust] already applied");
  process.exit(0);
}

// Locate the existing stitch endpoint and replace its body with a robust version.
const START = 'app.post("/api/stitch-videos", async (req, res) => {';
const startIdx = src.indexOf(START);
if (startIdx === -1) {
  console.error("[fix_stitch_server_robust] stitch-videos endpoint not found");
  process.exit(1);
}

// Find the matching closing of this route by scanning from start for the next app.post or app.get at column 0-ish
// Simpler: find unique end marker near the end of the function
const END_MARKER = '// Helper to rewrite prompt to be 100% compliant with safety policies';
const endIdx = src.indexOf(END_MARKER, startIdx);
if (endIdx === -1) {
  console.error("[fix_stitch_server_robust] end marker after stitch not found");
  process.exit(1);
}

const NEW_STITCH = `app.post("/api/stitch-videos", async (req, res) => {
  // ${MARKER}
  const { videoUrls } = req.body;
  if (!videoUrls || !Array.isArray(videoUrls) || videoUrls.length === 0) {
    return res.status(400).json({ error: "videoUrls array is required" });
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (obj: any) => {
    try {
      res.write(JSON.stringify(obj) + "\\n");
    } catch (e) {
      console.warn("[stitch] write failed", e);
    }
  };
  const sendLog = (log: string) => send({ type: "log", log });

  let responded = false;
  const finishResult = (videoUrl: string) => {
    if (responded) return;
    responded = true;
    send({ type: "result", videoUrl });
    try { res.end(); } catch (_) {}
  };
  const finishError = (msg: string) => {
    if (responded) return;
    responded = true;
    send({ type: "error", error: msg });
    try { res.end(); } catch (_) {}
  };

  // Keep-alive ping every 15s so Railway / proxies do not idle-close long ffmpeg jobs
  const keepAlive = setInterval(() => {
    try { sendLog("⏳ 拼接仍在進行中，請稍候..."); } catch (_) {}
  }, 15000);

  try {
    const assetsDir = path.join(process.cwd(), "assets");
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

    sendLog("🎬 啟動強化拼接工作流（正規化 + concat demuxer）...");
    sendLog("📦 收到 " + videoUrls.length + " 個片段網址，開始下載與校驗...");

    const localPaths: string[] = [];
    const tempFiles: string[] = [];

    for (let i = 0; i < videoUrls.length; i++) {
      let url = videoUrls[i];
      if (!url || typeof url !== "string") {
        sendLog("⚠️ 跳過空網址 #" + (i + 1));
        continue;
      }
      url = url.trim();

      // Unwrap proxy ?url=
      if (url.includes("url=")) {
        try {
          const parsedUrl = new URL(url, "http://localhost:3000");
          const extracted = parsedUrl.searchParams.get("url");
          if (extracted) url = extracted;
        } catch (_) {}
      }

      // Reject obvious non-video
      if (url.includes("unsplash.com") || url.includes("mixkit.co") || url.startsWith("data:image")) {
        sendLog("⚠️ 跳過非影片網址 #" + (i + 1) + ": " + url.slice(0, 48));
        continue;
      }

      let localPath = "";
      if (url.startsWith("/assets/") || url.includes("/assets/")) {
        const filename = path.basename(url.split("?")[0]);
        localPath = path.join(assetsDir, filename);
        if (!fs.existsSync(localPath)) {
          sendLog("⚠️ 本地檔案不存在 #" + (i + 1) + ": " + filename);
          continue;
        }
      } else if (url.startsWith("http")) {
        // Prefer cloud mapping / local backup by basename
        const mapping = typeof loadCloudMapping === "function" ? loadCloudMapping() : {};
        const mapped = mapping[url] || mapping[decodeURIComponent(url)];
        if (mapped && fs.existsSync(path.resolve(mapped))) {
          localPath = path.resolve(mapped);
          sendLog("✅ #" + (i + 1) + " 使用本地映射檔");
        } else {
          const originalFilename = url.split("/").pop()?.split("?")[0] || ("clip-" + i + ".mp4");
          const backup = path.join(assetsDir, originalFilename);
          if (fs.existsSync(backup)) {
            localPath = backup;
            sendLog("✅ #" + (i + 1) + " 使用本地備份");
          } else {
            const filename = "temp-stitch-" + Date.now() + "-" + i + ".mp4";
            localPath = path.join(assetsDir, filename);
            sendLog("🔍 下載分鏡 " + (i + 1) + "/" + videoUrls.length + "...");
            try {
              if (typeof downloadVideoWithHtmlFallback === "function") {
                await downloadVideoWithHtmlFallback(url, localPath, sendLog);
              } else {
                const resp = await fetch(url);
                if (!resp.ok) throw new Error("HTTP " + resp.status);
                const buf = Buffer.from(await resp.arrayBuffer());
                fs.writeFileSync(localPath, buf);
                try { execSync('ffprobe -v error "' + localPath + '"'); } catch (e) {
                  throw new Error("下載檔案不是有效影片");
                }
              }
              tempFiles.push(localPath);
            } catch (dlErr: any) {
              sendLog("⚠️ 下載失敗 #" + (i + 1) + ": " + (dlErr?.message || dlErr) + " — 跳過此片段");
              try { if (fs.existsSync(localPath)) fs.unlinkSync(localPath); } catch (_) {}
              continue;
            }
          }
        }
      } else {
        sendLog("⚠️ 無法辨識網址格式 #" + (i + 1));
        continue;
      }

      if (localPath && fs.existsSync(localPath)) {
        localPaths.push(localPath);
      }
    }

    if (localPaths.length === 0) {
      clearInterval(keepAlive);
      return finishError("沒有任何可下載/可用的影片片段可供拼接。");
    }

    sendLog("✅ 成功取得 " + localPaths.length + "/" + videoUrls.length + " 個有效片段，開始正規化...");

    // Normalize each clip to same codec/resolution/audio for reliable concat
    const normalized: string[] = [];
    for (let i = 0; i < localPaths.length; i++) {
      const srcPath = localPaths[i];
      const normPath = path.join(assetsDir, "norm-" + Date.now() + "-" + i + ".mp4");
      sendLog("🔧 正規化分鏡 " + (i + 1) + "/" + localPaths.length + "...");
      try {
        // scale+pad to 1280x720, yuv420p, aac stereo, 30fps max
        const cmd =
          'ffmpeg -y -i "' +
          srcPath +
          '" -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,fps=30" ' +
          '-c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p ' +
          '-c:a aac -b:a 128k -ac 2 -ar 44100 -shortest "' +
          normPath +
          '"';
        execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], timeout: 180000 });
        if (fs.existsSync(normPath) && fs.statSync(normPath).size > 1000) {
          normalized.push(normPath);
          tempFiles.push(normPath);
        } else {
          sendLog("⚠️ 正規化輸出異常，改用原始檔 #" + (i + 1));
          normalized.push(srcPath);
        }
      } catch (normErr: any) {
        sendLog("⚠️ 正規化失敗 #" + (i + 1) + "，嘗試直接使用原檔: " + (normErr?.message || "").toString().slice(0, 120));
        normalized.push(srcPath);
      }
    }

    if (normalized.length === 0) {
      clearInterval(keepAlive);
      return finishError("正規化後沒有可用片段。");
    }

    // Write concat list
    const listFile = path.join(assetsDir, "concat-list-" + Date.now() + ".txt");
    const listContent = normalized
      .map((p) => "file '" + p.replace(/'/g, "'\\''") + "'")
      .join("\\n");
    fs.writeFileSync(listFile, listContent, "utf8");
    tempFiles.push(listFile);

    const outputFilename = "stitched-film-" + Date.now() + ".mp4";
    const localOutputPath = path.join(assetsDir, outputFilename);

    sendLog("🎞️ 正在合併 " + normalized.length + " 個片段 (concat demuxer)...");

    try {
      // stream copy first (fast) after normalize — same codec
      const concatCmd =
        'ffmpeg -y -f concat -safe 0 -i "' +
        listFile +
        '" -c copy "' +
        localOutputPath +
        '"';
      execSync(concatCmd, { stdio: ["ignore", "pipe", "pipe"], timeout: 300000 });
    } catch (copyErr: any) {
      sendLog("⚠️ stream copy 失敗，改用重新編碼合併...");
      const reencodeCmd =
        'ffmpeg -y -f concat -safe 0 -i "' +
        listFile +
        '" -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k "' +
        localOutputPath +
        '"';
      execSync(reencodeCmd, { stdio: ["ignore", "pipe", "pipe"], timeout: 600000 });
    }

    if (!fs.existsSync(localOutputPath) || fs.statSync(localOutputPath).size < 1000) {
      clearInterval(keepAlive);
      return finishError("ffmpeg 合併完成但輸出檔案無效或過小。");
    }

    sendLog("🎉 本地合併完成！檔案大小 " + Math.round(fs.statSync(localOutputPath).size / 1024) + " KB");

    // Prefer Catbox durable URL
    let videoUrl = "/assets/" + outputFilename;
    try {
      sendLog("☁️ 正在上傳成片至 Catbox 永久空間...");
      if (typeof uploadFileToCatbox === "function") {
        const cloud = await uploadFileToCatbox(localOutputPath);
        if (cloud && cloud.startsWith("http")) {
          videoUrl = cloud;
          sendLog("✅ Catbox 上傳成功：" + cloud);
        }
      }
    } catch (upErr: any) {
      sendLog("⚠️ Catbox 上傳略過，使用本地路徑: " + (upErr?.message || upErr));
      try {
        const publicBaseUrl = typeof getPublicBaseUrl === "function" ? getPublicBaseUrl(req) : "";
        if (publicBaseUrl) videoUrl = publicBaseUrl + "/assets/" + outputFilename;
      } catch (_) {}
    }

    // Cleanup temps (keep final output)
    for (const t of tempFiles) {
      try {
        if (t !== localOutputPath && fs.existsSync(t)) fs.unlinkSync(t);
      } catch (_) {}
    }

    clearInterval(keepAlive);
    sendLog("✨ 拼接流程全部完成！");
    finishResult(videoUrl);
  } catch (err: any) {
    clearInterval(keepAlive);
    console.error("[Toonflow Error] API /api/stitch-videos failed:", err);
    try {
      if (typeof logExperience === "function") {
        await logExperience({
          type: "system_error",
          category: "stitch_videos",
          errorName: err?.name || "StitchVideosError",
          errorMessage: err?.message || String(err),
          errorStack: err?.stack,
          passed: false,
        });
      }
    } catch (_) {}
    finishError(err?.message || "拼接失敗");
  }
});

`;

src = src.slice(0, startIdx) + NEW_STITCH + src.slice(endIdx);

if (src === original) {
  console.error("[fix_stitch_server_robust] no changes applied");
  process.exit(1);
}

fs.writeFileSync(SERVER, src, "utf8");
console.log("[fix_stitch_server_robust] applied successfully");
