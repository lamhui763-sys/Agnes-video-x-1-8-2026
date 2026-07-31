import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// The ranges of these functions roughly
// handleGenerateVideoExtended is around 1017 - 1260
// handleGenerateVideoKeyframes is around 1267 - 1490

let beforeExt = code.substring(0, code.indexOf('const handleGenerateVideoExtended ='));
let extFunc = code.substring(code.indexOf('const handleGenerateVideoExtended ='), code.indexOf('const handleGenerateVideoKeyframes ='));
let keyframesFunc = code.substring(code.indexOf('const handleGenerateVideoKeyframes ='), code.indexOf('const handleResetVideoTask ='));
let rest = code.substring(code.indexOf('const handleResetVideoTask ='));

// modify extFunc
extFunc = extFunc.replace(/videoUrl/g, 'videoUrlExt');
extFunc = extFunc.replace(/isGeneratingVideo/g, 'isGeneratingVideoExt');
extFunc = extFunc.replace(/videoProgress/g, 'videoProgressExt');
extFunc = extFunc.replace(/videoLogs/g, 'videoLogsExt');
extFunc = extFunc.replace(/videoError/g, 'videoErrorExt');
extFunc = extFunc.replace(/videoErrorCode/g, 'videoErrorCodeExt');
// Note: we don't change imageUrl in Ext function unless we want it to use imageUrlExt
extFunc = extFunc.replace(/imageUrl/g, 'imageUrlExt');
// Wait, for Extended, it relies on the previous scene's videoUrl!
// So it should read `prevScene.videoUrlExt`
// `extFunc.replace(/videoUrl/g, 'videoUrlExt')` takes care of that!

// modify keyframesFunc
keyframesFunc = keyframesFunc.replace(/videoUrl/g, 'videoUrlKeyframes');
keyframesFunc = keyframesFunc.replace(/isGeneratingVideo/g, 'isGeneratingVideoKeyframes');
keyframesFunc = keyframesFunc.replace(/videoProgress/g, 'videoProgressKeyframes');
keyframesFunc = keyframesFunc.replace(/videoLogs/g, 'videoLogsKeyframes');
keyframesFunc = keyframesFunc.replace(/videoError/g, 'videoErrorKeyframes');
keyframesFunc = keyframesFunc.replace(/videoErrorCode/g, 'videoErrorCodeKeyframes');
keyframesFunc = keyframesFunc.replace(/imageUrl/g, 'imageUrlKeyframes');

// For handleResetVideoTask, we should reset based on activeTab
rest = rest.replace(
  /isGeneratingVideo: false,/,
  `isGeneratingVideo: false,
            isGeneratingVideoExt: false,
            isGeneratingVideoKeyframes: false,`
);
rest = rest.replace(
  /videoError: undefined/,
  `videoError: undefined,
            videoErrorExt: undefined,
            videoErrorKeyframes: undefined`
);

// Now for rendering!
// Find the activeTab === "scenes_ext" section
let scenesExtTabIdx = rest.indexOf('activeTab === "scenes_ext"');
let scenesKeyframesTabIdx = rest.indexOf('activeTab === "scenes_keyframes"');

let firstPart = rest.substring(0, scenesExtTabIdx);
let middlePart = rest.substring(scenesExtTabIdx, scenesKeyframesTabIdx);
let lastPart = rest.substring(scenesKeyframesTabIdx);

// In scenes_ext tab render loop:
middlePart = middlePart.replace(/scene\.videoUrl/g, 'scene.videoUrlExt');
middlePart = middlePart.replace(/scene\.isGeneratingVideo/g, 'scene.isGeneratingVideoExt');
middlePart = middlePart.replace(/scene\.videoProgress/g, 'scene.videoProgressExt');
middlePart = middlePart.replace(/scene\.videoLogs/g, 'scene.videoLogsExt');
middlePart = middlePart.replace(/scene\.videoError/g, 'scene.videoErrorExt');
middlePart = middlePart.replace(/scene\.videoErrorCode/g, 'scene.videoErrorCodeExt');
middlePart = middlePart.replace(/scene\.imageUrl/g, 'scene.imageUrlExt');
middlePart = middlePart.replace(/scene\.isGeneratingImage/g, 'scene.isGeneratingImageExt');

// In scenes_keyframes tab render loop:
lastPart = lastPart.replace(/scene\.videoUrl/g, 'scene.videoUrlKeyframes');
lastPart = lastPart.replace(/scene\.isGeneratingVideo/g, 'scene.isGeneratingVideoKeyframes');
lastPart = lastPart.replace(/scene\.videoProgress/g, 'scene.videoProgressKeyframes');
lastPart = lastPart.replace(/scene\.videoLogs/g, 'scene.videoLogsKeyframes');
lastPart = lastPart.replace(/scene\.videoError/g, 'scene.videoErrorKeyframes');
lastPart = lastPart.replace(/scene\.videoErrorCode/g, 'scene.videoErrorCodeKeyframes');
lastPart = lastPart.replace(/scene\.imageUrl/g, 'scene.imageUrlKeyframes');
lastPart = lastPart.replace(/scene\.isGeneratingImage/g, 'scene.isGeneratingImageKeyframes');

fs.writeFileSync('src/App.tsx', beforeExt + extFunc + keyframesFunc + firstPart + middlePart + lastPart);
