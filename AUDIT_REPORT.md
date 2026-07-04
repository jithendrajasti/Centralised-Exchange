# Full-Project Audit & Hardening Report

**Date:** 2026-07-04  
**Scope:** `CENTRALISED-EXCHANGE` — all services (engine, api, db, ws, frontend, mm, shared)  
**Methodology:** Six-phase sequential audit — map → contracts → correctness → security → performance → build → polish

---

## Architecture Overview

```
Browser
  │  REST (port 3000)
  ▼
API Server (Express)
  │  XADD → engine_messages stream
  ▼
Engine (in-memory matching, Node.js single-thread)
  │  XADD → db_processor stream
  │  PUBLISH → clientId channel (per-request reply)
  │  PUBLISH → depth/ticker/trade channels
  ▼                          ▼
DB Processor             WebSocket Server (port 3001)
  │                          │  SUB → depth/ticker/trade
  ▼                          ▼
TimescaleDB              Browser (real-time updates)
```

**Key invariants:**
- Engine uses `SCALE = 1_000_000` integer math throughout; BigInt for multiplication
- Redis Streams with consumer groups give at-least-once delivery + crash recovery
- Snapshot recovery: engine saves `snapshot.json` every 30s (dirty flag); atomic write via `.tmp` rename
- JWT: 15m access tokens + 7d refresh tokens with rotation; HttpOnly cookies for refresh
- WS auth: one-time UUID ticket (60s TTL), consumed atomically via Redis `getDel`

---

## Phase 1 — Contract Consistency

No cross-service type mismatches found. The `@cex/shared` package (`MessageToEngine`, `MessageToApi`, `WsMessage`) is authoritative and consistently used across engine, API, WS, and frontend.

---

## Phase 2 — Correctness

### Critical Financial Bug — Partial Fill Overfill

**File:** `engine/src/trade/Orderbook.ts`

**Bug:** Both `matchBid` and `matchAsk` used the resting order's total `quantity` instead of its remaining `quantity - filled` when computing how much to fill. A second buy against a partially-filled ask would consume more than the remaining quantity.

```typescript
// BEFORE (bug) — uses total quantity, ignores already-filled amount
const filledQty = Math.min((order.quantity - executedQty), this.asks[i].quantity);

// AFTER (fix) — uses remaining quantity
const remaining = this.asks[i].quantity - this.asks[i].filled;
const filledQty = Math.min((order.quantity - executedQty), remaining);
```

**Observable behavior change:** Orders that previously over-filled a partially-matched resting order will now correctly fill only the remaining quantity. Two regression tests added to `engine/src/tests/orderbook.test.ts`.

---

### Early-Break Optimization in Matching Loops

**File:** `engine/src/trade/Orderbook.ts`

Missing early exit when no further crossing prices exist — the engine scanned the entire remaining book on every order.

```typescript
// Added to matchBid:
if (this.asks[i].price > order.price) break;

// Added to matchAsk:
if (this.bids[i].price < order.price) break;
```

**Observable behavior change:** None — same results, O(1) exit instead of O(n) scan for non-crossing orders.

---

### Non-Deterministic Depth Sort

**File:** `engine/src/trade/Orderbook.ts` — `getDepth()`

The depth aggregation loop relied on V8's integer key iteration order, which is implementation-defined. Added explicit sorts:

```typescript
bids.sort((a, b) => parseFloat(b[0]) - parseFloat(a[0])); // descending
asks.sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])); // ascending
```

---

### Race Condition in `sendAndAwait`

**File:** `api/src/RedisManager.ts`

`xAdd` was called before `subscribe` resolved. A fast engine response could arrive before the subscription channel was established, causing a guaranteed 10-second timeout.

```typescript
// AFTER (fix) — xAdd only fires after subscribe resolves
this.client
    .subscribe(id, (msg) => { ... })
    .then(() => this.publisher.xAdd("engine_messages", "*", ...))
    .catch((err) => { ... });
```

**Observable behavior change:** Eliminates intermittent 10-second order placement timeouts under load.

---

### Market Order with No Liquidity

**File:** `frontend/app/components/SwapUI.tsx`

When the orderbook was empty, market orders fell through to `price = ""` (sent as `$0`) or used a stale price. Now checks depth before submitting:

```typescript
if (side === "buy") {
    if (!topAsk) { toast.error("No sell orders available"); setIsSubmitting(false); return; }
    submitPrice = (parseFloat(topAsk) * 1.05).toFixed(2);
} else {
    if (!topBid) { toast.error("No buy orders available"); setIsSubmitting(false); return; }
    submitPrice = (parseFloat(topBid) * 0.95).toFixed(2);
}
```

**Observable behavior change:** Users now see an error toast instead of a silent failed/invalid order.

---

### Depth Panel Reversed

**File:** `frontend/app/components/depth/Depth.tsx`

Initial depth fetch called `.reverse()` on bids after the engine already returned them sorted descending. This flipped bids to ascending order (lowest bid at top).

```typescript
// BEFORE (wrong)
setBids(depthData.bids.reverse());

// AFTER (correct)
setBids(depthData.bids);
```

**Observable behavior change:** Bids in the depth panel now correctly show highest price at top.

---

### Default Database Port Mismatch

Three files defaulted to port `5433` instead of the standard PostgreSQL port `5432`:

| File | Fix |
|------|-----|
| `api/src/db/pool.ts` | `5433` → `5432` |
| `db/src/index.ts` | `5433` → `5432` |
| `db/src/seed-db.ts` | `5433` → `5432` |

---

## Phase 3 — Security

### Timing Attack in Razorpay Signature Verification

**File:** `api/src/routes/razorpay.ts`

