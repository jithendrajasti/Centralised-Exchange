"use client";

import { useState } from "react";
import { cn } from "../lib/utils";
import { Depth } from "./depth/Depth";
import { Trades } from "./Trades";
import { PrecisionSelector } from "./PrecisionSelector";

/* ═══════════════════════════════════════════════════════════════
   BookTradesTabs — Order Book & Recent Trades Switcher
   ═══════════════════════════════════════════════════════════════ */

export function BookTradesTabs({ market }: { market: string }) {
  const [activeTab, setActiveTab] = useState<"book" | "trades">("book");
  const [precision, setPrecision] = useState(0.1);

  return (
    <div className="flex flex-col h-full">
      {/* ─── Tab Header ─── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bp-border">
        {/* Tabs */}
        <div className="flex items-center gap-1">
          <TabButton
            active={activeTab === "book"}
            onClick={() => setActiveTab("book")}
          >
            Book
          </TabButton>
          <TabButton
            active={activeTab === "trades"}
            onClick={() => setActiveTab("trades")}
          >
            Trades
          </TabButton>
        </div>

        {/* Precision Selector (only for Book tab) */}
        {activeTab === "book" && (
          <PrecisionSelector value={precision} onChange={setPrecision} />
        )}
      </div>

      {/* ─── Tab Content ─── */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "book" ? (
          <Depth market={market} />
        ) : (
          <Trades market={market} />
        )}
      </div>
    </div>
  );
}


/* ─── Tab Button ─── */
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1 text-xs font-medium rounded transition-colors",
        active
          ? "text-bp-text-primary bg-bp-bg-tertiary"
          : "text-bp-text-tertiary hover:text-bp-text-secondary"
      )}
    >
      {children}
    </button>
  );
}