import { RedisClientType, createClient } from "redis";

export class AuthRedis {
    private static instance: AuthRedis;
    private client: RedisClientType;
    private connectPromise: Promise<void> | null = null;

    private constructor() {
        this.client = createClient({
            url: process.env.REDIS_URL || "redis://localhost:6379",
        });

        this.client.on("error", (err) => {
            console.error("Auth Redis error:", err);
        });
    }

    public static getInstance() {
        if (!this.instance) {
            this.instance = new AuthRedis();
        }
        return this.instance;
    }

    public async getClient() {
        if (!this.connectPromise) {
            this.connectPromise = this.client.connect().then(() => {
                console.log("API Auth: Redis connected");
            });
        }

        await this.connectPromise;
        return this.client;
    }
}