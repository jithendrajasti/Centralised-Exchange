import { Router } from "express";
import { RedisManager } from "../RedisManager";
import { CREATE_ORDER, CANCEL_ORDER, GET_OPEN_ORDERS } from "../types";
import { authenticate } from "../middleware/authenticate";
import { requireRoles } from "../middleware/authorize";
import { createRateLimiter } from "../middleware/rateLimit";
import { auditLog } from "../utils/audit";
import { parseMarketSymbol, parseOrderSide, parsePositiveNumber, parseRequiredString } from "../utils/validation";

/* ═══════════════════════════════════════════════════════════════
   Order Route — Create, cancel, and query orders
   
   Fixes:
   - Input validation for create order (price, quantity, side, market)
   - Consistent error responses
   ═══════════════════════════════════════════════════════════════ */

export const orderRouter = Router();

const orderWriteLimiter = createRateLimiter({
    keyPrefix: "rl:order:write",
    max: 120,
    windowSeconds: 60,
    keyGenerator: (req) => req.auth?.userId || req.ip || "unknown",
});

const orderReadLimiter = createRateLimiter({
    keyPrefix: "rl:order:read",
    max: 300,
    windowSeconds: 60,
    keyGenerator: (req) => req.auth?.userId || req.ip || "unknown",
});

orderRouter.post("/", authenticate, requireRoles(["user", "admin"]), orderWriteLimiter, async (req, res) => {
    try {
        const { market, price, quantity, side } = req.body;
        const userId = req.auth!.userId;

        const normalizedMarket = parseMarketSymbol(market);
        const normalizedPrice = parsePositiveNumber(price, "price");
        const normalizedQuantity = parsePositiveNumber(quantity, "quantity");
        const normalizedSide = parseOrderSide(side);

        const response = await RedisManager.getInstance().sendAndAwait({
            type: CREATE_ORDER,
            data: {
                market: normalizedMarket,
                price: normalizedPrice.toString(),
                quantity: normalizedQuantity.toString(),
                side: normalizedSide,
                userId,
            }
        });

        auditLog({
            event: "order.create",
            requestId: req.requestId,
            userId,
            ip: req.ip,
            success: true,
            details: {
                market: normalizedMarket,
                side: normalizedSide,
            },
        });

        res.json(response.payload);
    } catch (error: any) {
        console.error('Create order error:', error?.message);
        auditLog({
            event: "order.create",
            level: "warn",
            requestId: req.requestId,
            userId: req.auth?.userId,
            ip: req.ip,
            success: false,
            details: { message: error?.message || "unknown" },
        });
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to create order', 
                message: error?.message || 'Engine timeout'
            });
        }
    }
});

orderRouter.delete("/", authenticate, requireRoles(["user", "admin"]), orderWriteLimiter, async (req, res) => {
    try {
        const { orderId, market } = req.body;
        const userId = req.auth!.userId;
        const normalizedOrderId = parseRequiredString(orderId, "orderId");
        const normalizedMarket = parseMarketSymbol(market);
        
        const response = await RedisManager.getInstance().sendAndAwait({
            type: CANCEL_ORDER,
            data: { orderId: normalizedOrderId, market: normalizedMarket, userId }
        });

        auditLog({
            event: "order.cancel",
            requestId: req.requestId,
            userId,
            ip: req.ip,
            success: true,
            details: {
                orderId: normalizedOrderId,
                market: normalizedMarket,
            },
        });

        res.json(response.payload);
    } catch (error: any) {
        console.error('Cancel order error:', error?.message);
        auditLog({
            event: "order.cancel",
            level: "warn",
            requestId: req.requestId,
            userId: req.auth?.userId,
            ip: req.ip,
            success: false,
            details: { message: error?.message || "unknown" },
        });
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to cancel order',
                message: error?.message || 'Engine timeout'
            });
        }
    }
});

orderRouter.get("/open", authenticate, requireRoles(["user", "admin"]), orderReadLimiter, async (req, res) => {
    try {
        const userId = req.auth!.userId;
        const market = parseMarketSymbol(req.query.market);
        
        const response = await RedisManager.getInstance().sendAndAwait({
            type: GET_OPEN_ORDERS,
            data: { userId, market }
        });
        res.json(response.payload);
    } catch (error: any) {
        console.error('Get open orders error:', error?.message);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to get open orders',
                message: error?.message || 'Engine timeout'
            });
        }
    }
});