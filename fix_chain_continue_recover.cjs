/**
 * fix_chain_continue_recover.cjs
 * Safe rewrite — previous version had invalid string tokens.
 * Makes 「接下去」 work even after remount / phase reset to idle.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src/components/SequentialChainMode.tsx');
if (!fs.existsSync(file)) {
  console.log('[chain-recover] SequentialChainMode.tsx missing');
  process.exit(0);
}

let src = fs.readFileSync(file, 'utf8');
let n = 0;

if (src.includes('CHAIN_CONTINUE_RECOVER_SAFE_V2')) {
  console.log('[chain-recover] already applied');
  process.exit(0);
}

// 1) canContinue recovery
if (src.includes("const canContinue = phase === 'waiting_continue'")) {
  src = src.replace(
    "const canContinue = phase === 'waiting_continue' && !!scenes[currentIndex]?.videoUrl;",
    [
      "// CHAIN_CONTINUE_RECOVER_SAFE_V2",
      "  const lastIdx = Math.max(0, scenes.length - 1);",
      "  const lastHasVideo = !!(scenes[lastIdx]?.videoUrl);",
      "  const canContinue =",
      "    !isBusy &&",
      "    lastHasVideo &&",
      "    (phase === 'waiting_continue' || phase === 'idle' || phase === 'error' || phase === 'done') &&",
      "    scenes.length > 0;",
    ].join('\n')
  );
  n++;
}

// 2) handleContinue uses last scene index
if (src.includes('const handleContinue = async () => {') && !src.includes('CHAIN_CONTINUE_RECOVER_IDX')) {
  const old =
    "const handleContinue = async () => {\n" +
    "    const prevIndex = currentIndex;\n" +
    "    const nextIndex = prevIndex + 1;\n" +
    "    const prev = scenes[prevIndex];";
  const neu =
    "const handleContinue = async () => {\n" +
    "    // CHAIN_CONTINUE_RECOVER_IDX\n" +
    "    const prevIndex = scenes.length > 0 ? scenes.length - 1 : currentIndex;\n" +
    "    const nextIndex = prevIndex + 1;\n" +
    "    const prev = scenes[prevIndex];\n" +
    "    setCurrentIndex(prevIndex);";
  if (src.includes(old)) {
    src = src.replace(old, neu);
    n++;
  }
}

// 3) autoModeRef
if (!src.includes('autoModeRef') && src.includes('const abortRef = useRef(false);')) {
  src = src.replace(
    'const abortRef = useRef(false);',
    [
      'const abortRef = useRef(false);',
      '  const autoModeRef = useRef(autoMode);',
      '  autoModeRef.current = autoMode;',
      '  const continueRef = useRef<() => void>(() => {});',
    ].join('\n')
  );
  n++;
}

if (src.includes('const canStart =') && !src.includes('continueRef.current = handleContinue') && src.includes('continueRef')) {
  src = src.replace('const canStart =', 'continueRef.current = handleContinue;\n\n  const canStart =');
  n++;
}

// 4) Show directorNotes under preview title
if (!src.includes('novel-coverage-note') && src.includes('{s.title}</div>')) {
  src = src.replace(
    '<div className="px-3 py-2 text-[10px] text-slate-500 truncate">{s.title}</div>',
    [
      '<div className="px-3 py-2 space-y-1">',
      '              <div className="text-[10px] text-slate-400 truncate">{s.title}</div>',
      '              {s.directorNotes ? (',
      '                <div className="text-[10px] text-amber-300/90 leading-snug whitespace-pre-wrap novel-coverage-note border-t border-slate-700/60 pt-1">',
      '                  {s.directorNotes}',
      '                </div>',
      '              ) : null}',
      '            </div>',
    ].join('\n')
  );
  n++;
}

src = '/* CHAIN_CONTINUE_RECOVER_SAFE_V2 */\n' + src;
n++;

fs.writeFileSync(file, src, 'utf8');
console.log('[chain-recover] SequentialChainMode patched, changes:', n);
console.log('fix_chain_continue_recover done.');
