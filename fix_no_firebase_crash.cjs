/**
 * fix_no_firebase_crash.cjs
 * Replace broken Firestore load-projects + custom-auth with local JSON / no-op.
 * Stops: Expected first argument to doc() ...
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.log('[no-firebase] server.ts missing — skip');
  process.exit(0);
}

let src = fs.readFileSync(serverPath, 'utf8');
let changes = 0;

// ---------- 1) LOCAL USERS helpers (inject once near top of auth area) ----------
const localUsersHelper = `
// LOCAL JSON auth (no Firebase)
const USERS_FILE = path.join(process.cwd(), 'toonflow_users.json');
const PROJECTS_FILE = path.join(process.cwd(), 'toonflow_server_projects.json');
function loadLocalUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) { console.warn('[Auth] users file read failed'); }
  return {};
}
function saveLocalUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}
function loadLocalProjects() {
  try {
    if (fs.existsSync(PROJECTS_FILE)) return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
  } catch (e) { console.warn('[Projects] file read failed'); }
  return [];
}
function saveLocalProjects(list) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(list, null, 2), 'utf8');
}
`;

if (!src.includes('toonflow_users.json')) {
  // inject after first "import * as fs" or near app = express
  const injectAt = src.indexOf('const app = express()');
  if (injectAt !== -1) {
    src = src.slice(0, injectAt) + localUsersHelper + '\n' + src.slice(injectAt);
    changes++;
    console.log('[no-firebase] injected local JSON helpers');
  } else {
    // fallback: prepend after imports block
    const m = src.match(/from ['\"]express['\"];?\n/);
    if (m) {
      const idx = src.indexOf(m[0]) + m[0].length;
      src = src.slice(0, idx) + '\n' + localUsersHelper + src.slice(idx);
      changes++;
      console.log('[no-firebase] injected helpers after express import');
    }
  }
}

// ---------- 2) Replace register route body to local JSON ----------
if (src.includes('doc(firestoreDb, "users"') || src.includes("doc(firestoreDb, 'users'")) {
  // Broad: find app.post("/api/custom-auth/register" ... and replace until next app.post or // Proxy
  const regRe = /app\.post\(\s*["']\/api\/custom-auth\/register["'][\s\S]*?\n\}\);/;
  const newReg = `app.post("/api/custom-auth/register", async (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !password || !displayName) return res.status(400).json({ error: "請填寫所有欄位" });
  try {
    const emailKey = String(email).trim().toLowerCase();
    const users = loadLocalUsers();
    if (users[emailKey]) return res.status(400).json({ error: "此電子郵件已被註冊" });
    const crypto = await import("crypto");
    const passwordHash = crypto.createHash("sha256").update(password).digest("hex");
    const uid = "guest_" + Math.random().toString(36).slice(2, 12);
    users[emailKey] = { email: emailKey, passwordHash, displayName: String(displayName).trim(), uid, createdAt: new Date().toISOString() };
    saveLocalUsers(users);
    return res.json({ uid, email: emailKey, displayName: users[emailKey].displayName });
  } catch (err) {
    console.error("[Toonflow Auth] Register error:", err);
    return res.status(500).json({ error: err?.message || "註冊失敗" });
  }
});`;
  if (regRe.test(src)) {
    src = src.replace(regRe, newReg);
    changes++;
    console.log('[no-firebase] register → local JSON');
  }
}

// ---------- 3) Replace login route ----------
if (src.includes('/api/custom-auth/login')) {
  const loginRe = /app\.post\(\s*["']\/api\/custom-auth\/login["'][\s\S]*?\n\}\);/;
  const newLogin = `app.post("/api/custom-auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "請輸入電子郵件與密碼" });
  try {
    const emailKey = String(email).trim().toLowerCase();
    const users = loadLocalUsers();
    const userData = users[emailKey];
    if (!userData) return res.status(400).json({ error: "電子郵件或密碼錯誤" });
    const crypto = await import("crypto");
    const incomingHash = crypto.createHash("sha256").update(password).digest("hex");
    if (incomingHash !== userData.passwordHash) return res.status(400).json({ error: "電子郵件或密碼錯誤" });
    return res.json({ uid: userData.uid, email: userData.email, displayName: userData.displayName });
  } catch (err) {
    console.error("[Toonflow Auth] Login error:", err);
    return res.status(500).json({ error: err?.message || "登入失敗" });
  }
});`;
  if (loginRe.test(src)) {
    src = src.replace(loginRe, newLogin);
    changes++;
    console.log('[no-firebase] login → local JSON');
  }
}

// ---------- 4) load-projects: never call Firestore doc() ----------
// Replace any GET /api/load-projects handler body to return local list or []
if (src.includes('/api/load-projects')) {
  const loadRe = /app\.get\(\s*["']\/api\/load-projects["'][\s\S]*?\n\}\);/;
  const newLoad = `app.get("/api/load-projects", async (req, res) => {
  try {
    // LOCAL ONLY — no Firebase
    const list = loadLocalProjects();
    return res.json(Array.isArray(list) ? list : []);
  } catch (err) {
    console.error("[Toonflow] load-projects local error:", err);
    return res.json([]);
  }
});`;
  if (loadRe.test(src)) {
    src = src.replace(loadRe, newLoad);
    changes++;
    console.log('[no-firebase] load-projects → local JSON / empty');
  } else {
    // softer: if we still see firestore in load-projects area, wrap doc calls
    console.log('[no-firebase] load-projects regex miss — trying soft patch');
    if (src.includes('Error in GET /api/load-projects') || src.includes('load-projects')) {
      // Force firestoreDb null path: make init always fail safe
      src = src.replace(
        /if\s*\(\s*!firestoreDb\s*\)\s*\{\s*await\s*initServerFirebase\(\);\s*\}/g,
        '/* skip Firebase init for projects */ if (false) { await initServerFirebase(); }'
      );
      changes++;
    }
  }
}

// ---------- 5) Soft-disable any remaining doc(firestoreDb for users/projects ----------
src = src.replace(
  /doc\(\s*firestoreDb\s*,\s*["']users["']/g,
  'doc(null as any, "users" /* DISABLED */'
);
// Better: make firestoreDb always treated as null for project paths
if (src.includes('firestoreDb') && !src.includes('FIRESTORE_DISABLED_FOR_PROJECTS')) {
  src = src.replace(
    /let\s+firestoreDb\s*[:=]/,
    'const FIRESTORE_DISABLED_FOR_PROJECTS = true;\nlet firestoreDb ='
  );
  changes++;
}

fs.writeFileSync(serverPath, src, 'utf8');
console.log('[no-firebase] done, changes:', changes);
