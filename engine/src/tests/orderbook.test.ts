import { describe, expect, it } from "vitest";
import { Orderbook } from "../trade/Orderbook";

describe("Simple orders", () => {
    it("Empty orderbook should not be filled", () => {
        const orderbook = new Orderbook("SOL", [], [], 0, 0);
        const order = {
            price: 1000,
            quantity: 1,
            orderId: "1",
            filled: 0,
            side: "buy" as ("buy" | "sell"),
            userId: "1",
            timestamp: Date.now()
        };
        const { fills, executedQty } = orderbook.addOrder(order);
        expect(fills.length).toBe(0);
        expect(executedQty).toBe(0);
    });

    it("Can be partially filled", () => {
        const orderbook = new Orderbook("SOL", [{
            price: 1000,
            quantity: 1,
            orderId: "1",
            filled: 0,
            side: "buy" as ("buy" | "sell"),
            userId: "1",
            timestamp: Date.now()
        }], [], 0, 0);

        const order = {
            price: 1000,
            quantity: 2,
            orderId: "2",
            filled: 0,
            side: "sell" as ("buy" | "sell"),
            userId: "2",
            timestamp: Date.now()
        };

        const { fills, executedQty } = orderbook.addOrder(order);
        expect(fills.length).toBe(1);
        expect(executedQty).toBe(1);
    });

    it("Can be partially filled", () => {
        const orderbook = new Orderbook("SOL", [{
            price: 999,
            quantity: 1,
            orderId: "1",
            filled: 0,
            side: "buy" as ("buy" | "sell"),
            userId: "1",
            timestamp: Date.now()
        }],
        [{
            price: 1001,
            quantity: 1,
            orderId: "2",
            filled: 0,
            side: "sell" as ("buy" | "sell"),
            userId: "2",
            timestamp: Date.now()
        }], 0, 0);

        const order = {
            price: 1001,
            quantity: 2,
            orderId: "3",
            filled: 0,
            side: "buy" as ("buy" | "sell"),
            userId: "3",
            timestamp: Date.now()
        };

        const { fills, executedQty } = orderbook.addOrder(order);
        expect(fills.length).toBe(1);
        expect(executedQty).toBe(1);
        expect(orderbook.bids.length).toBe(2);
        expect(orderbook.asks.length).toBe(0);
    });
});

describe("Self trade prevention", () => {
    it("User cannot self trade", () => {
        const orderbook = new Orderbook("SOL", [], [{
            price: 1000,
            quantity: 1,
            orderId: "1",
            filled: 0,
            side: "sell" as ("buy" | "sell"),
            userId: "1",
            timestamp: Date.now()
        }], 0, 0);

        const order = {
            price: 1000,
            quantity: 1,
            orderId: "2",
            filled: 0,
            side: "buy" as ("buy" | "sell"),
            userId: "1",
            timestamp: Date.now()
        };

        const { fills, executedQty } = orderbook.addOrder(order);
        expect(fills.length).toBe(0);
        expect(executedQty).toBe(0);
        expect(orderbook.bids.length).toBe(1);
    });

});

describe("Precision errors are taken care of", () => {
    it("Bid does not persist even with decimals", () => {
        const orderbook = new Orderbook("SOL", [{
            price: 999,
            quantity: 0.551123,
            orderId: "1",
            filled: 0,
            side: "buy" as ("buy" | "sell"),
            userId: "1",
            timestamp: Date.now()
        }],
        [{
            price: 1001,
            quantity: 0.551,
            orderId: "2",
            filled: 0,
            side: "sell" as ("buy" | "sell"),
            userId: "2",
            timestamp: Date.now()
        }], 0, 0);

        const order = {
            price: 999,
            quantity: 0.551123,
            orderId: "3",
            filled: 0,
            side: "sell" as ("buy" | "sell"),
            userId: "3",
            timestamp: Date.now()
        };

        const { fills, executedQty } = orderbook.addOrder(order);
        expect(fills.length).toBe(1);
        expect(orderbook.bids.length).toBe(0);
        expect(orderbook.asks.length).toBe(1);
    });
});

describe("Partial fill correctness", () => {
    it("Second buy does not overfill a partially-filled ask", () => {
        const orderbook = new Orderbook("SOL", [], [{
            price: 1000,
            quantity: 10,
            orderId: "ask-1",
            filled: 0,
            side: "sell" as const,
            userId: "seller",
            timestamp: Date.now()
        }], 0, 0);

        // First buy: partially fills the ask (5 of 10)
        const buy1 = { price: 1000, quantity: 5, orderId: "buy-1", filled: 0, side: "buy" as const, userId: "buyer1", timestamp: Date.now() };
        const r1 = orderbook.addOrder(buy1);
        expect(r1.executedQty).toBe(5);
        expect(orderbook.asks[0].filled).toBe(5);
        expect(orderbook.asks.length).toBe(1); // ask still open

        // Second buy: should only fill remaining 5, not 10
        const buy2 = { price: 1000, quantity: 8, orderId: "buy-2", filled: 0, side: "buy" as const, userId: "buyer2", timestamp: Date.now() };
        const r2 = orderbook.addOrder(buy2);
        expect(r2.executedQty).toBe(5); // Only 5 remaining, not 8 or 10
        expect(r2.fills[0].qty).toBe(5);
        expect(orderbook.asks.length).toBe(0); // ask now fully consumed
    });

    it("Second sell does not overfill a partially-filled bid", () => {
        const orderbook = new Orderbook("SOL", [{
            price: 1000,
            quantity: 10,
            orderId: "bid-1",
            filled: 0,
            side: "buy" as const,
            userId: "buyer",
            timestamp: Date.now()
        }], [], 0, 0);

        // First sell: partially fills the bid (5 of 10)
        const sell1 = { price: 1000, quantity: 5, orderId: "sell-1", filled: 0, side: "sell" as const, userId: "seller1", timestamp: Date.now() };
        const r1 = orderbook.addOrder(sell1);
        expect(r1.executedQty).toBe(5);
        expect(orderbook.bids[0].filled).toBe(5);
        expect(orderbook.bids.length).toBe(1);

        // Second sell: should only fill remaining 5, not 8 or 10
        const sell2 = { price: 1000, quantity: 8, orderId: "sell-2", filled: 0, side: "sell" as const, userId: "seller2", timestamp: Date.now() };
        const r2 = orderbook.addOrder(sell2);
        expect(r2.executedQty).toBe(5);
        expect(r2.fills[0].qty).toBe(5);
        expect(orderbook.bids.length).toBe(0);
    });
});