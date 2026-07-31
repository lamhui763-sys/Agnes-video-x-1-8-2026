/**
 * fix_prompt_sanitize_agnes.cjs
 *
 * Root cause of fairy-tale / storyboard image failures:
 * 1) enhancedPrompt is huge (CLOTHING MANDATE + NEGATIVE MANDATE) → Agnes content_policy_violation
 * 2) Safety rewrite only ran for avatars, not storyboards
 * 3) Invalid sizes 1024x576 still in source path
 * 4) generateAgnesImageUrl missing extra_body.response_format in base source
 *
 * This script:
 * - Injects compactPromptForAgnes() helper
 * - Uses compact SFW prompt for FIRST Agnes call
 * - On any Agnes fail (esp policy), local sanitize + retry (no Gemini dependency)
 * - Forces supported sizes 1024x768 / 1024x1024
 * - Ensures generateAgnesImageUrl has extra_body + stores _lastError
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

// ---------- A) Inject compactPromptForAgnes helper (once) ----------
if (!server.includes("function compactPromptForAgnes(")) {
  const anchor = "// Helper to rewrite prompt to be 100% compliant with safety policies";
  const helper = `
// Compact + SFW sanitize for Agnes image API (avoids content_policy from long MANDATE blocks)
function compactPromptForAgnes(raw: string, opts?: { isAvatar?: boolean; artStyle?: string }): string {
  let p = (raw || "").trim();
  // Strip bracket mandates that often false-trigger filters
  p = p
    .replace(/\\[NEGATIVE PROMPT MANDATE:[^\\]]*\\]/gi, "")
    .replace(/\\[CLOTHING CONSISTENCY MANDATE\\][^\\[]*/gi, "")
    .replace(/\\[CRITICAL[^\\]]*\\]/gi, "")
    .replace(/Absolutely NO text[^.]*\\.?/gi, "no text, no watermark.")
    .replace(/DO NOT generate[^.]*\\.?/gi, "")
    .replace(/\\s+/g, " ")
    .trim();

  // Soften words that commonly trip policy even in fairy tales
  const softMap: [RegExp, string][] = [
    [/\\bblood(y)?\\b/gi, "red paint"],
    [/\\bgore\\b/gi, "drama"],
    [/\\bkill(ed|ing)?\\b/gi, "defeat"],
    [/\\bstab(bing|bed)?\\b/gi, "pointing"],
    [/\\bweapon(s)?\\b/gi, "prop"],
    [/\\bgun(s)?\\b/gi, "tool"],
    [/\\bknife|knives\\b/gi, "utensil"],
    [/\\bnaked|nude|nsfw\\b/gi, "fully clothed"],
    [/\\bseductive|sensual|erotic\\b/gi, "gentle"],
    [/\\bterror|horrific|horror\\b/gi, "mysterious"],
  ];
  for (const [re, rep] of softMap) p = p.replace(re, rep);

  const style = (opts?.artStyle || "").toLowerCase();
  const fairy =
    /fairy|童話|童話|anime|動漫|cartoon|卡通|illustration|插畫|ghibli|兒童/.test(style + " " + p);

  const prefix = opts?.isAvatar
    ? "Safe for work character design sheet, family-friendly, clean studio portrait. "
    : fairy
      ? "Wholesome children's fairy-tale illustration, soft watercolor anime style, family-friendly, G-rated, warm lighting, no violence. "
      : "Safe for work, family-friendly, non-violent, clean artistic illustration. ";

  const suffix = " Masterpiece, high quality, completely clean image, no text, no watermark, no logo.";

  // Keep under ~850 chars — Agnes policy is stricter on long adversarial-looking prompts
  const budget = 850 - prefix.length - suffix.length;
  if (p.length > budget) p = p.substring(0, budget);

  return (prefix + p + suffix).replace(/\\s+/g, " ").trim();
}

