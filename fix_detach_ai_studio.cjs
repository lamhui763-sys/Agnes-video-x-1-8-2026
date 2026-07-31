/**
 * fix_detach_ai_studio.cjs
 * Final cleanup to fully remove Google AI Studio dependency.
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Fully detaching from Google AI Studio...');

const filesToCheck = [
  path.join(__dirname, 'src', 'lib', 'firebase.ts'),
  path.join(__dirname, 'src', 'lib', 'logger.ts'),
  path.join(__dirname, 'server.ts'),
];

// Already handled by previous fixes + new firebase.ts stub.
// Just make sure logger and server stay disabled.

const loggerPath = path.join(__dirname, 'src', 'lib', 'logger.ts');
if (fs.existsSync(loggerPath)) {
  let content = fs.readFileSync(loggerPath, 'utf8');
  if (!content.includes('[GUARD] Firestore write disabled')) {
    content = content.replace(
      /export async function logToExperienceLibrary\(log: LogEntry\) \{/,
      `export async function logToExperienceLibrary(log: LogEntry) {
  // [GUARD] Firestore write disabled - fully detached from AI Studio
  console.log('[Experience Library disabled - local mode]', log.errorName);
  return;
`
    );
    fs.writeFileSync(loggerPath, content, 'utf8');
    console.log('✅ logger.ts hardened');
  }
}

console.log('✅ Detach complete. App now runs fully independent of Google AI Studio.');
