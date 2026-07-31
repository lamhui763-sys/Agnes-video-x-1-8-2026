/**
 * fix_agnes_image_api.cjs
 * - Force official Agnes image request shape (extra_body.response_format)
 * - Use supported sizes (1024x768 / 1024x1024)
 * - Prefer agnes-image-2.1-flash then 2.0
 * - Surface real Agnes HTTP error body to client
 *
 * IMPORTANT: Never brace-scan from the first "{" after the function name —
 * that hits Promise<{ ... }> in the return type and corrupts server.ts.
 * Boundary = start of this fn → start of the next top-level function.
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

// ---------- 1) Replace entire generateAgnesImageUrl via next-function boundary ----------
const FN_START = "async function generateAgnesImageUrl(";
// Stable next symbol in server.ts (must exist after generateAgnesImageUrl)
const FN_NEXT = "async function generateContentWithFallback(";

const start = server.indexOf(FN_START);
const next = server.indexOf(FN_NEXT);

if (start !== -1 && next !== -1 && next > start) {
  // Idempotency: already patched if marker present
  const existingSlice = server.slice(start, next);
  if (existingSlice.includes("extra_body") && existingSlice.includes('response_format: "url"') && existingSlice.includes("agnes-image-2.1-flash")) {
    console.log("[fix] generateAgnesImageUrl already patched — skip replace");
  } else {
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

  // Official supported sizes only (docs: 1024x1024, 1024x768, 768x1024)
  const normalizeSize = (s: string) => {
    const raw = (s || "").toLowerCase();
    if (raw === "1k" || raw === "2k" || raw === "3k" || raw === "4k") return raw.toUpperCase();
    if (raw.includes("1024x1024") || raw === "512x512" || raw === "768x768") return "1024x1024";
    if (raw.includes("768x1024") || raw.includes("576x1024")) return "768x1024";
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
          extra_body: {
            response_format: "url"
          }
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
              const localUrl = "/assets/" + filename;
              console.log("[Toonflow] Agnes returned b64_json, saved locally: " + localUrl);
              return { url: localUrl, model };
            } catch (saveErr: any) {
              lastError = new Error("Agnes b64 save failed: " + (saveErr?.message || saveErr));
            }
          } else {
            lastError = new Error("Agnes returned 200 but no image URL/b64: " + JSON.stringify(data).substring(0, 200));
          }
        } else {
          const bodyText = await response.text().catch(() => "");
          lastError = new Error(
            "Agnes HTTP " + response.status + (bodyText ? ": " + bodyText.substring(0, 300) : "")
          );
          console.warn("[Toonflow] Agnes image error: " + lastError.message);
          if (response.status === 503 || response.status === 429 || response.status >= 500) {
            continue;
          }
          if (response.status === 400) {
            continue;
          }
        }
      } catch (e: any) {
        lastError = e;
        console.warn("[Toonflow] Agnes image attempt failed:", e?.message || e);
      }
    }
    if (attempt < maxAttempts) {
      const waitMs = 2500 * attempt;
      console.log("[Toonflow] Waiting " + waitMs + "ms before Agnes retry...");
      await new Promise((r) => setTimeout(r, waitMs));
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
    console.log("✅ replaced generateAgnesImageUrl (next-fn boundary, len=" + (next - start) + ")");
  }
} else {
  console.log("[fix] generateAgnesImageUrl boundary not found", { start, next });
}

// ---------- 2) Fix size selection in /api/generate-image ----------
if (server.includes('let size = isAvatar ? "1024x1024" : "1024x576"')) {
  server = server.replace(
    /let size = isAvatar \? "1024x1024" : "1024x576";\s*if \(agnesImageMode === "fast"\) \{\s*size = isAvatar \? "512x512" : "768x432";\s*\} else if \(agnesImageMode === "balanced"\) \{\s*size = isAvatar \? "768x768" : "1024x576";\s*\}/,
    `let size = isAvatar ? "1024x1024" : "1024x768";
      if (agnesImageMode === "fast") {
        size = isAvatar ? "1024x1024" : "1024x768";
      } else if (agnesImageMode === "balanced") {
        size = isAvatar ? "1024x1024" : "1024x768";
      }`
  );
  changed = true;
  console.log("✅ fixed size selection to supported 1024x768 / 1024x1024");
} else if (server.includes(': "1024x768"') && !server.includes('"1024x576"')) {
  console.log("[fix] size selection already OK");
} else {
  const before = server;
  server = server.replace(/"1024x576"/g, '"1024x768"');
  server = server.replace(/"768x432"/g, '"1024x768"');
  // Only rewrite standalone size literals used for Agnes image mode, not unrelated strings
  if (server !== before) {
    changed = true;
    console.log("✅ bulk-replaced invalid landscape size strings");
  }
}

// ---------- 3) Surface last Agnes error in 500 response ----------
if (
  server.includes('"所有繪圖引擎均失敗，已禁用保底圖片。請稍後重試或手動上傳。"') &&
  !server.includes("(generateAgnesImageUrl as any)._lastError")
) {
  server = server.replace(
    '"所有繪圖引擎均失敗，已禁用保底圖片。請稍後重試或手動上傳。"',
    '"所有繪圖引擎均失敗，已禁用保底圖片。" + (((generateAgnesImageUrl as any)._lastError) ? (" 詳情: " + (generateAgnesImageUrl as any)._lastError) : " 請稍後重試或手動上傳。")'
  );
  changed = true;
  console.log("✅ surface Agnes last error in 500 body");
}

if (changed) {
  fs.writeFileSync(serverPath, server, "utf8");
  console.log("✅ server.ts written");
} else {
  console.log("[fix] no changes");
}

console.log("fix_agnes_image_api done.");
