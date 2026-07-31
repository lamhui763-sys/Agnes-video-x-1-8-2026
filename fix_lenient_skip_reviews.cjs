/**
 * fix_lenient_skip_reviews.cjs
 * When strictWorkflowLock is OFF (Lenient):
 * - Skip STEP 4 (image review) entirely
 * - Skip video review inside STEP 6
 * Effectively reduces 7-step master workflow to 5 steps.
 * V3: dual safety — early block skip + continue before review API
 */
const fs = require("fs");
const path = require("path");

const APP = path.join(process.cwd(), "src", "App.tsx");
if (!fs.existsSync(APP)) {
  console.error("[fix_lenient_skip_reviews] src/App.tsx not found");
  process.exit(0);
}

let src = fs.readFileSync(APP, "utf8");
const original = src;

const MARKER = "TOONFLOW_LENIENT_SKIP_REVIEWS_V3";
if (src.includes(MARKER)) {
  console.log("[fix_lenient_skip_reviews] already applied (V3)");
  process.exit(0);
}

// Remove older markers so we can re-apply cleanly if partial V1/V2 exists
src = src.replace(/TOONFLOW_LENIENT_SKIP_REVIEWS_V[12]/g, MARKER);

// ========== 1) STEP 4: wrap with Lenient early-skip ==========
const STEP4_LOG = 'setFullAutoLogs(prev => [...prev, "🎬 [步驟 4] AI 正在檢查所有首幀合理性與故事連貫性..."]);';
if (!src.includes(STEP4_LOG)) {
  console.error("[fix_lenient_skip_reviews] STEP 4 log line not found");
  process.exit(1);
}

// Only inject if not already wrapped
if (!src.includes("步驟 4 已跳過") || !src.includes(MARKER)) {
  const step4Inject = [
    "",
    "      // " + MARKER,
    "      if (!strictWorkflowLock) {",
    "        // Lenient: skip ALL image reviews → 7-step becomes 5-step",
    '        setFullAutoLogs(prev => [...prev, "🔓 [步驟 4 已跳過] 嚴格鎖關閉 (Lenient)：所有首幀審查直接通過，進入 5 步極速流程..."]);',
    "        for (let i = 0; i < currentScenes.length; i++) {",
    "          const scene = currentScenes[i];",
    "          updateActiveProject((prev) => ({",
    "            scenes: prev.scenes.map(s => s.id === scene.id ? {",
    "              ...s,",
    "              step4ImageReviewScore: 100,",
    '              step4ImageReviewText: "（Lenient 模式）已跳過圖片審查，直接通過。",',
    "              step4Passed: true,",
    "              isReviewingStep4: false,",
    "              workflowStep: 4",
    "            } : s)",
    "          }));",
    "          try {",
    '            const curList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];',
    "            const updatedList = curList.map(p => p.id === activeProjectId ? {",
    "              ...p,",
    "              scenes: p.scenes.map(s => s.id === scene.id ? {",
    "                ...s,",
    "                step4ImageReviewScore: 100,",
    '                step4ImageReviewText: "（Lenient 模式）已跳過圖片審查，直接通過。",',
    "                step4Passed: true,",
    "                isReviewingStep4: false,",
    "                workflowStep: 4",
    "              } : s)",
    "            } : p);",
    '            localStorage.setItem("toonflow_projects", JSON.stringify(updatedList));',
    '            localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());',
    "          } catch(e) {}",
    "        }",
    '        setFullAutoLogs(prev => [...prev, "✅ [步驟 4] 全部鏡頭圖片審查已跳過並標記通過。"]);',
    "      } else {",
    "      " + STEP4_LOG,
  ].join("\n");

  src = src.replace(STEP4_LOG, step4Inject);
}

// Close else before STEP 5
const STEP5_COMMENT = "// STEP 5: 用戶確認所有首幀";
if (src.includes(STEP5_COMMENT) && !src.includes("end strict STEP 4 else")) {
  src = src.replace(
    STEP5_COMMENT,
    "} // end strict STEP 4 else (Lenient already auto-passed)\n\n      " + STEP5_COMMENT
  );
}

