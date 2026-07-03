import crypto from "crypto";
import { WebSocket } from "ws";
import { User } from "./User";
import { SubscriptionManager } from "./SubscriptionManager";

export class UserManager {
    private static instance: UserManager;
    private users: Map<string, User> = new Map();

    private constructor() {}

    public static getInstance() {
        if (!this.instance) {
            this.instance = new UserManager();
        }
        return this.instance;
    }

    public addUser(ws: WebSocket, userId: string) {
        const id = crypto.randomUUID();
        const user = new User(id, ws, userId);
        this.users.set(id, user);
        this.registerOnClose(ws, id);
        return user;
    }

    private registerOnClose(ws: WebSocket, id: string) {
        ws.on("close", () => {
            const user = this.users.get(id);
            if (user) {
                user.destroy(); // Clean up heartbeat timer
            }
            this.users.delete(id);
            SubscriptionManager.getInstance().userLeft(id);
        });
    }

    public getUser(id: string) {
        return this.users.get(id);
    }

    /** Find the internal map key for a given WebSocket connection */
    public getInternalIdByWs(ws: WebSocket): string | undefined {
        for (const [id, user] of this.users) {
            if (user.ws === ws) return id;
        }
        return undefined;
    }

    /** After a successful ticket auth, upgrade the user's authId from 'guest' to their real userId */
    public upgradeUserId(ws: WebSocket, realUserId: string) {
        const internalId = this.getInternalIdByWs(ws);
        if (internalId) {
            const user = this.users.get(internalId);
            if (user) {
                user.setAuthId(realUserId);
            }
        }
    }
}