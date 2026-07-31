const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const searchStr = '{/* Scene Cards Loop */}';
let idx = code.indexOf(searchStr); // scenes
idx = code.indexOf(searchStr, idx + 1); // scenes_ext

if (idx !== -1) {
    const endStr = '{activeProject.scenes.length === 0 && (';
    let endIdx = code.indexOf(endStr, idx);
    
    const before = code.substring(0, idx);
    const after = code.substring(endIdx);
    
    const newLoop = `{/* Scene Cards Loop */}
                      <div className="space-y-6">
                        {activeProject.scenes.map((scene, index) => {
                          const matchingChar = activeProject.characters.find(c => (c.name || "").trim().toLowerCase() === (scene.character || "").trim().toLowerCase());
                          return (
                            <div key={scene.id} className="space-y-2">
                              {index > 0 && (
                                <div className="flex items-center space-x-2 pl-6 text-emerald-400 text-[10px] font-bold font-mono">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  <span>🧬 首影格將由「分鏡 {index}」的結尾最後一影格自動延續 (無縫過渡啟用)</span>
                                </div>
                              )}
                              <SceneItem 
                                scene={scene}
                                index={index}
                                activeProjectCharacters={activeProject.characters}
                                handleUpdateSceneField={handleUpdateSceneField}
                                handleDeleteScene={handleDeleteScene}
                                handleDragStart={handleDragStart}
                                handleDragOver={handleDragOver}
                                handleDragEnd={handleDragEnd}
                                handleDrop={handleDrop}
                                draggedIndex={draggedIndex}
                                draggedOverIndex={draggedOverIndex}
                                matchingChar={matchingChar}
                                handleApplyStylePreset={handleApplyStylePreset}
                                handleImageDragOver={handleImageDragOver}
                                handleImageDrop={handleImageDrop}
                                handleUploadSceneImage={handleUploadSceneImage}
                                handleGenerateVideo={handleGenerateVideo}
                                handleGenerateImage={handleGenerateImage}
                                scenes={activeProject.scenes}
                                activeProjectId={activeProject.id}
                                setProjects={setProjects}
                                showToast={showToast}
                                isFullAutoProducing={isFullAutoProducing}
                                fullAutoProgress={fullAutoProgress}
                                fullAutoLogs={fullAutoLogs}
                                onFullAutoProduce={handleFullAutoVideoProduction}
                                sceneType="ext"
                              />
                            </div>
                          );
                        })}
                      </div>
                      `;
                      
    fs.writeFileSync('src/App.tsx', before + newLoop + after);
    console.log("Replaced scenes_ext");
}
