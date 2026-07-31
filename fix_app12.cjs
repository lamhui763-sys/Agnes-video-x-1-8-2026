const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*\)\}\s*\{\/\* ============ TAB: GALLERY ============ \*\/\}/g;
const replacement = `                      </div>
                    </div>
                  </div>
              )}
              {/* ============ TAB: GALLERY ============ */}`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/App.tsx', code);
