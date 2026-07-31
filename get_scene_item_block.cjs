const fs = require('fs');
let code = fs.readFileSync('src/components/SceneItem.tsx', 'utf8');
const searchStr = '{/* Right Col: Storyboard Image / Agnes Video Generation Frame';
const idx = code.indexOf(searchStr);
console.log(code.substring(idx - 100, idx + 400));
