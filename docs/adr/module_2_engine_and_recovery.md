# CEX Mastery — Module 2: The Engine — State, Matching, Snapshots & Crash Recovery

> The Engine is the beating heart of the exchange. It holds every open order and every user's balance in RAM. It matches buyers with sellers in microseconds. And when the server loses power, it recovers without losing a single trade. This module explains every line of how.

---

## Why The Engine Lives In RAM

When you design a matching engine, you face a fundamental question: where does the order state live?

**Option A: Database.** Every order read = `SELECT * FROM orders WHERE market = 'SOL_USDC' AND side = 'sell' ORDER BY price ASC`. Every match = `UPDATE orders SET filled = filled + 100`. Every balance change = `UPDATE balances SET amount = amount - 50 WHERE userId = '...'`. These are 10–50ms per query. At 1,000 orders per second, you need 3,000+ queries per second just for matching — and that's before any read queries for depth, balances, or tickers. Postgres collapses.

**Option B: RAM.** `this.orderbooks[0].asks[0].price` is a memory read: 10 nanoseconds. Matching is a loop over an array in memory. Balance update is `userBal.available += amount` — one integer addition. The entire match-settle cycle for one order: **under 1 microsecond.** That's 1,000,000 orders per second on a single CPU core.

The trade-off: if the process dies, RAM is gone. The solution: **periodic snapshots** (dump the full state to a JSON file every 30 seconds) plus **Redis Streams** (a durable log of every message the engine received, replayable on restart). Together, they mean a crash loses at most 30 seconds of snapshot state, but zero messages — every message in that 30-second window is replayed from the stream.

---

## File: `engine/src/index.ts` — The Main Loop

```
path: engine/src/index.ts
```

### Constants and Identity

```typescript
const STREAM_NAME = "engine_messages";
const GROUP_NAME  = "engine_group";
const CONSUMER    = "engine-1";
```

These three strings are the engine's identity inside Redis.

**`STREAM_NAME`** — the Redis key where the API writes order commands. Every `POST /api/v1/order` ends up as an entry in this stream.

**`GROUP_NAME`** — the consumer group. Redis uses this to track which messages have been delivered and which have been acknowledged. Think of it as a cursor with a memory.

**`CONSUMER`** — this specific process's name within the group. Redis tracks the Pending Entry List (PEL) per consumer name. **This name must be the same across restarts.** If you changed it to `"engine-2"` after a crash, Redis would think it's a brand new consumer with an empty PEL, skip crash recovery entirely, and you'd lose the unacknowledged messages.

---

### Creating the Consumer Group

```typescript
try {
    await redisClient.xGroupCreate(STREAM_NAME, GROUP_NAME, "$", { MKSTREAM: true });
    //                                                       ↑         ↑
    //                      "start from right now, not history"     "create stream if missing"
    console.log(`Consumer group '${GROUP_NAME}' created on stream '${STREAM_NAME}'`);
} catch (err: any) {
    if (err?.message?.includes("BUSYGROUP")) {
        //  ↑ Redis error code = "this group already exists"
        console.log(`Consumer group '${GROUP_NAME}' already exists — skipping creation`);
    } else {
        throw err;  // Connection refused, wrong Redis version, etc. — real errors
    }
}
```

**Why `"$"` as the starting position?** It means: "for this brand new group, start delivering messages from right now. Don't replay old history." This is correct on first boot — you don't want to replay messages from before the group existed.

**Why `MKSTREAM: true`?** Without it, if the stream key `engine_messages` doesn't exist yet (fresh deployment, no API has sent any messages), Redis throws an error. `MKSTREAM: true` creates an empty stream key simultaneously. One less setup step.

**Why the try/catch instead of "check then create"?** Race condition. Between checking and creating, another instance could create the group. The try/catch is atomic — it's the correct pattern. Redis calls this "optimistic creation."

**Why is `BUSYGROUP` OK but other errors are re-thrown?** `BUSYGROUP` = "group already exists" = normal on every restart after the first. Connection refused, auth errors, out-of-memory — those are real problems that should crash the engine at startup. Better to fail loudly than to silently operate without a stream.

---

### The Graceful Shutdown Handler

