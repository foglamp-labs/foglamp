"use client";

import { Button } from "@foglamp/ui/components/button";
import { cn } from "@foglamp/ui/lib/utils";
import { BorderBeam } from "border-beam";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { CopyIcon } from "@/components/app/copy-icon";
import { useCopied } from "@/components/app/use-copied";
import { buildLandingPrompt } from "@/lib/agent-prompt";

// The "paste into your coding agent" prompt button, shared by the hero and the
// closing CTA. On copy, a colorful BorderBeam powers on around the button — the
// same effect (and ramp) the hero uses on its dashboard chrome — then powers
// back off once the copied flag clears.

const BEAM_TARGET = 0.6; // resting strength while a copy is fresh
const BEAM_STEP = 0.04;
const BEAM_STEP_MS = 16;

// Ramps the beam strength toward its target (on copy) or back to 0, one small
// step per frame, so it glows to life around the button rather than snapping.
// Reduced-motion users get the end state immediately.
function useCopyBeam(active: boolean, reduce: boolean) {
  const [strength, setStrength] = useState(0);
  const cur = useRef(0);
  useEffect(() => {
    const target = active ? BEAM_TARGET : 0;
    if (reduce) {
      cur.current = target;
      setStrength(target);
      return;
    }
    const id = setInterval(() => {
      const delta = target - cur.current;
      if (Math.abs(delta) <= BEAM_STEP) {
        cur.current = target;
        setStrength(target);
        clearInterval(id);
        return;
      }
      cur.current = +(cur.current + Math.sign(delta) * BEAM_STEP).toFixed(3);
      setStrength(cur.current);
    }, BEAM_STEP_MS);
    return () => clearInterval(id);
  }, [active, reduce]);
  return strength;
}

export function CopyPromptButton({ className }: { className?: string }) {
  const reduce = useReducedMotion() ?? false;
  const { copied, markCopied } = useCopied(2000);
  const strength = useCopyBeam(copied, reduce);

  const copyPrompt = () => {
    void navigator.clipboard.writeText(buildLandingPrompt());
    markCopied();
  };

  return (
    <BorderBeam
      size="pulse-inner"
      colorVariant="colorful"
      strength={strength}
      borderRadius={18}
      className="inline-flex rounded-full"
    >
      <Button
        size="lg"
        className={cn("text-base h-[37px] pl-3.5", className)}
        onClick={copyPrompt}
        aria-label="Copy the coding-agent prompt"
      >
        <CopyIcon
          copied={copied}
          className="mb-px"
          checkClassName="text-green-600 mb-px"
        />
        Copy agent prompt
      </Button>
    </BorderBeam>
  );
}
