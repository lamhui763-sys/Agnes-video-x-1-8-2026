/**
 * fix_ext_onthefly_start_v2.cjs
 *
 * Bug: V1 only mounts SequentialChainMode when scenes.length===0.
 * After shot 1 is generated, scenes become 1 → panel unmounts →
 * 「接下去」消失、自動化中斷、狀態丟失。
 *
 * Fix: 在 scenes_ext 區塊永遠顯示 SequentialChainMode（開始/接下去），
 * 無論 0 場定已有場。已有預拆分鏡時，一鍵依序延長仍可用。
 */
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'src', 'App.tsx');
if (!fs.existsSync(appPath)) {
  console.log('[ext-v2] App.tsx missing');
  process.exit(0);
}

let src = fs.readFileSync(appPath, 'utf8');
let changes = 0;

if (src.includes('EXT_ONTHEFLY_START_V2')) {
  console.log('[ext-v2] already applied');
  process.exit(0);
}

// ------------------------------------------------------------------
// 1. Ensure import
// ------------------------------------------------------------------
if (!src.includes('SequentialChainMode')) {
  const candidates = [
    'import VideoGallery from "./components/VideoGallery";',
    "import VideoGallery from './components/VideoGallery';",
    'import SceneItem from "./components/SceneItem";',
  ];
  for (const c of candidates) {
    if (src.includes(c)) {
      src = src.replace(c, c + '\nimport SequentialChainMode from "./components/SequentialChainMode";');
      changes++;
      console.log('[ext-v2] + import');
      break;
    }
  }
}

// ------------------------------------------------------------------
// 2. Replace V1 block (only when 0 scenes) with ALWAYS-mounted panel
// ------------------------------------------------------------------
const ALWAYS_PANEL = `{/* EXT_ONTHEFLY_START_V2 — 永遠顯示接鏡面板，生成後唔會卸載 */}
                      <div className="space-y-3 mb-4">
                        <div className="text-[11px] text-emerald-300/90 bg-emerald-950/30 border border-emerald-500/20 rounded-xl px-4 py-2.5 leading-relaxed">
                          <strong>即場一鏡接一鏡</strong>：未拆解亦可按「開始」生成鏡頭1；完成後按「接下去」或開啟嚴格鎖自動連續生成。每鏡導演註記含【小說對應】段落。
                          {activeProject.scenes.length > 0 ? '（下方分鏡卡同步更新）' : '（請先確保原著小說已有內容）'}
                        </div>
                        <SequentialChainMode
                          project={activeProject}
                          artStyle={activeProject.artStyle}
                          cameraMotion={activeProject.cameraMotion}
                          autoMode={strictWorkflowLock}
                          onUpdateScenes={(newScenes) => {
                            updateActiveProject({ scenes: newScenes });
                          }}
                        />
                      </div>`;

// Try replace V1 block first
if (src.includes('EXT_ONTHEFLY_START_V1')) {
  // Match from V1 comment through SequentialChainMode closing of that block
  const v1Start = src.indexOf('{/* EXT_ONTHEFLY_START_V1');
  if (v1Start !== -1) {
    // Find the closing of the outer conditional: looking for pattern after SequentialChainMode
    let i = v1Start;
    let depth = 0;
    let foundOpen = false;
    // Simpler: find "EXT_ONTHEFLY_START_V1" then find matching end of the `{activeProject.scenes.length === 0 && (` block
    // Replace from V1 comment to the closing `)}` of that conditional
    const after = src.slice(v1Start);
    // End marker: after SequentialChainMode onUpdateScenes block closes
    const endMatch = after.match(/EXT_ONTHEFLY_START_V1[\s\S]*?<\/SequentialChainMode>\s*<\/div>\s*\)\s*\}/);
    if (endMatch) {
      src = src.slice(0, v1Start) + ALWAYS_PANEL + src.slice(v1Start + endMatch[0].length);
      changes++;
      console.log('[ext-v2] replaced V1 zero-only block with always-mounted panel');
    } else {
      // Broader replace
      const end2 = after.match(/EXT_ONTHEFLY_START_V1[\s\S]*?onUpdateScenes=\{\(newScenes\)\s*=>\s*\{[\s\S]*?\}\s*\}\s*\/>\s*<\/div>\s*\)\s*\}/);
      if (end2) {
        src = src.slice(0, v1Start) + ALWAYS_PANEL + src.slice(v1Start + end2[0].length);
        changes++;
        console.log('[ext-v2] replaced V1 block (broad match)');
      } else {
        console.log('[ext-v2] WARNING: found V1 marker but could not match full block');
      }
    }
  }
}

// If still no always panel, inject after the 一鍵自動依序延長 button section in scenes_ext
if (!src.includes('EXT_ONTHEFLY_START_V2')) {
  const markers = [
    '一鍵自動依序延長生成所有分鏡',
    'handleGenerateAllSequentially',
    'AI 分鏡劇本延長 (影格無縫連貫模式)',
  ];
  for (const m of markers) {
    const idx = src.indexOf(m);
    if (idx === -1) continue;
    // Find end of the banner card that contains this button — look for next "Scenes List" or "分鏡卡片列表"
    const after = src.slice(idx);
    const listIdx = after.search(/分鏡卡片列表|Scenes List Container|\{\/\* Scene Cards/);
    if (listIdx === -1) continue;
    const insertAt = idx + listIdx;
    src = src.slice(0, insertAt) + '\n' + ALWAYS_PANEL + '\n' + src.slice(insertAt);
    changes++;
    console.log('[ext-v2] injected always-mounted panel before scene list');
    break;
  }
}

// Remove leftover empty-only message in scenes_ext if still present after our panel
// (keep messages in scenes / keyframes tabs)

if (!src.includes('EXT_ONTHEFLY_START_V2')) {
  src = '// EXT_ONTHEFLY_START_V2\n' + src;
  changes++;
}

fs.writeFileSync(appPath, src, 'utf8');
console.log('[ext-v2] App.tsx written, changes:', changes);
console.log('fix_ext_onthefly_start_v2 done.');
