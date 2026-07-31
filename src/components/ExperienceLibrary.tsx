import React, { useState, useEffect } from "react";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ExperienceEntry } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { 
  BrainCircuit, 
  Search, 
  Filter, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  History,
  Lightbulb,
  Zap,
  Download,
  Bug,
  Server,
  Cloud,
  FileJson
} from "lucide-react";
import clsx from "clsx";
import FailureRecordLibrary from "./FailureRecordLibrary";

interface ExperienceLibraryProps {
  activeProjectId?: string;
  scenes?: any[];
  onApplySuggestion?: (sceneId: string, newPrompt: string) => void;
}

export default function ExperienceLibrary({ activeProjectId, scenes = [], onApplySuggestion }: ExperienceLibraryProps) {
  const [entries, setEntries] = useState<ExperienceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "review" | "error">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string>(scenes[0]?.id || "");

  // Update selected scene if scenes load
  useEffect(() => {
    if (scenes && scenes.length > 0 && !selectedSceneId) {
      setSelectedSceneId(scenes[0].id);
    }
  }, [scenes]);

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "experience_library"),
        orderBy("timestamp", "desc"),
        limit(200)
      );
      const snapshot = await getDocs(q);
      const fetchedEntries: ExperienceEntry[] = [];
      snapshot.forEach(doc => {
        fetchedEntries.push({ id: doc.id, ...doc.data() } as ExperienceEntry);
      });
      setEntries(fetchedEntries);
    } catch (err: any) {
      console.warn("Experience library query bypassed or quota limit reached:", err?.message || err);
    } finally {
      setLoading(false);
    }
  };

  const downloadLogFile = async () => {
    try {
      const res = await fetch("/api/download-experience-log");
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = "toonflow_experience_log.jsonl";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Failed to download log:", error);
      alert("下載失敗，請稍後再試");
    }
  };

  const filteredEntries = entries.filter(e => {
    // Filter out benign system errors that clutter the UI
    if (e.type === "system_error") {
      const errorString = `${e.errorName || ''} ${e.errorMessage || ''}`.toLowerCase();
      const benignErrors = [
        "websocket closed without opened",
        "failed to connect to websocket",
        "resizeobserver loop limit exceeded",
        "load failed",
        "failed to fetch",
        "the fetching process for the media resource was aborted by the user agent",
        "networkerror",
        "aborted"
      ];
      if (benignErrors.some(msg => errorString.includes(msg))) {
        return false;
      }
    }

    if (filter === "all") return true;
    if (filter === "review") return e.type === "image_review" || e.type === "video_review";
    if (filter === "error") return e.type === "system_error" || e.type === "api_error" || e.type === "workflow_error";
    return true;
  });

  const groupedEntries = React.useMemo(() => {
    const grouped: (ExperienceEntry & { count?: number; similarEntries?: ExperienceEntry[] })[] = [];
    
    filteredEntries.forEach(entry => {
      // Don't group successful entries or pure system errors without a sceneId
      if (entry.passed || !entry.sceneId || entry.sceneId === "unknown") {
        grouped.push(entry);
        return;
      }

      // Try to find a group to merge into
      // Merge if: same sceneId, same type, same originalPrompt (if exists), same technical_failure
      const existingGroup = grouped.find(g => 
        !g.passed &&
        g.sceneId === entry.sceneId &&
        g.type === entry.type &&
        g.originalPrompt === entry.originalPrompt &&
        g.technical_failure === entry.technical_failure
      );

      if (existingGroup) {
        if (!existingGroup.count) existingGroup.count = 1;
        if (!existingGroup.similarEntries) existingGroup.similarEntries = [];
        
        existingGroup.count += 1;
        existingGroup.similarEntries.push(entry);
      } else {
        grouped.push({ ...entry, count: 1 });
      }
    });

    return grouped;
  }, [filteredEntries]);

  const getIcon = (type: string, passed?: boolean, technical_failure?: boolean) => {
    if (type === "image_review" || type === "video_review") {
      if (technical_failure) return <Bug className="w-5 h-5 text-red-500" />;
      return passed ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />;
    }
    if (type === "api_error") return <Cloud className="w-5 h-5 text-orange-400" />;
    if (type === "system_error") return <Bug className="w-5 h-5 text-red-400" />;
    return <Server className="w-5 h-5 text-slate-400" />;
  };

  const getTypeName = (type: string, technical_failure?: boolean) => {
    switch (type) {
      case "image_review": return technical_failure ? "畫面生成失敗 (破圖/抽象)" : "畫面審核";
      case "video_review": return technical_failure ? "影片生成失敗 (破圖/抽象)" : "影片審核";
      case "api_error": return "API 錯誤";
      case "system_error": return "系統錯誤";
      case "workflow_error": return "工作流錯誤";
      default: return type;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md">
        <div>
          <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-orange-400" />
            AI 經驗圖書館 (Experience Library)
          </h2>
          <p className="text-sm text-slate-400 mt-1">累積失敗與成功的審核經驗，並同步記錄系統所有錯誤</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-850">
            {(["all", "review", "error"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer uppercase tracking-wider",
                  filter === f 
                    ? "bg-slate-800 text-white shadow-md" 
                    : "text-slate-500 hover:text-slate-300"
                )}
              >
                {f === "all" ? "全部" : f === "review" ? "AI 審核" : "錯誤日誌"}
              </button>
            ))}
          </div>

          <button 
            onClick={downloadLogFile}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-orange-600/20 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            下載永久存檔 (JSONL)
          </button>

          <button 
            onClick={fetchEntries}
            className="p-2 text-slate-400 hover:text-white transition-colors bg-slate-800/50 rounded-lg"
            title="重新整理"
          >
            <History className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Left Column: Experience Entries (Global Stream) */}
        <div className="xl:col-span-2 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="w-12 h-12 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin"></div>
              <p className="text-slate-500 font-mono text-sm">正在載入經驗數據...</p>
            </div>
          ) : groupedEntries.length === 0 ? (
            <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-12 text-center">
              <AlertTriangle className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-400 font-medium">目前尚無相關經驗記錄</p>
              <p className="text-xs text-slate-500 mt-2">當發生錯誤或 AI 審核時，系統會自動記錄並累積在這裡</p>
            </div>
          ) : (
            groupedEntries.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={clsx(
                  "bg-slate-900/60 border rounded-2xl overflow-hidden transition-all duration-300",
                  entry.passed === true ? "border-emerald-900/30 hover:border-emerald-500/30" : 
                  (entry.type.includes("error") || entry.technical_failure) ? "border-red-900/40 hover:border-red-500/40" : "border-orange-900/30 hover:border-orange-500/30"
                )}
              >
                <div 
                  className="p-5 cursor-pointer flex items-center justify-between"
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={clsx(
                      "w-10 h-10 rounded-full flex items-center justify-center shadow-inner",
                      entry.passed === true ? "bg-emerald-500/10 text-emerald-400" : 
                      entry.type.includes("error") || entry.technical_failure ? "bg-red-500/10 text-red-400" : "bg-orange-500/10 text-orange-400"
                    )}>
                      {getIcon(entry.type, entry.passed, entry.technical_failure)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-500">[{getTypeName(entry.type, entry.technical_failure)}]</span>
                        <span className="text-sm font-bold text-slate-200">
                          {entry.passed === true ? "審核通過" : 
                           entry.type.includes("error") ? `${entry.errorName || '錯誤'}` : 
                           entry.technical_failure ? "作圖異常" : "審核不通過"}
                          {entry.score !== undefined && ` (分數: ${entry.score})`}
                        </span>
                        {entry.count && entry.count > 1 && (
                          <span className="bg-red-500/20 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full ml-2">
                            連續失敗 {entry.count} 次
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{new Date(entry.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden md:block">
                      {entry.category && (
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full mr-2">
                          {entry.category}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-600 font-mono uppercase tracking-tighter">ID: {entry.id.slice(0, 8)}</span>
                    </div>
                    {expandedId === entry.id ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
                  </div>
                </div>

                <AnimatePresence>
                  {expandedId === entry.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-slate-800/50 bg-slate-950/40"
                    >
                      <div className="p-6 space-y-6">
                        {entry.type.includes("error") ? (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <p className="text-[10px] text-orange-400 font-mono uppercase font-bold flex items-center gap-1">
                                <Bug className="w-3 h-3" /> 錯誤詳情 (Error Detail)
                              </p>
                              <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4 text-sm text-orange-200 leading-relaxed italic">
                                {entry.errorMessage || "無錯誤訊息"}
                              </div>
                            </div>
                            {entry.errorStack && (
                              <div className="space-y-2">
                                <p className="text-[10px] text-slate-600 font-mono uppercase font-bold">Stack Trace</p>
                                <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 text-[10px] text-slate-500 font-mono overflow-x-auto whitespace-pre">
                                  {entry.errorStack}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <p className="text-[10px] text-red-400 font-mono uppercase font-bold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> 審核意見 (Critique)
                              </p>
                              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 text-sm text-red-200 leading-relaxed italic">
                                {entry.critique}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <p className="text-[10px] text-emerald-400 font-mono uppercase font-bold flex items-center gap-1">
                                <Lightbulb className="w-3 h-3" /> AI 優化提示詞 (Optimized Prompt)
                              </p>
                              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-sm text-emerald-200 leading-relaxed font-mono">
                                {entry.optimizedPrompt || "無建議優化提示詞"}
                              </div>
                            </div>
                          </div>
                        )}

                        {entry.failureCategory && (
                          <div className="space-y-4 pt-2 border-t border-slate-800/50">
                            <p className="text-[10px] text-orange-400 font-mono uppercase font-bold flex items-center gap-1">
                              <Bug className="w-3 h-3" /> 失敗原因分析 (Failure Analysis)
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {entry.failureCategory && (
                                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                                  <span className="text-[10px] text-slate-500 uppercase block mb-1">錯誤分類</span>
                                  <span className="text-sm text-slate-300">{entry.failureCategory}</span>
                                </div>
                              )}
                              {entry.isPromptRelated !== undefined && (
                                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                                  <span className="text-[10px] text-slate-500 uppercase block mb-1">是否與提示詞相關</span>
                                  <span className={clsx("text-sm", entry.isPromptRelated ? "text-orange-400" : "text-emerald-400")}>
                                    {entry.isPromptRelated ? "是 (Prompt Issue)" : "否 (Technical / Model Issue)"}
                                  </span>
                                </div>
                              )}
                              {entry.rootCause && (
                                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 md:col-span-2">
                                  <span className="text-[10px] text-slate-500 uppercase block mb-1">根本原因 (Root Cause)</span>
                                  <span className="text-sm text-slate-300">{entry.rootCause}</span>
                                </div>
                              )}
                              {entry.actualProblem && (
                                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 md:col-span-2">
                                  <span className="text-[10px] text-slate-500 uppercase block mb-1">實際問題 (Actual Problem)</span>
                                  <span className="text-sm text-slate-300">{entry.actualProblem}</span>
                                </div>
                              )}
                              {entry.aiImprovementSuggestion && (
                                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 md:col-span-2">
                                  <span className="text-[10px] text-slate-500 uppercase block mb-1">改善建議 (AI Improvement Suggestion)</span>
                                  <span className="text-sm text-slate-300">{entry.aiImprovementSuggestion}</span>
                                </div>
                              )}
                              {entry.resolution && (
                                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 md:col-span-2">
                                  <span className="text-[10px] text-slate-500 uppercase block mb-1">解決方案 (Resolution)</span>
                                  <span className="text-sm text-emerald-400">{entry.resolution}</span>
                                </div>
                              )}
                              {entry.permanentNote && (
                                <div className="bg-slate-900 border border-amber-500/20 rounded-lg p-3 md:col-span-2 bg-amber-500/5">
                                  <span className="text-[10px] text-amber-500 uppercase block mb-1">經驗總結 (Permanent Note)</span>
                                  <span className="text-sm text-amber-200 font-bold">{entry.permanentNote}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {(entry.originalPrompt || entry.projectId) && (
                          <div className="space-y-4 pt-2 border-t border-slate-800/50">
                            {entry.originalPrompt && (
                              <div className="space-y-2">
                                <p className="text-[10px] text-slate-500 font-mono uppercase font-bold flex items-center gap-1">
                                  <Zap className="w-3 h-3" /> 原始提示詞 (Original Prompt)
                                </p>
                                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 font-mono break-all opacity-80">
                                  {entry.originalPrompt}
                                </div>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-4 text-[10px] font-mono text-slate-600">
                              {entry.projectId && <div>PROJECT_ID: {entry.projectId}</div>}
                              {entry.sceneId && <div>SCENE_ID: {entry.sceneId}</div>}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))
          )}
        </div>

        {/* Right Column: Interactive Scene Failure Diagnosis */}
        <div className="space-y-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 backdrop-blur-md space-y-4 shadow-lg shadow-black/20">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-orange-400" />
                選擇診斷分鏡 (Select Scene)
              </h3>
              <p className="text-[10px] text-slate-400 mt-1">選擇專案中的特定分鏡，深入調閱其失敗記錄與專屬修復提示詞</p>
            </div>
            
            <select
              value={selectedSceneId}
              onChange={(e) => setSelectedSceneId(e.target.value)}
              className="w-full bg-slate-950 text-slate-200 border border-slate-800 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-orange-500/50 transition cursor-pointer"
            >
              <option value="">-- 請選擇欲檢視的分鏡 --</option>
              {scenes.map((s: any, index: number) => (
                <option key={s.id} value={s.id}>
                  分鏡 {index + 1}: {s.title || `無標題分鏡 (${s.id.slice(0, 4)})`}
                </option>
              ))}
            </select>
          </div>
          
          <FailureRecordLibrary 
            sceneId={selectedSceneId} 
            projectId={activeProjectId || ""} 
            onSelectSuggestion={(prompt) => {
              if (onApplySuggestion && selectedSceneId) {
                onApplySuggestion(selectedSceneId, prompt);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