String equality (`===`) on HMAC signatures is vulnerable to timing attacks. Fixed with constant-time comparison:

```typescript
const expectedBuf = Buffer.from(expectedSignature, "hex");
const receivedBuf = Buffer.from(razorpay_signature, "hex");
const signaturesMatch =
    expectedBuf.length === receivedBuf.length &&
    crypto.timingSafeEqual(Uint8Array.from(expectedBuf), Uint8Array.from(receivedBuf));
```

---

### Missing Rate Limiter on Payment Verify Endpoint

**File:** `api/src/routes/razorpay.ts`

The `/verify` endpoint had no rate limiter, allowing unlimited replay attempts of payment signatures. Added `verifyLimiter` (max 20 requests/min per user).

---

### CORS Fallback Too Permissive

**File:** `api/src/index.ts`

The CORS `origin` fallback was `true` (allow all origins). Changed to an explicit allowlist:

```typescript
: ["http://localhost:3005", "http://localhost:3000"]
```

---

### `snapshot.json` Committed to Git

**File:** `engine/.gitignore`

The engine's in-memory snapshot was not gitignored — it was committed on every save, leaking full orderbook state to source control.

```gitignore
# Added:
snapshot.json
snapshot.tmp.json
```

---

## Phase 5 — Build & Tooling

### Engine Tests Used Wrong User IDs

**File:** `engine/src/tests/engine.test.ts`

Tests used `userId: "1"` and `"2"`, which have no pre-seeded balances. Fixed to use pre-seeded UUIDs:

```typescript
const TRADER_ID = "00000000-0000-0000-0000-000000000009"; // 1M USDC, 10K SOL
const MM_ID     = "00000000-0000-0000-0000-000000000005"; // 50M USDC, 50M SOL
```

### TypeScript Compilation Errors Resolved

| File | Error | Fix |
|------|-------|-----|
| `frontend/app/utils/ChartManager.ts:24` | `TS6133: '_chartType' declared but never read` | Removed dead field and constructor assignment |
| `frontend/app/components/BottomPanel.tsx:146` | `string \| undefined` used as index type | Added `if (base)` guard |
| `frontend/app/components/SwapUI.tsx:424` | `Checkbox` imported but never used | Deleted unused component |

**Final state:** All services compile with zero TypeScript errors. 9/9 engine tests pass.

---

## Phase 6 — Polish

### Frontend: Silent Error Swallowing

| Component | Before | After |
|-----------|--------|-------|
| `BottomPanel` `OrderHistoryTab` | `catch` reset orders silently | `catch` sets `emptyMessage` to error text |
| `BottomPanel` `TradeHistoryTab` | No error state — empty list on failure | Added `emptyMessage` state, shown on failure |
| `Trades.tsx` | No `.catch()` — loading spinner stuck forever on fetch failure | Added `.catch(() => {}).finally(() => setLoading(false))` |
| `MarketBar.tsx` | Failed ticker fetch left skeleton rendering forever | Added `fetchError` state; renders "Failed to load market data" inline |
| `SwapUI.tsx` `refreshBalances` | Silent `console.error` only | Added `toast.error("Could not refresh balances")` |

---

### Backend: Structured Logging

**File:** `api/src/index.ts` — request logger changed from plain text to structured JSON:

```typescript
// BEFORE
console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms id=${requestId}`);

// AFTER
console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    method: req.method,
    path: req.originalUrl,
    status: res.statusCode,
    durationMs,
    requestId,
    ip: req.ip,
}));
```

Additional structured error logs added to:
- `api/src/routes/trades.ts` — catch block now logs `{ event, message, stack }`
- `api/src/routes/auth.ts` — two previously silent catch blocks (`/resend-otp`, `/sessions GET`) now log structured errors

---

### WebSocket: Connection Logging

**File:** `ws/src/index.ts`

- Per-connection `console.log` gated behind `DEBUG` flag (suppressed in production)
- Message parse errors now logged server-side before sending client error response
- Close handler logs disconnection in debug mode

---

## What Was Deliberately Not Changed

| Area | Reason |
|------|--------|
| Redis Streams consumer group pattern | Correct — at-least-once delivery with crash recovery is the right design |
| Snapshot recovery + DLQ | Correct — handles poison messages without stalling the engine |
| JWT auth flow (bcrypt 12 rounds, refresh rotation, account lockout) | Correct and secure as-is |
| Market maker (`mm/`) | Correct — 4 virtual traders, 500ms cycles, internal service token |
| TimescaleDB hypertable schema + materialized views | Correct — 7 kline intervals, 60s refresh |
| `@cex/shared` type contracts | Verified consistent across all consumers, no changes needed |
| WebSocket subscription manager (max 50 subs, duplicate prevention) | Correct as-is |

---

## Known Remaining Issues

| Severity | File | Issue |
|----------|------|-------|
| **Medium** | `frontend/app/wallet/page.tsx` | Razorpay key falls back to `"rzp_test_placeholder"` with no runtime guard — a misconfigured production deploy silently opens the payment modal with an invalid key. Add a check before calling `rzp.open()`. |
| **Low** | `api/src/routes/auth.ts` `/forgot-password` | Catch block intentionally swallows all errors to avoid email enumeration, but this also hides infrastructure failures (e.g., email service down). Acceptable trade-off for this design. |
| **Low** | `engine/src/trade/Engine.ts` | Snapshot is written as in-process file I/O. A disk-full condition during the atomic `.tmp` rename will leave a stale `.tmp` file but not corrupt the running state. Acceptable at this scale. |
| **Info** | All services | No end-to-end integration tests across service boundaries (engine ↔ API ↔ WS). Unit tests cover engine matching logic only. |
