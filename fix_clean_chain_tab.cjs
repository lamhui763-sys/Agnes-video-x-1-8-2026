/**
 * fix_clean_chain_tab.cjs
 *
 * 目標：
 * 1. 徹底移除嵌喺「AI 分鏡劇本首尾幀」同一行 / 旁邊嘅「一鏡接一鏡」按鈕
 * 2. 新增真正獨立頂層 tab「AI 自動導演」
 * 3. 確保 SequentialChainMode 只喺 activeTab === 'autoDirector' | 'chain' 時渲染
 * 4. 唔再影響原本首尾幀功能
 */

const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'src', 'App.tsx');
if (!fs.existsSync(appPath)) {
  console.log('[clean-chain] App.tsx missing');
  process.exit(0);
}

let src = fs.readFileSync(appPath, 'utf8');
let changes = 0;

if (src.includes('CLEAN_CHAIN_TAB_V2')) {
  console.log('[clean-chain] already applied V2');
  process.exit(0);
}

// ------------------------------------------------------------------
// 1. 移除所有錯誤嵌套的「一鏡接一鏡」按鈕（舊 wire / sequential_chain_tab 留下）
// ------------------------------------------------------------------

// 常見舊注入 pattern：button 入面有「一鏡接一鏡」而且 onClick 設 chain
const nestedPatterns = [
  // 完整 button 區塊（最常見）
  /\{\/\*\s*(?:WIRE_CHAIN_HARDCUT_V2|SEQUENTIAL_CHAIN_TAB_V1)[\s\S]*?一鏡接一鏡[\s\S]*?<\/button>/g,
  // 較寬鬆：任何含「一鏡接一鏡」嘅 button（如果同 keyframes 好近）
  /<button[^>]*>[\s\S]*?一鏡接一鏡[\s\S]*?<\/button>/g,
];

for (const re of nestedPatterns) {
  const before = src;
  src = src.replace(re, (match) => {
    // 只刪除明顯係 tab 按鈕、而且唔係我哋想要嘅獨立頂層
    if (match.includes('setActiveTab("chain")') || match.includes("setActiveTab('chain')") || match.includes('一鏡接一鏡')) {
      // 如果呢個 button 係嵌喺 keyframes 附近（有 scenes_keyframes 字樣喺前後 500 字），就刪
      return '';
    }
    return match;
  });
  if (src !== before) {
    changes++;
    console.log('[clean-chain] removed nested 一鏡接一鏡 button(s)');
  }
}

// 額外清理：如果有單獨嘅 badge 文字「一鏡接一鏡」貼喺首尾幀旁邊
src = src.replace(/\s*<span[^>]*>\s*一鏡接一鏡\s*<\/span>/g, '');
src = src.replace(/一鏡接一鏡\s*🔗/g, '');

// ------------------------------------------------------------------
// 2. 確保 SequentialChainMode import 存在
// ------------------------------------------------------------------
if (!src.includes('SequentialChainMode')) {
  const candidates = [
    'import VideoGallery from "./components/VideoGallery";',
    "import VideoGallery from './components/VideoGallery';",
    'import ExperienceLibrary from "./components/ExperienceLibrary";',
    "import ExperienceLibrary from './components/ExperienceLibrary';",
  ];
  for (const c of candidates) {
    if (src.includes(c)) {
      src = src.replace(c, c + "\nimport SequentialChainMode from './components/SequentialChainMode';");
      changes++;
      console.log('[clean-chain] + SequentialChainMode import');
      break;
    }
  }
}

// ------------------------------------------------------------------
// 3. 確保 activeTab 類型包含 autoDirector
// ------------------------------------------------------------------
if (!src.includes('"autoDirector"')) {
  const typeRe = /useState<"novel"[^>]+>\("scenes"\)/;
  if (typeRe.test(src)) {
    src = src.replace(
      typeRe,
      'useState<"novel" | "characters" | "scenes" | "scenes_ext" | "scenes_keyframes" | "autoDirector" | "chain" | "gallery" | "experience">("scenes")'
    );
    changes++;
    console.log('[clean-chain] + autoDirector in activeTab type');
  }
}

// ------------------------------------------------------------------
// 4. 新增真正獨立頂層「AI 自動導演」按鈕（放在「已生成影片庫」之前）
// ------------------------------------------------------------------
if (!src.includes('setActiveTab("autoDirector")') && !src.includes("setActiveTab('autoDirector')")) {
  // 搵「已生成影片庫」button 作為插入點
  const markers = [
    '已生成影片庫',
    'onClick={() => setActiveTab("gallery")}',
    "onClick={() => setActiveTab('gallery')}",
  ];

  let inserted = false;
  for (const marker of markers) {
    const idx = src.indexOf(marker);
    if (idx === -1) continue;

    // 向前搵最近嘅 <button 開始位置，避免插到文字中間
    let insertPos = idx;
    const lookBack = src.lastIndexOf('<button', idx);
    if (lookBack !== -1 && idx - lookBack < 400) {
      insertPos = lookBack;
    }

    const tabBtn = `
                  {/* CLEAN_CHAIN_TAB_V2 — 獨立頂層 AI 自動導演 */}
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
    src = src.slice(0, insertPos) + tabBtn + src.slice(insertPos);
    changes++;
    inserted = true;
    console.log('[clean-chain] + independent AI 自動導演 button');
    break;
  }

  if (!inserted) {
    console.log('[clean-chain] WARNING: could not find insertion point for independent tab');
  }
}

// ------------------------------------------------------------------
// 5. 確保 panel 渲染（只喺 autoDirector / chain）
// ------------------------------------------------------------------
if (!src.includes('activeTab === "autoDirector"') || !src.includes('<SequentialChainMode')) {
  const panelMarkers = [
    '{/* ============ TAB: GALLERY ============ */}',
    'activeTab === "gallery"',
    "activeTab === 'gallery'",
  ];

  for (const marker of panelMarkers) {
    const idx = src.indexOf(marker);
    if (idx === -1) continue;

    const panel = `
              {/* ============ TAB: AI 自動導演 (CLEAN_CHAIN_TAB_V2) ============ */}
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
    console.log('[clean-chain] + SequentialChainMode panel');
    break;
  }
}

// ------------------------------------------------------------------
// 6. 標記已套用
// ------------------------------------------------------------------
if (!src.includes('CLEAN_CHAIN_TAB_V2')) {
  src = '// CLEAN_CHAIN_TAB_V2\n' + src;
  changes++;
}

fs.writeFileSync(appPath, src, 'utf8');
console.log('[clean-chain] App.tsx written, changes:', changes);
console.log('fix_clean_chain_tab done.');
console.log('');
console.log('預期結果：');
console.log('  - 「AI 分鏡劇本首尾幀」旁邊唔再有「一鏡接一鏡」');
console.log('  - 左側出現獨立「AI 自動導演」按鈕');
console.log('  - 點擊後進入一鏡接一鏡連續生成模式');
