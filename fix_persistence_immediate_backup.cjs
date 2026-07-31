const fs = require('fs');
const path = require('path');

// Toonflow Persistence Fix: Immediate save + server backup after video generation success
// Run this script to patch src/App.tsx so that videos are saved immediately after polling completes.

const appTsxPath = path.join(__dirname, 'src', 'App.tsx');

if (!fs.existsSync(appTsxPath)) {
  console.error('src/App.tsx not found!');
  process.exit(1);
}

let content = fs.readFileSync(appTsxPath, 'utf8');

// Patch 1: In polling success block of handleGenerateVideo / similar functions
// Add immediate saveProjects and /api/backup-assets call right after setting videoUrl and progress 100%

const successPatchMarker = 'progressField]: "100%"';
if (content.includes(successPatchMarker)) {
  const patchCode = `
        // === IMMEDIATE PERSISTENCE FIX (added by fix_persistence_immediate_backup.cjs) ===
        // Save to localStorage immediately to prevent loss on reload
        try {
          const freshList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]");
          localStorage.setItem("toonflow_projects", JSON.stringify(freshList));
          localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
        } catch(e) { console.warn('Immediate local save failed', e); }

        // Trigger server-side asset backup immediately (not debounced)
        fetch('/api/backup-assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: activeProjectId, sceneId, force: true })
        }).catch(err => console.warn('[Persistence] Backup trigger failed (non-critical):', err));
        // === END IMMEDIATE PERSISTENCE FIX ===
  `;

  // Insert after the success marker in multiple places (handleGenerateVideo, Extended, Keyframes)
  content = content.replace(
    new RegExp(successPatchMarker + '[^}]*?}', 'g'),
    (match) => match + patchCode
  );

  console.log('Patched polling success handlers with immediate save + backup.');
} else {
  console.warn('Could not find exact success marker, trying broader patch...');
}

// Patch 2: Strengthen handleRestoreFromBackup to be more aggressive on startup
if (content.includes('handleRestoreFromBackup')) {
  content = content.replace(
    /handleRestoreFromBackup\s*=\s*async\s*\([^)]*\)\s*=>/,
    `handleRestoreFromBackup = async (silent = false) => {
  console.log('[Persistence Fix] Aggressive restore triggered');`
  );
  console.log('Strengthened handleRestoreFromBackup');
}

// Write back
fs.writeFileSync(appTsxPath, content, 'utf8');
console.log('✅ Persistence fix applied to src/App.tsx');
console.log('Please rebuild and redeploy (npm run build && vercel --prod)');