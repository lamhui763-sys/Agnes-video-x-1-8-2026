import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

app = app.replace('else if (activeTab === "scenes_keyframes") handleGenerateVideoKeyframes(sceneId, index);', 
                  'else if (activeTab === "scenes_keyframes") handleGenerateVideo(sceneId, true);')

app = app.replace('handleGenerateVideoKeyframes(sceneId, index);', 'handleGenerateVideo(sceneId, true);')

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
