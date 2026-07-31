/**
 * fix_character_gender.cjs
 * Add gender field UI + inject into avatar / storyboard image prompts
 * so faces are clearly male or female.
 */
const fs = require('fs');
const path = require('path');

const appPath = path.join(process.cwd(), 'src', 'App.tsx');
if (!fs.existsSync(appPath)) {
  console.log('[gender] App.tsx missing');
  process.exit(0);
}

let src = fs.readFileSync(appPath, 'utf8');
if (src.includes('CHARACTER_GENDER_FIELD_V1')) {
  console.log('[gender] already applied');
  process.exit(0);
}

// 1) Gender select UI after 年齡 field block
const ageBlockMarker = 'placeholder="例如：25歲"';
if (src.includes(ageBlockMarker) && !src.includes('handleUpdateChar(char.id, "gender"')) {
  // Insert gender field right after the age input's closing div of that column
  // Find the age column and append sibling gender column by expanding grid
  const ageColumn = `                                    <div className="space-y-1">
                                      <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">年齡</label>
                                      <input
                                        type="text"
                                        className="w-full bg-slate-900 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition relative z-20"
                                        value={char.age || ""}
                                        onChange={(e) => handleUpdateChar(char.id, "age", e.target.value)}
                                        placeholder="例如：25歲"
                                      />
                                    </div>`;

  const genderColumn = `                                    {/* CHARACTER_GENDER_FIELD_V1 */}
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">性別 (Gender)</label>
                                      <select
                                        className="w-full bg-slate-900 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-pink-500 transition relative z-20 font-bold text-pink-300"
                                        value={char.gender || ""}
                                        onChange={(e) => handleUpdateChar(char.id, "gender", e.target.value)}
                                      >
                                        <option value="">未指定</option>
                                        <option value="male">男 (Male)</option>
                                        <option value="female">女 (Female)</option>
                                        <option value="other">其他 (Other)</option>
                                      </select>
                                    </div>
${ageColumn}`;

  if (src.includes(ageColumn)) {
    src = src.replace(ageColumn, genderColumn);
    console.log('[gender] inserted gender select UI');
  } else {
    // looser replace: after age placeholder line
    src = src.replace(
      /placeholder="例如：25歲"\s*\n\s*\/>\s*\n\s*<\/div>/,
      `placeholder="例如：25歲"\n                                      />\n                                    </div>\n                                    {/* CHARACTER_GENDER_FIELD_V1 */}\n                                    <div className="space-y-1">\n                                      <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">性別 (Gender)</label>\n                                      <select\n                                        className="w-full bg-slate-900 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-pink-500 transition relative z-20 font-bold text-pink-300"\n                                        value={char.gender || ""}\n                                        onChange={(e) => handleUpdateChar(char.id, "gender", e.target.value)}\n                                      >\n                                        <option value="">未指定</option>\n                                        <option value="male">男 (Male)</option>\n                                        <option value="female">女 (Female)</option>\n                                        <option value="other">其他 (Other)</option>\n                                      </select>\n                                    </div>`
    );
    console.log('[gender] inserted gender via loose age replace');
  }

  // Expand grid from 4 cols to fit gender (optional - 5 fields may wrap)
  src = src.replace(
    'grid grid-cols-1 md:grid-cols-4 gap-4">\n                                    <div className="space-y-1">\n                                      <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">年齡</label>',
    'grid grid-cols-1 md:grid-cols-5 gap-4">\n                                    <div className="space-y-1">\n                                      <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">年齡</label>'
  );
}

