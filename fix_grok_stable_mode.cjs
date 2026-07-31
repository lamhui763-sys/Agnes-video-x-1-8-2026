/**
 * fix_grok_stable_mode.cjs
 *
 * "Grok 風格穩健模式" for Agnes:
 * - Aggressive prompt shortening
 * - Simplify high-risk / high-motion actions (gun spin, explosion, etc.)
 * - Soften policy-sensitive wording (child+dark, weapons, gore)
 * - Applied on BOTH image and video paths before Agnes calls
 *
 * Marker: GROK_STABLE_MODE_V1
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.log('[grok_stable] server.ts missing');
  process.exit(0);
}

let src = fs.readFileSync(serverPath, 'utf8');
let changed = false;

if (src.includes('GROK_STABLE_MODE_V1')) {
  console.log('[grok_stable] already present');
  process.exit(0);
}

const HELPER = `
// GROK_STABLE_MODE_V1 — orchestrate prompts the way a careful agent would for Agnes stability
function applyGrokStablePrompt(raw: string, opts?: { kind?: "image" | "video"; artStyle?: string }): string {
  try {
    let p = String(raw || "").trim();
    if (!p) return p;

    // 1) Strip mandate / adversarial blocks
    p = p
      .replace(/\\[[^\\]]{0,120}MANDATE[^\\]]*\\]/gi, "")
      .replace(/\\[CRITICAL[^\\]]*\\]/gi, "")
      .replace(/Absolutely NO[^.]*\\.?/gi, "")
      .replace(/DO NOT generate[^.]*\\.?/gi, "")
      .replace(/You MUST[^.]*\\.?/gi, "")
      .replace(/strictly (wear|override|exclude|follow)[^.]*\\.?/gi, "")
      .replace(/completely clean video,[^.]*\\.?/gi, "no text, no watermark.")
      .replace(/no subtitles, no text, no captions, no words, no watermark, no logo, no signature, clean visual aesthetics/gi, "no text, no watermark")
      .replace(/\\s+/g, " ")
      .trim();

    // 2) Soften policy + physics risk terms (keep story readable)
    const replacements: [RegExp, string][] = [
      // weapons / combat
      [/\\b(futuristic\\s+)?(electromagnetic\\s+pulse\\s+)?gun(s)?\\b/gi, "handheld device"],
      [/\\bweapon(s)?\\b/gi, "device"],
      [/\\bpistol|sidearm|firearm\\b/gi, "device"],
      [/\\baim(s|ing|ed)?\\b/gi, "looks toward"],
      [/\\bpoint(ing|ed)? (his|her|the) (gun|weapon|device)\\b/gi, "holds a device"],
      [/\\bdraw(s|ing|n)? (a |his |her )?(gun|weapon|sidearm)\\b/gi, "reaches to the side"],
      [/\\brapid 180-degree turn\\b/gi, "turns carefully"],
      [/\\bspins? around quickly\\b/gi, "turns around"],
      [/\\bcombat|battle-worn|tactical assault\\b/gi, "weathered"],
      // violence / explosion
      [/\\bexplod(e|es|ing|ed|sion)s?\\b/gi, "bright flash"],
      [/\\bblinding white light that engulfs\\b/gi, "soft bright light fills"],
      [/\\bblood(y)?\\b/gi, "red"],
      [/\\bgore|horrific|horror\\b/gi, "mysterious"],
      [/\\bkill(ed|ing)?\\b/gi, "stop"],
      [/\\bshout(s|ed|ing)? with an intense, fearful expression\\b/gi, "calls out urgently"],
      [/\\bshouts?\\b/gi, "calls out"],
      // child + uncanny (keep character, reduce trigger density)
      [/\\bsoulless\\b/gi, "distant"],
      [/\\bhollow eyes\\b/gi, "quiet eyes"],
      [/\\bvacant eyes\\b/gi, "calm eyes"],
      [/\\bdigital code flowing (within |in )?(her )?pupils\\b/gi, "a faint glimmer in her eyes"],
      [/\\bunhealthy pale\\b/gi, "pale"],
      [/\\btattered, dirty(, wet)? white lace dress\\b/gi, "simple worn white dress"],
      [/\\btattered gothic lace dress\\b/gi, "simple worn dress"],
      [/\\bfragile young female child, approximately 8-10 years old\\b/gi, "young girl"],
      [/\\bapproximately 8 years old\\b/gi, "young"],
      // motion physics helpers
      [/\\bcoat flails with the momentum\\b/gi, "coat shifts lightly"],
      [/\\bwater droplets violently spray\\b/gi, "raindrops fall"],
      [/\\bveins bulge\\b/gi, "expression tightens"],
    ];
    for (const [re, rep] of replacements) p = p.replace(re, rep);

    // 3) Prefer one clear action beat
    p = p
      .replace(/\\bthen\\b/gi, ".")
      .replace(/\\s*\\.\\s*\\./g, ".")
      .replace(/\\s+/g, " ")
      .trim();

    // 4) Length budget — image tighter than video
    const kind = (opts && opts.kind) || "image";
    const maxLen = kind === "video" ? 850 : 520;
    if (p.length > maxLen) {
      p = p.substring(0, maxLen).replace(/[,;:\\s]+$/, "");
    }

    // 5) Light family-friendly prefix for image path only
    if (kind === "image") {
      const style = String((opts && opts.artStyle) || "").toLowerCase();
      const anime = /anime|動漫|cartoon|插畫|key visual/.test(style + " " + p);
      const prefix = anime
        ? "Soft anime key visual, clear character, steady pose, family-friendly. "
        : "Clear cinematic illustration, steady pose, family-friendly. ";
      if (!p.toLowerCase().startsWith("soft anime") && !p.toLowerCase().startsWith("clear cinematic")) {
        p = prefix + p;
      }
      if (!/no text/i.test(p)) p += " no text, no watermark.";
    } else {
      if (!/no text/i.test(p)) p += " no text, no watermark.";
      // Bias video toward slow, stable motion
      if (!/slow|steady|gentle|still|stands|walks slowly/i.test(p)) {
        p = "Slow steady motion. " + p;
      }
    }

    return p.replace(/\\s+/g, " ").trim();
  } catch {
    return String(raw || "").substring(0, 500);
  }
}

`;

// Insert helper near other compact helpers or early anchors
const anchors = [
  'NUCLEAR_COMPACT_SAFE_V2',
  'function compactPromptForAgnes(',
  'function compactPromptForAgnesVideo(',
  'const app = express();',
  'async function rewritePromptToBeSafe',
];
let inserted = false;
for (const a of anchors) {
  const idx = src.indexOf(a);
  if (idx !== -1) {
    // insert before the anchor line start
    let lineStart = idx;
    while (lineStart > 0 && src[lineStart - 1] !== '\n') lineStart--;
    src = src.slice(0, lineStart) + HELPER + src.slice(lineStart);
    inserted = true;
    changed = true;
    console.log('[grok_stable] inserted helper before', a.substring(0, 40));
    break;
  }
}
if (!inserted) {
  src = HELPER + src;
  changed = true;
  console.log('[grok_stable] prepended helper');
}

// ---- Wire into image path: after compactPrimary or before generateAgnesImageUrl ----
if (!src.includes('GROK_STABLE_IMAGE_APPLY')) {
  if (src.includes('const compactPrimary =')) {
    src = src.replace(
      /const compactPrimary = \([^;]+\);/,
      (m) =>
        m +
        `
      // GROK_STABLE_IMAGE_APPLY
      const stablePrimary = typeof applyGrokStablePrompt === "function"
        ? applyGrokStablePrompt(compactPrimary, { kind: "image", artStyle })
        : compactPrimary;
      console.log("[Toonflow] Grok-stable image prompt:", (compactPrimary || "").length, "→", (stablePrimary || "").length);`
    );
    // Prefer stablePrimary in the following generateAgnesImageUrl(compactPrimary
    if (src.includes('generateAgnesImageUrl(compactPrimary')) {
      src = src.replace(/generateAgnesImageUrl\(compactPrimary/g, 'generateAgnesImageUrl(stablePrimary');
    }
    changed = true;
    console.log('[grok_stable] wired image path via compactPrimary');
  } else if (src.includes('generateAgnesImageUrl(')) {
    // Wrap first enhancedPrompt-style call site more generically is risky; add log-only marker
    console.log('[grok_stable] compactPrimary not found; will rely on compact + nuclear guards');
  }
}

// ---- Wire into video path near AGGRESSIVE_VIDEO_COMPACT or finalPrompt ----
if (!src.includes('GROK_STABLE_VIDEO_APPLY')) {
  if (src.includes('AGGRESSIVE_VIDEO_COMPACT_V1')) {
    src = src.replace(
      'AGGRESSIVE_VIDEO_COMPACT_V1',
      `AGGRESSIVE_VIDEO_COMPACT_V1
    // GROK_STABLE_VIDEO_APPLY
    if (typeof applyGrokStablePrompt === "function") {
      const beforeStable = (finalPrompt || "").length;
      finalPrompt = applyGrokStablePrompt(finalPrompt, { kind: "video" });
      console.log("[Toonflow] Grok-stable video prompt:", beforeStable, "→", (finalPrompt || "").length);
      if (activeTask && activeTask.logs) {
        activeTask.logs.push("[SYSTEM] Grok穩健模式：已簡化影片 Prompt（" + beforeStable + " → " + (finalPrompt || "").length + "）");
      }
    }`
    );
    changed = true;
    console.log('[grok_stable] wired video path after AGGRESSIVE_VIDEO_COMPACT');
  } else if (src.includes('finalPrompt') && src.includes('agnes_video.py')) {
    const assign = 'activeTask.prompt = finalPrompt';
    if (src.includes(assign)) {
      src = src.replace(
        assign,
        `// GROK_STABLE_VIDEO_APPLY
      if (typeof applyGrokStablePrompt === "function") {
        finalPrompt = applyGrokStablePrompt(finalPrompt, { kind: "video" });
      }
      ${assign}`
      );
      changed = true;
      console.log('[grok_stable] wired video path near activeTask.prompt');
    }
  }
}

if (changed) {
  fs.writeFileSync(serverPath, src, 'utf8');
  console.log('[grok_stable] server.ts written');
} else {
  console.log('[grok_stable] no file changes');
}

console.log('fix_grok_stable_mode done.');
