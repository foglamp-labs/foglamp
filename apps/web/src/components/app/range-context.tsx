"use client";

import { createContext, use, useEffect, useMemo, useState } from "react";

import { customRange, defaultRange, resolvePreset, type RangeValue } from "@/lib/range";

type RangeContextValue = {
  range: RangeValue;
  setRange: (range: RangeValue) => void;
};

const RangeContext = createContext<RangeContextValue | null>(null);

const STORAGE_KEY = "foglamp.range";

// Shared time-range filter so switching tabs keeps the same window. Relative
// presets are re-resolved to "now" on load; custom ranges restore their dates.
export function RangeProvider({ children }: { children: React.ReactNode }) {
  const [range, setRangeState] = useState<RangeValue>(() => defaultRange());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const v = JSON.parse(raw) as { key: string; from: string; to: string };
      if (v.key && v.key !== "custom") {
        setRangeState(resolvePreset(v.key));
      } else if (v.from && v.to) {
        setRangeState(customRange(new Date(v.from), new Date(v.to)));
      }
    } catch {
      // ignore malformed storage
    }
  }, []);

  const setRange = (next: RangeValue) => {
    setRangeState(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          key: next.key,
          from: next.from.toISOString(),
          to: next.to.toISOString(),
        }),
      );
    }
  };

  const value = useMemo<RangeContextValue>(() => ({ range, setRange }), [range]);

  return <RangeContext value={value}>{children}</RangeContext>;
}

export function useRange(): RangeContextValue {
  const ctx = use(RangeContext);
  if (!ctx) throw new Error("useRange must be used within RangeProvider");
  return ctx;
}
