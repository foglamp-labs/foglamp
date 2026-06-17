"use client";

import { BorderBeam } from "border-beam";
import type { ReactNode } from "react";

/**
 * Client boundary for the animated border beam around the featured plan card.
 * BorderBeam uses client-only hooks (useState/rAF), so it can't render directly
 * inside the Server Component pricing page. The card is passed through as
 * `children` — already rendered on the server — and only the beam is client-side.
 */
export function FeaturedBeam({ children }: { children: ReactNode }) {
  return (
    // borderRadius matches the Card's rounded-3xl (22px in our token scale) so
    // the beam's circular-arc corners line up with the card. The card pairs this
    // with corner-round! (in page.tsx) to drop its default squircle, which the
    // beam can't reproduce.
    <BorderBeam
      size="pulse-outside"
      colorVariant="colorful"
      strength={0.4}
      borderRadius={22}
      className="h-fit"
    >
      {children}
    </BorderBeam>
  );
}
