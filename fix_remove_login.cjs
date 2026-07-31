/**
 * fix_remove_login.cjs
 * Always overwrite AuthWrapper to passthrough (no login UI).
 */
const fs = require('fs');
const path = require('path');

const authPath = path.join(process.cwd(), 'src/components/AuthWrapper.tsx');
const content = `import React from "react";

interface AuthWrapperProps {
  children: React.ReactNode;
  currentUser?: any;
  isAuthLoading?: boolean;
  onSignIn?: () => void;
  onCustomSignIn?: (user: any) => void;
}

/** LOGIN REMOVED — always guest */
export default function AuthWrapper({ children }: AuthWrapperProps) {
  return <>{children}</>;
}
`;

fs.mkdirSync(path.dirname(authPath), { recursive: true });
fs.writeFileSync(authPath, content, 'utf8');
console.log('[remove-login] AuthWrapper overwritten → always guest');
