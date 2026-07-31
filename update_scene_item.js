const fs = require('fs');
let code = fs.readFileSync('src/components/SceneItem.tsx', 'utf8');

// Replace property access
code = code.replace(/scene\.imageUrl/g, 'scene[imageField]');
code = code.replace(/scene\.isGeneratingImage/g, 'scene[isGenImgField]');
code = code.replace(/scene\.videoUrl/g, 'scene[videoField]');
code = code.replace(/scene\.isGeneratingVideo/g, 'scene[isGenVidField]');
code = code.replace(/scene\.videoError/g, 'scene[errorField]');

// Replace literal string field names passed to handleUploadSceneImage
code = code.replace(/"imageUrl"/g, 'imageField');
code = code.replace(/"videoUrl"/g, 'videoField');

fs.writeFileSync('src/components/SceneItem.tsx', code);
