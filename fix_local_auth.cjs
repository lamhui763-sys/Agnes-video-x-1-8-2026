/**
 * fix_local_auth.cjs
 * Replace Firestore-based custom-auth with local JSON file storage
 * so register/login work without Firebase (which is detached).
 */
const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.ts');
if (!fs.existsSync(serverPath)) {
  console.error('server.ts not found');
  process.exit(1);
}

let server = fs.readFileSync(serverPath, 'utf8');

const oldRegister = `// Custom backend-driven authentication APIs
app.post("/api/custom-auth/register", async (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: "請填寫所有欄位" });
  }

  try {
    if (!firestoreDb) {
      await initServerFirebase();
    }
    if (!firestoreDb) {
      return res.status(500).json({ error: "伺服器資料庫未初始化" });
    }

    const { doc, getDoc, setDoc } = await import("firebase/firestore");
    const emailKey = email.trim().toLowerCase();
    const userRef = doc(firestoreDb, "users", emailKey);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return res.status(400).json({ error: "此電子郵件已被註冊" });
    }

    const crypto = await import("crypto");
    const passwordHash = crypto.createHash("sha256").update(password).digest("hex");
    const uid = "custom_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    const userData = {
      email: emailKey,
      passwordHash,
      displayName: displayName.trim(),
      uid,
      createdAt: new Date().toISOString()
    };

    await setDoc(userRef, userData);
    return res.json({
      uid,
      email: emailKey,
      displayName: userData.displayName
    });
  } catch (err: any) {
    await logExperience({
      type: "system_error",
      category: "auth_register",
      errorName: err?.name || "RegisterError",
      errorMessage: err?.message || String(err),
      errorStack: err?.stack,
      passed: false
    });
    console.error("[Toonflow Auth] Register error:", err);
    return res.status(500).json({ error: err.message || "註冊失敗，請稍後再試" });
  }
});`;

const newRegister = `// Custom backend-driven authentication APIs (LOCAL JSON — no Firebase)
const USERS_FILE = path.join(process.cwd(), "toonflow_users.json");

function loadLocalUsers(): Record<string, any> {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    }
  } catch (e) {
    console.warn("[Toonflow Auth] Failed to read users file, starting fresh");
  }
  return {};
}

function saveLocalUsers(users: Record<string, any>) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

app.post("/api/custom-auth/register", async (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: "請填寫所有欄位" });
  }

  try {
    const emailKey = email.trim().toLowerCase();
    const users = loadLocalUsers();

    if (users[emailKey]) {
      return res.status(400).json({ error: "此電子郵件已被註冊" });
    }

    const crypto = await import("crypto");
    const passwordHash = crypto.createHash("sha256").update(password).digest("hex");
    const uid = "custom_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    const userData = {
      email: emailKey,
      passwordHash,
      displayName: displayName.trim(),
      uid,
      createdAt: new Date().toISOString()
    };

    users[emailKey] = userData;
    saveLocalUsers(users);

    return res.json({
      uid,
      email: emailKey,
      displayName: userData.displayName
    });
  } catch (err: any) {
    console.error("[Toonflow Auth] Register error:", err);
    return res.status(500).json({ error: err.message || "註冊失敗，請稍後再試" });
  }
});`;

const oldLogin = `app.post("/api/custom-auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "請輸入電子郵件與密碼" });
  }

  try {
    if (!firestoreDb) {
      await initServerFirebase();
    }
    if (!firestoreDb) {
      return res.status(500).json({ error: "伺服器資料庫未初始化" });
    }

    const { doc, getDoc } = await import("firebase/firestore");
    const emailKey = email.trim().toLowerCase();
    const userRef = doc(firestoreDb, "users", emailKey);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return res.status(400).json({ error: "電子郵件或密碼錯誤" });
    }

    const userData = userSnap.data();
    const crypto = await import("crypto");
    const incomingHash = crypto.createHash("sha256").update(password).digest("hex");

    if (incomingHash !== userData.passwordHash) {
      return res.status(400).json({ error: "電子郵件或密碼錯誤" });
    }

    return res.json({
      uid: userData.uid,
      email: userData.email,
      displayName: userData.displayName
    });
  } catch (err: any) {
    await logExperience({
      type: "system_error",
      category: "auth_login",
      errorName: err?.name || "LoginError",
      errorMessage: err?.message || String(err),
      errorStack: err?.stack,
      passed: false
    });
    console.error("[Toonflow Auth] Login error:", err);
    return res.status(500).json({ error: err.message || "登入失敗，請稍後再試" });
  }
});`;

