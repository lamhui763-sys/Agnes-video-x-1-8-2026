const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const startTag = '{/* Scene Cards Loop */}';
const startIdx = code.indexOf(startTag, code.indexOf('activeTab === "scenes_keyframes"'));
if (startIdx === -1) {
  console.log("Could not find start index");
  process.exit(1);
}

// The end is before the tab closes, let's find the end of scenes_keyframes block.
const searchStr = '{activeTab === "gallery" && (';
const endIdx = code.indexOf(searchStr);

if (endIdx === -1) {
  console.log("Could not find end index");
  process.exit(1);
}

// Need to find the correct closing divs for the scenes_keyframes block
// Look back from endIdx to find the last `)}` which closes activeTab === "scenes_keyframes" && ( ... )
const closingBraceIdx = code.lastIndexOf(')}', endIdx);
const innerEndIdx = code.lastIndexOf('</div>', closingBraceIdx);


const newLoop = `                      {/* Scene Cards Loop */}
                      <div className="space-y-6">
                        {activeProject.scenes.map((scene, index) => {
                          const matchingChar = activeProject.characters.find(c => (c.name || "").trim().toLowerCase() === (scene.character || "").trim().toLowerCase());
                          return (
                            <div key={scene.id} className="space-y-2">
                              {index < activeProject.scenes.length - 1 ? (
                                <div className="flex items-center space-x-2 pl-6 text-purple-400 text-[10px] font-bold font-mono">
                                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                  <span>🧬 首影格為「分鏡 {index + 1} 圖片」，尾影格將自動指定為「分鏡 {index + 2} 圖片」(首尾轉換過渡啟用)</span>
                                </div>
                              ) : (
                                <div className="flex items-center space-x-2 pl-6 text-purple-400 text-[10px] font-bold font-mono">
                                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                  <span>🧬 結尾分鏡：首影格為「分鏡 {index + 1} 圖片」，無後續分鏡作為尾影格 (將自動過渡至故事結尾)</span>
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
                                sceneType="keyframes"
                              />
                            </div>
                          );
                        })}
                      </div>
`;

const before = code.substring(0, startIdx);
// Find the exact end of the block.
// Start at startIdx, find the matching closing div for the container of "space-y-6"
let bracketCount = 0;
let i = startIdx;
let firstDivFound = false;

while (i < code.length) {
    if (code.substring(i, i+5) === '<div ') {
        bracketCount++;
        firstDivFound = true;
    } else if (code.substring(i, i+6) === '</div>') {
        bracketCount--;
    }
    
    if (firstDivFound && bracketCount === 0) {
        break;
    }
    i++;
}
const after = code.substring(i + 6); // past </div>

fs.writeFileSync('src/App.tsx', before + newLoop + after);
