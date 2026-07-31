/**
 * fix_load_projects_no_firebase_crash.cjs
 * GET /api/load-projects crashes with:
 * FirebaseError: Expected first argument to doc() to be a CollectionReference...
 * Soft-fail: return { projects: [] } when Firestore is unavailable.
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.log('[load_proj] server.ts missing');
  process.exit(0);
}

let src = fs.readFileSync(serverPath, 'utf8');
if (src.includes('LOAD_PROJECTS_SOFT_FAIL_V1')) {
  console.log('[load_proj] already present');
  process.exit(0);
}

const NEW_HANDLER = `
// LOAD_PROJECTS_SOFT_FAIL_V1 — never crash UI when Firestore is misconfigured
app.get("/api/load-projects", async (req, res) => {
  try {
    // Firebase free-tier / invalid db: always soft-return so app stays usable
    if (!firestoreDb) {
      console.log("[Toonflow Firebase] firestoreDb unavailable — returning empty projects");
      return res.json({ projects: [], lastModified: 0, offline: true });
    }
    const userId = (req.query.userId as string) || "";
    const targetDocId = userId ? userId : "all_projects";
    try {
      const { doc, getDoc } = await import("firebase/firestore");
      const docRef = doc(firestoreDb as any, "projects", targetDocId);
      const docSnap = await getDoc(docRef);
      if (docSnap && docSnap.exists()) {
        const data = docSnap.data();
        return res.json({
          projects: data?.projects || [],
          lastModified: data?.lastModified || 0,
        });
      }
      return res.json({ projects: [], lastModified: 0 });
    } catch (dbErr: any) {
      console.warn(
        "[Toonflow Firebase] load-projects soft-fail:",
        dbErr?.message || dbErr
      );
      return res.json({ projects: [], lastModified: 0, offline: true });
    }
  } catch (err: any) {
    console.warn("[Toonflow Firebase] load-projects outer soft-fail:", err?.message || err);
    return res.json({ projects: [], lastModified: 0, offline: true });
  }
});
`;

// Replace existing app.get("/api/load-projects" ... ) block — find start and next app. method
const startMarker = 'app.get("/api/load-projects"';
const startIdx = src.indexOf(startMarker);
if (startIdx === -1) {
  // insert before save-projects if present
  const saveIdx = src.indexOf('app.post("/api/save-projects"');
  if (saveIdx !== -1) {
    src = src.slice(0, saveIdx) + NEW_HANDLER + '\n' + src.slice(saveIdx);
    fs.writeFileSync(serverPath, src, 'utf8');
    console.log('[load_proj] inserted new handler before save-projects');
  } else {
    console.log('[load_proj] could not find load-projects or save-projects');
    process.exit(0);
  }
} else {
  // Find end of this handler: next top-level app.get/post after this one, or let pendingSaves
  let searchFrom = startIdx + startMarker.length;
  const candidates = [
    src.indexOf('\napp.post("/api/save-projects"', searchFrom),
    src.indexOf('\nlet pendingSaves', searchFrom),
    src.indexOf('\n// Proxy API: save-projects', searchFrom),
    src.indexOf('\napp.get("/api/', searchFrom),
  ].filter((i) => i > startIdx);
  const endIdx = candidates.length ? Math.min(...candidates) : -1;
  if (endIdx === -1) {
    console.log('[load_proj] could not find end of load-projects handler');
    process.exit(0);
  }
  src = src.slice(0, startIdx) + NEW_HANDLER + src.slice(endIdx);
  fs.writeFileSync(serverPath, src, 'utf8');
  console.log('[load_proj] replaced load-projects handler');
}

console.log('fix_load_projects_no_firebase_crash done.');
