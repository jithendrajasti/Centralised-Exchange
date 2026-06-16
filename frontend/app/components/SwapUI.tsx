"use client";

import { useState, useEffect } from "react";
import { getTicker, createOrder, getBalances } from "../utils/httpClient";
import { QUANTITY_PRECISION } from "../lib/constants";
import { cn } from "../lib/utils";
import { PercentageSlider } from "./PercentageSlider";
import toast from "react-hot-toast";

/* ═══════════════════════════════════════════════════════════════
   SwapUI — Order Entry Panel (Backpack Exchange Style)

   Layout order (matching Backpack):
     1. Buy / Sell toggle (large buttons at top)
     2. Order type tabs (Limit / Market)
     3. Price input (Limit only)
     4. Size input
     5. Percentage slider
     6. Order value summary
     7. Advanced options (Post Only, IOC)
     8. Submit button
     9. Auth CTAs
   ═══════════════════════════════════════════════════════════════ */

export function SwapUI({ market }: { market: string }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [sliderPercent, setSliderPercent] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [balances, setBalances] = useState<Record<string, { available: number; locked: number }>>({});

  const [base = "", quote = ""] = market.split("_");
  const baseBalance = balances[base]?.available ?? 0;
  const quoteBalance = balances[quote]?.available ?? 0;

  /* ─── Fetch initial price ─── */
  const refreshBalances = async () => {
    try {
      const response = await getBalances();
      setBalances(response.balances || {});
    } catch (error) {
      console.error("Failed to fetch balances:", error);
    }
  };

  useEffect(() => {
    getTicker(market).then((t) => setPrice(t.lastPrice));
    refreshBalances();
  }, [market]);

  /* ─── Computed values ─── */
  const total =
    price && quantity
      ? (parseFloat(price) * parseFloat(quantity)).toFixed(2)
      : "0.00";

  /* ─── Handle percentage slider ─── */
  const handleSliderChange = (percent: number) => {
    setSliderPercent(percent);
    const priceValue = Number(price);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      return;
    }

    const ratio = percent / 100;
    if (ratio <= 0) {
      setQuantity("");
      return;
    }

    if (side === "buy") {
      const maxQuote = quoteBalance * ratio;
      const rawQty = maxQuote / priceValue;
      setQuantity(rawQty > 0 ? rawQty.toFixed(QUANTITY_PRECISION) : "");
      return;
    }

    const rawQty = baseBalance * ratio;
    setQuantity(rawQty > 0 ? rawQty.toFixed(QUANTITY_PRECISION) : "");
  };

  /* ─── Submit Order ─── */
  const handleSubmit = async () => {
    if (!price || !quantity) {
      toast.error("Please enter price and quantity");
      return;
    }

    if (parseFloat(price) <= 0 || parseFloat(quantity) <= 0) {
      toast.error("Price and quantity must be positive");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createOrder(market, price, quantity, side);
      toast.success(`Order placed! ID: ${result.orderId.slice(0, 8)}...`);
      setQuantity("");
      setSliderPercent(0);
      await refreshBalances();
    } catch (error) {
      console.error("Order error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to place order"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBuy = side === "buy";

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 p-3 space-y-3 overflow-y-auto no-scrollbar">
        {/* ═══ 1. Buy / Sell Toggle ═══ */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-bp-bg-tertiary rounded-md">
          <button
            onClick={() => setSide("buy")}
            className={cn(
              "py-2 text-xs font-semibold rounded transition-all",
              isBuy
                ? "bg-bp-green text-white shadow-sm"
                : "text-bp-text-tertiary hover:text-bp-text-secondary"
            )}
          >
            Buy
          </button>
          <button
            onClick={() => setSide("sell")}
            className={cn(
              "py-2 text-xs font-semibold rounded transition-all",
              !isBuy
                ? "bg-bp-red text-white shadow-sm"
                : "text-bp-text-tertiary hover:text-bp-text-secondary"
            )}
          >
            Sell
          </button>
        </div>

        {/* ═══ 2. Order Type Tabs ═══ */}
        <div className="flex items-center gap-4 border-b border-bp-border pb-2">
          <OrderTypeTab
            active={orderType === "limit"}
            onClick={() => setOrderType("limit")}
          >
            Limit
          </OrderTypeTab>
          <OrderTypeTab
            active={orderType === "market"}
            onClick={() => setOrderType("market")}
          >
            Market
          </OrderTypeTab>
          <OrderTypeTab active={false} onClick={() => {}} disabled>
            Conditional
          </OrderTypeTab>
        </div>

        {/* ═══ 3. Price Input (Limit only) ═══ */}
        {orderType === "limit" && (
          <InputField
            label="Price"
            value={price}
            onChange={setPrice}
            suffix={quote}
            actions={
              <div className="flex gap-1.5">
                <QuickFillButton label="Mid" onClick={() => {}} />
                <QuickFillButton label="BBO" onClick={() => {}} />
              </div>
            }
          />
        )}

        {/* ═══ 4. Size Input ═══ */}
        <InputField
          label="Size"
          value={quantity}
          onChange={setQuantity}
          suffix={base}
          placeholder="0.0000"
        />

        {/* ═══ 5. Percentage Slider ═══ */}
        <PercentageSlider
          value={sliderPercent}
          onChange={handleSliderChange}
          variant={isBuy ? "buy" : "sell"}
        />

        {/* ═══ 6. Order Value ═══ */}
        <div className="space-y-1.5">
          <InfoRow label="Order Value" value={`${total} ${quote}`} />
          <InfoRow label={`${base} Balance`} value={`${baseBalance.toFixed(QUANTITY_PRECISION)} ${base}`} />
          <InfoRow label={`${quote} Balance`} value={`${quoteBalance.toFixed(2)} ${quote}`} />
        </div>

        {/* ═══ 7. Advanced Options ═══ */}
        <div className="flex items-center gap-4 pt-1">
          <Checkbox label="Post Only" />
          <Checkbox label="IOC" />
        </div>

        {/* ═══ 8. Submit Button ═══ */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={cn(
            "w-full py-2.5 rounded-md font-semibold text-xs transition-all",
            isSubmitting && "opacity-50 cursor-not-allowed",
            isBuy
              ? "bg-bp-green hover:bg-bp-green-hover text-white"
              : "bg-bp-red hover:bg-bp-red-hover text-white"
          )}
        >
          {isSubmitting
            ? "Placing Order..."
            : `${isBuy ? "Buy" : "Sell"} ${base}`}
        </button>

        {/* ═══ 9. Auth CTAs ═══ */}
        <div className="text-center space-y-1 pt-1">
          <p className="text-2xs text-bp-text-tertiary">
            New to Backpack?{" "}
            <button className="text-bp-text-primary hover:underline font-medium">
              Sign up
            </button>
          </p>
          <p className="text-2xs text-bp-text-tertiary">
            Already have an account?{" "}
            <button className="text-bp-text-primary hover:underline font-medium">
              Log in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════
   Sub-Components
   ═══════════════════════════════════════════════════════════════ */

/** Order Type Tab */
function OrderTypeTab({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "text-xs font-medium transition-colors relative pb-1",
        active
          ? "text-bp-text-primary"
          : "text-bp-text-tertiary hover:text-bp-text-secondary",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {children}
      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-bp-text-primary rounded-full" />
      )}
    </button>
  );
}

/** Styled Input Field */
function InputField({
  label,
  value,
  onChange,
  suffix,
  placeholder = "0.00",
  actions,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  suffix?: string;
  placeholder?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-2xs text-bp-text-tertiary">{label}</label>
        {actions}
      </div>
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-bp-bg-input border border-bp-border rounded px-3 py-2 pr-12 text-xs text-bp-text-primary placeholder-bp-text-disabled focus:outline-none focus:border-bp-border-active transition-colors tabular-nums"
        />
        {suffix && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-bp-text-tertiary">
            {suffix}
          </div>
        )}
      </div>
    </div>
  );
}

/** Quick Fill Button (Mid / BBO) */
function QuickFillButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-2xs text-bp-text-tertiary hover:text-bp-text-secondary transition-colors"
    >
      {label}
    </button>
  );
}

/** Info Row (label + value) */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-2xs">
      <span className="text-bp-text-tertiary">{label}</span>
      <span className="text-bp-text-secondary tabular-nums">{value}</span>
    </div>
  );
}

/** Checkbox */
function Checkbox({ label }: { label: string }) {
  return (
    <label className="flex items-center gap-1.5 text-2xs cursor-pointer">
      <input
        type="checkbox"
        className="w-3 h-3 rounded border-bp-border bg-bp-bg-tertiary accent-bp-blue"
      />
      <span className="text-bp-text-tertiary">{label}</span>
    </label>
  );
}