import { describe, expect, it, vi } from "vitest";
import { Engine } from "../trade/Engine";
import { RedisManager } from "../RedisManager";
import { CREATE_ORDER } from "../types/fromApi";

vi.mock("../RedisManager", () => ({
    RedisManager: {
      getInstance: () => ({
        publishMessage: vi.fn(),
        sendToApi: vi.fn(),
        pushMessage: vi.fn()
      })
    }
}));


// Pre-seeded test user IDs from Engine.setBaseBalances()
const TRADER_ID = "00000000-0000-0000-0000-000000000009"; // 1M USDC, 10K SOL
const MM_ID     = "00000000-0000-0000-0000-000000000005"; // 50M USDC, 50M SOL

describe("Engine", () => {
    it("Publishes Trade updates", () => {
        const engine = new Engine();
        const publishSpy = vi.spyOn(engine, "publishWsTrades");
        engine.process({
            message: {
                type: CREATE_ORDER,
                data: {
                    market: "SOL_USDC",
                    price: "1000",
                    quantity: "1",
                    side: "buy",
                    userId: TRADER_ID
                }
            },
            clientId: "1"
        });

        engine.process({
            message: {
                type: CREATE_ORDER,
                data: {
                    market: "SOL_USDC",
                    price: "999",
                    quantity: "1",
                    side: "sell",
                    userId: MM_ID
                }
            },
            clientId: "1"
        });

        expect(publishSpy).toHaveBeenCalledTimes(2);

    });

    it("Sets isBuyerMaker correctly", () => {
        const engine = new Engine();
        const publishSpy = vi.spyOn(engine, "publishWsTrades");

        engine.process({
            message: {
                type: CREATE_ORDER,
                data: {
                    market: "SOL_USDC",
                    price: "1000",
                    quantity: "1",
                    side: "buy",
                    userId: TRADER_ID
                }
            },
            clientId: "1"
        });

        engine.process({
            message: {
                type: CREATE_ORDER,
                data: {
                    market: "SOL_USDC",
                    price: "1000",
                    quantity: "1",
                    side: "sell",
                    userId: MM_ID
                }
            },
            clientId: "1"
        });

        const publishCalls = publishSpy.mock.calls;
        const lastCall = publishCalls[publishCalls.length - 1];
        const fills = lastCall?.[0] || [];
        const side = lastCall?.[2];

        expect(side).toBe("sell");
        expect(fills.length).toBeGreaterThan(0);
    });
});