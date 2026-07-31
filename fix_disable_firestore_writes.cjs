/**
 * fix_disable_firestore_writes.cjs
 * Disable all Firestore writes to avoid free-tier RESOURCE_EXHAUSTED errors.
 * App relies on localStorage + Catbox, so writes are not critical.
 */

const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.ts');
const loggerPath = path.join(__dirname, 'src', 'lib', 'logger.ts');

console.log('🔧 Disabling Firestore writes to avoid quota errors...');

let changed = false;

// 1. Neutralize client logger
if (fs.existsSync(loggerPath)) {
  let logger = fs.readFileSync(loggerPath, 'utf8');
  if (!logger.includes('[GUARD] Firestore write disabled')) {
    logger = logger.replace(
      /export async function logToExperienceLibrary\(log: LogEntry\) \{/,
      `export async function logToExperienceLibrary(log: LogEntry) {
  // [GUARD] Firestore write disabled - free tier quota exhausted
  console.log('[Experience Library disabled]', log.errorName, (log.errorMessage || '').slice(0, 60));
  return;
`
    );
    fs.writeFileSync(loggerPath, logger, 'utf8');
    console.log('✅ logger.ts: logToExperienceLibrary now no-op');
    changed = true;
  }
}

// 2. Neutralize server-side writes
if (fs.existsSync(serverPath)) {
  let server = fs.readFileSync(serverPath, 'utf8');

  // Make logExperience immediately return
  if (server.includes('function logExperience') && !server.includes('[GUARD] logExperience disabled')) {
    server = server.replace(
      /(async\s+function\s+logExperience\s*\([^)]*\)\s*\{)/,
      `$1
  // [GUARD] logExperience disabled - free tier quota exhausted
  console.log('[logExperience disabled]');
  return;
`
    );
    changed = true;
    console.log('✅ server.ts: logExperience now no-op');
  }

  // Make project save skip Firestore
  if (server.includes('executeFirestoreSaveForUser') && !server.includes('[GUARD] Firestore save disabled')) {
    server = server.replace(
      /(async\s+function\s+executeFirestoreSaveForUser[^{]*\{)/,
      `$1
  // [GUARD] Firestore save disabled - free tier quota exhausted
  console.log('[Firestore save disabled]');
  return;
`
    );
    changed = true;
    console.log('✅ server.ts: executeFirestoreSaveForUser now no-op');
  }

  if (changed) {
    fs.writeFileSync(serverPath, server, 'utf8');
    console.log('✅ server.ts updated');
  }
}

console.log(changed ? '\n✅ Done. Firestore writes disabled. Redeploy to take effect.' : '\n⚠️ No changes made (already applied or patterns not found)');
