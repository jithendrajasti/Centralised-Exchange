import { BASE_CURRENCY } from "./Engine";
import { fromScaledToDecimal, percentChangeScaled } from "./precision";

export interface Order {
    price: number;
    quantity: number;
    orderId: string;
    filled: number;
    side: "buy" | "sell";
    userId: string;
    timestamp: number;
}

export interface Fill {
    price: number;
    qty: number;
    tradeId: number;
    otherUserId: string;
    markerOrderId: string;
}

export class Orderbook {
    private static readonly EPSILON = 0;
    bids: Order[];
    asks: Order[];
    baseAsset: string;
    quoteAsset: string = BASE_CURRENCY;
    lastTradeId: number;
    currentPrice: number;
    lastPrice: number;
    firstPrice: number;
    high: number;
    low: number;
    volume: number;
    quoteVolume: number;
    trades: number;
    private depthBids: Record<string, number> = Object.create(null);
    private depthAsks: Record<string, number> = Object.create(null);

    constructor(
        baseAsset: string, 
        bids: Order[], 
        asks: Order[], 
        lastTradeId: number, 
        currentPrice: number,
        lastPrice?: number,
        firstPrice?: number,
        high?: number,
        low?: number,
        volume?: number,
        quoteVolume?: number,
        trades?: number
    ) {
        this.bids = bids;
        this.asks = asks;
        this.baseAsset = baseAsset;
        this.lastTradeId = lastTradeId || 0;
        this.currentPrice = currentPrice || 0;
        this.lastPrice = lastPrice ?? currentPrice ?? 0;
        this.firstPrice = firstPrice ?? currentPrice ?? 0;
        this.high = high ?? currentPrice ?? 0;
        this.low = low ?? currentPrice ?? 0;
        this.volume = volume ?? 0;
        this.quoteVolume = quoteVolume ?? 0;
        this.trades = trades ?? 0;
        this.rebuildDepth();
    }

    ticker() {
        return `${this.baseAsset}_${this.quoteAsset}`;
    }

    getSnapshot() {
        return {
            baseAsset: this.baseAsset,
            bids: this.bids,
            asks: this.asks,
            lastTradeId: this.lastTradeId,
            currentPrice: this.currentPrice,
            lastPrice: this.lastPrice,
            firstPrice: this.firstPrice,
            high: this.high,
            low: this.low,
            volume: this.volume,
            quoteVolume: this.quoteVolume,
            trades: this.trades
        }
    }

    private rebuildDepth() {
        this.depthBids = Object.create(null);
        this.depthAsks = Object.create(null);

        for (const order of this.bids) {
            const remaining = order.quantity - order.filled;
            if (remaining > Orderbook.EPSILON) {
                this.applyDepthDelta("bids", order.price, remaining);
            }
        }

        for (const order of this.asks) {
            const remaining = order.quantity - order.filled;
            if (remaining > Orderbook.EPSILON) {
                this.applyDepthDelta("asks", order.price, remaining);
            }
        }
    }

    private applyDepthDelta(side: "bids" | "asks", price: number, delta: number) {
        if (!Number.isFinite(delta) || Math.abs(delta) < Orderbook.EPSILON) {
            return;
        }

        const key = price.toString();
        const book = side === "bids" ? this.depthBids : this.depthAsks;
        const next = (book[key] || 0) + delta;

        if (next <= Orderbook.EPSILON) {
            delete book[key];
            return;
        }

        book[key] = next;
    }

    addOrder(order: Order): {
        executedQty: number,
        fills: Fill[]
    } {
        if (order.side === "buy") {
            const {executedQty, fills} = this.matchBid(order); 
            order.filled = executedQty;
            const remaining = order.quantity - executedQty;
            if (remaining <= Orderbook.EPSILON) {
                return {
                    executedQty,
                    fills
                }
            }
            this.bids.push(order);
            // Sort bids: Higher price first, then earlier timestamp (FIFO)
            this.bids.sort((a, b) => {
                if (b.price !== a.price) {
                    return b.price - a.price;  // Higher price first
                }
                return a.timestamp - b.timestamp;  // Earlier time first
            });
            this.applyDepthDelta("bids", order.price, remaining);
            return {
                executedQty,
                fills
            }
        } else {
            const {executedQty, fills} = this.matchAsk(order);
            order.filled = executedQty;
            const remaining = order.quantity - executedQty;
            if (remaining <= Orderbook.EPSILON) {
                return {
                    executedQty,
                    fills
                }
            }
            this.asks.push(order);
            // Sort asks: Lower price first, then earlier timestamp (FIFO)
            this.asks.sort((a, b) => {
                if (a.price !== b.price) {
                    return a.price - b.price;  // Lower price first
                }
                return a.timestamp - b.timestamp;  // Earlier time first
            });
            this.applyDepthDelta("asks", order.price, remaining);
            return {
                executedQty,
                fills
            }
        }
    }

