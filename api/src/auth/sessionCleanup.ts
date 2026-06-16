import { deleteExpiredSessions } from "../db/AuthDb";

/* ═══════════════════════════════════════════════════════════════
   Session Cleanup — Periodic Purge of Expired Sessions

   Runs every hour inside the API process. Deletes auth_sessions
   rows where expires_at < NOW() to prevent unbounded table growth.
   ═══════════════════════════════════════════════════════════════ */

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let cleanupTimer: NodeJS.Timeout | null = null;

async function runCleanup() {
    try {
        const deleted = await deleteExpiredSessions();
        if (deleted > 0) {
            console.log(`[SESSION-CLEANUP] Purged ${deleted} expired session(s)`);
        }
    } catch (error) {
        console.error("[SESSION-CLEANUP] Error:", error);
    }
}

export function startSessionCleanup() {
    if (cleanupTimer) {
        return;
    }

    console.log("[SESSION-CLEANUP] Started (interval: 1h)");

    // Run once immediately, then every hour
    runCleanup();
    cleanupTimer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
}

export function stopSessionCleanup() {
    if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
    }
}
