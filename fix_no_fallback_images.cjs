/**
 * fix_no_fallback_images.cjs
 * - Block Unsplash / NanoBanana / Pollinations stock fallbacks on server
 * - handleGenerateImage: empty imageField on fail
 * - Full-auto STEP 3: skip-failed → retry loop (max 5 rounds), then stop
 * - Clear-all: hard wipe keyframe media + workflow gates
 * CRLF-safe + idempotent.
 */
const fs = require("fs");
const path = require("path");

function read(p) {
  return fs.readFileSync(p, "utf8");
}
function write(p, content, label) {
  fs.writeFileSync(p, content, "utf8");
  console.log(`✅ ${label}`);
}

// ---------- server.ts ----------
const serverPath = path.join(__dirname, "server.ts");
if (fs.existsSync(serverPath)) {
  let server = read(serverPath);
  let changed = false;

  // Block Nano Banana / Mistral Unsplash stock engine
  if (
    server.includes("高速繪圖引擎生成視覺預覽") ||
    (server.includes("activeEngine === 'nanobanana'") &&
      server.includes("getFallbackImage(prompt") &&
      server.includes("imageUrl: fallbackUrl"))
  ) {
    const nanoBlock =
      /if\s*\(\s*activeEngine\s*===\s*['"]nanobanana['"]\s*\|\|\s*activeEngine\s*===\s*['"]mistral['"]\s*\)\s*\{[\s\S]*?return\s+res\.json\(\s*\{[\s\S]*?imageUrl:\s*fallbackUrl[\s\S]*?\}\s*\);\s*\}/;
    if (nanoBlock.test(server)) {
      server = server.replace(
        nanoBlock,
        `if (activeEngine === 'nanobanana' || activeEngine === 'mistral') {
      // Disabled: previously returned Unsplash stock photos
      return res.status(500).json({
        error: "已禁用保底圖片引擎（Nano Banana / Mistral Unsplash）。請使用 Agnes 真實繪圖。",
        noFallback: true
      });
    }`
      );
      changed = true;
      console.log("✅ server: blocked nanobanana/mistral unsplash engine");
    }
  }

  // Block outer "Nano Banana 引擎為您生成高品質視覺預覽" stock return
  if (server.includes("繪圖引擎忙碌中，已自動使用 Nano Banana")) {
    server = server.replace(
      /return\s+res\.json\(\s*\{\s*imageUrl:\s*fallbackUrl,\s*isAgnesImage:\s*false,\s*message:\s*"繪圖引擎忙碌中，已自動使用 Nano Banana 引擎為您生成高品質視覺預覽！"\s*\}\s*\);/g,
      'return res.status(500).json({ error: "所有繪圖引擎均失敗，已禁用保底圖片。請稍後重試或手動上傳。", noFallback: true });'
    );
    changed = true;
    console.log("✅ server: blocked Nano Banana stock return");
  }

  // Block isFallback true return
  if (server.includes("isFallback: true") && server.includes("friendlyReason")) {
    server = server.replace(
      /return\s+res\.json\(\s*\{\s*imageUrl:\s*fallbackUrl,\s*isFallback:\s*true,\s*message:\s*friendlyReason\s*\}\s*\);/g,
      'return res.status(500).json({ error: friendlyReason || "繪圖失敗，已禁用保底圖片", noFallback: true });'
    );
    changed = true;
    console.log("✅ server: blocked catch isFallback return");
  }

  // Strip Pollinations success returns that save pollinations-fallback-* files
  if (server.includes("pollinations-fallback-") && server.includes("return res.json({")) {
    // Replace any success return of pollinations-fallback with 500
    const pollSuccess =
      /return\s+res\.json\(\s*\{\s*imageUrl:\s*`\/assets\/\$\{filename\}`,\s*isAgnesImage:\s*false,\s*message:\s*"[^"]*(?:Pollinations|備用引擎|安全重寫)[^"]*"\s*\}\s*\);/g;
    if (pollSuccess.test(server)) {
      server = server.replace(
        pollSuccess,
        'return res.status(500).json({ error: "已禁用 Pollinations 保底圖片，請使用 Agnes 真實繪圖。", noFallback: true });'
      );
      changed = true;
      console.log("✅ server: blocked pollinations-fallback success returns");
    }
  }

  // Ensure final catch returns 500 noFallback (if still returning imageUrl: fallbackUrl at end of generate-image)
  if (
    server.includes("Gracefully falling back to high-quality curated") &&
    server.includes("return res.json({") &&
    server.includes("imageUrl: fallbackUrl")
  ) {
    // leave other paths; final catch already may be 500
  }

  if (changed) write(serverPath, server, "server.ts no-fallback updates");
  else console.log("[fix] server.ts: no-fallback already OK or patterns already applied");
}

// ---------- App.tsx ----------
const appPath = path.join(__dirname, "src", "App.tsx");
if (!fs.existsSync(appPath)) {
  console.error("App.tsx missing");
  process.exit(1);
}

let app = read(appPath);
let changed = false;

// Normalize helpers: match both LF and CRLF
function has(s) {
  return app.includes(s);
}

// 1) handleGenerateImage: remove unsplash fallback assignment
const unsplashLine =
  '[imageField]: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80",';
if (has(unsplashLine)) {
  app = app.replace(
    unsplashLine,
    '// NO FALLBACK IMAGE — leave empty so skip/retry can work\n              [imageField]: "",'
  );
  changed = true;
  console.log("✅ App: removed handleGenerateImage unsplash");
}

const resolutionMsg =
  'resolution: "⚠️ 已自動調用 Unsplash 高清備用插圖（降級容錯），確保故事完整度並順利推進工作流！"';
if (has(resolutionMsg)) {
  app = app.replace(
    resolutionMsg,
    'resolution: "⚠️ 繪圖失敗，已拒絕保底圖片。請手動重試或上傳。"'
  );
  changed = true;
  console.log("✅ App: resolution message");
}

// 2) STEP 3 skip-circle inject (idempotent via maxImageRounds marker)
const step3Done = "maxImageRounds = 5";
const step3Key = "STEP 3: 生成所有鏡頭的首幀";
const step4Key = "STEP 4: AI 檢查所有首幀是否合理";

if (!has(step3Done)) {
  const s3 = app.indexOf(step3Key);
  const s4 = app.indexOf(step4Key, s3 > -1 ? s3 : 0);
  if (s3 !== -1 && s4 !== -1) {
    // Expand start to beginning of the ===== separator line before STEP 3
    let start = app.lastIndexOf("// =====", s3);
    if (start < 0 || s3 - start > 250) start = Math.max(0, app.lastIndexOf("\n", s3) + 1);
    while (start > 0 && (app[start - 1] === " " || app[start - 1] === "\t")) start--;

    // End at ===== separator before STEP 4 (keep STEP 4 header)
    let end = app.lastIndexOf("// =====", s4);
    if (end < 0 || s4 - end > 250) end = Math.max(0, app.lastIndexOf("\n", s4) + 1);
    while (end > 0 && (app[end - 1] === " " || app[end - 1] === "\t")) end--;

    const newStep3 = `// =========================================================================
      // STEP 3: 生成所有鏡頭的首幀（跳過失敗→循環重試，最多 5 輪，絕不使用保底圖）
      // =========================================================================
      setFullAutoLogs(prev => [...prev, "🎬 [步驟 3] 正在生成所有分鏡的首幀（失敗會先跳過，成功後回頭重試，最多 5 輪循環）..."]);

      const isRealImageUrl = (url: string | undefined | null) => {
        if (!url || typeof url !== "string") return false;
        if (url.includes("unsplash.com")) return false;
        if (url.includes("gradient") || url.includes("placeholder")) return false;
        if (url.includes("pollinations-fallback")) return false;
        if (url.trim() === "" || url === "null" || url === "undefined") return false;
        return url.startsWith("http") || url.startsWith("/assets/") || url.startsWith("data:image");
      };

      const maxImageRounds = 5;
      let imageRound = 0;
      let allImagesReady = false;

      while (!allImagesReady && imageRound < maxImageRounds) {
        imageRound++;
        setFullAutoLogs(prev => [...prev, \`🔄 [步驟 3] 第 \${imageRound}/\${maxImageRounds} 輪：掃描並生成尚未成功的首幀...\`]);

        let anyAttemptedThisRound = false;
        let successThisRound = 0;

        for (let i = 0; i < currentScenes.length; i++) {
          const scene = currentScenes[i];

          const curProjListCheck = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
          const curProjCheck = curProjListCheck.find(p => p.id === activeProjectId);
          const freshSCheck = curProjCheck?.scenes.find(s => s.id === scene.id) || scene;
          // Only trust the active mode field — never fall back to other tabs' old images
          const currentImgUrl = freshSCheck[imageField];

          if (isRealImageUrl(currentImgUrl)) {
            continue;
          }

          anyAttemptedThisRound = true;
          updateActiveProject((prev) => ({
            scenes: prev.scenes.map(s => s.id === scene.id ? { ...s, workflowStep: 3 } : s)
          }));

          setFullAutoLogs(prev => [...prev, \`🎨 [鏡頭 \${i + 1}] 第 \${imageRound} 輪：正在繪製首幀...\`]);
          try {
            await handleGenerateImage(scene.id, "agnes");

            await new Promise<void>((resolve, reject) => {
              let checkCount = 0;
              const checkImgInterval = setInterval(() => {
                checkCount++;
                const curProjList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
                const curProj = curProjList.find(p => p.id === activeProjectId);
                const freshS = curProj?.scenes.find(s => s.id === scene.id);

                if (freshS) {
                  if (!freshS[isGenImgField]) {
                    clearInterval(checkImgInterval);
                    if (isRealImageUrl(freshS[imageField])) {
                      resolve();
                    } else {
                      reject(new Error("影像生成完畢，但未回傳有效真實首幀網址（已禁用保底圖）。"));
                    }
                  }
                }
                if (checkCount > 180) {
                  clearInterval(checkImgInterval);
                  reject(new Error("影像生成超時。"));
                }
              }, 1500);
            });

            successThisRound++;
            setFullAutoLogs(prev => [...prev, \`[鏡頭 \${i + 1}] ✅ 成功繪製真實首幀！\`]);
          } catch (imgErr: any) {
            setFullAutoLogs(prev => [...prev, \`[鏡頭 \${i + 1}] ⚠️ 首幀失敗，先跳過，稍後再試：\${imgErr.message || imgErr}\`]);
            updateActiveProject((prev) => ({
              scenes: prev.scenes.map(s => s.id === scene.id ? {
                ...s,
                isGeneratingImage: false,
                isGeneratingImageExt: false,
                isGeneratingImageKeyframes: false
              } : s)
            }));
            await new Promise(r => setTimeout(r, 800));
          }
        }

        const finalCheckList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
        const finalProj = finalCheckList.find(p => p.id === activeProjectId);
        const scenesNow = finalProj?.scenes || currentScenes;
        const missing = scenesNow.filter(s => !isRealImageUrl(s[imageField]));

        if (missing.length === 0) {
          allImagesReady = true;
          setFullAutoLogs(prev => [...prev, "✅ [步驟 3] 所有鏡頭真實首幀已全部生成成功！"]);
        } else if (!anyAttemptedThisRound) {
          break;
        } else {
          setFullAutoLogs(prev => [...prev, \`📋 [步驟 3] 第 \${imageRound} 輪結束：本輪成功 \${successThisRound} 個，尚餘 \${missing.length} 個未成功，將進入下一輪...\`]);
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      if (!allImagesReady) {
        const finalCheckList2 = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
        const finalProj2 = finalCheckList2.find(p => p.id === activeProjectId);
        const scenesNow2 = finalProj2?.scenes || currentScenes;
        const stillMissing = scenesNow2
          .map((s, idx) => ({ s, idx }))
          .filter(({ s }) => !isRealImageUrl(s[imageField]));

        setFullAutoLogs(prev => [
          ...prev,
          \`🛑 [步驟 3] 已完成 \${maxImageRounds} 輪循環，仍有 \${stillMissing.length} 個鏡頭未能生成真實相片。\`,
          "💡 已停止自動推進，請手動為失敗鏡頭重新生成或上傳圖片，完成後再繼續下一步。",
          ...stillMissing.map(({ idx }) => \`   - 鏡頭 \${idx + 1} 仍缺真實首幀\`)
        ]);
        showToast(\`[步驟 3] \${stillMissing.length} 個鏡頭首幀失敗，已停低交人手處理\`, "error");
        throw new Error("IMAGE_GEN_MANUAL_INTERVENTION");
      }

      `;

    app = app.slice(0, start) + newStep3 + app.slice(end);
    changed = true;
    console.log("✅ STEP 3 skip-circle injected", { start, end, s3, s4 });
  } else {
    console.log("[fix] STEP 3/4 markers not found", {
      s3: app.indexOf(step3Key),
      s4: app.indexOf(step4Key),
    });
  }
} else {
  // Already has skip-circle: ensure imageField-only checks (not imageUrl fallback)
  if (
    has("maxImageRounds = 5") &&
    has("freshSCheck[imageField] || freshSCheck.imageUrl || freshSCheck.imageUrlKeyframes")
  ) {
    app = app.replace(
      /freshSCheck\[imageField\] \|\| freshSCheck\.imageUrl \|\| freshSCheck\.imageUrlKeyframes/g,
      "freshSCheck[imageField]"
    );
    app = app.replace(
      /freshS\[imageField\] \|\| freshS\.imageUrl \|\| freshS\.imageUrlKeyframes/g,
      "freshS[imageField]"
    );
    app = app.replace(
      /s\[imageField\] \|\| s\.imageUrl \|\| s\.imageUrlKeyframes/g,
      "s[imageField]"
    );
    changed = true;
    console.log("✅ STEP 3: imageField-only checks enforced");
  } else {
    console.log("[fix] STEP 3 skip-circle already present");
  }
}

// residual unsplash fallback in lenient branch
if (app.includes('const fallbackImg = "https://images.unsplash.com/photo-1618005182384')) {
  app = app.replace(
    /const fallbackImg = "https:\/\/images\.unsplash\.com\/photo-1618005182384[^"]+";/,
    'const fallbackImg = ""; throw new Error("IMAGE_GEN_MANUAL_INTERVENTION");'
  );
  changed = true;
  console.log("✅ residual fallbackImg removed");
}

// outer catch for IMAGE_GEN_MANUAL_INTERVENTION
if (
  has('throw new Error("IMAGE_GEN_MANUAL_INTERVENTION")') &&
  !has('err.message === "IMAGE_GEN_MANUAL_INTERVENTION"')
) {
  const outer = 'if (err.message === "STRICT_LOCK_PAUSE") {';
  if (has(outer)) {
    app = app.replace(
      outer,
      'if (err.message === "IMAGE_GEN_MANUAL_INTERVENTION") {\n        setFullAutoLogs(prev => [\n          ...prev,\n          "🛑 首幀生成已達 5 輪上限，部分鏡頭仍未成功。已停低，請手動補齊真實相片後再繼續。"\n        ]);\n      } else if (err.message === "STRICT_LOCK_PAUSE") {'
    );
    changed = true;
    console.log("✅ outer catch IMAGE_GEN_MANUAL_INTERVENTION");
  }
}

// clear-all keyframes hardened wipe (CRLF-safe via includes + flexible replace)
if (has("delete updated.imageUrlKeyframes;") && !has("delete updated.startFrameKeyframes")) {
  // Insert after videoUrlKeyframes delete
  app = app.replace(
    /delete updated\.imageUrlKeyframes;\r?\n\s*delete updated\.videoUrlKeyframes;/,
    `delete updated.imageUrlKeyframes;
      delete updated.videoUrlKeyframes;
      delete updated.startFrameKeyframes;
      delete updated.endFrameKeyframes;
      delete updated.endFrameDescriptionKeyframes;
      delete updated.startFrameSourceKeyframes;
      delete updated.step3ImageErrorKeyframes;
      delete updated.midpointImageUrlKeyframes;`
  );
  if (!has("updated.workflowStep = 1;")) {
    app = app.replace(
      /updated\.hasAutoRegeneratedReview = false;\r?\n\s*return updated;/,
      `updated.hasAutoRegeneratedReview = false;
      updated.workflowStep = 1;
      updated.step4Passed = false;
      updated.step6Passed = false;
      updated.step4ImageReviewScore = 0;
      updated.step6VideoReviewScore = 0;
      updated.step7AdviceForNext = "";
      updated.step4ImageReviewText = "";
      updated.step6VideoReviewText = "";
      delete updated.step2OptimizedPrompt;
      delete updated.step2OptimizedNegative;
      return updated;`
    );
  }
  changed = true;
  console.log("✅ clear-all keyframes wipe hardened");
} else if (has("delete updated.startFrameKeyframes")) {
  console.log("[fix] clear-all keyframes wipe already present");
}

if (changed) write(appPath, app, "App.tsx no-fallback updates");
else console.log("[fix] App.tsx no changes");

console.log("fix_no_fallback_images done.");
