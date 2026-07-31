/**
 * fix_disable_load_projects_firebase.cjs
 * firestoreDb is truthy but invalid → doc() still throws.
 * Never call Firebase for load-projects; return empty list.
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.log('[dis_load] server.ts missing');
  process.exit(0);
}

let src = fs.readFileSync(serverPath, 'utf8');
if (src.includes('LOAD_PROJECTS_FIREBASE_OFF_V1')) {
  console.log('[dis_load] already present');
  process.exit(0);
}

const HANDLER = `
// LOAD_PROJECTS_FIREBASE_OFF_V1 — cloud project list disabled (Firestore invalid / quota)
app.get("/api/load-projects", async (_req, res) => {
  return res.json({ projects: [], lastModified: 0, offline: true, firebaseDisabled: true });
});
`;

const startMarker = 'app.get("/api/load-projects"';
const startIdx = src.indexOf(startMarker);
if (startIdx === -1) {
  const saveIdx = src.indexOf('app.post("/api/save-projects"');
  if (saveIdx !== -1) {
    src = src.slice(0, saveIdx) + HANDLER + '\n' + src.slice(saveIdx);
    fs.writeFileSync(serverPath, src, 'utf8');
    console.log('[dis_load] inserted stub before save-projects');
  } else {
    console.log('[dis_load] markers not found');
    process.exit(0);
  }
} else {
  const searchFrom = startIdx + 10;
  const ends = [
    src.indexOf('\napp.post("/api/save-projects"', searchFrom),
    src.indexOf('\nlet pendingSaves', searchFrom),
    src.indexOf('\n// Proxy API: save-projects', searchFrom),
    src.indexOf('\n// LOAD_PROJECTS', searchFrom + 50),
  ].filter((i) => i > startIdx);
  // find closing of handler: next app. at column start after this block
  let endIdx = -1;
  const re = /\napp\.(get|post|put|delete)\(/g;
  re.lastIndex = startIdx + startMarker.length;
  const m = re.exec(src);
  if (m) endIdx = m.index;
  if (endIdx === -1 && ends.length) endIdx = Math.min(...ends);
  if (endIdx === -1) {
    console.log('[dis_load] could not find end');
    process.exit(0);
  }
  src = src.slice(0, startIdx) + HANDLER + src.slice(endIdx);
  fs.writeFileSync(serverPath, src, 'utf8');
  console.log('[dis_load] replaced load-projects with no-Firebase stub');
}

console.log('fix_disable_load_projects_firebase done.');
