import { Project } from "../types";

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
