import { RedisClientType, createClient } from "redis";

type WsTicketPayload = {
    userId: string;
    issuedAt: number;
};

export class TicketStore {
    private static instance: TicketStore;
    private redisClient: RedisClientType;
    private connectPromise: Promise<void> | null = null;

    private constructor() {
        this.redisClient = createClient({
            url: process.env.REDIS_URL || "redis://localhost:6379",
        });

        this.redisClient.on("error", (err) => {
            console.error("WS Ticket Redis error:", err);
        });
    }

    public static getInstance() {
        if (!this.instance) {
            this.instance = new TicketStore();
        }
        return this.instance;
    }

    public async consume(ticket: string): Promise<WsTicketPayload | null> {
        if (!this.connectPromise) {
            this.connectPromise = this.redisClient.connect().then(() => {
                console.log("WS: Ticket Redis connected");
            });
        }

        await this.connectPromise;

        const raw = await this.redisClient.getDel(`ws:ticket:${ticket}`);
        if (!raw) {
            return null;
        }

        try {
            return JSON.parse(raw) as WsTicketPayload;
        } catch {
            return null;
        }
    }
}