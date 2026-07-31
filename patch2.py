import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

pattern = r'''          finalNegativePrompt = baseNegatives;
          \}

          feedbackNote = `已根據歷史 \$\{failureCount\} 次失敗記錄與角色動作聖經對 Prompt 進行智能增強！`;
          console\.info\(`\[Experience Engine\] Enhanced prompt with history & bibles for scene \$\{sceneId\}:`, finalPrompt\);
        \} else \{
          // No past failures, but we have proactive injections \(Character Bible or Gun action\)
          if \(matchedBible \|\| needsGunTemplate\) \{
            finalPrompt = `Anime key visual, high-quality professional digital art, sharp focus\.【描述主題 \(Main Subject Description\)】\$\{sceneToGen\.visualPrompt\}\$\{proactiveInjections\}Anime aesthetic, high resolution, no text, no watermark\.`\.trim\(\);
            console\.info\(`\[Experience Engine\] Proactive enhancement with bibles for scene \$\{sceneId\}:`, finalPrompt\);
          \}
        \}
      \} catch \(err\) \{
        console\.warn\("\[Experience Engine\] Error during failure auto-injection query:", err\);
        // Fallback to proactive injection anyway if applicable
        if \(matchedBible \|\| needsGunTemplate\) \{
          finalPrompt = `Anime key visual, high-quality professional digital art, sharp focus\.【描述主題 \(Main Subject Description\)】\$\{sceneToGen\.visualPrompt\}\$\{proactiveInjections\}Anime aesthetic, high resolution, no text, no watermark\.`\.trim\(\);
        \}
      \}'''

replacement = """          finalNegativePrompt = baseNegatives;
          }

          feedbackNote = `已根據歷史 ${failureCount} 次失敗記錄與角色動作聖經對 Prompt 進行智能增強！`;
          console.info(`[Experience Engine] Enhanced prompt with history & bibles for scene ${sceneId}:`, finalPrompt);
        } else {
          // No past failures, but we have proactive injections (Character Bible or Gun action)
          if (matchedBible || needsGunTemplate) {
            finalPrompt = `Anime key visual, high-quality professional digital art, sharp focus.【描述主題 (Main Subject Description)】${sceneToGen.visualPrompt}${proactiveInjections}Anime aesthetic, high resolution, no text, no watermark.`.trim();
            console.info(`[Experience Engine] Proactive enhancement with bibles for scene ${sceneId}:`, finalPrompt);
          }
        }
      } catch (err) {
        console.warn("[Experience Engine] Error during failure auto-injection query:", err);
        // Fallback to proactive injection anyway if applicable
        if (matchedBible || needsGunTemplate) {
          finalPrompt = `Anime key visual, high-quality professional digital art, sharp focus.【描述主題 (Main Subject Description)】${sceneToGen.visualPrompt}${proactiveInjections}Anime aesthetic, high resolution, no text, no watermark.`.trim();
        }
      }

      // 1. Pre-check Experience Library for past failures
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
      }"""

app = re.sub(pattern, replacement, app)

payload_pattern = r'(\s+body: JSON\.stringify\(\{\n\s+prompt: finalPrompt,\n\s+negativePrompt: finalNegativePrompt,)'
payload_replacement = r'\1\n          image_reference: startFrameUrl || undefined,'
app = re.sub(payload_pattern, payload_replacement, app)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
