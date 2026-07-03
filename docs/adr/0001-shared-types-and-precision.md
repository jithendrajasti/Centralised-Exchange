# CEX Mastery — Module 1: Precision & The Shared Protocol

> Read this like a textbook. Every question you might have is answered here. Every design decision is explained.

---

## Why Money Needs Special Math

Before touching any exchange code, you must understand **why floating-point is forbidden in financial systems**.

Open a browser console right now and type:
```js
0.1 + 0.2   // → 0.30000000000000004
```

That's a rounding error from how CPUs represent decimal numbers in binary. For a calculator app, fine. For an exchange where `$100.50 × 3.7 SOL = $371.85` must be **exact**, this is catastrophic. A $0.0000000001 error per trade, 1 million trades per day = you're generating or losing real money from thin air.

**The solution: scaled integers.**

---

## File: `precision.ts` — The Math Foundation

```
path: engine/src/trade/precision.ts
```

### The Scale Factor

```typescript
export const SCALE = 1_000_000;  // One million
const SCALE_DIGITS = 6;
const SCALE_BIG = BigInt(SCALE); // For BigInt math
```

**SCALE = 1,000,000 means:**
- `$100.50` is stored as `100500000`  (multiply by 1M)
- `3.7 SOL` is stored as `3700000`   (multiply by 1M)
- The engine **never works with decimals**. Only whole integers.

Why 1,000,000 specifically? It gives you 6 decimal places of precision, which is standard for crypto exchanges (Bitcoin prices go to 0.000001 satoshi). If you needed more precision, you'd use a bigger SCALE — but then intermediate multiplication results grow larger and BigInt becomes more important everywhere.

---

### `toScaledFromDecimal(value: string): number`

**Purpose**: Convert a human-readable string like `"100.50"` → internal integer `100500000`

```typescript
export function toScaledFromDecimal(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return NaN;

  const negative = trimmed.startsWith("-");
  const normalized = negative ? trimmed.slice(1) : trimmed;
  
  const [wholeRaw, fracRaw = ""] = normalized.split(".");
  //   ↑ "100"           ↑ "50"    ← for "100.50"
  
  const whole = wholeRaw || "0";

  // Validate: only digits allowed in each part
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fracRaw)) return NaN;

  // Pad or truncate fractional part to exactly SCALE_DIGITS chars
  const frac = (fracRaw + "0".repeat(SCALE_DIGITS)).slice(0, SCALE_DIGITS);
  //      ↑ "50" → "500000" (padded to 6 digits)
  //      or "1234567" → "123456" (truncated to 6 digits)

  const scaled = Number(whole) * SCALE + Number(frac);
  // = 100 * 1000000 + 500000 = 100500000 ✓
  
  return negative ? -scaled : scaled;
}
```

**The clever padding trick:**
```
"50" + "000000" = "500000"  → .slice(0, 6) → "500000"   → 500000 / 1000000 = 0.50 ✓
"5"  + "000000" = "5000000" → .slice(0, 6) → "500000"   → 500000 / 1000000 = 0.50 ✓
"500000" + "000000" = "500000000000" → .slice(0, 6) → "500000" ✓
```

**What if you pass `"100.1234567"` (7 decimal places)?**
`"1234567".slice(0,6)` = `"123456"` — silently **truncates** to 6 decimals. This is intentional: the engine defines the precision of the exchange. Any price more precise than 6 decimals is truncated, not rounded. The wire format controls precision, not the client.

**What if you pass garbage like `"abc"` or `""`?**
The regex `!/^\d+$/.test(whole)` fails → returns `NaN`. Every call site checks `Number.isFinite(result)` before using it. Invalid input is caught at the boundary, not discovered deep in balance arithmetic.

---

### `fromScaledToDecimal(value: number): string`

**Purpose**: Convert internal integer `100500000` → human-readable `"100.5"`

```typescript
export function fromScaledToDecimal(value: number): string {
  const abs = Math.abs(value);
  const whole = Math.floor(abs / SCALE);     // 100500000 / 1000000 = 100
  const frac = abs % SCALE;                  // 100500000 % 1000000 = 500000

  if (frac === 0) return `${sign}${whole}`;  // No decimals needed → "100"

  const fracStr = frac
    .toString()                    // "500000"
    .padStart(SCALE_DIGITS, "0")   // already 6 chars, no padding needed
    .replace(/0+$/, "");           // trim trailing zeros: "500000" → "5"

  return `${sign}${whole}.${fracStr}`;  // "100.5"
}
```

