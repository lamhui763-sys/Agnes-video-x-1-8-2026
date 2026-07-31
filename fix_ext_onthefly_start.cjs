/**
 * fix_ext_onthefly_start.cjs
 *
 * 還原點1 補完：喺「AI 分鏡劇本延長」區塊，當 scenes.length === 0 時，
 * 顯示 SequentialChainMode（開始 / 接下去），而唔係只叫人去「一鍵 AI 拆解」。
 *
 * 規則：
 * - 已有分鏡（按過一鍵拆解）→ 保持原本一鍵依序延長流程
 * - 未有分鏡 → 即場「開始」生成鏡頭1，再手動/自動接下去
 * - 唔改側邊欄「AI 自動導演」分頁邏輯
 * - autoMode 跟住 strictWorkflowLock（嚴格鎖開啟 = 自動化）
 */
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'src', 'App.tsx');
if (!fs.existsSync(appPath)) {
  console.log('[ext-start] App.tsx missing');
  process.exit(0);
}

let src = fs.readFileSync(appPath, 'utf8');
let changes = 0;

if (src.includes('EXT_ONTHEFLY_START_V1')) {
  console.log('[ext-start] already applied');
  process.exit(0);
}

// ------------------------------------------------------------------
// 1. Ensure SequentialChainMode import
// ------------------------------------------------------------------
if (!src.includes('SequentialChainMode')) {
  const importCandidates = [
    'import VideoGallery from "./components/VideoGallery";',
    "import VideoGallery from './components/VideoGallery';",
    'import SceneItem from "./components/SceneItem";',
    "import SceneItem from './components/SceneItem';",
  ];
  for (const c of importCandidates) {
    if (src.includes(c)) {
      src = src.replace(
        c,
        c + '\nimport SequentialChainMode from "./components/SequentialChainMode";'
      );
      changes++;
      console.log('[ext-start] + SequentialChainMode import');
      break;
    }
  }
}

// ------------------------------------------------------------------
// 2. Replace empty-state block ONLY inside scenes_ext tab
// ------------------------------------------------------------------

const EMPTY_MSG =
  '此專案尚未拆解分鏡。請在上方原著小說頁面輸入劇本文字，並按下「一鍵 AI 拆解分鏡」生成豐富的故事劇本！';

const NEW_EMPTY = `{/* EXT_ONTHEFLY_START_V1 — 0場時即場開始 */}
                      {activeProject.scenes.length === 0 && (
                          <div className="space-y-4">
                            <div className="text-center p-6 border border-dashed border-emerald-500/30 rounded-2xl text-emerald-300/80 text-xs bg-emerald-950/20">
                              尚未預先拆解分鏡。可直接用下方「開始」即場生成鏡頭 1（對照原著小說），再按「接下去」或開啟嚴格鎖自動連續生成。
                              <br />
                              <span className="text-slate-500">如想一次拆好全部鏡頭，請到「原著小說」按「一鍵 AI 拆解分鏡」。</span>
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
                          </div>
                        )}`;

const extMarkers = [
  'activeTab === "scenes_ext"',
  "activeTab === 'scenes_ext'",
  'AI 分鏡劇本延長 (影格無縫連貫模式)',
  '一鍵自動依序延長生成所有分鏡',
];

let replaced = false;
for (const marker of extMarkers) {
  const mIdx = src.indexOf(marker);
  if (mIdx === -1) continue;

  const regionStart = mIdx;
  const regionEnd = Math.min(src.length, mIdx + 80000);
  const region = src.slice(regionStart, regionEnd);
  const emptyIdx = region.indexOf(EMPTY_MSG);
  if (emptyIdx === -1) continue;

  const absEmpty = regionStart + emptyIdx;

  let start = absEmpty;
  const backSlice = src.slice(Math.max(0, absEmpty - 400), absEmpty);
  const condMatch = backSlice.lastIndexOf('{activeProject.scenes.length === 0');
  if (condMatch === -1) {
    const alt = backSlice.lastIndexOf('activeProject.scenes.length === 0');
    if (alt === -1) continue;
    start = Math.max(0, absEmpty - 400) + alt;
    if (src[start - 1] === '{') start = start - 1;
  } else {
    start = Math.max(0, absEmpty - 400) + condMatch;
  }

  let end = absEmpty + EMPTY_MSG.length;
  const forward = src.slice(end, end + 500);
  const closeDiv = forward.indexOf('</div>');
  if (closeDiv === -1) continue;
  end = end + closeDiv + '</div>'.length;
  const afterClose = src.slice(end, end + 80);
  const parenClose = afterClose.search(/\)\s*\}/);
  if (parenClose === -1) continue;
  end = end + parenClose + afterClose.slice(parenClose).match(/\)\s*\}/)[0].length;

  src = src.slice(0, start) + NEW_EMPTY + src.slice(end);
  changes++;
  replaced = true;
  console.log('[ext-start] replaced empty state in scenes_ext with SequentialChainMode');
  break;
}

if (!replaced) {
  const seqBtn = src.indexOf('一鍵自動依序延長生成所有分鏡');
  if (seqBtn !== -1) {
    const after = src.slice(seqBtn);
    const eIdx = after.indexOf(EMPTY_MSG);
    if (eIdx !== -1) {
      const abs = seqBtn + eIdx;
      const back = src.slice(Math.max(0, abs - 350), abs);
      let start = abs;
      const c = back.lastIndexOf('{activeProject.scenes.length === 0');
      if (c !== -1) start = Math.max(0, abs - 350) + c;

      let end = abs + EMPTY_MSG.length;
      const fwd = src.slice(end, end + 400);
      const d = fwd.indexOf('</div>');
      if (d !== -1) {
        end = end + d + '</div>'.length;
        const ac = src.slice(end, end + 60);
        const pc = ac.search(/\)\s*\}/);
        if (pc !== -1) {
          end = end + pc + ac.slice(pc).match(/\)\s*\}/)[0].length;
          src = src.slice(0, start) + NEW_EMPTY + src.slice(end);
          changes++;
          replaced = true;
          console.log('[ext-start] fallback replace after 一鍵自動依序延長');
        }
      }
    }
  }
}

if (!replaced) {
  console.log('[ext-start] WARNING: could not locate empty-state block in scenes_ext');
}

if (!src.includes('EXT_ONTHEFLY_START_V1')) {
  src = '// EXT_ONTHEFLY_START_V1\n' + src;
  changes++;
}

fs.writeFileSync(appPath, src, 'utf8');
console.log('[ext-start] App.tsx written, changes:', changes);
console.log('fix_ext_onthefly_start done.');