```typescript
const shutdown = async () => {
    if (isShuttingDown) return;
    //  ↑ guard: prevents running twice if SIGTERM + SIGINT arrive simultaneously
    isShuttingDown = true;
    
    console.log("\nShutting down gracefully...");
    try {
        engine.saveSnapshot();
        //     ↑ write current state to disk before dying
        console.log("Snapshot saved on shutdown.");
    } catch (e) {
        console.error("Failed to save snapshot on shutdown:", e);
        //  ↑ best-effort: if snapshot fails, the Stream pending entries handle recovery
    }
    await redisClient.disconnect();
    process.exit(0);
};

process.on("SIGINT", shutdown);   // Ctrl+C in terminal
process.on("SIGTERM", shutdown);  // docker compose stop / docker kill
```

**`SIGTERM`** is what Docker sends when you run `docker compose stop`. Docker gives the process 10 seconds to clean up, then sends `SIGKILL` (which cannot be caught — instant death). The shutdown handler must finish within 10 seconds or the snapshot is lost.

**`isShuttingDown`** prevents double execution. Without it: if both SIGTERM and SIGINT arrive at the same time (rare but possible — user presses Ctrl+C while Docker is also stopping), `saveSnapshot()` could run twice simultaneously, creating two concurrent async file writes to the same file.

**Why does the main loop check `!isShuttingDown`?**
```typescript
while (!isShuttingDown) {
    // ...
}
```
After `shutdown()` sets `isShuttingDown = true`, the main loop could still run one more iteration before the `process.exit(0)` fires (because `shutdown` is async and the event loop is free between awaits). The check prevents processing new messages during shutdown.

---

### The Crash Recovery Loop — The Most Important Startup Code

```typescript
console.log("Checking for unacknowledged pending messages (crash recovery)...");
let pendingId = engine.getLastProcessedStreamId();
//              ↑ loaded from snapshot.json, e.g. "1751380000100-0"
//                or "0-0" if no snapshot exists (fresh start)

let replayDone = false;
while (!isShuttingDown && !replayDone) {
    const pending = await redisClient.xReadGroup(
        GROUP_NAME, CONSUMER,
        [{ key: STREAM_NAME, id: pendingId === "0-0" ? "0" : pendingId }],
        //                       ↑ "0" = give me ALL pending messages from PEL
        //                       ↑ specific ID = give me pending messages AFTER this ID
        { COUNT: 10, BLOCK: 0 }
        //     ↑ batch of 10     ↑ don't block (PEL reads never block anyway)
    );
```

Understanding this requires understanding two Redis concepts:

**The Pending Entry List (PEL):** When Redis delivers a message via `XREADGROUP`, it records "consumer X received message Y" in the PEL. The message stays in the PEL until the consumer calls `XACK`. If the consumer crashes, the PEL entry survives in Redis memory (and on disk if AOF is enabled). On restart, reading the PEL gives you exactly the messages you were working on when you died.

**`id: ">"` vs `id: "0"`:** This is the most confusing part of the Redis Streams API. With `">"`, you get NEW messages not yet delivered to any consumer — that's the normal operating mode. With `"0"` (or any specific ID), you get messages from the PEL — messages that were delivered but never acknowledged. These are completely different behaviors from the same command, controlled by a single character.

**Why `pendingId === "0-0" ? "0" : pendingId`?** On a fresh start (no snapshot), `lastProcessedStreamId` is `"0-0"`. Passing `"0"` to XREADGROUP in PEL mode means "give me all pending messages from the very beginning." On restart with a snapshot, we pass the actual last processed ID — Redis returns only pending messages with IDs after that point.

```typescript
    if (!pending || pending.length === 0 || pending[0].messages.length === 0) {
        console.log("No pending messages — crash recovery complete.");
        replayDone = true;
        break;
        //  ↑ PEL is empty → nothing to recover → switch to normal mode
    }
```

When `XREADGROUP` returns empty from the PEL, all unacknowledged messages have been processed and ACK'd. Recovery is done.

