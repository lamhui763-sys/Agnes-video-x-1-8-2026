const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// handleGenerateImage
code = code.replace(
  /const handleGenerateImage = async \(sceneId: string, engine: 'agnes' \| 'gemini' \| 'nanobanana' = 'gemini'\) => {/,
  `const handleGenerateImage = async (sceneId: string, engine: 'agnes' | 'gemini' | 'nanobanana' = 'gemini', contextTab: string = activeTab) => {
    const isGenField = contextTab === "scenes_ext" ? "isGeneratingImageExt" : (contextTab === "scenes_keyframes" ? "isGeneratingImageKeyframes" : "isGeneratingImage");
    const imageField = contextTab === "scenes_ext" ? "imageUrlExt" : (contextTab === "scenes_keyframes" ? "imageUrlKeyframes" : "imageUrl");`
);

// update loading state
code = code.replace(
  /if \(s.id === sceneId\) return \{ \.\.\.s, isGeneratingImage: true \};/g,
  `if (s.id === sceneId) return { ...s, [isGenField]: true };`
);

// update stop function
code = code.replace(
  /const handleStopGenerateImage = \(sceneId: string\) => {/,
  `const handleStopGenerateImage = (sceneId: string, contextTab: string = activeTab) => {
    const isGenField = contextTab === "scenes_ext" ? "isGeneratingImageExt" : (contextTab === "scenes_keyframes" ? "isGeneratingImageKeyframes" : "isGeneratingImage");`
);
code = code.replace(
  /if \(s.id === sceneId\) return \{ \.\.\.s, isGeneratingImage: false \};/g,
  `if (s.id === sceneId) return { ...s, [isGenField]: false };`
);

// update image URL writes
code = code.replace(
  /imageUrl: data.imageUrl,/g,
  `[imageField]: data.imageUrl,`
);
code = code.replace(
  /imageUrl: "https:\/\/images.unsplash.com\/photo-1618005182384-a83a8bd57fbe\?auto=format&fit=crop&w=800&q=80",/g,
  `[imageField]: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80",`
);

fs.writeFileSync('src/App.tsx', code);