// 2) Inject gender into avatar generation baseDesc
if (src.includes('const baseDesc = charToGen.description.trim()') || src.includes('charToGen.description.trim() ||')) {
  const oldAvatarDesc = `const baseDesc = charToGen.description.trim() ||
      \`\${charToGen.name || "主角"}\${charToGen.role ? \`, 身份/職業: \${charToGen.role}\` : ""}\${charToGen.age ? \`, 年齡: \${charToGen.age}\` : ""}\${charToGen.clothing ? \`, 服裝風格: \${charToGen.clothing}\` : ""}\${charToGen.personality ? \`, 性格特質: \${charToGen.personality}\` : ""}\`;`;

  const newAvatarDesc = `const genderEn = charToGen.gender === 'male' ? 'male, clearly masculine face and body, man'
      : charToGen.gender === 'female' ? 'female, clearly feminine face and body, woman'
      : charToGen.gender === 'other' ? 'androgynous presentation as specified'
      : '';
    const genderZh = charToGen.gender === 'male' ? '男性'
      : charToGen.gender === 'female' ? '女性'
      : charToGen.gender === 'other' ? '其他性別氣質'
      : '';
    const baseDesc = charToGen.description.trim() ||
      \`\${charToGen.name || "主角"}\${genderZh ? \`, 性別: \${genderZh}\` : ""}\${charToGen.role ? \`, 身份/職業: \${charToGen.role}\` : ""}\${charToGen.age ? \`, 年齡: \${charToGen.age}\` : ""}\${charToGen.clothing ? \`, 服裝風格: \${charToGen.clothing}\` : ""}\${charToGen.personality ? \`, 性格特質: \${charToGen.personality}\` : ""}\`;`;

  if (src.includes(oldAvatarDesc)) {
    src = src.replace(oldAvatarDesc, newAvatarDesc);
    console.log('[gender] avatar baseDesc with gender');
  } else if (src.includes('const combinedPrompt = `character turnaround sheet')) {
    // inject before combinedPrompt
    src = src.replace(
      'const combinedPrompt = `character turnaround sheet, three views front side and back, ${baseDesc}`;',
      `const genderLock = charToGen.gender === 'male'
      ? 'MUST be clearly male: masculine jaw, male facial structure, man, not female, not androgynous. '
      : charToGen.gender === 'female'
        ? 'MUST be clearly female: feminine face, woman, soft features, not male, not androgynous. '
        : '';
    const combinedPrompt = \`character turnaround sheet, three views front side and back, \${genderLock}\${baseDesc}\`;`
    );
    console.log('[gender] genderLock on combinedPrompt');
  }
}

// Force gender lock on combinedPrompt always if marker missing
if (!src.includes('MUST be clearly male') && src.includes('character turnaround sheet, three views front side and back')) {
  src = src.replace(
    /const combinedPrompt = `character turnaround sheet, three views front side and back, \$\{baseDesc\}`;/,
    `const genderLock = charToGen.gender === 'male'
      ? 'MUST be clearly male: masculine jawline, male facial structure, adult man, not female. '
      : charToGen.gender === 'female'
        ? 'MUST be clearly female: feminine face, woman, soft features, not male. '
        : '';
    const combinedPrompt = \`character turnaround sheet, three views front side and back, \${genderLock}\${baseDesc}\`;`
  );
  console.log('[gender] forced genderLock combinedPrompt');
}

// 3) When building charDesc for storyboard images, append gender
if (src.includes('let charDesc = characterObj?.description || "";')) {
  src = src.replace(
    'let charDesc = characterObj?.description || "";',
    `let charDesc = characterObj?.description || "";
      // CHARACTER_GENDER_FIELD_V1 inject
      if (characterObj?.gender === 'male') charDesc = 'male, clearly masculine face and body, man. ' + charDesc;
      else if (characterObj?.gender === 'female') charDesc = 'female, clearly feminine face and body, woman. ' + charDesc;
      else if (characterObj?.gender === 'other') charDesc = 'androgynous as specified. ' + charDesc;`
  );
  console.log('[gender] charDesc gender inject for storyboard');
}

// mark applied
if (!src.includes('CHARACTER_GENDER_FIELD_V1')) {
  src = '// CHARACTER_GENDER_FIELD_V1\n' + src;
}

fs.writeFileSync(appPath, src, 'utf8');
console.log('[gender] App.tsx written');
console.log('fix_character_gender done.');
