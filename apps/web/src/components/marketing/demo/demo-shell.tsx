"use client";

import { motion, useReducedMotion } from "motion/react";

// The landing demo's entrance plays in three staged beats. Step 1 — the chrome
// (the persistent frame in <HeroDemo> + the hero's BorderBeam) — is owned one
// level up. The inset surface itself is part of that chrome; this shell owns
// steps 2 and 3:
//   2. the sidebar items blur in;
//   3. 0.3s later the content *inside* the inset surface blurs into place.
// Both are pure blur+opacity (no transform) and run on mount — and because this
// shell only mounts once the lazy demo chunk has resolved, its mount *is* the
// "loading finished" signal the two beats hang off of. The delays seat them
// after the chrome reveal, then stagger 0.3s apart. Reduced-motion renders
// everything in place.
const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

export function DemoShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();

  // Step 2 — sidebar items.
  const sidebarReveal = reduce
    ? {}
    : {
        initial: { opacity: 0, filter: "blur(0px)" },
        animate: { opacity: 1, filter: "blur(0px)" },
        transition: { duration: 0.6, ease: EASE, delay: 0.7 },
      };

  // Step 3 — inset content, a 0.3s beat after the sidebar.
  const insetReveal = reduce
    ? {}
    : {
        initial: { opacity: 0, filter: "blur(0px)" },
        animate: { opacity: 1, filter: "blur(0px)" },
        transition: { duration: 0.6, ease: EASE, delay: 0.75 },
      };

  return (
    <>
      {/* Sidebar surface — step 2 */}
      <motion.div
        {...sidebarReveal}
        style={{ willChange: "opacity, filter" }}
        className="hidden w-56 shrink-0 md:block "
      >
        {sidebar}
      </motion.div>

      {/* Inset surface — static, part of the chrome; only its content (step 3)
          blurs in. It carries the shadow because this surface paints *above* the
          sidebar, so the shadow rims the seam between them (a placeholder one
          layer up can't — the sidebar covers it as it reveals). A matching
          placeholder in <HeroDemo> carries the shadow too, so it's already there
          for the frame or two before this lazy surface mounts. */}
      <div className="relative m-2 ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl corner-squircle bg-background dark:shadow-(--custom-shadow) max-md:ml-2">
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          <motion.div
            {...insetReveal}
            style={{ willChange: "opacity, filter" }}
            className="mx-auto flex max-w-380 flex-col gap-6 p-6 lg:p-10"
          >
            {children}
          </motion.div>
        </div>
      </div>
    </>
  );
}
