/**
 * fix_split_novel_stable_rules.cjs
 * Inject AGNES_APP_STABLE_RULES into /api/split-novel prompt so Agnes decomposition
 * outputs short visualPrompts, slow actions, fixed clothing, durationSeconds <= 5.
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.log('[split_rules] server.ts missing');
  process.exit(0);
}

let src = fs.readFileSync(serverPath, 'utf8');
if (src.includes('AGNES_APP_STABLE_RULES_V1')) {
  console.log('[split_rules] already present');
  process.exit(0);
}

const RULES_BLOCK = `
【AGNES_APP_STABLE_RULES_V1 — 必須嚴格遵守，否則後續出圖/出片會失敗】
1. durationSeconds：每個分鏡必須是 3、4 或 5。絕對禁止超過 5 秒。
2. visualPrompt（英文）長度上限約 450 字元。結構固定為：
   「Anime key visual, [one character short look], [one simple action/pose], [simple place], soft lighting, closed mouth, no text, no watermark」
   禁止長篇外貌複述、禁止 completely clean video 長串重複超過一次、禁止 reference sheet / multi-angle / collage。
3. actionPrompt：只寫一個緩慢動作（stands still / walks slowly / looks / holds / turns slightly）。禁止 run/spin/fight/gun/explosion/shout。
4. 服裝鎖定：同一角色在所有分鏡必須穿同一套衣服（由角色設定或首次出現決定）。禁止中途換成毛衣/裙子等不同造型。
5. 對白 dialogue：≤12 個中文字；內心話用 (內心：…)；同一場不要又對白又旁白。
6. 每場只有 1 個主要角色出現在畫面描述裡（除非故事明確需要兩人同框且動作極靜）。
7. 敏感內容降級：不要寫 gun/weapon/blood/explosion/soulless child horror；改為 device / bright light / calm eyes。
8. 分鏡數量：短篇（約 500 字內）建議 6–10 場，不要為湊數量而加劇烈動作。
`;

let changed = false;

// Inject into Agnes split prompt (Chinese block)
if (src.includes('你現在是 Toonflow 的資深 AI 劇本作家與分鏡導演')) {
  src = src.replace(
    '你現在是 Toonflow 的資深 AI 劇本作家與分鏡導演。',
    '你現在是 Toonflow 的資深 AI 劇本作家與分鏡導演。\n' + RULES_BLOCK.replace(/`/g, "'")
  );
  changed = true;
  console.log('[split_rules] injected into Agnes Chinese split prompt');
}

// Inject into Gemini systemInstruction for split-novel fallback
if (src.includes("You are Toonflow's Senior AI Script Writer and Storyboard Director.")) {
  const engRules = `
[AGNES_APP_STABLE_RULES_V1 — MUST FOLLOW]
- durationSeconds MUST be 3, 4, or 5 only (never over 5).
- visualPrompt English max ~450 characters. Template: "Anime key visual, [short character look], [one slow pose/action], [simple place], soft lighting, closed mouth, no text, no watermark".
- actionPrompt: one slow action only (stands still / walks slowly / looks / holds). No fight, gun, spin, explosion.
- Same character must wear the SAME outfit in every scene.
- dialogue ≤ 12 Chinese characters; inner thoughts as (內心：...).
- Prefer 6–10 scenes for short stories; keep motion minimal for Agnes video stability.
`;
  src = src.replace(
    "You are Toonflow's Senior AI Script Writer and Storyboard Director.",
    "You are Toonflow's Senior AI Script Writer and Storyboard Director.\n" + engRules
  );
  changed = true;
  console.log('[split_rules] injected into Gemini split systemInstruction');
}

// Soft post-process: after parse, clamp duration and trim visualPrompt if still long
const postMarker = 'if (parsedData && Array.isArray(parsedData)) {\n      res.json({ scenes: parsedData });';
const postNew = `if (parsedData && Array.isArray(parsedData)) {
      // AGNES_APP_STABLE_RULES_V1 post-clamp
      parsedData = parsedData.map((sc: any) => {
        let d = parseInt(sc.durationSeconds, 10);
        if (isNaN(d) || d < 3) d = 4;
        if (d > 5) d = 5;
        sc.durationSeconds = d;
        if (typeof sc.visualPrompt === 'string' && sc.visualPrompt.length > 500) {
          sc.visualPrompt = sc.visualPrompt.substring(0, 500).replace(/[,;\\s]+$/, '') + ', no text, no watermark';
        }
        if (typeof sc.actionPrompt === 'string' && sc.actionPrompt.length > 280) {
          sc.actionPrompt = sc.actionPrompt.substring(0, 280).replace(/[,;\\s]+$/, '');
        }
        return sc;
      });
      res.json({ scenes: parsedData });`;

if (src.includes(postMarker) && !src.includes('AGNES_APP_STABLE_RULES_V1 post-clamp')) {
  src = src.replace(postMarker, postNew);
  changed = true;
  console.log('[split_rules] added post-clamp on parsed scenes');
}

if (changed) {
  fs.writeFileSync(serverPath, src, 'utf8');
  console.log('[split_rules] server.ts written');
} else {
  console.log('[split_rules] no injection points found');
}

console.log('fix_split_novel_stable_rules done.');
