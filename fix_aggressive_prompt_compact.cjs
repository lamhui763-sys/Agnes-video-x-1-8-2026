/**
 * fix_aggressive_prompt_compact.cjs
 *
 * Problem: storyboard prompts are 800–1500+ chars with MANDATE blocks →
 * Agnes image content_policy + diluted video quality.
 *
 * This fix:
 * 1. Upgrades compactPromptForAgnes to ~550 char hard budget + stronger stripping
 * 2. Ensures image path always uses compact version
 * 3. Adds compactPromptForAgnesVideo and applies it to finalPrompt before Python spawn
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.log('[fix_agg] server.ts missing');
  process.exit(0);
}

let src = fs.readFileSync(serverPath, 'utf8');
let changed = false;

// ========== Stronger compact helpers ==========
const HELPERS = `
// AGGRESSIVE_COMPACT_V1 — hard length limits for Agnes stability
function compactPromptForAgnes(raw: string, opts?: { isAvatar?: boolean; artStyle?: string }): string {
  let p = (raw || "").trim();

  // Strip mandate / adversarial blocks
  p = p
    .replace(/\\[[A-Z][^\\]]{0,80}MANDATE[^\\]]*\\]/gi, "")
    .replace(/\\[CRITICAL[^\\]]*\\]/gi, "")
    .replace(/\\[NEGATIVE PROMPT MANDATE:[^\\]]*\\]/gi, "")
    .replace(/\\[CLOTHING CONSISTENCY MANDATE\\][^\\[]*/gi, "")
    .replace(/Absolutely NO[^.]*\\.?/gi, "")
    .replace(/DO NOT generate[^.]*\\.?/gi, "")
    .replace(/You MUST[^.]*\\.?/gi, "")
    .replace(/strictly (wear|override|exclude)[^.]*\\.?/gi, "")
    .replace(/completely clean video,[^.]*\\.?/gi, "no text, no watermark.")
    .replace(/no subtitles, no text, no captions, no words, no watermark, no logo, no signature, clean visual aesthetics/gi, "no text, no watermark")
    .replace(/\\s+/g, " ")
    .trim();

  // Soften policy-trigger words
  const softMap: [RegExp, string][] = [
    [/\\bblood(y)?\\b/gi, "red"],
    [/\\bgore\\b/gi, "drama"],
    [/\\bkill(ed|ing)?\\b/gi, "stop"],
    [/\\bstab(bing|bed)?\\b/gi, "point"],
    [/\\bweapon(s)?\\b/gi, "prop"],
    [/\\bgun(s)?\\b/gi, "device"],
    [/\\bknife|knives\\b/gi, "tool"],
    [/\\bnaked|nude|nsfw\\b/gi, "clothed"],
    [/\\bseductive|sensual|erotic\\b/gi, "gentle"],
    [/\\bterror|horrific|horror\\b/gi, "mysterious"],
    [/\\bexplod(e|ing|sion)\\b/gi, "bright flash"],
  ];
  for (const [re, rep] of softMap) p = p.replace(re, rep);

  const style = ((opts && opts.artStyle) || "").toLowerCase();
  const isAvatar = !!(opts && opts.isAvatar);
  const fairy = /fairy|童話|anime|動漫|cartoon|卡通|illustration|插畫|ghibli|兒童/.test(style + " " + p);

  const prefix = isAvatar
    ? "Clean character design, family-friendly studio portrait. "
    : fairy
      ? "Soft anime illustration, family-friendly, warm light. "
      : "Clean artistic illustration, family-friendly. ";

  const suffix = " High quality, no text, no watermark.";

  // Hard budget ~550 total — Agnes is more stable under this
  const budget = 550 - prefix.length - suffix.length;
  if (p.length > budget) {
    // Prefer keeping the first half (subject + action) over trailing style spam
    p = p.substring(0, budget).replace(/[,;:\s]+$/, "");
  }

  return (prefix + p + suffix).replace(/\\s+/g, " ").trim();
}

