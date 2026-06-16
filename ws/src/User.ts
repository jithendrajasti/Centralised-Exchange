import { WebSocket } from "ws";
import { OutgoingMessage } from "./types/out";
import { SubscriptionManager } from "./SubscriptionManager";
import { IncomingMessage, SUBSCRIBE, UNSUBSCRIBE } from "./types/in";

/* ═══════════════════════════════════════════════════════════════
   User — WebSocket client wrapper
   
   Fixes:
   - Fixed unsubscribe bug (was using params[0] for every item)
   - Added ping/pong heartbeat for dead connection detection
   - Added message validation
   - Reduced verbose console.log
   ═══════════════════════════════════════════════════════════════ */

const HEARTBEAT_INTERVAL = 30_000; // 30 seconds

export class User {
    private id: string;
    private userId: string;
    private ws: WebSocket;
    private subscriptions: string[] = [];
    private alive: boolean = true;
    private heartbeatTimer: NodeJS.Timeout | null = null;

    constructor(id: string, ws: WebSocket, userId: string) {
        this.id = id;
        this.userId = userId;
        this.ws = ws;
        this.addListeners();
        this.startHeartbeat();
    }

    public subscribe(subscription: string) {
        this.subscriptions.push(subscription);
    }

    public unsubscribe(subscription: string) {
        this.subscriptions = this.subscriptions.filter(s => s !== subscription);
    }

    emit(message: OutgoingMessage) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    /** Clean up heartbeat timer */
    destroy() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private addListeners() {
        this.ws.on("message", (message: string) => {
            try {
                const parsedMessage: IncomingMessage = JSON.parse(message);

                if (parsedMessage.method === SUBSCRIBE) {
                    parsedMessage.params.forEach(s =>
                        SubscriptionManager.getInstance().subscribe(this.id, s)
                    );
                }

                if (parsedMessage.method === UNSUBSCRIBE) {
                    // BUG FIX: was `parsedMessage.params[0]` — now correctly uses `s`
                    parsedMessage.params.forEach(s =>
                        SubscriptionManager.getInstance().unsubscribe(this.id, s)
                    );
                }
            } catch (err) {
                console.error(`Invalid message from user ${this.id}:`, err);
            }
        });

        /* ─── Pong response for heartbeat ─── */
        this.ws.on("pong", () => {
            this.alive = true;
        });
    }

    /** Ping/pong heartbeat to detect dead connections */
    private startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            if (!this.alive) {
                // Connection is dead — terminate
                console.log(`💀 User ${this.id}: no pong received, terminating`);
                this.ws.terminate();
                this.destroy();
                return;
            }
            this.alive = false;
            this.ws.ping();
        }, HEARTBEAT_INTERVAL);
    }
}