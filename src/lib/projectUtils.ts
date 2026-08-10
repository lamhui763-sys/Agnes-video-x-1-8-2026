import { Project, Character } from "../types";
import { isNoChar } from "./promptBuilder";

export { isNoChar };

export function resolveSceneCharacters(sceneChar: string = "", sceneVisualPrompt: string = "", projectChars: Character[] = []): {
  matchingChar: Character | undefined;
  matchedChars: Character[];
  charDesc: string;
  charOutfit: string;
  characterImages: string[];
} {
  if (!projectChars || projectChars.length === 0) {
    return { matchingChar: undefined, matchedChars: [], charDesc: "", charOutfit: "", characterImages: [] };
  }

  const cleanChar = (sceneChar || "").trim().toLowerCase();
  const cleanPrompt = (sceneVisualPrompt || "").trim().toLowerCase();
  const combined = `${cleanChar} ${cleanPrompt}`;

  if (isNoChar(cleanChar)) {
    return { matchingChar: undefined, matchedChars: [], charDesc: "", charOutfit: "", characterImages: [] };
  }

  // Find matching characters
  const matched = projectChars.filter(c => {
    const name = (c.name || "").trim().toLowerCase();
    const role = (c.role || "").trim().toLowerCase();
    
    if (name && (cleanChar === name || cleanChar.includes(name) || name.includes(cleanChar) || cleanPrompt.includes(name))) return true;
    if (role && (cleanChar.includes(role) || cleanPrompt.includes(role))) return true;

    // Female / Male heuristic
    const isFemale = (role.includes("女") || name.includes("女") || (c as any).gender?.includes("女"));
    const isMale = (role.includes("男") || name.includes("男") || (c as any).gender?.includes("男"));

    const hasFemaleInText = combined.includes("女") || combined.includes("少女") || combined.includes("girl") || combined.includes("female") || combined.includes("woman");
    const hasMaleInText = combined.includes("男") || combined.includes("少年") || combined.includes("boy") || combined.includes("male") || combined.includes("man");

    if (isFemale && hasFemaleInText) return true;
    if (isMale && hasMaleInText) return true;

    return false;
  });

  // Fallback: If no match was found, use all project characters if scene text contains multiple people or default to primary character
  const finalMatched = matched.length > 0 
    ? matched 
    : (combined.includes("&") || combined.includes("與") || combined.includes("和") || combined.includes("對視") || combined.includes("兩人") || combined.includes("雙人")
        ? projectChars
        : [projectChars[0]]);

  const primaryChar = finalMatched[0];

  const descParts: string[] = [];
  const outfitParts: string[] = [];
  const images: string[] = [];

  finalMatched.forEach(c => {
    const outfit = c.clothing ? c.clothing.trim() : "";
    const desc = c.description ? c.description.trim() : "";
    const name = c.name || "Character";
    const gender =
      (c as any).gender === "male" || (c as any).gender === "男"
        ? "male man, masculine face"
        : (c as any).gender === "female" || (c as any).gender === "女"
          ? "female woman, feminine face"
          : "";
    const age = c.age ? `age about ${c.age}` : "";

    // Identity lock block — repeated in every image/video prompt
    let singleDesc = `SAME PERSON every shot "${name}"`;
    if (gender) singleDesc += `, ${gender}`;
    if (age) singleDesc += `, ${age}`;
    singleDesc += `: ${desc || "Anime character"}`;
    if (outfit) {
      singleDesc += `. ALWAYS wear exact outfit: ${outfit}`;
      outfitParts.push(`${name}: ${outfit}`);
    }
    singleDesc += `. identical face shape, eyes, hairstyle, hair color, skin tone; do NOT change gender, face, or clothing`;
    descParts.push(singleDesc);

    // Collect avatar images
    if (c.uploadedAvatarUrls && c.uploadedAvatarUrls.length > 0) {
      images.push(...c.uploadedAvatarUrls);
    } else if (c.uploadedAvatarUrl) {
      images.push(c.uploadedAvatarUrl);
    } else if (c.avatarUrls && c.avatarUrls.length > 0) {
      images.push(...c.avatarUrls);
    } else if (c.avatarUrl) {
      images.push(c.avatarUrl);
    }
  });

  let formattedOutfit = outfitParts.join(" | ");
  if (formattedOutfit && (formattedOutfit.includes("校服") || formattedOutfit.includes("水手服") || formattedOutfit.includes("制服") || formattedOutfit.includes("uniform"))) {
    formattedOutfit += " [Note: Characters attending the same school MUST wear matching school uniform styles matching their respective character settings.]";
  }

  return {
    matchingChar: primaryChar,
    matchedChars: finalMatched,
    charDesc: descParts.join(" | "),
    charOutfit: formattedOutfit,
    characterImages: Array.from(new Set(images.filter(Boolean)))
  };
}

