"use client";

import { Button } from "@foglamp/ui/components/button";
import { cn } from "@foglamp/ui/lib/utils";
import { BorderBeam } from "border-beam";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { CopyIcon } from "@/components/app/copy-icon";
import { useCopied } from "@/components/app/use-copied";
import { ClaudeCodeLogo, OpenAILogo } from "@/components/brand-logos";
import { buildLandingPrompt } from "@/lib/agent-prompt";
import { captureActivationEvent } from "@/lib/analytics";

// The "paste into your coding agent" prompt button, shared by the hero and the
// closing CTA. On copy, a colorful BorderBeam powers on around the button, the
// same effect (and ramp) the hero uses on its dashboard chrome, then powers
// back off once the copied flag clears.

const BEAM_TARGET = 100; // resting strength while a copy is fresh
const BEAM_MS = 900; // how long the beam stays on; the check lingers longer
const BEAM_STEP = 0.05;
const BEAM_STEP_MS = 15;

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

export function CopyPromptButton({
  className,
  hero,
}: {
  className?: string;
  hero?: boolean;
}) {
  const reduce = useReducedMotion() ?? false;
  const { copied, markCopied } = useCopied(2000);
  // The beam runs on its own, shorter clock than the check icon: a quick
  // flash of confirmation, not a glow for the whole copied window.
  const { copied: beamOn, markCopied: markBeam } = useCopied(BEAM_MS);
  const strength = useCopyBeam(beamOn, reduce);

  const copyPrompt = () => {
    void navigator.clipboard.writeText(buildLandingPrompt());
    captureActivationEvent("instrumentation_prompt_copied", {
      surface: "homepage",
    });
    markCopied();
    markBeam();
  };

  return (
    <BorderBeam
      size="pulse-inner"
      colorVariant="colorful"
      strength={strength}
      borderRadius={999}
      className="inline-flex"
    >
      <Button
        size="lg"
        className={cn(
          "text-base h-10 px-4 shadow-none hover:bg-neutral-800 hover:dark:bg-neutral-200",
          className
        )}
        onClick={copyPrompt}
        aria-label="Copy the coding-agent prompt"
      >
        {/* The agents the prompt is for, then the label, then the copy
            affordance that flips to a check while a copy is fresh. */}
        <span className="flex items-center gap-1.5 mr-0.5">
          <OpenAILogo
            className={`${hero ? "size-3" : "size-3.5"} text-neutral-200 dark:text-neutral-800`}
          />
          <ClaudeCodeLogo className={`${hero ? "size-4.5" : "size-5"}`} />
        </span>
        Copy agent prompt
        <CopyIcon
          copied={copied}
          className={`${hero ? "size-3.5" : "size-4"} ml-0.5 mt-px text-neutral-400 dark:text-neutral-600`}
          // Inverted greens: the default Button flips its bg against the theme.
          checkClassName={`${hero ? "size-3.5" : "size-4"} text-green-400 dark:text-green-600 ml-0.5 mt-px`}
        />
      </Button>
    </BorderBeam>
  );
}
