import { Router } from "express";
import { RedisManager } from "../RedisManager";
import { authenticate } from "../middleware/authenticate";
import { requireRoles } from "../middleware/authorize";
import { createRateLimiter } from "../middleware/rateLimit";
import { auditLog } from "../utils/audit";
import { GET_BALANCES } from "../types";

export const walletRouter = Router();

const walletReadLimiter = createRateLimiter({
    keyPrefix: "rl:wallet:read",
    max: 120,
    windowSeconds: 60,
    keyGenerator: (req) => req.auth?.userId || req.ip || "unknown",
});

walletRouter.get("/balances", authenticate, requireRoles(["user", "admin"]), walletReadLimiter, async (req, res) => {
    try {
        const userId = req.auth!.userId;
        const response = await RedisManager.getInstance().sendAndAwait({
            type: GET_BALANCES,
            data: { userId },
        });

        if (response.type !== "BALANCES") {
            throw new Error("Unexpected engine response");
        }

        auditLog({
            event: "wallet.balances",
            requestId: req.requestId,
            userId,
            ip: req.ip,
            success: true,
        });

        return res.json(response.payload);
    } catch (error: any) {
        auditLog({
            event: "wallet.balances",
            level: "warn",
            requestId: req.requestId,
            userId: req.auth?.userId,
            ip: req.ip,
            success: false,
            details: { message: error?.message || "unknown" },
        });

        return res.status(500).json({ error: error?.message || "Failed to fetch balances" });
    }
});
