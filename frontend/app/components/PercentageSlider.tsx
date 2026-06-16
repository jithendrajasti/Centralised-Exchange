"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "../lib/utils";

/* ═══════════════════════════════════════════════════════════════
   PercentageSlider — Visual Draggable Quantity Slider
   Shows a track with thumb and snap points at 0/25/50/75/100%.
   ═══════════════════════════════════════════════════════════════ */

interface PercentageSliderProps {
  /** Current percentage (0-100) */
  value: number;
  /** Callback when percentage changes */
  onChange: (percent: number) => void;
  /** Color variant */
  variant?: "buy" | "sell";
}

const SNAP_POINTS = [0, 25, 50, 75, 100];

export function PercentageSlider({
  value,
  onChange,
  variant = "buy",
}: PercentageSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const accentColor = variant === "buy" ? "bp-green" : "bp-red";

  /* ─── Calculate percentage from mouse/touch position ─── */
  const getPercentFromEvent = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return value;
      const rect = trackRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percent = Math.round(Math.max(0, Math.min(100, (x / rect.width) * 100)));
      return percent;
    },
    [value]
  );

  /* ─── Mouse/Touch handlers ─── */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setIsDragging(true);
      const percent = getPercentFromEvent(e.clientX);
      onChange(percent);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [getPercentFromEvent, onChange]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const percent = getPercentFromEvent(e.clientX);
      onChange(percent);
    },
    [isDragging, getPercentFromEvent, onChange]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div className="py-2">
      {/* ─── Track ─── */}
      <div
        ref={trackRef}
        className="slider-track relative"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Filled portion */}
        <div
          className={`slider-fill bg-${accentColor}`}
          style={{ width: `${value}%` }}
        />

        {/* Snap point dots */}
        {SNAP_POINTS.map((point) => (
          <div
            key={point}
            className={cn(
              "slider-dot",
              point <= value && "active",
              point <= value ? `text-${accentColor}` : ""
            )}
            style={{ left: `${point}%` }}
            onClick={(e) => {
              e.stopPropagation();
              onChange(point);
            }}
          />
        ))}

        {/* Draggable thumb */}
        <div
          className={`slider-thumb border-${accentColor}`}
          style={{ left: `${value}%` }}
        />
      </div>

      {/* ─── Percentage Labels ─── */}
      <div className="flex justify-between mt-1.5">
        {SNAP_POINTS.map((point) => (
          <button
            key={point}
            onClick={() => onChange(point)}
            className={cn(
              "text-2xs tabular-nums transition-colors",
              value >= point
                ? "text-bp-text-secondary"
                : "text-bp-text-disabled"
            )}
          >
            {point}%
          </button>
        ))}
      </div>
    </div>
  );
}