```typescript
    for (const { id, message: fields } of pending[0].messages) {
        try {
            const payload = JSON.parse(fields.data);
            //                         ↑ the raw JSON string stored in the stream entry
            if (logMessages) {
                console.log(`[REPLAY] Processing pending message ${id} type: ${payload.message?.type}`);
            }
            engine.process({ message: payload.message, clientId: fields.clientId });
            //                                                    ↑ the UUID "return address" for the API
            await redisClient.xAck(STREAM_NAME, GROUP_NAME, id);
            //                ↑ "I successfully processed this message" → removed from PEL
            engine.setLastProcessedStreamId(id);
            //                              ↑ update the snapshot offset
            pendingId = id;
            //          ↑ advance the loop cursor
        } catch (error) {
            console.error(`[REPLAY] Poison message ${id} failed — moving to DLQ:`, error);
            try {
                await redisClient.xAck(STREAM_NAME, GROUP_NAME, id);
                //                ↑ force-acknowledge — removes from PEL even though processing failed
                await redisClient.lPush("engine_dlq", JSON.stringify({
                    id, fields, error: String(error), ts: Date.now()
                }));
                //  ↑ push to Dead Letter Queue for manual inspection
            } catch (dlqErr) {
                console.error(`[REPLAY] Failed to push ${id} to DLQ:`, dlqErr);
            }
            pendingId = id;  // advance past this message regardless
            //                 ↑ WITHOUT THIS: the loop fetches the same broken message forever
            //                   and the engine never finishes booting (BUG 1 fix)
        }
    }
```

**Q: Why is the catch block so critical?**

Imagine a message has corrupted JSON, or triggers a bug in `engine.process()`. Without the catch: `JSON.parse` throws → the for-loop iteration ends → `pendingId` never advances → the while-loop calls `XREADGROUP` again with the same `pendingId` → gets the same broken message → throws again → **infinite loop, engine never boots.**

