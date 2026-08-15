/**
 * make_1min_continuous_story.mjs
 *
 * Produces a 64-second, single-character short film through the local
 * Agnes-video-x-1-8-2026 server. Every shot begins from the previous shot's
 * tail frame and passes the previous story state to prevent trailer-like resets.
 *
 * Usage: npm run dev  (in a separate terminal), then
 *        node scripts/make_1min_continuous_story.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BASE = process.env.TOONFLOW_URL || "http://127.0.0.1:3000";
const OUT_DIR = path.join(ROOT, "assets", "one_min_continuous_story");

const CHARACTER = {
  name: "何寧",
  gender: "female",
  age: "29",
  clothing: "soft charcoal cardigan over a cream blouse, dark blue straight-leg trousers, simple silver watch",
  description:
    "adult Chinese woman, oval face, warm natural skin tone, dark brown eyes, shoulder-length softly wavy black hair with a center part, quiet thoughtful expression, slim natural build",
};

/**
 * Story: "The Letter by the Window".
 * It plays out in one apartment over a single rainy morning: Ning pauses at a
 * letter, remembers the person who gave it to her, chooses to write a reply,
 * and ends with a small, calm decision. Each shot has one action and one
 * reaction; there are no costume, location, or time resets.
 */
const SHOTS = [
  {
    title: "雨晨的信",
    visualPrompt:
      "A quiet rain-streaked apartment study in early morning. He Ning sits at a small wooden desk beside the window, an unopened cream envelope rests beside a ceramic mug. Pale grey daylight, a leafy plant, a few books, warm intimate photorealistic cinematic drama.",
    actionPrompt:
      "Start seated at the desk. He Ning slowly notices the envelope, lets her fingers rest beside it, then breathes out with a restrained, private hesitation. One very slow gentle dolly-in only.",
    directorNotes:
      "Medium-wide eye-level framing. Keep the desk, left-side window, light direction, hairstyle, cardigan, and calm rainy-morning mood stable through the ending.",
  },
  {
    title: "拆開信封",
    visualPrompt:
      "Continue in the exact same apartment study, at the same desk and in the same early-morning rainlight. The cream envelope is still under He Ning's right hand.",
    actionPrompt:
      "Begin from the previous ending pose. He Ning gently lifts the envelope, studies it for a beat, then carefully opens the flap with both hands. Her expression softens slightly. Static camera with only a subtle natural hand-held breath.",
    directorNotes:
      "Do not change location, time, wardrobe, desk layout, or screen direction. Keep her seated and facing slightly toward the rain-streaked window on the left.",
  },
  {
    title: "讀到那句話",
    visualPrompt:
      "Continue at the same desk. He Ning holds the opened letter close to the tabletop; rain softly moves on the window behind her. No readable writing is visible on paper.",
    actionPrompt:
      "Begin while she is holding the opened letter. Her eyes travel down the page, she pauses, then the corner of her mouth forms the smallest remembered smile before she lowers her gaze. Slow, motivated push-in only.",
    directorNotes:
      "Keep the paper blank from the viewer's perspective: no subtitles, no text, no visible letters. The emotion is recognition, not melodrama.",
  },
  {
    title: "拿起舊照片",
    visualPrompt:
      "Continue in the same room and light. The opened letter now rests on the desk; a small blank-backed instant photograph lies half-hidden beside the notebook. The photograph contains no visible face or readable text to camera.",
    actionPrompt:
      "Begin with her gaze lowered after reading. He Ning reaches beside the notebook, lifts the small photograph, turns it toward herself, and her expression becomes quietly tender. A gentle lateral move of only a few inches.",
    directorNotes:
      "Preserve her exact face, hair, clothing, chair position, desk objects, window side, and soft rain ambience. Do not insert a flashback or cutaway.",
  },
  {
    title: "放下猶豫",
    visualPrompt:
      "Continue at the same desk. He Ning holds the photograph near her chest; the opened letter remains on the tabletop, with the notebook and pen in their original positions.",
    actionPrompt:
      "Begin from the previous held-photograph pose. He Ning looks once toward the rainy window, makes a small decision in her eyes, then places the photograph carefully beside the letter and reaches for the pen. Slow camera remains almost still.",
    directorNotes:
      "The change is internal and calm. Maintain the exact window rain, lighting direction, and spatial relationship of every prop.",
  },
  {
    title: "寫下回覆",
    visualPrompt:
      "Continue in the same study. He Ning has the pen in hand, the letter and photograph sit beside an open notebook. The notebook pages remain blank to the viewer with no readable characters.",
    actionPrompt:
      "Begin as her fingers close around the pen. He Ning writes a short unseen reply, pauses once as if choosing a final word, then her shoulders relax. One restrained over-the-shoulder camera drift without changing sides.",
    directorNotes:
      "Avoid any readable writing, text overlays, montage, or time lapse. The shot is a real-time continuation of one simple action.",
  },
  {
    title: "折好回信",
    visualPrompt:
      "Continue at the same desk in the same rainlight. The notebook is open, the envelope and old photograph are still in their established places.",
    actionPrompt:
      "Begin immediately after writing. He Ning sets down the pen, folds the blank note with deliberate care, slides it into the same cream envelope, and seals it with one gentle press of her palm. Slow close camera move only.",
    directorNotes:
      "Maintain all props, hand positions, clothing, face, light, and room geography. Let the action happen in unbroken real time.",
  },
  {
    title: "天亮以前",
    visualPrompt:
      "Continue in the exact same apartment study. The sealed cream envelope is now in He Ning's hand; the rain-streaked window and desk remain unchanged as a faint warmer morning tone reaches the room.",
    actionPrompt:
      "Begin with the sealed envelope in her hand. He Ning rises naturally from the chair, walks only two small steps to the window, places the envelope on the sill, then looks out and allows herself one peaceful, hopeful smile. Slow follow movement, then hold.",
    directorNotes:
      "No location shift or sudden weather change. End on her stable profile at the window, with the same hair, cardigan, natural face, and quiet morning atmosphere.",
  },
].map((shot) => ({ ...shot, character: CHARACTER.name, durationSeconds: 8, dialogue: "", narration: "" }));

