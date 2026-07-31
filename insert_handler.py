import sys

with open('src/App.tsx', 'r') as f:
    content = f.read()

handler_code = """
  const handleInsertTransitionScene = async (index: number) => {
    if (!activeProject || index >= activeProject.scenes.length - 1) return;
    const sceneA = activeProject.scenes[index];
    const sceneB = activeProject.scenes[index + 1];

    try {
      const res = await fetch("/api/generate-transition-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneA,
          sceneB,
          novelText: activeProject.novelText,
          artStyle: activeProject.artStyle,
          characters: activeProject.characters,
          customApiKey
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to generate transition scene");
      }

      const { scene: generatedData } = await res.json();
      
      const newScene: Scene = {
        id: `scene_transition_${Date.now()}`,
        ...generatedData,
        isGeneratingImage: false,
        isGeneratingVideo: false
      };

      const newScenes = [...activeProject.scenes];
      newScenes.splice(index + 1, 0, newScene);
      
      updateActiveProject({ scenes: newScenes });
      alert("✅ 已成功插入自動銜接場景！");
    } catch (err: any) {
      alert(`插入銜接場景失敗：${err.message || err}`);
    }
  };
"""

# Insert it before handleGenerateVideoKeyframes
parts = content.split('  // Agnes Video Generation with keyframes')
new_content = parts[0] + handler_code + '\n  // Agnes Video Generation with keyframes' + parts[1]

with open('src/App.tsx', 'w') as f:
    f.write(new_content)