    matchBid(order: Order): {fills: Fill[], executedQty: number} {
        const fills: Fill[] = [];
        let executedQty = 0;

        for (let i = 0; i < this.asks.length; i++) {
            // Self-trade prevention: Skip orders from the same user
            if (this.asks[i].userId === order.userId) {
                continue;
            }
            
            if (this.asks[i].price <= order.price && executedQty < order.quantity) {
                const filledQty = Math.min((order.quantity - executedQty), this.asks[i].quantity);
                executedQty += filledQty;
                this.asks[i].filled += filledQty;
                this.applyDepthDelta("asks", this.asks[i].price, -filledQty);
                fills.push({
                    price: this.asks[i].price,
                    qty: filledQty,
                    tradeId: this.lastTradeId++,
                    otherUserId: this.asks[i].userId,
                    markerOrderId: this.asks[i].orderId
                });
            }
        }
        for (let i = 0; i < this.asks.length; i++) {
            if (this.asks[i].filled >= this.asks[i].quantity - Orderbook.EPSILON) {
                this.asks.splice(i, 1);
                i--;
            }
        }
        return {
            fills,
            executedQty
        };
    }

    matchAsk(order: Order): {fills: Fill[], executedQty: number} {
        const fills: Fill[] = [];
        let executedQty = 0;
        
        for (let i = 0; i < this.bids.length; i++) {
            // Self-trade prevention: Skip orders from the same user
            if (this.bids[i].userId === order.userId) {
                continue;
            }
            
            if (this.bids[i].price >= order.price && executedQty < order.quantity) {
                const amountRemaining = Math.min(order.quantity - executedQty, this.bids[i].quantity);
                executedQty += amountRemaining;
                this.bids[i].filled += amountRemaining;
                this.applyDepthDelta("bids", this.bids[i].price, -amountRemaining);
                fills.push({
                    price: this.bids[i].price,
                    qty: amountRemaining,
                    tradeId: this.lastTradeId++,
                    otherUserId: this.bids[i].userId,
                    markerOrderId: this.bids[i].orderId
                });
            }
        }
        for (let i = 0; i < this.bids.length; i++) {
            if (this.bids[i].filled >= this.bids[i].quantity - Orderbook.EPSILON) {
                this.bids.splice(i, 1);
                i--;
            }
        }
        return {
            fills,
            executedQty
        };
    }

    getDepth() {
        const bids: [string, string][] = [];
        const asks: [string, string][] = [];

        for (const price in this.depthBids) {
            bids.push([
                fromScaledToDecimal(Number(price)),
                fromScaledToDecimal(this.depthBids[price])
            ]);
        }

        for (const price in this.depthAsks) {
            asks.push([
                fromScaledToDecimal(Number(price)),
                fromScaledToDecimal(this.depthAsks[price])
            ]);
        }

        return {
            bids,
            asks
        };
    }

    getOpenOrders(userId: string): Order[] {
        const asks = this.asks.filter(x => x.userId === userId);
        const bids = this.bids.filter(x => x.userId === userId);
        return [...asks, ...bids];
    }

    cancelBid(order: Order) {
        const index = this.bids.findIndex(x => x.orderId === order.orderId);
        if (index !== -1) {
            const price = this.bids[index].price;
            const remaining = this.bids[index].quantity - this.bids[index].filled;
            if (remaining > Orderbook.EPSILON) {
                this.applyDepthDelta("bids", price, -remaining);
            }
            this.bids.splice(index, 1);
            return price
        }
    }

    cancelAsk(order: Order) {
        const index = this.asks.findIndex(x => x.orderId === order.orderId);
        if (index !== -1) {
            const price = this.asks[index].price;
            const remaining = this.asks[index].quantity - this.asks[index].filled;
            if (remaining > Orderbook.EPSILON) {
                this.applyDepthDelta("asks", price, -remaining);
            }
            this.asks.splice(index, 1);
            return price
        }
    }

    getTicker() {
        const priceChange = this.lastPrice - this.firstPrice;
        return {
            firstPrice: fromScaledToDecimal(this.firstPrice),
            high: fromScaledToDecimal(this.high),
            lastPrice: fromScaledToDecimal(this.lastPrice),
            low: fromScaledToDecimal(this.low),
            priceChange: fromScaledToDecimal(priceChange),
            priceChangePercent: percentChangeScaled(this.lastPrice, this.firstPrice),
            quoteVolume: fromScaledToDecimal(this.quoteVolume),
            symbol: this.ticker(),
            trades: this.trades.toString(),
            volume: fromScaledToDecimal(this.volume)
        }
    }

}
