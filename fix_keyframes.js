import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');
let lines = code.split('\n');

let scenesKeyframesIdx = lines.findIndex(l => l.includes('{activeTab === "scenes_keyframes" && ('));

let before = lines.slice(0, scenesKeyframesIdx).join('\n');
let keyframesPart = lines.slice(scenesKeyframesIdx).join('\n');

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

keyframesPart = replaceInBlock(keyframesPart, 'Keyframes');

fs.writeFileSync('src/App.tsx', before + '\n' + keyframesPart);
console.log("Done");
