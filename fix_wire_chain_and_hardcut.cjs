/**
 * fix_wire_chain_and_hardcut.cjs
 *
 * Precise surgical edits to App.tsx:
 * 1) Import SequentialChainMode
 * 2) Extend activeTab union with "chain"
 * 3) Add sidebar tab button 「一鏡接一鏡」
 * 4) Render SequentialChainMode panel with correct activeProject / updateActiveProject
 * 5) In handleGenerateVideoKeyframes: when next scene has different character/gender,
 *    clear endImageUrl and inject HARD_CUT anti-morph prompt (prevent woman→man morph)
 */
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'src', 'App.tsx');
if (!fs.existsSync(appPath)) {
  console.log('[wire] App.tsx missing');
  process.exit(0);
}

let src = fs.readFileSync(appPath, 'utf8');
let changes = 0;

if (src.includes('WIRE_CHAIN_HARDCUT_V2')) {
  console.log('[wire] already applied V2');
  process.exit(0);
}

// ------------------------------------------------------------------
// 1. Import SequentialChainMode
// ------------------------------------------------------------------
if (!src.includes("from './components/SequentialChainMode'") && !src.includes('from "./components/SequentialChainMode"')) {
  if (src.includes('import VideoGallery from "./components/VideoGallery";')) {
    src = src.replace(
      'import VideoGallery from "./components/VideoGallery";',
      'import VideoGallery from "./components/VideoGallery";\nimport SequentialChainMode from "./components/SequentialChainMode";'
    );
    changes++;
    console.log('[wire] + SequentialChainMode import');
  } else if (src.includes("import VideoGallery from './components/VideoGallery';")) {
    src = src.replace(
      "import VideoGallery from './components/VideoGallery';",
      "import VideoGallery from './components/VideoGallery';\nimport SequentialChainMode from './components/SequentialChainMode';"
    );
    changes++;
    console.log('[wire] + SequentialChainMode import (single quotes)');
  }
}

// ------------------------------------------------------------------
// 2. Import hard-cut helpers from promptBuilder
// ------------------------------------------------------------------
if (!src.includes('shouldUseHardCut')) {
  if (src.includes('from "./lib/projectUtils"')) {
    src = src.replace(
      'from "./lib/projectUtils"',
      'from "./lib/projectUtils";\nimport { shouldUseHardCut, HARD_CUT_INSTRUCTION } from "./lib/promptBuilder"'
    );
    changes++;
    console.log('[wire] + shouldUseHardCut import');
  } else if (src.includes("from './lib/projectUtils'")) {
    src = src.replace(
      "from './lib/projectUtils'",
      "from './lib/projectUtils';\nimport { shouldUseHardCut, HARD_CUT_INSTRUCTION } from './lib/promptBuilder'"
    );
    changes++;
  }
}

// ------------------------------------------------------------------
// 3. Extend activeTab type to include "chain" and "scenes_keyframes"
// ------------------------------------------------------------------
{
  const tabTypeRe = /useState<"novel" \| "characters" \| "scenes" \| "scenes_ext" \| "gallery" \| "experience">\("scenes"\)/;
  if (tabTypeRe.test(src)) {
    src = src.replace(
      tabTypeRe,
      'useState<"novel" | "characters" | "scenes" | "scenes_ext" | "scenes_keyframes" | "chain" | "gallery" | "experience">("scenes")'
    );
    changes++;
    console.log('[wire] + activeTab type includes chain + scenes_keyframes');
  } else if (src.includes('useState<"novel"') && !src.includes('"chain"')) {
    // broader replace
    src = src.replace(
      /useState<"novel"[^>]+>\("scenes"\)/,
      'useState<"novel" | "characters" | "scenes" | "scenes_ext" | "scenes_keyframes" | "chain" | "gallery" | "experience">("scenes")'
    );
    changes++;
    console.log('[wire] + activeTab type (broad)');
  }
}

