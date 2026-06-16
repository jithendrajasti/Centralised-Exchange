"use client";

import { MarketBar } from "@/app/components/MarketBar";
import { SwapUI } from "@/app/components/SwapUI";
import { TradeView } from "@/app/components/TradeView";
import { BookTradesTabs } from "@/app/components/BookTradesTabs";
import { BottomPanel } from "@/app/components/BottomPanel";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useMarketStore } from "@/app/store/useMarketStore";

/* ═══════════════════════════════════════════════════════════════
   TradePage — Full Trading Interface Layout (Backpack Style)

   Grid Layout:
   ┌─────────────────────────────────────────────────┐
   │                 Market Info Bar                  │
   ├───────────────┬───────────┬─────────────────────┤
   │               │           │                     │
   │  Chart Area   │  Order    │  Trade Entry Panel   │
   │  (flex-1)     │  Book     │  (w-[280px])        │
   │               │  (w-[280px]) │                  │
   │               │           │                     │
   ├───────────────┴───────────┴─────────────────────┤
   │          Bottom Panel (h-[200px])                │
   └─────────────────────────────────────────────────┘
   ═══════════════════════════════════════════════════════════════ */

export default function TradePage() {
  const { market } = useParams();
  const { setSelectedMarket } = useMarketStore();
  const marketString = market as string;

  useEffect(() => {
    setSelectedMarket(marketString);
  }, [marketString, setSelectedMarket]);

  return (
    <div className="flex flex-col h-full bg-bp-bg-primary overflow-hidden">
      {/* ═══ Market Info Bar ═══ */}
      <MarketBar market={marketString} />

      {/* ═══ Main Trading Grid ═══ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ─── Left: Chart ─── */}
        <div className="flex-1 min-w-0 border-r border-bp-border">
          <TradeView market={marketString} />
        </div>

        {/* ─── Middle: Order Book & Trades ─── */}
        <div className="w-[280px] flex-shrink-0 border-r border-bp-border">
          <BookTradesTabs market={marketString} />
        </div>

        {/* ─── Right: Trade Entry ─── */}
        <div className="w-[280px] flex-shrink-0">
          <SwapUI market={marketString} />
        </div>
      </div>

      {/* ═══ Bottom Panel ═══ */}
      <div className="h-[200px] flex-shrink-0 border-t border-bp-border">
        <BottomPanel market={marketString} />
      </div>
    </div>
  );
}