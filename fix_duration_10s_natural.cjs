/**
 * fix_duration_10s_natural.cjs
 * User wants up to 10s clips that are continuous & physically plausible,
 * NOT artificially stretched. Update split-novel rules + post-clamp.
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.log('[dur10] server.ts missing');
  process.exit(0);
}

let src = fs.readFileSync(serverPath, 'utf8');
let changed = false;

// Replace AGNES_APP_STABLE_RULES_V1 duration section if present
if (src.includes('AGNES_APP_STABLE_RULES_V1')) {
  // Soft-replace old 3-5 only rules
  const oldBits = [
    /durationSeconds：每個分鏡必須是 3、4 或 5。絕對禁止超過 5 秒。/g,
    /durationSeconds MUST be 3, 4, or 5 only \(never over 5\)\./g,
    /MAXIMUM 5 SECONDS per scene! Generating videos over 5 seconds is highly unstable\./g,
    /- MAXIMUM 5 SECONDS per scene! Generating videos over 5 seconds is highly unstable\./g,
    /AI Video generation segments MUST be dynamically set between 3 to 5 seconds\./g,
    /Integer between 3 and 5\. MAXIMUM 5 seconds!/g,
  ];
  for (const re of oldBits) {
    if (re.test(src)) {
      src = src.replace(re, '');
      changed = true;
    }
  }
}

const NATURAL_RULES = `
【DURATION_NATURAL_10S_V1】
- durationSeconds 可為 5–10 秒。短靜態可 5–6；有清晰起承轉合動作可 8–10。
- 禁止「為湊秒數」而重複同一動作、無意義慢鏡、原地發呆灌水。
- 10 秒必須有自然物理節奏：例如 走近→停→取出物件→輕觸→望向遠方（一連串合理小動作），而不是把 3 秒動作拉成 10 秒。
- 動作保持合物理：無瞬移、無突然換裝、無違反慣性的急轉急停連環技。
- 單段仍避免槍戰／爆炸／高速追逐（Agnes 長段物理上限弱）；慢行、停駐、手部細節、表情變化最適合 8–10 秒。
- visualPrompt 仍保持精簡（約 450–550 字元），重點寫清楚時間軸上的動作順序。
- actionPrompt 用「先…再…然後…」寫出 2–4 個連續小步驟，總時長對應 durationSeconds。
`;

if (!src.includes('DURATION_NATURAL_10S_V1')) {
  if (src.includes('AGNES_APP_STABLE_RULES_V1')) {
    src = src.replace(
      '【AGNES_APP_STABLE_RULES_V1 — 必須嚴格遵守，否則後續出圖/出片會失敗】',
      '【AGNES_APP_STABLE_RULES_V1 — 必須嚴格遵守，否則後續出圖/出片會失敗】\n' + NATURAL_RULES
    );
    changed = true;
    console.log('[dur10] appended NATURAL_10S rules under stable rules');
  } else if (src.includes('你現在是 Toonflow 的資深 AI 劇本作家與分鏡導演')) {
    src = src.replace(
      '你現在是 Toonflow 的資深 AI 劇本作家與分鏡導演。',
      '你現在是 Toonflow 的資深 AI 劇本作家與分鏡導演。\n' + NATURAL_RULES
    );
    changed = true;
    console.log('[dur10] injected NATURAL_10S into Chinese split prompt');
  }

  if (src.includes("You are Toonflow's Senior AI Script Writer and Storyboard Director.")) {
    const eng = `
[DURATION_NATURAL_10S_V1]
- durationSeconds may be 5–10. Use 8–10 only when there is a clear sequence of small physical steps (approach → stop → take out object → look).
- NEVER pad with empty slow-motion or repeated idle poses just to fill time.
- Keep physics plausible; no teleport, no outfit swap mid-shot, no rapid fight choreography.
- actionPrompt should list 2–4 consecutive micro-actions matching the duration.
`;
    src = src.replace(
      "You are Toonflow's Senior AI Script Writer and Storyboard Director.",
      "You are Toonflow's Senior AI Script Writer and Storyboard Director.\n" + eng
    );
    changed = true;
    console.log('[dur10] injected eng NATURAL_10S');
  }
}

// Update post-clamp: allow up to 10 instead of 5
if (src.includes('AGNES_APP_STABLE_RULES_V1 post-clamp')) {
  src = src.replace(
    /if \(d > 5\) d = 5;/, 'if (d > 10) d = 10;\n        if (d < 3) d = 5;'
  );
  // also fix the earlier < 3 branch if duplicated oddly
  src = src.replace(
    /let d = parseInt\(sc\.durationSeconds, 10\);\s*if \(isNaN\(d\) \|\| d < 3\) d = 4;\s*if \(d > 5\) d = 5;/
    ,
    `let d = parseInt(sc.durationSeconds, 10);
        if (isNaN(d) || d < 3) d = 5;
        if (d > 10) d = 10;'
  );
  changed = true;
  console.log('[dur10] post-clamp max → 10');
} else if (src.includes("res.json({ scenes: parsedData })")) {
  // try insert clamp before response if missing
  const marker = 'if (parsedData && Array.isArray(parsedData)) {\n      res.json({ scenes: parsedData });';
  if (src.includes(marker)) {
    src = src.replace(
      marker,
      `if (parsedData && Array.isArray(parsedData)) {
      parsedData = parsedData.map((sc: any) => {
        let d = parseInt(sc.durationSeconds, 10);
        if (isNaN(d) || d < 3) d = 5;
        if (d > 10) d = 10;
        sc.durationSeconds = d;
        if (typeof sc.visualPrompt === 'string' && sc.visualPrompt.length > 550) {
          sc.visualPrompt = sc.visualPrompt.substring(0, 550).replace(/[,;\\s]+$/, '') + ', no text, no watermark';
        }
        return sc;
      });
      res.json({ scenes: parsedData });`
    );
    changed = true;
    console.log('[dur10] inserted duration clamp max 10');
  }
}

// types / DEFAULT_SCENE durationSeconds default stay 5 is ok; user can set 10 per scene

if (changed) {
  fs.writeFileSync(serverPath, src, 'utf8');
  console.log('[dur10] server.ts written');
} else {
  console.log('[dur10] no changes');
}
console.log('fix_duration_10s_natural done.');