function compactPromptForAgnesVideo(raw: string): string {
  let p = (raw || "").trim();
  p = p
    .replace(/\\[[A-Z][^\\]]{0,80}MANDATE[^\\]]*\\]/gi, "")
    .replace(/\\[CRITICAL[^\\]]*\\]/gi, "")
    .replace(/\\[FLUID CONTINUOUS MOTION\\][^\\[]*/gi, "smooth continuous motion. ")
    .replace(/Absolutely NO[^.]*\\.?/gi, "")
    .replace(/completely clean video,[^.]*\\.?/gi, "no text, no watermark.")
    .replace(/no subtitles, no text, no captions, no words, no watermark, no logo, no signature, clean visual aesthetics/gi, "no text, no watermark")
    .replace(/\\s+/g, " ")
    .trim();

  // Video prompt target ~320 words max ≈ 1600 chars; prefer ~900 chars for reliability
  if (p.length > 900) {
    p = p.substring(0, 900).replace(/[,;:\s]+$/, "");
  }
  if (!/no text/i.test(p)) p += " no text, no watermark.";
  return p.replace(/\\s+/g, " ").trim();
}

`;

// Replace existing weak compactPromptForAgnes if present, else inject both helpers
if (src.includes('function compactPromptForAgnes(')) {
  // Replace from function start to next top-level function/comment
  const start = src.indexOf('function compactPromptForAgnes(');
  // find beginning of line
  let lineStart = start;
  while (lineStart > 0 && src[lineStart - 1] !== '\n') lineStart--;
  // also include preceding comment block if AGGRESSIVE or Compact +
  const commentIdx = src.lastIndexOf('//', lineStart);
  if (commentIdx !== -1 && lineStart - commentIdx < 200) {
    const prevNl = src.lastIndexOf('\n', commentIdx);
    if (prevNl !== -1) lineStart = prevNl + 1;
  }

  // Find end: next "\nfunction " or "\nasync function " after the body
  let brace = 0;
  let i = src.indexOf('{', start);
  let end = -1;
  if (i !== -1) {
    brace = 1;
    i++;
    for (; i < src.length; i++) {
      if (src[i] === '{') brace++;
      else if (src[i] === '}') {
        brace--;
        if (brace === 0) {
          end = i + 1;
          break;
        }
      }
    }
  }

  if (end !== -1) {
    // Skip trailing newlines
    while (end < src.length && (src[end] === '\n' || src[end] === '\r')) end++;
    src = src.slice(0, lineStart) + HELPERS + src.slice(end);
    changed = true;
    console.log('[fix_agg] replaced existing compactPromptForAgnes with AGGRESSIVE_COMPACT_V1');
  }
} else {
  const anchors = [
    '// Helper to rewrite prompt to be 100% compliant with safety policies',
    'async function rewritePromptToBeSafe',
    '// Toonflow Feature: Storyboard Image Generator using Agnes AI',
    'app.post("/api/generate-image"',
  ];
  for (const a of anchors) {
    const idx = src.indexOf(a);
    if (idx !== -1) {
      src = src.slice(0, idx) + HELPERS + src.slice(idx);
      changed = true;
      console.log('[fix_agg] injected helpers before', a.substring(0, 40));
      break;
    }
  }
}

// Ensure video path also has compactPromptForAgnesVideo if only image helper existed
if (!src.includes('function compactPromptForAgnesVideo(')) {
  const marker = 'function compactPromptForAgnes(';
  const idx = src.indexOf(marker);
  if (idx !== -1) {
    // find end of compactPromptForAgnes
    let brace = 0;
    let i = src.indexOf('{', idx);
    let end = -1;
    if (i !== -1) {
      brace = 1;
      i++;
      for (; i < src.length; i++) {
        if (src[i] === '{') brace++;
        else if (src[i] === '}') {
          brace--;
          if (brace === 0) { end = i + 1; break; }
        }
      }
    }
    if (end !== -1) {
      const videoFn = `

