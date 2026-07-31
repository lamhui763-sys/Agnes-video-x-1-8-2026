import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');
let lines = code.split('\n');

let scenesIdx = lines.findIndex(l => l.includes('{activeTab === "scenes" && ('));
let scenesExtIdx = lines.findIndex(l => l.includes('{activeTab === "scenes_ext" && ('));
let scenesKeyframesIdx = lines.findIndex(l => l.includes('{activeTab === "scenes_keyframes" && ('));
let videoGalleryIdx = lines.findIndex(l => l.includes('<VideoGallery'));
if (videoGalleryIdx === -1) videoGalleryIdx = lines.length;

let before = lines.slice(0, scenesExtIdx).join('\n');
let extPart = lines.slice(scenesExtIdx, scenesKeyframesIdx).join('\n');
let keyframesPart = lines.slice(scenesKeyframesIdx, videoGalleryIdx).join('\n');
let restPart = lines.slice(videoGalleryIdx).join('\n');

const replaceInBlock = (text, suffix) => {
    let res = text.replace(/scene\.videoUrl/g, 'scene.videoUrl' + suffix);
    res = res.replace(/scene\.isGeneratingVideo/g, 'scene.isGeneratingVideo' + suffix);
    res = res.replace(/scene\.videoProgress/g, 'scene.videoProgress' + suffix);
    res = res.replace(/scene\.videoLogs/g, 'scene.videoLogs' + suffix);
    res = res.replace(/scene\.videoError(?!Code)/g, 'scene.videoError' + suffix);
    res = res.replace(/scene\.videoErrorCode/g, 'scene.videoErrorCode' + suffix);
    res = res.replace(/scene\.imageUrl/g, 'scene.imageUrl' + suffix);
    res = res.replace(/scene\.isGeneratingImage/g, 'scene.isGeneratingImage' + suffix);
    return res;
};

extPart = replaceInBlock(extPart, 'Ext');
keyframesPart = replaceInBlock(keyframesPart, 'Keyframes');

fs.writeFileSync('src/App.tsx', before + '\n' + extPart + '\n' + keyframesPart + '\n' + restPart);
console.log("Done");
