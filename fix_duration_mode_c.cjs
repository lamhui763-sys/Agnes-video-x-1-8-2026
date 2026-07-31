/**
 * fix_duration_mode_c.cjs
 * Mode C: static / single beat → 5–6s; multi-step action → 8–10s.
 * Replaces nuclear floor-8 for all scenes.
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.log('[modeC] server.ts missing');
  process.exit(0);
}

let src = fs.readFileSync(serverPath, 'utf8');

const MODE_C_FN = `
// DURATION_MODE_C_V1 — static 5-6s, action sequence 8-10s
function boostSceneDurations(scenes: any[]): any[] {
  if (!Array.isArray(scenes) || scenes.length === 0) return scenes;
  const multi =
    /(then|after that|slowly|walks|takes out|takes|looks up|turns|opens|closes|holds|places|reaches|pulls|puts|先|再|然後|走向|取出|抬頭|轉身|放入|合上|摩挲|放下|走近)/i;
  const staticOnly =
    /(stands still|standing still|empty rooftop|wide shot of empty|fade to black|motionless|只有雨|空蕩|遠景固定|空鏡)/i;

  console.log("[Toonflow] DURATION_MODE_C: classifying", scenes.length, "scenes");
  return scenes.map((sc, idx) => {
    const text = \`\${sc.actionPrompt || ""} \${sc.visualPrompt || ""} \${sc.transitionPrompt || ""} \${sc.directorNotes || ""}\`;
    const hits = (text.match(new RegExp(multi.source, "gi")) || []).length;
    const isStatic = staticOnly.test(text) && hits === 0;

    let d: number;
    if (isStatic || hits === 0) {
      // Single beat / atmosphere
      d = idx === scenes.length - 1 ? 6 : 5;
    } else if (hits === 1) {
      d = 7;
    } else if (hits === 2) {
      d = 8;
    } else {
      d = 10; // 3+ micro-steps
    }

    // Respect model if it already chose a sensible 6–10 for action
    const raw = parseInt(String(sc.durationSeconds), 10);
    if (!isNaN(raw) && raw >= 6 && raw <= 10 && hits >= 1) {
      d = Math.max(d, raw > 10 ? 10 : raw);
    }
    if (d < 5) d = 5;
    if (d > 10) d = 10;
    sc.durationSeconds = d;
    return sc;
  });
}

`;

if (src.includes('function boostSceneDurations')) {
  src = src.replace(
    /function boostSceneDurations\([\s\S]*?\n\}\n/,
    MODE_C_FN
  );
  console.log('[modeC] replaced boostSceneDurations with MODE_C');
} else {
  const anchor = 'app.post("/api/split-novel"';
  const idx = src.indexOf(anchor);
  if (idx !== -1) src = src.slice(0, idx) + MODE_C_FN + src.slice(idx);
  else src = MODE_C_FN + src;
  console.log('[modeC] inserted MODE_C function');
}

// Ensure wired
if (!src.includes('boostSceneDurations(parsedData)')) {
  src = src.replace(
    /res\.json\(\{\s*scenes:\s*parsedData\s*\}\)/g,
    'res.json({ scenes: boostSceneDurations(parsedData) })'
  );
}

// Soften split rules text toward mode C
if (!src.includes('DURATION_MODE_C_V1')) {
  // marker already in function comment
}

fs.writeFileSync(serverPath, src, 'utf8');
console.log('[modeC] server.ts written');
console.log('fix_duration_mode_c done.');
