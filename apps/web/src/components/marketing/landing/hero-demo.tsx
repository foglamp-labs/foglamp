"use client";

import dynamic from "next/dynamic";

// The dashboard replica is ~50–80kB and renders SSR-fragile charts, so we
// lazy-load its innards client-only. Only the *inner* surfaces (sidebar + inset
// content) are lazy. The chrome frame below is always present, so it reserves
// the frame's 660px (no layout jump) and is what the hero's step-1 reveal
// animates in. While the inner chunk loads, the frame simply sits empty (no
// skeleton); the sidebar and inset then blur in as steps 2 and 3 once it
// resolves.
const DashboardDemo = dynamic(
  () => import("@/components/marketing/demo").then((m) => m.DashboardDemo),
  {
    ssr: false,
    loading: () => null,
  }
);

// In dark mode the demo runs one step lighter than the app so it stands out
// from the page instead of sinking into it. Each surface keeps its place in
// the app's order (sidebar, then inset, then cards, then hover), just lifted.
const DARK_LIFT =
  "dark:[--sidebar:oklch(0.2_0_0)] dark:[--background:oklch(0.215_0_0)] dark:[--card:oklch(0.25_0_0)] dark:[--popover:oklch(0.25_0_0)] dark:[--muted:oklch(0.31_0_0)] dark:[--accent:oklch(0.31_0_0)] dark:[--secondary:oklch(0.31_0_0)] dark:[--sidebar-accent:oklch(0.31_0_0)]";

export function HeroDemo() {
  return (
    // The persistent chrome frame, step 1 of the demo's entrance, revealed by
    // the hero's outer reveal one level up. The hairline around it belongs to
    // the hero's DemoFrame.
    <div
      className={`relative flex h-165 w-full overflow-hidden rounded-xl corner-round! bg-sidebar ${DARK_LIFT}`}
    >
      {/* Inset-surface placeholder. The real white inset panel lives inside the
          lazy DashboardDemo, so without this it would pop in a beat after the
          chrome mounts. This copy of the panel's shape sits in the persistent
          (non-lazy) layer so the surface paints with the frame from the first
          frame. It mirrors DemoShell's layout exactly, a w-56 sidebar gutter
          plus the m-2 inset, so the real panel overlays it pixel-for-pixel;
          the real content then blurs in over it as step 3. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 flex">
        <div className="hidden w-56 shrink-0 md:block" />
        {/* This placeholder carries the inset's shadow so it's painted with the
            chrome from the very first frame, before the lazy DemoShell mounts.
            Once mounted, the real inset re-casts the same shadow. It has to,
            because that inset paints above the revealing sidebar, so its seam
            shadow stays visible where this placeholder's (sitting one layer
            below the sidebar) would be covered as the sidebar fades in. In dark
            mode the brief overlap of the two identical shadows is imperceptible. */}
        <div className="m-2 ml-0 flex-1 rounded-md squircle:rounded-xl corner-squircle bg-background shadow-(--custom-shadow) max-md:ml-2" />
      </div>
      <DashboardDemo />
    </div>
  );
}
