import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

let lines = code.split('\n');

let scenesExtIdx = lines.findIndex(l => l.includes('{activeTab === "scenes_ext" && ('));
let scenesKeyframesIdx = lines.findIndex(l => l.includes('{activeTab === "scenes_keyframes" && ('));
let videoGalleryIdx = lines.findIndex(l => l.includes('<VideoGallery'));
if (videoGalleryIdx === -1) videoGalleryIdx = lines.length;

let before = lines.slice(0, scenesExtIdx).join('\n');
let extPart = lines.slice(scenesExtIdx, scenesKeyframesIdx).join('\n');
let keyframesPart = lines.slice(scenesKeyframesIdx, videoGalleryIdx).join('\n');
let restPart = lines.slice(videoGalleryIdx).join('\n');

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

fs.writeFileSync('src/App.tsx', before + '\n' + extPart + '\n' + keyframesPart + '\n' + restPart);
console.log("Done");
