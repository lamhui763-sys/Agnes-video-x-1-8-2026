/**
 * storageGuard.ts
 * Patches localStorage.setItem BEFORE React mounts.
 * When writing "toonflow_projects" hits QuotaExceededError:
 * 1. Strip all data:image / data:video base64 blobs
 * 2. Trim long logs & novelText
 * 3. Retry once
 * This prevents generated videos from vanishing after app exit/refresh.
 */

function stripBase64(url: unknown): string {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("data:image") || url.startsWith("data:video")) return "";
  return url;
}

function pruneScene(s: any): any {
  if (!s || typeof s !== "object") return s;
  const o = { ...s };
  const keys = [
    "imageUrl", "imageUrlExt", "imageUrlKeyframes",
    "videoUrl", "videoUrlExt", "videoUrlKeyframes",
    "videoUrlLocal", "videoUrlExtLocal", "videoUrlKeyframesLocal",
    "videoTailFrame", "midpointImageUrlKeyframes",
    "startFrameKeyframes", "endFrameKeyframes",
  ];
  for (const k of keys) {
    if (o[k]) o[k] = stripBase64(o[k]);
  }
  if (Array.isArray(o.videoLogs)) o.videoLogs = o.videoLogs.slice(-3);
  if (Array.isArray(o.videoLogsExt)) o.videoLogsExt = o.videoLogsExt.slice(-3);
  if (Array.isArray(o.videoLogsKeyframes)) o.videoLogsKeyframes = o.videoLogsKeyframes.slice(-3);
  return o;
}

function pruneProjectsJson(raw: string): string {
  try {
    const projects = JSON.parse(raw);
    if (!Array.isArray(projects)) return raw;
    const pruned = projects.map((p: any) => {
      const cp = { ...p };
      if (typeof cp.novelText === "string" && cp.novelText.length > 30000) {
        cp.novelText = cp.novelText.slice(0, 30000) + "... (truncated for storage)";
      }
      if (Array.isArray(cp.characters)) {
        cp.characters = cp.characters.map((c: any) => {
          const cc = { ...c };
          cc.avatarUrl = stripBase64(cc.avatarUrl);
          cc.uploadedAvatarUrl = stripBase64(cc.uploadedAvatarUrl);
          if (Array.isArray(cc.avatarUrls)) cc.avatarUrls = cc.avatarUrls.map(stripBase64).filter(Boolean);
          if (Array.isArray(cc.uploadedAvatarUrls))
            cc.uploadedAvatarUrls = cc.uploadedAvatarUrls.map(stripBase64).filter(Boolean);
          return cc;
        });
      }
      if (Array.isArray(cp.scenes)) cp.scenes = cp.scenes.map(pruneScene);
      if (Array.isArray(cp.scenesExt)) cp.scenesExt = cp.scenesExt.map(pruneScene);
      if (Array.isArray(cp.scenesFirstLast)) cp.scenesFirstLast = cp.scenesFirstLast.map(pruneScene);
      return cp;
    });
    return JSON.stringify(pruned);
  } catch {
    return raw;
  }
}

export function installStorageGuard(): void {
  if (typeof window === "undefined" || !(window as any).localStorage) return;
  if ((window as any).__toonflowStorageGuardInstalled) return;
  (window as any).__toonflowStorageGuardInstalled = true;

  const originalSetItem = Storage.prototype.setItem;

  Storage.prototype.setItem = function (key: string, value: string) {
    try {
      return originalSetItem.call(this, key, value);
    } catch (e: any) {
      const isQuota =
        e instanceof DOMException &&
        (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014);

      if (!isQuota) throw e;

      // Only auto-repair our project blob
      if (key === "toonflow_projects" && typeof value === "string") {
        console.warn("[Toonflow StorageGuard] QuotaExceeded — pruning base64 media and retrying...");
        const pruned = pruneProjectsJson(value);
        try {
          originalSetItem.call(this, key, pruned);
          console.info("[Toonflow StorageGuard] Pruned save succeeded. Videos with http URLs kept.");
          return;
        } catch (e2) {
          console.error("[Toonflow StorageGuard] Still full after prune. Clear old projects in UI.", e2);
          throw e2;
        }
      }

      // For other keys, try removing non-essential caches then retry once
      try {
        localStorage.removeItem("last_saved_projects");
        localStorage.removeItem("toonflow_character_library");
        return originalSetItem.call(this, key, value);
      } catch {
        throw e;
      }
    }
  };

  console.info("[Toonflow StorageGuard] Installed — auto-prune on localStorage quota.");
}
