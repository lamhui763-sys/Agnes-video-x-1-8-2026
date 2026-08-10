/**
 * 2–3 shot demo (~24s) — prove character consistency for 林深 / 蘇念
 * Respects Agnes video rate limit: max 2 / minute → wait 65s between clips.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BASE = process.env.TOONFLOW_URL || "http://127.0.0.1:3000";
const OUT_DIR = path.join(ROOT, "assets", "demo_3shots");
const GAP_MS = 70000; // between video starts

const CHARACTERS = [
  {
    name: "林深",
    gender: "male",
    age: "28",
    clothing: "dark charcoal sweater, black trousers, simple leather watch",
    description:
      "handsome Chinese man bookstore owner, deep eyes, short neat black hair, tall slim, melancholic calm face",
  },
  {
    name: "蘇念",
    gender: "female",
    age: "26",
    clothing: "beige trench coat, simple dress, black heels",
    description:
      "beautiful Chinese woman, long dark hair, determined soft features, elegant",
  },
];

const SHOTS = [
  {
    title: "書架林深",
    character: "林深",
    visualPrompt:
      "SAME PERSON 林深: handsome Chinese man short black hair deep eyes charcoal sweater. Rainy night bookstore interior wooden shelves, warm lamp, cinematic anime key visual single frame",
    actionPrompt: "subtle camera dolly, hand near books, atmospheric rain light",
    dialogue: "",
    durationSeconds: 8,
  },
  {
    title: "蘇念進門",
    character: "蘇念",
    visualPrompt:
      "SAME PERSON 蘇念: beautiful Chinese woman long dark wet hair beige trench coat. Entering bookstore with black umbrella, water on floor, warm interior rainy night, cinematic anime single frame",
    actionPrompt: "closes umbrella, steps in, looks up",
    dialogue: "你在躲我？",
    durationSeconds: 8,
  },
  {
    title: "對視擁抱",
    character: "林深",
    visualPrompt:
      "SAME PERSON 林深 charcoal sweater and SAME PERSON 蘇念 trench coat long dark hair. Emotional close two-shot embrace in rainy neon bookstore, same faces as identity bible, cinematic anime",
    actionPrompt: "pull into embrace, hold, soft camera push-in",
    dialogue: "別走。",
    durationSeconds: 8,
  },
];

function charDesc(name) {
  const c = CHARACTERS.find((x) => x.name === name);
  if (!c) return name;
  return `SAME PERSON every shot "${c.name}", ${c.gender}, age ${c.age}: ${c.description}. ALWAYS wear: ${c.clothing}. identical face hair clothing; no face swap`;
}

async function api(pathname, opts = {}, timeoutMs = 120000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${pathname}`, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!res.ok) throw new Error(`${pathname} ${res.status}: ${text.slice(0, 240)}`);
    return data;
  } finally {
    clearTimeout(t);
  }
}

async function waitVideo(maxMs = 10 * 60 * 1000) {
  const start = Date.now();
  let sawProgress = false;
  let idleAfterProgress = 0;
  while (Date.now() - start < maxMs) {
    const st = await api("/api/status", {}, 20000);
    process.stdout.write(`\r  status=${st.status} progress=${st.progress || "?"}   `);
    if (st.status === "completed" && (st.outputPath || st.localPath)) {
      console.log("");
      return st.outputPath || st.localPath;
    }
    if (st.status === "failed") {
      console.log("");
      throw new Error(st.error || "video failed");
    }
    if (st.status === "in_progress") {
      sawProgress = true;
      idleAfterProgress = 0;
    }
    if (st.status === "idle" && sawProgress) {
      idleAfterProgress++;
      if (idleAfterProgress > 8) {
        console.log("");
        throw new Error("task became idle after progress (likely rate-limit kill)");
      }
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("video timeout");
}

async function rehost(url) {
  if (!url) return url;
  if (url.includes("catbox") || url.includes("tmpfiles") || url.includes("iili")) return url;
  try {
    const rh = await api(
      "/api/rehost-image",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url }),
      },
      120000
    );
    if (rh.imageUrl) {
      console.log("  rehosted →", rh.imageUrl.slice(0, 90));
      return rh.imageUrl;
    }
  } catch (e) {
    console.warn("  rehost skip:", e.message);
  }
  return url;
}

async function genImage(shot) {
  const c = CHARACTERS.find((x) => x.name === shot.character);
  const data = await api(
    "/api/generate-image",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: `[CHARACTER IDENTITY LOCK]: ${charDesc(shot.character)}. ${shot.visualPrompt}`,
        negativePrompt:
          "different face, face swap, gender swap, outfit change, inconsistent character, text, watermark, subtitles, blurry",
        artStyle: "cinematic anime key visual, emotional romance drama",
        character: shot.character,
        characterDescription: charDesc(shot.character),
        characterOutfit: c?.clothing || "",
        engine: "agnes",
        agnesImageMode: "quality",
      }),
    },
    180000
  );
  if (!data.imageUrl) throw new Error("no imageUrl");
  return rehost(data.imageUrl);
}

/**
 * Mode A: pure text-to-video — NO imageUrl.
 * Avoids Agnes 400 "image URL could not be downloaded".
 * Character consistency relies on IDENTITY LOCK in prompt only.
 */
