/**
 * fix_agnes_content_policy_retry.cjs
 * Agnes HTTP 400 content_policy_violation → auto rewrite prompt → retry
 * Applies to storyboard AND avatar (was avatar-only before).
 */
const fs = require("fs");
const path = require("path");

const serverPath = path.join(__dirname, "server.ts");
if (!fs.existsSync(serverPath)) {
  console.error("server.ts missing");
  process.exit(0);
}

let server = fs.readFileSync(serverPath, "utf8");
let changed = false;

// Already patched?
if (server.includes("原提示詞觸發內容政策，已自動安全改寫後成功生成分鏡圖像")) {
  console.log("[fix] content-policy retry already present");
  process.exit(0);
}

const NEW_BLOCK = `
      // Content-policy / hard fail: rewrite prompt to be safe and retry (storyboard + avatar)
      try {
        const lastErr = String((generateAgnesImageUrl as any)._lastError || "");
        const isPolicy =
          lastErr.includes("content_policy_violation") ||
          lastErr.includes("Content policy") ||
          lastErr.includes("Unable to generate this content") ||
          lastErr.includes("invalid_request_error");

        if (isPolicy || isAvatar) {
          console.log("[Toonflow] Agnes failed (policy or avatar) — safety rewrite + retry...");
          console.log("[Toonflow] Last Agnes error:", lastErr.substring(0, 240));
          const safePrompt = await rewritePromptToBeSafe(enhancedPrompt, customApiKey);
          activePromptForFallback = safePrompt || enhancedPrompt;

          let retryPrompt = activePromptForFallback;
          if (isPolicy) {
            // Strip heavy mandate blocks that often trigger false-positive filters
            retryPrompt = retryPrompt
              .replace(/\\[NEGATIVE PROMPT MANDATE:[^\\]]*\\]/gi, "")
              .replace(/\\[CLOTHING CONSISTENCY MANDATE\\][^\\[]*/gi, "")
              .replace(/Absolutely NO text[^.]*\\.?/gi, "no text, no watermark.")
              .replace(/\\s+/g, " ")
              .trim();
            if (retryPrompt.length > 900) {
              retryPrompt = retryPrompt.substring(0, 900);
            }
            retryPrompt =
              "Safe for work, family-friendly, non-violent, clean artistic illustration. " +
              retryPrompt +
              " Masterpiece, high quality, completely clean image, no text, no watermark.";
          }

          const retry = await generateAgnesImageUrl(retryPrompt, size, customApiKey, 3);
          if (retry?.url) {
            return res.json({
              imageUrl: retry.url,
              isAgnesImage: true,
              message: isAvatar
                ? "成功使用 Agnes AI（安全改寫後）生成一致性三視角角色設計圖！"
                : "原提示詞觸發內容政策，已自動安全改寫後成功生成分鏡圖像！"
            });
          }
        }
      } catch (e: any) {
        console.warn("[Toonflow] Safety rewrite path failed:", e?.message || e);
      }
`;

// Strategy A: exact avatar-only block
const exactOld = `// Avatar: one more pass with safety-rewritten prompt if primary Agnes failed
      try {
        if (isAvatar) {
          console.log("[Toonflow] Avatar primary Agnes failed — trying safety rewrite + retry...");
          const safePrompt = await rewritePromptToBeSafe(enhancedPrompt, customApiKey);
          activePromptForFallback = safePrompt || enhancedPrompt;
          const retry = await generateAgnesImageUrl(activePromptForFallback, size, customApiKey, 2);
          if (retry?.url) {
            return res.json({
              imageUrl: retry.url,
              isAgnesImage: true,
              message: "成功使用 Agnes AI（安全改寫後）生成一致性三視角角色設計圖！"
            });
          }
        }
      } catch (e: any) {
        console.warn("[Toonflow] Avatar safety rewrite path failed:", e?.message || e);
      }`;

if (server.includes(exactOld)) {
  server = server.replace(exactOld, NEW_BLOCK.trimStart());
  changed = true;
  console.log("✅ replaced exact avatar-only block");
} else {
  // Strategy B: inject before Soft Gemini fallback
  const softMark = "// Soft Gemini fallback only if key exists (not stock photos)";
  if (server.includes(softMark)) {
    // Remove old avatar-only try if still around (partial)
    if (server.includes("Avatar primary Agnes failed")) {
      server = server.replace(
        /\/\/ Avatar: one more pass[\s\S]*?Avatar safety rewrite path failed:[\s\S]*?\n\s*\}/,
        ""
      );
    }
    server = server.replace(softMark, NEW_BLOCK + "\n      " + softMark);
    changed = true;
    console.log("✅ injected policy retry before Soft Gemini fallback");
  } else {
    console.log("[fix] injection points not found");
  }
}

if (changed) {
  fs.writeFileSync(serverPath, server, "utf8");
  console.log("✅ server.ts written");
} else {
  console.log("[fix] no changes");
}

console.log("fix_agnes_content_policy_retry done.");
