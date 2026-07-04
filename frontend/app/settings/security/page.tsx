"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/useAuthStore";
import { getSessions, revokeSession } from "../../utils/httpClient";
import { cn } from "../../lib/utils";
import toast from "react-hot-toast";

/* ═══════════════════════════════════════════════════════════════
   Security & Sessions Page (/settings/security)
   - Lists all active sessions with IP, device, creation time
   - Allows revoking any non-current session
   ═══════════════════════════════════════════════════════════════ */

type Session = {
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

function parseDevice(ua: string): string {
  if (!ua) return "Unknown Device";
  if (/iPhone|iPad|iOS/i.test(ua)) return "iPhone / iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac OS/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux";
  return "Browser";
}

function parseBrowser(ua: string): string {
  if (!ua) return "";
  if (/Chrome\//i.test(ua) && !/Chromium|Edge/i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
  if (/Edg\//i.test(ua)) return "Edge";
  return "";
}

export default function SecurityPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const data = await getSessions();
      // Sort: current session first, then by createdAt desc
      const sorted = [...(data.sessions || [])].sort((a, b) => {
        if (a.isCurrent) return -1;
        if (b.isCurrent) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setSessions(sorted);
    } catch (err) {
      toast.error("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      fetchSessions();
    }
  }, [isLoading, isAuthenticated]);

  const handleRevoke = async (sessionId: string) => {
    setRevoking(sessionId);
    try {
      await revokeSession(sessionId);
      toast.success("Session revoked");
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
    } catch (err: any) {
      toast.error(err?.message || "Failed to revoke session");
    } finally {
      setRevoking(null);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-bp-text-tertiary">Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full pt-20">
        <h2 className="text-xl font-semibold mb-4 text-bp-text-primary">Please log in to view security settings</h2>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-bp-text-primary">Security & Sessions</h1>
        <p className="text-sm text-bp-text-tertiary mt-1">
          View and manage all active sessions for your account.
        </p>
      </div>

      <div className="bg-bp-bg-secondary border border-bp-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-bp-border flex items-center justify-between">
          <h2 className="text-sm font-medium text-bp-text-primary">Active Sessions</h2>
          <span className="text-xs text-bp-text-tertiary">{sessions.length} session{sessions.length !== 1 ? "s" : ""}</span>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center">
            <div className="w-6 h-6 border-2 border-bp-text-tertiary border-t-bp-red rounded-full animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center text-bp-text-tertiary text-sm">No active sessions found.</div>
        ) : (
          <div className="divide-y divide-bp-border">
            {sessions.map((session) => {
              const device = parseDevice(session.userAgent);
              const browser = parseBrowser(session.userAgent);
              const createdDate = new Date(session.createdAt);
              const expiresDate = new Date(session.expiresAt);
              const isExpired = expiresDate < new Date();

              return (
                <div
                  key={session.sessionId}
                  className={cn(
                    "px-6 py-4 flex items-start justify-between gap-4",
                    session.isCurrent && "bg-bp-green-bg"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Device Icon */}
                    <div className="w-8 h-8 mt-0.5 rounded-lg bg-bp-bg-tertiary flex items-center justify-center text-bp-text-tertiary flex-shrink-0">
                      <DeviceIcon ua={session.userAgent} />
                    </div>

                    {/* Session Info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-bp-text-primary">
                          {device}{browser ? ` · ${browser}` : ""}
                        </span>
                        {session.isCurrent && (
                          <span className="inline-flex items-center px-1.5 py-0.5 text-2xs font-medium bg-bp-green text-white rounded-full">
                            Current
                          </span>
                        )}
                        {isExpired && (
                          <span className="inline-flex items-center px-1.5 py-0.5 text-2xs font-medium bg-bp-red-bg text-bp-red rounded-full">
                            Expired
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-bp-text-tertiary space-y-0.5">
                        <div>IP: {session.ipAddress || "Unknown"}</div>
                        <div>Signed in: {createdDate.toLocaleDateString()} {createdDate.toLocaleTimeString()}</div>
                        <div>Expires: {expiresDate.toLocaleDateString()} {expiresDate.toLocaleTimeString()}</div>
                      </div>
                    </div>
                  </div>

                  {/* Revoke Button */}
                  {!session.isCurrent && (
                    <button
                      onClick={() => handleRevoke(session.sessionId)}
                      disabled={revoking === session.sessionId}
                      className={cn(
                        "flex-shrink-0 px-3 py-1.5 text-xs rounded-md border transition-colors",
                        revoking === session.sessionId
                          ? "opacity-50 cursor-not-allowed border-bp-border text-bp-text-tertiary"
                          : "border-bp-red text-bp-red hover:bg-bp-red-bg"
                      )}
                    >
                      {revoking === session.sessionId ? "Revoking..." : "Revoke"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Security tips */}
      <div className="mt-6 p-4 bg-bp-bg-secondary border border-bp-border rounded-xl text-xs text-bp-text-tertiary space-y-1">
        <p className="font-medium text-bp-text-secondary">Security Tips</p>
        <p>• If you see a session you don&apos;t recognize, revoke it immediately and change your password.</p>
        <p>• Sessions expire automatically after 7 days of inactivity.</p>
        <p>• Use a strong, unique password and enable 2FA when available.</p>
      </div>
    </div>
  );
}

function DeviceIcon({ ua }: { ua: string }) {
  const isMobile = /iPhone|Android|Mobile/i.test(ua);
  if (isMobile) {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}
