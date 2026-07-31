const fs = require('fs');
let code = fs.readFileSync('src/components/SceneItem.tsx', 'utf8');

// Replace property access
code = code.replace(/scene\.imageUrl/g, 'scene[imageField]');
code = code.replace(/scene\.isGeneratingImage/g, 'scene[isGenImgField]');
code = code.replace(/scene\.videoUrl/g, 'scene[videoField]');
code = code.replace(/scene\.isGeneratingVideo/g, 'scene[isGenVidField]');
code = code.replace(/scene\.videoError/g, 'scene[errorField]');

// Replace literal string field names passed to handleUploadSceneImage
// We only want to replace it in the onChange and drag-drop handlers, where it's passed to handleUploadSceneImage and handleImageDrop
code = code.replace(/handleImageDrop\(e, scene\.id, "imageUrl"\)/g, 'handleImageDrop(e, scene.id, imageField as any)');
code = code.replace(/handleUploadSceneImage\(e, scene\.id, "imageUrl"\)/g, 'handleUploadSceneImage(e, scene.id, imageField as any)');

// Replace state updates for reset
code = code.replace(/imageUrl: undefined/g, '[imageField]: undefined');
code = code.replace(/videoUrl: undefined/g, '[videoField]: undefined');
code = code.replace(/videoProgress: undefined/g, '[(sceneType === "ext" ? "videoProgressExt" : (sceneType === "keyframes" ? "videoProgressKeyframes" : "videoProgress"))]: undefined');
code = code.replace(/videoLogs: undefined/g, '[(sceneType === "ext" ? "videoLogsExt" : (sceneType === "keyframes" ? "videoLogsKeyframes" : "videoLogs"))]: undefined');
code = code.replace(/videoError: undefined/g, '[errorField]: undefined');

fs.writeFileSync('src/components/SceneItem.tsx', code);
