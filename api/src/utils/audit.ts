type AuditLevel = "info" | "warn" | "error";

type AuditEntry = {
    event: string;
    level?: AuditLevel;
    userId?: string;
    ip?: string;
    requestId?: string;
    success: boolean;
    details?: Record<string, unknown>;
};

export function auditLog(entry: AuditEntry) {
    const payload = {
        ts: new Date().toISOString(),
        level: entry.level || "info",
        event: entry.event,
        userId: entry.userId,
        ip: entry.ip,
        requestId: entry.requestId,
        success: entry.success,
        details: entry.details || {},
    };

    console.log(`[AUDIT] ${JSON.stringify(payload)}`);
}