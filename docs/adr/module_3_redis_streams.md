# CEX Mastery — Module 3: Redis Streams — The Durable Messaging Layer

> Every order flows through Redis twice — once from API to Engine, once from Engine to DB. If either pipeline drops a message, real money is lost. This module explains how Redis Streams guarantee zero message loss, how the old Redis Lists were broken, and how every line of the migration works.

---

## Why The Original Queue Was Broken

The first version used Redis **Lists** — the simplest queue you can build:

```
API side:      await client.lPush("messages", JSON.stringify(payload));
               //          ↑ push to the LEFT (head) of the list
               
Engine side:   const msg = await client.brPop("messages", 0);
               //                        ↑ block-pop from the RIGHT (tail) of the list
               //                                               ↑ 0 = block forever until a message arrives
```

A Redis List is exactly what it sounds like: a linked list. Push to one end, pop from the other. Simple, fast, widely understood.

**The fatal flaw: a pop is destructive and immediate.** The moment `brPop` returns, the message is gone from Redis. Gone from memory. It lives now only inside the engine process's RAM. If the engine crashes 1 nanosecond after the pop — whether the order was half-processed, fully processed, or not even parsed yet — the message is unrecoverable. Redis has no record that you never finished processing it.

**Concrete scenario that broke things:**

```
1. API calls lPush("messages", { type: CREATE_ORDER, ... })
2. Engine calls brPop("messages") → gets the message → GONE from Redis
3. Engine starts processing: matches the order, updates balances in RAM
4. Engine calls pushMessage() to send TRADE_ADDED to db_processor
5. ⚡ CRASH — OOM kill, segfault, power cut, Docker restart
6. The trade happened in RAM. Balances were updated in RAM.
   But: no TRADE_ADDED reached the db_processor → Postgres has no record.
   The message is not in Redis (it was popped). Not in the snapshot (30s delay).
   If the snapshot hasn't fired yet → the entire trade is lost.
```

The same problem hit the `db_processor` side: Engine pushes a trade event. DB Processor pops it. Crashes before the Postgres `INSERT`. Trade event: gone forever. The engine's balances show the trade happened. Postgres shows nothing. Permanent inconsistency.

---

## The Three Mechanisms That Fix Everything

Redis Streams (introduced in Redis 5.0) solve this with three features that Lists don't have:

**1. Messages persist after reading.** When you `XREADGROUP` a message, it stays in the stream. It's only removed by explicit trimming (`MAXLEN`). You can read it again, audit it, replay it.

**2. Consumer Groups track delivery.** A consumer group is a named cursor that records "this group has delivered messages up to this ID." Within the group, each consumer has a Pending Entry List (PEL) — a per-consumer record of "messages delivered to you but not yet acknowledged."

**3. Acknowledgment (XACK).** After processing a message, the consumer calls `XACK`. This removes the message from the consumer's PEL. If the consumer crashes without ACKing, the PEL entry survives in Redis. On restart, the consumer reads its PEL to find the unacknowledged messages and replays them.

---

## File: `api/src/RedisManager.ts` — The Producer

```
path: api/src/RedisManager.ts
```

### Two Redis Connections — Why

```typescript
export class RedisManager {
    private client: RedisClientType;     // subscribe-mode connection
    private publisher: RedisClientType;  // write-mode connection
```

Redis has a protocol-level constraint: once you call `SUBSCRIBE` on a connection, that connection enters **subscribe mode**. In subscribe mode, the only commands you can send are `SUBSCRIBE`, `UNSUBSCRIBE`, `PSUBSCRIBE`, `PUNSUBSCRIBE`, and `PING`. Any other command — including `XADD` — returns a protocol error.

