"use client";

import { useEffect, useState } from "react";
import { getTicker } from "../utils/httpClient";
import { Ticker } from "../utils/types";
import { formatPrice, formatPercentage, formatVolume, cn } from "../lib/utils";
import { SignalingManager } from "../utils/SignalingManager";
import { ChevronDown } from "lucide-react";
import Link from "next/link";

/* ═══════════════════════════════════════════════════════════════
   MarketBar — Price & 24h Stats (Backpack Exchange Style)
   ═══════════════════════════════════════════════════════════════ */

export function MarketBar({ market }: { market: string }) {
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const tickerData = await getTicker(market);
        setTicker(tickerData);
      } catch (err) {
        console.error("Failed to fetch market data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    /* ─── Real-time Ticker Updates ─── */
    const callbackId = `TICKER-MARKET-${market}`;
    const tickerStream = `ticker.${market}`;
    SignalingManager.getInstance().registerCallback(
      tickerStream,
      (data: any) => {
        if (data.symbol === market) {
          setTicker((prev) => (prev ? { ...prev, ...data } : null));
        }
      },
      callbackId
    );

    SignalingManager.getInstance().sendMessage({
      method: "SUBSCRIBE",
      params: [`ticker.${market}`],
    });

    return () => {
      SignalingManager.getInstance().deRegisterCallback(tickerStream, callbackId);
      SignalingManager.getInstance().sendMessage({
        method: "UNSUBSCRIBE",
        params: [`ticker.${market}`],
      });
    };
  }, [market]);

  if (loading || !ticker) return <MarketBarSkeleton />;

  const isPositive = parseFloat(ticker.priceChangePercent || "0") >= 0;
  const [base = "", quote = ""] = market.split("_");

  return (
    <div className="flex items-center h-[52px] px-4 bg-bp-bg-secondary border-b border-bp-border gap-6">
      {/* ─── Market Selector ─── */}
      <Link
        href="/markets"
        className="flex items-center gap-2 pr-5 border-r border-bp-border hover:opacity-80 transition-opacity flex-shrink-0"
      >
        <CoinIcon letter={base.charAt(0)} />
        <span className="text-md font-semibold text-bp-text-primary">
          {base}/{quote}
        </span>
        <span className="text-2xs px-1 py-0.5 bg-bp-blue-bg text-bp-blue rounded font-medium">
          Spot
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-bp-text-tertiary" />
      </Link>

      {/* ─── Last Price ─── */}
      <div className="flex-shrink-0">
        <div
          className={cn(
            "text-xl font-semibold tabular-nums",
            isPositive ? "text-bp-green" : "text-bp-red"
          )}
        >
          {formatPrice(ticker.lastPrice, 2)}
        </div>
        <div className="text-2xs text-bp-text-tertiary tabular-nums">
          ${formatPrice(ticker.lastPrice, 2)}
        </div>
      </div>

      {/* ─── Stats Row ─── */}
      <div className="flex items-center gap-6 text-xs">
        <Stat label="24h Change">
          <span
            className={cn(
              "tabular-nums",
              isPositive ? "text-bp-green" : "text-bp-red"
            )}
          >
            {isPositive ? "+" : ""}
            {formatPrice(ticker.priceChange, 2)}{" "}
            <span className="opacity-70">
              {isPositive ? "+" : ""}
              {formatPercentage(ticker.priceChangePercent, false)}
            </span>
          </span>
        </Stat>

        <Stat label="24h High">
          <span className="text-bp-text-secondary tabular-nums">
            {formatPrice(ticker.high, 2)}
          </span>
        </Stat>

        <Stat label="24h Low">
          <span className="text-bp-text-secondary tabular-nums">
            {formatPrice(ticker.low, 2)}
          </span>
        </Stat>

        <Stat label={`24h Vol (${base})`}>
          <span className="text-bp-text-secondary tabular-nums">
            {formatVolume(ticker.volume)}
          </span>
        </Stat>

        <Stat label={`24h Vol (${quote})`}>
          <span className="text-bp-text-secondary tabular-nums">
            {formatVolume(ticker.quoteVolume)}
          </span>
        </Stat>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════
   Sub-Components
   ═══════════════════════════════════════════════════════════════ */

/** Single stat column */
function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-shrink-0">
      <div className="text-2xs text-bp-text-tertiary mb-0.5">{label}</div>
      <div className="text-xs">{children}</div>
    </div>
  );
}

/** Coin icon with gradient */
function CoinIcon({ letter }: { letter: string }) {
  return (
    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#00FFA3] to-[#DC1FFF] flex items-center justify-center flex-shrink-0">
      <span className="text-white font-bold text-2xs">{letter}</span>
    </div>
  );
}

/** Loading skeleton */
function MarketBarSkeleton() {
  return (
    <div className="flex items-center h-[52px] px-4 bg-bp-bg-secondary border-b border-bp-border gap-6">
      <div className="flex items-center gap-2 pr-5 border-r border-bp-border">
        <div className="w-6 h-6 bg-bp-bg-tertiary rounded-full animate-pulse" />
        <div className="w-20 h-4 bg-bp-bg-tertiary rounded animate-pulse" />
      </div>
      <div className="space-y-1">
        <div className="w-24 h-5 bg-bp-bg-tertiary rounded animate-pulse" />
        <div className="w-16 h-3 bg-bp-bg-tertiary rounded animate-pulse" />
      </div>
      <div className="flex gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1">
            <div className="w-10 h-3 bg-bp-bg-tertiary rounded animate-pulse" />
            <div className="w-14 h-3 bg-bp-bg-tertiary rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}