import fs from 'fs';
const content = fs.readFileSync('/skills/system_skills/gemini_api/SKILL.md', 'utf-8');
console.log(content.match(/.*image.*/gi));
