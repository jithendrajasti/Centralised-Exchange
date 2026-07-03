import { Router } from "express";
import { RedisManager } from "../RedisManager";
import { GET_TICKERS } from "../types";
import { parseMarketSymbol } from "../utils/validation";
import { createRateLimiter } from "../middleware/rateLimit";

export const tickersRouter = Router();

const publicReadLimiter = createRateLimiter({
    keyPrefix: "rl:ticker:read",
    max: 600,
    windowSeconds: 60,
    keyGenerator: (req) => req.ip || "unknown",
});

tickersRouter.get("/", publicReadLimiter, async (req, res) => {
    try {
        const { symbol } = req.query;
        let market: string | undefined;
        if (symbol) {
            try {
                market = parseMarketSymbol(symbol);
            } catch (error: any) {
                return res.status(400).json({ error: error?.message || "Invalid market" });
            }
        }
        
        const response = await RedisManager.getInstance().sendAndAwait({
            type:  GET_TICKERS,
            data: {
                market
            }
        });
        
        res.json(response.payload);
    } catch (error: any) {
        console.error('Get tickers error:', error?.message);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to get tickers',
                message: error?.message || 'Engine timeout'
            });
        }
    }
});