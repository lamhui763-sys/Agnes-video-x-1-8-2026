const fs = require('fs');
let code = fs.readFileSync('src/components/SceneItem.tsx', 'utf8');

code = code.replace(`  const handleKeyDown =`, `  const nextSceneData = index < scenes.length - 1 ? scenes[index + 1] : undefined;
  const endImageField = sceneType === "ext" ? "imageUrlExt" : (sceneType === "keyframes" ? "imageUrlKeyframes" : "imageUrl");
  const endImageUrl = nextSceneData ? nextSceneData[endImageField] : undefined;

  const handleKeyDown =`);

fs.writeFileSync('src/components/SceneItem.tsx', code);