export function getProjectSignature(project: Project | null): string {
  if (!project) return "";
  const cleanScenes = (project.scenes || []).map(s => ({
    id: s.id,
    title: s.title || "",
    dialogue: s.dialogue || "",
    narration: s.narration || "",
    character: s.character || "",
    visualPrompt: s.visualPrompt || "",
    negativePrompt: s.negativePrompt || "",
    actionPrompt: s.actionPrompt || "",
    transitionPrompt: s.transitionPrompt || "",
    durationSeconds: s.durationSeconds,
    imageUrl: s.imageUrl || "",
    videoUrl: s.videoUrl || "",
    audioCue: s.audioCue || "",
    directorNotes: s.directorNotes || "",
  }));
  const cleanCharacters = (project.characters || []).map(c => ({
    id: c.id,
    name: c.name || "",
    description: c.description || "",
    role: c.role || "",
    avatarUrl: c.avatarUrl || "",
    artStyle: c.artStyle || "",
  }));
  return JSON.stringify({
    name: project.name || "",
    novelText: project.novelText || "",
    disassemblyEngine: project.disassemblyEngine || "mistral",
    selectedModel: project.selectedModel || "",
    drawingChannel: project.drawingChannel || "flux",
    artStyle: project.artStyle || "",
    cameraMotion: project.cameraMotion || "",
    agnesVideoMode: project.agnesVideoMode || "quality",
    agnesImageMode: project.agnesImageMode || "quality",
    scenes: cleanScenes,
    characters: cleanCharacters,
  });
}

/** Strip data:image base64 blobs — keep only http(s)/asset URLs. Critical for localStorage quota. */
function stripBase64Url(url: any): string {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("data:image") || url.startsWith("data:video")) return "";
  return url;
}

function pruneSceneMedia(s: any): any {
  if (!s) return s;
  const out = { ...s };
  const mediaKeys = [
    "imageUrl", "imageUrlExt", "imageUrlKeyframes",
    "videoUrl", "videoUrlExt", "videoUrlKeyframes",
    "videoUrlLocal", "videoUrlExtLocal", "videoUrlKeyframesLocal",
    "videoTailFrame", "midpointImageUrlKeyframes",
    "startFrameKeyframes", "endFrameKeyframes",
  ];
  for (const k of mediaKeys) {
    if (out[k]) out[k] = stripBase64Url(out[k]);
  }
  // Cap logs — they bloat JSON fast
  if (Array.isArray(out.videoLogs)) out.videoLogs = out.videoLogs.slice(-3);
  if (Array.isArray(out.videoLogsExt)) out.videoLogsExt = out.videoLogsExt.slice(-3);
  if (Array.isArray(out.videoLogsKeyframes)) out.videoLogsKeyframes = out.videoLogsKeyframes.slice(-3);
  return out;
}

/**
 * Aggressive prune before writing to localStorage.
 * - Removes all base64 data URLs (images/videos must live on server/Catbox)
 * - Trims novelText if huge
 * - Keeps only last 3 log lines per scene
 * Call this on QuotaExceededError, or always before localStorage.setItem for safety.
 */
