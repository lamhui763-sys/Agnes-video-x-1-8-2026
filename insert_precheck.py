with open('src/App.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
inserted = False
for i, line in enumerate(lines):
    if 'const res = await fetch("/api/generate-image", {' in line and not inserted and i < 2500:
        precheck_code = """      // 1. Pre-check Experience Library for past failures
      let historicalFailures: string[] = [];
      try {
        const expRes = await fetch(`/api/experience-summary?sceneId=${sceneId}`);
        if (expRes.ok) {
          const data = await expRes.json();
          historicalFailures = data.failures || [];
        }
      } catch (e) {}

      const hasAbstractBgIssue = historicalFailures.some(f => f.toLowerCase().includes("abstract") || f.toLowerCase().includes("gradient") || f.toLowerCase().includes("purple"));
      const hasMissingContentIssue = historicalFailures.some(f => f.toLowerCase().includes("content missing") || f.toLowerCase().includes("missing gun") || f.toLowerCase().includes("missing character"));

      if (hasAbstractBgIssue) {
        finalPrompt += "\\n[CRITICAL HARD CONSTRAINT]: NO abstract background, NO gradients. Must be a concrete real environment.";
        if (finalNegativePrompt) finalNegativePrompt += ", gradient, color blocks, abstract background";
      }
      if (hasMissingContentIssue) {
        finalPrompt += "\\n[CRITICAL HARD CONSTRAINT]: Must contain character, must hold weapon clearly.";
        if (finalNegativePrompt) finalNegativePrompt += ", missing gun, missing character, empty scene";
      }

      // 2. Cross-scene consistency logic
      let startFrameUrl = undefined;
      const index = activeProject.scenes.findIndex((s) => s.id === sceneId);
      if (index > 0) {
        const prevScene = activeProject.scenes.slice(0, index).reverse().find((s) => s.imageUrl);
        if (prevScene) {
           startFrameUrl = prevScene.imageUrl;
           finalPrompt += "\\n[CROSS-SCENE CONSISTENCY]: The character's appearance, clothing, and facial features MUST exactly match the provided previous scene image reference.";
        }
      }

"""
        new_lines.append(precheck_code)
        inserted = True
    new_lines.append(line)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
