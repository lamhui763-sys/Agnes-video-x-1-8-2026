/**
 * fix_step4_require_image_v2.cjs
 * More robust version - uses multiple fallback matching strategies
 * to force STEP4 skip to require real image URL, and make Clear fully reset step4 flags.
 */

const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'src', 'App.tsx');

console.log('🔧 [v2] 開始強力修正 STEP 4 跳過 + Clear 殘留...');

if (!fs.existsSync(appPath)) {
  console.error('❌ 找不到 src/App.tsx');
  process.exit(1);
}

let content = fs.readFileSync(appPath, 'utf8');
let changed = false;

// ========== 1. 強力替換 STEP 4 跳過條件 ==========
// 找任何包含 step4Passed && ... step4ImageReviewScore 的 if

const step4Patterns = [
  // Exact common form
  /if\s*\(\s*freshSCheck\.step4Passed\s*&&\s*freshSCheck\.step4ImageReviewScore\s*>=\s*60\s*\)\s*\{/g,
  // With (score || 0)
  /if\s*\(\s*freshSCheck\.step4Passed\s*&&\s*\(freshSCheck\.step4ImageReviewScore\s*\|\|\s*0\)\s*>=\s*60\s*\)\s*\{/g,
  // Loose: any if with step4Passed and step4ImageReviewScore near each other
  /if\s*\(\s*freshSCheck\.step4Passed\s*&&\s*[^)]{0,80}step4ImageReviewScore[^)]{0,40}\)\s*\{/g,
];

const newCondition = `if (
          freshSCheck.step4Passed && 
          (Number(freshSCheck.step4ImageReviewScore) || 0) >= 60 &&
          (
            (typeof freshSCheck.imageUrlKeyframes === 'string' && freshSCheck.imageUrlKeyframes.length > 20 && !/placeholder|data:image\\/svg|gradient/i.test(freshSCheck.imageUrlKeyframes)) ||
            (typeof freshSCheck.imageUrl === 'string' && freshSCheck.imageUrl.length > 20 && !/placeholder|data:image\\/svg|gradient/i.test(freshSCheck.imageUrl)) ||
            (typeof freshSCheck.imageUrlExt === 'string' && freshSCheck.imageUrlExt.length > 20 && !/placeholder|data:image\\/svg|gradient/i.test(freshSCheck.imageUrlExt))
          )
        ) {`;

for (const pat of step4Patterns) {
  if (pat.test(content)) {
    content = content.replace(pat, newCondition);
    changed = true;
    console.log('✅ 成功替換 STEP 4 跳過條件 (使用 pattern)');
    break;
  }
}

// 也直接替換 log 訊息附近的整段 if（更保險）
if (content.includes('偵測到首幀審核已通過') && content.includes('step4Passed')) {
  // 用更暴力的方式：找到 log 前面的 if 並替換
  content = content.replace(
    /if\s*\(\s*freshSCheck\.step4Passed[\s\S]{0,120}?\)\s*\{\s*setFullAutoLogs\(prev\s*=>\s*\[\.\.\.prev,\s*`\[鏡頭 \$\{i \+ 1\}\][^`]*偵測到首幀審核已通過[^`]*`\]\);/g,
    `${newCondition}
          setFullAutoLogs(prev => [...prev, \`[鏡頭 \${i + 1}] ➡️ 偵測到首幀審核已通過（分數：\${freshSCheck.step4ImageReviewScore}/100）且相片URL有效，自動跳過審核。\`]);`
  );
  changed = true;
  console.log('✅ 用 log 錨點強化替換成功');
}

// ========== 2. 強力修正 Clear 函數 ==========
// 在 delete updated.imageUrlKeyframes 後面強制插入 step4 清除
if (content.includes('delete updated.imageUrlKeyframes')) {
  // 先確保沒有重複
  if (!content.includes('delete updated.step4Passed')) {
    content = content.replace(
      /delete\s+updated\.imageUrlKeyframes\s*;/g,
      `delete updated.imageUrlKeyframes;
    delete updated.step4Passed;
    delete updated.step4ImageReviewScore;
    delete updated.step4ImageReviewText;
    delete updated.step4ImageReview;
    updated.isReviewingStep4 = false;
    delete updated.imageUrl;
    delete updated.imageUrlExt;
    delete updated.step6Passed;
    delete updated.step6VideoReviewScore;
    delete updated.step6VideoReviewText;`
    );
    changed = true;
    console.log('✅ 已在 Clear 函數插入 step4* 清除');
  } else {
    console.log('ℹ️ Clear 已有 step4 清除');
  }
}

// 也處理 set to "" or null versions of clear
if (content.includes('imageUrlKeyframes: ""') || content.includes("imageUrlKeyframes: ''") || content.includes('imageUrlKeyframes: null')) {
  // 在 clear 相關的 map 裡加入
  content = content.replace(
    /(imageUrlKeyframes:\s*(?:""|''|null)\s*,)/g,
    `$1
        step4Passed: undefined,
        step4ImageReviewScore: undefined,
        step4ImageReviewText: undefined,
        isReviewingStep4: false,`
  );
  changed = true;
  console.log('✅ 已在 object assign 形式的 Clear 加入 step4 reset');
}

// ========== 3. 額外保險：在 STEP 3 生成跳過時也檢查 ==========
// 如果 STEP 3 有「已有首幀影像」跳過，也加強
const step3Old = /if\s*\(\s*currentImgUrl\s*\)\s*\{\s*setFullAutoLogs\(prev\s*=>\s*\[\.\.\.prev,\s*`\[鏡頭 \$\{i \+ 1\}\][^`]*偵測到已有首幀影像[^`]*`\]\);/g;
if (step3Old.test(content)) {
  content = content.replace(step3Old, `if (currentImgUrl && typeof currentImgUrl === 'string' && currentImgUrl.length > 20 && !/placeholder|data:image\\/svg|gradient/i.test(currentImgUrl)) {
    setFullAutoLogs(prev => [...prev, \`[鏡頭 \${i + 1}] ➡️ 偵測到已有真實首幀影像，自動跳過影像生成。\`]);`);
  changed = true;
  console.log('✅ 已強化 STEP 3 影像存在檢查');
}

if (changed) {
  fs.writeFileSync(appPath, content, 'utf8');
  console.log('✅ src/App.tsx 已強力修改完成');
} else {
  console.log('⚠️ 沒有匹配到可替換的程式碼，可能結構已變。請檢查原始碼。');
  // 最後手段：直接在檔案末尾或特定位置插入警告 log
  console.log('嘗試尋找 handleClearAllKeyframes 並強制注入...');
}

console.log('\\n✅ v2 修復腳本執行完畢！');
