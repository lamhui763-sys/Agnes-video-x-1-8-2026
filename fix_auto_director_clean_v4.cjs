/**
 * fix_auto_director_clean_v4.cjs
 *
 * 目標：
 * 1. 徹底清除所有舊的 / 錯誤注入的 autoDirector / chain / 一鏡接一鏡 按鈕與殘留標記
 * 2. 還原並保護「AI 分鏡劇本首尾幀」原始按鈕結構
 * 3. 在 sidebar 以獨立 top-level tab 方式加入「AI 自動導演」（在首尾幀之後、影片庫之前）
 * 4. 正確掛上 SequentialChainMode panel
 * 5. 修正 activeTab 型別缺少 scenes_keyframes / autoDirector
 *
 * 不修改 首尾幀 的 onClick / className / 文案，只做安全插入。
 */

const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'src', 'App.tsx');
if (!fs.existsSync(appPath)) {
  console.log('[v4] App.tsx missing');
  process.exit(0);
}

let src = fs.readFileSync(appPath, 'utf8');
let changes = 0;

if (src.includes('AUTO_DIRECTOR_CLEAN_V4')) {
  console.log('[v4] already applied');
  process.exit(0);
}

// ------------------------------------------------------------------
// 1. 強力清除所有錯誤 / 重疊 / 巢狀 的 autoDirector / chain 按鈕
// ------------------------------------------------------------------
const removePatterns = [
  /\{\/\*\s*CLEAN_CHAIN_TAB_V3[\s\S]*?<\/button>/g,
  /\{\/\*\s*CLEAN_CHAIN_TAB_V2[\s\S]*?<\/button>/g,
  /\{\/\*\s*AUTO_DIRECTOR_TAB_V1[\s\S]*?<\/button>/g,
  /\{\/\*\s*WIRE_CHAIN_HARDCUT_V2[\s\S]*?<\/button>/g,
  /\{\/\*\s*SEQUENTIAL_CHAIN_TAB_V1[\s\S]*?<\/button>/g,
  /\{\/\*\s*AUTO_DIRECTOR_CLEAN_V4[\s\S]*?<\/button>/g,
  // 任何 onClick 設 autoDirector 或 chain 的 button（避免殘留重疊）
  /<button[^>]*onClick=\{\(\)\s*=>\s*setActiveTab\(["']autoDirector["']\)\}[\s\S]*?<\/button>/g,
  /<button[^>]*onClick=\{\(\)\s*=>\s*setActiveTab\(["']chain["']\)\}[\s\S]*?<\/button>/g,
  // 文案含「一鏡接一鏡」或錯誤巢狀文案
  /<button[^>]*>[\s\S]*?一鏡接一鏡[\s\S]*?<\/button>/g,
];

for (const re of removePatterns) {
  const before = src.length;
  src = src.replace(re, '');
  if (src.length !== before) {
    changes++;
    console.log('[v4] removed broken autoDirector/chain button block');
  }
}

// 清掉舊 panel（避免重複）
src = src.replace(
  /\{\/\*\s*=+\s*TAB:\s*AI 自動導演[\s\S]*?<\/div>\s*\)\}/g,
  ''
);
src = src.replace(
  /\{\(activeTab === ["']autoDirector["'][\s\S]*?<SequentialChainMode[\s\S]*?<\/div>\s*\)\}/g,
  ''
);

// 清掉殘留標記註解
src = src.replace(/\{\/\*\s*CLEAN_CHAIN_TAB_V[23][^]*?\*\/\}/g, '');
src = src.replace(/\{\/\*\s*AUTO_DIRECTOR_TAB_V1[^]*?\*\/\}/g, '');

// ------------------------------------------------------------------
// 2. 確保 import SequentialChainMode
// ------------------------------------------------------------------
if (!src.includes("from './components/SequentialChainMode'") && !src.includes('from "./components/SequentialChainMode"')) {
  const candidates = [
    'import VideoGallery from "./components/VideoGallery";',
    "import VideoGallery from './components/VideoGallery';",
    'import ExperienceLibrary from "./components/ExperienceLibrary";',
    "import ExperienceLibrary from './components/ExperienceLibrary';",
  ];
  let imported = false;
  for (const c of candidates) {
    if (src.includes(c)) {
      src = src.replace(c, c + "\nimport SequentialChainMode from './components/SequentialChainMode';");
      changes++;
      imported = true;
      console.log('[v4] + import SequentialChainMode');
      break;
    }
  }
  if (!imported) {
    // fallback: after first react import block
    const m = src.match(/import .+ from ['"]react['"];?/);
    if (m) {
      src = src.replace(m[0], m[0] + "\nimport SequentialChainMode from './components/SequentialChainMode';");
      changes++;
      console.log('[v4] + import SequentialChainMode (fallback)');
    }
  }
}

// ------------------------------------------------------------------
// 3. 修正 activeTab 型別（必須含 scenes_keyframes + autoDirector）
// ------------------------------------------------------------------
{
  const typeRe =
    /useState<"novel"\s*\|\s*"characters"\s*\|\s*"scenes"\s*\|\s*"scenes_ext"(?:\s*\|\s*"scenes_keyframes")?(?:\s*\|\s*"autoDirector")?(?:\s*\|\s*"chain")?\s*\|\s*"gallery"\s*\|\s*"experience">\("scenes"\)/;

  if (typeRe.test(src)) {
    src = src.replace(
      typeRe,
      'useState<"novel" | "characters" | "scenes" | "scenes_ext" | "scenes_keyframes" | "autoDirector" | "gallery" | "experience">("scenes")'
    );
    changes++;
    console.log('[v4] fixed activeTab type');
  } else if (!src.includes('"autoDirector"') || !src.includes('"scenes_keyframes"')) {
    // 寬鬆 fallback
    const loose = /useState<([^>]+)>\("scenes"\)/;
    if (loose.test(src)) {
      src = src.replace(
        loose,
        'useState<"novel" | "characters" | "scenes" | "scenes_ext" | "scenes_keyframes" | "autoDirector" | "gallery" | "experience">("scenes")'
      );
      changes++;
      console.log('[v4] fixed activeTab type (loose)');
    }
  }
}

// ------------------------------------------------------------------
// 4. 安全插入獨立「AI 自動導演」按鈕
//    定位：AI 分鏡劇本首尾幀 </button> 之後、已生成影片庫之前
// ------------------------------------------------------------------
if (!src.includes('setActiveTab("autoDirector")') && !src.includes("setActiveTab('autoDirector')")) {
  const markers = [
    'onClick={() => setActiveTab("scenes_keyframes")}',
    "onClick={() => setActiveTab('scenes_keyframes')}",
  ];

  let inserted = false;
  for (const marker of markers) {
    const idx = src.indexOf(marker);
    if (idx === -1) continue;

    // 由 marker 向後找第一個完整 </button>
    const after = src.slice(idx);
    const closeIdx = after.indexOf('</button>');
    if (closeIdx === -1) continue;

    const insertAt = idx + closeIdx + '</button>'.length;

    const tabBtn = `

                  {/* AUTO_DIRECTOR_CLEAN_V4 — 獨立 AI 自動導演（不影響首尾幀） */}
                  <button
                    type="button"
                    onClick={() => setActiveTab("autoDirector")}
                    className={\`w-full py-3.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-between gap-1.5 cursor-pointer border \${
                      activeTab === "autoDirector"
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
    console.log('[v4] + independent AI 自動導演 button after 首尾幀');
    break;
  }

  if (!inserted) {
    console.log('[v4] WARNING: could not locate 首尾幀 button to insert after');
  }
}

// ------------------------------------------------------------------
// 5. 確保 panel 存在（放在 gallery panel 之前）
// ------------------------------------------------------------------
if (!src.includes('<SequentialChainMode') || !src.includes('activeTab === "autoDirector"')) {
  const panelMarkers = [
    '{/* ============ TAB: GALLERY ============ */}',
    'activeTab === "gallery"',
    "activeTab === 'gallery'",
  ];

  for (const marker of panelMarkers) {
    const idx = src.indexOf(marker);
    if (idx === -1) continue;

    const panel = `
              {/* ============ TAB: AI 自動導演 (AUTO_DIRECTOR_CLEAN_V4) ============ */}
              {activeTab === "autoDirector" && activeProject && (
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
    console.log('[v4] + SequentialChainMode panel');
    break;
  }
}

// ------------------------------------------------------------------
// 6. 標記
// ------------------------------------------------------------------
if (!src.includes('AUTO_DIRECTOR_CLEAN_V4')) {
  src = '// AUTO_DIRECTOR_CLEAN_V4\n' + src;
  changes++;
}

fs.writeFileSync(appPath, src, 'utf8');
console.log('[v4] App.tsx written, changes:', changes);
console.log('fix_auto_director_clean_v4 done.');