export function pruneProjectsForStorage(projects: Project[]): Project[] {
  return (projects || []).map((p) => {
    const cleaned: any = { ...p };
    if (cleaned.novelText && cleaned.novelText.length > 30000) {
      cleaned.novelText = cleaned.novelText.substring(0, 30000) + "... (truncated for storage)";
    }
    if (Array.isArray(cleaned.characters)) {
      cleaned.characters = cleaned.characters.map((c: any) => {
        const cc = { ...c };
        cc.avatarUrl = stripBase64Url(cc.avatarUrl);
        cc.uploadedAvatarUrl = stripBase64Url(cc.uploadedAvatarUrl);
        if (Array.isArray(cc.avatarUrls)) {
          cc.avatarUrls = cc.avatarUrls.map(stripBase64Url).filter(Boolean);
        }
        if (Array.isArray(cc.uploadedAvatarUrls)) {
          cc.uploadedAvatarUrls = cc.uploadedAvatarUrls.map(stripBase64Url).filter(Boolean);
        }
        return cc;
      });
    }
    if (Array.isArray(cleaned.scenes)) cleaned.scenes = cleaned.scenes.map(pruneSceneMedia);
    if (Array.isArray(cleaned.scenesExt)) cleaned.scenesExt = cleaned.scenesExt.map(pruneSceneMedia);
    if (Array.isArray(cleaned.scenesFirstLast)) cleaned.scenesFirstLast = cleaned.scenesFirstLast.map(pruneSceneMedia);
    return cleaned as Project;
  });
}

/**
 * Safe localStorage write. On QuotaExceededError, prune and retry once.
 * Returns true if saved, false if still failed.
 */
export function safeSaveProjectsToLocalStorage(projects: Project[]): boolean {
  const tryWrite = (list: Project[]) => {
    localStorage.setItem("toonflow_projects", JSON.stringify(list));
    localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
  };
  try {
    tryWrite(projects);
    return true;
  } catch (e: any) {
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
      try {
        const pruned = pruneProjectsForStorage(projects);
        tryWrite(pruned);
        console.warn("[Toonflow] localStorage quota hit — saved pruned projects (base64 stripped).");
        return true;
      } catch (e2) {
        console.error("[Toonflow] localStorage still full after prune:", e2);
        return false;
      }
    }
    console.error("[Toonflow] localStorage save failed:", e);
    return false;
  }
}

