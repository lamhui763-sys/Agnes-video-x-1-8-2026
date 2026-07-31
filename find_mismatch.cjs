
const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');
const lines = content.split('\n');

let braces = 0;
let parens = 0;
let inString = false;
let quoteChar = '';

for (let i = 0; i < lines.length; i++) {
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
    if (i % 100 === 0) {
        console.log(`Line ${i + 1}: Braces=${braces}, Parens=${parens}`);
    }
}
console.log(`Final Braces=${braces}, Parens=${parens}`);
