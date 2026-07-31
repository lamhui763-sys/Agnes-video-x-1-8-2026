/**
 * fix_chain_restore_point1.cjs
 * Safe rewrite — no nested template literals (previous version crashed Node parse).
 */
const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src/components/SequentialChainMode.tsx');
if (!fs.existsSync(file)) {
  console.log('[restore-point1] SequentialChainMode.tsx missing — skip');
  process.exit(0);
}

let src = fs.readFileSync(file, 'utf8');
let n = 0;

if (src.includes('RESTORE_POINT1_SAFE_V2')) {
  console.log('[restore-point1] already applied');
  process.exit(0);
}

// 1) props
if (!src.includes('autoMode?:')) {
  const oldIface =
    'interface SequentialChainModeProps {\n' +
    '  project: Project;\n' +
    '  onUpdateScenes: (scenes: Scene[]) => void;\n' +
    '  artStyle?: string;\n' +
    '  cameraMotion?: string;\n' +
    '}';
  const newIface =
    'interface SequentialChainModeProps {\n' +
    '  project: Project;\n' +
    '  onUpdateScenes: (scenes: Scene[]) => void;\n' +
    '  onUpdateCharacters?: (characters: Character[]) => void;\n' +
    '  artStyle?: string;\n' +
    '  cameraMotion?: string;\n' +
    '  autoMode?: boolean;\n' +
    '}';
  if (src.includes(oldIface)) {
    src = src.replace(oldIface, newIface);
    n++;
  }
}

// 2) destructure
if (!src.includes('autoMode = false')) {
  const oldDes =
    'export const SequentialChainMode: React.FC<SequentialChainModeProps> = ({\n' +
    '  project,\n' +
    '  onUpdateScenes,\n' +
    '  artStyle,\n' +
    '  cameraMotion,\n' +
    '}) => {';
  const newDes =
    'export const SequentialChainMode: React.FC<SequentialChainModeProps> = ({\n' +
    '  project,\n' +
    '  onUpdateScenes,\n' +
    '  onUpdateCharacters,\n' +
    '  artStyle,\n' +
    '  cameraMotion,\n' +
    '  autoMode = false,\n' +
    '}) => {';
  if (src.includes(oldDes)) {
    src = src.replace(oldDes, newDes);
    n++;
  }
}

// 3) novelCoverage in directorNotes
if (!src.includes('【小說對應】') && src.includes("directorNotes: s.directorNotes || advice || '',")) {
  src = src.replace(
    "directorNotes: s.directorNotes || advice || '',",
    "directorNotes: [s.directorNotes || advice || '', '【小說對應】' + (s.novelCoverage || s.novelSourceNote || ('本鏡對應故事進度第 ' + (shotIndex + 1) + ' 節'))].filter(Boolean).join('\\n'),"
  );
  n++;
}

// 4) auto after shot 1
if (!src.includes('[RESTORE_POINT1_AUTO]') && src.includes("鏡頭 1 完成。按「接下去」即時生成鏡頭 2")) {
  const needle = "addLog('✅ 鏡頭 1 完成。按「接下去」即時生成鏡頭 2', 'ok');";
  const inject =
    "addLog('✅ 鏡頭 1 完成。按「接下去」即時生成鏡頭 2', 'ok');\n" +
    "      // [RESTORE_POINT1_AUTO]\n" +
    "      if (autoMode && !abortRef.current) {\n" +
    "        addLog('自動化開啟：2 秒後自動接鏡頭 2…', 'info');\n" +
    "        setTimeout(() => { if (!abortRef.current) handleContinue(); }, 2000);\n" +
    "      }";
  if (src.includes(needle)) {
    src = src.replace(needle, inject);
    n++;
  }
}

// 5) auto after continue — use function form replace to avoid template issues
if (!src.includes('[RESTORE_POINT1_AUTO_NEXT]') && src.includes('可繼續按「接下去」生成鏡頭')) {
  const re = /setPhase\('waiting_continue'\);\s*addLog\(`✅ 鏡頭 \$\{nextIndex \+ 1\} 完成。可繼續按「接下去」生成鏡頭 \$\{nextIndex \+ 2\}`, 'ok'\);/;
  if (re.test(src)) {
    src = src.replace(re, function () {
      return [
        "setPhase('waiting_continue');",
        "      addLog(`✅ 鏡頭 ${nextIndex + 1} 完成。可繼續按「接下去」生成鏡頭 ${nextIndex + 2}`, 'ok');",
        "      // [RESTORE_POINT1_AUTO_NEXT]",
        "      const approxDone = novelText.length > 0 && (nextIndex + 1) * 350 >= novelText.length;",
        "      if (approxDone) {",
        "        setPhase('done');",
        "        addLog('📖 已覆蓋小說全文進度，停止自動生成', 'ok');",
        "      } else if (autoMode && !abortRef.current) {",
        "        addLog('自動化：2 秒後接下一鏡…', 'info');",
        "        setTimeout(() => { if (!abortRef.current) handleContinue(); }, 2000);",
        "      }",
      ].join('\n');
    });
    n++;
  }
}

src = '/* RESTORE_POINT1_SAFE_V2 */\n' + src;
n++;

fs.writeFileSync(file, src, 'utf8');
console.log('[restore-point1] SequentialChainMode patched, changes:', n);
