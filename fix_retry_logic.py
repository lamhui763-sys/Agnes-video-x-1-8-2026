import re
import os

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app_ts = f.read()

# 1. We need to add videoFailureRetryCount and handling in handleGenerateVideo
# In handleGenerateVideo polling failure block (around status === "failed"):
# We should replace the immediate fallback logic with retry logic

# First, define what we want to replace in App.tsx
# In handleGenerateVideo:
"""
                      const errString = statusData.error || "Generation process failed";
                      const isPromptIssue = errString.toLowerCase().includes("prompt") || errString.toLowerCase().includes("safety") || errString.toLowerCase().includes("policy") || errString.toLowerCase().includes("violation");
                      
                      logToExperienceLibrary({
                        errorName: "VideoGenerationError",
                        errorMessage: errString,
...
                        resolution: "⚠️ 正在呼叫 AI 經驗圖書館安全防重試與容錯降級工作流（強制合格推進）！"
                      });

                      // Automatically trigger ffmpeg pan-and-scan zoom fallback!
                      setTimeout(() => {
                        handleVideoFallbackToPlaceholder(sceneId, startImageUrlForTransition || s.imageUrl || s.imageUrlExt || s.imageUrlKeyframes || "");
                      }, 100);

                      return {
"""
# We will replace this with logic that checks currentRetryCount
