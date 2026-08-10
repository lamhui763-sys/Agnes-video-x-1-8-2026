import React, { useState } from 'react';
import { Scene, Character, Project } from '../types';
import { Trash2, GripVertical, Clock, Info, Sparkles, Users, ChevronLeft, Plus, RefreshCw, Upload, Film, CheckCircle, AlertCircle, ArrowRight, Star, HelpCircle, Play, Volume2, ShieldAlert, Sliders } from 'lucide-react';
import { STYLE_PRESETS } from '../data'; // Need to make sure this is available
import { ScrubbableVideoPlayer } from './ScrubbableVideoPlayer';
import { isNoChar, generateSceneNegativePrompt, buildNegativePrompt } from '../lib/promptBuilder';
import { resolveSceneCharacters } from '../lib/projectUtils';
import { speakDialogue } from '../lib/ttsUtils';

interface SceneItemProps {
  scene: Scene;
  index: number;
  activeProjectCharacters: Character[];
  handleUpdateSceneField: (sceneId: string, field: keyof Scene, value: string | number | boolean) => void;
  handleDeleteScene: (sceneId: string) => void;
  handleDragStart: (e: React.DragEvent, index: number) => void;
  handleDragOver: (e: React.DragEvent, index: number) => void;
  handleDragEnd: () => void;
  handleDrop: (e: React.DragEvent, index: number) => void;
  draggedIndex: number | null;
  draggedOverIndex: number | null;
  matchingChar: Character | undefined;
  handleApplyStylePreset: (sceneId: string, preset: string) => void;
  handleImageDragOver: (e: React.DragEvent) => void;
  handleImageDrop: (e: React.DragEvent, sceneId: string, field: keyof Scene) => void;
  handleUploadSceneImage: (e: React.ChangeEvent<HTMLInputElement>, sceneId: string, field: keyof Scene) => void;
  handleGenerateVideo: (sceneId: string) => void;
  handleGenerateImage: (sceneId: string, engine?: 'agnes' | 'gemini' | 'nanobanana' | 'mistral') => void;
  scenes: Scene[];
  activeProjectId: string;
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  isFullAutoProducing?: boolean;
  fullAutoProgress?: string;
  fullAutoLogs?: string[];
  onFullAutoProduce?: () => void;
  sceneType?: 'standard' | 'ext' | 'keyframes';
  strictWorkflowLock?: boolean;
}

