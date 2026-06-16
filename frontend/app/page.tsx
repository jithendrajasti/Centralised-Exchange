import { redirect } from "next/navigation";

/* ═══════════════════════════════════════════════════════════════
   Home Page — Redirects to Markets
   ═══════════════════════════════════════════════════════════════ */

export default function Home() {
  redirect("/markets");
}