`;
  if (server.includes(anchor)) {
    server = server.replace(anchor, helper + anchor);
    changed = true;
    console.log("✅ injected compactPromptForAgnes");
  } else {
    // Fallback: before generate-image endpoint
    const genImg = "// Toonflow Feature: Storyboard Image Generator using Agnes AI";
    if (server.includes(genImg)) {
      server = server.replace(genImg, helper + genImg);
      changed = true;
      console.log("✅ injected compactPromptForAgnes before generate-image");
    }
  }
} else {
  console.log("[fix] compactPromptForAgnes already present");
}

// ---------- B) Patch agnes branch inside /api/generate-image ----------
// Replace the block from size selection through avatar-only rewrite
const OLD_AGNES_BLOCK_START = "if (activeEngine === 'agnes') {";
const markerCompact = "compactPromptForAgnes(enhancedPrompt";

if (server.includes(OLD_AGNES_BLOCK_START) && !server.includes("FAIRY_SAFE_AGNES_V1")) {
  // Find the agnes engine branch and rewrite core call path with markers
  // Strategy: replace size + first call + avatar-only block with compact + policy retry for all

  // 1) Fix sizes in agnes branch
  if (server.includes('let size = isAvatar ? "1024x1024" : "1024x576"')) {
    server = server.replace(
      /let size = isAvatar \? "1024x1024" : "1024x576";\s*if \(agnesImageMode === "fast"\) \{\s*size = isAvatar \? "512x512" : "768x432";\s*\} else if \(agnesImageMode === "balanced"\) \{\s*size = isAvatar \? "768x768" : "1024x576";\s*\}/g,
      `let size = isAvatar ? "1024x1024" : "1024x768";
      if (agnesImageMode === "fast") {
        size = isAvatar ? "1024x1024" : "1024x768";
      } else if (agnesImageMode === "balanced") {
        size = isAvatar ? "1024x1024" : "1024x768";
      }`
    );
    changed = true;
    console.log("✅ fixed sizes to 1024x768/1024x1024");
  }

  // 2) Replace first generateAgnesImageUrl(enhancedPrompt...) with compact version
  if (server.includes("const agnesResult = await generateAgnesImageUrl(enhancedPrompt, size, customApiKey, isAvatar ? 3 : 2);")) {
    server = server.replace(
      "const agnesResult = await generateAgnesImageUrl(enhancedPrompt, size, customApiKey, isAvatar ? 3 : 2);",
      `// FAIRY_SAFE_AGNES_V1 — compact SFW prompt before first call
      const compactPrimary = compactPromptForAgnes(enhancedPrompt, { isAvatar, artStyle });
      console.log("[Toonflow] Agnes compact prompt length:", compactPrimary.length, "(raw was", enhancedPrompt.length, ")");
      const agnesResult = await generateAgnesImageUrl(compactPrimary, size, customApiKey, isAvatar ? 3 : 2);`
    );
    changed = true;
    console.log("✅ first Agnes call uses compactPromptForAgnes");
  }

  // 3) Replace avatar-only safety rewrite with all-images policy retry using LOCAL compact (no LLM required)
  const avatarOnly = `// Avatar: one more pass with safety-rewritten prompt if primary Agnes failed
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

  const allRetry = `// Policy / hard fail retry for storyboard + avatar (local compact, no Gemini dependency)
      try {
        const lastErr = String((generateAgnesImageUrl as any)._lastError || "");
        console.log("[Toonflow] Agnes primary failed — local SFW compact retry. lastErr:", lastErr.substring(0, 220));
        let retryPrompt = compactPromptForAgnes(enhancedPrompt, { isAvatar, artStyle });
        // Even shorter second attempt
        if (retryPrompt.length > 600) retryPrompt = retryPrompt.substring(0, 600);
        retryPrompt =
          "G-rated wholesome illustration, soft colors, friendly characters, peaceful scene. " +
          retryPrompt;
        activePromptForFallback = retryPrompt;
        const retry = await generateAgnesImageUrl(retryPrompt, size, customApiKey, 3);
        if (retry?.url) {
          return res.json({
            imageUrl: retry.url,
            isAgnesImage: true,
            message: isAvatar
              ? "成功使用 Agnes AI（安全改寫後）生成一致性三視角角色設計圖！"
              : "原提示詞可能觸發內容政策，已自動精簡為安全版本後成功生成分鏡圖像！"
          });
        }
        // Optional LLM rewrite only if local compact still fails and looks like policy
        if (/content_policy|Unable to generate|invalid_request/i.test(lastErr)) {
          try {
            const llmSafe = await rewritePromptToBeSafe(retryPrompt, customApiKey);
            if (llmSafe && llmSafe.length > 20) {
              const retry2 = await generateAgnesImageUrl(
                compactPromptForAgnes(llmSafe, { isAvatar, artStyle }),
                size,
                customApiKey,
                2
              );
              if (retry2?.url) {
                return res.json({
                  imageUrl: retry2.url,
                  isAgnesImage: true,
                  message: "提示詞經安全改寫後成功生成圖像！"
                });
              }
            }
          } catch (llmErr: any) {
            console.warn("[Toonflow] LLM safety rewrite skipped:", llmErr?.message || llmErr);
          }
        }
      } catch (e: any) {
        console.warn("[Toonflow] Safety compact retry path failed:", e?.message || e);
      }`;

  if (server.includes(avatarOnly)) {
    server = server.replace(avatarOnly, allRetry);
    changed = true;
    console.log("✅ replaced avatar-only rewrite with all-images compact retry");
  } else if (server.includes("Avatar primary Agnes failed") && !server.includes("local SFW compact retry")) {
    // Fuzzy remove avatar block and inject before Soft Gemini
    server = server.replace(
      /\/\/ Avatar: one more pass[\s\S]*?Avatar safety rewrite path failed:[\s\S]*?\n\s*\}/,
      ""
    );
    const soft = "// Soft Gemini fallback only if key exists (not stock photos)";
    if (server.includes(soft)) {
      server = server.replace(soft, allRetry + "\n\n      " + soft);
      changed = true;
      console.log("✅ fuzzy injected compact retry");
    }
  } else if (server.includes("local SFW compact retry") || server.includes("FAIRY_SAFE_AGNES_V1")) {
    console.log("[fix] policy compact retry already present");
  } else {
    const soft = "// Soft Gemini fallback only if key exists (not stock photos)";
    if (server.includes(soft) && !server.includes("local SFW compact retry")) {
      server = server.replace(soft, allRetry + "\n\n      " + soft);
      changed = true;
      console.log("✅ injected compact retry before Gemini soft fallback");
    }
  }

  // 4) Surface _lastError in 500 message
  if (
    server.includes('"所有繪圖引擎均失敗，已禁用保底圖片。請稍後重試或手動上傳。"') &&
    !server.includes("(generateAgnesImageUrl as any)._lastError")
  ) {
    server = server.replace(
      '"所有繪圖引擎均失敗，已禁用保底圖片。請稍後重試或手動上傳。"',
      '"所有繪圖引擎均失敗，已禁用保底圖片。" + (((generateAgnesImageUrl as any)._lastError) ? (" 詳情: " + (generateAgnesImageUrl as any)._lastError) : " 請稍後重試或手動上傳。")'
    );
    changed = true;
    console.log("✅ surface last Agnes error");
  }
}

