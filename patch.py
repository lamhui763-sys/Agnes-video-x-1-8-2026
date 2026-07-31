import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# handleGenerateVideo
content = re.sub(
    r'(const statusData = await statusRes\.json\(\);\s*)(setProjects\(prevProjects => {\s*const updatedList = prevProjects\.map\(p => {\s*if \(p\.id === activeProjectId\) {\s*const updatedScenes = p\.scenes\.map\(s => {\s*if \(s\.id === sceneId\) {\s*const logs = statusData\.logs)',
    r'\1if (statusData.status === "failed") {\n            const handled = await handlePolicyViolation(\n              sceneId, \n              statusData, \n              intervalId, \n              logsField, \n              isGenField, \n              errorField, \n              errorCodeField, \n              () => handleGenerateVideo(sceneId)\n            );\n            if (handled) return;\n          }\n          \2',
    content,
    count=1
)

# handleGenerateVideoExtended
content = re.sub(
    r'(const statusData = await statusRes\.json\(\);\s*)(setProjects\(prevProjects => {\s*const updatedList = prevProjects\.map\(p => {\s*if \(p\.id === activeProjectId\) {\s*const updatedScenes = p\.scenes\.map\(s => {\s*if \(s\.id === sceneId\) {\s*const logs = statusData\.logs)',
    r'\1if (statusData.status === "failed") {\n            const handled = await handlePolicyViolation(\n              sceneId, \n              statusData, \n              intervalId, \n              "videoLogsExt", \n              "isGeneratingVideoExt", \n              "videoErrorExt", \n              "videoErrorExtCode", \n              () => handleGenerateVideoExtended(sceneId, index)\n            );\n            if (handled) return;\n          }\n          \2',
    content,
    count=1
)

# handleGenerateVideoKeyframes
content = re.sub(
    r'(const statusData = await statusRes\.json\(\);\s*)(setProjects\(prevProjects => {\s*const updatedList = prevProjects\.map\(p => {\s*if \(p\.id === activeProjectId\) {\s*const updatedScenes = p\.scenes\.map\(s => {\s*if \(s\.id === sceneId\) {\s*const logs = statusData\.logs)',
    r'\1if (statusData.status === "failed") {\n            const handled = await handlePolicyViolation(\n              sceneId, \n              statusData, \n              intervalId, \n              "videoLogsKeyframes", \n              "isGeneratingVideoKeyframes", \n              "videoErrorKeyframes", \n              "videoErrorKeyframesCode", \n              () => handleGenerateVideoKeyframes(sceneId, index)\n            );\n            if (handled) return;\n          }\n          \2',
    content,
    count=1
)

with open('src/App.tsx', 'w') as f:
    f.write(content)
