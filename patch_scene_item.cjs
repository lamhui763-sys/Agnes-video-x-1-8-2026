const fs = require('fs');
let code = fs.readFileSync('src/components/SceneItem.tsx', 'utf8');

const searchStr = '{/* Screen 1: Playback Screen / Canvas */}';
const startIdx = code.indexOf(searchStr);

// Let's compute nextScene at the top of SceneItem component
if (code.indexOf('const nextScene =') === -1) {
  const topStr = 'const handleKeyDown =';
  code = code.replace(topStr, `const nextScene = index < scenes.length - 1 ? scenes[index + 1] : undefined;
  const endImageField = sceneType === "ext" ? "imageUrlExt" : (sceneType === "keyframes" ? "imageUrlKeyframes" : "imageUrl");
  const endImageUrl = nextScene ? nextScene[endImageField] : undefined;

  const handleKeyDown =`);
}

// Replace the rendering box.
const newRenderingBox = `
        {sceneType === 'keyframes' ? (
          <div className="space-y-3">
            <span className="text-[10px] font-mono text-slate-500 font-bold tracking-wider uppercase block">
              🎥 首尾影格渲染中心
            </span>
            <div className="grid grid-cols-2 gap-4">
              {/* Start Frame */}
              <div 
                className={\`relative aspect-video w-full bg-black rounded-xl overflow-hidden border border-slate-800 shadow-inner flex flex-col items-center justify-center \${!scene[imageField] ? 'cursor-pointer group/img' : ''}\`}
                onClick={() => {
                  if (!scene[videoField]) {
                    document.getElementById(\`upload-scene-img-\${scene.id}\`)?.click();
                  }
                }}
              >
                <input 
                  type="file" 
                  id={\`upload-scene-img-\${scene.id}\`} 
                  accept="image/*" 
                  className="hidden" 
                  onChange={(e) => handleUploadSceneImage(e, scene.id, imageField as any)} 
                />
                {scene[imageField] ? (
                  <div className="relative w-full h-full">
                    <img src={scene[imageField]} alt="Start frame" className="w-full h-full object-cover" />
                    <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] font-mono font-bold text-slate-300">首幀 (START)</div>
                    {!scene[isGenVidField] && (
                      <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-[11px] font-bold text-slate-200">點擊更換</span>
                      </div>
                    )}
                  </div>
                ) : scene[isGenImgField] ? (
                  <RefreshCw className="w-6 h-6 text-pink-500 animate-spin" />
                ) : (
                  <div className="flex flex-col items-center justify-center opacity-50 group-hover/img:opacity-100">
                    <Upload className="w-6 h-6 text-slate-500 mb-1" />
                    <p className="text-[10px] text-slate-400 font-medium">首幀</p>
                  </div>
                )}
              </div>
              
              {/* End Frame */}
              <div className="relative aspect-video w-full bg-black rounded-xl overflow-hidden border border-slate-800 shadow-inner flex flex-col items-center justify-center">
                {endImageUrl ? (
                  <div className="relative w-full h-full">
                    <img src={endImageUrl} alt="End frame" className="w-full h-full object-cover" />
                    <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] font-mono font-bold text-slate-300">尾幀 (END)</div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center opacity-50 text-center px-4">
                    <p className="text-[10px] text-slate-400 font-medium">等待下個鏡頭生成</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* If video generated, show below */}
            {scene[videoField] && (
              <div className="relative aspect-video w-full bg-black rounded-xl overflow-hidden border border-slate-800 shadow-inner mt-4">
                <ScrubbableVideoPlayer src={scene[videoField]} className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 flex gap-1 z-30">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("您確定要重置並重新繪製此分鏡嗎？")) {
                         // Reset fields
                      }
                    }}
                    className="bg-red-950/90 hover:bg-red-800 text-white px-2 py-1 rounded text-[9px] font-bold transition shadow flex items-center gap-1 border border-red-700/50"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>重做/重置影片</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div 
            onDragOver={handleImageDragOver}
`;

// Replace from { /* Screen 1: Playback Screen... to <div onDragOver={handleImageDragOver}
code = code.replace(
  '{/* Screen 1: Playback Screen / Canvas */}\n        <div \n          onDragOver={handleImageDragOver}',
  '{/* Screen 1: Playback Screen / Canvas */}\n' + newRenderingBox
);

// We need to close the ternary at the end of the original div.
// Original div closes around line 1250 (before {scene[isGenVidField] && ()
const videoGenIdx = code.indexOf('{scene[isGenVidField] && (');
if (videoGenIdx !== -1) {
  // Find the closing div right before it
  const substr = code.substring(0, videoGenIdx);
  const lastDivIdx = substr.lastIndexOf('</div>');
  code = code.substring(0, lastDivIdx + 6) + '\n        )}\n        ' + code.substring(videoGenIdx);
}


fs.writeFileSync('src/components/SceneItem.tsx', code);
