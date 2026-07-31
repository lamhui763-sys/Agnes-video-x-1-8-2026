const fs = require('fs');
let code = fs.readFileSync('src/components/SceneItem.tsx', 'utf8');
const searchStr = '{/* Right Col: Storyboard Image / Agnes Video Generation Frame';
const idx = code.indexOf(searchStr);

// Read 300 lines down
const lines = code.substring(idx).split('\n');
console.log(lines.slice(0, 150).join('\n'));