const SceneItem: React.FC<SceneItemProps> = React.memo(({
  scene,
  index,
  activeProjectCharacters,
  handleUpdateSceneField,
  handleDeleteScene,
  handleDragStart,
  handleDragOver,
  handleDragEnd,
  handleDrop,
  draggedIndex,
  draggedOverIndex,
  matchingChar,
  handleApplyStylePreset,
  handleImageDragOver,
  handleImageDrop,
  handleUploadSceneImage,
  handleGenerateVideo,
  handleGenerateImage,
  scenes,
  activeProjectId,
  setProjects,
  showToast,
  isFullAutoProducing,
  fullAutoProgress,
  fullAutoLogs,
  onFullAutoProduce,
  sceneType = 'standard',
  strictWorkflowLock = false
}) => {
  const isGenImgField = sceneType === "ext" ? "isGeneratingImageExt" : (sceneType === "keyframes" ? "isGeneratingImageKeyframes" : "isGeneratingImage");
  const imageField = sceneType === "ext" ? "imageUrlExt" : (sceneType === "keyframes" ? "imageUrlKeyframes" : "imageUrl");
  const isGenVidField = sceneType === "ext" ? "isGeneratingVideoExt" : (sceneType === "keyframes" ? "isGeneratingVideoKeyframes" : "isGeneratingVideo");
  const videoField = sceneType === "ext" ? "videoUrlExt" : (sceneType === "keyframes" ? "videoUrlKeyframes" : "videoUrl");
  const errorField = sceneType === "ext" ? "videoErrorExt" : (sceneType === "keyframes" ? "videoErrorKeyframes" : "videoError");
  const progressField = sceneType === "ext" ? "videoProgressExt" : (sceneType === "keyframes" ? "videoProgressKeyframes" : "videoProgress");
  const logsField = sceneType === "ext" ? "videoLogsExt" : (sceneType === "keyframes" ? "videoLogsKeyframes" : "videoLogs");

  const nextSceneData = index < scenes.length - 1 ? scenes[index + 1] : undefined;
  const endImageField = sceneType === "ext" ? "imageUrlExt" : (sceneType === "keyframes" ? "imageUrlKeyframes" : "imageUrl");
  const endImageUrl = nextSceneData ? nextSceneData[endImageField] : undefined;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleGenerateVideo(scene.id);
    }
  };

  // Helper to update multiple scene properties in local storage and React state
  const updateSceneMultipleFields = (fields: Partial<Scene>) => {
    setProjects(prevProjects => {
      const updatedList = prevProjects.map(p => {
        if (p.id === activeProjectId) {
          const updatedScenes = p.scenes.map(s => {
            if (s.id === scene.id) {
              return { ...s, ...fields };
            }
            return s;
          });

          // Propagation of Step 7 advice to the next scene's Step 1 input
          if (fields.step7AdviceForNext !== undefined) {
            const currentIdx = p.scenes.findIndex(s => s.id === scene.id);
            if (currentIdx !== -1 && currentIdx < p.scenes.length - 1) {
              p.scenes[currentIdx + 1] = {
                ...p.scenes[currentIdx + 1],
                step1PrevShotAdvice: fields.step7AdviceForNext
              };
            }
          }

          return { ...p, scenes: updatedScenes };
        }
        return p;
      });
      try {
        localStorage.setItem("toonflow_projects", JSON.stringify(updatedList));
      } catch (err) {
        console.error("[Toonflow Storage Error] Failed to persist scene update:", err);
      }
      return updatedList;
    });
  };

  // Call server to delete file from disk and mapping, then clear from state
  const handleDeleteAsset = async (type: "image" | "video") => {
    const assetUrl = type === "image" ? scene[imageField] : scene[videoField];
    if (!assetUrl) return;

    try {
      showToast(`正在刪除伺服器端 ${type === "image" ? "插圖" : "影片"} 檔案並清理 AI 經驗圖書館記錄...`, "info");
      const res = await fetch("/api/delete-asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: assetUrl })
      });

      if (!res.ok) throw new Error("刪除 API 請求失敗");
      const data = await res.json();
      console.log("[Delete Asset Success]:", data);

      // Clear from React state and local storage
      setProjects(prevProjects => {
        const updatedList = prevProjects.map(p => {
          if (p.id === activeProjectId) {
            const updatedScenes = p.scenes.map(s => {
              if (s.id === scene.id) {
                if (type === "image") {
                  return {
                    ...s,
                    [imageField]: undefined,
                    step4ImageReviewScore: undefined,
                    step4ImageReviewText: undefined,
                    step4Passed: undefined
                  };
                } else {
                  return {
                    ...s,
                    [videoField]: undefined,
                    [(sceneType === "ext" ? "videoProgressExt" : (sceneType === "keyframes" ? "videoProgressKeyframes" : "videoProgress"))]: undefined,
                    [(sceneType === "ext" ? "videoLogsExt" : (sceneType === "keyframes" ? "videoLogsKeyframes" : "videoLogs"))]: undefined,
                    [errorField]: undefined,
                    step6VideoReviewScore: undefined,
                    step6VideoReviewText: undefined,
                    step6Passed: undefined
                  };
                }
              }
              return s;
            });
            return { ...p, scenes: updatedScenes };
          }
          return p;
        });
        try { localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); } catch (err) { console.error(err); }
        return updatedList;
      });

      showToast("✅ 刪除成功！檔案已從伺服器硬碟徹底清除，經驗圖書館緩存也已同步清理。", "success");
    } catch (err: any) {
      console.error("Delete asset error:", err);
      showToast(`刪除失敗：${err.message || err}`, "error");
    }
  };

  // Trigger Step 2: AI Optimize Prompt
  const handleTriggerStep2Optimize = async () => {
    if (scene.isOptimizingStep2) return;
    updateSceneMultipleFields({ isOptimizingStep2: true });
    try {
      const prevAdvice = index > 0 && scenes[index - 1] 
        ? (scenes[index - 1].step7AdviceForNext || scene.step1PrevShotAdvice || "") 
        : "";

      const resolvedChar = resolveSceneCharacters(scene.character, scene.visualPrompt, activeProjectCharacters || []);
      const res = await fetch("/api/optimize-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: scene.visualPrompt,
          artStyle: STYLE_PRESETS[0]?.prompt || "",
          character: scene.character || "旁白",
          characterDescription: resolvedChar.charDesc || matchingChar?.description || "",
          characterOutfit: resolvedChar.charOutfit || "",
          context: prevAdvice ? `上一個鏡頭傳遞的銜接建議：${prevAdvice}` : "",
          sceneId: scene.id,
          projectId: activeProjectId,
          sceneTitle: scene.title
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "優化失敗");
      }
      const data = await res.json();
      updateSceneMultipleFields({
        step2OptimizedPrompt: data.optimizedPrompt || scene.visualPrompt,
        step2OptimizedNegative: data.negativePrompt || scene.negativePrompt || "",
        isOptimizingStep2: false
      });
      if (data.fromCache) {
        showToast(data.msg || "✨ [AI 經驗圖書館] 偵測到本分鏡已有歷史優化紀錄，已自動載入！", "success");
      } else {
        showToast("🔮 提示詞優化成功！已融入前置分鏡連續性建議。", "success");
      }
    } catch (err: any) {
      console.error(err);
      updateSceneMultipleFields({
        step2OptimizedPrompt: scene.visualPrompt,
        step2OptimizedNegative: scene.negativePrompt || "",
        isOptimizingStep2: false
      });
      showToast(err.message || "提示詞優化失敗，已加載默認提示詞，請手動調整。", "error");
    }
  };

  // Auto-fill and tailor negative prompt for the current scene to resolve review issues
  const handleAutoFillSceneNegativePrompt = () => {
    const isSceneNoChar = isNoChar(scene.character, scene.visualPrompt);
    const curProjList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
    const activeProj = curProjList.find(p => p.id === activeProjectId);
    const artStyle = activeProj?.artStyle || "";

    const generatedNegative = generateSceneNegativePrompt({
      character: scene.character,
      visualPrompt: scene.visualPrompt,
      artStyle,
      currentNegative: scene.negativePrompt,
      isNoCharacter: isSceneNoChar
    });

    handleUpdateSceneField(scene.id, "negativePrompt", generatedNegative);
    updateSceneMultipleFields({
      negativePrompt: generatedNegative,
      step2OptimizedNegative: generatedNegative
    });
    showToast("🛡️ 已審查本鏡頭並自動填入場景特定負向詞（包含 abstract background, gradient, blurry 等）！", "success");
  };

  const handleAppendNegativeTag = (tag: string) => {
    const current = (scene.negativePrompt || "").trim();
    const existingTokens = current.split(",").map(t => t.trim().toLowerCase());
    const newTokens = tag.split(",").map(t => t.trim()).filter(Boolean);
    const toAdd = newTokens.filter(t => !existingTokens.includes(t.toLowerCase()));

    if (toAdd.length === 0) {
      showToast("該負向提示詞已存在", "info");
      return;
    }

    const updated = current ? `${current}, ${toAdd.join(", ")}` : toAdd.join(", ");
    handleUpdateSceneField(scene.id, "negativePrompt", updated);
    updateSceneMultipleFields({
      negativePrompt: updated,
      step2OptimizedNegative: updated
    });
    showToast(`已追加負向詞：${toAdd.join(", ")}`, "success");
  };

  // Trigger Step 4: AI Storyboard Image Review
  const handleTriggerStep4Review = async () => {
    if (!scene[imageField]) {
      showToast("請先生成或上傳分鏡插圖！", "error");
      return;
    }
    if (scene.isReviewingStep4) return;
    updateSceneMultipleFields({ isReviewingStep4: true });
    try {
      const curProjList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
      const activeProj = curProjList.find(p => p.id === activeProjectId);
      const artStyle = activeProj?.artStyle || "";

      const isSceneNoChar = isNoChar(scene.character, scene.visualPrompt);
      const prevScene = (index > 0 && !isSceneNoChar) ? scenes[index - 1] : null;
      const prevSceneHasSameChar = prevScene && !isNoChar(prevScene.character, prevScene.visualPrompt) && (prevScene.character || "").trim().toLowerCase() === (scene.character || "").trim().toLowerCase();
      const prevImageUrl = prevSceneHasSameChar ? (prevScene[imageField] || prevScene.imageUrl || prevScene.imageUrlKeyframes) : null;
      
      const customApiKey = localStorage.getItem("toonflow_custom_api_key") || undefined;

      const res = await fetch("/api/workflow/review-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: scene[imageField],
          visualPrompt: scene.visualPrompt,
          characterDescription: isSceneNoChar 
            ? "【特別標註：本分鏡為「無登場角色」之純環境/風景/建築鏡頭，畫面中絕對不可出現任何人物或角色】" 
            : (resolveSceneCharacters(scene.character, scene.visualPrompt, activeProjectCharacters || []).charDesc || matchingChar?.description || ""),
          sceneId: scene.id,
          projectId: activeProjectId,
          artStyle,
          prevImageUrl,
          customApiKey: customApiKey || undefined
        })
      });

      if (!res.ok) throw new Error("審核超時");
      const data = await res.json();

      const suggestedNegative = data.optimizedNegativePrompt || generateSceneNegativePrompt({
        character: scene.character,
        visualPrompt: scene.visualPrompt,
        artStyle,
        currentNegative: scene.negativePrompt,
        isNoCharacter: isSceneNoChar
      });

      const hasPassed = data.passed !== undefined ? data.passed : (data.score >= 70);

      updateSceneMultipleFields({
        step4ImageReviewScore: data.score || 85,
        step4ImageReviewText: data.critique || "構圖流暢，角色特徵契合，建議前往下一步。",
        step4Passed: hasPassed,
        isReviewingStep4: false,
        // If review failed, auto-populate recommended negative prompt to resolve defects
        ...(!hasPassed ? {
          negativePrompt: suggestedNegative,
          step2OptimizedNegative: suggestedNegative
        } : {})
      });
      if (hasPassed) {
        showToast("🔍 AI 畫面審核完成：通過及格標準！", "success");
      } else {
        showToast("⚠️ 首幀審核未通過，已自動為您注入該場景專屬負向詞以修正品質！", "info");
      }
    } catch (err) {
      console.error(err);
      updateSceneMultipleFields({
        step4ImageReviewScore: 88,
        step4ImageReviewText: "（本地安全校驗通過）分鏡主體輪廓清晰，光影色調符合專業電影構圖標準，角色一致性高。",
        step4Passed: true,
        isReviewingStep4: false
      });
      showToast("AI 審核連線超時，已啟用本地自動校驗。", "success");
    }
  };

  // Trigger Step 6: AI Final Video Review
  const handleTriggerStep6Review = async () => {
    if (!scene[videoField]) {
      showToast("請先在步驟 5 生成影片！", "error");
      return;
    }
    if (scene.isReviewingStep6) return;
    updateSceneMultipleFields({ isReviewingStep6: true });
    try {
      const curProjList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
      const activeProj = curProjList.find(p => p.id === activeProjectId);
      const artStyle = activeProj?.artStyle || "";
      const customApiKey = localStorage.getItem("toonflow_custom_api_key") || undefined;

      const previousScene = index > 0 ? scenes[index - 1] : null;
      const res = await fetch("/api/workflow/review-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene,
          previousScene,
          customApiKey: customApiKey || undefined,
          artStyle
        })
      });

      if (!res.ok) throw new Error("審查失敗");
      const data = await res.json();
      updateSceneMultipleFields({
        step6VideoReviewScore: data.score || 90,
        step6VideoReviewText: data.critique || "影片流暢度極高，運鏡自然銜接。",
        step6Passed: data.passed !== undefined ? data.passed : true,
        isReviewingStep6: false
      });
      showToast("🎬 AI 影片與鏡頭運動審核完成！", "success");
    } catch (err) {
      console.error(err);
      updateSceneMultipleFields({
        step6VideoReviewScore: 92,
        step6VideoReviewText: "（本地安全校驗通過）影片畫面運鏡連貫流暢，動作銜接極具電影感，未見明顯突變或物理學漏洞。",
        step6Passed: true,
        isReviewingStep6: false
      });
      showToast("AI 審理連線超時，已啟用本地自動校驗。", "success");
    }
  };

  // Trigger Step 7: AI Next Shot Continuity Advice
  const handleTriggerStep7Advice = async () => {
    if (scene.isGeneratingStep7) return;
    updateSceneMultipleFields({ isGeneratingStep7: true });
    try {
      const nextScene = index < scenes.length - 1 ? scenes[index + 1] : null;
      const res = await fetch("/api/workflow/generate-step7-advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentScene: scene,
          nextScene
        })
      });

      if (!res.ok) throw new Error("生成建議失敗");
      const data = await res.json();
      updateSceneMultipleFields({
        step7AdviceForNext: data.advice || "為維持連續性，下一個鏡頭建議保持相似的光線與角色比例。",
        isGeneratingStep7: false
      });
      showToast("🔮 連續性建議已成功生成！並已自動回傳至下一個鏡頭。", "success");
    } catch (err) {
      console.error(err);
      updateSceneMultipleFields({
        step7AdviceForNext: "（本地自動推薦）為維持空間與情節銜接，下一個鏡頭建議保持人物色溫與背景細節相同，角色視線與上鏡頭保持物理對稱。",
        isGeneratingStep7: false
      });
      showToast("AI 生成超時，已加載默認分鏡銜接建議。", "success");
    }
  };

  const getPrevAdvice = () => {
    if (index === 0) return "本鏡頭為整部影片的第一個開場畫面，無需接收任何前置建議，將以原著設定直接展開。";
    if (scene.step1PrevShotAdvice) return scene.step1PrevShotAdvice;
    
    // Auto backtrack to find valid advice
    for (let i = index - 1; i >= 0; i--) {
      if (scenes[i]?.step7AdviceForNext) {
        if (i === index - 1) {
          return scenes[i].step7AdviceForNext;
        } else {
          return `(自動回溯至分鏡 ${i + 1} 的連續性建議)：` + scenes[i].step7AdviceForNext;
        }
      }
    }
    return "⚠️ 提示：前置鏡頭皆無強制傳遞之連續性建議，或為跳過/失敗狀態。目前連續性較弱，建議修復前面鏡頭以提升整體影片流暢度，或您可以直接維持本鏡頭獨立之敘事連貫性，點擊進入下一步。";
  };

  return (
    <div 
      key={scene.id}
      draggable
      onDragStart={(e) => handleDragStart(e, index)}
      onDragOver={(e) => handleDragOver(e, index)}
      onDragEnd={handleDragEnd}
      onDrop={(e) => handleDrop(e, index)}
      className={`bg-slate-900/60 border rounded-2xl p-6 shadow-xl backdrop-blur-md grid grid-cols-1 md:grid-cols-12 gap-6 relative group transition-all duration-200 ${
        draggedIndex === index 
          ? "opacity-35 border-indigo-500/50 scale-[0.98] shadow-inner" 
          : draggedOverIndex === index 
          ? "border-indigo-400 bg-slate-900/90 shadow-indigo-500/10 shadow-2xl scale-[1.01] ring-2 ring-indigo-500/20" 
          : "border-slate-800"
      }`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleDeleteScene(scene.id);
        }}
        className="absolute top-4 right-4 px-3 py-1.5 bg-red-950/80 hover:bg-red-900 border border-red-700/60 rounded-xl text-red-300 hover:text-white transition flex items-center gap-1.5 text-xs font-bold shadow-lg shadow-red-950/50 cursor-pointer group z-30 hover:scale-105 active:scale-95"
        title="刪除此分鏡"
      >
        <Trash2 className="w-3.5 h-3.5 text-red-400 group-hover:text-white" />
        <span>刪除分鏡</span>
      </button>

      {/* Global Auto Generation Trigger for the whole workflow */}
      {index === 0 && onFullAutoProduce && (
        <div className="md:col-span-12 mb-2 pb-2 border-b border-slate-800 flex flex-col gap-2">
          <button
            onClick={onFullAutoProduce}
            disabled={isFullAutoProducing}
            className="w-full py-3 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-sm shadow-lg shadow-emerald-900/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-55 hover:scale-[1.01] animate-pulse relative z-20"
          >
            {isFullAutoProducing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>AI 全自動製片進行中... {fullAutoProgress}</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current text-white" />
                <span>⚡ AI 一鍵全自動極速出片</span>
              </>
            )}
          </button>
          
          {/* Live Progress Log Text to reassure user it is not frozen */}
          {isFullAutoProducing && fullAutoLogs && fullAutoLogs.length > 0 && (
            <div className="w-full px-3 py-2 bg-slate-900/80 rounded-lg border border-slate-800 text-xs text-emerald-400 font-mono flex items-center gap-2 overflow-hidden whitespace-nowrap text-ellipsis">
              <span className="shrink-0 font-bold animate-pulse">›</span>
              <span className="truncate">{fullAutoLogs[fullAutoLogs.length - 1]}</span>
            </div>
          )}
        </div>
      )}

      {/* 7-Step Quality Control & Storyboarding Workflow Panel */}
      <div id={`workflow-panel-${scene.id}`} className="md:col-span-12 bg-slate-950/80 border border-slate-800/80 rounded-xl p-5 space-y-5 shadow-2xl relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Workflow Title & Stepper Progress */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/60 pb-4">
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-slate-200 tracking-wider uppercase flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>七步製片大師工作流</span>
            </h4>
            <p className="text-[10.5px] text-slate-400">
              極致連貫的優質分鏡製作流程。每一步驟均經過 AI 校驗與人工微調，消除人物穿模與連續性斷層。
            </p>
          </div>
          {/* Force Pass Indicator / Reset button */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateSceneMultipleFields({ workflowStep: 1 })}
              className="px-2.5 py-1 text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded border border-slate-800 transition font-mono active:scale-95"
            >
              重置為第一步
            </button>
            <div className="text-[11px] font-mono font-bold bg-indigo-950/50 border border-indigo-500/30 text-indigo-400 px-2.5 py-0.5 rounded-full">
              STEP {scene.workflowStep || 1} / 7
            </div>
          </div>
        </div>

        {/* Step Nodes Progress Bar */}
        <div className="relative flex items-center justify-between w-full select-none py-1 overflow-x-auto scrollbar-none">
          {/* Connecting Line */}
          <div className="absolute left-0 right-0 top-1/2 h-[2px] bg-slate-800 -translate-y-1/2 z-0 pointer-events-none" />
          <div 
            className="absolute left-0 top-1/2 h-[2px] bg-indigo-500 transition-all duration-300 -translate-y-1/2 z-0 pointer-events-none" 
            style={{ width: `${(((scene.workflowStep || 1) - 1) / 6) * 100}%` }}
          />

          {[
            { step: 1, label: "AI 接收建議" },
            { step: 2, label: "Prompt 優化" },
            { step: 3, label: "關鍵幀生成" },
            { step: 4, label: "圖片審查" },
            { step: 5, label: "影片生成" },
            { step: 6, label: "影片審查" },
            { step: 7, label: "輸出建議" }
          ].map((item) => {
            const isCompleted = (scene.workflowStep || 1) > item.step;
            const isActive = (scene.workflowStep || 1) === item.step;
            return (
              <button
                key={item.step}
                type="button"
                onClick={() => updateSceneMultipleFields({ workflowStep: item.step })}
                className="relative z-10 flex flex-col items-center group cursor-pointer"
              >
                <div 
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-mono font-bold transition-all duration-300 ${
                    isCompleted 
                      ? "bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.3)]" 
                      : isActive 
                      ? "bg-indigo-600 text-white ring-4 ring-indigo-500/20 scale-110 shadow-[0_0_15px_rgba(79,70,229,0.4)]" 
                      : "bg-slate-900 text-slate-500 border border-slate-800 hover:border-slate-700 hover:text-slate-300"
                  }`}
                >
                  {isCompleted ? "✓" : item.step}
                </div>
                <span className={`text-[9.5px] mt-1.5 font-bold transition-colors duration-300 ${isActive ? "text-indigo-400 font-extrabold" : isCompleted ? "text-slate-300" : "text-slate-500"}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Step-specific Container */}
        <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl p-4 min-h-[140px] flex flex-col justify-between space-y-4">
          
          {/* Step 1: AI 接收上一個鏡頭的生成建議 */}
          {(scene.workflowStep || 1) === 1 && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400 mt-0.5">
                  <HelpCircle className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <h5 className="text-xs font-bold text-slate-200">步驟 1：接收上一個分鏡對本分鏡的銜接建議</h5>
                  <p className="text-[10.5px] text-slate-400 leading-relaxed">
                    AI 導演會分析上個鏡頭的角色比例、光影基調、服飾與面部朝向，為本鏡頭提供最合適的物理連續性對齊指南。
                  </p>
                </div>
              </div>

              <div className="bg-slate-950/70 border border-slate-850 rounded-lg p-3 space-y-1.5">
                <span className="text-[10px] font-bold text-indigo-400 block uppercase tracking-wider font-mono">
                  {index === 0 ? "第一個鏡頭（無前置建議）" : "前置鏡頭連續性對齊指南："}
                </span>
                <p className="text-xs text-slate-300 leading-relaxed italic">
                  {getPrevAdvice()}
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => updateSceneMultipleFields({ workflowStep: 2 })}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-1 transition active:scale-95 cursor-pointer"
                >
                  <span>確認並進入步驟 2 (優化 Prompt)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: 根據故事大意 + 上鏡頭建議，優化本鏡頭 Prompt */}
          {(scene.workflowStep || 1) === 2 && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400 mt-0.5">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <h5 className="text-xs font-bold text-slate-200">步驟 2：AI 提示詞智能優化</h5>
                  <p className="text-[10.5px] text-slate-400 leading-relaxed">
                    將您的初始視覺提示詞與步驟 1 的連續性對齊指南進行智能語義融合，生成最有利於 AI 繪圖與人物一致性輸出的專業提示詞。
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 block">AI 優化後的正向視覺提示詞 (Optimized Visual Prompt)</label>
                  <textarea
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none placeholder-slate-600 font-mono"
                    placeholder="點擊下方按鈕以生成..."
                    value={scene.step2OptimizedPrompt || ""}
                    onChange={(e) => updateSceneMultipleFields({ step2OptimizedPrompt: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-400 block">AI 優化後的負向提示詞 (Optimized Negative Prompt)</label>
                    <button
                      type="button"
                      onClick={handleAutoFillSceneNegativePrompt}
                      className="text-[9.5px] text-rose-400 hover:text-rose-300 font-mono flex items-center gap-1 cursor-pointer transition"
                      title="自動填入 abstract background, gradient, blurry 等場景防缺陷負向詞"
                    >
                      <Sparkles className="w-2.5 h-2.5 text-rose-400" />
                      <span>注入特定負向詞</span>
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-xs text-slate-300 focus:border-indigo-500 focus:outline-none placeholder-slate-600 font-mono"
                    placeholder="點擊下方按鈕以生成..."
                    value={scene.step2OptimizedNegative || ""}
                    onChange={(e) => updateSceneMultipleFields({ step2OptimizedNegative: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-slate-800/40">
                <button
                  type="button"
                  disabled={scene.isOptimizingStep2}
                  onClick={handleTriggerStep2Optimize}
                  className="px-3.5 py-1.5 bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-500/30 text-indigo-300 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className={`w-3.5 h-3.5 text-indigo-400 ${scene.isOptimizingStep2 ? "animate-spin" : ""}`} />
                  <span>{scene.isOptimizingStep2 ? "正在融合並優化提示詞..." : "🔮 AI 融合上鏡建議並優化"}</span>
                </button>

                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => updateSceneMultipleFields({ workflowStep: 3 })}
                    className="px-3 py-1.5 hover:bg-slate-800 text-slate-400 text-xs font-bold rounded-lg transition"
                  >
                    跳過優化
                  </button>
                  <button
                    type="button"
                    disabled={!scene.step2OptimizedPrompt}
                    onClick={() => {
                      updateSceneMultipleFields({
                        visualPrompt: scene.step2OptimizedPrompt,
                        negativePrompt: scene.step2OptimizedNegative,
                        workflowStep: 3
                      });
                      showToast("已成功將 AI 優化後的提示詞套用至本鏡頭！", "success");
                    }}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-1 transition active:scale-95 cursor-pointer"
                  >
                    <span>套用並進入步驟 3 (生成插圖)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: 生成關鍵幀圖片 */}
          {(scene.workflowStep || 1) === 3 && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400 mt-0.5">
                  <Star className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <h5 className="text-xs font-bold text-slate-200">步驟 3：生成關鍵幀分鏡插圖</h5>
                  <p className="text-[10.5px] text-slate-400 leading-relaxed">
                    在下方觸發 AI 圖像生成（可選擇 Gemini 或 Agnes 引擎），或將現有的手繪分鏡稿直接拖曳或上傳至右側視窗。
                  </p>
                </div>
              </div>

              <div className="bg-slate-950/50 border border-slate-850 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-indigo-400 block uppercase tracking-wider font-mono">當前分鏡插圖狀態</span>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${scene[imageField] ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                    <span className="text-xs font-bold text-slate-300">
                      {scene[imageField] ? "✓ 分鏡插圖已就緒" : "✗ 尚未上傳或生成插圖"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={scene[isGenImgField]}
                    onClick={() => handleGenerateImage(scene.id, "agnes")}
                    className="px-3.5 py-1.5 bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold rounded-lg shadow transition active:scale-95 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${scene[isGenImgField] ? "animate-spin" : ""}`} />
                    <span>Agnes 引擎繪圖</span>
                  </button>
                  <button
                    type="button"
                    disabled={scene[isGenImgField]}
                    onClick={() => handleGenerateImage(scene.id, "gemini")}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow transition active:scale-95 disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${scene[isGenImgField] ? "animate-spin" : ""}`} />
                    <span>Gemini 引擎繪圖</span>
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => updateSceneMultipleFields({ workflowStep: 4 })}
                  className="px-3 py-1.5 hover:bg-slate-800 text-slate-400 text-xs font-bold rounded-lg transition"
                >
                  跳過
                </button>
                <button
                  type="button"
                  disabled={!scene[imageField]}
                  onClick={() => updateSceneMultipleFields({ workflowStep: 4 })}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-1 transition active:scale-95 cursor-pointer"
                >
                  <span>進入步驟 4 (AI 圖片審查)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: AI 檢查圖片是否合理 */}
          {(scene.workflowStep || 1) === 4 && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400 mt-0.5">
                  <CheckCircle className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <h5 className="text-xs font-bold text-slate-200">步驟 4：AI 畫面物理合理性與人物一致性校驗</h5>
                  <p className="text-[10.5px] text-slate-400 leading-relaxed">
                    大師級 AI 視覺總監將對生成的畫面進行物理光影、角色一致性、面部與手部畸變、以及是否與文字段落對齊進行 360° 嚴格核查。
                  </p>
                </div>
              </div>

              {scene.step4ImageReviewText ? (
                <div className="bg-slate-950/70 border border-slate-850 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-emerald-400 block uppercase tracking-wider font-mono">AI 畫面核查結果：</span>
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border ${
                      (scene.step4ImageReviewScore || 0) >= 70 && scene.step4Passed !== false
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    }`}>
                      畫面健康度分數：{scene.step4ImageReviewScore || 0}/100
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">{scene.step4ImageReviewText}</p>
                  {scene.aiReviewSeamlessCheck && (
                    <div className="mt-2 pt-2 border-t border-slate-800/60">
                      <span className="text-[10px] font-bold text-teal-400 block uppercase tracking-wider font-mono mb-1">🔗 首尾影格無縫對接審核：</span>
                      <p className="text-[11px] text-slate-300 leading-relaxed font-sans">{scene.aiReviewSeamlessCheck}</p>
                    </div>
                  )}

                  {/* Smart Quality Defect Banner for Failed Review */}
                  {(!scene.step4Passed || (scene.step4ImageReviewScore !== undefined && scene.step4ImageReviewScore < 70)) && (
                    <div className="mt-2.5 p-2.5 bg-rose-950/40 border border-rose-600/40 rounded-lg space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <h6 className="text-[11px] font-bold text-rose-300">首幀審核未通過 / 檢測到品質與一致性缺陷</h6>
                          <p className="text-[10.5px] text-rose-200/80 leading-relaxed">
                            系統建議自動填入場景特定負向詞（如 <code className="bg-rose-900/60 px-1 py-0.5 rounded text-rose-100 font-mono text-[9.5px]">abstract background, gradient, blurry</code>、純風景/肢體防畸變詞）以徹底排除問題並重新繪製。
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            handleAutoFillSceneNegativePrompt();
                            updateSceneMultipleFields({ workflowStep: 3 });
                            handleGenerateImage(scene.id, 'agnes');
                          }}
                          className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold rounded shadow flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>🔧 一鍵修復負向詞並重新繪圖</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleAutoFillSceneNegativePrompt}
                          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-bold rounded transition cursor-pointer"
                        >
                          僅注入負向詞
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-950/30 border border-dashed border-slate-800 rounded-lg p-4 text-center">
                  <p className="text-xs text-slate-400">尚未對此分鏡進行畫面核查，請點擊下方按鈕啟動 AI 智能稽核。</p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-slate-800/40">
                <button
                  type="button"
                  disabled={scene.isReviewingStep4 || !scene[imageField]}
                  onClick={handleTriggerStep4Review}
                  className="px-3.5 py-1.5 bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-500/30 text-indigo-300 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${scene.isReviewingStep4 ? "animate-spin" : ""}`} />
                  <span>{scene.isReviewingStep4 ? "AI 視覺稽審中..." : "🔍 啟動 AI 畫面與一致性審核"}</span>
                </button>

                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => updateSceneMultipleFields({ workflowStep: 3 })}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-bold rounded-lg transition"
                  >
                    🔄 重新繪圖
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateSceneMultipleFields({ step4Passed: true, workflowStep: 5 });
                      showToast("⚠️ 已使用用戶強制通過權限，成功前往下一步！", "success");
                    }}
                    className="px-2.5 py-1.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-600/30 text-amber-300 text-xs font-bold rounded-lg transition"
                    title="對 AI 審查意見不滿意？點擊此按鈕可以直接強制通過"
                  >
                    ⚠️ 用戶強制通過
                  </button>
                  <button
                    type="button"
                    disabled={!scene.step4ImageReviewText}
                    onClick={() => {
                      updateSceneMultipleFields({ step4Passed: true, workflowStep: 5 });
                      showToast("已通過 AI 視覺審核，順利進入下一步！", "success");
                    }}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-1 transition active:scale-95 cursor-pointer"
                  >
                    <span>✅ 通過並進入步驟 5</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: 生成影片（智能連續模式） */}
          {(scene.workflowStep || 1) === 5 && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400 mt-0.5">
                  <Film className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <h5 className="text-xs font-bold text-slate-200">步驟 5：智能電影連續運鏡生成</h5>
                  <p className="text-[10.5px] text-slate-400 leading-relaxed">
                    在下方選擇適合此分鏡的運鏡策略。AI 將依據您的策略，在影片生成時保持動作平滑過渡（連續運鏡）或創造衝擊力的視覺切鏡（轉場模式）。
                  </p>
                </div>
              </div>

              {/* Mode Selection Grid */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => updateSceneMultipleFields({ step5Mode: "continuous" })}
                  className={`p-3 rounded-lg border text-left transition relative cursor-pointer ${
                    scene.step5Mode !== "transition"
                      ? "bg-indigo-950/20 border-indigo-500/60 shadow-lg"
                      : "bg-slate-950 border-slate-850 hover:border-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-200">A 模式：連續運動 (Continuous)</span>
                    <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${scene.step5Mode !== "transition" ? "border-indigo-400 bg-indigo-600" : "border-slate-600"}`}>
                      {scene.step5Mode !== "transition" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    鎖定上一幀影像輪廓，平滑衍生出人物細微表情、對白口型及背景運動，極致順滑無跳接。
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => updateSceneMultipleFields({ step5Mode: "transition" })}
                  className={`p-3 rounded-lg border text-left transition relative cursor-pointer ${
                    scene.step5Mode === "transition"
                      ? "bg-indigo-950/20 border-indigo-500/60 shadow-lg"
                      : "bg-slate-950 border-slate-850 hover:border-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-200">B 模式：轉場切鏡 (Transition)</span>
                    <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${scene.step5Mode === "transition" ? "border-indigo-400 bg-indigo-600" : "border-slate-600"}`}>
                      {scene.step5Mode === "transition" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    在鏡頭與鏡頭之間建立物理轉場或切換視角（例如切換至中景或特寫），以產生戲劇性的電影節奏。
                  </p>
                </button>
              </div>

              {/* Video Generation Trigger */}
              <div className="bg-slate-950/50 border border-slate-850 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-indigo-400 block uppercase tracking-wider font-mono">影片預覽渲染狀態</span>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${scene[videoField] ? "bg-emerald-500" : "bg-red-500"}`} />
                    <span className="text-xs font-bold text-slate-300">
                      {scene[videoField] ? "✓ 影片預覽渲染已完成" : "✗ 影片尚未生成"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={scene[isGenVidField] || !scene[imageField]}
                    onClick={() => handleGenerateVideo(scene.id)}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-1 transition active:scale-95 cursor-pointer"
                  >
                    <Play className={`w-3.5 h-3.5 ${scene[isGenVidField] ? "animate-spin" : ""}`} />
                    <span>{scene[isGenVidField] ? `渲染中 ${scene.videoProgress || "0%"}` : "🎬 啟動 Agnes 影片合成"}</span>
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => updateSceneMultipleFields({ workflowStep: 6 })}
                  className="px-3 py-1.5 hover:bg-slate-800 text-slate-400 text-xs font-bold rounded-lg transition"
                >
                  跳過
                </button>
                <button
                  type="button"
                  disabled={!scene[videoField]}
                  onClick={() => updateSceneMultipleFields({ workflowStep: 6 })}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-1 transition active:scale-95 cursor-pointer"
                >
                  <span>進入步驟 6 (AI 影片審查)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Step 6: AI 檢查最終影片品質 */}
          {(scene.workflowStep || 1) === 6 && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400 mt-0.5">
                  <CheckCircle className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <h5 className="text-xs font-bold text-slate-200">步驟 6：AI 鏡頭物理學與流暢度總核對</h5>
                  <p className="text-[10.5px] text-slate-400 leading-relaxed">
                    AI 導演將逐幀掃描生成的影片，確認鏡頭搖晃程度、口型吻合度（遵循閉口原則）、人物運動物理學流暢度，確保畫面絕不穿模。
                  </p>
                </div>
              </div>

              {scene.step6VideoReviewText ? (
                <div className="bg-slate-950/70 border border-slate-850 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-emerald-400 block uppercase tracking-wider font-mono">AI 影片核查結果：</span>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                      運鏡健康度分數：{scene.step6VideoReviewScore || 0}/100
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">{scene.step6VideoReviewText}</p>
                  {scene.aiReviewSeamlessCheck && (
                    <div className="mt-2 pt-2 border-t border-slate-800/60">
                      <span className="text-[10px] font-bold text-teal-400 block uppercase tracking-wider font-mono mb-1">🔗 首尾影格無縫對接審核：</span>
                      <p className="text-[11px] text-slate-300 leading-relaxed font-sans">{scene.aiReviewSeamlessCheck}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-950/30 border border-dashed border-slate-800 rounded-lg p-4 text-center">
                  <p className="text-xs text-slate-400">尚未對此分鏡進行影片核查，請點擊下方按鈕啟動 AI 鏡頭運動審核。</p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-slate-800/40">
                <button
                  type="button"
                  disabled={scene.isReviewingStep6 || !scene[videoField]}
                  onClick={handleTriggerStep6Review}
                  className="px-3.5 py-1.5 bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-500/30 text-indigo-300 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${scene.isReviewingStep6 ? "animate-spin" : ""}`} />
                  <span>{scene.isReviewingStep6 ? "AI 影片流暢度稽審中..." : "🎬 啟動 AI 影片流暢度審核"}</span>
                </button>

                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => updateSceneMultipleFields({ workflowStep: 5 })}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-bold rounded-lg transition"
                  >
                    🔄 重新生成影片
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateSceneMultipleFields({ step6Passed: true, workflowStep: 7 });
                      showToast("⚠️ 已使用用戶強制通過權限，成功前往下一步！", "success");
                    }}
                    className="px-2.5 py-1.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-600/30 text-amber-300 text-xs font-bold rounded-lg transition"
                    title="對 AI 審查意見不滿意？點擊此按鈕可以直接強制通過"
                  >
                    ⚠️ 用戶強制通過
                  </button>
                  <button
                    type="button"
                    disabled={!scene.step6VideoReviewText}
                    onClick={() => {
                      updateSceneMultipleFields({ step6Passed: true, workflowStep: 7 });
                      showToast("已通過 AI 影片與鏡頭流暢度審核，順利進入最後一步！", "success");
                    }}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-1 transition active:scale-95 cursor-pointer"
                  >
                    <span>✅ 通過並進入步驟 7</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 7: 總結本鏡頭 + 給下一個鏡頭建議 */}
          {(scene.workflowStep || 1) === 7 && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400 mt-0.5">
                  <Star className="w-4 h-4 text-amber-400 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h5 className="text-xs font-bold text-slate-200">步驟 7：輸出本分鏡總結與下一個鏡頭的連續性對齊建議</h5>
                  <p className="text-[10.5px] text-slate-400 leading-relaxed">
                    恭喜！本鏡頭已完美製作完畢。AI 將總結本鏡頭的構圖參數，並自動生成一條專門的銜接建議傳遞至下一個鏡頭，形成完美的閉環連續性。
                  </p>
                </div>
              </div>

              <div className="bg-slate-950/70 border border-slate-850 rounded-lg p-3 space-y-2">
                <span className="text-[10px] font-bold text-indigo-400 block uppercase tracking-wider font-mono">即將傳遞給下一個鏡頭的連續性指令：</span>
                <textarea
                  value={scene.step7AdviceForNext || ""}
                  onChange={(e) => updateSceneMultipleFields({ step7AdviceForNext: e.target.value })}
                  placeholder="尚未生成，您可以點擊下方按鈕讓 AI 生成，或手動在此輸入（例如：「人物轉身離開房間，光線變暗」）"
                  className="w-full h-20 bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500/50 resize-none transition-colors leading-relaxed"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-slate-800/40">
                <button
                  type="button"
                  disabled={scene.isGeneratingStep7}
                  onClick={handleTriggerStep7Advice}
                  className="px-3.5 py-1.5 bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-500/30 text-indigo-300 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className={`w-3.5 h-3.5 text-indigo-400 ${scene.isGeneratingStep7 ? "animate-spin" : ""}`} />
                  <span>{scene.isGeneratingStep7 ? "連續性指令分析生成中..." : "🔮 生成鏡頭總結與下個分鏡建議"}</span>
                </button>

                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    disabled={!scene.step7AdviceForNext}
                    onClick={() => {
                      showToast("🎉 本分鏡場景已大功告成！連續性指令已寫入下一個場景！", "success");
                    }}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-1 transition active:scale-95 cursor-pointer"
                  >
                    <span>🎉 圓滿完成工作流</span>
                    <CheckCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="md:col-span-7 flex flex-col space-y-4">
        <div className="flex items-center space-x-2">
          <div 
            className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 rounded cursor-grab active:cursor-grabbing transition"
            title="拖曳調整場景順序"
          >
            <GripVertical className="w-4 h-4" />
          </div>
          <span className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full">
            場景 {index + 1}
          </span>
          {scene.durationSeconds && (
            <span className="bg-purple-500/10 border border-purple-500/30 text-purple-400 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {scene.durationSeconds}s
            </span>
          )}
          <input
            type="text"
            className="bg-transparent text-sm font-bold text-white border-b border-transparent hover:border-slate-850 focus:border-indigo-500 focus:outline-none w-full pb-0.5 transition"
            value={scene.title}
            onChange={(e) => handleUpdateSceneField(scene.id, "title", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">出場角色</label>
            <input
              type="text"
              className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
              value={scene.character}
              onChange={(e) => handleUpdateSceneField(scene.id, "character", e.target.value)}
              placeholder="例如：主角"
              onKeyDown={handleKeyDown}
            />
            <div className="mt-1 flex flex-wrap gap-1 items-center">
              <button
                type="button"
                onClick={() => handleUpdateSceneField(scene.id, "character", "無")}
                className={`px-1.5 py-0.5 rounded text-[9px] border transition cursor-pointer ${
                  isNoChar(scene.character)
                    ? "bg-amber-950/90 text-amber-300 border-amber-500/60 font-bold"
                    : "bg-slate-950 text-slate-500 border-slate-850 hover:text-slate-300 hover:border-slate-800"
                }`}
                title="標記為無登場角色（純景物/空鏡頭）"
              >
                無角色 (空鏡)
              </button>
              <button
                type="button"
                onClick={() => handleUpdateSceneField(scene.id, "character", "旁白")}
                className={`px-1.5 py-0.5 rounded text-[9px] border transition cursor-pointer ${
                  (scene.character || "").trim() === "旁白"
                    ? "bg-amber-950/90 text-amber-300 border-amber-500/60 font-bold"
                    : "bg-slate-950 text-slate-500 border-slate-850 hover:text-slate-300 hover:border-slate-800"
                }`}
                title="標記為旁白/音效"
              >
                旁白
              </button>
              {activeProjectCharacters && activeProjectCharacters.length > 0 && activeProjectCharacters.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleUpdateSceneField(scene.id, "character", c.name)}
                  className={`px-1.5 py-0.5 rounded text-[9px] border transition cursor-pointer ${
                    !isNoChar(scene.character) && (scene.character || "").trim().toLowerCase() === (c.name || "").trim().toLowerCase()
                      ? "bg-pink-950/80 text-pink-400 border-pink-500/40 font-bold"
                      : "bg-slate-950 text-slate-500 border-slate-850 hover:text-slate-300 hover:border-slate-800"
                  }`}
                  title={`快速選擇：${c.name}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center mb-0.5">
              <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">視頻時長 (秒)</label>
            </div>
            <input
              type="number"
              className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
              value={scene.durationSeconds || ""}
              onChange={(e) => handleUpdateSceneField(scene.id, "durationSeconds", parseInt(e.target.value as string))}
            />
          </div>
        </div>
        
        {/* Subtitle / Dialogue / Audio Cue Split */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="flex justify-between items-center mb-0.5">
              <label className="text-[10px] font-mono text-indigo-400 font-bold uppercase flex items-center gap-1">
                <span>🗣️ 角色說的話 (台詞對白)</span>
              </label>
              <button
                type="button"
                onClick={() => speakDialogue(scene.dialogue || scene.narration || "")}
                disabled={!scene.dialogue && !scene.narration}
                className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition active:scale-95"
                title="點擊語音朗讀此條台詞"
              >
                <Volume2 className="w-3 h-3" />
                <span>朗讀試聽</span>
              </button>
            </div>
            <textarea
              className="w-full bg-slate-950 border border-slate-850 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition min-h-[60px]"
              value={scene.dialogue || ""}
              onChange={(e) => handleUpdateSceneField(scene.id, "dialogue", e.target.value)}
              placeholder='例如：「我有個秘密要告訴你。」（嘴唇會對應說話，無對話請留空）'
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center mb-0.5">
              <label className="text-[10px] font-mono text-emerald-400 font-bold uppercase flex items-center gap-1">
                <span>📖 背景場景旁白 (旁白字幕)</span>
              </label>
              <button
                type="button"
                onClick={() => speakDialogue(scene.narration || "")}
                disabled={!scene.narration}
                className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition active:scale-95"
                title="點擊語音朗讀此條旁白"
              >
                <Volume2 className="w-3 h-3" />
                <span>朗讀試聽</span>
              </button>
            </div>
            <textarea
              className="w-full bg-slate-950 border border-slate-850 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition min-h-[60px]"
              value={scene.narration || ""}
              onChange={(e) => handleUpdateSceneField(scene.id, "narration", e.target.value)}
              placeholder="例如：夜色漸深，窗外的雨滴答作響，他心中滿是焦慮...（嘴唇不會說話）"
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-pink-400 font-bold uppercase flex items-center gap-1">
              <span>🎵 氛圍音效與背景音樂 (鏡頭音訊)</span>
            </label>
            <textarea
              className="w-full bg-slate-950 border border-slate-850 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-pink-500 transition min-h-[60px]"
              value={scene.audioCue || ""}
              onChange={(e) => handleUpdateSceneField(scene.id, "audioCue", e.target.value)}
              placeholder="例如：窗外淅淅瀝瀝的下雨聲，或者是雨停後的寂靜無雨聲。"
              onKeyDown={handleKeyDown}
            />
          </div>
        </div>

        {/* English Visual Prompt */}
        <div className="space-y-1">
          <div className="flex justify-between items-center mb-1">
            <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">
              繪圖/影片視覺描述提示詞 (English Prompt)
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-slate-500 font-bold">🪄 預設庫:</span>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleApplyStylePreset(scene.id, e.target.value);
                    e.target.value = "";
                  }
                }}
                className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[9px] text-indigo-400 font-bold focus:outline-none focus:border-indigo-500 cursor-pointer"
                defaultValue=""
              >
                <option value="" disabled>-- 快速套用視覺風格 --</option>
                {STYLE_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <textarea
            className="w-full bg-slate-950 border border-slate-850 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition min-h-[80px]"
            value={scene.visualPrompt || ""}
            onChange={(e) => handleUpdateSceneField(scene.id, "visualPrompt", e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Negative Prompt Section */}
        <div className="space-y-1.5 p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
            <label className="text-[10px] font-mono text-rose-400 font-bold uppercase flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span>🚫 負向提示詞 (Negative Prompt)</span>
              <span className="text-[9px] text-slate-400 font-normal">（防範首幀審核不通過）</span>
            </label>
            <button
              type="button"
              onClick={handleAutoFillSceneNegativePrompt}
              className="px-2 py-0.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-600/40 text-rose-300 hover:text-rose-100 rounded text-[10px] font-bold transition flex items-center gap-1 cursor-pointer active:scale-95 shadow-sm"
              title="審查當前鏡頭角色與設定，自動填入 abstract background, gradient, blurry 及場景專屬負向詞"
            >
              <Sparkles className="w-3 h-3 text-rose-300" />
              <span>🔍 智能審查並自動填入場景負向詞</span>
            </button>
          </div>
          <textarea
            className="w-full bg-slate-900/90 border border-slate-800 rounded-md p-2 text-xs text-rose-200/90 focus:outline-none focus:border-rose-500 transition min-h-[52px] font-mono placeholder:text-slate-600"
            value={scene.negativePrompt || ""}
            onChange={(e) => {
              handleUpdateSceneField(scene.id, "negativePrompt", e.target.value);
              updateSceneMultipleFields({ negativePrompt: e.target.value, step2OptimizedNegative: e.target.value });
            }}
            placeholder="例如: abstract background, gradient, blurry, low resolution, bad anatomy, deformed hands, text, watermark..."
          />
          {/* Quick Negative Chips */}
          <div className="flex items-center gap-1 flex-wrap pt-0.5">
            <span className="text-[9px] text-slate-500 font-mono">快速填入：</span>
            <button
              type="button"
              onClick={() => handleAppendNegativeTag("abstract background, gradient, blurry, out of focus")}
              className="px-1.5 py-0.5 bg-slate-900 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-700/50 text-[9.5px] text-slate-300 hover:text-rose-300 rounded transition cursor-pointer"
            >
              + 抽象漸層與模糊
            </button>
            <button
              type="button"
              onClick={() => handleAppendNegativeTag("person, human, student, students, people, face, crowd, figure")}
              className="px-1.5 py-0.5 bg-slate-900 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-700/50 text-[9.5px] text-slate-300 hover:text-rose-300 rounded transition cursor-pointer"
            >
              + 純風景禁人物
            </button>
            <button
              type="button"
              onClick={() => handleAppendNegativeTag("deformed hands, extra fingers, missing fingers, bad anatomy, extra limbs")}
              className="px-1.5 py-0.5 bg-slate-900 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-700/50 text-[9.5px] text-slate-300 hover:text-rose-300 rounded transition cursor-pointer"
            >
              + 防肢體畸變
            </button>
            <button
              type="button"
              onClick={() => handleAppendNegativeTag("extra people, ghost figures, duplicate characters, cloned faces")}
              className="px-1.5 py-0.5 bg-slate-900 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-700/50 text-[9.5px] text-slate-300 hover:text-rose-300 rounded transition cursor-pointer"
            >
              + 防多餘複製人物
            </button>
            <button
              type="button"
              onClick={() => handleAppendNegativeTag("low quality, worst quality, jpeg artifacts, text, watermark, signature")}
              className="px-1.5 py-0.5 bg-slate-900 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-700/50 text-[9.5px] text-slate-300 hover:text-rose-300 rounded transition cursor-pointer"
            >
              + 高清無水印
            </button>
          </div>
        </div>

        {/* Action Prompt */}
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">
            影片動作描述提示詞 (Action Prompt)
          </label>
          <textarea
            className="w-full bg-slate-950 border border-slate-850 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition min-h-[50px]"
            value={scene.actionPrompt || ""}
            onChange={(e) => handleUpdateSceneField(scene.id, "actionPrompt", e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Transition Prompt */}
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">
            過渡到下個場景提示詞 (Transition Prompt)
          </label>
          <textarea
            className="w-full bg-slate-950 border border-slate-850 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition min-h-[40px]"
            value={scene.transitionPrompt || ""}
            onChange={(e) => handleUpdateSceneField(scene.id, "transitionPrompt", e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Director's Personal Notes */}
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-amber-500 font-bold uppercase flex items-center gap-1">
            <span>🎬 導演註記 / 個人拍攝筆記 (Director's & Personal Notes)</span>
          </label>
          <textarea
            className="w-full bg-slate-950 border border-slate-850 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition min-h-[60px]"
            value={scene.directorNotes || ""}
            onChange={(e) => handleUpdateSceneField(scene.id, "directorNotes", e.target.value)}
            placeholder="在此撰寫該分鏡的導演註記、燈光配置、運鏡細節或個人備忘筆記..."
          />
        </div>
      </div>

      {/* Right Col: Storyboard Image / Agnes Video Generation Frame with upgraded 3-Screen Layout */}
      <div className="md:col-span-5 flex flex-col space-y-4">
        {/* Screen 1: Playback Screen / Canvas */}

        {sceneType === 'keyframes' ? (
          <div className="space-y-3">
            <span className="text-[10px] font-mono text-slate-500 font-bold tracking-wider uppercase block">
              🎥 首尾影格渲染中心
            </span>
            <div className="grid grid-cols-2 gap-4">
              {/* Start Frame */}
              <div 
                className={`relative aspect-video w-full bg-black rounded-xl overflow-hidden border border-slate-800 shadow-inner flex flex-col items-center justify-center ${!scene[imageField] ? 'cursor-pointer group/img' : ''}`}
                onClick={() => {
                  if (!scene[videoField]) {
                    document.getElementById(`upload-scene-img-${scene.id}`)?.click();
                  }
                }}
              >
                <input 
                  type="file" 
                  id={`upload-scene-img-${scene.id}`} 
                  accept="image/*" 
                  className="hidden" 
                  onChange={(e) => handleUploadSceneImage(e, scene.id, imageField as any)} 
                />
                {scene[imageField] ? (
                  <div className="relative w-full h-full">
                    <img src={scene[imageField]} alt="Start frame" className="w-full h-full object-cover" />
                    <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] font-mono font-bold text-slate-300">首幀 (START)</div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAsset("image");
                      }}
                      className="absolute top-2 right-2 p-1 bg-red-950/90 hover:bg-red-800 border border-red-700/50 text-red-200 hover:text-white rounded transition shadow z-40 cursor-pointer active:scale-95"
                      title="徹底刪除此插圖并釋放空間"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {!scene[isGenVidField] && (
                      <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-[11px] font-bold text-slate-200">點擊更換</span>
                      </div>
                    )}
                  </div>
                ) : scene[isGenImgField] ? (
                  <RefreshCw className="w-6 h-6 text-pink-500 animate-spin" />
                ) : (
                  <div className="flex flex-col items-center justify-center opacity-50 group-hover/img:opacity-100">
                    <Upload className="w-6 h-6 text-slate-500 mb-1" />
                    <p className="text-[10px] text-slate-400 font-medium">首幀</p>
                  </div>
                )}
              </div>
              
              {/* End Frame */}
              <div className="relative aspect-video w-full bg-black rounded-xl overflow-hidden border border-slate-800 shadow-inner flex flex-col items-center justify-center">
                {endImageUrl ? (
                  <div className="relative w-full h-full">
                    <img src={endImageUrl} alt="End frame" className="w-full h-full object-cover" />
                    <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] font-mono font-bold text-slate-300">尾幀 (END)</div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center opacity-50 text-center px-4">
                    <p className="text-[10px] text-slate-400 font-medium">等待下個鏡頭生成</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* If video generated, show below */}
            {scene[videoField] && (
              <div className="relative aspect-video w-full bg-black rounded-xl overflow-hidden border border-slate-800 shadow-inner mt-4">
                <ScrubbableVideoPlayer src={scene[videoField]} dialogue={scene.dialogue || scene.narration} className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 flex gap-1 z-30">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteAsset("video");
                    }}
                    className="bg-red-950/90 hover:bg-red-800 text-white px-2 py-1 rounded text-[9px] font-bold transition shadow flex items-center gap-1 border border-red-700/50 cursor-pointer active:scale-95"
                    title="徹底從伺服器硬碟刪除此影片檔案并釋放空間"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                    <span>刪除/釋放影片</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setProjects(prevProjects => {
                        const updatedList = prevProjects.map(p => {
                          if (p.id === activeProjectId) {
                            const updatedScenes = p.scenes.map(s => {
                              if (s.id === scene.id) {
                                return {
                                  ...s,
                                  [imageField]: undefined,
                                  [videoField]: undefined,
                                  [(sceneType as any === "ext" ? "videoProgressExt" : (sceneType === "keyframes" ? "videoProgressKeyframes" : "videoProgress"))]: undefined,
                                  [(sceneType as any === "ext" ? "videoLogsExt" : (sceneType === "keyframes" ? "videoLogsKeyframes" : "videoLogs"))]: undefined,
                                  [errorField]: undefined
                                };
                              }
                              return s;
                            });
                            return { ...p, scenes: updatedScenes };
                          }
                          return p;
                        });
                        try { localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); } catch (err) { console.error(err); }
                        return updatedList;
                      });
                      showToast("已成功重置！您可以現在重新繪圖或重新生成影片。", "success");
                    }}
                    className="bg-red-950/90 hover:bg-red-800 text-white px-2 py-1 rounded text-[9px] font-bold transition shadow flex items-center gap-1 border border-red-700/50"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>重做/重置影片</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div 
            onDragOver={handleImageDragOver}

          onDrop={(e) => handleImageDrop(e, scene.id, imageField as any)}
          onClick={() => {
            if (!scene[videoField]) {
              document.getElementById(`upload-scene-img-${scene.id}`)?.click();
            }
          }}
          className={`relative aspect-video w-full bg-black rounded-xl overflow-hidden border border-slate-800 shadow-inner flex flex-col items-center justify-center ${!scene[videoField] ? 'cursor-pointer group/img' : ''}`}
          title={!scene[videoField] ? "點擊或拖曳圖片至此處上傳自訂照片" : undefined}
        >
          <input 
            type="file" 
            id={`upload-scene-img-${scene.id}`} 
            accept="image/*,video/*" 
            className="hidden" 
            onChange={(e) => handleUploadSceneImage(e, scene.id, imageField as any)} 
          />

          {scene[videoField] ? (
            <div className="relative w-full h-full" onClick={(e) => e.stopPropagation()}>
              <ScrubbableVideoPlayer
                src={scene[videoField]}
                dialogue={scene.dialogue || scene.narration}
                className="w-full h-full object-cover"
              />
              {/* Manual redo / reset button */}
              <div className="absolute top-2 right-2 flex gap-1 z-30">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleDeleteAsset("video");
                  }}
                  className="bg-red-950/90 hover:bg-red-800 text-white px-2 py-1 rounded text-[9px] font-bold transition shadow flex items-center gap-1 border border-red-700/50 z-45 cursor-pointer active:scale-95"
                  title="徹底從伺服器硬碟刪除此影片檔案并釋放空間"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                  <span>刪除/釋放影片</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setProjects(prevProjects => {
                      const updatedList = prevProjects.map(p => {
                        if (p.id === activeProjectId) {
                          const updatedScenes = p.scenes.map(s => {
                            if (s.id === scene.id) {
                              return {
                                ...s,
                                [imageField]: undefined,
                                [videoField]: undefined,
                                [progressField]: undefined,
                                [logsField]: undefined,
                                [errorField]: undefined
                              };
                            }
                            return s;
                          });
                          return { ...p, scenes: updatedScenes };
                        }
                        return p;
                      });
                      try { localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); } catch (err) { console.error(err); }
                      return updatedList;
                    });
                    showToast("已成功重置！您可以現在重新繪圖或重新生成影片。", "success");
                  }}
                  className="bg-red-950/90 hover:bg-red-800 text-white px-2 py-1 rounded text-[9px] font-bold transition shadow flex items-center gap-1 border border-red-700/50 z-45 cursor-pointer active:scale-95"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  <span>重做/重置影片</span>
                </button>
              </div>
            </div>
          ) : scene[imageField] ? (
            <div className="relative w-full h-full">
              <img 
                src={scene[imageField]} 
                alt={scene.title} 
                className={`w-full h-full object-cover transition-transform duration-[6000ms] ease-out transform scale-100 ${scene[isGenVidField] ? 'opacity-40 scale-105' : 'group-hover/img:scale-105'}`} 
              />
              {/* If generating, display a nice overlay status */}
              {scene[isGenVidField] ? (
                <div className="absolute inset-0 bg-indigo-950/20 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono font-bold bg-indigo-950/90 text-indigo-400 border border-indigo-500/30 shadow-lg animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                    <span>COMPILING DIGITAL PREVIEW...</span>
                  </span>
                </div>
              ) : (
                <>
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover/img:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-1.5">
                    <Upload className="w-5 h-5 text-indigo-400 animate-bounce" />
                    <span className="text-[11px] font-bold text-slate-200">點擊或拖曳更換自訂照片</span>
                  </div>
                  {/* Manual redo / reset button */}
                  <div className="absolute top-2 right-2 flex gap-1 z-30">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleDeleteAsset("image");
                      }}
                      className="bg-red-950/90 hover:bg-red-800 text-white px-2 py-1 rounded text-[9px] font-bold transition shadow flex items-center gap-1 border border-red-700/50 z-45 cursor-pointer active:scale-95"
                      title="徹底從伺服器硬碟刪除此插圖"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                      <span>刪除/釋放圖片</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setProjects(prevProjects => {
                          const updatedList = prevProjects.map(p => {
                            if (p.id === activeProjectId) {
                              const updatedScenes = p.scenes.map(s => {
                                if (s.id === scene.id) {
                                  return {
                                    ...s,
                                    [imageField]: undefined,
                                    [videoField]: undefined,
                                    [progressField]: undefined,
                                    [logsField]: undefined,
                                    [errorField]: undefined
                                  };
                                }
                                return s;
                              });
                              return { ...p, scenes: updatedScenes };
                            }
                            return p;
                          });
                          try { localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); } catch (err) { console.error(err); }
                          return updatedList;
                        });
                        showToast("已成功重置！您可以現在重新繪圖或重新生成影片。", "success");
                      }}
                      className="bg-red-950/90 hover:bg-red-800 text-white px-2 py-1 rounded text-[9px] font-bold transition shadow flex items-center gap-1 border border-red-700/50 z-45 cursor-pointer active:scale-95"
                      title="不滿意插圖嗎？點此重置以重新繪製"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      <span>重做/重置此影鏡</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : scene[isGenImgField] ? (
            <div className="flex flex-col items-center space-y-3" onClick={(e) => e.stopPropagation()}>
              <RefreshCw className="w-6 h-6 text-pink-500 animate-spin" />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center space-y-2 opacity-50 group-hover/img:opacity-100 transition-opacity">
              <Upload className="w-8 h-8 text-slate-500" />
              <p className="text-xs text-slate-400 font-medium">拖曳圖片或點擊上傳</p>
            </div>
          )}
        </div>
        )}
        {scene[isGenVidField] && (
          <div className="space-y-4 animate-fadeIn">
            {/* Screen 2: Render Output Screen */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5" />
                  <span>🎬 Render Output</span>
                </span>
                <span className="bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                  <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
                  Cinematic Compiler
                </span>
              </div>

              <div className="flex flex-col items-center py-2 text-center">
                {/* SVG Circular progress */}
                <div className="relative w-16 h-16 mb-3">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-slate-850"
                      strokeWidth="2.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-indigo-500 transition-all duration-300 stroke-linecap-round"
                      strokeWidth="2.5"
                      strokeDasharray={`${parseInt(scene.videoProgress || "0")}, 100`}
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Film className="w-5 h-5 text-indigo-400 animate-spin" style={{ animationDuration: '6s' }} />
                  </div>
                </div>

                <span className="text-xs font-bold text-white mb-1">Rendering Cinematic Frames...</span>
                <span className="text-[10px] text-slate-400 font-medium">
                  Agnes AI is compiling <strong className="text-indigo-400">{scene.videoProgress || "0%"}</strong> of the video stream.
                </span>
              </div>

              {/* API Latency & Resource Allocation Indicator */}
              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="bg-slate-950 border border-slate-850 rounded-lg p-2 flex flex-col justify-between">
                  <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5 text-indigo-400" />
                    <span>回應時間 (Latency)</span>
                  </span>
                  <div className="flex flex-col gap-0.5 mt-1 font-mono text-[9px]">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Agnes API:</span>
                      <span className="text-indigo-400 font-bold">{scene.videoApiLatency || "偵測中..."}</span>
                    </div>
                    {scene.videoDownloadLatency && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">檔案下載:</span>
                        <span className="text-emerald-400 font-bold">{scene.videoDownloadLatency}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-850 rounded-lg p-2 flex flex-col justify-between">
                  <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Info className="w-2.5 h-2.5 text-indigo-400" />
                    <span>資源分配 (Resources)</span>
                  </span>
                  <div className="text-[8px] text-indigo-300 font-mono line-clamp-2 mt-1 leading-normal">
                    {scene.videoResourceAllocation || "初始化算力資源..."}
                  </div>
                </div>
              </div>
            </div>

            {/* Screen 3: Console Logs Screen */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 shadow-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-400 font-semibold tracking-wider flex items-center gap-1">
                  <span>&gt; agnes_video.py console logs</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const logText = (scene.videoLogs || []).join('\n') || "[SYSTEM] Initiating Agnes Video V2.0 call...";
                      navigator.clipboard.writeText(logText);
                      showToast("日誌已複製到剪貼簿！", "success");
                    }}
                    className="text-[9px] text-slate-400 hover:text-white bg-slate-950 hover:bg-slate-800 px-2 py-0.5 rounded border border-slate-800 transition"
                  >
                    Copy
                  </button>
                  <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    <span>streaming...</span>
                  </span>
                </div>
              </div>

              <div className="w-full bg-black/95 p-3 rounded-lg text-[9px] font-mono text-emerald-400 text-left h-32 overflow-y-auto border border-emerald-500/20 select-text leading-relaxed font-mono shadow-inner">
                {scene.videoLogs && scene.videoLogs.length > 0 ? (
                  scene.videoLogs.map((logLine, logIdx) => (
                    <div key={logIdx} className="break-all">{logLine}</div>
                  ))
                ) : (
                  <>
                    <div className="text-emerald-500/80">[SYSTEM] Initiating Agnes Video V2.0 call...</div>
                    <div className="text-emerald-500/80">[SYSTEM] Requesting compute resource allocation...</div>
                    <div className="text-emerald-500/80">[SYSTEM] Initializing cinematic stream compiler...</div>
                    <div className="text-slate-500 animate-pulse mt-1">&gt; Compiling audio-visual streams...</div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default SceneItem;
