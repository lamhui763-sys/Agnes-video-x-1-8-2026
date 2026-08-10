/**
 * make_1min_bookstore.mjs
 * Uses local Toonflow server (Agnes-video-x-1-8-2026) to produce ~1 min video
 * for 墨香書屋 story with hard character consistency (林深 / 蘇念).
 *
 * Usage: node scripts/make_1min_bookstore.mjs
 * Server must be running: npm run dev
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BASE = process.env.TOONFLOW_URL || "http://127.0.0.1:3000";
const OUT_DIR = path.join(ROOT, "assets", "one_min_bookstore");

const NOVEL = `窗外的雨聲如鼓點般敲擊著「墨香書屋」的櫥窗，霓虹燈的光暈在水霧中暈染開來，將店內映照得曖昧而朦朧。林深站在書架間，指尖輕輕滑過一排陳舊的硬殼書脊，發出沙沙的輕響。

蘇念推門而入，風鈴清脆作響。她收起滴水的長傘，水珠濺落在木地板上，發出細微的啪嗒聲。她抬頭，目光直直撞進林深眼底。

「這麼晚了，還不走？」林深沒有回頭，聲音低沉，帶著一絲不易察覺的顫抖。

蘇念走近，高跟鞋踩在地板上的聲音漸近。「你在躲我？」

林深終於轉身，背脊抵著冰涼的玻璃櫃檯。他看著她濕漉漉的髮梢，喉結滾動了一下。「這裡只有書，沒有你要的答案。」

「我要的不是答案，是你。」蘇念突然伸手，抓住了他懸在半空的手腕。她的指尖微涼，卻像火燒般燙傷了他的皮膚。

林深怔住了。他反手握住她的手，力道大得讓蘇念皺了皺眉。「念兒，你知道我們之間有什麼嗎？隔著三年的沉默，還有你即將飛往倫敦的機票。」

「機票我可以退。」蘇念向前一步，幾乎貼上他的胸膛。「只要你不說『不』。」

林深低頭看著她，眼神深邃如夜。「如果我說了呢？」

蘇念抬起下巴，眼中閃爍著倔強的光芒。「那我就在這裡站到你改變主意為止。外面雨很大，我不怕冷，只怕心涼。」

林深緊閉雙眼，片刻後，他猛地將蘇念擁入懷中。「別走。」他在她耳邊低語。

蘇念環住他的腰，緊緊回抱。「好，我不走。」

窗外的雨勢未減，但店內的溫度卻驟然升高。霓虹燈光透過雨幕，在兩人交疊的身影上投下斑駁的光影。`;

const CHARACTERS = [
  {
    name: "林深",
    gender: "male",
    age: "28",
    clothing: "dark charcoal sweater, black trousers, simple leather watch, bookstore owner look",
    description:
      "handsome Chinese man bookstore owner, deep eyes, restrained melancholic expression, short neat black hair, tall slim build, ink-and-cologne atmosphere",
  },
  {
    name: "蘇念",
    gender: "female",
    age: "26",
    clothing: "beige trench coat, simple dress, black heels, long umbrella when outdoor",
    description:
      "beautiful Chinese woman, long dark wet hair when raining, determined eyes, elegant soft features, emotional but stubborn expression",
  },
];

// ~8s each ≈ 64s for 8 shots
const SHOTS = [
  {
    title: "雨夜書屋櫥窗",
    character: "林深",
    visualPrompt:
      "SAME PERSON 林深: handsome Chinese man bookstore owner, deep eyes, short neat black hair, dark charcoal sweater. Rainy night neon Chinese bookstore window exterior, raindrops on glass, warm amber interior shelves, cinematic anime key visual, single frame",
    actionPrompt: "slow push-in through rain on glass, neon shimmer, atmospheric",
    dialogue: "",
    durationSeconds: 8,
  },
  {
    title: "書架間的林深",
    character: "林深",
    visualPrompt:
      "SAME PERSON 林深: handsome Chinese man, deep eyes, short black hair, dark charcoal sweater. Standing among tall wooden bookshelves, fingertips on hardcover spines, warm lamp light, rainy night bookstore interior, cinematic anime",
    actionPrompt: "hand slowly slides along book spines, subtle camera dolly",
    dialogue: "",
    durationSeconds: 8,
  },
  {
    title: "蘇念推門而入",
    character: "蘇念",
    visualPrompt:
      "SAME PERSON 蘇念: beautiful Chinese woman, long dark wet hair, beige trench coat, black heels. Entering bookstore door at night, closing dripping black umbrella, water on wooden floor, wind chime, warm interior, cinematic anime",
    actionPrompt: "she closes umbrella, steps inside, lifts gaze",
    dialogue: "",
    durationSeconds: 8,
  },
  {
    title: "目光相撞",
    character: "林深",
    visualPrompt:
      "SAME PERSON 林深: handsome Chinese man, deep eyes, charcoal sweater. Over-shoulder toward 蘇念 at door, emotional eye contact rainy bookstore, cinematic anime, two people",
    actionPrompt: "slight head turn, tense stillness",
    dialogue: "這麼晚了，還不走？",
    durationSeconds: 8,
  },
  {
    title: "你在躲我",
    character: "蘇念",
    visualPrompt:
      "SAME PERSON 蘇念: beautiful Chinese woman wet long hair trench coat. Walking closer on wooden floor heels, determined expression toward 林深, rainy neon bookstore, cinematic anime",
    actionPrompt: "walks forward, heels click, camera tracks",
    dialogue: "你在躲我？",
    durationSeconds: 8,
  },
  {
    title: "抓手腕",
    character: "蘇念",
    visualPrompt:
      "SAME PERSON 蘇念 and SAME PERSON 林深: she grabs his wrist near glass counter, wet hair, trench coat, he wears charcoal sweater, intimate tension, rainy bookstore neon, cinematic anime close two-shot",
    actionPrompt: "hand grips wrist, slight lean closer",
    dialogue: "我要的不是答案，是你。",
    durationSeconds: 8,
  },
  {
    title: "三年與機票",
    character: "林深",
    visualPrompt:
      "SAME PERSON 林深: handsome Chinese man charcoal sweater, holding 蘇念 hand, deep emotional eyes, close-up faces rainy bookstore, cinematic anime",
    actionPrompt: "subtle facial tension, shallow camera push",
    dialogue: "念兒，你知道我們之間有什麼嗎？隔著三年的沉默，還有你即將飛往倫敦的機票。",
    durationSeconds: 8,
  },
  {
    title: "擁抱別走",
    character: "林深",
    visualPrompt:
      "SAME PERSON 林深 and SAME PERSON 蘇念: tight emotional embrace in rainy neon bookstore, her trench coat, his charcoal sweater, same faces as before, mottled neon through rain, cinematic anime",
    actionPrompt: "pull into embrace, hold tighter, soft orbit",
    dialogue: "別走。",
    durationSeconds: 8,
  },
];

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
    if (!res.ok) throw new Error(`${pathname} ${res.status}: ${text.slice(0, 200)}`);
    return data;
  } finally {
    clearTimeout(t);
  }
}

async function waitVideo(maxMs = 12 * 60 * 1000) {
  const start = Date.now();
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
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("video timeout");
}

function charDesc(name) {
  const c = CHARACTERS.find((x) => x.name === name);
  if (!c) return name;
  return `SAME PERSON every shot "${c.name}", ${c.gender}, age ${c.age}: ${c.description}. ALWAYS wear exact outfit: ${c.clothing}. identical face hair clothing; no face swap no gender change`;
}

async function genImage(shot) {
  const c = CHARACTERS.find((x) => x.name === shot.character);
  const body = {
    prompt: `[CHARACTER IDENTITY LOCK]: ${charDesc(shot.character)}. ${shot.visualPrompt}`,
    negativePrompt:
      "different face, face swap, gender swap, outfit change, inconsistent character, text, watermark, subtitles, blurry",
    artStyle: "cinematic anime key visual, emotional romance drama",
    character: shot.character,
    characterDescription: charDesc(shot.character),
    characterOutfit: c?.clothing || "",
    engine: "agnes",
    agnesImageMode: "quality",
  };
  const data = await api("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, 180000);
  if (!data.imageUrl) throw new Error("no imageUrl");
  let url = data.imageUrl;
  // Re-host Agnes platform-outputs → Catbox so video API can download
  if (url.includes("agnes-ai.space") || url.includes("platform-outputs")) {
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
        console.log("rehosted:", rh.imageUrl.slice(0, 80));
        url = rh.imageUrl;
      }
    } catch (e) {
      console.warn("rehost failed, using original:", e.message);
    }
  }
  return url;
}

async function genVideo(shot, imageUrl) {
  try {
    await api("/api/reset-task", { method: "POST" }, 15000);
  } catch {}
  const body = {
    prompt: `[CHARACTER IDENTITY LOCK]: ${charDesc(shot.character)}. ${shot.actionPrompt}. Keep exact same face and outfit as start frame.`,
    visualPrompt: shot.visualPrompt,
    actionPrompt: shot.actionPrompt,
    dialogue: shot.dialogue || "",
    character: shot.character,
    characterDescription: charDesc(shot.character),
    artStyle: "cinematic anime key visual, emotional romance drama",
    imageUrl,
    durationSeconds: shot.durationSeconds || 8,
    agnesVideoMode: "quality",
    sceneType: "chain",
  };
  await api(
    "/api/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    60000
  );
  return waitVideo();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log("BASE", BASE);
  console.log("Health…");
  try {
    const h = await api("/api/health", {}, 10000);
    console.log("health", h);
  } catch (e) {
    // some builds may not have /api/health — try root
    console.warn("health check failed, continue…", e.message);
  }

  const videoUrls = [];
  let lastFrame = null;

  for (let i = 0; i < SHOTS.length; i++) {
    const shot = SHOTS[i];
    console.log(`\n=== Shot ${i + 1}/${SHOTS.length}: ${shot.title} (${shot.character}) ===`);

    let imageUrl = lastFrame;
    // Hard cut or no frame: draw locked character still
    const needDraw =
      !imageUrl ||
      imageUrl.includes("railway.app") ||
      imageUrl.includes("/assets/") ||
      i === 0 ||
      SHOTS[i - 1].character !== shot.character;

    if (needDraw) {
      console.log("Generating identity-locked start frame…");
      imageUrl = await genImage(shot);
      console.log("image:", imageUrl.slice(0, 80));
    } else {
      console.log("Reusing previous public tail frame for continuity…");
    }

    console.log("Generating video…");
    const videoUrl = await genVideo(shot, imageUrl);
    console.log("video:", videoUrl);
    videoUrls.push(videoUrl);

    // extract last frame for next shot if same character chain
    try {
      const fr = await api(
        "/api/extract-last-frame",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrl }),
        },
        120000
      );
      if (fr.imageUrl) {
        lastFrame = fr.imageUrl;
        console.log("tail frame:", lastFrame.slice(0, 80), "public=", fr.isPublicCdn);
      }
    } catch (e) {
      console.warn("extract frame failed:", e.message);
      lastFrame = imageUrl;
    }

    fs.writeFileSync(
      path.join(OUT_DIR, "progress.json"),
      JSON.stringify({ shots: videoUrls, updatedAt: new Date().toISOString() }, null, 2)
    );
  }

  console.log("\n=== Stitching ===");
  // stitch API streams NDJSON
  const stitchRes = await fetch(`${BASE}/api/stitch-videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoUrls }),
  });
  const stitchText = await stitchRes.text();
  console.log(stitchText.slice(0, 500));
  let finalUrl = null;
  for (const line of stitchText.split("\n")) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      if (j.type === "result" && j.videoUrl) finalUrl = j.videoUrl;
      if (j.videoUrl && !finalUrl) finalUrl = j.videoUrl;
    } catch {}
  }
  // try plain json
  if (!finalUrl) {
    try {
      const j = JSON.parse(stitchText);
      finalUrl = j.videoUrl || j.url;
    } catch {}
  }

  const summary = {
    finalUrl,
    clips: videoUrls,
    approxSeconds: SHOTS.reduce((a, s) => a + (s.durationSeconds || 8), 0),
    note: "Character identity locked via SAME PERSON prompts for 林深 / 蘇念",
  };
  fs.writeFileSync(path.join(OUT_DIR, "result.json"), JSON.stringify(summary, null, 2));
  console.log("\nDONE", summary);
}

main().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