const newLogin = `app.post("/api/custom-auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "請輸入電子郵件與密碼" });
  }

  try {
    const emailKey = email.trim().toLowerCase();
    const users = loadLocalUsers();
    const userData = users[emailKey];

    if (!userData) {
      return res.status(400).json({ error: "電子郵件或密碼錯誤" });
    }

    const crypto = await import("crypto");
    const incomingHash = crypto.createHash("sha256").update(password).digest("hex");

    if (incomingHash !== userData.passwordHash) {
      return res.status(400).json({ error: "電子郵件或密碼錯誤" });
    }

    return res.json({
      uid: userData.uid,
      email: userData.email,
      displayName: userData.displayName
    });
  } catch (err: any) {
    console.error("[Toonflow Auth] Login error:", err);
    return res.status(500).json({ error: err.message || "登入失敗，請稍後再試" });
  }
});`;

let changed = false;

if (server.includes('doc(firestoreDb, "users"')) {
  if (server.includes(oldRegister.slice(0, 80))) {
    // Use more flexible replace
  }
  // Replace register block
  const regStart = server.indexOf('// Custom backend-driven authentication APIs');
  const loginStart = server.indexOf('app.post("/api/custom-auth/login"');
  const loginEnd = server.indexOf('// Proxy API: load-projects', loginStart);
  
  if (regStart !== -1 && loginStart !== -1 && loginEnd !== -1) {
    server = server.slice(0, regStart) + newRegister + '\n\n' + newLogin + '\n\n' + server.slice(loginEnd);
    changed = true;
    console.log('✅ Replaced custom-auth register + login with local JSON storage');
  } else {
    console.log('Markers not found for full replace, trying partial...');
    // Fallback: just replace the doc() calls pattern
    if (server.includes('const userRef = doc(firestoreDb, "users"')) {
      console.log('Found doc() calls - applying broader fix');
    }
  }
} else {
  console.log('Already fixed or pattern not found');
}

if (changed) {
  fs.writeFileSync(serverPath, server, 'utf8');
  console.log('✅ server.ts written');
} else {
  // Force inject if markers failed
  console.log('Attempting alternate injection...');
  const marker = 'app.post("/api/custom-auth/register"';
  if (server.includes(marker) && server.includes('doc(firestoreDb, "users"')) {
    // Replace from first custom-auth to load-projects
    const start = server.indexOf('// Custom backend-driven authentication APIs');
    const end = server.indexOf('// Proxy API: load-projects');
    if (start === -1) {
      const s2 = server.indexOf(marker);
      const e2 = server.indexOf('// Proxy API: load-projects');
      if (s2 !== -1 && e2 !== -1) {
        server = server.slice(0, s2) + newRegister + '\n\n' + newLogin + '\n\n' + server.slice(e2);
        fs.writeFileSync(serverPath, server, 'utf8');
        console.log('✅ Alternate inject succeeded');
        changed = true;
      }
    } else if (end !== -1) {
      server = server.slice(0, start) + newRegister + '\n\n' + newLogin + '\n\n' + server.slice(end);
      fs.writeFileSync(serverPath, server, 'utf8');
      console.log('✅ Full block inject succeeded');
      changed = true;
    }
  }
}

// Add to package.json prebuild
const pkgPath = path.join(__dirname, 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.scripts && pkg.scripts.prebuild && !pkg.scripts.prebuild.includes('fix_local_auth')) {
    pkg.scripts.prebuild = pkg.scripts.prebuild.replace(
      'node fix_no_fallback_images.cjs || true',
      'node fix_no_fallback_images.cjs || true; node fix_local_auth.cjs || true'
    );
    // Also handle if that string isn't there
    if (!pkg.scripts.prebuild.includes('fix_local_auth')) {
      pkg.scripts.prebuild += '; node fix_local_auth.cjs || true';
    }
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log('✅ package.json prebuild updated');
  }
}

console.log('fix_local_auth done. changed=', changed);
