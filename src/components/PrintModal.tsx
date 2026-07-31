import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Printer, X, Users, Layers } from "lucide-react";
import { Project } from "../types";

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProject: Project | null;
}

export const PrintModal = ({ isOpen, onClose, activeProject }: PrintModalProps) => {
  return (
    <AnimatePresence>
      {isOpen && activeProject && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-sm flex justify-center items-start p-4 md:p-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-slate-900 border border-slate-800 w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col overflow-hidden relative"
          >
            {/* Top Action Bar (hidden when printing) */}
            <div className="no-print bg-slate-900/95 border-b border-slate-800/80 px-6 py-4 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md">
              <div className="flex items-center space-x-2.5">
                <Printer className="w-5 h-5 text-pink-500 animate-pulse" />
                <div>
                  <h3 className="font-display font-extrabold text-white text-sm">
                    導演劇本與分鏡腳本預覽 (Screenplay & Storyboard)
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    專案：{activeProject.name} | 共 {activeProject.scenes.length} 個分鏡場景
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => window.print()}
                  className="py-2 px-4 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-pink-500/10"
                >
                  <Printer className="w-4 h-4" />
                  <span>立即列印 / 另存為 PDF</span>
                </button>
                <button
                  onClick={onClose}
                  className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 hover:text-white transition cursor-pointer"
                  title="關閉預覽"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Printable Area (Main Sheet) */}
            <div id="print-preview-modal" className="flex-1 bg-slate-950 p-6 md:p-10 text-slate-100 overflow-y-auto max-h-[80vh] scrollbar-thin">
              
              {/* Print Banner */}
              <div className="border-b border-slate-800 pb-6 mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div className="space-y-2">
                  <span className="text-[10px] bg-indigo-500/10 text-indigo-400 font-mono tracking-widest uppercase font-extrabold border border-indigo-500/20 px-2 py-0.5 rounded">
                    ToonFlow Storyboard & Director's Book
                  </span>
                  <h1 className="font-display font-black text-2xl md:text-3xl text-white tracking-tight leading-tight">
                    {activeProject.name}
                  </h1>
                  {activeProject.novelText && (
                    <p className="text-xs text-slate-400 max-w-2xl line-clamp-2 italic">
                      原著內容摘要：{activeProject.novelText}
                    </p>
                  )}
                </div>
                <div className="text-left md:text-right text-[10px] font-mono text-slate-500 space-y-1">
                  <p>編制日期: {new Date().toLocaleDateString()}</p>
                  <p>創立時間: {activeProject.createdAt}</p>
                  <p>劇本系統: ToonFlow Studio v2.0</p>
                </div>
              </div>

              {/* Cast / Characters Section */}
              {activeProject.characters && activeProject.characters.length > 0 && (
                <div className="mb-10 space-y-3 print-card">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5 border-b border-slate-900 pb-2">
                    <Users className="w-4 h-4 text-pink-400" />
                    <span>登場角色名冊 (Cast & Characters)</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeProject.characters.map((char) => (
                      <div key={char.id} className="bg-slate-900/40 border border-slate-850 p-3.5 rounded-xl space-y-2 print-bg-light">
                        <div className="flex items-center gap-2">
                          {(char.uploadedAvatarUrl || char.avatarUrl) ? (
                            <img
                              src={char.uploadedAvatarUrl || char.avatarUrl}
                              alt={char.name}
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-full object-cover border border-slate-800"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-slate-400 font-bold uppercase border border-slate-700">
                              {char.name.slice(0, 1)}
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-bold text-white print-text-dark">{char.name}</p>
                            <p className="text-[9px] text-slate-500 font-mono">風格: {char.artStyle || "預設"}</p>
                          </div>
                        </div>
                        {char.description && (
                          <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-2 print-text-muted">
                            描述：{char.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Storyboard List */}
              <div className="space-y-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5 pb-2 border-b border-slate-900">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span>分鏡對白與導演規劃腳本 (Storyboard Script)</span>
                </h3>

                {activeProject.scenes.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
                    目前此專案尚無分鏡場景資料。
                  </div>
                ) : (
                  <div className="space-y-8">
                    {activeProject.scenes.map((scene, index) => (
                      <div
                        key={scene.id}
                        className="bg-slate-900/30 border border-slate-850 rounded-2xl p-5 md:p-6 space-y-4 print-card print-bg-light relative"
                      >
                        {/* Card Header Info */}
                        <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-850 pb-3">
                          <div className="flex items-center space-x-2.5">
                            <span className="w-6 h-6 rounded-lg bg-pink-500 text-white text-[11px] font-mono font-bold flex items-center justify-center shadow-lg shadow-pink-500/20">
                              {index + 1}
                            </span>
                            <div>
                              <h4 className="text-xs font-extrabold text-white print-text-dark">
                                {scene.title || `未命名分鏡場景 ${index + 1}`}
                              </h4>
                              <p className="text-[9px] text-slate-500 font-mono">
                                ID: {scene.id}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
                            <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 print-bg-light print-text-muted">
                              🎬 角色: <strong className="text-pink-400 font-sans">{scene.character || "無"}</strong>
                            </span>
                            <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 print-bg-light print-text-muted">
                              ⏱️ 時長: <strong className="text-indigo-400">{scene.durationSeconds || ""} 秒</strong>
                            </span>
                          </div>
                        </div>

                        {/* Grid with image and content */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                          {/* Visual reference thumbnail */}
                          <div className="md:col-span-4 space-y-2">
                            <div className="aspect-video bg-slate-950 border border-slate-850 rounded-xl overflow-hidden relative shadow-inner print-bg-light">
                              {scene.imageUrlKeyframes ? (
                                <img
                                  src={scene.imageUrlKeyframes}
                                  alt={scene.title}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-[10px] text-slate-600 gap-1 p-4 text-center">
                                  <span>無分鏡預覽圖片</span>
                                  <span>No Reference Image</span>
                                </div>
                              )}
                            </div>
                            <p className="text-[9px] font-mono text-slate-500 line-clamp-1 truncate" title={scene.imageUrlKeyframes}>
                              {scene.imageUrlKeyframes || "未上傳/未生成圖片網址"}
                            </p>
                          </div>

                          {/* Dialogue, narration & prompts */}
                          <div className="md:col-span-8 space-y-3 text-xs">
                            {scene.dialogue && (
                              <div className="space-y-1">
                                <span className="text-[9px] font-mono font-bold text-yellow-500/80 uppercase block">🗣️ 角色對白 (Dialogue)</span>
                                <div className="bg-slate-950 p-3 rounded-xl border border-slate-900 text-yellow-300 font-medium leading-relaxed print-bg-light print-text-dark">
                                  {scene.dialogue}
                                </div>
                              </div>
                            )}

                            {scene.narration && (
                              <div className="space-y-1">
                                <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block">📖 場景旁白 (Narration)</span>
                                <p className="text-slate-300 pl-1 leading-relaxed italic print-text-muted">
                                  {scene.narration}
                                </p>
                              </div>
                            )}

                            {scene.audioCue && (
                              <div className="space-y-1 bg-pink-500/5 p-2 rounded-lg border border-pink-500/10 print-bg-light">
                                <span className="text-[9px] font-mono font-bold text-pink-400 uppercase flex items-center gap-1">
                                  <span>🎵 音效與氛圍音樂 (Audio Cue)</span>
                                </span>
                                <p className="text-slate-300 text-[10px] pl-1 print-text-dark">
                                  {scene.audioCue}
                                </p>
                              </div>
                            )}

                            {scene.visualPrompt && (
                              <div className="space-y-1">
                                <span className="text-[9px] font-mono font-bold text-cyan-400/80 uppercase block">🎨 英文畫面提示詞 (Visual Prompt)</span>
                                <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-900 text-[10px] font-mono text-slate-400 leading-normal select-all print-text-muted">
                                  {scene.visualPrompt}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Director Notes Row (Separated fully) */}
                        {scene.directorNotes && (
                          <div className="mt-2 pt-3 border-t border-slate-850 space-y-1 bg-amber-500/5 p-3 rounded-xl border border-amber-500/10 print-bg-light">
                            <span className="text-[9px] font-mono font-bold text-amber-500 uppercase flex items-center gap-1">
                              🎬 導演註記與個人拍攝備忘 (Director's & Camera Notes)
                            </span>
                            <p className="text-[11px] text-slate-300 pl-1 leading-relaxed print-text-dark font-sans whitespace-pre-wrap">
                              {scene.directorNotes}
                            </p>
                          </div>
                        )}

                      </div>
                    ))}
                  </div>
                )}

              </div>

              {/* Print Footer */}
              <div className="mt-12 pt-6 border-t border-slate-900 text-center text-[10px] text-slate-600 space-y-1">
                <p>ToonFlow Studio © 2026. All rights reserved.</p>
                <p className="no-print">離線儲存小技巧：點擊上方列印按鈕後，在印表機目標中選擇「另存為 PDF (Save as PDF)」即可匯出完美的高解析度電子劇本！</p>
              </div>

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
