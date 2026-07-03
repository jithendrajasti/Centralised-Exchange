"use client";

import { MarketBar } from "@/app/components/MarketBar";
import { SwapUI } from "@/app/components/SwapUI";
import { TradeView } from "@/app/components/TradeView";
import { BookTradesTabs } from "@/app/components/BookTradesTabs";
import { BottomPanel } from "@/app/components/BottomPanel";
import { ErrorBoundary } from "@/app/components/ErrorBoundary";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useMarketStore } from "@/app/store/useMarketStore";

export default function TradePage() {
  const { market } = useParams();
  const { setSelectedMarket } = useMarketStore();
  const marketString = market as string;

  useEffect(() => {
    setSelectedMarket(marketString);
  }, [marketString, setSelectedMarket]);

  return (
    <div className="flex flex-col h-full bg-bp-bg-primary overflow-hidden">
      <ErrorBoundary componentName="MarketBar">
        <MarketBar market={marketString} />
      </ErrorBoundary>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 border-r border-bp-border">
          <ErrorBoundary componentName="Chart">
            <TradeView market={marketString} />
          </ErrorBoundary>
        </div>

        <div className="w-[280px] flex-shrink-0 border-r border-bp-border">
          <ErrorBoundary componentName="OrderBook">
            <BookTradesTabs market={marketString} />
          </ErrorBoundary>
        </div>

        <div className="w-[280px] flex-shrink-0">
          <ErrorBoundary componentName="TradeEntry">
            <SwapUI market={marketString} />
          </ErrorBoundary>
        </div>
      </div>

      <div className="h-[200px] flex-shrink-0 border-t border-bp-border">
        <ErrorBoundary componentName="BottomPanel">
          <BottomPanel market={marketString} />
        </ErrorBoundary>
      </div>
    </div>
  );
}