// ---------- C) Ensure generateAgnesImageUrl has extra_body + _lastError ----------
// Only if not already patched by fix_agnes_image_api
const FN_START = "async function generateAgnesImageUrl(";
const FN_NEXT = "async function generateContentWithFallback(";
const start = server.indexOf(FN_START);
const next = server.indexOf(FN_NEXT);
if (start !== -1 && next !== -1 && next > start) {
  const slice = server.slice(start, next);
  if (!slice.includes("extra_body") || !slice.includes("_lastError")) {
    const newFn = `async function generateAgnesImageUrl(
  prompt: string,
  size: string,
  customApiKey?: string,
  maxAttempts: number = 3
): Promise<{ url: string; model: string } | null> {
  const sanitizedAgnesKey = getAgnesApiKey(customApiKey);
  if (!sanitizedAgnesKey) {
    console.error("[Toonflow] No valid AGNES_API_KEY for image generation");
    return null;
  }
  const normalizeSize = (s: string) => {
    const raw = (s || "").toLowerCase();
    if (raw.includes("1024x1024") || raw === "512x512" || raw === "768x768") return "1024x1024";
    if (raw.includes("768x1024")) return "768x1024";
    return "1024x768";
  };
  const safeSize = normalizeSize(size);
  const modelsToTry = ["agnes-image-2.1-flash", "agnes-image-2.0-flash"];
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    for (const model of modelsToTry) {
      try {
        console.log("[Toonflow] Agnes image attempt " + attempt + "/" + maxAttempts + " model=" + model + " size=" + safeSize);
        const body: any = {
          model,
          prompt,
          size: safeSize,
          extra_body: { response_format: "url" }
        };
        const fetchPromise = fetch("https://apihub.agnes-ai.com/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + sanitizedAgnesKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const response = await withTimeout(
          fetchPromise,
          120000,
          new Error("Agnes API request timed out (120s)")
        );
        if (response.ok) {
          const data: any = await response.json();
          const url = data?.data?.[0]?.url;
          if (url && typeof url === "string" && url.startsWith("http")) {
            console.log("[Toonflow] Agnes image success model=" + model);
            return { url, model };
          }
          const b64 = data?.data?.[0]?.b64_json;
          if (b64 && typeof b64 === "string") {
            try {
              const buf = Buffer.from(b64, "base64");
              const filename = "agnes-img-" + Date.now() + "-" + Math.floor(Math.random() * 10000) + ".png";
              const localPath = path.join(process.cwd(), "assets", filename);
              fs.writeFileSync(localPath, buf);
              return { url: "/assets/" + filename, model };
            } catch (saveErr: any) {
              lastError = new Error("Agnes b64 save failed: " + (saveErr?.message || saveErr));
            }
          } else {
            lastError = new Error("Agnes 200 but no URL/b64");
          }
        } else {
          const bodyText = await response.text().catch(() => "");
          lastError = new Error("Agnes HTTP " + response.status + (bodyText ? ": " + bodyText.substring(0, 300) : ""));
          console.warn("[Toonflow] Agnes image error: " + lastError.message);
          if (response.status === 503 || response.status === 429 || response.status >= 500 || response.status === 400) {
            continue;
          }
        }
      } catch (e: any) {
        lastError = e;
        console.warn("[Toonflow] Agnes image attempt failed:", e?.message || e);
      }
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 2500 * attempt));
    }
  }
  if (lastError) {
    console.error("[Toonflow] All Agnes image attempts failed:", lastError?.message || lastError);
    (generateAgnesImageUrl as any)._lastError = lastError?.message || String(lastError);
  }
  return null;
}

`;
    server = server.slice(0, start) + newFn + server.slice(next);
    changed = true;
    console.log("✅ replaced generateAgnesImageUrl with extra_body + _lastError");
  } else {
    console.log("[fix] generateAgnesImageUrl already has extra_body/_lastError");
  }
}

if (changed) {
  fs.writeFileSync(serverPath, server, "utf8");
  console.log("✅ server.ts written");
} else {
  console.log("[fix] no changes");
}
console.log("fix_prompt_sanitize_agnes done.");
