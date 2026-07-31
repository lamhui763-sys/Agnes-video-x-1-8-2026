/**
 * fix_sequential_chain_tab.cjs
 * Add「一鏡接一鏡」tab + SequentialChainMode panel into App.tsx
 */
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'src', 'App.tsx');
if (!fs.existsSync(appPath)) {
  console.log('[chain-tab] App.tsx missing');
  process.exit(0);
}

let src = fs.readFileSync(appPath, 'utf8');

if (src.includes('SEQUENTIAL_CHAIN_TAB_V1')) {
  console.log('[chain-tab] already applied');
  process.exit(0);
}

// 1) Import
if (!src.includes('SequentialChainMode')) {
  const importCandidates = [
    "from './components/VideoGallery'",
    'from \'./components/VideoGallery\'',
    'from "./components/VideoGallery"',
    "from './components/ExperienceLibrary'",
    'from \'./components/ExperienceLibrary\'',
  ];
  let imported = false;
  for (const c of importCandidates) {
    if (src.includes(c)) {
      src = src.replace(
        c,
        c + "\nimport SequentialChainMode from './components/SequentialChainMode';"
      );
      imported = true;
      console.log('[chain-tab] import added after', c);
      break;
    }
  }
  if (!imported) {
    // after first react import line
    const m = src.match(/import\s+React[^;]+;/);
    if (m) {
      src = src.replace(m[0], m[0] + "\nimport SequentialChainMode from './components/SequentialChainMode';");
      console.log('[chain-tab] import added after React');
    } else {
      console.log('[chain-tab] WARNING: could not auto-add import');
    }
  }
}

// 2) Add tab button near existing tabs (AI 分鏡劇本首尾幀 / 已生成影片庫)
const tabMarkers = [
  'AI 分鏡劇本首尾幀',
  '已生成影片庫',
  'AI 經驗圖書館',
];

let tabInserted = false;
for (const marker of tabMarkers) {
  if (src.includes(marker) && !src.includes('一鏡接一鏡')) {
    // Find a button that contains the marker and clone pattern loosely
    // Insert a new tab button string before 已生成影片庫 if possible
    const insertBefore = '已生成影片庫';
    if (src.includes(insertBefore)) {
      // Try to find the button JSX containing 已生成影片庫
      const idx = src.indexOf(insertBefore);
      // Walk backward to find opening of that button-ish block — best effort: inject a sibling button markup nearby
      const snippet = `
              {/* SEQUENTIAL_CHAIN_TAB_V1 */}
              <button
                type="button"
                onClick={() => setActiveTab && setActiveTab('chain')}
                className={\`px-3 py-2 rounded-lg text-xs font-bold transition \${typeof activeTab !== 'undefined' && activeTab === 'chain' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}\`}
              >
                一鏡接一鏡 🔗
              </button>
`;
      // Insert right before the marker occurrence in JSX if we can find a safe anchor
      // Prefer replacing a unique nearby string
      if (src.includes('AI 分鏡劇本首尾幀')) {
        src = src.replace(
          /(AI 分鏡劇本首尾幀[^\n]*\n)/,
          `$1${snippet}`
        );
        tabInserted = true;
        console.log('[chain-tab] tab button inserted after 首尾幀');
        break;
      }
    }
  }
}

if (!tabInserted) {
  console.log('[chain-tab] tab button auto-insert skipped (manual wiring may be needed)');
}

// 3) Render panel when activeTab === 'chain'
if (!src.includes('activeTab === \'chain\'') && !src.includes('activeTab === "chain"')) {
  // Look for other tab panels e.g. activeTab === 'gallery' or similar
  const panelAnchors = [
    "activeTab === 'gallery'",
    'activeTab === "gallery"',
    "activeTab === 'experience'",
    'activeTab === "experience"',
    "activeTab === 'firstlast'",
    'activeTab === "firstlast"',
    "activeTab === 'keyframes'",
  ];

  let panelInserted = false;
  for (const anchor of panelAnchors) {
    if (src.includes(anchor)) {
      const panelJsx = `
          {/* SEQUENTIAL_CHAIN_TAB_V1 panel */}
          {activeTab === 'chain' && currentProject && (
            <SequentialChainMode
              project={currentProject}
              artStyle={currentProject.artStyle}
              cameraMotion={currentProject.cameraMotion}
              onUpdateScenes={(newScenes) => {
                if (typeof updateCurrentProjectScenes === 'function') {
                  updateCurrentProjectScenes(newScenes);
                } else if (typeof setProjects === 'function') {
                  setProjects((prev) => prev.map((p) =>
                    p.id === currentProject.id ? { ...p, scenes: newScenes } : p
                  ));
                }
              }}
            />
          )}
`;
      src = src.replace(anchor, panelJsx + '\n          ' + anchor);
      panelInserted = true;
      console.log('[chain-tab] panel inserted before', anchor);
      break;
    }
  }

  if (!panelInserted) {
    // Fallback: append near end of main return, before last few closing divs — risky, so only add a comment
    console.log('[chain-tab] panel auto-insert failed — add manually:');
    console.log(`  {activeTab === 'chain' && currentProject && (`);
    console.log(`    <SequentialChainMode project={currentProject} onUpdateScenes={...} />`);
    console.log(`  )}`);
  }
}

// Mark applied
if (!src.includes('SEQUENTIAL_CHAIN_TAB_V1')) {
  src = '// SEQUENTIAL_CHAIN_TAB_V1\n' + src;
}

fs.writeFileSync(appPath, src, 'utf8');
console.log('[chain-tab] App.tsx written');
console.log('fix_sequential_chain_tab done.');
console.log('');
console.log('=== 手動接線提示（若自動 tab 未出現）===');
console.log('1. import SequentialChainMode from \'./components/SequentialChainMode\';');
console.log('2. Tab 按鈕: onClick={() => setActiveTab(\'chain\')} 文字: 一鏡接一鏡');
console.log('3. 面板: {activeTab === \'chain\' && <SequentialChainMode project={currentProject} onUpdateScenes={(s) => ...} />}');