The API needs to do both:
1. **Subscribe** to a per-request UUID channel (to wait for the Engine's response)
2. **Write** the order to the `engine_messages` stream

Two separate connections. Two separate states. `this.client` subscribes. `this.publisher` writes. Same Redis server, independent connections.

**Q: Why not subscribe after writing, then unsubscribe before the next write?**

You'd miss the Engine's response. The Engine processes messages in microseconds. By the time your unsubscribe + resubscribe + XADD cycle completes, the Engine has already published the response to a channel nobody is listening to. Subscribe first, then write — this is the only safe order.

---

### `sendAndAwait()` — The Request-Response Bridge

```typescript
public sendAndAwait(message: MessageToEngine) {
    return new Promise<MessageFromOrderbook>((resolve, reject) => {
        const id = this.getRandomClientId();
        //       ↑ crypto.randomUUID() — unique per request
        //         this UUID becomes a one-time Pub/Sub channel name
        
        const timeout = setTimeout(() => {
            this.client.unsubscribe(id);
            reject(new Error('Engine response timeout - is the engine running?'));
        }, 10000);
        //  ↑ 10 seconds: if the engine doesn't respond, give up
        //    the user's HTTP request gets a 503 error
        
        this.client.subscribe(id, (message) => {
            //                 ↑ subscribe to a channel named after this UUID
            //                   "when anyone publishes to this channel, that's my response"
            clearTimeout(timeout);
            this.client.unsubscribe(id);
            //  ↑ one-time channel: subscribe, receive ONE message, unsubscribe, done
            resolve(JSON.parse(message));
        });
        
        this.publisher.xAdd(
            "engine_messages",     // stream key
            "*",                   // auto-generate ID: "timestamp-sequence" format
            { clientId: id, data: JSON.stringify(message) },
            //  ↑ clientId = the "return address" UUID
            //    data = the actual order/query payload
            { TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: 10000 } }
            //                                               ↑ approximate trim for performance
            //                                                         ↑ keep ~10,000 entries max
        );
    });
}
```

**This pattern is called request-reply over Pub/Sub.** There's no direct connection between API and Engine. They communicate through Redis. The UUID channel is a one-time mailbox: created, used once, destroyed.

**Q: What if two simultaneous requests get the same UUID?**

`crypto.randomUUID()` generates a V4 UUID with 122 bits of randomness. Collision probability in a trillion requests: astronomically small (≈1/(2^61)). Safe to ignore.

**Q: What happens when the Engine publishes to this channel?**

The Engine calls `this.client.publish(clientId, JSON.stringify(response))`. The API's `subscribe` callback fires instantly. `clearTimeout` prevents the timeout rejection. `unsubscribe` cleans up. `resolve(JSON.parse(message))` returns the result to the HTTP handler. The full roundtrip: API → Redis Stream → Engine processes → Redis Pub/Sub → API → HTTP response.

---

### XADD with MAXLEN — Bounding RAM Usage

```typescript
this.publisher.xAdd(
    "engine_messages",     // the stream key
    "*",                   // auto-generate message ID
    //  ↑ format: "millisecondTimestamp-sequenceNumber"
    //    e.g. "1751380000100-0", "1751380000100-1" (two at same ms)
    //    IDs are always monotonically increasing → natural arrival order
    { clientId: id, data: JSON.stringify(message) },
    { TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: 10000 } }
    //                                               ↑
    //  The tilde (~) means "approximate trim"
    //  Without ~: Redis finds the exact 10,001st entry in its internal radix tree → O(log n)
    //  With ~: Redis trims at natural tree node boundaries → O(1)
    //  Result: stream might hold 10,200 entries instead of exactly 10,000
    //  For a crash recovery buffer, this is perfectly fine
);
```

**Q: Why 10,000 specifically?**

At 1,000 orders per minute (busy but realistic for a small exchange), 10,000 messages = 10 minutes of buffer. The engine snapshots every 30 seconds. Even a 30-second crash leaves only ~500 messages to replay. 10,000 gives 20× headroom.

If the engine is down for more than 10 minutes, old messages may have been trimmed. Recovery falls back to the snapshot alone, and some recent events may be lost. For most deployments, 10 minutes is more than enough restart time.

**Q: Why trim at write time, not in a background job?**

Redis is single-threaded. A background job would need its own scheduled invocation. Instead, trimming on every `XADD` keeps the stream bounded at steady state with zero extra infrastructure. The approximate trim is so fast (O(1)) it doesn't affect write latency.

---

## File: `engine/src/RedisManager.ts` — The Engine's Writer

```
path: engine/src/RedisManager.ts
```

### `pushMessage()` — Engine → DB Processor

```typescript
async pushMessage(message: DbMessage) {
    await this.client.xAdd(
        "db_processor",         // stream key for DB events
        "*",                    // auto-generate ID
        { data: JSON.stringify(message) },
        { TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: 10000 } }
        //  ↑ same MAXLEN pattern as the API side — bounds RAM
    );
}
```

This is the Engine pushing trade events (`TRADE_ADDED`) and order updates (`ORDER_UPDATE`) to the DB Processor. The DB Processor has its own consumer group (`db_group`, consumer `db-processor-1`) on this stream.

**Q: What if Redis is down when `pushMessage` is called?**

The Redis client's internal TCP buffer absorbs the writes. When Redis comes back, the buffer flushes. If the TCP connection is fully dropped, the client reconnects automatically. If the engine crashes before the writes flush — those DB events are lost. But the engine's main `engine_messages` entry was also not ACK'd, so on restart, the entire order processing replays, which re-generates the DB events. The Stream guarantee on the input side protects the output side transitively.

---

### `sendToApi()` — Engine → API Response

```typescript
async sendToApi(clientId: string, message: MessageToApi) {
    this.client.publish(clientId, JSON.stringify(message));
    //          ↑ PUBLISH to the UUID channel the API is subscribed to
    //            this is Pub/Sub, not a Stream — fire-and-forget
    //            if nobody is listening (API already timed out), the message is dropped silently
}
```

**Q: Why Pub/Sub for responses instead of another Stream?**

Streams are for durable, replayable messages. API responses are ephemeral — if the API already timed out, there's nobody to deliver the response to. Pub/Sub is lightweight: publish, if someone is listening they get it, if not it's silently dropped. No persistence needed.

---

## File: `db/src/index.ts` — The DB Processor Consumer

```
path: db/src/index.ts
```

### Why DB Writes Must Re-Throw Errors (BUG 4)

```typescript
async function handleTradeAdded(data: any) {
    const query = `
        INSERT INTO sol_prices (time, price, volume, currency_code)
        VALUES ($1, $2, $3, $4)
    `;
    try {
        await pgClient.query(query, values);
        console.log(`Trade inserted successfully: ${data.id}`);
    } catch (error) {
        console.error("Error inserting trade:", error);
        throw error;   // ← THE CRITICAL LINE
        //  ↑ without this throw, the function returns normally
        //    and the main loop thinks it succeeded → XACK → message gone → trade LOST
    }
}
```

**The old (pre-fix) code didn't have `throw error`.** Here's the catastrophic sequence:

```
1. handleTradeAdded() called. Postgres is momentarily down (network blip).
2. pgClient.query(...) throws a connection error.
3. The inner catch block logs "Error inserting trade" and returns normally (no throw).
4. Back in the main loop, handleTradeAdded() returned without error.
5. await redisClient.xAck(DB_STREAM, DB_GROUP, id) runs — message removed from PEL.
6. Trade event is GONE from Redis. Postgres has NOTHING.
   The trade is permanently lost. The user's engine balance shows SOL they bought,
   but the database has no record. Inconsistency: forever.
```

**With `throw error`:**

```
1. handleTradeAdded() throws.
2. The main loop's catch block catches it.
3. XACK is NOT called — message stays in PEL.
4. On next restart, the pending message is re-delivered.
5. Once Postgres recovers, the INSERT succeeds.
```

This is the difference between "at-least-once delivery with retry" (correct) and "at-most-once delivery with silent data loss" (catastrophic).

---

### The DLQ Pattern

```typescript
} catch (error) {
    console.error(`Error processing message ${id}:`, error);
    try {
        const rawMsg = JSON.stringify({ error: String(error), ts: Date.now() });
        await redisClient.lPush("db_processor_dlq", rawMsg);
        //                       ↑ Dead Letter Queue — a plain Redis List
        //                         messages land here if they CANNOT be processed
        //                         (corrupt data, schema mismatch, persistent failure)
    } catch (dlqErr) {
        console.error("Failed to push to DLQ:", dlqErr);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    //  ↑ 1-second backoff: prevents tight retry loops
    //    without this, if Postgres is down, the DB Processor hammers it
    //    with reconnect attempts thousands of times per second
}
```

**Q: Why not always XACK failed messages and push to DLQ?**

Because the failure might be **transient** — Postgres momentarily down, network blip, connection pool exhausted. If you XACK, you lose the retry opportunity forever. Better to leave the message in the PEL. On restart, it's re-delivered, and if Postgres is back up, the write succeeds.

The DLQ is for the case where the message **itself** is the problem (malformed JSON, unknown type, schema violation). Those will fail every single time. The DLQ prevents infinite retry loops.

---

## The AOF File — Redis's Durability Layer

```yaml
# docker-compose.yml
redis:
  image: redis:7-alpine
  command: ["redis-server", "--appendonly", "yes"]
  #                          ↑ this one flag is the difference between
  #                            "all data lost on container restart" and
  #                            "all data survives across restarts"
```

**Without AOF (the default):** Redis keeps everything in RAM. Container restarts wipe everything. Streams, PEL entries, consumer group positions — gone. Your crash recovery only works if Redis stays up. If Redis also restarts, you lose the pending messages and recovery is broken.

**With AOF (`--appendonly yes`):** Every write command Redis receives — every `XADD`, every `XACK`, every `PUBLISH` — is immediately appended to a file called `appendonly.aof`. On restart, Redis reads this file top-to-bottom and replays every command. Streams are rebuilt. PEL entries are rebuilt. Consumer group positions are rebuilt. Your messages survive.

**The trade-off:** Every write requires a disk append. The `appendfsync everysec` default means Redis flushes the OS buffer to disk once per second. Worst case: 1 second of data loss if the disk fails between flushes. For a trading engine with 30-second snapshots, losing 1 second of stream data is far less than the snapshot window.

**Combined with MAXLEN:** The AOF file could grow huge without trimming. MAXLEN keeps the stream bounded. Redis's `BGREWRITEAOF` (automatic periodic compaction) rewrites the AOF to only include the current state — commands for trimmed entries are excluded. The AOF file size stays proportional to the stream size, not total historical volume.

---

## The Complete Crash Recovery Walkthrough

Let's trace a real crash scenario end-to-end:

```
TIME 0:   Engine is running normally. lastProcessedStreamId = "1751380000050-0" (from last XACK).
          snapshot.json was last written 25 seconds ago with lastProcessedStreamId = "1751380000050-0".

TIME 1:   API pushes a CREATE_ORDER to engine_messages → ID "1751380000100-0"
          Redis delivers it to engine-1 → moves to PEL.

TIME 2:   engine.process() runs:
          - Alice's buy order matches Bob's sell order
          - Alice's USDC.locked -= $100, Alice's SOL.available += 1.0
          - Bob's SOL.locked -= 1.0, Bob's USDC.available += $100
          - pushMessage(TRADE_ADDED) → db_processor stream
          - publish depth/trade updates to WS

TIME 3:   ⚡ CRASH — before XACK.
          
          Redis state:
            engine_messages PEL for engine-1: ["1751380000100-0"] (unACK'd)
            db_processor: has the TRADE_ADDED entry (but unACK'd by db-processor-1)
          
          Disk state:
            snapshot.json: lastProcessedStreamId = "1751380000050-0"
            (Alice's balance is PRE-trade — the snapshot hadn't fired yet)

TIME 4:   Engine restarts.
          1. new Engine() → reads snapshot.json
             - Alice's balance = pre-trade state
             - lastProcessedStreamId = "1751380000050-0"
          
          2. xGroupCreate → BUSYGROUP → ignored (group already exists)
          
          3. Crash recovery loop:
             pendingId = "1751380000050-0"
             XREADGROUP engine_group engine-1 STREAMS engine_messages "1751380000050-0"
             → returns message "1751380000100-0" from PEL

TIME 5:   engine.process() runs AGAIN:
          - Alice's buy order matches Bob's sell order (same order replayed)
          - Same balance mutations happen again
          - Same DB events pushed again
          - Same WS updates published again

TIME 6:   XACK "1751380000100-0" → removed from PEL
          engine.setLastProcessedStreamId("1751380000100-0")

TIME 7:   PEL empty → crash recovery complete → switch to normal mode
          The trade was processed twice (TIME 2 and TIME 5), but TIME 2's effects
          were lost in the crash. TIME 5 produces the same final state.
          Alice and Bob have correct balances. ✓
```

---

## Health Checks — What to Monitor

```bash
# Total entries in each stream (should hover near 10,000 at peak, much less at low volume)
redis-cli XLEN engine_messages
redis-cli XLEN db_processor

# Pending (unACK'd) messages — should be 0 in steady state
redis-cli XPENDING engine_messages engine_group - + 10
redis-cli XPENDING db_processor db_group - + 10
#  ↑ if non-empty with old timestamps → consumer crashed and hasn't restarted

# Dead Letter Queues — should ALWAYS be 0
redis-cli LLEN engine_dlq
redis-cli LLEN db_processor_dlq
#  ↑ if > 0 → poison messages exist → needs manual investigation

# Recent stream entries (last 5 messages, reverse chronological)
redis-cli XREVRANGE engine_messages + - COUNT 5
redis-cli XREVRANGE db_processor + - COUNT 5
```

---

## Debugging Stream Issues

### "Engine is not processing orders"

```bash
redis-cli XLEN engine_messages
# If growing → messages are arriving but engine isn't consuming
# Check: is the engine process running? Is it stuck in crash recovery?

redis-cli XINFO GROUPS engine_messages
# Shows consumer group info: last-delivered-id, pending count, consumers
```

### "DB Processor is behind / trades not appearing in DB"

```bash
redis-cli XPENDING db_processor db_group - + 10
# Shows pending messages with idle time
# If idle time is very high → db-processor-1 is dead or stuck
```

### "Messages are being lost"

```bash
# Check AOF is enabled:
redis-cli CONFIG GET appendonly
# Should return "yes". If "no" → ALL stream data is lost on Redis restart!

# Check trim isn't too aggressive:
redis-cli XLEN engine_messages
# If very low (< 100) and engine is processing fast → MAXLEN might be too small
# Current: ~10,000 — should be fine for 10+ minutes of buffer
```

### "Crash recovery replayed too many messages"

The snapshot's `lastProcessedStreamId` was old (snapshot hadn't fired recently). The fix: reduce snapshot interval from 30s to 10s, or ensure the engine runs long enough for at least one snapshot before expected shutdowns. Graceful shutdown (`SIGTERM`) saves a snapshot — crashes don't.
