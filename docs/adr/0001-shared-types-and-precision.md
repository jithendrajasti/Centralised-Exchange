# ADR 0001: Shared Types Package and Numeric Precision

Date: 2026-05-09
Status: Accepted

## Context

- The API, engine, and WS services duplicate protocol constants and payload types.
- The engine and WS runtime exchange JSON payloads that must stay in sync.
- Numeric values are represented as strings at the protocol boundary but the engine used JS numbers internally.

## Decision

- Introduce a small shared package (`shared/`) that exports protocol constants and message types.
- Keep numeric values on the wire as strings (or numbers where required) for compatibility.
- Use scaled integer math (fixed-point, scale 1e6) inside the engine for matching and balance updates.
- Version snapshots to support conversion from legacy float-based snapshots.

## Consequences

- The services now depend on `@cex/shared` and should build it before running service builds.
- Protocol type drift is reduced because API/engine/WS import the same source of truth.
- Precision risk is reduced; internal math uses integer operations.

## Notes

- The shared package is referenced as a file dependency: "@cex/shared": "file:../shared".
- If precision issues show up in production-like scenarios, consider moving to a wider scale or BigInt-backed amounts.
