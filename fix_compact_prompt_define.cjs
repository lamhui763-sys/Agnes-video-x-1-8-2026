/**
 * fix_compact_prompt_define.cjs
 * Guarantees compactPromptForAgnes() exists in server.ts.
 * Previous prebuild sometimes injected the CALL but missed the FUNCTION → ReferenceError.
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.log('[fix_compact] server.ts missing');
  process.exit(0);
}

let src = fs.readFileSync(serverPath, 'utf8');

if (src.includes('function compactPromptForAgnes(')) {
  console.log('[fix_compact] compactPromptForAgnes already defined');
  process.exit(0);
}

const helper = `
// Compact + SFW sanitize for Agnes image API (avoids content_policy from long MANDATE blocks)
function compactPromptForAgnes(raw: string, opts?: { isAvatar?: boolean; artStyle?: string }): string {
  let p = (raw || "").trim();
  // Strip bracket mandates that often false-trigger filters
  p = p
    .replace(/\\[NEGATIVE PROMPT MANDATE:[^\\]]*\\]/gi, "")
    .replace(/\\[CLOTHING CONSISTENCY MANDATE\\][^\\[]*/gi, "")
    .replace(/\\[CRITICAL[^\\]]*\\]/gi, "")
    .replace(/Absolutely NO text[^.]*\\.?/gi, "no text, no watermark.")
    .replace(/DO NOT generate[^.]*\\.?/gi, "")
    .replace(/\\s+/g, " ")
    .trim();

  // Soften words that commonly trip policy
  const softMap: [RegExp, string][] = [
    [/\\bblood(y)?\\b/gi, "red paint"],
    [/\\bgore\\b/gi, "drama"],
    [/\\bkill(ed|ing)?\\b/gi, "defeat"],
    [/\\bstab(bing|bed)?\\b/gi, "pointing"],
    [/\\bweapon(s)?\\b/gi, "prop"],
    [/\\bgun(s)?\\b/gi, "tool"],
    [/\\bknife|knives\\b/gi, "utensil"],
    [/\\bnaked|nude|nsfw\\b/gi, "fully clothed"],
    [/\\bseductive|sensual|erotic\\b/gi, "gentle"],
    [/\\bterror|horrific|horror\\b/gi, "mysterious"],
  ];
  for (const [re, rep] of softMap) p = p.replace(re, rep);

  const style = (opts?.artStyle || "").toLowerCase();
  const fairy =
    /fairy|童話|anime|動漫|cartoon|卡通|illustration|插畫|ghibli|兒童/.test(style + " " + p);

  const prefix = opts?.isAvatar
    ? "Safe for work character design sheet, family-friendly, clean studio portrait. "
    : fairy
      ? "Wholesome children's fairy-tale illustration, soft watercolor anime style, family-friendly, G-rated, warm lighting, no violence. "
      : "Safe for work, family-friendly, non-violent, clean artistic illustration. ";

  const suffix = " Masterpiece, high quality, completely clean image, no text, no watermark, no logo.";

  const budget = 850 - prefix.length - suffix.length;
  if (p.length > budget) p = p.substring(0, budget);

  return (prefix + p + suffix).replace(/\\s+/g, " ").trim();
}

`;

// Prefer insert before rewritePromptToBeSafe or before generate-image endpoint
const anchors = [
  '// Helper to rewrite prompt to be 100% compliant with safety policies',
  'async function rewritePromptToBeSafe',
  '// Toonflow Feature: Storyboard Image Generator using Agnes AI',
  'app.post("/api/generate-image"',
  'async function generateAgnesImageUrl(',
];

let inserted = false;
for (const a of anchors) {
  const idx = src.indexOf(a);
  if (idx !== -1) {
    src = src.slice(0, idx) + helper + src.slice(idx);
    inserted = true;
    console.log('[fix_compact] injected compactPromptForAgnes before:', a.substring(0, 50));
    break;
  }
}

if (!inserted) {
  // Last resort: after first few imports / near top of helpers
  const afterImports = src.indexOf('const app = express()');
  if (afterImports !== -1) {
    src = src.slice(0, afterImports) + helper + src.slice(afterImports);
    inserted = true;
    console.log('[fix_compact] injected near const app = express()');
  }
}

if (inserted) {
  fs.writeFileSync(serverPath, src, 'utf8');
  console.log('[fix_compact] server.ts written');
} else {
  console.log('[fix_compact] FAILED to find any insert point');
}

console.log('fix_compact_prompt_define done.');
