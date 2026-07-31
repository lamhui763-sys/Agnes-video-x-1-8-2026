/**
 * fix_stitch_skip_invalid.cjs
 * - Stitch: auto-skip invalid / non-video URLs
 * - Stronger error messages (valid count, skipped list, server hint)
 * - Full-auto + manual stitch paths
 */
const fs = require("fs");
const path = require("path");

const APP = path.join(process.cwd(), "src", "App.tsx");
if (!fs.existsSync(APP)) {
  console.error("[fix_stitch_skip_invalid] src/App.tsx not found");
  process.exit(0);
}

let src = fs.readFileSync(APP, "utf8");
const original = src;
const MARKER = "TOONFLOW_STITCH_SKIP_INVALID_V1";

if (src.includes(MARKER)) {
  console.log("[fix_stitch_skip_invalid] already applied");
  process.exit(0);
}

// ---- 1) Inject isUsableVideoUrl helper before full-auto final stitch ----
const STITCH_START = 'setFullAutoLogs(prev => [...prev, "🎬 第四步：所有分鏡鏡頭已完美生成完畢！正在啟動 AI 剪輯大師，極速拼接大片中..."]);';
if (!src.includes(STITCH_START)) {
  console.error("[fix_stitch_skip_invalid] full-auto stitch start log not found");
  process.exit(1);
}

const HELPER = [
  "// " + MARKER,
  "const isUsableVideoUrl = (url: any): boolean => {",
  "  if (!url || typeof url !== \"string\") return false;",
  "  const u = url.trim();",
  "  if (!u || u === \"null\" || u === \"undefined\") return false;",
  "  if (u.includes(\"unsplash.com\")) return false;",
  "  if (u.includes(\"pollinations-fallback\")) return false;",
  "  if (u.includes(\"mixkit.co\")) return false;",
  "  if (u.includes(\"gradient\") || u.includes(\"placeholder\")) return false;",
  "  if (u.startsWith(\"data:image\")) return false;",
  "  // Reject pure image file extensions used by mistake as video",
  "  if (/\\.(jpg|jpeg|png|gif|webp|bmp|svg)(\\?|$)/i.test(u) && !u.includes(\"/api/\") && !u.includes(\"catbox\")) return false;",
  "  if (!(u.startsWith(\"http\") || u.startsWith(\"/assets/\") || u.startsWith(\"/api/\") || u.startsWith(\"data:video\"))) return false;",
  "  if (u.length < 8) return false;",
  "  return true;",
  "};",
  "",
].join("\n");

src = src.replace(STITCH_START, HELPER + "\n      " + STITCH_START);

// ---- 2) Replace orderedVideoUrls collection (full-auto) ----
const OLD_MAP = ".map(s => s.videoUrlKeyframes || s.videoUrlExt || s.videoUrl)\n        .filter(Boolean) as string[];";

if (!src.includes(OLD_MAP)) {
  // try single-line variant
  const OLD_MAP2 = ".map(s => s.videoUrlKeyframes || s.videoUrlExt || s.videoUrl).filter(Boolean) as string[];";
  if (src.includes(OLD_MAP2)) {
    // will handle below with broader logic
  } else {
    console.warn("[fix_stitch_skip_invalid] exact map/filter pattern not found, trying broader replace");
  }
}

