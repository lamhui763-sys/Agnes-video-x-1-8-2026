import React from "react";

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
