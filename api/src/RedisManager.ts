import crypto from "crypto";
import { RedisClientType, createClient } from "redis";
import { MessageFromOrderbook } from "./types";
import { MessageToEngine } from "@cex/shared";

export class RedisManager {
    private client: RedisClientType;
    private publisher: RedisClientType;
    private static instance: RedisManager;

    private constructor() {
        const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
        this.client = createClient({ url: redisUrl });
        this.publisher = createClient({ url: redisUrl });

        this.client.on("error", (err) => {
            console.error("API Redis error:", err);
        });
        this.publisher.on("error", (err) => {
            console.error("API Redis publisher error:", err);
        });

        this.client.connect().catch((err) => {
            console.error("API Redis connection failed:", err);
        });
        this.publisher.connect().catch((err) => {
            console.error("API Redis publisher connection failed:", err);
        });
    }

    public static getInstance() {
        if (!this.instance)  {
            this.instance = new RedisManager();
        }
        return this.instance;
    }

    public sendAndAwait(message: MessageToEngine) {
        return new Promise<MessageFromOrderbook>((resolve, reject) => {
            const id = this.getRandomClientId();
            
            // Add timeout to prevent hanging forever
            const timeout = setTimeout(() => {
                this.client.unsubscribe(id);
                reject(new Error('Engine response timeout - is the engine running?'));
            }, 10000); // 10 second timeout
            
            this.client.subscribe(id, (message) => {
                clearTimeout(timeout);
                this.client.unsubscribe(id);
                resolve(JSON.parse(message));
            });
            
            this.publisher.lPush("messages", JSON.stringify({ clientId: id, message }));
        });
    }

    public getRandomClientId() {
        return crypto.randomUUID();
    }

}