// ------------------------------------------------------------------
// 4. Sidebar tab button — insert after 「AI 分鏡劇本首尾幀」button block
// ------------------------------------------------------------------
if (!src.includes('一鏡接一鏡') && !src.includes("setActiveTab(\"chain\")") && !src.includes("setActiveTab('chain')")) {
  // Find the keyframes tab button by its unique onClick
  const keyframesBtnMarker = 'onClick={() => setActiveTab("scenes_keyframes")}';
  const idx = src.indexOf(keyframesBtnMarker);
  if (idx !== -1) {
    // Find the closing </button> after this onClick (the keyframes tab button)
    const after = src.slice(idx);
    const closeBtn = after.indexOf('</button>');
    if (closeBtn !== -1) {
      const insertAt = idx + closeBtn + '</button>'.length;
      const tabBtn = `

                  {/* WIRE_CHAIN_HARDCUT_V2 — 一鏡接一鏡 tab */}
                  <button
                    onClick={() => setActiveTab("chain")}
                    className={ \`w-full py-3.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-between gap-1.5 cursor-pointer border \${
                      activeTab === "chain"
                        ? "bg-gradient-to-r from-cyan-600 to-indigo-600 text-white border-cyan-500 shadow-lg shadow-cyan-600/20"
                        : "bg-slate-950/60 text-slate-400 hover:text-slate-200 border-slate-850 hover:border-slate-800"
                    }\`}
                  >
                    <span className="flex items-center gap-2">
                      <Film className="w-4 h-4 text-cyan-400" />
                      <span>一鏡接一鏡 🔗</span>
                    </span>
                  </button>`;
      src = src.slice(0, insertAt) + tabBtn + src.slice(insertAt);
      changes++;
      console.log('[wire] + sidebar tab button 一鏡接一鏡');
    }
  } else {
    console.log('[wire] WARNING: could not find scenes_keyframes tab button');
  }
}

// ------------------------------------------------------------------
// 5. Render panel when activeTab === "chain"
//    Insert before gallery tab content block
// ------------------------------------------------------------------
if (!src.includes('activeTab === "chain"') || !src.includes('<SequentialChainMode')) {
  const galleryMarker = '{/* ============ TAB: GALLERY ============ */}';
  const galleryIdx = src.indexOf(galleryMarker);
  if (galleryIdx !== -1) {
    const panel = `
              {/* ============ TAB: 一鏡接一鏡 CHAIN (WIRE_CHAIN_HARDCUT_V2) ============ */}
              {activeTab === "chain" && activeProject && (
                <div className="space-y-6">
                  <SequentialChainMode
                    project={activeProject}
                    artStyle={activeProject.artStyle}
                    cameraMotion={activeProject.cameraMotion}
                    onUpdateScenes={(newScenes) => {
                      updateActiveProject({ scenes: newScenes });
                    }}
                  />
                </div>
              )}

`;
    src = src.slice(0, galleryIdx) + panel + src.slice(galleryIdx);
    changes++;
    console.log('[wire] + SequentialChainMode panel');
  } else {
    console.log('[wire] WARNING: gallery marker not found for panel insert');
  }
}