**Why trim trailing zeros?** `"100.500000"` is ugly and wastes bytes over the network. `"100.5"` is correct and clean. The underlying scaled integer is the same — only the display changes.

**Why does `padStart(6, "0")` matter?** Consider `frac = 50` (representing 0.00005). `.toString()` gives `"50"`. Without `padStart`, you'd return `"100.50"` — which means `100.50`, not `100.00005`. With `padStart`: `"50"` → `"000050"` → trim trailing zeros → `"00005"` → `"100.00005"`. ✓

---

### `multiplyScaled(a: number, b: number): number`

**Purpose**: Multiply two scaled integers together correctly.

```typescript
export function multiplyScaled(a: number, b: number): number {
  return Number((BigInt(a) * BigInt(b)) / SCALE_BIG);
}
```

**Why this is hard:** If `qty = 3700000` (3.7 SOL) and `price = 100500000` ($100.50):
```
qty × price = 3700000 × 100500000 = 371,850,000,000,000
```

This is about `3.7 × 10^14`. `Number.MAX_SAFE_INTEGER` is `9 × 10^15`, so this specific case is safe. But a user with 1000 SOL (`1_000_000_000`) at $100 (`100_000_000`): `1_000_000_000 × 100_000_000 = 10^17` — overflows. BigInt has no overflow. It handles arbitrarily large integers.

After multiplying, the result is "scaled twice" — both `a` and `b` were already multiplied by SCALE, so `a * b` is `actualA × actualB × SCALE²`. Dividing by SCALE once gives `actualA × actualB × SCALE` — a correctly scaled result.

**Example:** `3.7 SOL × $100.50 = $371.85`
- `multiplyScaled(3700000, 100500000)`
- `BigInt(3700000) × BigInt(100500000) = BigInt(371_850_000_000_000)`
- `/ BigInt(1_000_000) = BigInt(371_850_000)`
- `Number(371_850_000)` → `371_850_000`
- `fromScaledToDecimal(371_850_000)` → `"371.85"` ✓

---

### `percentChangeScaled(current, first): string`

```typescript
export function percentChangeScaled(current: number, first: number): string {
  if (!Number.isFinite(current) || !Number.isFinite(first) || first === 0) {
    return "0";
  }

  const diff = current - first;
  const percentScaled = Number((BigInt(diff) * BigInt(10000)) / BigInt(first));
  return formatDecimalWithScale(percentScaled, 2);
}
```

**Why multiply by 10000?** We want percent with 2 decimal places as a scaled integer. `(diff/first) × 100` gives percentage. To keep 2 decimal places in integer form: multiply by `100 × 100 = 10000` before integer division.

Example: SOL went from $100 to $102.50:
- `diff = 2500000, first = 100000000`
- `percentScaled = (2500000 × 10000) / 100000000 = 250`
- `formatDecimalWithScale(250, 2)` → `"2.50"` → "2.50% gain" ✓

**The `first === 0` guard:** Without it, `BigInt(diff) / BigInt(0)` throws `RangeError: Division by zero`. This guard returns `"0"` for the edge case of no price history.

---

## File: `shared/src/index.ts` — The Protocol Contract

```
path: shared/src/index.ts
```

### Why A Shared Package Exists

Three services — API, Engine, and WS — all communicate by passing JSON payloads through Redis. JSON has no type system. If the API sends `{ type: "CREATE_ORDER" }` and the Engine expects `{ type: "createOrder" }`, the switch statement falls through silently. No error. The order is ignored. The user gets a timeout.

The shared package solves this by making the message types into TypeScript constants that all services import from a single source:

```typescript
export const CREATE_ORDER    = "CREATE_ORDER";
export const CANCEL_ORDER    = "CANCEL_ORDER";
export const ON_RAMP         = "ON_RAMP";
export const GET_OPEN_ORDERS = "GET_OPEN_ORDERS";
export const GET_TICKERS     = "GET_TICKERS";
export const GET_DEPTH       = "GET_DEPTH";
export const GET_BALANCES    = "GET_BALANCES";
```

When the API does `{ type: CREATE_ORDER, data: {...} }` and the Engine does `case CREATE_ORDER:`, they are both importing the same string `"CREATE_ORDER"` from `@cex/shared`. A typo is now a compile-time error: TypeScript tells you `"CREAT_ORDER"` is not assignable to `typeof CREATE_ORDER`.

---

### `MessageToEngine` — What the API Sends

This is a **discriminated union** — a TypeScript pattern where a shared field (`type`) uniquely identifies which variant you have:

