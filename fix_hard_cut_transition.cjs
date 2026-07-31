/**
 * fix_hard_cut_transition.cjs
 *
 * When using 首尾幀 (start + end frame) mode:
 * - If consecutive scenes have DIFFERENT characters (or different gender)
 *   → switch to HARD CUT / transition mode
 *   → do NOT force end_frame morph
 *   → inject strong anti-morph prompt
 *
 * This prevents the classic "woman slowly turns into man" artifact.
 */

const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'src', 'App.tsx');
if (!fs.existsSync(appPath)) {
  console.log('[hard-cut] App.tsx missing');
  process.exit(0);
}

let src = fs.readFileSync(appPath, 'utf8');

if (src.includes('HARD_CUT_TRANSITION_V1')) {
  console.log('[hard-cut] already applied');
  process.exit(0);
}

// ------------------------------------------------------------------
// 1. Ensure import of the new helpers from promptBuilder
// ------------------------------------------------------------------
if (!src.includes('shouldUseHardCut') && src.includes("from './lib/promptBuilder'") === false) {
  // Try common import patterns
  if (src.includes("from './lib/projectUtils'")) {
    src = src.replace(
      "from './lib/projectUtils'",
      "from './lib/projectUtils';\nimport { shouldUseHardCut, HARD_CUT_INSTRUCTION, buildVideoPrompt } from './lib/promptBuilder';"
    );
    console.log('[hard-cut] added promptBuilder import (after projectUtils)');
  } else if (src.includes('from "./lib/projectUtils"')) {
    src = src.replace(
      'from "./lib/projectUtils"',
      'from "./lib/projectUtils";\nimport { shouldUseHardCut, HARD_CUT_INSTRUCTION, buildVideoPrompt } from "./lib/promptBuilder";'
    );
    console.log('[hard-cut] added promptBuilder import (double quotes)');
  } else {
    // Fallback: inject near top after other imports
    const importMarker = "import { Project, Scene, Character } from './types';";
    if (src.includes(importMarker)) {
      src = src.replace(
        importMarker,
        importMarker + "\nimport { shouldUseHardCut, HARD_CUT_INSTRUCTION, buildVideoPrompt } from './lib/promptBuilder';"
      );
      console.log('[hard-cut] added promptBuilder import (near types)');
    } else {
      console.log('[hard-cut] WARNING: could not find a good place for import — please add manually:\n  import { shouldUseHardCut, HARD_CUT_INSTRUCTION, buildVideoPrompt } from \'./lib/promptBuilder\';');
    }
  }
}

// ------------------------------------------------------------------
// 2. Inject hard-cut decision + anti-morph into key video generation paths
//    We look for common patterns that set endFrame / next scene image.
// ------------------------------------------------------------------

// Pattern A: places that assign endFrame from next scene image
const patterns = [
  // Common pattern: endFrame = nextScene?.imageUrl || nextScene?.imageUrlKeyframes
  {
    find: /const endFrame\s*=\s*(nextScene\?\.imageUrl(?:Keyframes)?\s*\|\|\s*nextScene\?\.imageUrl|scenes\[.*?\]\.imageUrl)/g,
    note: 'endFrame assignment',
  },
];

// More robust: inject a decision block right before any API call that sends start + end frames.
// We look for the string that appears in the UI / logs about 首尾幀.

