"use client";

import { Button } from "@foglamp/ui/components/button";
import { cn } from "@foglamp/ui/lib/utils";
import { BorderBeam } from "border-beam";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { CopyIcon } from "@/components/app/copy-icon";
import { useCopied } from "@/components/app/use-copied";
import { SCAN_PROMPT } from "@/lib/scan-prompt";

// The scan page's "paste into your coding agent" button — same power-on
// BorderBeam as the landing page's CopyPromptButton, but it copies the
// codebase-scan extraction prompt.

const BEAM_TARGET = 1;
const BEAM_STEP = 0.04;
const BEAM_STEP_MS = 16;

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

export function CopyScanPromptButton({ className }: { className?: string }) {
  const reduce = useReducedMotion() ?? false;
  const { copied, markCopied } = useCopied(2000);
  const strength = useCopyBeam(copied, reduce);

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
        className={cn("text-base h-[37px] pl-4", className)}
        onClick={() => {
          void navigator.clipboard.writeText(SCAN_PROMPT);
          markCopied();
        }}
        aria-label="Copy the scan prompt"
      >
        <CopyIcon
          copied={copied}
          className="size-4"
          checkClassName="size-4 text-green-600 mt-px"
        />
        Copy scan prompt
      </Button>
    </BorderBeam>
  );
}
