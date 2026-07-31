import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

# Replace the incorrect variables in handleGenerateImage
app = app.replace('let finalSystemPrompt = systemPrompt;', 'const index = activeProject.scenes.findIndex(s => s.id === sceneId);')
app = app.replace('finalSystemPrompt += "\\n[CRITICAL HARD CONSTRAINT]', 'finalPrompt += "\\n[CRITICAL HARD CONSTRAINT]')
app = app.replace('finalSystemPrompt += "\\n[CROSS-SCENE CONSISTENCY]', 'finalPrompt += "\\n[CROSS-SCENE CONSISTENCY]')

# wait, system_prompt: finalSystemPrompt was patched in payload? Let's check my patch script.
# Ah, the user didn't even have system_prompt in the payload, but I might have added it?
# My patch script did: body_replacement = """\g<indent>system_prompt: finalSystemPrompt,\g<nl>\g<indent>image_reference: startFrameUrl || undefined,\g<nl>"""
# Let's remove system_prompt from the payload and replace it with image_reference.

pattern = r'system_prompt: finalSystemPrompt,\n'
app = re.sub(pattern, '', app)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
