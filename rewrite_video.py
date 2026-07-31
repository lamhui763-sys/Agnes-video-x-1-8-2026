import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

# 1. Update signature of handleGenerateVideo
app = re.sub(
    r'const handleGenerateVideo = async \(sceneId: string, force = false\) => \{',
    r'const handleGenerateVideo = async (sceneId: string, force = false, retryCount = 0) => {',
    app
)

# 2. Update signature of handleGenerateVideoExtended
app = re.sub(
    r'const handleGenerateVideoExtended = async \(sceneId: string, index: number\) => \{',
    r'const handleGenerateVideoExtended = async (sceneId: string, index: number, retryCount = 0) => {',
    app
)

# 3. Enhance the prompt building and negative prompt inside handleGenerateVideo
target_prompt_vid1 = '''      const dialogueAddon = targetScene.dialogue ? ` (lips speaking and mouth moving to speak. The character is actively talking with realistic mouth movements, speaking: "${targetScene.dialogue}". The video must be completely clean with ABSOLUTELY NO SUBTITLES, no burned-in text, no on-screen text, no words, no captions, no letters).` : " No character is talking, no lip movement. Mouth closed and completely still.";
      const narrationAddon = targetScene.narration ? ` (Narrator voiceover atmospheric ambiance, character is not speaking, lips closed, completely clean video, absolutely no subtitles, no on-screen text, no captions, no words, no letters. No character is talking, no lip movement).` : "";
      const actionAddon = targetScene.actionPrompt ? ` Action and movement: ${targetScene.actionPrompt}. ` : " ";
      const transitionAddon = targetScene.transitionPrompt ? ` Transition action: ${targetScene.transitionPrompt}. ` : " ";
      const notesAddon = targetScene.directorNotes ? ` Director's notes: ${targetScene.directorNotes}. ` : " ";
      const enhancedPrompt = `${targetScene.visualPrompt}.${actionAddon}${transitionAddon}${dialogueAddon}${narrationAddon}${notesAddon} ABSOLUTELY NO SUBTITLES, NO TEXT, NO WATERMARKS, CLEAN VIDEO, PURE CINEMATIC VISUALS. [CRITICAL CLOTHING CONSISTENCY]: The character MUST wear the exact clothing described in their Description. (Advanced camera movement and cinematic lighting, natural human behavior, realistic high-fidelity video, masterwork.) Style: ${characterObj?.artStyle || activeProject.artStyle}. Character: ${targetScene.character}, Description: ${charDesc}. ${videoProactiveInjections}`;

      // Dynamic Negative Prompt reinforcement for Video
      let finalNegativePrompt = targetScene.negativePrompt || "";
      const baseNegatives = "abstract background, gradient, color blocks, fluid colors, blurry background, missing character, missing weapon, deformed hands";
      if (finalNegativePrompt) {
        if (!finalNegativePrompt.toLowerCase().includes("abstract background")) {
          finalNegativePrompt = `${finalNegativePrompt}, ${baseNegatives}`;
        }
      } else {
        finalNegativePrompt = baseNegatives;
      }
      if (needsGunTemplate) {
        finalNegativePrompt += ", hands not holding gun, gun floating, missing weapon, hands not gripping pistol, blurry gun, deformed weapon";
      }
      finalNegativePrompt += ", sudden pose change, character appearance inconsistency, missing gun, deformed hands at start, jump cuts, chaotic camera movement";'''