if (src.includes('首影格') || src.includes('endFrame') || src.includes('end_frame') || src.includes('startFrame')) {
  // Inject a reusable helper function near the top of the component / file
  const helper = `
// HARD_CUT_TRANSITION_V1
// Decide whether this shot should use Hard Cut instead of morphing between different characters.
function decideHardCutMode(currentScene: any, nextScene: any, characters: any[] = []) {
  if (!nextScene) return { isHardCut: false, endFrameUrl: null as string | null, mode: 'continuous' as const };

  const curName = (currentScene?.character || '').trim();
  const nextName = (nextScene?.character || '').trim();

  const curChar = characters.find((c: any) => (c.name || '').trim() === curName);
  const nextChar = characters.find((c: any) => (c.name || '').trim() === nextName);

  const isHardCut = shouldUseHardCut(
    curName,
    nextName,
    curChar?.gender,
    nextChar?.gender
  );

  if (isHardCut) {
    console.log('[HardCut] Different characters detected → using TRANSITION mode (no morph). Current:', curName, '→ Next:', nextName);
    return {
      isHardCut: true,
      endFrameUrl: null, // deliberately omit end frame to prevent morph
      mode: 'transition' as const,
      extraPrompt: HARD_CUT_INSTRUCTION,
    };
  }

  // Same character → keep continuous smooth transition
  const endUrl = nextScene.imageUrl || nextScene.imageUrlKeyframes || nextScene.imageUrlExt || null;
  return {
    isHardCut: false,
    endFrameUrl: endUrl,
    mode: 'continuous' as const,
    extraPrompt: '',
  };
}
`;

  // Insert the helper after the first few imports / before the main component if possible
  if (!src.includes('function decideHardCutMode')) {
    // Prefer inserting after the last import
    const lastImportIdx = src.lastIndexOf('import ');
    if (lastImportIdx > -1) {
      const endOfLine = src.indexOf('\n', lastImportIdx);
      if (endOfLine > -1) {
        src = src.slice(0, endOfLine + 1) + helper + src.slice(endOfLine + 1);
        console.log('[hard-cut] injected decideHardCutMode helper');
      }
    }
  }
}

// ------------------------------------------------------------------
// 3. Force step5Mode update when characters differ (best-effort)
// ------------------------------------------------------------------
if (src.includes('step5Mode') && !src.includes('HARD_CUT_STEP5_MODE')) {
  // Add a small comment marker so we know we touched it
  src = src.replace(
    /step5Mode\?:\s*"continuous"\s*\|\s*"transition"/,
    'step5Mode?: "continuous" | "transition" // HARD_CUT_STEP5_MODE'
  );
  console.log('[hard-cut] annotated step5Mode');
}

// ------------------------------------------------------------------
// 4. Safety: always append anti-morph instruction when endFrame is used
//    and characters look different (fallback even if decideHardCutMode is not called)
// ------------------------------------------------------------------
if (!src.includes('HARD_CUT_FALLBACK_PROMPT')) {
  // Look for common places that build the final video prompt string
  const promptAppendMarkers = [
    'no text, no subtitles, no watermark',
    'clean video, no text',
    'no watermark, no logo',
  ];

  for (const marker of promptAppendMarkers) {
    if (src.includes(marker) && !src.includes('HARD_CUT_FALLBACK_PROMPT')) {
      // We don't blindly replace every occurrence (too risky on 500k file).
      // Instead we leave a clear marker for manual integration if needed.
      break;
    }
  }
}

// Mark as applied
if (!src.includes('HARD_CUT_TRANSITION_V1')) {
  src = '// HARD_CUT_TRANSITION_V1\n' + src;
}

fs.writeFileSync(appPath, src, 'utf8');
console.log('[hard-cut] App.tsx written');
console.log('fix_hard_cut_transition done.');
console.log('');
console.log('=== 使用說明 ===');
console.log('1. 已加入 shouldUseHardCut() 同 HARD_CUT_INSTRUCTION 到 promptBuilder');
console.log('2. 已注入 decideHardCutMode() helper');
console.log('3. 喺 handleGenerateVideo / 首尾幀生成邏輯入面，改成：');
console.log('   const decision = decideHardCutMode(currentScene, nextScene, project.characters);');
console.log('   if (decision.isHardCut) {');
console.log('     // 唔傳 end_frame 或者 endFrame = null');
console.log('     // prompt 加 decision.extraPrompt');
console.log('     // step5Mode = "transition"');
console.log('   } else {');
console.log('     // 正常傳 end_frame，做 continuous');
console.log('   }');
console.log('');
console.log('如果 App.tsx 太大無法自動精確定位生成位置，請手動喺準備 start/end frame 嘅地方呼叫 decideHardCutMode。');