```typescript
export type MessageToEngine =
  | { type: typeof CREATE_ORDER;    data: { market: string; price: string; quantity: string; side: "buy"|"sell"; userId: string } }
  | { type: typeof CANCEL_ORDER;   data: { orderId: string; market: string; userId: string } }
  | { type: typeof ON_RAMP;        data: { userId: string; amount: string | number } }
  | { type: typeof GET_OPEN_ORDERS; data: { userId: string; market: string } }
  | { type: typeof GET_DEPTH;       data: { market: string } }
  | { type: typeof GET_TICKERS;     data: { market?: string } }
  | { type: typeof GET_BALANCES;    data: { userId: string } }
```

**Q: Why are `price` and `quantity` strings instead of numbers?**
Because JSON numbers lose precision. `JSON.stringify(100.5)` → `"100.5"` ✓. But `JSON.stringify(0.0000001)` → `"1e-7"` — and `parseFloat("1e-7")` works, but it's going through a float which may lose precision. Keeping them as strings means the decimal string `"100.500001"` arrives at the engine exactly as typed, and `toScaledFromDecimal` handles the conversion without any intermediate float representation.

**Q: Why is `market?` optional in `GET_TICKERS`?**
If `market` is provided, return tickers for just that market. If omitted, return all tickers. This is a common API pattern for "get one or get all" that avoids two separate endpoints.

---

### `MessageToApi` — What the Engine Replies

The Engine publishes these via `PUBLISH <clientId> JSON.stringify(response)`:

```typescript
export type MessageToApi =
  | { type: "ORDER_PLACED";    payload: { orderId: string; executedQty: number; fills: Fill[] } }
  | { type: "ORDER_CANCELLED"; payload: { orderId: string; executedQty: number; remainingQty: number } }
  | { type: "DEPTH";           payload: { bids: [string, string][]; asks: [string, string][] } }
  | { type: "OPEN_ORDERS";     payload: OpenOrder[] }
  | { type: "TICKERS";         payload: Ticker[] }
  | { type: "ON_RAMP_SUCCESS"; payload: { userId: string; amount: number } }
  | { type: "ON_RAMP_FAILURE"; payload: { userId: string; error: string } }
  | { type: "BALANCES";        payload: { userId: string; balances: UserBalance } }
```

**`ON_RAMP_FAILURE` was added on 2026-07-01.** The Engine was already sending this type when `onRamp()` threw — but it wasn't in this union type. TypeScript compiled cleanly because the Engine's code used `sendToApi(clientId, { type: "ON_RAMP_FAILURE", ... })` with an inline object, not the shared type. The API's response handler saw an unknown type and returned nothing. The user got a timeout instead of an error message. Adding it to the union didn't fix the code — it revealed that the API response handler needed a case for it.

**Q: Why are depth bids/asks `[string, string][]` instead of `[number, number][]`?**
Same precision concern as above. These are price-quantity pairs. They go from Engine → API → browser. If they were numbers, JavaScript's JSON serialization could corrupt them. Strings are lossless.

---

### Build Order — The One Rule You Must Never Forget

`shared/` is not published to npm. It's a local file dependency:

```json
// package.json in api/, engine/, ws/
"@cex/shared": "file:../shared"
```

`npm install` creates a copy (or symlink) of the built output in `node_modules/@cex/shared`. The key word is **built output** — `npm install` copies `shared/dist/`, not `shared/src/`. If you change a type in `shared/src/index.ts` and run `npm run dev` in `engine/`, TypeScript will compile against the **old** `shared/dist/` because you haven't rebuilt it.

```bash
# Correct order — always:
cd shared && npm run build   # ← compile TypeScript → dist/
cd engine && npm run dev     # ← now sees updated types
```

The Docker build handles this correctly: the engine's Dockerfile copies and builds `shared/` before building the engine. For local development, this is the most common source of confusing type errors that "should work."

---

## Debugging Type Errors

### "Property does not exist on type MessageToApi"

You added a new Engine response type but forgot to add it to `MessageToApi` in `shared/src/index.ts`. Add the variant, rebuild shared, run `tsc --noEmit` in the engine to confirm.

### "Argument of type X is not assignable to MessageToEngine"

The API is constructing a message with a field name or type that doesn't match the union variant. Check the exact field names — `userId` vs `user_id`, `market` vs `symbol`.

### "Type works in engine but API gets undefined"

You added a field to a message type in shared but the API is sending an older version of the shared package. Run `cd shared && npm run build` then `npm install` in the API directory to refresh.