replacement_vid1 = '''      const dialogueAddon = targetScene.dialogue ? ` (lips speaking and mouth moving to speak. The character is actively talking with realistic mouth movements, speaking: "${targetScene.dialogue}". The video must be completely clean with ABSOLUTELY NO SUBTITLES, no burned-in text, no on-screen text, no words, no captions, no letters).` : " No character is talking, no lip movement. Mouth closed and completely still.";
      const narrationAddon = targetScene.narration ? ` (Narrator voiceover atmospheric ambiance, character is not speaking, lips closed, completely clean video, absolutely no subtitles, no on-screen text, no captions, no words, no letters. No character is talking, no lip movement).` : "";
      let actionAddon = targetScene.actionPrompt ? ` Action and movement: ${targetScene.actionPrompt}. ` : " ";
      let transitionAddon = targetScene.transitionPrompt ? ` Transition action: ${targetScene.transitionPrompt}. ` : " ";
      const notesAddon = targetScene.directorNotes ? ` Director's notes: ${targetScene.directorNotes}. ` : " ";
      let cameraAddon = "(Advanced camera movement and cinematic lighting, natural human behavior, realistic high-fidelity video, masterwork.)";

      // Downgrade prompt complexity on 3rd-4th attempt (retryCount >= 2)
      if (retryCount >= 2) {
        actionAddon = " ";
        transitionAddon = " ";
        cameraAddon = "(Static camera, clear subject, cinematic lighting, natural human behavior, realistic high-fidelity video, masterwork.)";
        console.log(`[Video Gen] Retry ${retryCount + 1}: Downgrading prompt complexity (removed camera/action descriptors).`);
      }

      let enhancedPrompt = `${targetScene.visualPrompt}.${actionAddon}${transitionAddon}${dialogueAddon}${narrationAddon}${notesAddon} ABSOLUTELY NO SUBTITLES, NO TEXT, NO WATERMARKS, CLEAN VIDEO, PURE CINEMATIC VISUALS. [CRITICAL CLOTHING CONSISTENCY]: The character MUST wear the exact clothing described in their Description. ${cameraAddon} Style: ${characterObj?.artStyle || activeProject.artStyle}. Character: ${targetScene.character}, Description: ${charDesc}. ${videoProactiveInjections}`;

      // Dynamic Negative Prompt reinforcement for Video
      let finalNegativePrompt = targetScene.negativePrompt || "";
      const baseNegatives = "abstract background, gradient, color blocks, fluid colors, blurry background, missing character, missing weapon, deformed hands";
      if (finalNegativePrompt) {
        if (!finalNegativePrompt.toLowerCase().includes("abstract background")) {
          finalNegativePrompt = `${finalNegativePrompt}, ${baseNegatives}`;
        }
      } else {
        finalNegativePrompt = baseNegatives;
      }
      if (needsGunTemplate) {
        finalNegativePrompt += ", hands not holding gun, gun floating, missing weapon, hands not gripping pistol, blurry gun, deformed weapon";
      }
      finalNegativePrompt += ", sudden pose change, character appearance inconsistency, missing gun, deformed hands at start, jump cuts, chaotic camera movement";

      // Apply historical failure constraints (Experience Library)
      let historicalFailures: string[] = [];
      try {
        const expRes = await fetch(`/api/experience-summary?sceneId=${sceneId}`);
        if (expRes.ok) {
          const data = await expRes.json();
          historicalFailures = data.failures || [];
        }
      } catch (e) {}
      
      const hasContentMissing = historicalFailures.some(f => f.toLowerCase().includes("content missing") || f.toLowerCase().includes("missing gun"));
      const hasAbstractBg = historicalFailures.some(f => f.toLowerCase().includes("abstract") || f.toLowerCase().includes("gradient"));
      
      if (hasContentMissing) {
        enhancedPrompt += "\\n[CRITICAL HARD CONSTRAINT]: Must contain character, must hold weapon clearly.";
        finalNegativePrompt += ", missing gun, empty scene, character missing";
      }
      if (hasAbstractBg) {
        enhancedPrompt += "\\n[CRITICAL HARD CONSTRAINT]: NO abstract background, NO gradients. Must be a concrete real environment.";
        finalNegativePrompt += ", gradient, abstract background";
      }'''

app = app.replace(target_prompt_vid1, replacement_vid1)

# 4. Do the same for handleGenerateVideoExtended
target_prompt_vid2 = '''      const dialogueAddon = targetScene.dialogue ? ` (lips speaking and mouth moving to speak. The character is actively talking with realistic mouth movements, speaking: "${targetScene.dialogue}". The video must be completely clean with ABSOLUTELY NO SUBTITLES, no burned-in text, no on-screen text, no words, no captions, no letters).` : " No character is talking, no lip movement. Mouth closed and completely still.";
      const narrationAddon = targetScene.narration ? ` (Narrator voiceover atmospheric ambiance, character is not speaking, lips closed, completely clean video, absolutely no subtitles, no on-screen text, no captions, no words, no letters. No character is talking, no lip movement).` : "";
      const actionAddon = targetScene.actionPrompt ? ` Action and movement: ${targetScene.actionPrompt}. ` : " ";
      const transitionAddon = targetScene.transitionPrompt ? ` Transition action: ${targetScene.transitionPrompt}. ` : " ";
      const notesAddon = targetScene.directorNotes ? ` Director's notes: ${targetScene.directorNotes}. ` : " ";
      const enhancedPrompt = `${targetScene.visualPrompt}.${actionAddon}${transitionAddon}${dialogueAddon}${narrationAddon}${notesAddon} ABSOLUTELY NO SUBTITLES, NO TEXT, NO WATERMARKS, CLEAN VIDEO, PURE CINEMATIC VISUALS. [CRITICAL CLOTHING CONSISTENCY]: The character MUST wear the exact clothing described in their Description. (Advanced camera movement and cinematic lighting, natural human behavior, realistic high-fidelity video, masterwork.) Style: ${characterObj?.artStyle || freshActiveProject.artStyle}. Character: ${targetScene.character}, Description: ${charDesc}. ${videoProactiveInjections}`;

      // Dynamic Negative Prompt reinforcement for Video
      let finalNegativePrompt = targetScene.negativePrompt || "";
      const baseNegatives = "abstract background, gradient, color blocks, fluid colors, blurry background, missing character, missing weapon, deformed hands";
      if (finalNegativePrompt) {
        if (!finalNegativePrompt.toLowerCase().includes("abstract background")) {
          finalNegativePrompt = `${finalNegativePrompt}, ${baseNegatives}`;
        }
      } else {
        finalNegativePrompt = baseNegatives;
      }
      if (needsGunTemplate) {
        finalNegativePrompt += ", hands not holding gun, gun floating, missing weapon, hands not gripping pistol, blurry gun, deformed weapon";
      }
      finalNegativePrompt += ", sudden pose change, character appearance inconsistency, missing gun, deformed hands at start, jump cuts, chaotic camera movement";'''

