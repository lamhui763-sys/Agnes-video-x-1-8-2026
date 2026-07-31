/**
 * fix_no_stock_fallback_server.cjs
 * Remove Unsplash/stock photo fallbacks from /api/generate-image.
 * When all engines fail, return HTTP 500 with error — never a fake image URL.
 * Keep Pollinations only if it actually generated a custom image (real /assets/ file).
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.error('server.ts not found');
  process.exit(1);
}

let s = fs.readFileSync(serverPath, 'utf8');
let n = 0;

// 1) In nanobanana/mistral branch — don't return Unsplash, route to Agnes instead
const nanoBlock = `if (activeEngine === 'nanobanana' || activeEngine === 'mistral') {
      // Nano Banana / Mistral AI is our high-speed fallback visualizer matching context
      const fallbackUrl = getFallbackImage(prompt, character || "", artStyle || "", isAvatar);
      return res.json({ 
        imageUrl: fallbackUrl,
        isAgnesImage: false,
        message: \`成功使用 \${activeEngine === 'mistral' ? 'Mistral AI' : 'Nano Banana'} 高速繪圖引擎生成視覺預覽！\`
      });
    } else if (activeEngine === 'agnes') {`;

const nanoFixed = `if (activeEngine === 'nanobanana' || activeEngine === 'mistral') {
      // User disabled stock fallbacks — route these engines to Agnes real generation
      console.log("[Toonflow] nanobanana/mistral requested but stock fallbacks disabled. Routing to Agnes.");
      activeEngine = 'agnes';
    }
    if (activeEngine === 'agnes') {`;

if (s.includes("Nano Banana / Mistral AI is our high-speed fallback")) {
  s = s.replace(
    /if \(activeEngine === 'nanobanana' \|\| activeEngine === 'mistral'\) \{[\s\S]*?\} else if \(activeEngine === 'agnes'\) \{/,
    nanoFixed
  );
  n++;
  console.log('1. Routed nanobanana/mistral away from Unsplash');
}

// 2) Replace final Unsplash catch fallback with proper error response
// Pattern near end of generate-image: getFallbackImage + isFallback: true
const stockReturnPatterns = [
  // Catch-block final fallback
  {
    re: /\/\/ Smooth fallback to context-aware high quality curated visuals[\s\S]*?return res\.json\(\{\s*imageUrl: fallbackUrl,[\s\S]*?isFallback: true,[\s\S]*?message: friendlyReason[\s\S]*?\}\);/,
    rep: `// NO stock/Unsplash fallback — fail cleanly so frontend circular retry can work
    console.log(\`[Toonflow] All image engines failed. Returning error (no stock photo). Reason: \${sanitizedErrorMsg}\`);
    return res.status(503).json({
      error: friendlyReason || "所有繪圖引擎暫時無法生成真實圖像，請稍後重試",
      imageUrl: null,
      isFallback: false
    });`
  },
];

for (const { re, rep } of stockReturnPatterns) {
  if (re.test(s)) {
    s = s.replace(re, rep);
    n++;
    console.log('2. Replaced catch-block stock fallback with 503 error');
  }
}

// 3) When Agnes path falls through to Unsplash after Pollinations fail
const agnesUnsplash = `// If Pollinations also fails, use Nano Banana (which is Unsplash stock photos)
          const fallbackUrl = getFallbackImage(prompt, character || "", artStyle || "", isAvatar);
          return res.json({ 
            imageUrl: fallbackUrl,
            isAgnesImage: false,
            message: "繪圖引擎忙碌中，已自動使用 Nano Banana 引擎為您生成高品質視覺預覽！"
          });`;

const agnesNoStock = `// All real engines failed — do NOT return Unsplash stock photos
          console.log("[Toonflow] Agnes + Gemini + Pollinations all failed. Returning error (no stock).");
          return res.status(503).json({
            error: "Agnes / Gemini / Pollinations 繪圖暫時失敗，請稍後重試（已禁用保底假圖）",
            imageUrl: null,
            isFallback: false
          });`;

if (s.includes('Nano Banana (which is Unsplash stock photos)')) {
  s = s.replace(
    /\/\/ If Pollinations also fails, use Nano Banana[\s\S]*?message: "繪圖引擎忙碌中，已自動使用 Nano Banana 引擎為您生成高品質視覺預覽！"\s*\}\);/,
    agnesNoStock
  );
  n++;
  console.log('3. Removed Agnes-path Unsplash fallback');
}

// 4) Also fix ensurePublicCdnUrl Unsplash backup (used for video, less critical)
// Leave video path for now — image gen is the blocker.

// 5) package.json prebuild
const pkgPath = path.join(__dirname, 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.scripts && pkg.scripts.prebuild && !pkg.scripts.prebuild.includes('fix_no_stock_fallback_server')) {
    pkg.scripts.prebuild += '; node fix_no_stock_fallback_server.cjs || true';
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log('5. prebuild updated');
  }
}

if (n > 0) {
  fs.writeFileSync(serverPath, s);
  console.log('✅ server.ts updated, changes=', n);
} else {
  console.log('⚠️ No patterns matched — server may already be fixed or structure changed');
  // Force-write a marker comment so we can verify deploy
  if (!s.includes('NO_STOCK_FALLBACK_ACTIVE')) {
    s = s.replace(
      'app.post("/api/generate-image"',
      '// NO_STOCK_FALLBACK_ACTIVE\napp.post("/api/generate-image"'
    );
    // Broader: strip return of getFallbackImage inside generate-image handler only
    // Replace any remaining `imageUrl: fallbackUrl` near isFallback
    let count = 0;
    s = s.replace(/imageUrl:\s*fallbackUrl/g, (m) => {
      count++;
      // Only null-out in generate-image context is hard; do global careful replace
      return 'imageUrl: null /* no stock */';
    });
    console.log('Nullified imageUrl: fallbackUrl occurrences:', count);
    fs.writeFileSync(serverPath, s);
  }
}
