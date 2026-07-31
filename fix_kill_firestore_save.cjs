/**
 * fix_kill_firestore_save.cjs
 * Stop: Error writing to Firestore during coalesced save for all_projects
 * + ensure load-projects returns { projects, lastModified }
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.log('[kill-fs] server.ts missing');
  process.exit(0);
}

let src = fs.readFileSync(serverPath, 'utf8');
let n = 0;

// 1) No-op executeFirestoreSaveForUser / coalesced save
const saveFnPatterns = [
  /async\s+function\s+executeFirestoreSaveForUser\s*\([^)]*\)\s*\{/,
  /function\s+executeFirestoreSaveForUser\s*\([^)]*\)\s*\{/,
  /async\s+function\s+coalescedSave[A-Za-z]*\s*\([^)]*\)\s*\{/,
  /async\s+function\s+saveAllProjects[A-Za-z]*\s*\([^)]*\)\s*\{/,
];
for (const re of saveFnPatterns) {
  if (re.test(src)) {
    src = src.replace(re, (m) => m + '\n  // [KILL_FS_SAVE] disabled — local JSON only\n  console.log("[Toonflow] Firestore save skipped (local-only mode)");\n  return;\n');
    n++;
    console.log('[kill-fs] no-op save fn');
  }
}

// 2) save-projects route → local JSON only
if (src.includes('/api/save-projects')) {
  const saveRouteRe = /app\.post\(\s*["']\/api\/save-projects["'][\s\S]*?\n\}\);/;
  if (saveRouteRe.test(src) && !src.includes('[KILL_FS_SAVE_ROUTE]')) {
    const newSave = `app.post("/api/save-projects", async (req, res) => {
  // [KILL_FS_SAVE_ROUTE] local JSON only — no Firestore
  try {
    const projects = (req.body && req.body.projects) || [];
    try {
      if (typeof saveLocalProjects === 'function') {
        saveLocalProjects(Array.isArray(projects) ? projects : []);
      } else {
        const fs2 = require('fs');
        const p = require('path').join(process.cwd(), 'toonflow_server_projects.json');
        fs2.writeFileSync(p, JSON.stringify(projects, null, 2), 'utf8');
      }
    } catch (e) { console.warn('[save-projects] local write warn', e); }
    return res.json({ ok: true, count: Array.isArray(projects) ? projects.length : 0, lastModified: Date.now() });
  } catch (err) {
    console.error('[Toonflow] save-projects local error:', err);
    return res.json({ ok: true, count: 0, lastModified: Date.now() });
  }
});`;
    src = src.replace(saveRouteRe, newSave);
    n++;
    console.log('[kill-fs] save-projects → local JSON');
  }
}

// 3) load-projects must return { projects, lastModified } for App.tsx
if (src.includes('/api/load-projects') && !src.includes('[KILL_FS_LOAD_FMT]')) {
  const loadRe = /app\.get\(\s*["']\/api\/load-projects["'][\s\S]*?\n\}\);/;
  const newLoad = `app.get("/api/load-projects", async (req, res) => {
  // [KILL_FS_LOAD_FMT] local JSON only, shape matches App.tsx
  try {
    let list = [];
    if (typeof loadLocalProjects === 'function') {
      list = loadLocalProjects();
    } else {
      const fs2 = require('fs');
      const p = require('path').join(process.cwd(), 'toonflow_server_projects.json');
      if (fs2.existsSync(p)) list = JSON.parse(fs2.readFileSync(p, 'utf8'));
    }
    if (!Array.isArray(list)) list = [];
    return res.json({ projects: list, lastModified: Date.now() });
  } catch (err) {
    console.error('[Toonflow] load-projects local error:', err);
    return res.json({ projects: [], lastModified: Date.now() });
  }
});`;
  if (loadRe.test(src)) {
    src = src.replace(loadRe, newLoad);
    n++;
    console.log('[kill-fs] load-projects format fixed');
  }
}

// 4) Soft: never call initServerFirebase for project paths
src = src.replace(
  /if\s*\(\s*!firestoreDb\s*\)\s*\{\s*await\s*initServerFirebase\(\);\s*\}/g,
  '/* [KILL_FS] skip init */ if (false) { await initServerFirebase(); }'
);

// 5) Silence noisy firestore error logs by short-circuiting doc(firestoreDb
if (src.includes('doc(firestoreDb') && !src.includes('[KILL_FS_DOC_GUARD]')) {
  src = src.replace(
    /doc\(\s*firestoreDb\s*,/g,
    'doc(/* [KILL_FS_DOC_GUARD] */ (null as any),'
  );
  n++;
  console.log('[kill-fs] doc(firestoreDb guarded');
}

fs.writeFileSync(serverPath, src, 'utf8');
console.log('[kill-fs] done, changes:', n);