function characterDescription() {
  return `SAME PERSON every shot "${CHARACTER.name}", ${CHARACTER.gender}, age ${CHARACTER.age}: ${CHARACTER.description}. ALWAYS wear the exact outfit: ${CHARACTER.clothing}. Identical face, hair, body, clothing, and age in every shot; no face swap, no gender change, no outfit change.`;
}

async function api(pathname, opts = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE}${pathname}`, { ...opts, signal: controller.signal });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!response.ok) throw new Error(`${pathname} ${response.status}: ${text.slice(0, 300)}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForVideo(maxMs = 12 * 60 * 1000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxMs) {
    const status = await api("/api/status", {}, 20000);
    process.stdout.write(`\r  status=${status.status} progress=${status.progress || "?"}   `);
    if (status.status === "completed" && (status.outputPath || status.localPath)) {
      console.log("");
      return status.outputPath || status.localPath;
    }
    if (status.status === "failed") {
      console.log("");
      throw new Error(status.error || "video generation failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  throw new Error("video generation timed out");
}

async function rehostIfNeeded(imageUrl) {
  if (!imageUrl.includes("agnes-ai.space") && !imageUrl.includes("platform-outputs")) return imageUrl;
  try {
    const result = await api(
      "/api/rehost-image",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      },
      120000,
    );
    return result.imageUrl || imageUrl;
  } catch (error) {
    console.warn("Could not rehost identity image; using original URL:", error.message);
    return imageUrl;
  }
}

async function generateIdentityAnchor() {
  const first = SHOTS[0];
  const result = await api(
    "/api/generate-image",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: `[CHARACTER IDENTITY LOCK]: ${characterDescription()} ${first.visualPrompt} She is seated at the desk, looking toward the unopened envelope. This is a single integrated cinematic still, no text.`,
        negativePrompt: "different face, face swap, gender swap, outfit change, inconsistent character, duplicate person, text, subtitles, watermark, unreadable handwriting, blurry",
        artStyle: "photorealistic cinematic drama, natural real human actor, soft rainy morning light",
        character: CHARACTER.name,
        characterDescription: characterDescription(),
        characterOutfit: CHARACTER.clothing,
        engine: "agnes",
        agnesImageMode: "quality",
      }),
    },
    180000,
  );
  if (!result.imageUrl) throw new Error("Identity anchor generation did not return imageUrl");
  return rehostIfNeeded(result.imageUrl);
}

function previousScenePayload(shot) {
  if (!shot) return undefined;
  return {
    title: shot.title,
    visualPrompt: shot.visualPrompt,
    actionPrompt: shot.actionPrompt,
    dialogue: shot.dialogue,
    narration: shot.narration,
    directorNotes: shot.directorNotes,
  };
}

