/**
 * fix_force_duration_boost.cjs
 * Even after rules, model still returns all 5s. Post-process after split:
 * - If actionPrompt/visual has multi-step cues → 8 or 10
 * - Never leave every scene at 5 when story has sequence verbs
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.log('[boost] server.ts missing');
  process.exit(0);
}

let src = fs.readFileSync(serverPath, 'utf8');
if (src.includes('FORCE_DURATION_BOOST_V1')) {
  console.log('[boost] already present');
  process.exit(0);
}

const BOOST_FN = `
// FORCE_DURATION_BOOST_V1
function boostSceneDurations(scenes: any[]): any[] {
  if (!Array.isArray(scenes) || scenes.length === 0) return scenes;
  const multiStep =
    /(then|after that|slowly|walks|takes out|looks up|turns|opens|closes|holds|places|reaches|先|再|然後|走向|取出|抬頭|轉身|放入|合上)/i;
  const staticOnly =
    /(stands still|standing still|empty|wide shot of empty|fade to black|只有雨|空蕩)/i;

  return scenes.map((sc, idx) => {
    const text = `${sc.actionPrompt || ''} ${sc.visualPrompt || ''} ${sc.transitionPrompt || ''} ${sc.directorNotes || ''}`;
    let d = parseInt(sc.durationSeconds, 10);
    if (isNaN(d) || d < 5) d = 5;
    if (d > 10) d = 10;

    // If model parked everything at 5, lift by content
    if (d <= 5) {
      if (multiStep.test(text) && !staticOnly.test(text)) {
        d = idx === scenes.length - 1 ? 8 : 9;
      } else if (multiStep.test(text)) {
        d = 7;
      } else {
        d = 6; // still slightly above pure 5 default
      }
    }
    // Prefer 10 for rich middle beats
    if (d >= 8 && multiStep.test(text) && (text.match(multiStep) || []).length >= 1) {
      const hits = (text.match(new RegExp(multiStep.source, 'gi')) || []).length;
      if (hits >= 3) d = 10;
      else if (hits >= 2) d = Math.max(d, 9);
    }
    sc.durationSeconds = d;
    return sc;
  });
}

`;

// Insert function near split-novel or before app.post split
if (!src.includes('function boostSceneDurations')) {
  const anchor = 'app.post("/api/split-novel"';
  const idx = src.indexOf(anchor);
  if (idx !== -1) {
    src = src.slice(0, idx) + BOOST_FN + src.slice(idx);
    console.log('[boost] inserted boostSceneDurations');
  } else {
    src = BOOST_FN + src;
    console.log('[boost] prepended boost function');
  }
}

// Apply before res.json scenes in split-novel
let applied = false;
if (src.includes('res.json({ scenes: parsedData })')) {
  src = src.replace(
    /res\.json\(\{ scenes: parsedData \}\)/g,
    'res.json({ scenes: typeof boostSceneDurations === "function" ? boostSceneDurations(parsedData) : parsedData })'
  );
  applied = true;
  console.log('[boost] wired res.json scenes boost');
}
if (src.includes('res.json({ scenes: fallbackScenes')) {
  src = src.replace(
    /res\.json\(\{ scenes: fallbackScenes, isFallback: true \}\)/,
    'res.json({ scenes: typeof boostSceneDurations === "function" ? boostSceneDurations(fallbackScenes) : fallbackScenes, isFallback: true })'
  );
  applied = true;
}

// Also fix any remaining hard max 5 in post-clamp
src = src.replace(/if \(d > 5\) d = 5;/g, 'if (d > 10) d = 10;');

fs.writeFileSync(serverPath, src, 'utf8');
console.log('[boost] server.ts written, applied=', applied);
console.log('fix_force_duration_boost done.');
