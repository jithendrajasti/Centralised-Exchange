import { RedisClientType, createClient } from "redis";
import { UserManager } from "./UserManager";

/* ═══════════════════════════════════════════════════════════════
   SubscriptionManager — Redis Pub/Sub ↔ WebSocket bridge
   
   Improvements:
   - Subscription limit per user (prevent abuse)
   - Reduced verbose logging (was logging every message)
   - Env-based Redis URL
   ═══════════════════════════════════════════════════════════════ */

const MAX_SUBSCRIPTIONS_PER_USER = 50;

export class SubscriptionManager {
    private static instance: SubscriptionManager;
    private subscriptions: Map<string, string[]> = new Map();
    private reverseSubscriptions: Map<string, string[]> = new Map();
    private redisClient: RedisClientType;

    private constructor() {
        this.redisClient = createClient({
            url: process.env.REDIS_URL || "redis://localhost:6379",
        });
        this.redisClient.connect().then(() => {
            console.log("WS: Redis connected");
        }).catch((err) => {
            console.error("WS: Redis connection failed:", err);
        });
        
        this.redisClient.on("error", (err) => {
            console.error("WS Redis error:", err);
        });
    }

    public static getInstance() {
        if (!this.instance) {
            this.instance = new SubscriptionManager();
        }
        return this.instance;
    }

    public subscribe(userId: string, subscription: string) {
        /* ─── Prevent duplicate subscriptions ─── */
        if (this.subscriptions.get(userId)?.includes(subscription)) {
            return;
        }

        /* ─── Enforce subscription limit ─── */
        const currentSubs = this.subscriptions.get(userId) || [];
        if (currentSubs.length >= MAX_SUBSCRIPTIONS_PER_USER) {
            console.warn(`User ${userId} exceeded max subscriptions (${MAX_SUBSCRIPTIONS_PER_USER})`);
            return;
        }

        this.subscriptions.set(userId, currentSubs.concat(subscription));
        this.reverseSubscriptions.set(
            subscription,
            (this.reverseSubscriptions.get(subscription) || []).concat(userId)
        );
        
        /* ─── First subscriber → subscribe to Redis channel ─── */
        if (this.reverseSubscriptions.get(subscription)?.length === 1) {
            this.redisClient.subscribe(subscription, this.redisCallbackHandler);
        }
    }

    private redisCallbackHandler = (message: string, channel: string) => {
        try {
            const parsedMessage = JSON.parse(message);
            const subscribers = this.reverseSubscriptions.get(channel);
            
            subscribers?.forEach(userId => {
                const user = UserManager.getInstance().getUser(userId);
                if (user) {
                    user.emit(parsedMessage);
                }
            });
        } catch (err) {
            console.error("Redis callback parse error:", err);
        }
    }

    public unsubscribe(userId: string, subscription: string) {
        const subscriptions = this.subscriptions.get(userId);
        if (subscriptions) {
            this.subscriptions.set(userId, subscriptions.filter(s => s !== subscription));
        }
        const reverseSubscriptions = this.reverseSubscriptions.get(subscription);
        if (reverseSubscriptions) {
            this.reverseSubscriptions.set(subscription, reverseSubscriptions.filter(s => s !== userId));
            if (this.reverseSubscriptions.get(subscription)?.length === 0) {
                this.reverseSubscriptions.delete(subscription);
                this.redisClient.unsubscribe(subscription);
            }
        }
    }

    public userLeft(userId: string) {
        this.subscriptions.get(userId)?.forEach(s => this.unsubscribe(userId, s));
    }
    
    getSubscriptions(userId: string) {
        return this.subscriptions.get(userId) || [];
    }
}