// Broader: find the block that builds orderedVideoUrls right after finalProj
const collectPattern = /const orderedVideoUrls = \(finalProj\?\.scenes \|\| currentScenes\)[\s\S]*?\.filter\(Boolean\) as string\[];\s*if \(orderedVideoUrls\.length === 0\) \{[\s\S]*?throw new Error\("[^"\n]+"\);\s*\}\s*setFullAutoLogs\(prev => \[\.\.\.prev, `🎞️ 正在向剪輯核心提交 \$\{orderedVideoUrls\.length\} 個分鏡鏡頭檔案\.\.\.`\]\);/;

const NEW_COLLECT = `const rawScenesForStitch = finalProj?.scenes || currentScenes;
      const orderedVideoUrls: string[] = [];
      const skippedStitchScenes: string[] = [];
      rawScenesForStitch.forEach((s: any, idx: number) => {
        const cand = s.videoUrlKeyframes || s.videoUrlExt || s.videoUrl;
        if (isUsableVideoUrl(cand)) {
          orderedVideoUrls.push(cand as string);
        } else {
          const label = "鏡頭 " + (idx + 1) + (s.title ? "「" + s.title + "」" : "") + " (" + (cand ? String(cand).slice(0, 56) + "…" : "空") + ")";
          skippedStitchScenes.push(label);
        }
      });

      if (skippedStitchScenes.length > 0) {
        setFullAutoLogs(prev => [...prev, "⚠️ 拼接前自動跳過 " + skippedStitchScenes.length + " 個無效/非影片網址：", ...skippedStitchScenes.map(x => "   · " + x)]);
      }

      if (orderedVideoUrls.length === 0) {
        throw new Error("沒有任何有效影片網址可拼接（共 " + rawScenesForStitch.length + " 個分鏡全部被判定為無效）。請確認每個鏡頭已成功生成影片，而不是圖片或空值。");
      }

      setFullAutoLogs(prev => [...prev, "🎞️ 正在向剪輯核心提交 " + orderedVideoUrls.length + "/" + rawScenesForStitch.length + " 個有效分鏡影片檔案..."]);`;

if (collectPattern.test(src)) {
  src = src.replace(collectPattern, NEW_COLLECT);
} else {
  // Fallback: simpler two-step replace
  const simpleMap = /const orderedVideoUrls = \(finalProj\?\.scenes \|\| currentScenes\)\s*\.map\(s => s\.videoUrlKeyframes \|\| s\.videoUrlExt \|\| s\.videoUrl\)\s*\.filter\(Boolean\) as string\[];/;
  if (simpleMap.test(src)) {
    src = src.replace(simpleMap, `const rawScenesForStitch = finalProj?.scenes || currentScenes;
      const orderedVideoUrls: string[] = [];
      const skippedStitchScenes: string[] = [];
      rawScenesForStitch.forEach((s: any, idx: number) => {
        const cand = s.videoUrlKeyframes || s.videoUrlExt || s.videoUrl;
        if (isUsableVideoUrl(cand)) orderedVideoUrls.push(cand as string);
        else skippedStitchScenes.push("鏡頭 " + (idx + 1) + (s.title ? "「" + s.title + "」" : ""));
      });
      if (skippedStitchScenes.length > 0) {
        setFullAutoLogs(prev => [...prev, "⚠️ 拼接前自動跳過 " + skippedStitchScenes.length + " 個無效網址", ...skippedStitchScenes.map(x => "   · " + x)]);
      }`);
    src = src.replace(
      'throw new Error("沒有生成任何有效的影片分鏡，無法進行最終拼接剪輯。");',
      'throw new Error("沒有任何有效影片網址可拼接（全部被判定為無效）。請確認每個鏡頭已成功生成影片。");'
    );
    src = src.replace(
      "`🎞️ 正在向剪輯核心提交 ${orderedVideoUrls.length} 個分鏡鏡頭檔案...`",
      "`🎞️ 正在向剪輯核心提交 ${orderedVideoUrls.length} 個有效分鏡影片檔案...`"
    );
  } else {
    console.warn("[fix_stitch_skip_invalid] could not match orderedVideoUrls collection; partial apply");
  }
}

// ---- 3) Stronger final stitch error ----
const OLD_ERR = 'throw new Error("最終拼接未返回有效影片網址。");';
if (src.includes(OLD_ERR)) {
  src = src.replace(
    OLD_ERR,
    `throw new Error(
          "最終拼接未返回有效影片網址。已提交 " + orderedVideoUrls.length + " 個有效片段。" +
          (finalStitchData ? " 伺服器回傳: " + JSON.stringify(finalStitchData).slice(0, 200) : " 伺服器無 result 資料（可能超時、ffmpeg 失敗或片段無法下載）。") +
          " 請檢查 Railway log / 各鏡頭 videoUrl 是否為可下載的 mp4。"
        );`
  );
}

// ---- 4) Manual stitch path (handleManualStitchVideos) ----
const MANUAL_MAP = /const orderedVideoUrls = curProj\.scenes\s*\.map\(s => s\.videoUrlKeyframes \|\| s\.videoUrlExt \|\| s\.videoUrl\)\s*\.filter\(Boolean\) as string\[];/;
if (MANUAL_MAP.test(src)) {
  src = src.replace(
    MANUAL_MAP,
    `const orderedVideoUrls = curProj.scenes
      .map(s => s.videoUrlKeyframes || s.videoUrlExt || s.videoUrl)
      .filter((u): u is string => {
        if (!u || typeof u !== "string") return false;
        const t = u.trim();
        if (!t || t.includes("unsplash.com") || t.includes("mixkit.co") || t.startsWith("data:image")) return false;
        if (/\\.(jpg|jpeg|png|gif|webp)(\\?|$)/i.test(t) && !t.includes("/api/") && !t.includes("catbox")) return false;
        return t.startsWith("http") || t.startsWith("/assets/") || t.startsWith("/api/");
      });`
  );
}

if (src === original) {
  console.error("[fix_stitch_skip_invalid] no changes applied");
  process.exit(1);
}

fs.writeFileSync(APP, src, "utf8");
console.log("[fix_stitch_skip_invalid] applied successfully");
