import sys

with open('server.ts', 'r') as f:
    content = f.read()

endpoint_code = """
app.post("/api/generate-transition-scene", async (req, res) => {
  const { sceneA, sceneB, novelText, artStyle, characters, customApiKey } = req.body;
  
  if (!sceneA || !sceneB) {
    return res.status(400).json({ error: "Missing sceneA or sceneB" });
  }

  const styleText = artStyle || "Anime key visual";
  let characterContext = "";
  if (characters && characters.length > 0) {
    const charsList = characters.map((c: any) => `- Name: ${c.name}, Role: ${c.role || 'N/A'}, Desc: ${c.description || 'N/A'}`).join("\\n");
    characterContext = `\n\nYou must strictly use the following pre-established characters if they appear in the scene:\n${charsList}\nFor the 'character' field, ONLY use names from this list if they are the primary character.`;
  }

  try {
    const systemInstruction = `You are Toonflow's AI Storyboard Director.
Your job is to analyze two adjacent scenes (Scene A and Scene B) and the original novel text.
You must detect the narrative gap and physical motion gap between these two scenes, and generate ONE transition scene that logically bridges them.
The transition scene MUST explicitly describe the character's physical action and movement transitioning from state A to state B.

For the output scene, provide:
1. title: Location and time in Traditional Chinese.
2. dialogue: Any spoken dialogue in Traditional Chinese, or empty "".
3. narration: Background narration in Traditional Chinese, or empty "".
4. character: Primary active character name.
5. visualPrompt: A highly detailed, cinematic English image generation prompt incorporating style "${styleText}".
6. actionPrompt: Detailed English action prompt describing the character's physical transition (e.g. "The girl runs across the street towards the box").
7. transitionPrompt: Detailed English transition prompt for the end of the scene (e.g. "hugs the kitten").
8. durationSeconds: Integer between 3 and 10.
9. audioCue: Traditional Chinese audio ambiance cue.
${characterContext}`;

    const promptText = `
Scene A:
Title: ${sceneA.title}
Visual Prompt: ${sceneA.visualPrompt}
Action Prompt: ${sceneA.actionPrompt || ""}

Scene B:
Title: ${sceneB.title}
Visual Prompt: ${sceneB.visualPrompt}
Action Prompt: ${sceneB.actionPrompt || ""}

Original Novel Text (Context):
${novelText || "Not provided."}

Please generate ONE transition scene object in JSON format bridging Scene A and Scene B.`;

    const response = await generateContentWithFallback({
      model: "gemini-3.5-flash",
      contents: promptText,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          description: "A transition storyboard scene",
          properties: {
            title: { type: Type.STRING },
            dialogue: { type: Type.STRING },
            narration: { type: Type.STRING },
            character: { type: Type.STRING },
            visualPrompt: { type: Type.STRING },
            actionPrompt: { type: Type.STRING },
            transitionPrompt: { type: Type.STRING },
            durationSeconds: { type: Type.INTEGER },
            audioCue: { type: Type.STRING }
          },
          required: ["title", "dialogue", "narration", "character", "visualPrompt", "actionPrompt", "transitionPrompt", "durationSeconds", "audioCue"]
        }
      }
    });

    const parsedScene = JSON.parse(response.text || "{}");
    res.json({ scene: parsedScene });
  } catch (error: any) {
    console.error("[Toonflow] Error generating transition scene:", error);
    res.status(500).json({ error: error.message || "Failed to generate transition scene." });
  }
});
"""

parts = content.split('// Helper to get beautiful, highly context-aware fallback storyboard images from curated premium Unsplash assets')
new_content = parts[0] + endpoint_code + '\n// Helper to get beautiful, highly context-aware fallback storyboard images from curated premium Unsplash assets' + parts[1]

with open('server.ts', 'w') as f:
    f.write(new_content)
