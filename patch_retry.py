import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

# Replace for all 3 functions by regexing the exact block inside `if (statusData.status === "failed")`
# It's inside a `scenes: p.scenes.map(s => s.id === sceneId ? {` scope.

target_block = r'''                      clearInterval\(intervalId\);
                      delete videoIntervalsRef\.current\[sceneId\];
                      
                      const errString = statusData\.error \|\| "Generation process failed";
                      const isPromptIssue = errString\.toLowerCase\(\)\.includes\("prompt"\) \|\| errString\.toLowerCase\(\)\.includes\("safety"\) \|\| errString\.toLowerCase\(\)\.includes\("policy"\) \|\| errString\.toLowerCase\(\)\.includes\("violation"\);
                      
                      logToExperienceLibrary\(\{
                        errorName: "VideoGenerationError",
                        errorMessage: errString,
                        category: "video_generation",
                        projectId: activeProjectId \|\| undefined,
                        sceneId: sceneId,
                        failureCategory: "video_generation",
                        rootCause: errString,
                        isPromptRelated: isPromptIssue,
                        originalPrompt: s\.visualPrompt \|\| "",
                        generatedResult: "Failed to render video",
                        critiqueFromSystem: errString,
                        aiImprovementSuggestion: isPromptIssue 
                          \? "提示詞觸發了底層影片模型的安全政策。請移除非必要的安全敏感、人名或物理衝突描述。"
                          : "影片生成連線逾時或算力短缺。建議啟用容錯降級（強制合格）以避免工作流中斷。",
                        resolution: "⚠️ 正在呼叫 AI 經驗圖書館安全防重試與容錯降級工作流（強制合格推進）！"
                      \}\);
                      // Automatically trigger ffmpeg pan-and-scan zoom fallback!
                      setTimeout\(\(\) => \{
                        handleVideoFallbackToPlaceholder\(sceneId, .*?\);
                      \}, 100\);
                      return \{
                        \.\.\.s,
                        \[progressField\]: "50%",
                        \[logsField\]: \[\.\.\.logs, "\[SYSTEM\] ⚠️ 影片模型生成失敗。自動調度 ffmpeg 進行動態慢速運鏡保底影片生成\.\.\."\],
                        isRetryingPolicy: false,
                        \[apiLatencyField\]: statusData\.apiLatency \|\| \(s as any\)\[apiLatencyField\],
                        \[downloadLatencyField\]: statusData\.downloadLatency \|\| \(s as any\)\[downloadLatencyField\],
                        \[resourceAllocationField\]: statusData\.resourceAllocation \|\| \(s as any\)\[resourceAllocationField\]
                      \};'''

def replacement(match):
    fallback_args = match.group(0).split('handleVideoFallbackToPlaceholder(sceneId, ')[1].split(');')[0]
    return f'''                      clearInterval(intervalId);
                      delete videoIntervalsRef.current[sceneId];
                      
                      const errString = statusData.error || "Generation process failed";
                      const isPromptIssue = errString.toLowerCase().includes("prompt") || errString.toLowerCase().includes("safety") || errString.toLowerCase().includes("policy") || errString.toLowerCase().includes("violation");
                      
                      logToExperienceLibrary({{
                        errorName: "VideoGenerationError",
                        errorMessage: errString,
                        category: "video_generation",
                        projectId: activeProjectId || undefined,
                        sceneId: sceneId,
                        failureCategory: errString.includes("content missing") ? "Content Missing" : (errString.includes("abstract") ? "Abstract Background" : "video_generation"),
                        rootCause: errString,
                        isPromptRelated: isPromptIssue,
                        originalPrompt: s.visualPrompt || "",
                        generatedResult: "Failed to render video",
                        critiqueFromSystem: errString,
                        aiImprovementSuggestion: "分級重試機制觸發",
                        resolution: retryCount < 4 ? `嘗試重新發起影片生成 (第 ${{retryCount + 1}} 次重試)` : "5次失敗，已觸發保底首幀並強制通過"
                      }});

                      if (retryCount < 4) {{
                        const isExt = activeTab === "scenes_ext";
                        const isKey = activeTab === "scenes_keyframes";
                        setTimeout(() => {{
                           if (isExt) handleGenerateVideoExtended(sceneId, index, retryCount + 1);
                           else if (isKey) handleGenerateVideoKeyframes(sceneId, index, retryCount + 1);
                           else handleGenerateVideo(sceneId, true, retryCount + 1);
                        }}, 2000);
                        return {{
                          ...s,
                          [logsField]: [...logs, `[SYSTEM] 影片模型生成失敗。自動發起第 ${{retryCount + 1}}/4 次重試...`],
                          isRetryingPolicy: true,
                          [apiLatencyField]: statusData.apiLatency || (s as any)[apiLatencyField]
                        }};
                      }} else {{
                        // Automatically trigger ffmpeg pan-and-scan zoom fallback!
                        setTimeout(() => {{
                          handleVideoFallbackToPlaceholder(sceneId, {fallback_args});
                        }}, 100);
                        return {{
                          ...s,
                          [progressField]: "50%",
                          [logsField]: [...logs, "[SYSTEM] ⚠️ 影片模型重試 5 次皆失敗。自動調度 ffmpeg 進行動態慢速運鏡保底影片生成..."],
                          isRetryingPolicy: false,
                          isForcePassed: true,
                          [apiLatencyField]: statusData.apiLatency || (s as any)[apiLatencyField],
                          [downloadLatencyField]: statusData.downloadLatency || (s as any)[downloadLatencyField],
                          [resourceAllocationField]: statusData.resourceAllocation || (s as any)[resourceAllocationField]
                        }};
                      }}'''

app = re.sub(target_block, replacement, app, flags=re.DOTALL)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