With the catch: force-XACK the broken message (remove from PEL so it's never delivered again), push a copy to the DLQ for investigation, and advance `pendingId`. The engine boots successfully. The DLQ is "I gave up, but I didn't throw it away."

**Q: Isn't force-ACKing a failed message dangerous?**

Yes — you lose that trade. But the alternative is an engine that never starts. The DLQ preserves the original message for manual re-processing. In practice, a message that consistently fails `JSON.parse` is either corrupted (unrecoverable) or a bug in the code (fix the bug, then re-process from DLQ).

---

### The Main Processing Loop

```typescript
while (!isShuttingDown) {
    try {
        const response = await redisClient.xReadGroup(
            GROUP_NAME, CONSUMER,
            [{ key: STREAM_NAME, id: ">" }],
            //                        ↑ ">" = give me NEW messages, not PEL
            { COUNT: 1, BLOCK: 1000 }
            //     ↑ one at a time  ↑ wait up to 1 second for a message
        );
```

**Why `COUNT: 1`?** Process one message at a time. Each message may mutate balances, fill orders, push DB events, publish Pub/Sub updates. Processing them strictly one-at-a-time makes the log cleaner and replay safer. The engine is single-threaded anyway — there's no parallelism to gain.

**Why `BLOCK: 1000`?** Without blocking, the loop spins at 100% CPU doing empty reads when the exchange is quiet (nights, weekends). `BLOCK: 1000` means "wait up to 1 second for a message before returning." The event loop is free during this wait. Overhead: at most 1 second of latency before detecting a shutdown signal.

```typescript
        if (!response || response.length === 0) {
            continue;
            //  ↑ 1-second timeout — no new message. Loop back and check isShuttingDown.
        }

        for (const { id, message: fields } of response[0].messages) {
            try {
                const payload = JSON.parse(fields.data);
                engine.process({ message: payload.message, clientId: fields.clientId });
                //  ↑ process the order synchronously in RAM (single-threaded guarantee)
                //    this is the critical section: balances mutated, orders matched, fills created

                await redisClient.xAck(STREAM_NAME, GROUP_NAME, id);
                //  ↑ "I'm done with this message" — removed from PEL
                //    IF WE CRASH BEFORE THIS LINE → message stays pending → replayed on restart ✓
                
                engine.setLastProcessedStreamId(id);
                //  ↑ update the offset that will be saved in the next snapshot
            } catch (error) {
                console.error(`Error processing message ${id}:`, error);
                // Do NOT XACK — message stays pending and will be retried on restart.
                //  ↑ this is intentional: transient errors (Redis blip, race condition) get retried
            }
        }
    } catch (error) {
        console.error("Error reading from stream:", error);
        
        if (!redisClient.isOpen) {
            console.log("Redis connection lost, waiting before retry...");
            await new Promise(resolve => setTimeout(resolve, 5000));
            //  ↑ 5-second backoff: prevents hammering Redis during an outage
        }
    }
}
```

**The ACK contract is the safety guarantee:**
```
engine.process()  →  succeeds  →  XACK  →  message deleted from PEL  →  SAFE
engine.process()  →  succeeds  →  CRASH BEFORE XACK  →  message stays in PEL  →  REPLAYED ON RESTART
engine.process()  →  throws    →  catch skips XACK  →  message stays in PEL  →  RETRIED ON RESTART
```

**Q: What happens to the API client during a crash?**

The API was waiting for a `PUBLISH <clientId>` response. The engine died before publishing. The API's 10-second timeout fires (`setTimeout` in `sendAndAwait`), the Promise rejects, the HTTP request returns 503 "Engine response timeout." The user sees an error. But on engine restart, if the order was in the PEL, it gets replayed. The order was processed — the user just doesn't know it. If they retry the order, `checkAndLockFunds` will reject with "Insufficient funds" (because the funds from the first processing are now locked). This is the known UX gap in at-least-once architectures.

---

## File: `engine/src/trade/Engine.ts` — The State Machine

```
path: engine/src/trade/Engine.ts
```

### The State

```typescript
export class Engine {
    private orderbooks: Orderbook[] = [];
    //  ↑ one per market (currently just SOL_USDC)
    //    adding ETH_USDC = this.orderbooks.push(new Orderbook("ETH"))
    //    all lookups use .find(o => o.ticker() === market) — zero hardcoding
    
    private balances: Map<string, UserBalance> = new Map();
    //  ↑ THE source of truth for all money on this exchange
    //    key: userId (UUID string)
    //    value: { "SOL": { available: 5000000, locked: 0 }, "USDC": { available: 100000000, locked: 0 } }
    //    numbers are scaled integers (×1,000,000) — see Module 1
    
    private lastProcessedStreamId: string = "0-0";
    //  ↑ Redis Stream message ID of the last successfully processed + XACK'd message
    //    saved in every snapshot — loaded on restart — used for crash recovery replay offset
    //    format: "timestamp-sequence", e.g. "1751380000100-0"
    
    private _dirty: boolean = false;
    //  ↑ "has state changed since the last snapshot?"
    //    set to true in createOrder() — checked every 30s by the snapshot interval
    //    prevents pointless disk writes when the exchange is idle (no trades happening)
```

---

### Loading the Snapshot

```typescript
constructor() {
    let snapshot = null
    try {
        if (process.env.WITH_SNAPSHOT) {
            //  ↑ set to "true" in docker-compose.yml
            //    omit it to start fresh in local dev without deleting snapshot.json
            snapshot = fs.readFileSync("./snapshot.json");
            //         ↑ SYNCHRONOUS read — correct here because the constructor runs
            //           before the event loop starts. Blocking blocks nothing.
            //           Using async would require constructor to return a Promise,
            //           breaking "const engine = new Engine()"
        }
    } catch (e) {
        console.log("No snapshot found");
        //  ↑ first ever boot: no file exists. OR: corrupt file (half-written JSON)
        //    either way, engine starts fresh with empty orderbook and default balances
    }
```

```typescript
    if (snapshot) {
        const snapshotSnapshot = JSON.parse(snapshot.toString());
        const snapshotVersion = snapshotSnapshot.version ?? 1;
        //                                                 ↑ ?? (nullish coalescing)
        //    old snapshots have no version field → defaults to 1
        //    ?? only falls back on null/undefined, NOT 0 or false
        
        const isScaled = snapshotVersion >= SNAPSHOT_VERSION;  // SNAPSHOT_VERSION = 2
        //  ↑ if true: snapshot numbers are already scaled integers (good)
        //    if false: snapshot numbers are legacy floats (need converting)
```

**Why does snapshot versioning exist?** The first version of the engine stored prices as JavaScript floats (e.g. `"price": 5.5`). After the precision migration to scaled integers (Module 1), new snapshots store `"price": 5500000`. Old snapshot files on disk would have float values. The `isScaled` flag tells the constructor whether to convert during load.

```typescript
        const normalizeOrder = (order: any): Order => ({
            price:    isScaled ? order.price    : toScaledFromDecimal(String(order.price ?? 0)),
            //                                                               ↑ ?? 0: if field missing
            //                                                                 in corrupt snapshot,
            //                                                                 default to 0 not crash
            quantity: isScaled ? order.quantity  : toScaledFromDecimal(String(order.quantity ?? 0)),
            orderId:  order.orderId,
            filled:   isScaled ? order.filled    : toScaledFromDecimal(String(order.filled ?? 0)),
            side:     order.side,
            userId:   order.userId,
            timestamp: order.timestamp
        });
```

`String(order.price ?? 0)` — `toScaledFromDecimal` takes a string. The old float was stored as a JSON number. After `JSON.parse`, it's a JS `number`. `String(5.5)` → `"5.5"` → `toScaledFromDecimal("5.5")` → `5500000`. Correct.

```typescript
        // Load last processed stream ID for crash recovery replay
        if (snapshotSnapshot.lastProcessedStreamId) {
            this.lastProcessedStreamId = snapshotSnapshot.lastProcessedStreamId;
            //  ↑ e.g. "1751380000100-0" — the link between snapshot and Stream
            //    without this, crash recovery would start from "0" (replay everything)
        }
    } else {
        this.orderbooks = [new Orderbook(`SOL`, [], [], 0, 0)];
        //  ↑ fresh start: one empty orderbook for SOL_USDC
        this.setBaseBalances();
        //  ↑ seed hardcoded test accounts with initial balances
    }
```

---

### The Snapshot Interval — Timing Fixed (BUG 2)

```typescript
        this._dirty = false;
        setInterval(() => {
            if (this._dirty) {
                this._dirty = false;  // ← clear FIRST
                this.saveSnapshot();  // ← then start async write
                //  ↑ THIS ORDER MATTERS. Here's why:
            }
        }, 1000 * 30);
        //  ↑ every 30 seconds
```

**Why clear `_dirty` BEFORE calling `saveSnapshot()`, not after?**

`saveSnapshot()` is **asynchronous**. It starts a file write and returns immediately. The `setInterval` callback finishes. The event loop is now free to process new messages. Those messages call `createOrder()`, which sets `_dirty = true`.

**If you cleared `_dirty` after `saveSnapshot()` (the OLD buggy code):**
```
t=0ms:   setInterval fires, _dirty is true
t=0ms:   saveSnapshot() called — starts async disk write
t=0ms:   _dirty = false ← cleared right here
t=5ms:   new order arrives → createOrder() → _dirty = true
t=50ms:  fs.writeFile finishes, but snapshot doesn't include the t=5ms order
t=30s:   next interval fires → _dirty is true → saves again → OK this time
```

This seems fine — the next interval catches it. **But what if `saveSnapshot()` fails?** Inside `saveSnapshot`, if the `rename` fails, it sets `_dirty = true` as a retry signal. The OLD code then immediately clears `_dirty = false` after `saveSnapshot()` returns, destroying the retry signal. The failed snapshot is never retried.

**With the fix (clear first, then save):**
```
t=0ms:   _dirty = false ← cleared
t=0ms:   saveSnapshot() called — starts async disk write
t=5ms:   new order arrives → _dirty = true ← this survives because the clear already happened
t=50ms:  if rename fails → _dirty = true ← this also survives
t=30s:   next interval → _dirty is true → retry ✓
```

---

### `saveSnapshot()` — The Atomic Write

```typescript
saveSnapshot() {
    const snapshotData = {
        version: SNAPSHOT_VERSION,
        //       ↑ currently 2 — tells the constructor these numbers are scaled integers
        lastProcessedStreamId: this.lastProcessedStreamId,
        //                     ↑ THE critical link between snapshot and Stream
        //                       crash recovery starts replaying from this offset
        orderbooks: this.orderbooks.map(o => o.getSnapshot()),
        //          ↑ serializes bids, asks, lastTradeId, currentPrice, volume, etc.
        balances: Array.from(this.balances.entries())
        //        ↑ Map → Array of [key, value] pairs for JSON serialization
        //          JSON.stringify(new Map()) gives {} — Maps aren't JSON-serializable!
        //          Array.from(entries()) gives [["userId", {SOL: {...}, USDC: {...}}], ...]
        //          new Map(entries) on load reconstructs it perfectly
    };
    const tmpFile = "./snapshot.tmp.json";
    fs.writeFile(tmpFile, JSON.stringify(snapshotData), (err) => {
        //         ↑ write to TEMP FILE first — never directly to snapshot.json
        if (err) {
            console.error("Snapshot write error:", err);
            this._dirty = true;  // retry on next interval
            //                    ↑ disk full? permissions? next interval retries
            return;
        }
        fs.rename(tmpFile, "./snapshot.json", (renameErr) => {
            //  ↑ ATOMIC OPERATION on POSIX (Linux/macOS)
            //    the OS either completes the rename entirely or doesn't do it at all
            //    there's no half-renamed state — snapshot.json is always valid
            if (renameErr) {
                console.error("Snapshot rename error:", renameErr);
                this._dirty = true;  // retry on next interval
            }
        });
    });
}
```

**Q: Why write to `snapshot.tmp.json` first, then rename?**

If you write directly to `snapshot.json` and the engine crashes mid-write: you get a half-written file. 60% of the JSON is there, the rest is zeros. `JSON.parse()` throws. Your snapshot is corrupt. You have no previous good state.

The rename trick: write the full JSON to a temp file (if this fails, the old `snapshot.json` is untouched) → rename atomically (if this fails, the old `snapshot.json` is still untouched). `snapshot.json` is always either the previous complete snapshot or the new complete snapshot. Never corrupted.

**Q: Why use callbacks (`fs.writeFile`) instead of `await fs.promises.writeFile()`?**

If `saveSnapshot()` were async with `await`, it would need to be called with `await` in the `setInterval`. But `setInterval` doesn't await its callback — it fires and forgets. Using callbacks means the snapshot write is fire-and-forget: the engine keeps processing orders at full speed while the OS writes the file in the background. The event loop is never blocked.

---

### `process()` — The Switch Statement

```typescript
process({ message, clientId }: {message: MessageFromApi, clientId: string}) {
    switch (message.type) {
        case CREATE_ORDER:
            //  ↑ match + fill + update balances + push DB events + publish WS updates
        case CANCEL_ORDER:
            //  ↑ remove from orderbook + unlock reserved funds
        case GET_OPEN_ORDERS:
            //  ↑ filter orderbook by userId → return matching orders
        case ON_RAMP:
            //  ↑ credit USDC to user's available balance (simulated fiat deposit)
        case GET_DEPTH:
            //  ↑ return aggregated bid/ask depth from the depth cache
        case GET_BALANCES:
            //  ↑ return user's balance (available + locked per asset)
        case GET_TICKERS:
            //  ↑ return ticker data (lastPrice, high, low, volume, priceChange)
    }
}
```

Every case follows the same pattern:
1. Extract data from `message.data`
2. Do the work (in RAM — no async, no network)
3. Call `RedisManager.getInstance().sendToApi(clientId, response)` to publish the result

`clientId` is the UUID "return address." The API subscribed to a Pub/Sub channel named `<clientId>` and is blocking until a message arrives. When the engine publishes to that channel, the API's Promise resolves and the HTTP response goes back to the user.

**Q: Why not just return the response from `process()`?**

The engine and API are separate processes (possibly separate machines). They share no memory. Redis Pub/Sub is the only communication channel. The `clientId` is the addressing mechanism — it tells the engine "when you're done, publish your answer to this UUID channel."

---

### `createOrder()` — The Full Trade Lifecycle

```typescript
createOrder(market: string, price: string, quantity: string, side: "buy" | "sell", userId: string) {
    const orderbook = this.orderbooks.find(o => o.ticker() === market);
    const baseAsset = market.split("_")[0];   // "SOL_USDC" → "SOL" (the thing being traded)
    const quoteAsset = market.split("_")[1];  // "SOL_USDC" → "USDC" (the currency used to pay)
    //  ↑ this convention means adding "ETH_USDC" needs zero code changes — just a new Orderbook
```

```typescript
    // STEP 1: Validate input
    const numPrice = toScaledFromDecimal(price);      // "100.5" → 100500000
    const numQuantity = toScaledFromDecimal(quantity); // "3.7"   → 3700000
    if (!Number.isFinite(numPrice) || numPrice <= 0) throw new Error("Invalid price");
    //  ↑ toScaledFromDecimal returns NaN for garbage input ("abc", "", "NaN")
    //    Number.isFinite(NaN) is false → caught here
    //    numPrice <= 0 catches zero-price orders (divide-by-zero risk in balance calc)
    if (!Number.isFinite(numQuantity) || numQuantity <= 0) throw new Error("Invalid quantity");
    if (side !== "buy" && side !== "sell") throw new Error("Invalid side");
    //  ↑ all validation runs BEFORE any state mutation — throw here = nothing changed
```

```typescript
    // STEP 2: Lock funds
    this.checkAndLockFunds(baseAsset, quoteAsset, side, userId, price, quantity);
    //  ↑ buy: move (quantity × price) USDC from available → locked
    //    sell: move quantity SOL from available → locked
    //    throws "Insufficient funds" if balance too low → nothing changed
```

```typescript
    // STEP 3: Create the order object
    const order: Order = {
        price: numPrice,
        quantity: numQuantity,
        orderId: crypto.randomUUID(),  // globally unique V4 UUID — the order's permanent identity
        filled: 0,                     // nothing matched yet
        side,
        userId,
        timestamp: Date.now()          // used for FIFO tie-breaking: same price → earlier order first
    };
    
    // STEP 4: Match against the opposite side of the orderbook
    const { fills, executedQty } = orderbook.addOrder(order);
    //  ↑ returns fills = [{price, qty, tradeId, otherUserId, markerOrderId}, ...]
    //    executedQty = total quantity matched
    //    the unmatched remainder stays in the orderbook's bid/ask array
    
    // STEP 5: Move the money
    this.updateBalance(userId, baseAsset, quoteAsset, side, fills, executedQty);
    //  ↑ for each fill, 4 balance mutations:
    //    buyer gets SOL, buyer's USDC lock decreases,
    //    seller gets USDC, seller's SOL lock decreases
    //    ALL synchronous, same event loop tick — zero inconsistency window
```

```typescript
    // STEP 6: Fan out events (all fire-and-forget to Redis)
    this.createDbTrades(fills, market, side);
    //  ↑ XADD to db_processor: one TRADE_ADDED per fill → Postgres sol_prices table
    this.updateDbOrders(order, executedQty, fills, market);
    //  ↑ XADD to db_processor: ORDER_UPDATE for taker + one ORDER_UPDATE per fill's maker
    this.publisWsDepthUpdates(fills, fromScaledToDecimal(numPrice), side, market);
    //  ↑ PUBLISH to depth.SOL_USDC: updated bid/ask levels for the WS server
    this.publishWsTrades(fills, market, side);
    //  ↑ PUBLISH to trade.SOL_USDC: each fill as a trade event for the WS server
    this.updateTicker(market, fills);
    //  ↑ update lastPrice, high, low, volume, quoteVolume, trades count in memory

    this._dirty = true;
    //  ↑ state changed → snapshot will fire on next 30-second interval
```

---

### `checkAndLockFunds()` — The Economic Gate

```typescript
checkAndLockFunds(baseAsset, quoteAsset, side, userId, price, quantity) {
    const totalCost = multiplyScaled(numQuantity, numPrice);
    //                ↑ BigInt math to prevent overflow — see Module 1

    if (side === "buy") {
        const bal = this.getOrInitBalance(userId, quoteAsset);
        //         ↑ creates { available: 0, locked: 0 } if this user/asset hasn't been seen
        if (bal.available < totalCost) {
            throw new Error("Insufficient funds");
            //  ↑ throws BEFORE any state mutation — order is rejected cleanly
        }
        bal.available -= totalCost;
        bal.locked += totalCost;
        //  ↑ the lock: available + locked = constant
        //    user can't double-spend by placing two orders that exceed total balance
    } else {
        const bal = this.getOrInitBalance(userId, baseAsset);
        if (bal.available < numQuantity) {
            throw new Error("Insufficient funds");
        }
        bal.available -= numQuantity;
        bal.locked += numQuantity;
    }
}
```

**Q: What if the order fills at a better price than locked?**

A buyer locks `quantity × bidPrice` USDC. But the fill happens at the **maker's ask price**, which may be lower (price improvement). The buyer locked $100 worth but only spent $95 worth. The remaining $5 stays in `locked` until either: (a) more fills consume it, or (b) the order is cancelled and `cancelBid()` unlocks the remainder.

---

### `updateBalance()` — The Money Movement

```typescript
updateBalance(userId, baseAsset, quoteAsset, side, fills, executedQty) {
    if (side === "buy") {
        fills.forEach(fill => {
            const fillValue = multiplyScaled(fill.qty, fill.price);
            //                ↑ actual USDC cost at the MAKER's price (not the taker's bid)

            this.getOrInitBalance(fill.otherUserId, quoteAsset).available += fillValue;
            //                    ↑ seller receives USDC

            this.getOrInitBalance(userId, quoteAsset).locked -= fillValue;
            //                    ↑ buyer's locked USDC decreases (they "paid")

            this.getOrInitBalance(fill.otherUserId, baseAsset).locked -= fill.qty;
            //                    ↑ seller's locked SOL decreases (their sell order was consuming this)

            this.getOrInitBalance(userId, baseAsset).available += fill.qty;
            //                    ↑ buyer receives SOL into available (immediately tradeable)
        });
    }
    //  ↑ 4 mutations per fill. All in-memory. All integer arithmetic. No async.
    //    happens in the same event loop tick as the match — zero inconsistency window
```

**Q: Why `fill.price` and not the taker's bid price?**

The fill price is always the **maker's price** (the order that was already in the book). The taker (incoming order) gets the best available price, not their requested price. If a buyer bids $100 and the cheapest ask is $95, the buyer pays $95. This is **price improvement** — standard exchange behavior. Binance, NYSE, all of them work this way.

---

## Debugging the Engine

### "User has wrong balance"

Add temporarily to `process()` before the switch:
```typescript
const userBal = this.balances.get(message.data?.userId);
console.log("Balance BEFORE:", JSON.stringify(userBal));
```

And after the switch:
```typescript
console.log("Balance AFTER:", JSON.stringify(this.balances.get(message.data?.userId)));
```

Remember: all values are scaled by 1e6. Divide by 1,000,000 to read as humans.

### "Order not matching when it should"

```typescript
const ob = this.orderbooks.find(o => o.ticker() === "SOL_USDC");
console.log("Asks:", ob?.asks.map(a => ({ price: a.price/1e6, qty: (a.quantity-a.filled)/1e6, user: a.userId })));
console.log("Bids:", ob?.bids.map(b => ({ price: b.price/1e6, qty: (b.quantity-b.filled)/1e6, user: b.userId })));
```

Common causes: (a) self-trade prevention — buyer and seller have same userId, (b) prices don't cross — bid price < ask price, (c) order has `filled >= quantity` but wasn't cleaned up.

### "Snapshot not updating"

```bash
# Check file modification time
stat snapshot.json | grep Modify
# Should be within the last 30 seconds when the exchange is active
```

If not updating: `_dirty` isn't being set to `true`. Add a log in `createOrder()` after `this._dirty = true`. If you don't see the log, `createOrder()` is throwing before reaching that line.

### "Crash recovery not replaying messages"

```bash
redis-cli XPENDING engine_messages engine_group - + 10
```

If empty: nothing to replay (all messages were ACK'd before the crash — snapshot is current).
If entries exist: they will be replayed on next engine restart. Check the idle time — if it's very high, the engine hasn't restarted yet.
