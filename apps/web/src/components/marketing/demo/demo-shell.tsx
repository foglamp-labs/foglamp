"use client";

import { motion, useReducedMotion } from "motion/react";

// The landing demo's chrome (the persistent frame in <HeroDemo> and the inset
// surface below) renders in place; only the content inside it enters, in two
// beats this shell owns:
//   1. the sidebar items blur in;
//   2. 0.2s later the content *inside* the inset surface blurs into place.
// Both are pure blur+opacity (no transform) and run on mount — and because this
// shell only mounts once the lazy demo chunk has resolved, its mount *is* the
// "loading finished" signal the two beats hang off of. The delays seat them
// after the hero copy has landed. Reduced-motion renders everything in place.
const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

export function DemoShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();

  // Beat 1 — sidebar items.
  const sidebarReveal = reduce
    ? {}
    : {
        initial: { opacity: 0, filter: "blur(0px)" },
        animate: { opacity: 1, filter: "blur(0px)" },
        transition: { duration: 0.6, ease: EASE, delay: 0.7 },
      };

  // Beat 2 — inset content, shortly after the sidebar.
  const insetReveal = reduce
    ? {}
    : {
        initial: { opacity: 0, filter: "blur(0px)" },
        animate: { opacity: 1, filter: "blur(0px)" },
        transition: { duration: 0.6, ease: EASE, delay: 0.9 },
      };

  return (
    <>
      {/* Sidebar surface — beat 1 */}
      <motion.div
        {...sidebarReveal}
        style={{ willChange: "opacity, filter" }}
        className="hidden w-56 shrink-0 md:block "
      >
        {sidebar}
      </motion.div>

      {/* Inset surface — static, part of the chrome; only its content (beat 2)
          blurs in. This box is transparent: the surface and its shadow belong
          to the placeholder in <HeroDemo>, which sits one layer below at the
          exact same rect and is there from first paint. Painting them here as
          well would stack two shadows once this lazy shell mounts. The sidebar
          beside it has no surface of its own, so nothing covers that seam. */}
      <div className="relative m-2 ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-md squircle:rounded-xl corner-squircle max-md:ml-2">
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          <motion.div
            {...insetReveal}
            style={{ willChange: "opacity, filter" }}
            className="flex flex-col gap-4 py-6 pb-16"
          >
            {children}
          </motion.div>
        </div>
      </div>
    </>
  );
}
