"use client";

import { useEffect } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { AuthModal } from "../components/AuthModal";

/* ═══════════════════════════════════════════════════════════════
   AuthProvider — wraps app, tries refresh on mount, renders modal
   ═══════════════════════════════════════════════════════════════ */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const tryRefresh = useAuthStore((s) => s.tryRefresh);

  useEffect(() => {
    tryRefresh();
  }, [tryRefresh]);

  return (
    <>
      {children}
      <AuthModal />
    </>
  );
}
