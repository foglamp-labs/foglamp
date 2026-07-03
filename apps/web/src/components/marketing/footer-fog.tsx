"use client";

import { motion, useReducedMotion } from "motion/react";

import { FogBank } from "./noise-overlay";

// A thin, slow fog band hugging the footer's bottom edge — it fades out just
// under the copyright row. Very low opacity; reduced-motion users get it still.
export function FooterFog() {
  const reduce = useReducedMotion() ?? false;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-24 opacity-30"
      style={{
        WebkitMaskImage: "linear-gradient(to top, #000 30%, transparent)",
        maskImage: "linear-gradient(to top, #000 30%, transparent)",
      }}
    >
      <motion.div
        className="absolute inset-[-30%]"
        style={{ filter: "blur(14px)" }}
        animate={reduce ? undefined : { x: ["-2%", "3%", "-2%"] }}
        transition={{ duration: 40, repeat: Infinity, ease: "easeInOut" }}
      >
        <FogBank id="footer-fog" freq={0.014} seed={11} />
      </motion.div>
    </div>
  );
}
