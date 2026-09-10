"use client";

import { cn } from "@foglamp/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";

import { DROP_AT, dropIn } from "@/components/marketing/demo/entrance";

// The dashboard replica is ~50–80kB and renders SSR-fragile charts, so we
// lazy-load its innards client-only. Only the *inner* surfaces (sidebar + inset
// content) are lazy. The chrome frame below is always present, so it reserves
// the frame's 720px (no layout jump) and sits tilted in place from the first
// paint (the tilt lives in Hero). While the inner chunk loads, the frame holds
// only the dropping inset panel; the sidebar and content then drop in once it
// resolves.
const DashboardDemo = dynamic(
  () => import("@/components/marketing/demo").then((m) => m.DashboardDemo),
  {
    ssr: false,
    loading: () => null,
  }
);

// In light mode the demo's sidebar runs a touch darker than the app's so
// the inset surface stands off it. In dark mode the demo runs one step
// lighter than the app so it stands out from the page instead of sinking
// into it. Each surface keeps its place in the app's order
// (sidebar, then inset, then cards, then hover).
const DARK_LIFT =
  "[--sidebar:oklch(0.96_0_0)] dark:[--sidebar:oklch(0.2_0_0)] dark:[--background:oklch(0.215_0_0)] dark:[--card:oklch(0.25_0_0)] dark:[--popover:oklch(0.25_0_0)] dark:[--muted:oklch(0.31_0_0)] dark:[--accent:oklch(0.31_0_0)] dark:[--secondary:oklch(0.31_0_0)] dark:[--sidebar-accent:oklch(0.31_0_0)]";

export function HeroDemo({
  settled,
  interactive,
  onSettled,
}: {
  // True once every surface has dropped into place. Until then the frame
  // does not clip, so the surfaces can start above its top edge.
  settled: boolean;
  // True once the frame has swung flat as well: only then does the demo
  // let the user switch tabs.
  interactive: boolean;
  onSettled: () => void;
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    // The persistent chrome frame, in place from the start. The hairline
    // around it belongs to the hero's DemoFrame.
    <div
      className={cn(
        "relative flex h-180 w-full transform-3d rounded-xl corner-round! bg-sidebar",
        settled && "overflow-hidden",
        DARK_LIFT
      )}
    >
      {/* Inset-surface placeholder. The real white inset panel lives inside the
          lazy DashboardDemo, so without this it would pop in a beat after the
          chrome mounts. This copy of the panel's shape sits in the persistent
          (non-lazy) layer so the surface paints with the frame from the first
          frame. It mirrors DemoShell's layout exactly, a w-56 sidebar gutter
          plus the m-2 inset, so the real panel overlays it pixel-for-pixel;
          the real content then drops in over it. This is the first surface
          to drop. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex transform-3d"
      >
        <div className="hidden w-56 shrink-0 md:block" />
        {/* This placeholder carries the inset's shadow so it's painted with the
            chrome from the very first frame, before the lazy DemoShell mounts.
            Once mounted, the real inset re-casts the same shadow. It has to,
            because that inset paints above the revealing sidebar, so its seam
            shadow stays visible where this placeholder's (sitting one layer
            below the sidebar) would be covered as the sidebar fades in. In dark
            mode the brief overlap of the two identical shadows is imperceptible. */}
        <motion.div
          {...dropIn(DROP_AT.inset, reduce)}
          style={{ willChange: "transform, opacity" }}
          className="m-2 ml-0 flex-1 rounded-md squircle:rounded-xl corner-squircle bg-background shadow-(--custom-shadow) max-md:ml-2"
        />
      </div>
      <DashboardDemo interactive={interactive} onSettled={onSettled} />
    </div>
  );
}