replacement_vid2 = '''      const dialogueAddon = targetScene.dialogue ? ` (lips speaking and mouth moving to speak. The character is actively talking with realistic mouth movements, speaking: "${targetScene.dialogue}". The video must be completely clean with ABSOLUTELY NO SUBTITLES, no burned-in text, no on-screen text, no words, no captions, no letters).` : " No character is talking, no lip movement. Mouth closed and completely still.";
      const narrationAddon = targetScene.narration ? ` (Narrator voiceover atmospheric ambiance, character is not speaking, lips closed, completely clean video, absolutely no subtitles, no on-screen text, no captions, no words, no letters. No character is talking, no lip movement).` : "";
      let actionAddon = targetScene.actionPrompt ? ` Action and movement: ${targetScene.actionPrompt}. ` : " ";
      let transitionAddon = targetScene.transitionPrompt ? ` Transition action: ${targetScene.transitionPrompt}. ` : " ";
      const notesAddon = targetScene.directorNotes ? ` Director's notes: ${targetScene.directorNotes}. ` : " ";
      let cameraAddon = "(Advanced camera movement and cinematic lighting, natural human behavior, realistic high-fidelity video, masterwork.)";

      // Downgrade prompt complexity on 3rd-4th attempt (retryCount >= 2)
      if (retryCount >= 2) {
        actionAddon = " ";
        transitionAddon = " ";
        cameraAddon = "(Static camera, clear subject, cinematic lighting, natural human behavior, realistic high-fidelity video, masterwork.)";
        console.log(`[Video Gen Ext] Retry ${retryCount + 1}: Downgrading prompt complexity (removed camera/action descriptors).`);
      }

      let enhancedPrompt = `${targetScene.visualPrompt}.${actionAddon}${transitionAddon}${dialogueAddon}${narrationAddon}${notesAddon} ABSOLUTELY NO SUBTITLES, NO TEXT, NO WATERMARKS, CLEAN VIDEO, PURE CINEMATIC VISUALS. [CRITICAL CLOTHING CONSISTENCY]: The character MUST wear the exact clothing described in their Description. ${cameraAddon} Style: ${characterObj?.artStyle || freshActiveProject.artStyle}. Character: ${targetScene.character}, Description: ${charDesc}. ${videoProactiveInjections}`;

      // Dynamic Negative Prompt reinforcement for Video
      let finalNegativePrompt = targetScene.negativePrompt || "";
      const baseNegatives = "abstract background, gradient, color blocks, fluid colors, blurry background, missing character, missing weapon, deformed hands";
      if (finalNegativePrompt) {
        if (!finalNegativePrompt.toLowerCase().includes("abstract background")) {
          finalNegativePrompt = `${finalNegativePrompt}, ${baseNegatives}`;
        }
      } else {
        finalNegativePrompt = baseNegatives;
      }
      if (needsGunTemplate) {
        finalNegativePrompt += ", hands not holding gun, gun floating, missing weapon, hands not gripping pistol, blurry gun, deformed weapon";
      }
      finalNegativePrompt += ", sudden pose change, character appearance inconsistency, missing gun, deformed hands at start, jump cuts, chaotic camera movement";

      // Apply historical failure constraints (Experience Library)
      let historicalFailures: string[] = [];
      try {
        const expRes = await fetch(`/api/experience-summary?sceneId=${sceneId}`);
        if (expRes.ok) {
          const data = await expRes.json();
          historicalFailures = data.failures || [];
        }
      } catch (e) {}
      
      const hasContentMissing = historicalFailures.some(f => f.toLowerCase().includes("content missing") || f.toLowerCase().includes("missing gun"));
      const hasAbstractBg = historicalFailures.some(f => f.toLowerCase().includes("abstract") || f.toLowerCase().includes("gradient"));
      
      if (hasContentMissing) {
        enhancedPrompt += "\\n[CRITICAL HARD CONSTRAINT]: Must contain character, must hold weapon clearly.";
        finalNegativePrompt += ", missing gun, empty scene, character missing";
      }
      if (hasAbstractBg) {
        enhancedPrompt += "\\n[CRITICAL HARD CONSTRAINT]: NO abstract background, NO gradients. Must be a concrete real environment.";
        finalNegativePrompt += ", gradient, abstract background";
      }'''

app = app.replace(target_prompt_vid2, replacement_vid2)


with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
