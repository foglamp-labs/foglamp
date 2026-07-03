"use client";

import { motion, useReducedMotion } from "motion/react";

import { FogBank } from "./noise-overlay";

// A thin fog band hugging the footer's bottom edge — it fades out just under
// the copyright row. overflow-hidden is load-bearing: the drifting layer is
// oversized, and without clipping it stretches the page's scroll area (a
// horizontal scrollbar and a phantom gap under the footer).
export function FooterFog() {
  const reduce = useReducedMotion() ?? false;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-24 overflow-hidden opacity-30"
      style={{
        WebkitMaskImage: "linear-gradient(to top, #000 30%, transparent)",
        maskImage: "linear-gradient(to top, #000 30%, transparent)",
      }}
    >
      <motion.div
        className="absolute inset-[-40%]"
        style={{ filter: "blur(12px)" }}
        animate={
          reduce
            ? undefined
            : { x: ["-6%", "6%", "-6%"], y: ["-4%", "4%", "-4%"] }
        }
        transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }}
      >
        <FogBank id="footer-fog" freq={0.014} seed={11} />
      </motion.div>
    </div>
  );
}
