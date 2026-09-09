"use client";

import { cn } from "@foglamp/ui/lib/utils";
import type { ReactNode } from "react";

import { FAMILY_CHIP, presetMeta } from "@/app/(app)/evals/preset-meta";

// Shared pieces for the benefit figures: two small product-styled parts and
// the mock data the costs cards draw from.

/** The colored check chip the eval pages use for a preset. */
export function CheckChip({
  presetId,
  className,
}: {
  presetId: string;
  className?: string;
}) {
  const { icon: Icon, family } = presetMeta(presetId);
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-md corner-squircle",
        FAMILY_CHIP[family],
        className
      )}
    >
      <Icon className="size-3" />
    </span>
  );
}

// ─── Mock data ──────────────────────────────────────────────────────────────

export const MODELS = [
  { id: "gpt-5.6-sol", cost: 512.4, color: "#10a37f" },
  { id: "claude-fable-5", cost: 284.1, color: "#d97757" },
  { id: "gemini-3.5-flash", cost: 45.67, color: "#1ba1e3" },
  { id: "glm-5", cost: 38.2, color: "#9ca3af" },
] as const;

export const AGENTS = [
  { name: "research-planner", cost: 318.2 },
  { name: "support-triage", cost: 214.8 },
  { name: "code-reviewer", cost: 196.4 },
  { name: "email-drafter", cost: 58.1 },
] as const;

export const CUSTOMERS = [
  { id: "cus_acme", name: "Acme Inc", cost: 241.6 },
  { id: "cus_globex", name: "Globex", cost: 188.3 },
  { id: "cus_umbrella", name: "Umbrella", cost: 74.2 },
] as const;

/** Deterministic jitter in [0, 1). */
export function noise(i: number, seed: number): number {
  const x = Math.sin(i * 113.9 + seed * 271.3) * 43758.5453;
  return x - Math.floor(x);
}
