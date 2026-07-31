/**
 * fix_remove_unsplash_fallback.cjs
 * Remove all hardcoded Unsplash fallback images that show wrong architecture photos
 * when real generation fails. Better to show empty / error than misleading image.
 */

const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'src', 'App.tsx');

console.log('🔧 Removing misleading Unsplash fallback images...');

if (!fs.existsSync(appPath)) {
  console.error('❌ src/App.tsx not found');
  process.exit(1);
}

let content = fs.readFileSync(appPath, 'utf8');
let changed = false;

// Common Unsplash fallbacks found previously
const unsplashPatterns = [
  /https:\/\/images\.unsplash\.com\/photo-1618005182384-a83a8bd57fbe[^"'\s]*/g,
  /https:\/\/images\.unsplash\.com\/photo-1579783900882-c0d3dad7b119[^"'\s]*/g,
  /https:\/\/images\.unsplash\.com\/photo-1541701494587-cb58502866ab[^"'\s]*/g,
  /"https:\/\/images\.unsplash\.com\/[^"]+"/g,
  /'https:\/\/images\.unsplash\.com\/[^']+'/g,
];

// Replace fallback assignments with empty string or null so UI shows empty / error state
for (const pat of unsplashPatterns) {
  if (pat.test(content)) {
    content = content.replace(pat, '""');
    changed = true;
    console.log('✅ Removed one Unsplash fallback pattern');
  }
}

// More targeted: the common fallback assignment
const fallbackAssign = /\[imageField\]:\s*["']https:\/\/images\.unsplash\.com[^"']+["']/g;
if (fallbackAssign.test(content)) {
  content = content.replace(fallbackAssign, '[imageField]: ""');
  changed = true;
  console.log('✅ Cleared [imageField] Unsplash assignment');
}

const fallbackImgVar = /const\s+fallbackImg\s*=\s*["']https:\/\/images\.unsplash\.com[^"']+["']/g;
if (fallbackImgVar.test(content)) {
  content = content.replace(fallbackImgVar, 'const fallbackImg = ""');
  changed = true;
  console.log('✅ Cleared fallbackImg variable');
}

// Also clear any remaining assignments that set imageUrl* to Unsplash
content = content.replace(
  /(imageUrl(?:Keyframes|Ext)?\s*[:=]\s*)["']https:\/\/images\.unsplash\.com[^"']+["']/g,
  '$1""'
);

if (changed) {
  fs.writeFileSync(appPath, content, 'utf8');
  console.log('✅ src/App.tsx updated - no more misleading Unsplash images');
} else {
  console.log('⚠️ No Unsplash patterns found (may already be cleaned or different format)');
}

console.log('\nDone. Failed generations will now show empty instead of wrong building photos.');
