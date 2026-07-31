/**
 * fix_remove_fake_image_engines.cjs
 * 1) Remove Nano→Agnes and Mistral→Agnes avatar buttons (they only remap to Agnes)
 * 2) Lift estimateDialogueDuration hard cap 3-5 so server 8-10s can stick
 */
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'src', 'App.tsx');
if (!fs.existsSync(appPath)) {
  console.log('[fake-engines] App.tsx missing');
  process.exit(0);
}

let src = fs.readFileSync(appPath, 'utf8');
let n = 0;

// --- Remove Nano→Agnes button block ---
const nanoBtn = /\s*<button\s+\n?\s*onClick=\{\(\) => handleGenerateAvatar\(char\.id, 'nanobanana'\)\}[\s\S]*?<span>Nano→Agnes<\/span>\s*<\/button>/;
if (nanoBtn.test(src)) {
  src = src.replace(nanoBtn, '');
  n++;
  console.log('[fake-engines] removed Nano→Agnes button');
}

// --- Remove Mistral→Agnes button block ---
const mistralBtn = /\s*<button\s+\n?\s*onClick=\{\(\) => handleGenerateAvatar\(char\.id, 'mistral'\)\}[\s\S]*?<span>Mistral→Agnes<\/span>\s*<\/button>/;
if (mistralBtn.test(src)) {
  src = src.replace(mistralBtn, '');
  n++;
  console.log('[fake-engines] removed Mistral→Agnes button');
}

// Change grid from 2 cols to keep Agnes + Gemini + Upload looking OK
// Leave grid-cols-2 as is (Agnes + Gemini on first row, Upload full width)

// --- Lift duration cap: was Math.max(3, Math.min(5, maxDur)) ---
if (src.includes('Math.max(3, Math.min(5, maxDur))')) {
  src = src.replace(
    'Math.max(3, Math.min(5, maxDur))',
    'Math.max(5, Math.min(10, maxDur || 8))'
  );
  n++;
  console.log('[fake-engines] lifted estimateDialogueDuration cap to 5-10');
}

// Comment that said 3 and 5
src = src.replace(
  /Cap strictly between 3 and 5 seconds to guarantee maximum stability for Agnes video rendering/g,
  'Prefer 5–10 seconds; Agnes is more stable near 5s but longer shots allowed when action needs it'
);

// Full-auto path default 5 → prefer server duration, fallback 8
src = src.replace(
  /const finalDuration = s\.durationSeconds && typeof s\.durationSeconds === 'number'\s*\n?\s*\? s\.durationSeconds\s*\n?\s*: 5;/g,
  `const finalDuration = (typeof s.durationSeconds === 'number' && s.durationSeconds >= 5)
              ? Math.min(10, s.durationSeconds)
              : 8;`
);

// Also coerce string numbers from API
if (!src.includes('DURATION_CLIENT_COERCE_V1')) {
  src = src.replace(
    /const finalDuration = s\.durationSeconds && typeof s\.durationSeconds === 'number'\s*\n?\s*\? s\.durationSeconds\s*\n?\s*: estimatedDuration;/,
    `// DURATION_CLIENT_COERCE_V1
          const serverDur = Number(s.durationSeconds);
          const finalDuration = Number.isFinite(serverDur) && serverDur >= 5
            ? Math.min(10, Math.max(5, Math.round(serverDur)))
            : Math.min(10, Math.max(5, estimatedDuration || 8));`
  );
  n++;
  console.log('[fake-engines] client coerces server durationSeconds');
}

fs.writeFileSync(appPath, src, 'utf8');
console.log('[fake-engines] patches applied:', n);
console.log('fix_remove_fake_image_engines done.');
