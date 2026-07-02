"use client";

import { cn } from "@foglamp/ui/lib/utils";
import { useState, type ReactNode } from "react";

import { faviconUrl } from "./favicon";

/** Foglamp brand mark — three overlapping circles (lead → blue → orange). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 48" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* lead circle follows currentColor so callers can set it (e.g. white on the art card) */}
      <circle cx="24" cy="24" r="24" className="fill-current" />
      <circle cx="48" cy="24" r="24" fill="#0090FD" />
      <circle cx="72" cy="24" r="24" fill="#FF5513" />
    </svg>
  );
}

/**
 * A favicon image resolved through the same-origin proxy, with a glyph/letter
 * fallback when there's no domain or the image fails to load. Size and rounding
 * come from `className`.
 */
export function Favicon({
  domain,
  fallback,
  className,
}: {
  domain?: string;
  fallback: ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!domain || failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- same-origin favicon proxy; no optimization wanted
    <img
      src={faviconUrl(domain)}
      alt=""
      className={cn("corner-squircle object-contain", className)}
      onError={() => setFailed(true)}
    />
  );
}
