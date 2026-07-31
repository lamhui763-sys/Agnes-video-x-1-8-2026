/**
 * fix_nuclear_compact_safe.cjs
 *
 * FINAL safety net (run last among compact fixes):
 * 1. ALWAYS define compactPromptForAgnes + compactPromptForAgnesVideo near top of server.ts
 * 2. Replace bare calls with typeof-guarded safe calls so ReferenceError is impossible
 * 3. Idempotent via NUCLEAR_COMPACT_SAFE_V2 marker
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.log('[nuclear] server.ts missing');
  process.exit(0);
}

let src = fs.readFileSync(serverPath, 'utf8');
let changed = false;

const MARKER = 'NUCLEAR_COMPACT_SAFE_V2';

const SAFE_DEFS = `
// ${MARKER} — always-available compact helpers (never throw ReferenceError)
function compactPromptForAgnes(raw: string, opts?: { isAvatar?: boolean; artStyle?: string }): string {
  try {
    let p = String(raw || "").trim();
    p = p
      .replace(/\\[[^\\]]{0,100}MANDATE[^\\]]*\\]/gi, "")
      .replace(/\\[CRITICAL[^\\]]*\\]/gi, "")
      .replace(/Absolutely NO[^.]*\\.?/gi, "")
      .replace(/DO NOT generate[^.]*\\.?/gi, "")
      .replace(/You MUST[^.]*\\.?/gi, "")
      .replace(/completely clean video,[^.]*\\.?/gi, "no text, no watermark.")
      .replace(/no subtitles, no text, no captions, no words, no watermark, no logo, no signature, clean visual aesthetics/gi, "no text, no watermark")
      .replace(/\\s+/g, " ")
      .trim();
    p = p
      .replace(/\\bblood(y)?\\b/gi, "red")
      .replace(/\\bgore\\b/gi, "drama")
      .replace(/\\bkill(ed|ing)?\\b/gi, "stop")
      .replace(/\\bweapon(s)?\\b/gi, "prop")
      .replace(/\\bgun(s)?\\b/gi, "device")
      .replace(/\\bexplod(e|ing|sion)\\b/gi, "bright flash");
    const style = String((opts && opts.artStyle) || "").toLowerCase();
    const isAvatar = !!(opts && opts.isAvatar);
    const fairy = /fairy|童話|anime|動漫|cartoon|卡通|illustration|ghibli/.test(style + " " + p);
    const prefix = isAvatar
      ? "Clean character design, family-friendly studio portrait. "
      : fairy
        ? "Soft anime illustration, family-friendly, warm light. "
        : "Clean artistic illustration, family-friendly. ";
    const suffix = " High quality, no text, no watermark.";
    const budget = 550 - prefix.length - suffix.length;
    if (p.length > budget) p = p.substring(0, budget).replace(/[,;:\\s]+$/, "");
    return (prefix + p + suffix).replace(/\\s+/g, " ").trim();
  } catch (e) {
    return String(raw || "").substring(0, 500);
  }
}

function compactPromptForAgnesVideo(raw: string): string {
  try {
    let p = String(raw || "").trim();
    p = p
      .replace(/\\[[^\\]]{0,100}MANDATE[^\\]]*\\]/gi, "")
      .replace(/\\[CRITICAL[^\\]]*\\]/gi, "")
      .replace(/Absolutely NO[^.]*\\.?/gi, "")
      .replace(/completely clean video,[^.]*\\.?/gi, "no text, no watermark.")
      .replace(/no subtitles, no text, no captions, no words, no watermark, no logo, no signature, clean visual aesthetics/gi, "no text, no watermark")
      .replace(/\\s+/g, " ")
      .trim();
    if (p.length > 900) p = p.substring(0, 900).replace(/[,;:\\s]+$/, "");
    if (!/no text/i.test(p)) p += " no text, no watermark.";
    return p.replace(/\\s+/g, " ").trim();
  } catch (e) {
    return String(raw || "").substring(0, 900);
  }
}

`;

// 1) Ensure definitions exist (prefer early insert)
if (!src.includes(MARKER)) {
  // Remove older broken/duplicate definitions to avoid redeclare errors
  // Only remove if we will re-inject clean ones
  const removePatterns = [
    /\/\/ AGGRESSIVE_COMPACT_V1[\s\S]*?function compactPromptForAgnesVideo\([\s\S]*?\n\}\n+/,
    /\/\/ Compact \+ SFW sanitize for Agnes image API[\s\S]*?function compactPromptForAgnes\([\s\S]*?\n\}\n+/,
    /function compactPromptForAgnes\(raw: string[\s\S]*?\n\}\n+(?=function compactPromptForAgnesVideo|async function|function |\/\/)/,
  ];
  for (const re of removePatterns) {
    if (re.test(src)) {
      src = src.replace(re, '');
      console.log('[nuclear] removed old compact definition block');
      changed = true;
    }
  }

  // Also strip standalone old video fn if orphaned
  if (src.includes('function compactPromptForAgnesVideo(') && !src.includes(MARKER)) {
    src = src.replace(/function compactPromptForAgnesVideo\(raw: string\): string \{[\s\S]*?\n\}\n+/, '');
    changed = true;
    console.log('[nuclear] removed orphan compactPromptForAgnesVideo');
  }
  if (src.includes('function compactPromptForAgnes(') && !src.includes(MARKER)) {
    src = src.replace(/function compactPromptForAgnes\(raw: string[\s\S]*?\n\}\n+/, '');
    changed = true;
    console.log('[nuclear] removed orphan compactPromptForAgnes');
  }

  const earlyAnchors = [
    'const app = express();',
    'process.env.NODE_TLS_REJECT_UNAUTHORIZED',
    'function sanitizeApiKey',
    'dotenv.config();',
  ];
  let inserted = false;
  for (const a of earlyAnchors) {
    const idx = src.indexOf(a);
    if (idx !== -1) {
      src = src.slice(0, idx) + SAFE_DEFS + src.slice(idx);
      inserted = true;
      changed = true;
      console.log('[nuclear] injected SAFE defs before:', a.substring(0, 40));
      break;
    }
  }
  if (!inserted) {
    src = SAFE_DEFS + src;
    changed = true;
    console.log('[nuclear] prepended SAFE defs at file start');
  }
} else {
  console.log('[nuclear] SAFE defs marker already present');
}

// 2) Harden call sites: wrap any bare compactPromptForAgnes( that is NOT the function definition
// Replace generateAgnesImageUrl(compactPromptForAgnes(...)) is fine IF function exists.
// Extra safety: if somehow missing, use inline fallback expression.

if (!src.includes('SAFE_CALL_COMPACT_V2')) {
  // Patch the common FAIRY_SAFE / compactPrimary pattern
  if (src.includes('const compactPrimary = compactPromptForAgnes(enhancedPrompt')) {
    src = src.replace(
      /const compactPrimary = compactPromptForAgnes\(enhancedPrompt, \{ isAvatar, artStyle \}\);/g,
      `// SAFE_CALL_COMPACT_V2
      const compactPrimary = (typeof compactPromptForAgnes === "function"
        ? compactPromptForAgnes(enhancedPrompt, { isAvatar, artStyle })
        : String(enhancedPrompt || "").substring(0, 500));`
    );
    changed = true;
    console.log('[nuclear] hardened compactPrimary assignment');
  }

  // Patch direct generateAgnesImageUrl(compactPromptForAgnes(...)
  if (src.includes('generateAgnesImageUrl(compactPromptForAgnes(')) {
    src = src.replace(
      /generateAgnesImageUrl\(\s*compactPromptForAgnes\(([^,]+),\s*(\{[^}]*\})\s*\)/g,
      'generateAgnesImageUrl((typeof compactPromptForAgnes === "function" ? compactPromptForAgnes($1, $2) : String($1 || "").substring(0, 500))'
    );
    changed = true;
    console.log('[nuclear] hardened generateAgnesImageUrl(compactPromptForAgnes...) calls');
  }

  // Patch remaining bare generateAgnesImageUrl(enhancedPrompt without compact
  if (src.includes('generateAgnesImageUrl(enhancedPrompt,')) {
    src = src.replace(
      /generateAgnesImageUrl\(enhancedPrompt,/g,
      'generateAgnesImageUrl((typeof compactPromptForAgnes === "function" ? compactPromptForAgnes(enhancedPrompt, { isAvatar, artStyle }) : String(enhancedPrompt || "").substring(0, 500)),'
    );
    changed = true;
    console.log('[nuclear] wrapped bare enhancedPrompt Agnes calls');
  }
}

if (changed) {
  fs.writeFileSync(serverPath, src, 'utf8');
  console.log('[nuclear] server.ts written');
} else {
  console.log('[nuclear] no changes needed');
}

console.log('fix_nuclear_compact_safe done.');
