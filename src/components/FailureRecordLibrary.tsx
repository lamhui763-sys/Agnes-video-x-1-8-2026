import React, { useState, useEffect } from "react";
import { collection, query, where, orderBy, getDocs, limit } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ExperienceEntry } from "../types";
import { 
  AlertOctagon, 
  RefreshCw, 
  CheckCircle, 
  Sparkles, 
  ShieldAlert, 
  FileText, 
  MessageSquare, 
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  History
} from "lucide-react";

interface FailureRecordLibraryProps {
  sceneId: string;
  projectId: string;
  onSelectSuggestion?: (prompt: string) => void;
}

export default function FailureRecordLibrary({ sceneId, projectId, onSelectSuggestion }: FailureRecordLibraryProps) {
  const [records, setRecords] = useState<ExperienceEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (sceneId) {
      fetchSceneFailures();
    }
  }, [sceneId, projectId]);

  const fetchSceneFailures = async () => {
    setLoading(true);
    try {
      // Query experience library records specifically for this scene and project
      const q = query(
        collection(db, "experience_library"),
        where("sceneId", "==", sceneId),
        orderBy("timestamp", "desc"),
        limit(15)
      );
      const snapshot = await getDocs(q);
      const fetched: ExperienceEntry[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        // Filter for failures or reviews that had issues
        if (data.type.includes("error") || data.technical_failure || data.passed === false) {
          fetched.push({ id: doc.id, ...data } as ExperienceEntry);
        }
      });
      setRecords(fetched);
    } catch (err) {
      console.error("[Toonflow] Error fetching scene failures:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!sceneId) {
    return (
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 text-center text-slate-500 text-xs">
        請選擇一個分鏡以檢視其生成與失敗歷史記錄。
      </div>
    );
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <AlertOctagon className="w-5 h-5 text-red-400" />
          <div>
            <h3 className="text-sm font-bold text-slate-200">
              分鏡失敗診斷庫 (Failure Diagnosis)
            </h3>
            <p className="text-[10px] text-slate-400">
              自動分析本鏡頭的歷史生成錯誤、原因及 AI 優化對策
            </p>
          </div>
        </div>
        <button 
          onClick={fetchSceneFailures}
          disabled={loading}
          className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition disabled:opacity-50"
          title="重新整理歷史記錄"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 gap-2">
          <div className="w-4 h-4 border-2 border-orange-500/20 border-t-orange-500 rounded-full animate-spin"></div>
          <span className="text-xs text-slate-500 font-mono">載入診斷數據中...</span>
        </div>
      ) : records.length === 0 ? (
        <div className="bg-slate-950/40 border border-dashed border-slate-850 rounded-xl p-6 text-center">
          <CheckCircle className="w-8 h-8 text-emerald-500/30 mx-auto mb-2" />
          <p className="text-xs text-slate-400 font-medium">本分鏡無任何失敗記錄</p>
          <p className="text-[10px] text-slate-500 mt-1">
            當生成出現錯誤或審核未通過時，詳細的診斷欄位將會顯示於此。
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-red-950/20 border border-red-500/10 rounded-xl p-3 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-red-300">
                ⚠️ 本分鏡歷史上曾發生過 {records.length} 次生成異常或安全審查未通過
              </p>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                系統已自動鎖定並記錄以下每次異常。在下方點擊展開，您可以直接將 AI 的診斷和優化建議套用至提示詞，以避免重複發生。
              </p>
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
            {records.map((rec) => {
              const isExpanded = expandedId === rec.id;
              return (
                <div 
                  key={rec.id}
                  className="bg-slate-950/50 border border-slate-850 rounded-xl overflow-hidden transition hover:border-slate-700"
                >
                  {/* Header */}
                  <div 
                    onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                    className="p-3 cursor-pointer flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-[9px] font-mono uppercase">
                        {rec.failureCategory || rec.category || "生成錯誤"}
                      </span>
                      <span className="text-slate-300 font-medium truncate max-w-[150px]">
                        {rec.errorMessage || rec.rootCause || "未知生成異常"}
                      </span>
                    </div>
                    <span className="text-[9px] text-slate-500 font-mono">
                      {new Date(rec.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Detailed Fields */}
                  {isExpanded && (
                    <div className="p-3 border-t border-slate-850 bg-slate-950/80 space-y-3 text-xs leading-relaxed">
                      {/* Failure Category & Root Cause */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                          <span className="text-[9px] text-slate-500 block mb-0.5 uppercase tracking-wider font-mono">
                            錯誤分類 (Category)
                          </span>
                          <span className="text-red-300 font-medium">
                            {rec.failureCategory || "通用生成異常"}
                          </span>
                        </div>
                        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                          <span className="text-[9px] text-slate-500 block mb-0.5 uppercase tracking-wider font-mono">
                            是否與提示詞相關 (Prompt Issue)
                          </span>
                          <span className={rec.isPromptRelated ? "text-orange-400 font-medium" : "text-slate-300"}>
                            {rec.isPromptRelated ? "🎯 是 (Prompt Related)" : "🔌 否 (Technical / Connection)"}
                          </span>
                        </div>
                      </div>

                      {/* Root Cause */}
                      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                        <span className="text-[9px] text-slate-500 block mb-0.5 uppercase tracking-wider font-mono">
                          根本原因 (Root Cause)
                        </span>
                        <p className="text-slate-300 font-mono text-[11px] break-words">
                          {rec.rootCause || rec.errorMessage || "無詳細描述"}
                        </p>
                      </div>

                      {/* Original Prompt */}
                      {rec.originalPrompt && (
                        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                          <span className="text-[9px] text-slate-500 block mb-0.5 uppercase tracking-wider font-mono">
                            原始提示詞 (Original Prompt)
                          </span>
                          <p className="text-slate-400 italic break-all font-mono text-[11px]">
                            {rec.originalPrompt}
                          </p>
                        </div>
                      )}

                      {/* Generated Result */}
                      {rec.errorMessage && (
                        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                          <span className="text-[9px] text-slate-500 block mb-0.5 uppercase tracking-wider font-mono">
                            生成結果/回傳 (Generated Result)
                          </span>
                          <p className="text-slate-400 font-mono text-[10px] truncate">
                            {rec.errorMessage}
                          </p>
                        </div>
                      )}

                      {/* Critique From System */}
                      {rec.critique && (
                        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                          <span className="text-[9px] text-slate-500 block mb-0.5 uppercase tracking-wider font-mono">
                            系統審核意見 (System Critique)
                          </span>
                          <p className="text-slate-300">
                            {rec.critique}
                          </p>
                        </div>
                      )}

                      {/* AI Improvement Suggestion */}
                      {(rec.aiImprovementSuggestion || rec.optimizedPrompt) && (
                        <div className="bg-slate-900/80 border border-emerald-950 rounded-lg p-2.5 bg-emerald-950/10">
                          <span className="text-[9px] text-emerald-400 block mb-1 uppercase tracking-wider font-mono flex items-center gap-1">
                            <Lightbulb className="w-3 h-3" /> AI 改善與優化提示詞建議 (Improvement Suggestion)
                          </span>
                          <p className="text-emerald-300 font-medium mb-2">
                            {rec.aiImprovementSuggestion || "建議套用以下經對齊優化的提示詞"}
                          </p>
                          {rec.optimizedPrompt && (
                            <div className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 p-2 rounded-md">
                              <span className="text-[10px] text-slate-300 font-mono truncate select-all block max-w-[180px]">
                                {rec.optimizedPrompt}
                              </span>
                              {onSelectSuggestion && (
                                <button
                                  onClick={() => onSelectSuggestion(rec.optimizedPrompt || "")}
                                  className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[9px] font-bold transition shrink-0 cursor-pointer"
                                >
                                  套用建議 Prompt
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Resolution */}
                      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                        <span className="text-[9px] text-slate-500 block mb-0.5 uppercase tracking-wider font-mono">
                          解決方案與狀態 (Resolution Status)
                        </span>
                        <span className="text-emerald-400 font-semibold block">
                          🚀 {rec.resolution || "自動重試 / 容錯降級安全推進"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
