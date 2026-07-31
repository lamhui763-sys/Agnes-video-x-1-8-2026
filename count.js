const fs = require('fs');
const lines = fs.readFileSync('src/App.tsx', 'utf8').split('\n');

let divCount = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const opens = (line.match(/<div/g) || []).length;
  const closes = (line.match(/<\/div/g) || []).length;
  divCount += opens - closes;
  if (opens !== closes) {
    console.log(`Line ${i + 1}: opens ${opens}, closes ${closes}, balance ${divCount}`);
  }
}
