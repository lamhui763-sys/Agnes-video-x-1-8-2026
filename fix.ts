import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');
content = content.replace(/\uFFFD/g, ''); // Remove replacement character
fs.writeFileSync('src/App.tsx', content);
console.log('Fixed');
