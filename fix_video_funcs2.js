import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// I need to search for '{activeTab === "scenes_ext" && ('
let extRenderIdx = code.indexOf('{activeTab === "scenes_ext" && (');
let keyframesRenderIdx = code.indexOf('{activeTab === "scenes_keyframes" && (');
let galleryIdx = code.indexOf('{activeTab === "gallery" && (');

if (extRenderIdx === -1 || keyframesRenderIdx === -1 || galleryIdx === -1) {
    console.log("Could not find render sections");
    process.exit(1);
}

let beforeExt = code.substring(0, extRenderIdx);
let extPart = code.substring(extRenderIdx, keyframesRenderIdx);
let keyframesPart = code.substring(keyframesRenderIdx, galleryIdx);
let restPart = code.substring(galleryIdx);

// Modify Ext Part
extPart = extPart.replace(/scene\.videoUrl/g, 'scene.videoUrlExt');
extPart = extPart.replace(/scene\.isGeneratingVideo/g, 'scene.isGeneratingVideoExt');
extPart = extPart.replace(/scene\.videoProgress/g, 'scene.videoProgressExt');
extPart = extPart.replace(/scene\.videoLogs/g, 'scene.videoLogsExt');
extPart = extPart.replace(/scene\.videoError/g, 'scene.videoErrorExt');
extPart = extPart.replace(/scene\.videoErrorCode/g, 'scene.videoErrorCodeExt');
extPart = extPart.replace(/scene\.imageUrl/g, 'scene.imageUrlExt');
extPart = extPart.replace(/scene\.isGeneratingImage/g, 'scene.isGeneratingImageExt');

// Modify Keyframes Part
keyframesPart = keyframesPart.replace(/scene\.videoUrl/g, 'scene.videoUrlKeyframes');
keyframesPart = keyframesPart.replace(/scene\.isGeneratingVideo/g, 'scene.isGeneratingVideoKeyframes');
keyframesPart = keyframesPart.replace(/scene\.videoProgress/g, 'scene.videoProgressKeyframes');
keyframesPart = keyframesPart.replace(/scene\.videoLogs/g, 'scene.videoLogsKeyframes');
keyframesPart = keyframesPart.replace(/scene\.videoError/g, 'scene.videoErrorKeyframes');
keyframesPart = keyframesPart.replace(/scene\.videoErrorCode/g, 'scene.videoErrorCodeKeyframes');
keyframesPart = keyframesPart.replace(/scene\.imageUrl/g, 'scene.imageUrlKeyframes');
keyframesPart = keyframesPart.replace(/scene\.isGeneratingImage/g, 'scene.isGeneratingImageKeyframes');

fs.writeFileSync('src/App.tsx', beforeExt + extPart + keyframesPart + restPart);
console.log("Done replacing render loops");