async function genVideo(shot, _imageUrlIgnored) {
  const body = {
    prompt: `[CHARACTER IDENTITY LOCK — MANDATORY SAME PERSON]: ${charDesc(shot.character)}. Scene: ${shot.visualPrompt}. Motion: ${shot.actionPrompt}. Keep EXACT same face, hair, body, outfit for whole clip. No face morph, no outfit change. Cinematic anime romance drama.`,
    visualPrompt: `${charDesc(shot.character)}. ${shot.visualPrompt}`,
    actionPrompt: shot.actionPrompt,
    dialogue: shot.dialogue || "",
    character: shot.character,
    characterDescription: charDesc(shot.character),
    artStyle: "cinematic anime key visual, emotional romance drama",
    // CRITICAL: do NOT send imageUrl — txt2vid only (Mode A)
    // imageUrl: undefined,
    durationSeconds: shot.durationSeconds || 8,
    agnesVideoMode: "quality",
    sceneType: "chain",
  };

  for (let attempt = 1; attempt <= 6; attempt++) {
    if (attempt > 1) {
      console.log(`  backoff: wait ${GAP_MS / 1000}s (attempt ${attempt}/6)…`);
      await new Promise((r) => setTimeout(r, GAP_MS));
    }
    try {
      try {
        await api("/api/reset-task", { method: "POST" }, 10000);
      } catch {}
      await new Promise((r) => setTimeout(r, 3000));
      console.log("  start video (txt2vid, no image param)…");
      await api(
        "/api/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        60000
      );
      return await waitVideo();
    } catch (e) {
      const msg = String(e.message || e);
      console.warn("  video err:", msg.slice(0, 180));
      if (/429|rate limit|idle after progress|400/i.test(msg) && attempt < 6) continue;
      throw e;
    }
  }
  throw new Error("video failed after retries");
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("=== 3-shot character-consistency demo (Mode A: txt2vid, no start-frame image) ===");
  console.log("BASE", BASE);
  const h = await api("/api/health", {}, 10000);
  console.log("health", h.status || h);

  // Cool down rate limit from previous runs
  console.log("Cool-down 90s for Agnes video quota…");
  await new Promise((r) => setTimeout(r, 90000));

  const clips = [];
  const frames = [];

  for (let i = 0; i < SHOTS.length; i++) {
    const shot = SHOTS[i];
    console.log(`\n=== Shot ${i + 1}/3: ${shot.title} (${shot.character}) ===`);
    // Optional still for reference/log only — NOT passed to video API (Mode A)
    try {
      console.log("  drawing identity-locked still (for reference only, not sent to video)…");
      const imageUrl = await genImage(shot);
      frames.push(imageUrl);
      console.log("  image OK (reference):", imageUrl.slice(0, 90));
    } catch (e) {
      console.warn("  still skipped:", e.message);
      frames.push(null);
    }

    if (i > 0) {
      console.log(`  gap ${GAP_MS / 1000}s before next video (rate limit 2/min)…`);
      await new Promise((r) => setTimeout(r, GAP_MS));
    }

    console.log("  generating video (txt2vid, no image URL)…");
    const videoUrl = await genVideo(shot, null);
    clips.push(videoUrl);
    console.log("  video OK:", videoUrl);

    fs.writeFileSync(
      path.join(OUT_DIR, "progress.json"),
      JSON.stringify({ frames, clips, at: new Date().toISOString() }, null, 2)
    );
  }

  console.log("\n=== Stitch 3 clips ===");
  let finalUrl = null;
  try {
    const stitchRes = await fetch(`${BASE}/api/stitch-videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrls: clips }),
    });
    const stitchText = await stitchRes.text();
    for (const line of stitchText.split("\n")) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        if (j.videoUrl) finalUrl = j.videoUrl;
        if (j.type === "result" && j.videoUrl) finalUrl = j.videoUrl;
      } catch {}
    }
    if (!finalUrl) {
      try {
        finalUrl = JSON.parse(stitchText).videoUrl;
      } catch {}
    }
    console.log(stitchText.slice(0, 400));
  } catch (e) {
    console.warn("stitch failed:", e.message);
  }

  const result = {
    finalUrl,
    clips,
    frames,
    approxSeconds: SHOTS.length * 8,
    characters: CHARACTERS.map((c) => c.name),
    note: "3-shot demo with hard CHARACTER IDENTITY LOCK for 林深 / 蘇念",
  };
  fs.writeFileSync(path.join(OUT_DIR, "result.json"), JSON.stringify(result, null, 2));
  console.log("\nDONE", result);
}

main().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
