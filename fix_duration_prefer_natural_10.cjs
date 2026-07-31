/**
 * fix_duration_prefer_natural_10.cjs
 * Why all scenes become 4s: old rules said "3/4/5 only" + dialogue "within 5s".
 * Strip remaining 3-5 bias; instruct model to use 6-10 when there is a real action sequence.
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.log('[dur_pref] server.ts missing');
  process.exit(0);
}

let src = fs.readFileSync(serverPath, 'utf8');
let changed = false;

if (src.includes('DURATION_PREFER_NATURAL_10_V2')) {
  console.log('[dur_pref] already present');
  process.exit(0);
}

// Strip leftover short-duration mandates that bias the model to 4s
const stripList = [
  /每個分鏡必須是 3、4 或 5。?/g,
  /絕對禁止超過 5 秒。?/g,
  /durationSeconds MUST be 3, 4, or 5 only[^.]*\./gi,
  /MAXIMUM 5 SECONDS per scene![^\n]*/gi,
  /Generating videos over 5 seconds is highly unstable\./gi,
  /AI Video generation segments MUST be dynamically set between 3 to 5 seconds\./gi,
  /Integer between 3 and 5\. MAXIMUM 5 seconds![^\n]*/gi,
  /between 3 and 5\. Maximum 5 seconds\./gi,
  /Estimated duration in seconds for this scene \(between 3 and 5\. Maximum 5 seconds\)\./gi,
];
for (const re of stripList) {
  if (re.test(src)) {
    src = src.replace(re, '');
    changed = true;
  }
}

// Soften dialogue "5秒内" language that also pushes short shots
src = src.replace(
  /對白長度必須極度精簡，控制在 5 秒內（15字以內）能自然讀完。/g,
  '對白長度精簡（約 12 字以內），可配合 6–10 秒鏡頭內的自然停頓與動作。'
);
src = src.replace(
  /so that it can be naturally and completely read within 5 seconds \(typically fewer than 15-20 Chinese characters\)/gi,
  'keep dialogue short (about 12 Chinese characters); the shot duration may be 6–10s to include action around the line'
);

const BLOCK = `
【DURATION_PREFER_NATURAL_10_V2】
不要把所有分鏡都設成 4 秒或 5 秒！
- 只有「單一靜態姿勢／一眼」才用 5–6 秒。
- 只要場內有 2 個以上連續小動作（例如：走近→停→取物→望），durationSeconds 必須給 7–10。
- 有完整情緒小段落（停→取信→摩挲→抬頭→淡笑）優先 9 或 10。
- 禁止為了「安全」而全部寫 4。按劇情需要給足時間，上限 10，下限 5。
- actionPrompt 要用「先…再…然後…」對應你標的秒數，內容要填滿時長，禁止灌水發呆。
`;

if (src.includes('你現在是 Toonflow 的資深 AI 劇本作家與分鏡導演')) {
  src = src.replace(
    '你現在是 Toonflow 的資深 AI 劇本作家與分鏡導演。',
    '你現在是 Toonflow 的資深 AI 劇本作家與分鏡導演。\n' + BLOCK
  );
  changed = true;
  console.log('[dur_pref] injected Chinese prefer-natural block');
}

if (src.includes("You are Toonflow's Senior AI Script Writer and Storyboard Director.")) {
  src = src.replace(
    "You are Toonflow's Senior AI Script Writer and Storyboard Director.",
    "You are Toonflow's Senior AI Script Writer and Storyboard Director.\n" +
      '[DURATION_PREFER_NATURAL_10_V2] Do NOT default every scene to 4 or 5 seconds. ' +
      'Use 7–10 when there are 2+ micro-actions in sequence; use 5–6 only for a single still pose. Max 10, min 5.\n'
  );
  changed = true;
  console.log('[dur_pref] injected English prefer-natural');
}

// Fix post-clamp default from 4 to 7 when missing/invalid (bias toward usable length)
if (src.includes('AGNES_APP_STABLE_RULES_V1 post-clamp') || src.includes('parseInt(sc.durationSeconds')) {
  const before = src;
  src = src.replace(
    /if \(isNaN\(d\) \|\| d < 3\) d = 4;/g,
    'if (isNaN(d) || d < 5) d = 7;'
  );
  src = src.replace(
    /if \(isNaN\(d\) \|\| d < 3\) d = 5;/g,
    'if (isNaN(d) || d < 5) d = 7;'
  );
  if (src !== before) {
    changed = true;
    console.log('[dur_pref] post-clamp default → 7');
  }
}

if (changed) {
  fs.writeFileSync(serverPath, src, 'utf8');
  console.log('[dur_pref] server.ts written');
} else {
  console.log('[dur_pref] no changes');
}
console.log('fix_duration_prefer_natural_10 done.');
