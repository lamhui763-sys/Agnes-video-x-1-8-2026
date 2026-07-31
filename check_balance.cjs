
const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');
const lines = content.split('\n');

let startLine = 8606;
let endLine = 9227;

let braces = 0;
let parens = 0;
let inString = false;
let quoteChar = '';

for (let i = startLine - 1; i < endLine; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"' || char === "'" || char === '`') {
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
}

console.log(`Braces balance: ${braces}`);
console.log(`Parens balance: ${parens}`);
