import { RawData, WebSocket, WebSocketServer } from "ws";
import { UserManager } from "./UserManager";
import { TicketStore } from "./TicketStore";

const WS_PORT = Number(process.env.WS_PORT) || 3001;
const AUTH_TIMEOUT_MS = 5000;
const AUTH_MESSAGE_MAX_BYTES = 1024;
const CONNECTION_WINDOW_MS = 60_000;
const MAX_CONNECTIONS_PER_WINDOW = 60;

const connectionCounters = new Map<string, { count: number; resetAt: number }>();

type TicketMessage = {
    ticket?: string;
    method?: string;
    params?: {
        ticket?: string;
    };
};

function rawDataByteLength(rawMessage: RawData) {
    if (typeof rawMessage === "string") {
        return Buffer.byteLength(rawMessage);
    }

    if (Array.isArray(rawMessage)) {
        return rawMessage.reduce((sum, part) => sum + part.length, 0);
    }

    if (rawMessage instanceof ArrayBuffer) {
        return rawMessage.byteLength;
    }

    return rawMessage.length;
}

function rawDataToString(rawMessage: RawData) {
    if (typeof rawMessage === "string") {
        return rawMessage;
    }

    if (Array.isArray(rawMessage)) {
        return (rawMessage as Buffer[]).map((part) => part.toString()).join("");
    }

    if (rawMessage instanceof ArrayBuffer) {
        return Buffer.from(rawMessage).toString();
    }

    return rawMessage.toString();
}

function getClientIp(req: any) {
    const forwarded = req?.headers?.["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
        return forwarded.split(",")[0]?.trim() || "unknown";
    }
    return req?.socket?.remoteAddress || "unknown";
}

function checkConnectionLimit(ip: string) {
    const now = Date.now();
    const current = connectionCounters.get(ip);

    if (!current || current.resetAt <= now) {
        connectionCounters.set(ip, {
            count: 1,
            resetAt: now + CONNECTION_WINDOW_MS,
        });
        return true;
    }

    current.count += 1;
    return current.count <= MAX_CONNECTIONS_PER_WINDOW;
}

const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (ws, req) => {
    console.log('🔌 New WebSocket connection');

    const clientIp = getClientIp(req);
    if (!checkConnectionLimit(clientIp)) {
        ws.send(JSON.stringify({ error: "Too many connection attempts" }));
        ws.close(4008, "Rate limit exceeded");
        return;
    }

    const authTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ error: "Authentication timeout" }));
            ws.close(4001, "Authentication timeout");
        }
    }, AUTH_TIMEOUT_MS);

    ws.once("message", async (rawMessage) => {
        try {
            if (rawDataByteLength(rawMessage) > AUTH_MESSAGE_MAX_BYTES) {
                clearTimeout(authTimeout);
                ws.send(JSON.stringify({ error: "Auth payload too large" }));
                ws.close(4001, "Invalid auth payload");
                return;
            }

            const parsedMessage: TicketMessage = JSON.parse(rawDataToString(rawMessage));
            const ticket = parsedMessage.ticket || parsedMessage.params?.ticket;

            if (parsedMessage.method !== "AUTH" || !ticket) {
                clearTimeout(authTimeout);
                ws.send(JSON.stringify({ error: "First message must include auth ticket" }));
                ws.close(4001, "Invalid auth message");
                return;
            }

            if (!/^[0-9a-fA-F-]{36}$/.test(ticket)) {
                clearTimeout(authTimeout);
                ws.send(JSON.stringify({ error: "Invalid ticket format" }));
                ws.close(4001, "Invalid ticket");
                return;
            }

            const payload = await TicketStore.getInstance().consume(ticket);
            if (!payload) {
                clearTimeout(authTimeout);
                ws.send(JSON.stringify({ error: "Invalid or expired ticket" }));
                ws.close(4001, "Invalid ticket");
                return;
            }

            clearTimeout(authTimeout);
            UserManager.getInstance().addUser(ws, payload.userId);

            ws.send(JSON.stringify({
                type: "AUTH_SUCCESS",
                userId: payload.userId,
            }));
        } catch (error) {
            clearTimeout(authTimeout);
            ws.send(JSON.stringify({ error: "Invalid auth payload" }));
            ws.close(4001, "Invalid auth payload");
        }
    });

    ws.on("close", () => {
        clearTimeout(authTimeout);
    });
});

