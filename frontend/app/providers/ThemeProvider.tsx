"use client";

import { useEffect } from "react";
import { useThemeStore } from "../store/useThemeStore";

/* ═══════════════════════════════════════════════════════════════
   ThemeProvider — applies data-theme to <html> on mount
   ═══════════════════════════════════════════════════════════════ */

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return <>{children}</>;
}
