
import { Router } from "express";
import { RedisManager } from "../RedisManager";
import { GET_DEPTH } from "../types";
import { parseMarketSymbol } from "../utils/validation";

export const depthRouter = Router();

depthRouter.get("/", async (req, res) => {
    try {
        const { symbol } = req.query;
        if (!symbol) {
            return res.status(400).json({ error: "symbol is required" });
        }
        let market = "";
        try {
            market = parseMarketSymbol(symbol);
        } catch (error: any) {
            return res.status(400).json({ error: error?.message || "Invalid market" });
        }
        const response = await RedisManager.getInstance().sendAndAwait({
            type: GET_DEPTH,
            data: {
                market
            }
        });

        res.json(response.payload);
    } catch (error: any) {
        console.error('Get depth error:', error?.message);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to get depth',
                message: error?.message || 'Engine timeout'
            });
        }
    }
});
