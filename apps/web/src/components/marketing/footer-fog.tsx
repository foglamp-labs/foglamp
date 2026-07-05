"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";

import { FogBank } from "./noise-overlay";

// A thin fog band hugging the footer's bottom edge — it fades out just under
// the copyright row. overflow-hidden is load-bearing: the drifting layer is
// oversized, and without clipping it stretches the page's scroll area (a
// horizontal scrollbar and a phantom gap under the footer).
export function FooterFog() {
  const reduce = useReducedMotion() ?? false;
  // Don't animate (or even render the texture) while the footer is off-screen.
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "30% 0px 30% 0px" });
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 overflow-hidden opacity-20"
      style={{
        // Dense at the very bottom, thinning out toward the copyright row.
        WebkitMaskImage:
          "linear-gradient(to top, #000 0%, #000 20%, transparent 100%)",
        maskImage:
          "linear-gradient(to top, #000 0%, #000 20%, transparent 100%)",
      }}
    >
      {inView ? (
        <motion.div
          className="absolute inset-[-40%]"
          style={{ filter: "blur(12px)" }}
          animate={
            reduce
              ? undefined
              : { x: ["-3%", "3%", "-3%"], y: ["-10%", "10%", "-10%"] }
          }
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        >
          <FogBank id="footer-fog" freq={0.014} seed={11} />
        </motion.div>
      ) : null}
    </div>
  );
}
