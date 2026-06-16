"use client";

import { useState } from "react";
import { cn } from "../lib/utils";

/* ═══════════════════════════════════════════════════════════════
   BottomPanel — Orders, Balances & History (Backpack Style)

   Tabs: Balances | Open Orders | Order History | Trade History
   Sits below the trading grid. Shows relevant trading data.
   ═══════════════════════════════════════════════════════════════ */

type BottomTab =
  | "balances"
  | "openOrders"
  | "orderHistory"
  | "tradeHistory";

const TABS: { key: BottomTab; label: string }[] = [
  { key: "balances",     label: "Balances" },
  { key: "openOrders",   label: "Open Orders" },
  { key: "orderHistory", label: "Order History" },
  { key: "tradeHistory", label: "Trade History" },
];

export function BottomPanel({ market: _market }: { market: string }) {
  const [activeTab, setActiveTab] = useState<BottomTab>("openOrders");

  return (
    <div className="flex flex-col h-full bg-bp-bg-secondary">
      {/* ─── Resize Handle ─── */}
      <div className="resize-handle border-t border-bp-border" />

      {/* ─── Tab Bar ─── */}
      <div className="flex items-center gap-1 px-4 border-b border-bp-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "relative px-3 py-2.5 text-xs font-medium transition-colors",
              activeTab === tab.key
                ? "text-bp-text-primary"
                : "text-bp-text-tertiary hover:text-bp-text-secondary"
            )}
          >
            {tab.label}
            {activeTab === tab.key && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-[1.5px] bg-bp-text-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ─── Tab Content ─── */}
      <div className="flex-1 overflow-auto">
        {activeTab === "balances"     && <BalancesTab />}
        {activeTab === "openOrders"   && <OpenOrdersTab />}
        {activeTab === "orderHistory" && <OrderHistoryTab />}
        {activeTab === "tradeHistory" && <TradeHistoryTab />}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════
   Tab Content Components
   ═══════════════════════════════════════════════════════════════ */

/** Balances Tab */
function BalancesTab() {
  return (
    <div className="w-full">
      {/* Table Header */}
      <div className="grid grid-cols-5 px-4 py-2 text-2xs text-bp-text-tertiary border-b border-bp-border">
        <div>Asset</div>
        <div className="text-right">Total</div>
        <div className="text-right">Available</div>
        <div className="text-right">In Order</div>
        <div className="text-right">USD Value</div>
      </div>

      {/* Empty State */}
      <EmptyState message="Connect your wallet to view balances" />
    </div>
  );
}

/** Open Orders Tab */
function OpenOrdersTab() {
  return (
    <div className="w-full">
      {/* Table Header */}
      <div className="grid grid-cols-8 px-4 py-2 text-2xs text-bp-text-tertiary border-b border-bp-border">
        <div>Time</div>
        <div>Pair</div>
        <div>Type</div>
        <div>Side</div>
        <div className="text-right">Price</div>
        <div className="text-right">Amount</div>
        <div className="text-right">Filled</div>
        <div className="text-right">Action</div>
      </div>

      {/* Empty State */}
      <EmptyState message="No open orders" />
    </div>
  );
}

/** Order History Tab */
function OrderHistoryTab() {
  return (
    <div className="w-full">
      {/* Table Header */}
      <div className="grid grid-cols-7 px-4 py-2 text-2xs text-bp-text-tertiary border-b border-bp-border">
        <div>Time</div>
        <div>Pair</div>
        <div>Type</div>
        <div>Side</div>
        <div className="text-right">Price</div>
        <div className="text-right">Amount</div>
        <div className="text-right">Status</div>
      </div>

      {/* Empty State */}
      <EmptyState message="No order history" />
    </div>
  );
}

/** Trade History Tab */
function TradeHistoryTab() {
  return (
    <div className="w-full">
      {/* Table Header */}
      <div className="grid grid-cols-7 px-4 py-2 text-2xs text-bp-text-tertiary border-b border-bp-border">
        <div>Time</div>
        <div>Pair</div>
        <div>Side</div>
        <div className="text-right">Price</div>
        <div className="text-right">Amount</div>
        <div className="text-right">Fee</div>
        <div className="text-right">Total</div>
      </div>

      {/* Empty State */}
      <EmptyState message="No trade history" />
    </div>
  );
}


/* ─── Empty State ─── */
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      {/* Empty icon */}
      <svg
        className="w-10 h-10 text-bp-text-disabled mb-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <p className="text-xs text-bp-text-tertiary">{message}</p>
    </div>
  );
}
