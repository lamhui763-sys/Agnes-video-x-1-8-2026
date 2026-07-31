/**
 * fix_app_jsx_cleanup.cjs
 * Runs LAST in prebuild.
 *
 * Previous version was too aggressive: it stripped the closing `)}` of
 * {activeTab === "scenes_ext" && ( ... )} which then caused:
 *   Expected ")" but found "{" at KEYFRAMES tab marker.
 *
 * Strategy now:
 * 1) Only strip ONE inner dangling )} right after SequentialChainMode panel
 *    if it looks like leftover from zero-scene conditional.
 * 2) Guarantee scenes_ext tab is closed before the next tab comment.
 */
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'src', 'App.tsx');
if (!fs.existsSync(appPath)) {
  console.log('[jsx-cleanup] App.tsx missing');
  process.exit(0);
}

let src = fs.readFileSync(appPath, 'utf8');
let n = 0;

// ---- 1) Only strip )} that is IMMEDIATELY after </SequentialChainMode> ... </div>
// (the inner zero-scene conditional leftover). Do NOT strip farther away.
{
  const re = /(<\/SequentialChainMode>\s*\n?\s*<\/div>)(\s*\)\s*\})(\s*<\/div>)/g;
  // Pattern: SequentialChainMode + div + )} + another div  → keep outer structure,
  // remove only the middle )}
  if (re.test(src)) {
    src = src.replace(re, '$1$3');
    n++;
    console.log('[jsx-cleanup] removed inner )} between SequentialChainMode panel and outer div');
  }
}

// ---- 2) Ensure scenes_ext tab closes before KEYFRAMES tab marker ----
{
  const markers = [
    '{/* ============ TAB: STORYBOARD SCENES KEYFRAMES',
    'TAB: STORYBOARD SCENES KEYFRAMES',
    'activeTab === "scenes_keyframes"',
    "activeTab === 'scenes_keyframes'",
  ];
  let nextIdx = -1;
  let used = '';
  for (const m of markers) {
    const i = src.indexOf(m);
    if (i !== -1 && (nextIdx === -1 || i < nextIdx)) {
      nextIdx = i;
      used = m;
    }
  }

  if (nextIdx !== -1) {
    // Look at the 120 chars before the next tab
    const windowStart = Math.max(0, nextIdx - 120);
    const before = src.slice(windowStart, nextIdx);
    const trimmed = before.replace(/\s+$/, '');

    // If already ends with )} or )}  we are fine
    if (/\)\s*\}\s*$/.test(trimmed)) {
      console.log('[jsx-cleanup] scenes_ext already closed before next tab');
    } else {
      // Insert )} right before the next tab comment/condition
      // Prefer inserting after the last </div> in the window
      const lastDiv = before.lastIndexOf('</div>');
      if (lastDiv !== -1) {
        const abs = windowStart + lastDiv + '</div>'.length;
        src = src.slice(0, abs) + '\n                )}\n' + src.slice(abs);
        n++;
        console.log('[jsx-cleanup] inserted missing )} to close scenes_ext before', used);
      } else {
        src = src.slice(0, nextIdx) + ')}\n' + src.slice(nextIdx);
        n++;
        console.log('[jsx-cleanup] inserted )} at next-tab boundary');
      }
    }
  } else {
    console.log('[jsx-cleanup] KEYFRAMES tab marker not found — skip close check');
  }
}

// ---- 3) Remove empty zero-scene shell if present ----
{
  const re2 = /\{\s*activeProject\.scenes\.length\s*===\s*0\s*&&\s*\(\s*\)\s*\}/g;
  if (re2.test(src)) {
    src = src.replace(re2, '');
    n++;
    console.log('[jsx-cleanup] removed empty zero-scene conditional');
  }
}

fs.writeFileSync(appPath, src, 'utf8');
console.log('[jsx-cleanup] done, changes:', n);
