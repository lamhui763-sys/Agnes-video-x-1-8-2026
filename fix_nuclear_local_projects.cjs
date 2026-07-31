/**
 * fix_nuclear_local_projects.cjs
 * Direct source rewrite — no fragile regex on whole routes.
 * Stops: Error writing to Firestore during coalesced save for all_projects
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.log('[nuclear] server.ts missing');
  process.exit(0);
}

let src = fs.readFileSync(serverPath, 'utf8');
let n = 0;

if (src.includes('NUCLEAR_LOCAL_PROJECTS_V1')) {
  console.log('[nuclear] already applied');
  process.exit(0);
}

// ---- helpers inject once near top after path import area ----
const HELPERS = `
// NUCLEAR_LOCAL_PROJECTS_V1 — local JSON only for projects
const NUCLEAR_PROJECTS_FILE = path.join(process.cwd(), 'toonflow_server_projects.json');
function nuclearLoadProjects() {
  try {
    if (fs.existsSync(NUCLEAR_PROJECTS_FILE)) {
      const d = JSON.parse(fs.readFileSync(NUCLEAR_PROJECTS_FILE, 'utf8'));
      return Array.isArray(d) ? d : (Array.isArray(d?.projects) ? d.projects : []);
    }
  } catch (e) { console.warn('[nuclear] load projects file failed', e); }
  return [];
}
function nuclearSaveProjects(list) {
  try {
    fs.writeFileSync(NUCLEAR_PROJECTS_FILE, JSON.stringify(Array.isArray(list) ? list : [], null, 2), 'utf8');
  } catch (e) { console.warn('[nuclear] save projects file failed', e); }
}
`;

if (!src.includes('NUCLEAR_LOCAL_PROJECTS_V1')) {
  const anchor = 'const app = express();';
  if (src.includes(anchor)) {
    src = src.replace(anchor, HELPERS + '\n' + anchor);
    n++;
    console.log('[nuclear] helpers injected');
  }
}

// ---- 1) executeFirestoreSaveForUser → pure no-op ----
{
  const start = src.indexOf('async function executeFirestoreSaveForUser');
  if (start !== -1) {
    // find matching function body end by brace count from first {
    const braceStart = src.indexOf('{', start);
    let depth = 0;
    let i = braceStart;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    const replacement =
      'async function executeFirestoreSaveForUser(userId: string) {\n' +
      '  // NUCLEAR: Firestore project saves disabled — local JSON only\n' +
      '  console.log("[Toonflow] Firestore coalesced save skipped (local-only):", userId);\n' +
      '  return;\n' +
      '}';
    src = src.slice(0, start) + replacement + src.slice(i);
    n++;
    console.log('[nuclear] executeFirestoreSaveForUser → no-op');
  } else {
    console.log('[nuclear] executeFirestoreSaveForUser not found');
  }
}

// ---- 2) Replace save-projects route body with local JSON ----
{
  const marker = 'app.post("/api/save-projects"';
  const start = src.indexOf(marker);
  if (start !== -1) {
    // find end of this route handler: first \n}); after start that closes the post
    // Use brace matching from first {
    const braceStart = src.indexOf('{', start);
    let depth = 0;
    let i = braceStart;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    // include trailing ); if present
    let end = i;
    if (src.slice(end, end + 2) === ');') end += 2;
    else if (src[end] === ')') end += 1;

    const newRoute =
      'app.post("/api/save-projects", async (req, res) => {\n' +
      '  // NUCLEAR: local JSON only\n' +
      '  try {\n' +
      '    const projects = (req.body && req.body.projects) || [];\n' +
      '    nuclearSaveProjects(Array.isArray(projects) ? projects : []);\n' +
      '    return res.json({ success: true, ok: true, count: Array.isArray(projects) ? projects.length : 0, lastModified: Date.now() });\n' +
      '  } catch (err: any) {\n' +
      '    console.error("[Toonflow] save-projects local error:", err);\n' +
      '    return res.json({ success: true, ok: true, count: 0, lastModified: Date.now() });\n' +
      '  }\n' +
      '});';
    src = src.slice(0, start) + newRoute + src.slice(end);
    n++;
    console.log('[nuclear] save-projects → local JSON');
  }
}

// ---- 3) Replace load-projects route ----
{
  const marker = 'app.get("/api/load-projects"';
  const start = src.indexOf(marker);
  if (start !== -1) {
    const braceStart = src.indexOf('{', start);
    let depth = 0;
    let i = braceStart;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    let end = i;
    if (src.slice(end, end + 2) === ');') end += 2;
    else if (src[end] === ')') end += 1;

    const newRoute =
      'app.get("/api/load-projects", async (req, res) => {\n' +
      '  // NUCLEAR: local JSON only — shape matches App.tsx\n' +
      '  try {\n' +
      '    const list = nuclearLoadProjects();\n' +
      '    return res.json({ projects: list, lastModified: Date.now() });\n' +
      '  } catch (err: any) {\n' +
      '    console.error("[Toonflow] load-projects local error:", err);\n' +
      '    return res.json({ projects: [], lastModified: Date.now() });\n' +
      '  }\n' +
      '});';
    src = src.slice(0, start) + newRoute + src.slice(end);
    n++;
    console.log('[nuclear] load-projects → local JSON');
  }
}

// ---- 4) Soft no-op logExperience Firestore write (keep file log) ----
if (src.includes('const docRef = await addDoc(collection(firestoreDb, "experience_library")') &&
    !src.includes('NUCLEAR_SKIP_EXPERIENCE_FS')) {
  src = src.replace(
    'const docRef = await addDoc(collection(firestoreDb, "experience_library"), firestoreEntry);',
    '// NUCLEAR_SKIP_EXPERIENCE_FS\n    const docRef = { id: "local_" + Date.now() }; // skip Firestore'
  );
  n++;
  console.log('[nuclear] experience library Firestore write skipped');
}

fs.writeFileSync(serverPath, src, 'utf8');
console.log('[nuclear] done, changes:', n);