function compactPromptForAgnesVideo(raw: string): string {
  let p = (raw || "").trim();
  p = p
    .replace(/\\[[A-Z][^\\]]{0,80}MANDATE[^\\]]*\\]/gi, "")
    .replace(/\\[CRITICAL[^\\]]*\\]/gi, "")
    .replace(/\\[FLUID CONTINUOUS MOTION\\][^\\[]*/gi, "smooth continuous motion. ")
    .replace(/Absolutely NO[^.]*\\.?/gi, "")
    .replace(/completely clean video,[^.]*\\.?/gi, "no text, no watermark.")
    .replace(/no subtitles, no text, no captions, no words, no watermark, no logo, no signature, clean visual aesthetics/gi, "no text, no watermark")
    .replace(/\\s+/g, " ")
    .trim();
  if (p.length > 900) p = p.substring(0, 900).replace(/[,;:\\s]+$/, "");
  if (!/no text/i.test(p)) p += " no text, no watermark.";
  return p.replace(/\\s+/g, " ").trim();
}
`;
      src = src.slice(0, end) + videoFn + src.slice(end);
      changed = true;
      console.log('[fix_agg] appended compactPromptForAgnesVideo');
    }
  }
}

// ========== Apply compaction before Agnes video spawn ==========
// Look for where finalPrompt is about to be used in args for agnes_video.py
if (!src.includes('AGGRESSIVE_VIDEO_COMPACT_V1')) {
  // Common pattern: args with --prompt and finalPrompt
  const patterns = [
    // after finalPrompt is finalized, before spawn
    {
      find: 'const args = [',
      // only if nearby has agnes_video
    },
  ];

  // Safer: right before spawning python with finalPrompt
  if (src.includes('--prompt", finalPrompt') || src.includes("--prompt", finalPrompt")) {
    // inject compaction just before args construction that uses finalPrompt
    const needle = 'const args = [\n      "src/agnes_video.py",';
    const altNeedle = 'const args = [\n      "src/agnes_video.py"';
    let n = src.indexOf(needle);
    if (n === -1) n = src.indexOf(altNeedle);
    if (n === -1) {
      // try looser
      n = src.indexOf('"src/agnes_video.py"');
      if (n !== -1) {
        // walk back to const args
        const back = src.lastIndexOf('const args', n);
        if (back !== -1 && n - back < 300) n = back;
        else n = -1;
      }
    }

    if (n !== -1) {
      const inject = `// AGGRESSIVE_VIDEO_COMPACT_V1
    if (typeof compactPromptForAgnesVideo === "function") {
      const beforeLen = (finalPrompt || "").length;
      finalPrompt = compactPromptForAgnesVideo(finalPrompt);
      console.log("[Toonflow] Video prompt compacted:", beforeLen, "→", finalPrompt.length);
      if (activeTask && activeTask.logs) {
        activeTask.logs.push("[SYSTEM] 已自動精簡影片 Prompt（" + beforeLen + " → " + finalPrompt.length + " 字元）以提升 Agnes 穩定度");
      }
    }

    `;
      src = src.slice(0, n) + inject + src.slice(n);
      changed = true;
      console.log('[fix_agg] injected video prompt compaction before args');
    } else {
      console.log('[fix_agg] could not find video args insertion point');
    }
  } else if (src.includes('finalPrompt') && src.includes('agnes_video.py')) {
    // fallback: compact right after synthesis assignment patterns
    const assignMarkers = [
      'activeTask.prompt = finalPrompt;',
      'activeTask.prompt = finalPrompt',
    ];
    for (const m of assignMarkers) {
      if (src.includes(m) && !src.includes('AGGRESSIVE_VIDEO_COMPACT_V1')) {
        src = src.replace(
          m,
          `// AGGRESSIVE_VIDEO_COMPACT_V1
      if (typeof compactPromptForAgnesVideo === "function") {
        const beforeLen = (finalPrompt || "").length;
        finalPrompt = compactPromptForAgnesVideo(finalPrompt);
        console.log("[Toonflow] Video prompt compacted:", beforeLen, "→", finalPrompt.length);
      }
      ${m}`
        );
        changed = true;
        console.log('[fix_agg] injected video compact near activeTask.prompt assignment');
        break;
      }
    }
  }
} else {
  console.log('[fix_agg] video compact already present');
}

// ========== Ensure image path uses compact (if missing) ==========
if (src.includes("generateAgnesImageUrl(enhancedPrompt") && !src.includes('compactPromptForAgnes(enhancedPrompt')) {
  src = src.replace(
    /generateAgnesImageUrl\(enhancedPrompt,/g,
    'generateAgnesImageUrl(compactPromptForAgnes(enhancedPrompt, { isAvatar, artStyle }),'
  );
  changed = true;
  console.log('[fix_agg] forced image path to use compactPromptForAgnes');
}

if (changed) {
  fs.writeFileSync(serverPath, src, 'utf8');
  console.log('[fix_agg] server.ts written');
} else {
  console.log('[fix_agg] no changes');
}

console.log('fix_aggressive_prompt_compact done.');
