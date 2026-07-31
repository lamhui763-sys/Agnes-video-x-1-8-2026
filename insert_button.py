import sys

with open('src/App.tsx', 'r') as f:
    content = f.read()

old_str = """                                  <button
                                    onClick={() => handleGenerateVideoKeyframes(scene.id, index)}
                                    disabled={scene.isGeneratingVideo || !scene.imageUrl}
                                    className={`w-full py-2.5 text-xs font-semibold rounded-lg border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                      !scene.imageUrl 
                                        ? "bg-slate-950 text-slate-600 border-slate-900 cursor-not-allowed opacity-55" 
                                        : "bg-gradient-to-tr from-purple-600 to-indigo-600 text-white hover:opacity-95 border-transparent shadow"
                                    }`}
                                    title={!scene.imageUrl ? "請先完成分鏡繪圖再生成影片" : "以本分鏡與下一分鏡之相片作為首尾影格過渡生成 5秒 影片"}
                                  >
                                    <Video className="w-4 h-4" />
                                    <span>🎬 一鍵 AI 首尾過渡影片</span>
                                  </button>
                                </div>"""

new_str = """                                  <button
                                    onClick={() => handleGenerateVideoKeyframes(scene.id, index)}
                                    disabled={scene.isGeneratingVideo || !scene.imageUrl}
                                    className={`w-full py-2.5 text-xs font-semibold rounded-lg border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                      !scene.imageUrl 
                                        ? "bg-slate-950 text-slate-600 border-slate-900 cursor-not-allowed opacity-55" 
                                        : "bg-gradient-to-tr from-purple-600 to-indigo-600 text-white hover:opacity-95 border-transparent shadow"
                                    }`}
                                    title={!scene.imageUrl ? "請先完成分鏡繪圖再生成影片" : "以本分鏡與下一分鏡之相片作為首尾影格過渡生成 5秒 影片"}
                                  >
                                    <Video className="w-4 h-4" />
                                    <span>🎬 一鍵 AI 首尾過渡影片</span>
                                  </button>

                                  {index < activeProject.scenes.length - 1 && (
                                    <button
                                      onClick={() => handleInsertTransitionScene(index)}
                                      className="w-full py-2.5 text-xs font-semibold rounded-lg border transition flex items-center justify-center gap-1.5 cursor-pointer bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white"
                                      title="AI 會自動偵測相鄰兩個分鏡之間的敘事斷層，並生成一個額外的過渡場景"
                                    >
                                      <Plus className="w-4 h-4" />
                                      <span>插入自動銜接場景</span>
                                    </button>
                                  )}
                                </div>"""

content = content.replace(old_str, new_str)

with open('src/App.tsx', 'w') as f:
    f.write(content)
