import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

pattern = r'(isRetryingPolicy: false\n[ \t]*\};\n[ \t]*)(\})(\n[ \t]*return \{)'
# Wait, let's look at the exact text.
#                          videoLogsKeyframes: [...logs, "[SYSTEM] ⚠️ 影片模型生成失敗。自動調度 ffmpeg 進行動態慢速運鏡保底影片生成..."],
#                          isRetryingPolicy: false
#                        };
#                      }
#                      return {
#                        ...s,
#                        videoProgressKeyframes: progress,

pattern2 = r'(isRetryingPolicy: false\n\s*\};\n\s*)(\})(\n\s*return \{\n\s*\.\.\.s,\n\s*videoProgressKeyframes: progress,)'
app = re.sub(pattern2, r'\1}\n\2\3', app)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
