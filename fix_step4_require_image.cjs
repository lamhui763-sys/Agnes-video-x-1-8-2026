/**
 * fix_step4_require_image.cjs
 * 
 * 修正問題：
 * 1. STEP 4 自動跳過審核時，只檢查 step4Passed + score >=60，但沒有檢查實際相片 URL 是否存在
 *    → 導致「偵測到首幀審核已通過(分數: 70/100),自動跳過審核」但畫面完全沒有相片
 * 2. handleClearAllKeyframes 清除時沒有 reset step4Passed / step4ImageReviewScore
 *    → 殘留舊的 passed 狀態，下次仍然錯誤跳過
 * 3. 容錯模式強制通過時也會留下假分數
 */

const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'src', 'App.tsx');

console.log('🔧 開始修正 STEP 4 跳過邏輯 + Clear 殘留狀態...');

if (!fs.existsSync(appPath)) {
  console.error('❌ 找不到 src/App.tsx');
  process.exit(1);
}

let content = fs.readFileSync(appPath, 'utf8');
let changed = false;

// ========== 1. 強化 STEP 4 自動跳過條件（必須有真實圖片 URL） ==========
// 原本：
// if (freshSCheck.step4Passed && freshSCheck.step4ImageReviewScore >= 60) {
// 改為同時檢查 imageUrl / imageUrlKeyframes / imageUrlExt 有效

const oldStep4Skip = /if\s*\(\s*freshSCheck\.step4Passed\s*&&\s*freshSCheck\.step4ImageReviewScore\s*>=\s*60\s*\)\s*\{/g;

const newStep4Skip = `if (
          freshSCheck.step4Passed && 
          (freshSCheck.step4ImageReviewScore || 0) >= 60 &&
          (
            (typeof freshSCheck.imageUrlKeyframes === 'string' && freshSCheck.imageUrlKeyframes.length > 15 && !freshSCheck.imageUrlKeyframes.includes('placeholder') && !freshSCheck.imageUrlKeyframes.includes('data:image/svg')) ||
            (typeof freshSCheck.imageUrl === 'string' && freshSCheck.imageUrl.length > 15 && !freshSCheck.imageUrl.includes('placeholder') && !freshSCheck.imageUrl.includes('data:image/svg')) ||
            (typeof freshSCheck.imageUrlExt === 'string' && freshSCheck.imageUrlExt.length > 15 && !freshSCheck.imageUrlExt.includes('placeholder') && !freshSCheck.imageUrlExt.includes('data:image/svg'))
          )
        ) {`;

if (oldStep4Skip.test(content)) {
  content = content.replace(oldStep4Skip, newStep4Skip);
  changed = true;
  console.log('✅ 已強化 STEP 4 跳過條件：現在必須有真實有效的相片 URL 才會自動跳過');
} else {
  // 備用：更寬鬆的匹配
  const loose = /if\s*\(\s*freshSCheck\.step4Passed\s*&&\s*[^)]+\)\s*\{/;
  if (loose.test(content)) {
    content = content.replace(loose, newStep4Skip);
    changed = true;
    console.log('✅ 已用寬鬆匹配強化 STEP 4 跳過條件');
  } else {
    console.log('⚠️ 找不到原始 STEP 4 跳過 if，可能已被改過或結構不同');
  }
}

// 同時更新 log 訊息，讓用戶知道有做 URL 檢查
content = content.replace(
  /偵測到首幀審核已通過（分數：\$\{freshSCheck\.step4ImageReviewScore\}\/100），自動跳過審核。/g,
  '偵測到首幀審核已通過（分數：${freshSCheck.step4ImageReviewScore}/100）且相片 URL 有效，自動跳過審核。'
);
content = content.replace(
  /偵測到首幀審核已通過\(分數: \$\{freshSCheck\.step4ImageReviewScore\}\/100\),自動跳過審核。/g,
  '偵測到首幀審核已通過(分數: ${freshSCheck.step4ImageReviewScore}/100)且相片URL有效,自動跳過審核。'
);

// ========== 2. 修正 handleClearAllKeyframes：清除時一併 reset step4* 旗標 ==========
// 找到 delete updated.imageUrlKeyframes; 附近，加入 step4 清除

const clearResetSnippet = `
    delete updated.imageUrlKeyframes;
    delete updated.videoUrlKeyframes;
    // === 強制清除 step4 殘留狀態（防止「有分數無相片」錯誤跳過）===
    delete updated.step4Passed;
    delete updated.step4ImageReviewScore;
    delete updated.step4ImageReviewText;
    delete updated.step4ImageReview;
    updated.isReviewingStep4 = false;
    // 同時清除其他模式的 image 以防殘留
    delete updated.imageUrl;
    delete updated.imageUrlExt;
    delete updated.step6Passed;
    delete updated.step6VideoReviewScore;
    delete updated.step6VideoReviewText;
    // === END ===
`;

if (content.includes('delete updated.imageUrlKeyframes;') && !content.includes('delete updated.step4Passed;')) {
  content = content.replace(
    /delete\s+updated\.imageUrlKeyframes;\s*\n\s*delete\s+updated\.videoUrlKeyframes;/,
    clearResetSnippet.trim()
  );
  changed = true;
  console.log('✅ 已強化 handleClearAllKeyframes：清除時會 reset step4Passed / score 等殘留狀態');
} else if (content.includes('delete updated.imageUrlKeyframes;')) {
  // 已經有或結構不同，嘗試插入
  content = content.replace(
    /delete\s+updated\.imageUrlKeyframes;/,
    `delete updated.imageUrlKeyframes;\n    delete updated.step4Passed;\n    delete updated.step4ImageReviewScore;\n    delete updated.step4ImageReviewText;\n    updated.isReviewingStep4 = false;`
  );
  changed = true;
  console.log('✅ 已插入 step4 清除到 Clear 函數');
}

// ========== 3. 容錯強制通過時也要確保有圖才標記 passed（可選加強） ==========
// 找到強制通過的地方，加入檢查
const forcePassPattern = /step4ImageReviewScore:\s*70,\s*step4ImageReviewText:\s*[\"']（容錯模式強制通過）[^\"']*[\"'],\s*step4Passed:\s*true/g;
if (forcePassPattern.test(content)) {
  // 暫時不強制改，因為可能在沒圖的 fallback 情況，先依賴上面的 skip 檢查
  console.log('ℹ️ 發現容錯強制通過邏輯，已由新的 skip 條件保護');
}

if (changed) {
  fs.writeFileSync(appPath, content, 'utf8');
  console.log('✅ src/App.tsx 已成功修改');
} else {
  console.log('⚠️ 沒有實際變更，可能程式碼已更新或匹配失敗');
}

console.log('\\n✅ 修復腳本執行完畢！');
console.log('建議：');
console.log('1. git add src/App.tsx');
console.log('2. git commit -m \"fix: STEP4 skip now requires valid image URL + clear resets step4 flags\"');
console.log('3. git push → Railway 自動部署');
console.log('部署後請用「一鍵清除已生成」徹底清一次，再重新生成。');
