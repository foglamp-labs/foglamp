"use client";

import type { DetectedPlan } from "@foglamp/contracts/instrumentation";
import { Card, CardContent } from "@foglamp/ui/components/card";

// The headline: what Foglamp found, in one sentence. This is the first thing
// the user reads, and it does the job the old onboarding never did — it proves
// the agent actually understood the codebase before anything gets changed.

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "4 agents, 2 workflows, 1 conversation flow, and 13 model calls" */
function phrase(parts: string[]): string {
  if (parts.length === 0) return "nothing to instrument yet";
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

export function SetupSummary({ plan }: { plan: DetectedPlan }) {
  const parts: string[] = [];
  const { agents, workflows, sessions } = plan.decisions;
  if (agents.length) parts.push(plural(agents.length, "agent"));
  if (workflows.length) parts.push(plural(workflows.length, "workflow"));
  if (sessions.length) parts.push(plural(sessions.length, "conversation flow"));
  if (plan.calls.length) parts.push(plural(plan.calls.length, "model call"));

  return (
    <Card className="rounded-[28px] squircle:rounded-[28px]">
      <CardContent className="px-5 py-4">
        <h1 className="font-display text-base leading-snug font-semibold tracking-tight">
          Foglamp found {phrase(parts)}.
        </h1>
        <p className="mt-1.5 text-xs text-muted-foreground">
          In {plan.scan.project.name}, using AI SDK v{plan.sdk.major}. Review the plan
          below, then approve it to let your coding agent instrument these.
        </p>
      </CardContent>
    </Card>
  );
}