// ------------------------------------------------------------------
// 6. Hard-cut in handleGenerateVideoKeyframes
//    After endImageUrl is assigned from next scene, check character mismatch
// ------------------------------------------------------------------
{
  // Look for the block that sets endImageUrl in keyframes path
  // Pattern from App.tsx:
  //   if (index < activeProject.scenes.length - 1) {
  //     const nextScene = activeProject.scenes[index + 1];
  //     const foundEndImage = nextScene.imageUrlKeyframes || ...
  //     ...
  //     endImageUrl = foundEndImage;
  //   }
  // We inject hard-cut check right after endImageUrl = foundEndImage;

  const endAssign = 'endImageUrl = foundEndImage;';
  // There may be multiple; target the one inside handleGenerateVideoKeyframes context
  // by looking for unique nearby string "Initiating Agnes Start-End Keyframes"
  const kfMarker = 'Initiating Agnes Start-End Keyframes Video call';
  const kfIdx = src.indexOf(kfMarker);
  if (kfIdx !== -1 && !src.includes('HARD_CUT_KEYFRAMES_CHECK_V2')) {
    // Search backward from kfMarker for the last endImageUrl = foundEndImage before it
    const before = src.slice(0, kfIdx);
    const lastEndAssign = before.lastIndexOf(endAssign);
    if (lastEndAssign !== -1) {
      const inject = `endImageUrl = foundEndImage;

      // HARD_CUT_KEYFRAMES_CHECK_V2: different character/gender → no end frame morph
      {
        const nextSc = activeProject.scenes[index + 1];
        const curCharName = (targetScene.character || '').trim();
        const nextCharName = (nextSc?.character || '').trim();
        const curCharObj = activeProject.characters.find(c => (c.name || '').trim().toLowerCase() === curCharName.toLowerCase());
        const nextCharObj = activeProject.characters.find(c => (c.name || '').trim().toLowerCase() === nextCharName.toLowerCase());
        if (typeof shouldUseHardCut === 'function' && shouldUseHardCut(curCharName, nextCharName, curCharObj?.gender, nextCharObj?.gender)) {
          console.log('[HardCut/Keyframes] Different characters:', curCharName, '→', nextCharName, '— omitting end frame to prevent morph');
          endImageUrl = undefined;
          showToast('⚡ 偵測到不同角色，已切換 Hard Cut（避免變臉變形）', 'info');
        }
      }`;
      src = src.slice(0, lastEndAssign) + inject + src.slice(lastEndAssign + endAssign.length);
      changes++;
      console.log('[wire] + hard-cut check in handleGenerateVideoKeyframes');
    }
  }

  // Also inject HARD_CUT_INSTRUCTION into enhancedPrompt when endImageUrl was cleared
  // Find enhancedPrompt construction in keyframes function and append when no end frame due to hard cut
  if (!src.includes('HARD_CUT_PROMPT_INJECT_V2') && src.includes('HARD_CUT_INSTRUCTION')) {
    // After building enhancedPrompt in keyframes, if !endImageUrl and different chars, append instruction
    const kfPromptMarker = 'Style: ${characterObj?.artStyle || activeProject.artStyle}. Character: ${targetScene.character}, Description: ${charDesc}. ${videoProactiveInjections}';
    // There may be several similar lines; only touch the one near keyframes
    const kfIdx2 = src.indexOf('Initiating Agnes Start-End Keyframes Video call');
    if (kfIdx2 !== -1) {
      // Find enhancedPrompt assignment after kf start that ends with videoProactiveInjections`
      const region = src.slice(kfIdx2, kfIdx2 + 15000);
      const promptEnd = region.indexOf('${videoProactiveInjections}`;');
      if (promptEnd !== -1) {
        const absPos = kfIdx2 + promptEnd + '${videoProactiveInjections}`;'.length;
        const injectPrompt = `
      // HARD_CUT_PROMPT_INJECT_V2
      if (!endImageUrl && typeof HARD_CUT_INSTRUCTION === 'string') {
        enhancedPrompt += '. ' + HARD_CUT_INSTRUCTION;
      }`;
        src = src.slice(0, absPos) + injectPrompt + src.slice(absPos);
        changes++;
        console.log('[wire] + HARD_CUT_INSTRUCTION append when no end frame');
      }
    }
  }
}

// ------------------------------------------------------------------
// 7. Also harden standard handleGenerateVideo when activeTab === scenes_keyframes
// ------------------------------------------------------------------
{
  // In handleGenerateVideo, when activeTab === "scenes_keyframes" and endImageUrl is set
  const stdMarker = 'else if (activeTab === "scenes_keyframes")';
  const stdIdx = src.indexOf(stdMarker);
  if (stdIdx !== -1 && !src.includes('HARD_CUT_STD_KEYFRAMES_V2')) {
    // Find endImageUrl = foundEndImage within ~800 chars after this marker
    const region = src.slice(stdIdx, stdIdx + 1200);
    const endPos = region.indexOf('endImageUrl = foundEndImage;');
    if (endPos !== -1) {
      const abs = stdIdx + endPos;
      const inject = `endImageUrl = foundEndImage;
        // HARD_CUT_STD_KEYFRAMES_V2
        {
          const nextSc = freshActiveProject.scenes[index + 1];
          const curN = (targetScene.character || '').trim();
          const nextN = (nextSc?.character || '').trim();
          const curO = freshActiveProject.characters?.find((c: any) => (c.name || '').trim().toLowerCase() === curN.toLowerCase());
          const nextO = freshActiveProject.characters?.find((c: any) => (c.name || '').trim().toLowerCase() === nextN.toLowerCase());
          if (typeof shouldUseHardCut === 'function' && shouldUseHardCut(curN, nextN, curO?.gender, nextO?.gender)) {
            console.log('[HardCut] std keyframes path: different chars', curN, '→', nextN);
            endImageUrl = undefined;
          }
        }`;
      src = src.slice(0, abs) + inject + src.slice(abs + 'endImageUrl = foundEndImage;'.length);
      changes++;
      console.log('[wire] + hard-cut in handleGenerateVideo keyframes branch');
    }
  }
}

// Mark applied
if (!src.includes('WIRE_CHAIN_HARDCUT_V2')) {
  src = '// WIRE_CHAIN_HARDCUT_V2\n' + src;
  changes++;
}

fs.writeFileSync(appPath, src, 'utf8');
console.log('[wire] App.tsx written, changes:', changes);
console.log('fix_wire_chain_and_hardcut done.');
