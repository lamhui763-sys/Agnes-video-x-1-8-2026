/**
 * fix_auto_director_tab.cjs
 *
 * 正確接線：將「一鏡接一鏡 / AI 自動導演」做成左側 sidebar 的獨立頂層 tab，
 * 絕對不要塞進「AI 分鏡劇本首尾幀」下面。
 *
 * 目標：
 * 1. import SequentialChainMode
 * 2. activeTab 類型加入 "autoDirector" | "chain"
 * 3. 在 sidebar 新增獨立按鈕（優先放在 角色一致性 之後 / 已生成影片庫 之前）
 * 4. 當 activeTab === "autoDirector" 或 "chain" 時渲染 SequentialChainMode
 * 5. 移除任何錯誤塞在 keyframes 區塊裡的舊注入（如果有）
 */

const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'src', 'App.tsx');
if (!fs.existsSync(appPath)) {
  console.log('[auto-director] App.tsx missing');
  process.exit(0);
}

let src = fs.readFileSync(appPath, 'utf8');
let changes = 0;

if (src.includes('AUTO_DIRECTOR_TAB_V1')) {
  console.log('[auto-director] already applied');
  process.exit(0);
}

// ------------------------------------------------------------------
// 1. Import
// ------------------------------------------------------------------
if (!src.includes("SequentialChainMode")) {
  const candidates = [
    'import VideoGallery from "./components/VideoGallery";',
    "import VideoGallery from './components/VideoGallery';",
    'import ExperienceLibrary from "./components/ExperienceLibrary";',
    "import ExperienceLibrary from './components/ExperienceLibrary';",
  ];
  for (const c of candidates) {
    if (src.includes(c)) {
      src = src.replace(
        c,
        c + '\nimport SequentialChainMode from \'./components/SequentialChainMode\';'
      );
      changes++;
      console.log('[auto-director] + import');
      break;
    }
  }
}

// ------------------------------------------------------------------
// 2. Extend activeTab type
// ------------------------------------------------------------------
{
  // Try common patterns
  const patterns = [
    /useState<"novel" \| "characters" \| "scenes" \| "scenes_ext" \| "scenes_keyframes" \| "gallery" \| "experience">\("scenes"\)/,
    /useState<"novel" \| "characters" \| "scenes" \| "scenes_ext" \| "gallery" \| "experience">\("scenes"\)/,
    /useState<"novel"[^>]+>\("scenes"\)/,
  ];
  for (const re of patterns) {
    if (re.test(src) && !src.includes('"autoDirector"')) {
      src = src.replace(
        re,
        'useState<"novel" | "characters" | "scenes" | "scenes_ext" | "scenes_keyframes" | "autoDirector" | "chain" | "gallery" | "experience">("scenes")'
      );
      changes++;
      console.log('[auto-director] + activeTab type');
      break;
    }
  }
}

// ------------------------------------------------------------------
// 3. Sidebar button — 獨立頂層，放在「已生成影片庫」之前
// ------------------------------------------------------------------
if (!src.includes('一鏡接一鏡') && !src.includes('AI 自動導演') && !src.includes('setActiveTab("autoDirector")')) {
  // Prefer insert before 已生成影片庫
  const galleryBtnMarkers = [
    '已生成影片庫',
    'onClick={() => setActiveTab("gallery")}',
    "onClick={() => setActiveTab('gallery')}",
  ];

  let inserted = false;
  for (const marker of galleryBtnMarkers) {
    const idx = src.indexOf(marker);
    if (idx === -1) continue;

    // Walk backward a bit to find a safe place (beginning of the button block)
    // Simple approach: insert a full button right before the gallery button text occurrence
    const tabBtn = `
                  {/* AUTO_DIRECTOR_TAB_V1 — 獨立頂層「AI 自動導演 / 一鏡接一鏡」 */}
                  <button
                    type="button"
                    onClick={() => setActiveTab("autoDirector")}
                    className={\`w-full py-3.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-between gap-1.5 cursor-pointer border \${
                      activeTab === "autoDirector" || activeTab === "chain"
                        ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white border-violet-500 shadow-lg shadow-violet-600/25"
                        : "bg-slate-950/60 text-slate-400 hover:text-slate-200 border-slate-850 hover:border-slate-800"
                    }\`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-base">🎬</span>
                      <span>AI 自動導演</span>
                    </span>
                  </button>
`;
    // Insert before the marker
    src = src.slice(0, idx) + tabBtn + src.slice(idx);
    changes++;
    inserted = true;
    console.log('[auto-director] + independent sidebar button before', marker);
    break;
  }

  if (!inserted) {
    console.log('[auto-director] WARNING: could not locate gallery marker for button');
  }
} else if (src.includes('一鏡接一鏡') || src.includes('AI 自動導演')) {
  console.log('[auto-director] sidebar button already present (or similar text exists)');
}

// ------------------------------------------------------------------
// 4. Render panel — 獨立區塊，不要塞在 keyframes 裡面
// ------------------------------------------------------------------
if (!src.includes('<SequentialChainMode') || !src.includes('activeTab === "autoDirector"')) {
  // Prefer insert before GALLERY tab content
  const panelMarkers = [
    '{/* ============ TAB: GALLERY ============ */}',
    '{/* ============ TAB: 已生成影片庫',
    'activeTab === "gallery"',
    "activeTab === 'gallery'",
  ];

  let panelInserted = false;
  for (const marker of panelMarkers) {
    const idx = src.indexOf(marker);
    if (idx === -1) continue;

    const panel = `
              {/* ============ TAB: AI 自動導演 / 一鏡接一鏡 (AUTO_DIRECTOR_TAB_V1) ============ */}
              {(activeTab === "autoDirector" || activeTab === "chain") && activeProject && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <SequentialChainMode
                    project={activeProject}
                    artStyle={activeProject.artStyle}
                    cameraMotion={activeProject.cameraMotion}
                    onUpdateScenes={(newScenes) => {
                      if (typeof updateActiveProject === 'function') {
                        updateActiveProject({ scenes: newScenes });
                      }
                    }}
                  />
                </div>
              )}

`;
    src = src.slice(0, idx) + panel + src.slice(idx);
    changes++;
    panelInserted = true;
    console.log('[auto-director] + SequentialChainMode panel before', marker);
    break;
  }

  if (!panelInserted) {
    console.log('[auto-director] WARNING: panel insert failed — manual wiring needed');
  }
}

// ------------------------------------------------------------------
// 5. Mark applied
// ------------------------------------------------------------------
if (!src.includes('AUTO_DIRECTOR_TAB_V1')) {
  src = '// AUTO_DIRECTOR_TAB_V1\n' + src;
  changes++;
}

fs.writeFileSync(appPath, src, 'utf8');
console.log('[auto-director] App.tsx written, changes:', changes);
console.log('fix_auto_director_tab done.');
console.log('');
console.log('=== 使用方式 ===');
console.log('1. node fix_auto_director_tab.cjs');
console.log('2. 左側 sidebar 會出現獨立「AI 自動導演」按鈕');
console.log('3. 點擊後進入一鏡接一鏡連續生成模式（開始 → 接下去）');
console.log('4. 完全不影響「AI 分鏡劇本首尾幀」原本流程');
