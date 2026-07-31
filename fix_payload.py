import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

# For video generation, remove `image_reference: startFrameUrl || undefined,`
# There are 3 API calls: image, video, videoExt (maybe more).
# Only image gen uses `const res = await fetch("/api/generate-image"`
# Let's just find `image_reference: startFrameUrl || undefined,` under `/api/generate-video` and remove it.

app = re.sub(r'fetch\("/api/generate-video[^"]*", \{.*?(image_reference: startFrameUrl \|\| undefined,\n\s*)', 
             lambda m: m.group(0).replace(m.group(1), ''), app, flags=re.DOTALL)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
