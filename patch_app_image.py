import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

# Locate handleGenerateImage API call block
# We want to insert the check before:
# const res = await fetch("/api/generate-image", {
# ...

pattern = r'(?P<indent>[ \t]+)const res = await fetch\("/api/generate-image", \{'

replacement = """\g<indent>// 1. Pre-check Experience Library for past failures
\g<indent>let historicalFailures: string[] = [];
\g<indent>try {
\g<indent>  const expRes = await fetch(`/api/experience-summary?sceneId=${sceneId}`);
\g<indent>  if (expRes.ok) {
\g<indent>    const data = await expRes.json();
\g<indent>    historicalFailures = data.failures || [];
\g<indent>  }
\g<indent>} catch (e) {}

\g<indent>const hasAbstractBgIssue = historicalFailures.some(f => f.toLowerCase().includes("abstract") || f.toLowerCase().includes("gradient") || f.toLowerCase().includes("purple"));
\g<indent>const hasMissingContentIssue = historicalFailures.some(f => f.toLowerCase().includes("content missing") || f.toLowerCase().includes("missing gun") || f.toLowerCase().includes("missing character"));

\g<indent>let finalSystemPrompt = systemPrompt;
\g<indent>if (hasAbstractBgIssue) {
\g<indent>  finalSystemPrompt += "\\n[CRITICAL HARD CONSTRAINT]: NO abstract background, NO gradients. Must be a concrete real environment.";
\g<indent>  if (finalNegativePrompt) finalNegativePrompt += ", gradient, color blocks, abstract background";
\g<indent>}
\g<indent>if (hasMissingContentIssue) {
\g<indent>  finalSystemPrompt += "\\n[CRITICAL HARD CONSTRAINT]: Must contain character, must hold weapon clearly.";
\g<indent>  if (finalNegativePrompt) finalNegativePrompt += ", missing gun, missing character, empty scene";
\g<indent>}

\g<indent>// 2. Cross-scene consistency logic
\g<indent>let startFrameUrl = undefined;
\g<indent>if (index > 0) {
\g<indent>  const prevScene = activeProject.scenes.slice(0, index).reverse().find(s => s.imageUrl);
\g<indent>  if (prevScene) {
\g<indent>     startFrameUrl = prevScene.imageUrl;
\g<indent>     finalPrompt += "\\n[CROSS-SCENE CONSISTENCY]: The character's appearance, clothing, and facial features MUST exactly match the provided previous scene image reference.";
\g<indent>  }
\g<indent>}

\g<indent>const res = await fetch("/api/generate-image", {"""

app = re.sub(pattern, replacement, app, count=1)

# Ensure startFrameUrl is passed as image_reference in the fetch body
#   body: JSON.stringify({
#            prompt: finalPrompt,
#            negative_prompt: finalNegativePrompt,
#            ...

body_pattern = r'(?P<indent>[ \t]+)system_prompt: systemPrompt,(?P<nl>\n)'
body_replacement = """\g<indent>system_prompt: finalSystemPrompt,\g<nl>\g<indent>image_reference: startFrameUrl || undefined,\g<nl>"""
app = re.sub(body_pattern, body_replacement, app, count=1)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
