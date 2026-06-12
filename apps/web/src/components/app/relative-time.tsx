"use client";

import { useEffect, useState } from "react";

import { formatRelative } from "@/lib/format";

/**
 * A relative timestamp ("3s ago") that re-renders on an interval, so it keeps
 * aging while the page sits open instead of freezing at its first render.
 * Self-contained: only the text node re-renders, not the table around it.
 */
export function RelativeTime({
  value,
}: {
  value: string | Date | null | undefined;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  return <>{formatRelative(value)}</>;
}
