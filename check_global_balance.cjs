
const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');

let braces = 0;
let parens = 0;
let inString = false;
let quoteChar = '';

for (let j = 0; j < content.length; j++) {
    const char = content[j];
    if ((char === '"' || char === "'" || char === '`') && content[j-1] !== '\\') {
        if (!inString) {
            inString = true;
            quoteChar = char;
        } else if (quoteChar === char) {
            inString = false;
        }
    }
    if (inString) continue;

    if (char === '{') braces++;
    if (char === '}') braces--;
    if (char === '(') parens++;
    if (char === ')') parens--;
}

console.log(`Global Braces balance: ${braces}`);
console.log(`Global Parens balance: ${parens}`);
