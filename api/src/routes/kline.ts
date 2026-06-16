import { Router } from "express";
import { pool } from "../db/pool";
import { parseMarketSymbol } from "../utils/validation";

export const klineRouter = Router();

const INTERVAL_MAP: Record<string, string> = {
    '1m':  'klines_1m',
    '5m':  'klines_5m',
    '15m': 'klines_15m',
    '1h':  'klines_1h',
    '4h':  'klines_4h',
    '1d':  'klines_1d',
    '1w':  'klines_1w',
};

klineRouter.get("/", async (req, res) => {
    const market = (req.query.market || req.query.symbol) as string;
    const { interval, startTime, endTime } = req.query;

    if (!market) {
        return res.status(400).json({ error: "market or symbol parameter is required" });
    }

    let normalizedMarket: string;
    try {
        normalizedMarket = parseMarketSymbol(market);
    } catch (error: any) {
        return res.status(400).json({ error: error?.message || "Invalid market" });
    }

    if (!interval || !startTime || !endTime) {
        return res.status(400).json({ error: "interval, startTime, and endTime are required" });
    }

    const startUnix = Number(startTime);
    const endUnix = Number(endTime);
    if (!Number.isFinite(startUnix) || !Number.isFinite(endUnix)) {
        return res.status(400).json({ error: "startTime and endTime must be numbers" });
    }
    if (startUnix <= 0 || endUnix <= 0 || endUnix <= startUnix) {
        return res.status(400).json({ error: "Invalid time range" });
    }

    const tableName = INTERVAL_MAP[interval as string];
    if (!tableName) {
        return res.status(400).json({ error: `Invalid interval: ${interval}` });
    }

    const query = `SELECT * FROM ${tableName} WHERE bucket >= $1 AND bucket <= $2 AND currency_code = $3`;

    try {
        const result = await pool.query(query, [
            new Date(startUnix * 1000),
            new Date(endUnix * 1000),
            normalizedMarket,
        ]);
        
        const klinesData = result.rows.map(x => ({
            close: x.close.toString(),
            end: x.bucket,
            high: x.high.toString(),
            low: x.low.toString(),
            open: x.open.toString(),
            quoteVolume: (x.volume * x.close).toString(),
            start: x.bucket,
            trades: "1",
            volume: x.volume.toString(),
        }));
        
        res.json(klinesData);
    } catch (err: any) {
        console.error('Klines query error:', err.message);
        res.status(500).json({ error: 'Database query failed' });
    }
});