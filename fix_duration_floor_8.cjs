/**
 * fix_duration_floor_8.cjs
 * User still sees all 5s after deploy. Nuclear post-process on EVERY split response:
 * durationSeconds < 8 → 8; multi-step → 10.
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.log('[floor8] server.ts missing');
  process.exit(0);
}

let src = fs.readFileSync(serverPath, 'utf8');

// Always rewrite boostSceneDurations to nuclear version
const NUCLEAR_FN = `
// FORCE_DURATION_BOOST_V1 / DURATION_FLOOR_8_V1
function boostSceneDurations(scenes: any[]): any[] {
  if (!Array.isArray(scenes) || scenes.length === 0) return scenes;
  const multi =
    /(then|slowly|walks|takes|looks|turns|opens|closes|holds|places|reaches|先|再|然後|走向|取出|抬頭|轉身|放入|合上|摩挲)/i;
  console.log("[Toonflow] DURATION_FLOOR_8: boosting", scenes.length, "scenes");
  return scenes.map((sc, idx) => {
    const text = \`\${sc.actionPrompt || ""} \${sc.visualPrompt || ""} \${sc.transitionPrompt || ""}\`;
    let d = parseInt(String(sc.durationSeconds), 10);
    if (isNaN(d)) d = 8;
    // Never ship 5s defaults to client
    if (d < 8) d = 8;
    if (multi.test(text)) d = 10;
    if (d > 10) d = 10;
    // Middle narrative beats prefer full 10
    if (idx > 0 && idx < scenes.length - 1 && d < 10) d = 10;
    sc.durationSeconds = d;
    return sc;
  });
}

`;

if (src.includes('function boostSceneDurations')) {
  src = src.replace(
    /function boostSceneDurations\([\s\S]*?\n\}\n/,
    NUCLEAR_FN
  );
  console.log('[floor8] replaced boostSceneDurations body');
} else {
  const anchor = 'app.post("/api/split-novel"';
  const idx = src.indexOf(anchor);
  if (idx !== -1) {
    src = src.slice(0, idx) + NUCLEAR_FN + src.slice(idx);
  } else {
    src = NUCLEAR_FN + src;
  }
  console.log('[floor8] inserted boostSceneDurations');
}

// Ensure every scenes response goes through boost
if (!src.includes('boostSceneDurations(parsedData)')) {
  src = src.replace(
    /res\.json\(\{\s*scenes:\s*parsedData\s*\}\)/g,
    'res.json({ scenes: boostSceneDurations(parsedData) })'
  );
  console.log('[floor8] wired parsedData');
}
if (!src.includes('boostSceneDurations(fallbackScenes)')) {
  src = src.replace(
    /res\.json\(\{\s*scenes:\s*fallbackScenes/g,
    'res.json({ scenes: boostSceneDurations(fallbackScenes)'
  );
}

// Patch Gemini schema description if still says 3-5
src = src.replace(
  /between 3 and 5\. Maximum 5 seconds\./gi,
  'between 8 and 10. Prefer 10 when there is a sequence of actions.'
);
src = src.replace(
  /Estimated duration in seconds for this scene \([^)]*\)/gi,
  'Estimated duration in seconds for this scene (8 to 10)'
);

fs.writeFileSync(serverPath, src, 'utf8');
console.log('[floor8] server.ts written');
console.log('fix_duration_floor_8 done.');
