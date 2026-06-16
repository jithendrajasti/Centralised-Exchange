"use client";

/* ═══════════════════════════════════════════════════════════════
   SentimentBar — Bid/Ask Volume Ratio Indicator
   Shows the proportion of bid vs ask volume as a colored bar.
   ═══════════════════════════════════════════════════════════════ */

interface SentimentBarProps {
  /** Total bid volume */
  bidVolume: number;
  /** Total ask volume */
  askVolume: number;
}

export function SentimentBar({ bidVolume, askVolume }: SentimentBarProps) {
  const total = bidVolume + askVolume;

  /* ─── Edge case: no volume ─── */
  if (total === 0) {
    return (
      <div className="px-4 py-2">
        <div className="sentiment-bar">
          <div className="bid-fill" style={{ width: "50%" }} />
          <div className="ask-fill" style={{ width: "50%" }} />
        </div>
      </div>
    );
  }

  const bidPercent = (bidVolume / total) * 100;
  const askPercent = 100 - bidPercent;

  return (
    <div className="px-4 py-2 space-y-1">
      {/* ─── Labels ─── */}
      <div className="flex items-center justify-between text-2xs">
        <span className="text-bp-green tabular-nums">
          B {bidPercent.toFixed(1)}%
        </span>
        <span className="text-bp-red tabular-nums">
          S {askPercent.toFixed(1)}%
        </span>
      </div>

      {/* ─── Bar ─── */}
      <div className="sentiment-bar">
        <div className="bid-fill" style={{ width: `${bidPercent}%` }} />
        <div className="ask-fill" style={{ width: `${askPercent}%` }} />
      </div>
    </div>
  );
}
