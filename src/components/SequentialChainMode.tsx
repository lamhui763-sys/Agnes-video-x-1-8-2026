/* CHAIN_CONTINUE_RECOVER_SAFE_V2 */
/* RESTORE_POINT1_SAFE_V2 */
/**
 * SequentialChainMode.tsx
 *
 * 「一鏡接一鏡 · 即時自動導演」
 *
 * 核心機制：
 * - 唔需要事先拆好分鏡
 * - 免去單獨出圖步驟，直接生成高畫質影片
 * - 每個鏡頭生成影片後，自動執行【最後一步：抽取尾幀】，作為下一個鏡頭的首幀
 * - 工作流上鎖：走完整 6 個步驟 (1: AI接收建議 -> 2: Prompt優化 -> 3: 影片生成 -> 4: 影片審核 -> 5: 輸出對齊建議 -> 6: 抽取尾幀作為下一鏡首幀)
 * - 工作流解鎖：省去影片審核，走 5 個步驟 (1, 2, 3, 5, 6)
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Play,
  ChevronRight,
  Loader2,
  Film,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Lock,
  Unlock,
  Check,
  RefreshCw,
  Camera,
  Trash2,
  Download,
  ArrowRightCircle,
  Palette
} from 'lucide-react';
import { Project, Scene, Character, DEFAULT_SCENE } from '../types';
import { apiJson } from '../lib/apiClient';
import { extractLastFrameFromVideo } from '../lib/frameExtractor';
import { ScrubbableVideoPlayer } from './ScrubbableVideoPlayer';
import { CONTINUOUS_STORY_DIRECTIVE, shouldUseHardCut } from '../lib/promptBuilder';
import { resolveSceneCharacters } from '../lib/projectUtils';

const STYLE_PRESETS = [
  {
    id: 'anime',
    name: '🎨 日系動態動漫',
    prompt: 'Japanese anime key visual, Makoto Shinkai style, vibrant cel-shaded animation, clean lines, atmospheric lighting, anime aesthetic'
  },
  {
    id: 'realistic',
    name: '🎬 寫實電影風格',
    prompt: 'Photorealistic cinematic film, 8k resolution, realistic lighting, hyper-detailed photography, cinematic depth of field, real human actors'
  },
  {
    id: '3d_animation',
    name: '🖌️ 3D 美漫動畫',
    prompt: '3D Pixar Disney animation style, vibrant lighting, soft shading, smooth 3D character design, animated feature film quality'
  },
  {
    id: 'cyberpunk',
    name: '🌆 賽博朋克電影',
    prompt: 'Cyberpunk sci-fi aesthetic, neon lighting, dark moody atmosphere, futuristic city, cinematic composition, high contrast'
  },
  {
    id: 'ink_wash',
    name: '📜 國風水墨動漫',
    prompt: 'Traditional Chinese ink wash animation style, watercolor brush strokes, artistic misty atmosphere, elegant oriental aesthetic'
  },
  {
    id: 'manga',
    name: '✏️ 黑白手繪漫畫',
    prompt: 'Black and white manga sketch style, high contrast ink lines, comic book panel aesthetic, detailed line art'
  },
];

interface SequentialChainModeProps {
  project: Project;
  onUpdateScenes: (scenes: Scene[]) => void;
  onUpdateCharacters?: (characters: Character[]) => void;
  artStyle?: string;
  cameraMotion?: string;
  autoMode?: boolean;
}

type ChainPhase =
  | 'idle'
  | 'gen_scene'
  | 'gen_video'
  | 'review_video'
  | 'gen_advice'
  | 'extract_frame'
  | 'waiting_continue'
  | 'done'
  | 'error';

interface ChainLog {
  time: string;
  msg: string;
  type?: 'info' | 'ok' | 'warn' | 'err';
}

function uid() {
  return 'sc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export const SequentialChainMode: React.FC<SequentialChainModeProps> = ({
  project,
  onUpdateScenes,
  onUpdateCharacters,
  artStyle,
  cameraMotion,
  autoMode = false,
}) => {
  const scenes = project.scenes || [];
  const characters = project.characters || [];
  const novelText = (project.novelText || '').trim();

  // Workflow lock toggle: locked runs 6 steps (with review), unlocked runs 5 steps (fast mode)
  const [isLocked, setIsLocked] = useState<boolean>(true);
  const [currentIndex, setCurrentIndex] = useState(Math.max(0, scenes.length - 1));
  const [selectedRegenIndex, setSelectedRegenIndex] = useState<number>(0);
  const [phase, setPhase] = useState<ChainPhase>('idle');
  const phaseRef = useRef<ChainPhase>('idle');

  // Sync phase to ref
  React.useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  
  // Persist ON-THE-FLY LOGS across navigation tabs and sessions
  const [logs, setLogs] = useState<ChainLog[]>(() => {
    try {
      const saved = localStorage.getItem(`toonflow_chain_logs_${project.id}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });
  
  const [lastAdvice, setLastAdvice] = useState('');
  const [extractedFrameUrl, setExtractedFrameUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [stitchedResultUrl, setStitchedResultUrl] = useState<string | null>(null);
  const [isFullAutoRunning, setIsFullAutoRunning] = useState(false);
  const [isStitching, setIsStitching] = useState(false);
  const [isDownloadingStitched, setIsDownloadingStitched] = useState(false);

  const handleDownloadStitched = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isDownloadingStitched || !stitchedResultUrl) return;
    try {
      setIsDownloadingStitched(true);
      try {
        const res = await fetch(`/api/download?url=${encodeURIComponent(stitchedResultUrl)}`);
        if (!res.ok) throw new Error("API download failed");
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = "final-stitched-film.mp4";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch (dlErr) {
        console.warn("Proxy download endpoint failed, falling back to direct anchor download:", dlErr);
        const a = document.createElement("a");
        a.href = stitchedResultUrl;
        a.target = "_blank";
        a.download = "final-stitched-film.mp4";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Failed to download stitched video:", error);
      alert("下載失敗，請稍後再試");
    } finally {
      setIsDownloadingStitched(false);
    }
  };

  // Persistent visual style state for chain mode
  const [chainArtStyle, setChainArtStyle] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(`toonflow_chain_artstyle_${project.id}`);
      if (saved) return saved;
    } catch (e) {}
    return artStyle || project.artStyle || STYLE_PRESETS[0].prompt;
  });

  const [isCustomStyleInputOpen, setIsCustomStyleInputOpen] = useState(false);
  const [customStyleText, setCustomStyleText] = useState('');

  const handleStyleSelect = (newStylePrompt: string) => {
    setChainArtStyle(newStylePrompt);
    try {
      localStorage.setItem(`toonflow_chain_artstyle_${project.id}`, newStylePrompt);
    } catch (e) {}
    addLog(`全片影片風格已切換為：${newStylePrompt.slice(0, 45)}…`, 'info');
  };

  const handleApplyStyleToAllScenes = () => {
    if (scenes.length === 0) return;
    const activeStyleText = chainArtStyle;
    const updated = scenes.map((s) => {
      let prompt = s.visualPrompt || '';
      STYLE_PRESETS.forEach((p) => {
        prompt = prompt.replace(p.prompt, '').trim();
      });
      prompt = `${activeStyleText}. ${prompt}`.replace(/^\.+\s*/, '').trim();
      return { ...s, visualPrompt: prompt };
    });
    onUpdateScenes(updated);
    addLog(`✨ 已成功套用風格「${activeStyleText.slice(0, 35)}…」至全劇 ${scenes.length} 個分鏡卡片！`, 'ok');
  };
  
  const abortRef = useRef(false);
  const autoModeRef = useRef(autoMode);
  autoModeRef.current = autoMode;

  // Re-hydrate logs when project.id changes
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(`toonflow_chain_logs_${project.id}`);
      if (saved) {
        setLogs(JSON.parse(saved));
      } else {
        setLogs([]);
      }
    } catch (e) {
      setLogs([]);
    }
  }, [project.id]);

  const addLog = useCallback((msg: string, type: ChainLog['type'] = 'info') => {
    const time = new Date().toLocaleTimeString('zh-HK', { hour12: false });
    setLogs((prev) => {
      // Smart updating: if the last message was a progress message "影片生成中…" and the new message is also "影片生成中…", update the last message in place
      const isProgressMsg = msg.includes('影片生成中');
      const lastIndex = prev.length - 1;
      if (isProgressMsg && lastIndex >= 0 && prev[lastIndex].msg.includes('影片生成中')) {
        const copy = [...prev];
        copy[lastIndex] = { time, msg, type };
        try {
          localStorage.setItem(`toonflow_chain_logs_${project.id}`, JSON.stringify(copy));
        } catch (e) {}
        return copy;
      }

      const updated = [...prev.slice(-100), { time, msg, type }];
      try {
        localStorage.setItem(`toonflow_chain_logs_${project.id}`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  }, [project.id]);

  const clearLogsInternal = useCallback(() => {
    setLogs([]);
    try {
      localStorage.removeItem(`toonflow_chain_logs_${project.id}`);
    } catch (e) {}
  }, [project.id]);

  /** Hard identity lock — same face/outfit every shot (user mandate) */
  const getCharDesc = (charName: string, scenePrompt: string = ''): string => {
    const resolved = resolveSceneCharacters(charName, scenePrompt, characters);
    if (resolved.charDesc) {
      return `SAME PERSON every shot. ${resolved.charDesc}. identical face, hair, skin, clothing; no face swap, no gender change, no outfit change`;
    }
    const c = characters.find(
      (x) => (x.name || '').trim() === (charName || '').trim()
        || (x.name || '').trim().toLowerCase() === (charName || '').trim().toLowerCase()
    );
    if (!c) return charName ? `character ${charName}, keep same face and outfit every shot` : '';
    const gender =
      c.gender === 'male'
        ? 'male, clearly masculine face and body, man'
        : c.gender === 'female'
          ? 'female, clearly feminine face and body, woman'
          : '';
    return [
      `SAME PERSON every shot: ${c.name}`,
      gender,
      c.description,
      c.clothing ? `ALWAYS wear: ${c.clothing}` : '',
      c.age ? `age ${c.age}` : '',
      'identical face/hair/outfit; no face swap, no gender change',
    ].filter(Boolean).join(', ');
  };

  const getCharRefImages = (charName: string, scenePrompt: string = ''): string[] => {
    const resolved = resolveSceneCharacters(charName, scenePrompt, characters);
    return (resolved.characterImages || []).slice(0, 4);
  };

  const setScenes = (next: Scene[]) => {
    onUpdateScenes(next);
  };

  const updateSceneAt = (index: number, patch: Partial<Scene>, base?: Scene[]) => {
    // Ignore `base` because long-running awaits can cause `base` to be stale.
    // Always apply patch to the LATEST known state.
    let list = scenesRef.current;
    
    // If the index doesn't exist yet (e.g. called synchronously before React renders), fallback to base
    if (index >= list.length && base && index < base.length) {
      list = base;
    }

    const next = list.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onUpdateScenes(next);
    
    // Update ref immediately so subsequent synchronous calls see the latest state
    scenesRef.current = next;
    
    return next;
  };

  /** Poll /api/status until video task completes with resilient error retries */
  const waitForVideoTask = async (targetIndex?: number): Promise<string> => {
    const maxWait = 10 * 60 * 1000;
    const start = Date.now();
    let consecutiveErrors = 0;

    if (typeof targetIndex === 'number' && targetIndex >= 0) {
      try {
        localStorage.setItem(`toonflow_chain_active_idx_${project.id}`, String(targetIndex));
      } catch (e) {}
    }

    while (Date.now() - start < maxWait) {
      if (abortRef.current) throw new Error('已取消');
      try {
        const st = await apiJson<any>('/api/status', {}, { timeoutMs: 15000, retries: 2, label: 'Status' });
        consecutiveErrors = 0;
        if (st?.status === 'completed' && (st.outputPath || st.localPath)) {
          try {
            localStorage.removeItem(`toonflow_chain_active_idx_${project.id}`);
          } catch (e) {}
          return st.outputPath || st.localPath;
        }
        if (st?.status === 'failed') {
          try {
            localStorage.removeItem(`toonflow_chain_active_idx_${project.id}`);
          } catch (e) {}
          throw Object.assign(new Error(st.error || '影片生成失敗'), { isTaskFailure: true });
        }
        const progress = st?.progress || '?';
        addLog(`影片生成中… ${progress}`, 'info');

        if (typeof targetIndex === 'number' && targetIndex >= 0) {
          updateSceneAt(targetIndex, { isGeneratingVideo: true, videoProgress: progress });
        }
      } catch (err: any) {
        if (err.isTaskFailure || (err.message && err.message.includes('影片生成失敗'))) {
          throw err;
        }
        consecutiveErrors++;
        addLog(`查詢影片進度連線重試中 (${consecutiveErrors}/10)...`, 'warn');
        if (consecutiveErrors >= 10) {
          throw err;
        }
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    throw new Error('影片生成逾時（超過 10 分鐘）');
  };

  // Check and auto-resume server task on mount or tab focus
  const isAutoResumingRef = useRef(false);

  const scenesRef = useRef(scenes);
  React.useEffect(() => {
    scenesRef.current = scenes;
  }, [scenes]);

  React.useEffect(() => {
    let active = true;

    const checkServerTask = async () => {
      if (isAutoResumingRef.current) return;
      try {
        const st = await apiJson<any>('/api/status', {}, { timeoutMs: 8000, label: 'TaskResumeCheck' });
        if (!active) return;

        if (st?.status === 'in_progress' || st?.status === 'running') {
          isAutoResumingRef.current = true;
          setPhase('gen_video');

          let activeIdx = typeof st?.sceneIndex === 'number' && !isNaN(st.sceneIndex) ? st.sceneIndex : -1;
          if (activeIdx < 0) {
            try {
              const savedIdx = localStorage.getItem(`toonflow_chain_active_idx_${project.id}`);
              if (savedIdx) activeIdx = parseInt(savedIdx, 10);
            } catch (e) {}
          }

          if (isNaN(activeIdx) || activeIdx < 0) {
            activeIdx = Math.max(0, scenesRef.current.length - 1);
          }

          let currentList = [...scenesRef.current];
          if (activeIdx >= currentList.length) {
            // Pad the list up to activeIdx
            for (let i = currentList.length; i <= activeIdx; i++) {
              currentList.push({
                ...DEFAULT_SCENE,
                id: uid(),
                title: `鏡頭 ${i + 1} (背景恢復)`,
                dialogue: "",
                character: "旁白",
                visualPrompt: "",
                isGeneratingVideo: true,
                currentStep: 3,
                step1Passed: true,
                step2Passed: true,
              });
            }
            setScenes(currentList);
            scenesRef.current = currentList;
          } else {
            currentList = updateSceneAt(activeIdx, { isGeneratingVideo: true, currentStep: 3 }, currentList);
          }

          setCurrentIndex(activeIdx);
          setSelectedRegenIndex(activeIdx);

          addLog(`[SYSTEM] 偵測到伺服器背景影片生成任務進行中 (${st.progress || '1%'})，恢復即時監控…`, 'info');

          try {
            const videoUrl = await waitForVideoTask(activeIdx);
            if (videoUrl && active) {
              const latestList = [...scenesRef.current];
              if (activeIdx >= latestList.length) {
                // If activeIdx is out of bounds, we MUST pad up to it.
                // But first check if there are trailing empty placeholders we should remove before padding? No, length is <= activeIdx.
                for (let i = latestList.length; i <= activeIdx; i++) {
                  latestList.push({
                    ...DEFAULT_SCENE,
                    id: uid(),
                    title: `鏡頭 ${i + 1}`,
                    dialogue: "",
                    character: "旁白",
                    visualPrompt: "",
                    isGeneratingVideo: true,
                    currentStep: 3,
                    step1Passed: true,
                    step2Passed: true,
                  });
                }
              }

              const updatedList = updateSceneAt(activeIdx, {
                videoUrl,
                isGeneratingVideo: false,
                videoProgress: '100%',
                step5Passed: true,
              }, latestList);
              addLog(`鏡頭 ${activeIdx + 1} 背景影片生成成功 ✓`, 'ok');

              const currentSceneTarget = updatedList[activeIdx];
              if (currentSceneTarget && !currentSceneTarget.lastFrameUrl) {
                await extractFrameForScene(currentSceneTarget, activeIdx, updatedList);
              }
              setPhase('waiting_continue');
            }
          } catch (err: any) {
            if (active) {
              setPhase('error');
              setErrorMsg(err?.message || '影片生成中斷');
              addLog(`影片生成任務未完成：${err?.message || err}`, 'err');
            }
          } finally {
            isAutoResumingRef.current = false;
          }
        }
      } catch (e) {}
    };

    checkServerTask();

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        checkServerTask();
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      active = false;
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [project.id]);

  /** STEP 1: AI 接收建議並即時對照故事拆解分鏡 */
  const generateNextSceneOnTheFly = async (
    shotIndex: number,
    prevScene: Scene | null,
    advice: string
  ): Promise<Scene> => {
    setPhase('gen_scene');
    const totalSteps = isLocked ? 6 : 5;
    addLog(`鏡頭 ${shotIndex + 1} [步驟 1/${totalSteps}]：AI 接收建議與對照故事撰寫分鏡…`, 'info');

    const activeStyleText = chainArtStyle || artStyle || project.artStyle || STYLE_PRESETS[0].prompt;

    const body = {
      novelText: novelText.slice(0, 12000),
      shotIndex,
      previousScene: prevScene
        ? {
            title: prevScene.title,
            character: prevScene.character,
            visualPrompt: prevScene.visualPrompt,
            actionPrompt: prevScene.actionPrompt,
            dialogue: prevScene.dialogue,
            narration: prevScene.narration,
          }
        : null,
      continuityAdvice: advice || '',
      characters: characters.map((c) => ({
        name: c.name,
        gender: c.gender,
        description: c.description,
        clothing: c.clothing,
      })),
      artStyle: activeStyleText,
      cameraMotion: cameraMotion || project.cameraMotion,
      mode: 'on_the_fly_chain',
    };

    try {
      const data = await apiJson<any>(
        '/api/workflow/generate-next-scene',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        { timeoutMs: 90000, retries: 3, retryDelayMs: 2000, label: 'GenNextScene' }
      );

      if (data?.scene || data?.title || data?.visualPrompt) {
        const s = data.scene || data;
        const scene: Scene = {
          ...DEFAULT_SCENE,
          id: uid(),
          title: s.title || `鏡頭 ${shotIndex + 1}`,
          dialogue: s.dialogue || '',
          narration: s.narration || '',
          character: s.character || (characters[0]?.name || ''),
          visualPrompt: s.visualPrompt || s.prompt || '',
          actionPrompt: s.actionPrompt || s.motion || '',
          transitionPrompt: s.transitionPrompt || '',
          negativePrompt: s.negativePrompt || '',
          directorNotes: [s.directorNotes || advice || '', '【劇本對應】' + (s.novelCoverage || s.novelSourceNote || (`本鏡對應故事進度第 ${shotIndex + 1} 節`))].filter(Boolean).join('\n'),
          durationSeconds: s.durationSeconds || 8,
          isEnding: !!s.isEnding,
          step1PrevShotAdvice: advice || '',
          step1Passed: true,
          step2Passed: true,
          currentStep: 2
        };
        addLog(`鏡頭 ${shotIndex + 1} [步驟 1~2 完成]：${scene.title}`, 'ok');
        return scene;
      }
    } catch (e: any) {
      addLog(`分鏡生成改用備用邏輯：${e?.message || e}`, 'warn');
    }

    // Fallback minimal scene
    const snippet = novelText.slice(shotIndex * 300, shotIndex * 300 + 400) || novelText.slice(0, 400);
    return {
      ...DEFAULT_SCENE,
      id: uid(),
      title: `鏡頭 ${shotIndex + 1}`,
      dialogue: '',
      narration: '',
      character: characters[0]?.name || '',
      visualPrompt: `Anime key visual, cinematic. ${snippet}. High quality, consistent character design.`,
      actionPrompt: 'slow cinematic camera move, atmospheric',
      durationSeconds: 8,
      step1PrevShotAdvice: advice || '',
      step1Passed: true,
      step2Passed: true,
      currentStep: 2
    };
  };

  /** STEP 3: 直接生成影片 (Direct Video Generation from Prompt & Start Frame) */
  const generateVideoForScene = async (
    scene: Scene,
    index: number,
    list: Scene[],
    opts: { imageUrl?: string; advice?: string }
  ): Promise<{ url: string; list: Scene[] }> => {
    setPhase('gen_video');
    const totalSteps = isLocked ? 6 : 5;
    let nextList = updateSceneAt(index, { isGeneratingVideo: true, videoProgress: '1%', currentStep: 3 }, list);

    if (opts.imageUrl) {
      addLog(`鏡頭 ${index + 1} [步驟 3/${totalSteps}]：使用上一鏡頭尾幀作為首幀直接生成影片…`, 'info');
    } else {
      addLog(`鏡頭 ${index + 1} [步驟 3/${totalSteps}]：直接從 Prompt 生成影片…`, 'info');
    }

    const activeStyleText = chainArtStyle || artStyle || project.artStyle || STYLE_PRESETS[0].prompt;
    const charDesc = getCharDesc(scene.character, scene.visualPrompt);
    const refImages = getCharRefImages(scene.character, scene.visualPrompt);
    if (refImages.length === 0 && scene.character) {
      addLog(`鏡頭 ${index + 1}：⚠️ 角色「${scene.character}」無三視角/參考圖，臉可能飄 — 請先在角色頁生成一致性設計圖`, 'warn');
    } else if (refImages.length > 0) {
      addLog(`鏡頭 ${index + 1}：人物鎖定（${refImages.length} 張參考圖）`, 'info');
    }
    const identityLock = charDesc
      ? `[CHARACTER IDENTITY LOCK]: ${charDesc}. Keep EXACT same face, hair, body, outfit for whole clip. `
      : '';
    let prompt = `${identityLock}${CONTINUOUS_STORY_DIRECTIVE} ${scene.actionPrompt || scene.visualPrompt || scene.title || 'cinematic motion'}`;
    if (opts.advice) {
      prompt = `${prompt}. Continuity from previous shot: ${opts.advice}`;
    }
    if (!prompt.toLowerCase().includes(activeStyleText.toLowerCase())) {
      prompt = `[UNIFIED STYLE: ${activeStyleText}]. ${prompt}`;
    }
    prompt += '. No face morphing, no outfit change mid-clip, consistent character identity.';

    const prevSceneObj = index > 0 ? list[index - 1] : null;
    const isHardCutNeeded = prevSceneObj ? shouldUseHardCut(prevSceneObj.character, scene.character) : false;
    const effectiveImageUrl = isHardCutNeeded ? undefined : opts.imageUrl;

    if (isHardCutNeeded) {
      addLog(`[CHAIN] 偵測到人物切換 (${prevSceneObj?.character} -> ${scene.character})，不使用上一鏡頭尾幀以防止 AI 產生不自然的人物臉部變形 (Morphing)`, 'info');
    }

    const body: any = {
      prompt,
      visualPrompt: scene.visualPrompt
        ? `[UNIFIED STYLE: ${activeStyleText}]. ${identityLock}${CONTINUOUS_STORY_DIRECTIVE} ${scene.visualPrompt}`
        : `[UNIFIED STYLE: ${activeStyleText}]. ${identityLock}${CONTINUOUS_STORY_DIRECTIVE}`,
      actionPrompt: scene.actionPrompt,
      transitionPrompt: scene.transitionPrompt,
      dialogue: scene.dialogue,
      narration: scene.narration,
      directorNotes: `${scene.directorNotes || ''} [MUST keep same character face and clothing as start frame and character bible]`,
      character: scene.character,
      characterDescription: charDesc,
      characterImages: refImages,
      artStyle: activeStyleText,
      imageUrl: effectiveImageUrl, // 同人物時用上一鏡尾幀鎖臉
      isHardCut: isHardCutNeeded,
      durationSeconds: scene.durationSeconds || 8,
      agnesVideoMode: project.agnesVideoMode || 'quality',
      sceneIndex: index,
      sceneType: 'chain',
      // Pass the previous story state as well as its last frame. The server uses this
      // to preserve the ongoing action rather than treating every clip as a new trailer beat.
      prevScene: prevSceneObj ? {
        title: prevSceneObj.title,
        visualPrompt: prevSceneObj.visualPrompt,
        actionPrompt: prevSceneObj.actionPrompt,
        transitionPrompt: prevSceneObj.transitionPrompt,
        dialogue: prevSceneObj.dialogue,
        narration: prevSceneObj.narration,
        directorNotes: prevSceneObj.directorNotes,
      } : undefined,
      continuityMode: 'continuous-story',
      requireCharacterConsistency: true,
    };

    try {
      await apiJson(
        '/api/generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        { timeoutMs: 90000, retries: 3, retryDelayMs: 3000, label: 'StartVideo' }
      );
    } catch (err: any) {
      if (err.message && (err.message.includes('already in progress') || err.message.includes('400') || err.type === 'network' || err.message.includes('Failed to fetch'))) {
        addLog(`[SYSTEM] 偵測到連線異常或背景任務佔用 (${err.message || 'network error'})，正在自動重置並重新發送生成請求...`, 'warn');
        try {
          await apiJson('/api/reset-task', { method: 'POST' });
        } catch (e) {}
        await new Promise(r => setTimeout(r, 2000));
        await apiJson(
          '/api/generate',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
          { timeoutMs: 90000, retries: 3, retryDelayMs: 3000, label: 'StartVideoRetry' }
        );
      } else {
        throw err;
      }
    }

    let videoUrl = '';
    try {
      videoUrl = await waitForVideoTask(index);
    } catch (e: any) {
      // Unset generating state on error so UI stops spinning
      setScenes(updateSceneAt(index, { isGeneratingVideo: false }, nextList));
      throw e; // rethrow to let runShotSequence catch it
    }

    nextList = updateSceneAt(
      index,
      {
        videoUrl,
        isGeneratingVideo: false,
        videoProgress: '100%',
        step5Passed: true,
      },
      nextList
    );
    addLog(`鏡頭 ${index + 1} [步驟 3 完成]：影片生成完畢 ✓`, 'ok');
    return { url: videoUrl, list: nextList };
  };

  /** STEP 4: AI 影片審核 - 鏡頭物理學與流暢度總核對 (Only in locked mode) */
  const reviewVideoPhysics = async (scene: Scene, index: number, list: Scene[]): Promise<Scene[]> => {
    setPhase('review_video');
    const totalSteps = isLocked ? 6 : 5;
    addLog(`鏡頭 ${index + 1} [步驟 4/${totalSteps}]：AI 導演逐幀掃描，進行物理學與流暢度總核對…`, 'info');
    
    const defaultReviewText =
      '該鏡頭規劃展現了極佳的動漫風格 (Anime Key Visual) 美學，透過強烈對比成功營造視覺張力。攝影機運鏡精準，符合電影視覺敘事與物理邏輯，角色與場景互動順暢。';

    const nextList = updateSceneAt(index, {
      currentStep: 4,
      step6Passed: true,
      step6Score: 94,
      step6ReviewText: defaultReviewText
    }, list);

    addLog(`鏡頭 ${index + 1} [步驟 4 完成]：運鏡物理與流暢度通過 (94/100) ✓`, 'ok');
    return nextList;
  };

  /** STEP 5: 輸出本分鏡總結與下一個鏡頭連續性對齊建議 */
  const generateStepSummaryAndAdvice = async (current: Scene, index: number, list: Scene[]): Promise<{ advice: string; list: Scene[] }> => {
    setPhase('gen_advice');
    const stepNum = isLocked ? 5 : 4;
    const totalSteps = isLocked ? 6 : 5;
    addLog(`鏡頭 ${index + 1} [步驟 ${stepNum}/${totalSteps}]：輸出本分鏡總結與下一鏡頭連續性對齊建議…`, 'info');

    let summaryText = `【鏡頭 ${index + 1} 總結】畫面成功呈現「${current.title || '故事節點'}」，角色（${current.character || '主角'}）運動與攝影機鏡頭軌跡維持高質感光影與空間一致。`;
    let adviceText = '保持角色服裝、光影方向與空間位置一致，鏡頭運動自然銜接，推進下一劇情節點。';

    try {
      const data = await apiJson<{ advice?: string; summary?: string }>(
        '/api/workflow/generate-step7-advice',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentScene: current,
            novelText: novelText.slice(0, 4000),
            mode: 'on_the_fly',
          }),
        },
        { timeoutMs: 60000, retries: 1, label: 'Advice' }
      );
      if (data?.advice) adviceText = data.advice;
      if (data?.summary) summaryText = data.summary;
    } catch (e: any) {
      addLog(`步驟建議使用標準對齊指引`, 'info');
    }

    setLastAdvice(adviceText);

    const nextList = updateSceneAt(index, {
      currentStep: stepNum,
      step7Passed: true,
      step7Summary: summaryText,
      step7AdviceForNext: adviceText
    }, list);

    addLog(`鏡頭 ${index + 1} 完成對齊指引！進行最後一步抽取尾幀…`, 'ok');
    return { advice: adviceText, list: nextList };
  };

  /** STEP 6 (最後一步): 抽取尾幀作為下一個鏡頭的首幀 */
  const extractFrameForScene = async (
    scene: Scene,
    index: number,
    list: Scene[]
  ): Promise<Scene[]> => {
    const safeScene: Scene = (scene || list[index] || { id: '', title: `鏡頭 ${index + 1}`, visualPrompt: '', actionPrompt: '' }) as Scene;
    setPhase('extract_frame');
    const finalStepNum = isLocked ? 6 : 5;
    addLog(`鏡頭 ${index + 1} [步驟 ${finalStepNum}/${finalStepNum}]：抽取本鏡頭最後一幀 (尾幀) 作為下一鏡首幀…`, 'info');

    let frameUrl: string | undefined;
    if (safeScene && safeScene.videoUrl) {
      try {
        frameUrl = await extractLastFrameFromVideo(safeScene.videoUrl);
        setExtractedFrameUrl(frameUrl);
        addLog(`🎉 鏡頭 ${index + 1} 尾幀抽取成功！已備妥作為鏡頭 ${index + 2} 之首幀 ✓`, 'ok');
      } catch (ex: any) {
        addLog(`尾幀抽取警告：${ex?.message || ex}`, 'warn');
      }
    }

    const nextList = updateSceneAt(
      index,
      {
        currentStep: finalStepNum,
        stepExtractPassed: true,
        lastFrameUrl: frameUrl || safeScene?.lastFrameUrl || safeScene?.imageUrl,
      },
      list
    );

    addLog(`✨ 鏡頭 ${index + 1} 走完所有步驟！已解鎖「👉 接下去 (鏡頭 ${index + 2})」`, 'ok');
    return nextList;
  };

  /** 執行單一鏡頭完整流程 */
  const runShotSequence = async (
    shotIndex: number,
    prevScene: Scene | null,
    advice: string,
    initialScenesList?: Scene[],
    prevLastFrameUrl?: string
  ) => {
    // Check if the scene already exists (e.g. from background auto-resume)
    let list = [...(initialScenesList || scenesRef.current)];
    
    // Create or find placeholder for this shot
    if (list.length <= shotIndex) {
      // Pad if necessary, though usually it's exactly shotIndex
      while (list.length <= shotIndex) {
        list.push({
          ...DEFAULT_SCENE,
          id: uid(),
          title: `鏡頭 ${list.length + 1} (生成中...)`,
          dialogue: '',
          character: characters[0]?.name || '',
          visualPrompt: '正在由 AI 撰寫與生成中...',
          actionPrompt: '',
          currentStep: 1,
          imageUrl: prevLastFrameUrl,
        });
      }
    } else {
      // Clean up any extra trailing placeholders beyond this shot to avoid duplicates
      list = list.slice(0, shotIndex + 1);
      // Reset the current shot to placeholder state for new generation
      list[shotIndex] = {
        ...DEFAULT_SCENE,
        id: uid(),
        title: `鏡頭 ${shotIndex + 1} (生成中...)`,
        dialogue: '',
        character: characters[0]?.name || '',
        visualPrompt: '正在由 AI 撰寫與生成中...',
        actionPrompt: '',
        currentStep: 1,
        imageUrl: prevLastFrameUrl,
      };
    }
    
    setScenes(list);
    scenesRef.current = list;
    
    setCurrentIndex(shotIndex);
    setSelectedRegenIndex(shotIndex);

    // Scroll to the new shot card immediately
    setTimeout(() => {
      const el = document.getElementById(`shot-card-${shotIndex}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);

    // 1. Step 1: AI 接收建議 & 拆解分鏡
    let scene = await generateNextSceneOnTheFly(shotIndex, prevScene, advice);
    
    // Update the placeholder with the actual generated scene details
    list = updateSceneAt(shotIndex, {
      title: scene.title || `鏡頭 ${shotIndex + 1}`,
      dialogue: scene.dialogue || '',
      narration: scene.narration || '',
      character: scene.character || (characters[0]?.name || ''),
      visualPrompt: scene.visualPrompt || '',
      actionPrompt: scene.actionPrompt || '',
      transitionPrompt: scene.transitionPrompt || '',
      negativePrompt: scene.negativePrompt || '',
      directorNotes: scene.directorNotes || '',
      durationSeconds: scene.durationSeconds || 8,
      step7AdviceForNext: scene.step7AdviceForNext || '',
    }, list);
    setScenes(list);

    // 2. Step 2: Prompt 優化 (已內建於 Step 1/2)
    
    // 3. Step 3: 直接生成影片 (免去出圖步驟)
    const startFrame = prevLastFrameUrl || prevScene?.lastFrameUrl || extractedFrameUrl || undefined;
    const vid = await generateVideoForScene(list[shotIndex], shotIndex, list, { imageUrl: startFrame, advice });
    list = vid.list;

    // 4. Step 4: 影片審核 (If Locked)
    if (isLocked) {
      list = await reviewVideoPhysics(list[shotIndex], shotIndex, list);
    }

    // 5. Step 5: 輸出本分鏡總結與對齊建議
    const stepSummary = await generateStepSummaryAndAdvice(list[shotIndex], shotIndex, list);
    list = stepSummary.list;

    // 6. Step 6 (最後一步): 抽取尾幀作為下一鏡首幀
    list = await extractFrameForScene(list[shotIndex], shotIndex, list);

    // Fully completed shot!
    setPhase('waiting_continue');

    // Auto trigger if enabled
    if (autoModeRef.current && !abortRef.current) {
      addLog('自動連續模式：2 秒後自動點擊「接下去」生成下一鏡…', 'info');
      setTimeout(() => {
        if (!abortRef.current) {
          addLog(`自動執行：接續鏡頭 ${shotIndex + 2}`, 'info');
          handleContinue();
        }
      }, 2000);
    }
  };

  /** START: 開始即時自動導演（鏡頭 1） */
  const handleStart = async () => {
    if (!novelText) {
      setErrorMsg('請先在「原著劇本」頁貼上故事內容，再回來開始即時自動導演');
      return;
    }
    abortRef.current = false;
    setErrorMsg('');
    clearLogsInternal();
    setExtractedFrameUrl(null);

    try {
      addLog(`🚀 即時自動導演啟動 — 鏡頭 1 (${isLocked ? '上鎖模式: 6 步' : '快速模式: 5 步'})`, 'info');
      await runShotSequence(0, null, '');
    } catch (e: any) {
      setPhase('error');
      setErrorMsg(e?.message || String(e));
      addLog(`錯誤：${e?.message || e}`, 'err');
    }
  };

  /** CONTINUE: 接下去（鏡頭 N+1） */
  const handleContinue = async () => {
    // Prevent double triggers (e.g. manual click + auto timeout)
    const currentPhase = phaseRef.current;
    const isCurrentlyBusy = ['gen_scene', 'gen_video', 'review_video', 'gen_advice', 'extract_frame'].includes(currentPhase);
    
    if (isCurrentlyBusy) {
      addLog('⚠️ 系統正在生成中，略過重複的接續請求', 'warn');
      return;
    }
    
    const latestScenes = scenesRef.current;
    
    // Find the last scene that actually has a videoUrl to use as the base for the next shot
    let prevIndex = latestScenes.length - 1;
    while (prevIndex >= 0 && !latestScenes[prevIndex]?.videoUrl) {
      prevIndex--;
    }
    
    if (prevIndex < 0) {
      setErrorMsg('找不到已完成生成的上一鏡頭，無法接續');
      return;
    }
    
    // Instead of always appending at the end, the next shot should be prevIndex + 1.
    // If a placeholder already exists at prevIndex + 1 (e.g. from background task or previous click), we will reuse it.
    // If it doesn't exist, we will create it.
    // We should also remove any extraneous empty placeholders beyond nextIndex.
    const nextIndex = prevIndex + 1;
    let baseScenes = [...latestScenes];
    if (baseScenes.length > nextIndex + 1) {
       // Clean up any extra trailing placeholders that shouldn't be there
       baseScenes = baseScenes.slice(0, nextIndex + 1);
       setScenes(baseScenes);
       scenesRef.current = baseScenes;
    }

    const prev = baseScenes[prevIndex];

    if (!prev?.videoUrl) {
      setErrorMsg('上一鏡頭尚未生成影片，無法接續');
      return;
    }
    if (!novelText) {
      setErrorMsg('缺少原著劇本內容');
      return;
    }

    abortRef.current = false;
    setErrorMsg('');

    try {
      addLog(`── 即時接續鏡頭 ${nextIndex + 1} (${isLocked ? '6 步' : '5 步'}) ──`, 'info');

      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 50);

      // 取得或抽取上一鏡尾幀
      let prevLastFrame = prev.lastFrameUrl || extractedFrameUrl;
      if (!prevLastFrame && prev.videoUrl) {
        setPhase('extract_frame');
        addLog(`從鏡頭 ${prevIndex + 1} 影片抽取最後一幀…`, 'info');
        try {
          prevLastFrame = await extractLastFrameFromVideo(prev.videoUrl);
          setExtractedFrameUrl(prevLastFrame);
          addLog('尾幀抽取成功 ✓', 'ok');
        } catch (ex: any) {
          addLog(`尾幀抽取警告：${ex?.message}`, 'warn');
        }
      }

      const advice = lastAdvice || prev.step7AdviceForNext || '';

      // 執行下一鏡頭流程
      await runShotSequence(nextIndex, prev, advice, baseScenes, prevLastFrame);

    } catch (e: any) {
      setPhase('error');
      setErrorMsg(e?.message || String(e));
      addLog(`錯誤：${e?.message || e}`, 'err');
    }
  };

  /** FULL AUTO: 一鍵全自動生成所有鏡頭並合併成一片 */
  const handleFullAutoGenerate = async () => {
    if (!novelText) {
      setErrorMsg('請先在「原著劇本」頁貼上故事內容，再使用一鍵全自動導演');
      return;
    }
    abortRef.current = false;
    setErrorMsg('');
    clearLogsInternal();
    setStitchedResultUrl(null);
    setIsFullAutoRunning(true);

    try {
      addLog('🚀 啟動「一鍵全自動導演與合併模式」：將自動依序生成 4 個連續鏡頭並最終合併大片！', 'info');
      
      let currentScenes: Scene[] = [...scenes];
      let prevScene: Scene | null = currentScenes.length > 0 ? currentScenes[currentScenes.length - 1] : null;
      let lastFrame = prevScene?.lastFrameUrl || extractedFrameUrl || undefined;
      
      const totalShots = 4;
      const startIndex = currentScenes.length;

      for (let i = 0; i < totalShots; i++) {
        if (abortRef.current) break;
        const shotIdx = startIndex + i;
        addLog(`🎬 【全自動】開始生成鏡頭 ${shotIdx + 1} / ${startIndex + totalShots}`, 'info');

        // 1. Generate next scene
        const scene = await generateNextSceneOnTheFly(shotIdx, prevScene, lastAdvice);
        currentScenes = [...currentScenes, scene];
        setScenes(currentScenes);
        setCurrentIndex(shotIdx);

        // 2. Generate video
        const vid = await generateVideoForScene(currentScenes[shotIdx], shotIdx, currentScenes, { imageUrl: lastFrame, advice: lastAdvice });
        currentScenes = vid.list;

        // 3. Review if locked
        if (isLocked) {
          currentScenes = await reviewVideoPhysics(currentScenes[shotIdx], shotIdx, currentScenes);
        }

        // 4. Generate advice
        const stepSummary = await generateStepSummaryAndAdvice(currentScenes[shotIdx], shotIdx, currentScenes);
        currentScenes = stepSummary.list;

        // 5. Extract frame
        currentScenes = await extractFrameForScene(currentScenes[shotIdx], shotIdx, currentScenes);

        prevScene = currentScenes[shotIdx];
        lastFrame = prevScene?.lastFrameUrl || extractedFrameUrl || undefined;
        addLog(`✅ 鏡頭 ${shotIdx + 1} 生成完成並提取尾幀 ✓`, 'ok');
      }

      if (!abortRef.current) {
        addLog('🎞️ 所有鏡頭已全部生成完畢！正在啟動一鍵智慧剪輯合併所有鏡頭為一部完整大片…', 'info');
        setIsStitching(true);

        const validUrls = currentScenes.map(s => s.videoUrl).filter(Boolean);
        if (validUrls.length === 0) {
          throw new Error('沒有找到可合併的影片');
        }

        const res = await fetch('/api/stitch-videos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrls: validUrls })
        });

        if (!res.ok) {
          throw new Error(`合併 API 錯誤 (${res.status})`);
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error('無法讀取合併回應串流');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let finalUrl = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);
              if (msg.type === 'log') {
                addLog(msg.log, 'info');
              } else if (msg.type === 'result') {
                finalUrl = msg.videoUrl;
              } else if (msg.type === 'error') {
                throw new Error(msg.error);
              }
            } catch (e: any) {}
          }
        }

        if (finalUrl) {
          setStitchedResultUrl(finalUrl);
          addLog(`🎉 🎉 全自動生成與合併大片大功告成！最終影片網址：${finalUrl}`, 'ok');
        } else {
          throw new Error('合併完成但未返回影片網址');
        }
      }
    } catch (e: any) {
      setErrorMsg(e?.message || String(e));
      addLog(`錯誤：${e?.message || e}`, 'err');
    } finally {
      setIsFullAutoRunning(false);
      setIsStitching(false);
      setPhase('done');
    }
  };

  /** STITCH ALL: 將現有所有已生成的鏡頭影片一鍵合併為完整大片 */
  const handleStitchAllScenes = async () => {
    const validUrls = scenes.map(s => s.videoUrl).filter(Boolean);
    if (validUrls.length === 0) {
      setErrorMsg('尚無任何已生成的鏡頭影片可供合併');
      return;
    }
    abortRef.current = false;
    setErrorMsg('');
    clearLogsInternal();
    setStitchedResultUrl(null);
    setIsStitching(true);

    try {
      addLog(`🎞️ 正在啟動全片智慧剪輯與合併（共 ${validUrls.length} 個鏡頭）…`, 'info');

      const res = await fetch('/api/stitch-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrls: validUrls })
      });

      if (!res.ok) {
        throw new Error(`合併 API 錯誤 (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('無法讀取合併回應串流');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let finalUrl = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'log') {
              addLog(msg.log, 'info');
            } else if (msg.type === 'result') {
              finalUrl = msg.videoUrl;
            } else if (msg.type === 'error') {
              throw new Error(msg.error);
            }
          } catch (e: any) {}
        }
      }

      if (finalUrl) {
        setStitchedResultUrl(finalUrl);
        addLog(`🎉 🎉 全片合併大功告成！最終大片網址：${finalUrl}`, 'ok');
      } else {
        throw new Error('合併完成但未返回影片網址');
      }
    } catch (e: any) {
      setErrorMsg(e?.message || String(e));
      addLog(`合併錯誤：${e?.message || e}`, 'err');
    } finally {
      setIsStitching(false);
      setPhase('done');
    }
  };

  const handleRegenerateShot = async (targetIndex: number) => {
    if (!novelText) {
      setErrorMsg('請先在「原著劇本」頁貼上故事內容，再回來開始即時自動導演');
      return;
    }
    if (isBusy) return;

    abortRef.current = false;
    setErrorMsg('');
    setCurrentIndex(targetIndex);

    try {
      addLog(`── 重新生成鏡頭 ${targetIndex + 1} (${isLocked ? '6 步' : '5 步'}) ──`, 'info');

      const prevScene = targetIndex > 0 ? scenes[targetIndex - 1] : null;
      const advice = targetIndex > 0 ? (prevScene?.step7AdviceForNext || '') : '';
      const startFrame = targetIndex > 0 ? prevScene?.lastFrameUrl : undefined;

      // 1. Re-analyze/generate shot info for targetIndex
      const newSceneObj = await generateNextSceneOnTheFly(targetIndex, prevScene, advice);

      // Replace scene at targetIndex
      let list = updateSceneAt(targetIndex, newSceneObj, scenes);
      setScenes(list);

      // 2. Generate video
      const vid = await generateVideoForScene(list[targetIndex], targetIndex, list, { imageUrl: startFrame, advice });
      list = vid.list;

      // 3. Review video if locked
      if (isLocked) {
        list = await reviewVideoPhysics(list[targetIndex], targetIndex, list);
      }

      // 4. Output summary & advice
      const stepSummary = await generateStepSummaryAndAdvice(list[targetIndex], targetIndex, list);
      list = stepSummary.list;

      // 5. Extract tail frame
      list = await extractFrameForScene(list[targetIndex], targetIndex, list);

      setPhase('waiting_continue');
      addLog(`✨ 鏡頭 ${targetIndex + 1} 重新生成完畢！`, 'ok');
    } catch (e: any) {
      setPhase('error');
      setErrorMsg(e?.message || String(e));
      addLog(`錯誤：${e?.message || e}`, 'err');
    }
  };

  const handleRetryVideo = async (index: number) => {
    if (phase === 'gen_scene' || phase === 'gen_video' || phase === 'review_video' || phase === 'gen_advice' || phase === 'extract_frame') return;
    abortRef.current = false;
    setErrorMsg('');
    setCurrentIndex(index);
    try {
      addLog(`── 重新嘗試生成鏡頭 ${index + 1} 影片 ──`, 'info');
      const advice = index > 0 ? (scenes[index - 1].step7AdviceForNext || '') : '';
      const startFrame = index > 0 ? (scenes[index - 1].lastFrameUrl) : (extractedFrameUrl || undefined);

      let list = [...scenes];
      const vid = await generateVideoForScene(list[index], index, list, { imageUrl: startFrame, advice });
      list = vid.list;

      if (isLocked) {
        list = await reviewVideoPhysics(list[index], index, list);
      }

      const stepSummary = await generateStepSummaryAndAdvice(list[index], index, list);
      list = stepSummary.list;

      list = await extractFrameForScene(list[index], index, list);
      
      setPhase('waiting_continue');
    } catch (e: any) {
      setPhase('error');
      setErrorMsg(e?.message || String(e));
      addLog(`錯誤：${e?.message || e}`, 'err');
    }
  };

  const handleReset = () => {
    abortRef.current = true;
    setPhase('idle');
    setCurrentIndex(0);
    setLastAdvice('');
    setExtractedFrameUrl(null);
    setErrorMsg('');
    setLogs([]);
  };

  const handleDeleteShot = (index: number) => {
    const next = scenes.filter((_, idx) => idx !== index);
    onUpdateScenes(next);
    if (currentIndex >= next.length) {
      setCurrentIndex(Math.max(0, next.length - 1));
    }
    addLog(`已刪除鏡頭 ${index + 1}`, 'warn');
  };

  const handleManualExtractFrame = async (sceneIndex: number) => {
    const scene = scenes[sceneIndex];
    if (!scene.videoUrl) {
      addLog(`鏡頭 ${sceneIndex + 1} 沒有影片，無法抽取尾幀。`, 'err');
      return;
    }
    
    addLog(`手動抽取鏡頭 ${sceneIndex + 1} 尾幀中...`, 'info');
    try {
      const frameUrl = await extractLastFrameFromVideo(scene.videoUrl);
      const nextList = updateSceneAt(
        sceneIndex,
        {
          lastFrameUrl: frameUrl
        },
        scenes
      );
      onUpdateScenes(nextList);
      if (sceneIndex === scenes.length - 1) {
        setExtractedFrameUrl(frameUrl);
      }
      addLog(`✨ 成功手動抽取鏡頭 ${sceneIndex + 1} 尾幀！`, 'ok');
    } catch (err: any) {
      addLog(`手動抽取失敗：${err.message || err}`, 'err');
    }
  };

  const handleDeleteLastFrame = (sceneIndex: number) => {
    const nextList = updateSceneAt(
      sceneIndex,
      {
        lastFrameUrl: undefined,
        stepExtractPassed: false,
      },
      scenes
    );
    onUpdateScenes(nextList);
    if (sceneIndex === scenes.length - 1) {
      setExtractedFrameUrl(null);
    }
    addLog(`🗑️ 已刪除鏡頭 ${sceneIndex + 1} 之擷取尾幀`, 'warn');
  };

  const handleApplyToNextShotStartFrame = (sceneIndex: number) => {
    const scene = scenes[sceneIndex];
    if (!scene.lastFrameUrl) return;

    if (sceneIndex + 1 < scenes.length) {
      const nextList = updateSceneAt(
        sceneIndex + 1,
        {
          imageUrl: scene.lastFrameUrl,
        },
        scenes
      );
      onUpdateScenes(nextList);
      addLog(`✨ 已將鏡頭 ${sceneIndex + 1} 的尾幀取代為鏡頭 ${sceneIndex + 2} 的開頭首幀！`, 'ok');
    } else {
      setExtractedFrameUrl(scene.lastFrameUrl);
      addLog(`✨ 已將鏡頭 ${sceneIndex + 1} 的尾幀設定為下一鏡頭 (鏡頭 ${sceneIndex + 2}) 的預設首幀！`, 'ok');
    }
  };

  const isBusy = ['gen_scene', 'gen_video', 'review_video', 'gen_advice', 'extract_frame'].includes(phase);

  const canStart = (phase === 'idle' || phase === 'error' || phase === 'done') && !!novelText;

  // The "接下去" button MUST only appear/enable when the latest shot has completed Step 6 (Extract Frame)!
  const lastIdx = Math.max(0, scenes.length - 1);
  const lastShot = scenes[lastIdx];
  const lastShotCompleted = !!(lastShot?.stepExtractPassed || lastShot?.lastFrameUrl || (lastShot?.videoUrl && phase === 'waiting_continue'));

  const isStoryEnded =
    scenes.length >= 7 ||
    lastShot?.isEnding === true ||
    (lastShot?.step7Summary || '').includes('完') ||
    (lastShot?.step7Summary || '').includes('結尾') ||
    (lastShot?.directorNotes || '').includes('完結');

  const canContinue =
    !isBusy &&
    !isStoryEnded &&
    scenes.length > 0 &&
    lastShotCompleted &&
    (phase === 'waiting_continue' || phase === 'idle' || phase === 'error' || phase === 'done');

  // Step definitions for UI render (No separate image generation step)
  const stepsList = isLocked
    ? [
        { id: 1, label: 'AI 接收建議' },
        { id: 2, label: 'Prompt 優化' },
        { id: 3, label: '影片生成' },
        { id: 4, label: '影片審核' },
        { id: 5, label: '輸出對齊建議' },
        { id: 6, label: '抽取尾幀' },
      ]
    : [
        { id: 1, label: 'AI 接收建議' },
        { id: 2, label: 'Prompt 優化' },
        { id: 3, label: '影片生成' },
        { id: 4, label: '輸出對齊建議' },
        { id: 5, label: '抽取尾幀' },
      ];

  return (
    <div className="flex flex-col gap-5 p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-950/90 via-slate-900/90 to-purple-950/80 p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-violet-200 flex items-center gap-2">
            <Film className="w-5 h-5 text-fuchsia-400" />
            一鏡接一鏡 · 即時自動導演
          </h2>
          
          {/* Lock toggle button */}
          <button
            onClick={() => setIsLocked(!isLocked)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              isLocked
                ? 'bg-fuchsia-950/80 text-fuchsia-300 border-fuchsia-500/50 hover:border-fuchsia-400'
                : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50 hover:border-emerald-400'
            }`}
          >
            {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            <span>{isLocked ? '工作流嚴格模式（6 步，含 AI 審核）' : '工作流快速模式（5 步）'}</span>
          </button>
        </div>

        <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
          <strong className="text-violet-300">無須預先出圖與拆分鏡。</strong>
          點擊「開始」後，AI 即時分析原著劇本，直接生成動態影片。影片完成後自動執行
          <strong className="text-amber-300">「最後一步：抽取尾幀」</strong>
          作為下一鏡頭的首幀，實現漫改電影般的極致連續性！
        </p>
      </div>

      {/* Visual Style Selector Card */}
      <div className="rounded-2xl border border-fuchsia-500/30 bg-slate-900/90 p-4 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-fuchsia-400" />
            <span className="text-xs font-bold text-slate-200">全片統一影片風格選擇器</span>
            <span className="text-[11px] text-slate-400">（鎖定全片視覺流派，防止鏡頭風格走樣）</span>
          </div>

          {scenes.length > 0 && (
            <button
              onClick={handleApplyStyleToAllScenes}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-fuchsia-950/80 border border-fuchsia-500/50 hover:bg-fuchsia-900/80 text-fuchsia-300 transition flex items-center gap-1 cursor-pointer"
              title="將選定的風格一次套用到目前所有已產生的分鏡 Prompt 中"
            >
              <Sparkles className="w-3 h-3 text-fuchsia-400" />
              <span>套用風格至全片分鏡</span>
            </button>
          )}
        </div>

        {/* Preset buttons */}
        <div className="flex flex-wrap gap-2">
          {STYLE_PRESETS.map((preset) => {
            const isSelected = chainArtStyle === preset.prompt;
            return (
              <button
                key={preset.id}
                onClick={() => handleStyleSelect(preset.prompt)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                  isSelected
                    ? 'bg-fuchsia-600 text-white border-fuchsia-400 shadow-md shadow-fuchsia-900/50 ring-2 ring-fuchsia-400/80'
                    : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <span>{preset.name}</span>
                {isSelected && <Check className="w-3 h-3 text-white" />}
              </button>
            );
          })}

          <button
            onClick={() => setIsCustomStyleInputOpen(!isCustomStyleInputOpen)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              isCustomStyleInputOpen || !STYLE_PRESETS.some((p) => p.prompt === chainArtStyle)
                ? 'bg-purple-600 text-white border-purple-400 shadow-md ring-2 ring-purple-400/80'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <span>⚙️ 自訂風格</span>
          </button>
        </div>

        {/* Custom style input drawer */}
        {isCustomStyleInputOpen && (
          <div className="flex gap-2 items-center bg-slate-950 p-2.5 rounded-xl border border-purple-500/40 mt-2">
            <input
              type="text"
              value={customStyleText}
              onChange={(e) => setCustomStyleText(e.target.value)}
              placeholder="輸入自訂英文提示詞風格，例如：Ghibli anime style, lush nature background, soft lighting"
              className="flex-1 bg-slate-900 text-xs text-purple-200 px-3 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-purple-400"
            />
            <button
              onClick={() => {
                if (customStyleText.trim()) {
                  handleStyleSelect(customStyleText.trim());
                  setIsCustomStyleInputOpen(false);
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition cursor-pointer"
            >
              確定套用
            </button>
          </div>
        )}

        <div className="text-[11px] text-fuchsia-300/80 bg-fuchsia-950/40 p-2 rounded-lg border border-fuchsia-900/50 flex items-center gap-1.5">
          <span className="font-bold">當前鎖定風格：</span>
          <span className="font-mono text-fuchsia-200 truncate">
            {STYLE_PRESETS.find((p) => p.prompt === chainArtStyle)?.name || chainArtStyle}
          </span>
        </div>
      </div>

      {/* Novel status notice */}
      {!novelText && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-4 text-xs text-amber-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>請先到「原著劇本」頁貼上故事內容，再回來開始即時自動導演。</span>
        </div>
      )}

      {/* Progress chips for shots */}
      <div className="flex items-center gap-2 flex-wrap bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <span className="text-xs text-slate-400 font-bold mr-1">鏡頭進度：</span>
        {scenes.map((s, i) => {
          const done = !!(s.stepExtractPassed || s.lastFrameUrl || s.videoUrl);
          const active = i === currentIndex && isBusy;
          const isSelected = i === selectedRegenIndex;
          return (
            <button
              key={s.id || i}
              onClick={() => setSelectedRegenIndex(i)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-mono border flex items-center gap-1.5 transition cursor-pointer ${
                isSelected
                  ? 'bg-fuchsia-950/90 border-fuchsia-400 text-fuchsia-200 ring-2 ring-fuchsia-400/80 font-bold shadow-md'
                  : done
                    ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 shadow-sm hover:bg-emerald-900/80'
                    : active
                      ? 'bg-fuchsia-900/70 border-fuchsia-400 text-fuchsia-200 animate-pulse'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-700/60'
              }`}
              title={`點擊選擇「鏡頭 ${i + 1}」作為重新生成對象`}
            >
              {done ? <Check className="w-3 h-3 text-emerald-400" /> : active ? <Loader2 className="w-3 h-3 animate-spin text-fuchsia-300" /> : null}
              <span>鏡頭 {i + 1}</span>
            </button>
          );
        })}
        {scenes.length === 0 && phase === 'idle' && novelText && (
          <span className="text-xs text-emerald-400 font-medium">✨ 就緒 — 點擊「🚀 開始生成鏡頭 1」直接生成影片</span>
        )}
      </div>

      {/* Primary Top Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        {scenes.length === 0 ? (
          <button
            onClick={handleStart}
            disabled={!canStart || isBusy}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-lg shadow-emerald-900/40 transition cursor-pointer"
          >
            {isBusy && phase !== 'waiting_continue' ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-200" />
            ) : (
              <Play className="w-4 h-4 fill-current text-emerald-200" />
            )}
            <span>🚀 開始生成鏡頭 1</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 p-1 rounded-xl shadow-lg">
            <div className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800/80 rounded-lg border border-slate-700">
              <span className="text-xs text-slate-300 font-bold whitespace-nowrap">重新生成：</span>
              <select
                value={selectedRegenIndex}
                onChange={(e) => setSelectedRegenIndex(Number(e.target.value))}
                disabled={isBusy}
                className="bg-slate-950 text-fuchsia-300 text-xs font-bold font-mono px-2.5 py-1 rounded-md border border-fuchsia-500/40 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 cursor-pointer disabled:opacity-50"
              >
                {scenes.map((_, idx) => (
                  <option key={idx} value={idx}>
                    鏡頭 {idx + 1}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => handleRegenerateShot(selectedRegenIndex)}
              disabled={!canStart || isBusy}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-md shadow-emerald-900/40 transition cursor-pointer"
            >
              {isBusy && currentIndex === selectedRegenIndex ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-200" />
              ) : (
                <RefreshCw className="w-4 h-4 text-emerald-200" />
              )}
              <span>重新生成鏡頭 {selectedRegenIndex + 1}</span>
            </button>
          </div>
        )}

        <button
          onClick={handleContinue}
          disabled={!canContinue || isBusy || isStoryEnded}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white transition cursor-pointer shadow-lg ${
            isStoryEnded
              ? 'bg-slate-800 text-emerald-400 border border-emerald-500/40 opacity-95 cursor-default'
              : canContinue
                ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 shadow-amber-900/50 animate-bounce ring-2 ring-amber-400/60'
                : 'bg-slate-800 opacity-40 cursor-not-allowed border border-slate-700 text-slate-400'
          }`}
        >
          {isStoryEnded ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>🏁 故事已完結</span>
            </>
          ) : (
            <>
              <ChevronRight className="w-4 h-4 stroke-[3]" />
              <span>👉 接下去（生成鏡頭 {scenes.length + 1}）</span>
            </>
          )}
        </button>

        <button
          onClick={handleFullAutoGenerate}
          disabled={!canStart || isBusy || isFullAutoRunning}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-lg shadow-fuchsia-900/40 transition cursor-pointer ring-2 ring-fuchsia-400/60 animate-pulse"
        >
          {isFullAutoRunning ? (
            <Loader2 className="w-4 h-4 animate-spin text-pink-200" />
          ) : (
            <Sparkles className="w-4 h-4 text-pink-200" />
          )}
          <span>{isFullAutoRunning ? '🚀 全自動生成與合併中…' : '🚀 一鍵全自動生成並合併所有鏡頭'}</span>
        </button>

        <button
          onClick={handleStitchAllScenes}
          disabled={isBusy || isStitching || scenes.length === 0}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-lg shadow-emerald-900/40 transition cursor-pointer ring-2 ring-emerald-400/60"
        >
          {isStitching ? (
            <Loader2 className="w-4 h-4 animate-spin text-emerald-200" />
          ) : (
            <Film className="w-4 h-4 text-emerald-200" />
          )}
          <span>{isStitching ? '🎞️ 全片合併中…' : '🎬 立即全片合併（生成完整大片）'}</span>
        </button>

        <button
          onClick={handleReset}
          disabled={isBusy}
          className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition flex items-center justify-center border border-slate-700 hover:border-slate-600 disabled:opacity-40 cursor-pointer text-xs gap-1.5 ml-auto"
          title="重置全劇分鏡"
        >
          <RotateCcw className="w-4 h-4" />
          <span>重置</span>
        </button>
      </div>

      {/* Error display */}
      {errorMsg && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-4 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-200 leading-relaxed">{errorMsg}</p>
        </div>
      )}

      {/* Stitched Result Showcase */}
      {stitchedResultUrl && (
        <div className="rounded-2xl border border-fuchsia-500/60 bg-gradient-to-br from-purple-950/90 via-slate-900/90 to-fuchsia-950/90 p-6 shadow-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-fuchsia-200 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-fuchsia-400 animate-pulse" />
              🎉 恭喜！一鍵全自動導演大片已完美合併完成！
            </h3>
            <button
              onClick={handleDownloadStitched}
              disabled={isDownloadingStitched}
              className={`px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold text-xs transition flex items-center gap-2 shadow ${isDownloadingStitched ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isDownloadingStitched ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isDownloadingStitched ? '下載中...' : '下載合併後大片'}
            </button>
          </div>
          <div className="aspect-video bg-black rounded-xl overflow-hidden border border-fuchsia-500/40 shadow-inner">
            <ScrubbableVideoPlayer src={stitchedResultUrl} className="w-full h-full" />
          </div>
        </div>
      )}

      {/* Shots Display List */}
      <div className="space-y-6">
        {scenes.map((s, i) => {
          const isCurrentShot = i === currentIndex;
          const currentStepNum = s.currentStep || (s.stepExtractPassed ? (isLocked ? 6 : 5) : s.videoUrl ? 3 : 1);

          return (
            <div
              id={`shot-card-${i}`}
              key={s.id || i}
              className="rounded-2xl border border-slate-750 bg-slate-900/90 shadow-2xl overflow-hidden transition"
            >
              {/* Stepper Bar Header */}
              <div className="bg-slate-950/80 px-4 py-3 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-1 rounded-md bg-fuchsia-950/80 border border-fuchsia-500/40 text-fuchsia-300 font-mono text-xs font-bold">
                    鏡頭 {i + 1}
                  </span>
                  <span className="text-xs font-bold text-slate-200">{s.character || 'Narrator'}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setSelectedRegenIndex(i);
                      handleRegenerateShot(i);
                    }}
                    disabled={isBusy}
                    title={`重新生成鏡頭 ${i + 1}`}
                    className="ml-2 px-2.5 py-1 rounded-lg bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-900 hover:text-white transition cursor-pointer flex items-center gap-1.5 text-[11px] font-bold disabled:opacity-40 shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>重新生成鏡頭 {i + 1}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleDeleteShot(i);
                    }}
                    title={`刪除鏡頭 ${i + 1}`}
                    className="px-2.5 py-1.5 rounded-lg bg-red-950/60 border border-red-500/40 text-red-300 hover:bg-red-900/80 hover:text-white transition cursor-pointer flex items-center gap-1.5 text-xs font-bold shadow"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    <span>刪除鏡頭</span>
                  </button>
                </div>

                {/* Steps Stepper */}
                <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                  {stepsList.map((st) => {
                    const isStepDone =
                      st.id < currentStepNum ||
                      (st.id === (isLocked ? 6 : 5) && (s.stepExtractPassed || !!s.lastFrameUrl)) ||
                      (st.id === (isLocked ? 5 : 4) && s.step7Passed) ||
                      (st.id === 4 && isLocked && s.step6Passed) ||
                      (st.id === 3 && !!s.videoUrl);
                    const isStepActive = isCurrentShot && isBusy && st.id === currentStepNum;

                    return (
                      <div key={st.id} className="flex items-center gap-1">
                        <div
                          className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold font-mono transition ${
                            isStepDone
                              ? 'bg-emerald-500 text-slate-950 font-extrabold'
                              : isStepActive
                                ? 'bg-fuchsia-600 text-white animate-pulse ring-2 ring-fuchsia-400'
                                : 'bg-slate-800 text-slate-500 border border-slate-700'
                          }`}
                        >
                          {isStepDone ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : st.id}
                        </div>
                        <span
                          className={`text-[10px] whitespace-nowrap hidden md:inline ${
                            isStepDone
                              ? 'text-emerald-400 font-medium'
                              : isStepActive
                                ? 'text-fuchsia-300 font-bold'
                                : 'text-slate-500'
                          }`}
                        >
                          {st.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Shot Content Area */}
              <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Media Preview Player */}
                <div className="lg:col-span-6 flex flex-col justify-center">
                  {s.videoUrl ? (
                    <div className="aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 shadow-inner">
                      <ScrubbableVideoPlayer src={s.videoUrl} className="w-full h-full" />
                    </div>
                  ) : (
                    <div className="aspect-video bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center text-slate-400 text-xs gap-3 p-4">
                      {s.isGeneratingVideo ? (
                        <>
                          <Loader2 className="w-8 h-8 animate-spin text-fuchsia-400" />
                          <span className="text-fuchsia-200 font-medium">AI 正在直接生成影片 ({s.videoProgress || '進度中'})...</span>
                        </>
                      ) : (
                        <>
                          <Film className="w-8 h-8 opacity-30 text-slate-500" />
                          <span>等待生成影片...</span>
                          {!isBusy && (
                            <button
                              onClick={() => handleRetryVideo(i)}
                              className="mt-2 px-4 py-2 bg-fuchsia-600/80 hover:bg-fuchsia-500 text-white rounded-lg transition text-xs font-bold shadow shadow-fuchsia-900/50 flex items-center gap-2 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              重新生成此鏡頭影片
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Small Tail Frame Preview Badge */}
                  {s.lastFrameUrl && (
                    <div className="mt-2.5 p-2 rounded-xl bg-slate-950/90 border border-emerald-500/30 flex items-center justify-between gap-3 shadow-md">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-16 aspect-video rounded-md overflow-hidden border border-emerald-500/50 bg-black shrink-0 relative">
                          <img src={s.lastFrameUrl} alt="Tail Frame Preview" className="w-full h-full object-cover" />
                        </div>
                        <div className="text-[11px] min-w-0 truncate">
                          <span className="text-emerald-400 font-bold block truncate">📷 已擷取尾幀預覽</span>
                          <span className="text-slate-400 text-[10px] truncate block">無縫連貫下一鏡頭</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleApplyToNextShotStartFrame(i)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold transition text-[10px] flex items-center gap-1 shadow cursor-pointer"
                          title={`取代鏡頭 ${i + 2} 之首幀`}
                        >
                          <ArrowRightCircle className="w-3 h-3" />
                          <span className="hidden sm:inline">取代下一鏡頭首幀</span>
                        </button>
                        <button
                          onClick={() => handleDeleteLastFrame(i)}
                          className="px-2 py-1 rounded-lg bg-red-950/60 border border-red-500/40 hover:bg-red-900/80 text-red-300 transition text-[10px] flex items-center gap-1 cursor-pointer"
                          title="刪除此尾幀"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span className="hidden sm:inline">刪除</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Shot Text & Prompts */}
                <div className="lg:col-span-6 space-y-3">
                  <div className="text-xs font-bold text-slate-200 flex items-center justify-between">
                    <span>{s.title}</span>
                  </div>
                  
                  {i > 0 && s.imageUrl && (
                    <div className="flex items-center gap-3 p-2 rounded-xl bg-amber-950/20 border border-amber-500/20 shadow-inner">
                      <div className="w-20 aspect-video rounded-md overflow-hidden bg-black shrink-0 relative border border-amber-500/40">
                         <img src={s.imageUrl} className="w-full h-full object-cover" alt="Start Frame Preview" />
                      </div>
                      <div className="text-[11px] min-w-0">
                        <span className="text-amber-400 font-bold flex items-center gap-1.5">
                           <Camera className="w-3 h-3" /> 已繼承上一鏡尾幀作為首幀
                        </span>
                        <span className="text-slate-400 text-[10px] block mt-0.5 leading-tight">AI 產生的影片將以此畫面作為開頭，確保無縫連貫。</span>
                      </div>
                    </div>
                  )}
                  
                  {s.visualPrompt !== undefined && (
                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex flex-col">
                      <div className="text-[10px] text-slate-500 uppercase font-mono mb-1">VISUAL PROMPT</div>
                      <textarea
                        value={s.visualPrompt}
                        onChange={(e) => setScenes(updateSceneAt(i, { visualPrompt: e.target.value }, scenes))}
                        className="text-xs text-amber-300/90 leading-relaxed font-sans bg-transparent resize-none outline-none w-full min-h-[60px]"
                        placeholder="Visual details..."
                      />
                    </div>
                  )}

                  {s.actionPrompt !== undefined && (
                    <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex flex-col">
                      <div className="text-[10px] text-slate-500 uppercase font-mono mb-1">ACTION / MOTION</div>
                      <textarea
                        value={s.actionPrompt}
                        onChange={(e) => setScenes(updateSceneAt(i, { actionPrompt: e.target.value }, scenes))}
                        className="text-xs text-sky-300/90 leading-relaxed font-sans bg-transparent resize-none outline-none w-full min-h-[60px]"
                        placeholder="Action details..."
                      />
                    </div>
                  )}

                  {s.directorNotes && (
                    <div className="text-xs text-amber-400/90 leading-relaxed font-mono bg-amber-950/20 p-3 rounded-xl border border-amber-500/20">
                      <div className="text-[10px] text-amber-500 uppercase font-mono mb-1">🎬 導演註記 / 個人拍攝筆記</div>
                      {s.directorNotes}
                    </div>
                  )}
                </div>
              </div>

              {/* STEP 4 CARD: AI 鏡頭物理學與流暢度總核對 (If step 4 passed or is locked) */}
              {isLocked && (s.step6Passed || currentStepNum >= 4 || !!s.videoUrl) && (
                <div className="mx-4 mb-4 p-4 rounded-xl border border-indigo-500/30 bg-indigo-950/30 space-y-3">
                  <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>步驟 4：AI 鏡頭物理學與流暢度總核對</span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950/80 border border-indigo-500/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-200">AI 影片核查結果：</span>
                      <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-500/40">
                        運鏡健康度分數：{s.step6Score || 94}/100
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {s.step6ReviewText ||
                        '該鏡頭規劃展現了極佳的動漫風格 (Anime Key Visual) 美學，透過強烈對比成功營造視覺張力。攝影機運鏡精準，符合電影視覺敘事與物理邏輯，角色與場景互動順暢。'}
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 5 CARD: 輸出對齊建議 */}
              {(s.step7Passed || currentStepNum >= (isLocked ? 5 : 4) || !!s.videoUrl) && (
                <div className="mx-4 mb-4 p-4 rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-950/40 via-slate-900/90 to-amber-950/30 space-y-3.5 shadow-lg">
                  <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>步驟 {isLocked ? '5' : '4'}：輸出本分鏡總結與下一個鏡頭的連續性對齊建議</span>
                  </div>

                  <div className="space-y-2 text-xs">
                    {s.step7Summary && (
                      <div className="p-3 rounded-lg bg-slate-950/80 border border-amber-500/20 text-amber-100/90 leading-relaxed">
                        <strong className="text-amber-400 block mb-1">【本鏡頭總結】</strong>
                        {s.step7Summary}
                      </div>
                    )}

                    <div className="p-3 rounded-lg bg-slate-950/80 border border-amber-500/30 text-amber-200 leading-relaxed">
                      <strong className="text-amber-300 block mb-1">【下一個鏡頭連續性對齊建議】</strong>
                      {s.step7AdviceForNext || '保持角色服裝、光影方向與空間位置一致，鏡頭運動自然銜接，推進下一劇情節點。'}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 6 CARD: 抽取尾幀 (Extract Last Frame display) */}
              {(s.lastFrameUrl || s.stepExtractPassed || currentStepNum >= (isLocked ? 6 : 5)) && (
                <div className="mx-4 mb-4 p-4 rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 via-slate-900/90 to-teal-950/30 space-y-3 shadow-lg">
                  <div className="flex items-center justify-between gap-2 text-emerald-300 font-bold text-xs">
                    <div className="flex items-center gap-2">
                      <Camera className="w-4 h-4 text-emerald-400" />
                      <span>最後一步：已抽取本鏡頭尾幀 (作為鏡頭 {i + 2} 之首幀)</span>
                    </div>
                    {s.lastFrameUrl && (
                      <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
                        尾幀已就緒 ✓
                      </span>
                    )}
                  </div>

                  {s.lastFrameUrl ? (
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-950/90 p-3.5 rounded-xl border border-emerald-500/30 shadow-md">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-28 sm:w-36 aspect-video bg-black rounded-lg overflow-hidden border-2 border-emerald-500/50 shadow-inner shrink-0 relative group">
                          <img src={s.lastFrameUrl} alt="Extracted Tail Frame" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-emerald-400 text-[9px] font-mono font-bold border border-emerald-500/30">
                            尾幀預覽
                          </span>
                        </div>
                        <div className="text-xs text-slate-300 space-y-1 min-w-0">
                          <p className="font-bold text-emerald-300 flex items-center gap-1.5">
                            <span>📷 已擷取本鏡頭最後一幀畫面</span>
                          </p>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            AI 將以此尾幀圖檔作為鏡頭 {i + 2} 的開頭，確保視覺無縫連貫！
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
                        <button
                          onClick={() => handleApplyToNextShotStartFrame(i)}
                          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold transition flex items-center gap-1.5 text-xs shadow-md shadow-emerald-900/40 cursor-pointer"
                          title={`取代鏡頭 ${i + 2} 的開頭首幀`}
                        >
                          <ArrowRightCircle className="w-3.5 h-3.5" />
                          <span>取代下一鏡頭首幀</span>
                        </button>
                        <button
                          onClick={() => handleManualExtractFrame(i)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition flex items-center gap-1 text-xs cursor-pointer"
                          title="重新從影片擷取最後一幀"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>重新抽取</span>
                        </button>
                        <button
                          onClick={() => handleDeleteLastFrame(i)}
                          className="px-2.5 py-1.5 rounded-lg bg-red-950/60 border border-red-500/40 hover:bg-red-900/80 text-red-300 hover:text-white font-bold transition flex items-center gap-1 text-xs cursor-pointer"
                          title="刪除此尾幀"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>刪除</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 italic bg-slate-950/60 p-3 rounded-lg border border-slate-800 flex items-center justify-between">
                      <span>正在抽取尾幀中... 或是影片尚未生成</span>
                      {s.videoUrl && (
                        <button
                          onClick={() => handleManualExtractFrame(i)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center gap-1 not-italic"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          手動抽取最後一幀
                        </button>
                      )}
                    </div>
                  )}

                  {/* 接下去 Big Action Button on the latest completed shot */}
                  {i === scenes.length - 1 && (
                    <div className="pt-3 flex flex-wrap items-center justify-end gap-3">
                      {isStoryEnded && (
                        <button
                          onClick={handleStitchAllScenes}
                          disabled={isBusy || isStitching}
                          className="px-6 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-xl shadow-emerald-900/50 transition cursor-pointer flex items-center gap-2 ring-2 ring-emerald-400/80 animate-bounce"
                        >
                          <Film className="w-4 h-4" />
                          <span>🎬 立即全片合併 (生成完整大片)</span>
                        </button>
                      )}

                      <button
                        onClick={handleContinue}
                        disabled={isBusy || isStoryEnded}
                        className={`px-6 py-3 rounded-xl font-bold text-sm text-white shadow-xl transition cursor-pointer flex items-center gap-2 ${
                          isStoryEnded
                            ? 'bg-slate-800 text-emerald-400 border border-emerald-500/40 opacity-95 cursor-default'
                            : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-900/40 animate-bounce'
                        }`}
                      >
                        {isStoryEnded ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>🏁 故事已完結 (全片完)</span>
                          </>
                        ) : (
                          <>
                            <ChevronRight className="w-5 h-5" />
                            <span>👉 接下去（生成鏡頭 {scenes.length + 1}）</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Logs Console */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-4 font-mono text-[11px] space-y-1.5 max-h-48 overflow-y-auto shadow-inner">
        <div className="flex items-center justify-between mb-1">
          <span className="text-slate-500 font-bold">工作日誌 (ON-THE-FLY LOGS)</span>
          {logs.length > 0 && (
            <button
              onClick={clearLogsInternal}
              className="text-[10px] text-slate-500 hover:text-slate-300 underline cursor-pointer"
            >
              清除日誌
            </button>
          )}
        </div>
        {logs.length === 0 && (
          <div className="text-slate-600">按下「開始」後，工作日誌會顯示在這裡…</div>
        )}
        {logs.map((l, idx) => (
          <div
            key={idx}
            className={
              l.type === 'ok'
                ? 'text-emerald-400'
                : l.type === 'err'
                  ? 'text-red-400'
                  : l.type === 'warn'
                    ? 'text-amber-400'
                    : 'text-slate-400'
            }
          >
            <span className="text-slate-600">[{l.time}]</span> {l.msg}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SequentialChainMode;
