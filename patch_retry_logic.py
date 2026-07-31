import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

# We need to find the block for both handleGenerateVideo and handleGenerateVideoExtended
# Let's search for "const isPromptIssue = errString.toLowerCase().includes("prompt") ||"
# and the logToExperienceLibrary block

block_pattern = r'(?P<indent>[ \t]+)const errString = statusData\.error \|\| "Generation process failed";\s+const isPromptIssue = errString\.toLowerCase\(\)\.includes\("prompt"\) \|\|.*?\s+logToExperienceLibrary\(\{\s+errorName: "Video(Keyframe)?GenerationError".*?\}\);\s+// Automatically trigger ffmpeg pan-and-scan zoom fallback!\s+setTimeout\(\(\) => \{\s+handleVideoFallbackToPlaceholder\(.*?\);\s+\}, 100\);\s+return \{'

# Wait, `VideoGenerationError` is used in standard/extended, `VideoKeyframeGenerationError` in keyframes?
# Let's just find `statusData.error || "Generation process failed"` up to `return {`

def replacer(match):
    indent = match.group(1)
    return f"""{indent}const currentRetryCount = (s as any).videoFailureRetryCount || 0;
{indent}const errString = statusData.error || "Generation process failed";
{indent}const isPromptIssue = errString.toLowerCase().includes("prompt") || errString.toLowerCase().includes("safety") || errString.toLowerCase().includes("policy") || errString.toLowerCase().includes("violation");

{indent}if (currentRetryCount < 4) {{
{indent}  // 1-4 times retry
{indent}  setTimeout(() => {{
{indent}     updateActiveProject(prev => ({{
{indent}       scenes: prev.scenes.map(sc => sc.id === sceneId ? {{
{indent}         ...sc,
{indent}         videoFailureRetryCount: currentRetryCount + 1
{indent}       }} : sc)
{indent}     }}));
{indent}     // Re-trigger video gen
{indent}     if (activeTab === "scenes_ext") handleGenerateVideoExtended(sceneId, index);
{indent}     else if (activeTab === "scenes_keyframes") handleGenerateVideoKeyframes(sceneId, index);
{indent}     else handleGenerateVideo(sceneId, true);
{indent}  }}, 1500);
{indent}  
{indent}  return {{
{indent}    ...s,
{indent}    [logsField]: [...logs, `[SYSTEM] 影片生成失敗，進行第 ${{currentRetryCount + 1}} 次重試...`],
{indent}    [progressField]: "50%"
{indent}  }};
{indent}}} else {{
{indent}  // 5th time -> fallback
{indent}  logToExperienceLibrary({{
{indent}    errorName: "VideoGenerationError",
{indent}    errorMessage: errString,
{indent}    category: "video_generation",
{indent}    projectId: activeProjectId || undefined,
{indent}    sceneId: sceneId,
{indent}    failureCategory: "video_generation",
{indent}    rootCause: errString,
{indent}    isPromptRelated: isPromptIssue,
{indent}    originalPrompt: s.visualPrompt || "",
{indent}    generatedResult: "Failed to render video after 5 attempts",
{indent}    critiqueFromSystem: errString,
{indent}    aiImprovementSuggestion: "影片生成多次失敗，觸發強制合格保底機制。",
{indent}    resolution: "⚠️ 呼叫 handleVideoFallbackToPlaceholder 使用首幀保底 (isForcePassed: true)"
{indent}  }});
{indent}
{indent}  setTimeout(() => {{
{indent}    handleVideoFallbackToPlaceholder(sceneId, (s as any).imageUrl || (s as any).imageUrlExt || (s as any).imageUrlKeyframes || "");
{indent}  }}, 100);
{indent}
{indent}  return {{"""

app = re.sub(block_pattern, replacer, app, flags=re.DOTALL)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
