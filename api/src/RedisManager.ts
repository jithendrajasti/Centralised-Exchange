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

    public sendAndAwait(message: MessageToEngine): Promise<MessageFromOrderbook> {
        const id = this.getRandomClientId();

        return new Promise<MessageFromOrderbook>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.client.unsubscribe(id).catch(() => {});
                reject(new Error("Engine response timeout - is the engine running?"));
            }, 10000);

            // Await the subscribe so the channel is fully registered before we
            // publish the request. Without this, a fast engine response could
            // arrive before the subscription is established, causing a 10s timeout.
            this.client
                .subscribe(id, (msg) => {
                    clearTimeout(timeout);
                    this.client.unsubscribe(id).catch(() => {});
                    resolve(JSON.parse(msg));
                })
                .then(() => {
                    return this.publisher.xAdd(
                        "engine_messages",
                        "*",
                        { clientId: id, data: JSON.stringify(message) },
                        { TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: 10000 } }
                    );
                })
                .catch((err) => {
                    clearTimeout(timeout);
                    this.client.unsubscribe(id).catch(() => {});
                    reject(err);
                });
        });
    }

    public getRandomClientId() {
        return crypto.randomUUID();
    }

}