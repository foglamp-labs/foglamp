"use client";

import { useState, type ReactNode } from "react";

import { faviconUrl } from "./favicon";

/** Foglamp brand mark — three overlapping circles (lead → blue → orange). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 48" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="24" cy="24" r="24" className="brand-lead" />
      <circle cx="48" cy="24" r="24" fill="#0090FD" />
      <circle cx="72" cy="24" r="24" fill="#FF5513" />
    </svg>
  );
}

/**
 * A favicon image resolved through the same-origin proxy, with a glyph fallback
 * when there's no domain or the image fails to load.
 */
export function Favicon({
  domain,
  fallback,
  size = 20,
}: {
  domain?: string;
  fallback: ReactNode;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (!domain || failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- same-origin favicon proxy; no optimization wanted
    <img
      src={faviconUrl(domain)}
      alt=""
      width={size}
      height={size}
      className="favicon"
      onError={() => setFailed(true)}
    />
  );
}