// ========== 2) STEP 6: after video ready, Lenient skips review ==========
const VID_READY = "影片已就緒，正在進行 AI 影片品質與鏡頭運動審核";
const vIdx = src.indexOf(VID_READY);
if (vIdx === -1) {
  console.warn("[fix_lenient_skip_reviews] video-ready log not found; STEP 4 skip still applied");
} else if (!src.includes("嚴格鎖關閉：跳過影片審查")) {
  const afterSemi = src.indexOf(");", vIdx);
  if (afterSemi !== -1) {
    const injectAt = afterSemi + 2;
    const lenientSkip = [
      "",
      "",
      "              // Lenient: skip video review entirely (" + MARKER + ")",
      "              if (!strictWorkflowLock) {",
      "                setFullAutoLogs(prev => [...prev, `🔓 [鏡頭 ${i + 1}] 嚴格鎖關閉：跳過影片審查，直接通過。`]);",
      "                updateActiveProject((prev) => ({",
      "                  scenes: prev.scenes.map(s => s.id === scene.id ? {",
      "                    ...s,",
      "                    step6VideoReviewScore: 100,",
      '                    step6VideoReviewText: "（Lenient 模式）已跳過影片審查，直接通過。",',
      "                    step6Passed: true,",
      "                    workflowStep: 6",
      "                  } : s)",
      "                }));",
      "                try {",
      '                  const curList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];',
      "                  const updatedList = curList.map(p => p.id === activeProjectId ? {",
      "                    ...p,",
      "                    scenes: p.scenes.map(s => s.id === scene.id ? {",
      "                      ...s,",
      "                      step6VideoReviewScore: 100,",
      '                      step6VideoReviewText: "（Lenient 模式）已跳過影片審查，直接通過。",',
      "                      step6Passed: true,",
      "                      workflowStep: 6",
      "                    } : s)",
      "                  } : p);",
      '                  localStorage.setItem("toonflow_projects", JSON.stringify(updatedList));',
      '                  localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());',
      "                } catch(e) {}",
      "                videoSuccess = true;",
      "                continue;",
      "              }",
      "",
    ].join("\n");
    src = src.slice(0, injectAt) + lenientSkip + src.slice(injectAt);
  }
}

// ========== 3) Toast + UI text ==========
src = src.replace(
  'showToast(newVal ? "🔒 七步嚴格工作流鎖已開啟：若未完全通過7步，將嚴格重試或暫停，絕不跳鏡！" : "🔓 七步嚴格工作流鎖已關閉：故障時將容錯並安全跳過。", "info");',
  'showToast(newVal ? "🔒 七步嚴格工作流鎖已開啟：圖片/影片審查必過，未通過會重試或暫停。" : "🔓 嚴格鎖已關閉 (5步極速)：跳過全部圖片與影片審查，直接生成。", "info");'
);

src = src.replace(
  /showToast\(newVal \? "🔒 七步嚴格工作流鎖已開啟：[^"\n]+" : "🔓 [^"\n]+", "info"\);/,
  'showToast(newVal ? "🔒 七步嚴格工作流鎖已開啟：圖片/影片審查必過，未通過會重試或暫停。" : "🔓 嚴格鎖已關閉 (5步極速)：跳過全部圖片與影片審查，直接生成。", "info");'
);

src = src.replace(/🔒 開啟 \(Strict Lock\)/g, "🔒 開啟 (Strict · 7步含審查)");
src = src.replace(/🔓 關閉 \(Lenient Mode\)/g, "🔓 關閉 (Lenient · 5步跳過審查)");

src = src.replace(
  '"🎥 正在啟動最新分鏡劇本首尾幀 7 步 Check List 大師工作流..."',
  'strictWorkflowLock ? "🎥 正在啟動最新分鏡劇本首尾幀 7 步 Check List 大師工作流..." : "⚡ 正在啟動 5 步極速工作流（已跳過圖片/影片審查）..."'
);

src = src.replace(
  /當前為容錯降級模式，故障或不合格時會自動安全繞過並推進。/g,
  "嚴格鎖已關閉：跳過全部圖片與影片審查，走 5 步極速流程。"
);

src = src.replace(
  "故障或審核不合格時自動容錯降級，安全繞過並強制拼接成片。",
  "已關閉嚴格鎖：跳過全部圖片與影片審查，改走 5 步極速流程。"
);

if (src === original) {
  console.error("[fix_lenient_skip_reviews] no changes applied");
  process.exit(1);
}

fs.writeFileSync(APP, src, "utf8");
console.log("[fix_lenient_skip_reviews] applied successfully (V3)");