async function generateVideo(shot, startFrameUrl, previousShot) {
  const body = {
    prompt: `[CHARACTER IDENTITY LOCK]: ${characterDescription()} [CONTINUOUS STORY MODE] This is one uninterrupted beat in an ongoing scene, not a montage or trailer. ${shot.actionPrompt}`,
    visualPrompt: shot.visualPrompt,
    actionPrompt: shot.actionPrompt,
    dialogue: shot.dialogue,
    narration: shot.narration,
    directorNotes: shot.directorNotes,
    character: shot.character,
    characterDescription: characterDescription(),
    characterImages: [startFrameUrl],
    artStyle: "photorealistic cinematic drama, natural real human actor, soft rainy morning light, 35mm lens, restrained camera movement",
    imageUrl: startFrameUrl,
    // Agnes accepts some externally hosted single frames only through extra_body.image.
    imageInputPlacement: "extra_body",
    durationSeconds: shot.durationSeconds,
    agnesVideoMode: "quality",
    sceneType: "chain",
    continuityMode: "continuous-story",
    requireCharacterConsistency: true,
    prevScene: previousScenePayload(previousShot),
  };

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await api("/api/reset-task", { method: "POST" }, 15000);
    } catch {
      // The reset endpoint is best-effort; the actual generation request remains authoritative.
    }
    if (attempt > 1) {
      const waitSeconds = 70;
      console.log(`Rate-limit backoff: waiting ${waitSeconds}s before retry ${attempt}/5…`);
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    }
    try {
      await api(
        "/api/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        60000,
      );
      return await waitForVideo();
    } catch (error) {
      const message = String(error.message || error);
      if (/429|rate limit/i.test(message) && attempt < 5) {
        console.warn("Video request rate-limited; retrying:", message.slice(0, 140));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Video generation failed after retry budget");
}

async function extractTailFrame(videoUrl, fallbackUrl) {
  try {
    const result = await api(
      "/api/extract-last-frame",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl }),
      },
      120000,
    );
    return result.imageUrl || fallbackUrl;
  } catch (error) {
    console.warn("Tail-frame extraction failed; retaining current start frame:", error.message);
    return fallbackUrl;
  }
}

async function stitch(videoUrls) {
  const response = await fetch(`${BASE}/api/stitch-videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoUrls }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`stitch ${response.status}: ${text.slice(0, 400)}`);

  for (const line of text.split("\n")) {
    try {
      const data = JSON.parse(line);
      if (data.videoUrl) return data.videoUrl;
    } catch {
      // The endpoint can return progress lines alongside its final JSON result.
    }
  }
  try {
    const data = JSON.parse(text);
    return data.videoUrl || data.url || null;
  } catch {
    return null;
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("Server:", BASE);
  await api("/api/health", {}, 15000).catch((error) => {
    throw new Error(`Local server is not ready at ${BASE}: ${error.message}`);
  });

  const providedAnchorUrl = (process.env.STORY_ANCHOR_URL || "").trim();
  if (providedAnchorUrl) {
    console.log("Using provided public identity anchor URL…");
  } else {
    console.log("Generating one identity-locked first frame…");
  }
  let startFrameUrl = providedAnchorUrl || await generateIdentityAnchor();
  const videoUrls = [];

  for (let index = 0; index < SHOTS.length; index += 1) {
    const shot = SHOTS[index];
    const previousShot = index > 0 ? SHOTS[index - 1] : undefined;
    console.log(`\n=== ${index + 1}/${SHOTS.length}: ${shot.title} ===`);
    const videoUrl = await generateVideo(shot, startFrameUrl, previousShot);
    console.log("video:", videoUrl);
    videoUrls.push(videoUrl);

    startFrameUrl = await extractTailFrame(videoUrl, startFrameUrl);
    fs.writeFileSync(
      path.join(OUT_DIR, "progress.json"),
      JSON.stringify({ title: "窗邊的信", clips: videoUrls, lastFrameUrl: startFrameUrl, updatedAt: new Date().toISOString() }, null, 2),
    );
  }

  console.log("\n=== Stitching the 64-second continuous story ===");
  const finalUrl = await stitch(videoUrls);
  const result = {
    title: "窗邊的信",
    finalUrl,
    clips: videoUrls,
    approxSeconds: SHOTS.reduce((total, shot) => total + shot.durationSeconds, 0),
    note: "A single-character, single-location story. Each clip reuses the preceding tail frame and previous-story context.",
  };
  fs.writeFileSync(path.join(OUT_DIR, "result.json"), JSON.stringify(result, null, 2));
  console.log("DONE", result);
}

main().catch((error) => {
  console.error("FAILED", error);
  process.exit(1);
});
