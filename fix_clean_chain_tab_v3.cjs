/**
 * fix_clean_chain_tab_v3.cjs
 *
 * 修復 v2 插入錯誤導致「AI 自動導演」同「已生成影片庫」重疊 / 結構破壞。
 *
 * 策略：
 * 1. 刪除所有含 CLEAN_CHAIN_TAB / AUTO_DIRECTOR / 錯誤注入嘅 button 區塊
 * 2. 用更安全方式，喺「AI 分鏡劇本首尾幀」之後、「已生成影片庫」之前，插入完整獨立 button
 * 3. 確保 panel 仍然正確渲染
 */

const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'src', 'App.tsx');
if (!fs.existsSync(appPath)) {
  console.log('[clean-v3] App.tsx missing');
  process.exit(0);
}

let src = fs.readFileSync(appPath, 'utf8');
let changes = 0;

if (src.includes('CLEAN_CHAIN_TAB_V3')) {
  console.log('[clean-v3] already applied');
  process.exit(0);
}

// ------------------------------------------------------------------
// 1. 強力清除所有錯誤 / 重疊的 AI 自動導演 按鈕注入
// ------------------------------------------------------------------
const removePatterns = [
  // v1/v2 標記區塊
  /\{\/\*\s*CLEAN_CHAIN_TAB_V2[\s\S]*?<\/button>/g,
  /\{\/\*\s*AUTO_DIRECTOR_TAB_V1[\s\S]*?<\/button>/g,
  /\{\/\*\s*WIRE_CHAIN_HARDCUT_V2[\s\S]*?<\/button>/g,
  /\{\/\*\s*SEQUENTIAL_CHAIN_TAB_V1[\s\S]*?<\/button>/g,
  // 任何 onClick 設 autoDirector 或 chain 而且文字含 AI 自動導演 的 button
  /<button[^>]*onClick=\{\(\)\s*=>\s*setActiveTab\(["']autoDirector["']\)\}[\s\S]*?<\/button>/g,
  /<button[^>]*onClick=\{\(\)\s*=>\s*setActiveTab\(["']chain["']\)\}[\s\S]*?<\/button>/g,
];

for (const re of removePatterns) {
  const before = src.length;
  src = src.replace(re, '');
  if (src.length !== before) {
    changes++;
    console.log('[clean-v3] removed broken autoDirector/chain button block');
  }
}

// 清掉可能殘留的標記註解
src = src.replace(/\{\/\*\s*CLEAN_CHAIN_TAB_V2[^]*?\*\/\}/g, '');
src = src.replace(/\{\/\*\s*AUTO_DIRECTOR_TAB_V1[^]*?\*\/\}/g, '');

// ------------------------------------------------------------------
// 2. 確保 import
// ------------------------------------------------------------------
if (!src.includes('SequentialChainMode')) {
  const candidates = [
    'import VideoGallery from "./components/VideoGallery";',
    "import VideoGallery from './components/VideoGallery';",
  ];
  for (const c of candidates) {
    if (src.includes(c)) {
      src = src.replace(c, c + "\nimport SequentialChainMode from './components/SequentialChainMode';");
      changes++;
      console.log('[clean-v3] + import');
      break;
    }
  }
}

// ------------------------------------------------------------------
// 3. 確保 activeTab 類型
// ------------------------------------------------------------------
if (!src.includes('"autoDirector"')) {
  const typeRe = /useState<"novel"[^>]+>\("scenes"\)/;
  if (typeRe.test(src)) {
    src = src.replace(
      typeRe,
      'useState<"novel" | "characters" | "scenes" | "scenes_ext" | "scenes_keyframes" | "autoDirector" | "chain" | "gallery" | "experience">("scenes")'
    );
    changes++;
    console.log('[clean-v3] + autoDirector type');
  }
}

// ------------------------------------------------------------------
// 4. 安全插入獨立「AI 自動導演」按鈕
//    策略：搵「AI 分鏡劇本首尾幀」button 的結束 </button>，喺其後插入
// ------------------------------------------------------------------
if (!src.includes('setActiveTab("autoDirector")') && !src.includes("setActiveTab('autoDirector')")) {
  // 優先用 scenes_keyframes 的 onClick 定位
  const kfMarkers = [
    'onClick={() => setActiveTab("scenes_keyframes")}',
    "onClick={() => setActiveTab('scenes_keyframes')}",
    'AI 分鏡劇本首尾幀',
  ];

  let inserted = false;
  for (const marker of kfMarkers) {
    const idx = src.indexOf(marker);
    if (idx === -1) continue;

    // 由 marker 向後搵第一個 </button>
    const after = src.slice(idx);
    const closeIdx = after.indexOf('</button>');
    if (closeIdx === -1) continue;

    const insertAt = idx + closeIdx + '</button>'.length;

    const tabBtn = `

                  {/* CLEAN_CHAIN_TAB_V3 — 獨立 AI 自動導演 */}
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
                  </button>`;

    src = src.slice(0, insertAt) + tabBtn + src.slice(insertAt);
    changes++;
    inserted = true;
    console.log('[clean-v3] + clean independent AI 自動導演 button after keyframes');
    break;
  }

  if (!inserted) {
    console.log('[clean-v3] WARNING: could not insert independent button');
  }
}

// ------------------------------------------------------------------
// 5. 確保 panel 存在
// ------------------------------------------------------------------
if (!src.includes('<SequentialChainMode') || !src.includes('activeTab === "autoDirector"')) {
  // 先清掉舊 panel 避免重複
  src = src.replace(/\{\/\*[\s\S]*?TAB:\s*AI 自動導演[\s\S]*?<\/div>\s*\)\}/g, '');

  const panelMarkers = [
    '{/* ============ TAB: GALLERY ============ */}',
    'activeTab === "gallery"',
    "activeTab === 'gallery'",
  ];

  for (const marker of panelMarkers) {
    const idx = src.indexOf(marker);
    if (idx === -1) continue;

    const panel = `
              {/* ============ TAB: AI 自動導演 (CLEAN_CHAIN_TAB_V3) ============ */}
              {(activeTab === "autoDirector" || activeTab === "chain") && activeProject && (
                <div className="space-y-6">
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
    console.log('[clean-v3] + SequentialChainMode panel');
    break;
  }
}

// ------------------------------------------------------------------
// 6. 標記
// ------------------------------------------------------------------
if (!src.includes('CLEAN_CHAIN_TAB_V3')) {
  src = '// CLEAN_CHAIN_TAB_V3\n' + src;
  changes++;
}

fs.writeFileSync(appPath, src, 'utf8');
console.log('[clean-v3] App.tsx written, changes:', changes);
console.log('fix_clean_chain_tab_v3 done.');
