"use client";

import { useEffect, useState } from "react";
import { Star, Search } from "lucide-react";
import { getTickers } from "../utils/httpClient";
import { Ticker } from "../utils/types";
import { useRouter } from "next/navigation";
import { SignalingManager } from "../utils/SignalingManager";
import { formatPrice, formatVolume, formatPercentage, cn } from "../lib/utils";
import { useMarketStore } from "../store/useMarketStore";
import { parseMarketSymbol } from "../utils/market-utils";

type TabType = "all" | "favorites" | "spot" | "perp";

export default function MarketsPage() {
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [filteredTickers, setFilteredTickers] = useState<Ticker[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("spot");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { favorites, toggleFavorite, isFavorite } = useMarketStore();

  useEffect(() => {
    setLoading(true);
    getTickers().then((data) => { setTickers(data); setLoading(false); });

    SignalingManager.getInstance().registerCallback("ticker.all", (data: Partial<Ticker>) => {
      setTickers((prev) => {
        const updated = [...prev];
        const idx = updated.findIndex((t) => t.symbol === data.symbol);
        if (idx !== -1 && data.symbol) updated[idx] = { ...updated[idx], ...data, symbol: data.symbol } as Ticker;
        return updated;
      });
    }, "MARKETS-PAGE");

    SignalingManager.getInstance().sendMessage({ method: "SUBSCRIBE", params: ["ticker.all"] });

    return () => {
      SignalingManager.getInstance().deRegisterCallback("ticker.all", "MARKETS-PAGE");
      SignalingManager.getInstance().sendMessage({ method: "UNSUBSCRIBE", params: ["ticker.all"] });
    };
  }, []);

  useEffect(() => {
    let filtered = [...tickers];
    if (activeTab === "spot") filtered = filtered.filter((t) => !t.symbol.endsWith("_PERP"));
    if (activeTab === "perp") filtered = filtered.filter((t) => t.symbol.endsWith("_PERP"));
    if (activeTab === "favorites") filtered = filtered.filter((t) => favorites.includes(t.symbol));
    if (searchQuery) { const q = searchQuery.toLowerCase(); filtered = filtered.filter((t) => t.symbol.toLowerCase().includes(q)); }
    filtered.sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
    setFilteredTickers(filtered);
  }, [tickers, activeTab, favorites, searchQuery]);

  return (
    <div className="h-full overflow-auto bg-bp-bg-primary">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-bp-text-primary mb-1">Markets</h1>
          <p className="text-sm text-bp-text-tertiary">Trade with low fees and deep liquidity</p>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1">
            {(["spot","perp","all","favorites"] as TabType[]).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={cn("px-3 py-1.5 text-xs font-medium rounded transition-colors", activeTab === tab ? "text-bp-text-primary bg-bp-bg-tertiary" : "text-bp-text-tertiary hover:text-bp-text-secondary")}>
                {tab === "favorites" && <Star className="w-3 h-3 mr-1 inline-block" />}
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === "favorites" && favorites.length > 0 && <span className="ml-1 text-2xs bg-bp-bg-tertiary px-1 py-0.5 rounded">{favorites.length}</span>}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-bp-text-tertiary" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="w-48 bg-bp-bg-tertiary border border-bp-border rounded pl-8 pr-3 py-1.5 text-xs text-bp-text-primary placeholder-bp-text-disabled focus:outline-none focus:border-bp-border-active" />
          </div>
        </div>

        {loading ? (
          <div className="bg-bp-bg-secondary rounded-lg border border-bp-border animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-bp-border">
                <div className="w-4 h-4 bg-bp-bg-tertiary rounded" />
                <div className="w-7 h-7 bg-bp-bg-tertiary rounded-full" />
                <div className="flex-1 space-y-1"><div className="w-20 h-3 bg-bp-bg-tertiary rounded" /></div>
                <div className="w-20 h-3 bg-bp-bg-tertiary rounded" />
                <div className="w-16 h-3 bg-bp-bg-tertiary rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-bp-bg-secondary rounded-lg overflow-hidden border border-bp-border">
            <div className="grid grid-cols-12 gap-4 px-4 py-3 text-2xs text-bp-text-tertiary border-b border-bp-border">
              <div className="col-span-1" /><div className="col-span-3">Market</div>
              <div className="col-span-2 text-right">Price</div><div className="col-span-2 text-right">24h Change</div>
              <div className="col-span-2 text-right">High / Low</div><div className="col-span-2 text-right">Volume</div>
            </div>
            {filteredTickers.map((ticker) => {
              const change = parseFloat(ticker.priceChangePercent || "0");
              const isPos = change >= 0;
              const [base, quote] = parseMarketSymbol(ticker.symbol);
              return (
                <div key={ticker.symbol} onClick={() => router.push(`/trade/${ticker.symbol}`)} className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-bp-border hover:bg-bp-bg-hover cursor-pointer transition-colors items-center">
                  <div className="col-span-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleFavorite(ticker.symbol)} className="p-1">
                      <Star className={cn("w-3.5 h-3.5", isFavorite(ticker.symbol) ? "fill-bp-yellow text-bp-yellow" : "text-bp-text-disabled hover:text-bp-yellow")} />
                    </button>
                  </div>
                  <div className="col-span-3 flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#00FFA3] to-[#DC1FFF] flex items-center justify-center"><span className="text-white font-bold text-2xs">{base.charAt(0)}</span></div>
                    <div><span className="text-sm font-medium text-bp-text-primary">{base}/{quote}</span><div className="text-2xs text-bp-text-tertiary">Spot</div></div>
                  </div>
                  <div className="col-span-2 text-right text-sm text-bp-text-primary tabular-nums">${formatPrice(ticker.lastPrice, 2)}</div>
                  <div className="col-span-2 text-right"><span className={cn("text-sm font-medium tabular-nums", isPos ? "text-bp-green" : "text-bp-red")}>{isPos ? "+" : ""}{formatPercentage(ticker.priceChangePercent, false)}</span></div>
                  <div className="col-span-2 text-right"><div className="text-xs text-bp-text-secondary tabular-nums">{formatPrice(ticker.high, 2)}</div><div className="text-2xs text-bp-text-tertiary tabular-nums">{formatPrice(ticker.low, 2)}</div></div>
                  <div className="col-span-2 text-right text-xs text-bp-text-secondary tabular-nums">${formatVolume(ticker.quoteVolume)}</div>
                </div>
              );
            })}
            {filteredTickers.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16">
                <Star className="w-10 h-10 text-bp-text-disabled mb-3" />
                <p className="text-sm text-bp-text-secondary">No markets found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}