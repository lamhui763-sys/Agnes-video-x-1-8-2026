import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

# Fix handleGenerateVideoKeyframes at 3750
app = app.replace('handleGenerateVideoKeyframes(sceneId, index);', 'handleGenerateVideo(sceneId, true);')
app = app.replace('handleGenerateVideoKeyframes(scene.id, index);', 'handleGenerateVideo(scene.id, true);')
app = app.replace('handleGenerateVideoKeyframes(scene.id, index)', 'handleGenerateVideo(scene.id, true)')

# Inject missing functions
missing_funcs = """
  const handleGenerateAllSequentially = async () => {
    handleFullAutoVideoProduction();
  };

  const handleGenerateAllKeyframesSequentially = async () => {
    handleFullAutoVideoProduction();
  };

  const handleFullAutoVideoProduction = async () => {
    if (!activeProject || activeProject.scenes.length === 0) return;
    setIsGeneratingAllSequentially(true);
    let failedScenes: string[] = [];

    // Phase 1: First pass
    for (const scene of activeProject.scenes) {
      if (scene.videoUrl || scene.isForcePassed) continue;
      
      try {
        await handleGenerateVideo(scene.id, false);
        // Wait until generated
        while (true) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          const p = JSON.parse(localStorage.getItem("toonflow_projects") || "[]").find((p: any) => p.id === activeProjectId);
          const s = p?.scenes.find((s: any) => s.id === scene.id);
          if (s?.videoUrl || s?.isForcePassed) break;
          if (s?.videoError || (s as any)?.videoErrorKeyframes || (s as any)?.videoErrorExt) {
             failedScenes.push(scene.id);
             console.warn(`⚠️ 分鏡 ${scene.id} 生成失敗，先繞過此鏡頭...`);
             break;
          }
        }
      } catch (err) {
        failedScenes.push(scene.id);
      }
    }

    // Phase 2: Retry failed scenes
    for (const sceneId of failedScenes) {
       console.log(`⚠️ 開始二次重試分鏡 ${sceneId}...`);
       try {
         await handleGenerateVideo(sceneId, true);
         while (true) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          const p = JSON.parse(localStorage.getItem("toonflow_projects") || "[]").find((p: any) => p.id === activeProjectId);
          const s = p?.scenes.find((s: any) => s.id === sceneId);
          if (s?.videoUrl || s?.isForcePassed) break;
          if (s?.videoError || (s as any)?.videoErrorKeyframes || (s as any)?.videoErrorExt) {
             console.warn(`⚠️ 經多次重試後依然生成失敗，已自動將其轉換為手動模式。`);
             break;
          }
        }
       } catch (err) {
       }
    }
    
    setIsGeneratingAllSequentially(false);
  };
"""

app = app.replace('return (\n    <div className="min-h-screen bg-slate-950', missing_funcs + '\n  return (\n    <div className="min-h-screen bg-slate-950')

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