export function normalizeProjectsList(parsed: any[]): Project[] {
  return parsed.map(p => ({
    id: p.id || `project_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    name: p.name || "Untitled Project",
    createdAt: p.createdAt || new Date().toLocaleString(),
    novelText: p.novelText || "",
    characters: Array.isArray(p.characters) ? p.characters.map((c: any) => ({
      id: c.id || `char_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: c.name || "Unnamed Character",
      description: c.description || "",
      role: c.role || "",
      avatarUrl: c.avatarUrl || "",
      avatarUrls: Array.isArray(c.avatarUrls) ? c.avatarUrls : (c.avatarUrl ? [c.avatarUrl] : []),
      uploadedAvatarUrl: c.uploadedAvatarUrl || "",
      uploadedAvatarUrls: Array.isArray(c.uploadedAvatarUrls) ? c.uploadedAvatarUrls : (c.uploadedAvatarUrl ? [c.uploadedAvatarUrl] : []),
      isGeneratingAvatar: !!c.isGeneratingAvatar,
      artStyle: c.artStyle || "",
      age: c.age || "",
      clothing: c.clothing || "",
      personality: c.personality || ""
    })) : [],
    scenes: Array.isArray(p.scenes) ? p.scenes.map((s: any) => ({
      ...s,
      id: s.id || `scene_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      title: s.title || "Scene",
      dialogue: s.dialogue || "",
      narration: s.narration || "",
      character: s.character || "Narrator",
      visualPrompt: s.visualPrompt || "",
      negativePrompt: s.negativePrompt || "",
      durationSeconds: typeof s.durationSeconds === 'number' ? s.durationSeconds : s.durationSeconds ? parseInt(s.durationSeconds as any) : undefined,
      imageUrl: s.imageUrl || "",
      videoUrl: s.videoUrl || "",
      isGeneratingImage: !!s.isGeneratingImage,
      isGeneratingVideo: !!s.isGeneratingVideo,
      videoProgress: s.videoProgress || "0%",
      videoLogs: Array.isArray(s.videoLogs) ? s.videoLogs : [],
      videoError: s.videoError || "",
      audioCue: s.audioCue || "",
      directorNotes: s.directorNotes || "",
      transitionPrompt: s.transitionPrompt || ""
    })) : [],
    scenesExt: Array.isArray(p.scenesExt) ? p.scenesExt.map((s: any) => ({
      ...s,
      id: s.id || `scene_ext_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      title: s.title || "Scene",
      dialogue: s.dialogue || "",
      narration: s.narration || "",
      character: s.character || "Narrator",
      visualPrompt: s.visualPrompt || "",
      negativePrompt: s.negativePrompt || "",
      durationSeconds: typeof s.durationSeconds === 'number' ? s.durationSeconds : s.durationSeconds ? parseInt(s.durationSeconds as any) : undefined,
      imageUrl: s.imageUrl || "",
      videoUrl: s.videoUrl || "",
      isGeneratingImage: !!s.isGeneratingImage,
      isGeneratingVideo: !!s.isGeneratingVideo,
      videoProgress: s.videoProgress || "0%",
      videoLogs: Array.isArray(s.videoLogs) ? s.videoLogs : [],
      videoError: s.videoError || "",
      audioCue: s.audioCue || "",
      directorNotes: s.directorNotes || "",
      transitionPrompt: s.transitionPrompt || ""
    })) : [],
    scenesFirstLast: Array.isArray(p.scenesFirstLast) ? p.scenesFirstLast.map((s: any) => ({
      ...s,
      id: s.id || `scene_fl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      title: s.title || "Scene",
      dialogue: s.dialogue || "",
      narration: s.narration || "",
      character: s.character || "Narrator",
      visualPrompt: s.visualPrompt || "",
      negativePrompt: s.negativePrompt || "",
      durationSeconds: typeof s.durationSeconds === 'number' ? s.durationSeconds : s.durationSeconds ? parseInt(s.durationSeconds as any) : undefined,
      imageUrl: s.imageUrl || "",
      videoUrl: s.videoUrl || "",
      isGeneratingImage: !!s.isGeneratingImage,
      isGeneratingVideo: !!s.isGeneratingVideo,
      videoProgress: s.videoProgress || "0%",
      videoLogs: Array.isArray(s.videoLogs) ? s.videoLogs : [],
      videoError: s.videoError || "",
      audioCue: s.audioCue || "",
      directorNotes: s.directorNotes || "",
      transitionPrompt: s.transitionPrompt || ""
    })) : [],
    disassemblyEngine: p.disassemblyEngine || "mistral",
    selectedModel: p.selectedModel || "Mistral Large 3 (高智能旗艦)",
    drawingChannel: p.drawingChannel || "flux",
    artStyle: p.artStyle || "動漫卡通動感 (Anime key visual)",
    cameraMotion: p.cameraMotion || "經典推拉運鏡 (Classic Ken Burns Zoom & Pan)",
    agnesVideoMode: p.agnesVideoMode || "quality",
    agnesImageMode: p.agnesImageMode || "quality"
  }));
}

export function copyTextToClipboard(
  text: string,
  sceneId: string,
  setCopiedSceneId: (id: string | null) => void
): Promise<void> {
  const doCopy = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.position = "fixed";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      let success = false;
      try {
        success = document.execCommand("copy");
      } catch (err) {
        console.error("Fallback copy failed", err);
      }
      document.body.removeChild(textArea);
      if (success) return Promise.resolve();
      return Promise.reject("execCommand failed");
    }
  };

  return doCopy()
    .then(() => {
      setCopiedSceneId(sceneId);
      setTimeout(() => setCopiedSceneId(null), 2000);
    })
    .catch((err) => {
      console.error("Copy failed", err);
    });
}
