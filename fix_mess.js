import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Restore to base names
code = code.replace(/scene\.imageUrlExtKeyframes/g, 'scene.imageUrl');
code = code.replace(/scene\.imageUrlKeyframes/g, 'scene.imageUrl');
code = code.replace(/scene\.isGeneratingImageExtKeyframes/g, 'scene.isGeneratingImage');
code = code.replace(/scene\.isGeneratingImageKeyframes/g, 'scene.isGeneratingImage');
code = code.replace(/scene\.isGeneratingVideoExtKeyframes/g, 'scene.isGeneratingVideo');
code = code.replace(/scene\.isGeneratingVideoKeyframes/g, 'scene.isGeneratingVideo');
code = code.replace(/scene\.videoErrorExtKeyframesCode/g, 'scene.videoErrorCode');
code = code.replace(/scene\.videoErrorExtKeyframes/g, 'scene.videoError');
code = code.replace(/scene\.videoErrorKeyframesCode/g, 'scene.videoErrorCode');
code = code.replace(/scene\.videoErrorKeyframes/g, 'scene.videoError');
code = code.replace(/scene\.videoLogsExtKeyframes/g, 'scene.videoLogs');
code = code.replace(/scene\.videoLogsKeyframes/g, 'scene.videoLogs');
code = code.replace(/scene\.videoProgressExtKeyframes/g, 'scene.videoProgress');
code = code.replace(/scene\.videoProgressKeyframes/g, 'scene.videoProgress');
code = code.replace(/scene\.videoUrlExtKeyframes/g, 'scene.videoUrl');
code = code.replace(/scene\.videoUrlKeyframes/g, 'scene.videoUrl');
code = code.replace(/scene\.imageUrlExt/g, 'scene.imageUrl');
code = code.replace(/scene\.isGeneratingImageExt/g, 'scene.isGeneratingImage');
code = code.replace(/scene\.isGeneratingVideoExt/g, 'scene.isGeneratingVideo');
code = code.replace(/scene\.videoErrorExtCode/g, 'scene.videoErrorCode');
code = code.replace(/scene\.videoErrorExt/g, 'scene.videoError');
code = code.replace(/scene\.videoLogsExt/g, 'scene.videoLogs');
code = code.replace(/scene\.videoProgressExt/g, 'scene.videoProgress');
code = code.replace(/scene\.videoUrlExt/g, 'scene.videoUrl');

fs.writeFileSync('src/App.tsx', code);
