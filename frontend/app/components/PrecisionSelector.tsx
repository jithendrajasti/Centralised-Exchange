"use client";

import { useState, useRef } from "react";
import { cn } from "../lib/utils";

/* ═══════════════════════════════════════════════════════════════
   PrecisionSelector — Order Book Price Grouping Dropdown
   Allows users to change how price levels are aggregated.
   ═══════════════════════════════════════════════════════════════ */

interface PrecisionSelectorProps {
  /** Current grouping value (e.g., 0.01, 0.1, 1, 10) */
  value: number;
  /** Available grouping options */
  options?: number[];
  /** Callback when grouping changes */
  onChange: (value: number) => void;
}

const DEFAULT_OPTIONS = [0.01, 0.1, 1, 10];

export function PrecisionSelector({
  value,
  options = DEFAULT_OPTIONS,
  onChange,
}: PrecisionSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* ─── Trigger Button ─── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 text-2xs text-bp-text-tertiary hover:text-bp-text-secondary bg-bp-bg-tertiary rounded transition-colors"
      >
        {value}
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* ─── Dropdown Menu ─── */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div className="absolute right-0 top-full mt-1 z-50 bg-bp-bg-card border border-bp-border rounded-md shadow-lg overflow-hidden animate-fade-in min-w-[72px]">
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full px-3 py-1.5 text-2xs text-left transition-colors",
                  opt === value
                    ? "text-bp-text-primary bg-bp-bg-hover"
                    : "text-bp-text-secondary hover:bg-bp-bg-hover hover:text-bp-text-primary"
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
