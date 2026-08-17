"use client";

import type { Confidence, DetectedPlan } from "@foglamp/contracts/instrumentation";
import { Card, CardContent } from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAiAgent,
  IconMessages,
  type IconProps,
  IconRoute,
  IconUsers,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

// What Foglamp decided, and why. Read-only for now: this pass is about making
// the reasoning visible before code changes land, not about editing it.
//
// Each row answers the three questions a user actually has — what will this be
// called, where did you find it, and how sure are you.

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  high: "text-emerald-600 dark:text-emerald-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-muted-foreground",
};

function ConfidenceDot({ level }: { level: Confidence }) {
  return (
    <span
      className={cn("flex items-center gap-1 text-[10px]", CONFIDENCE_STYLE[level])}
      title={`${level} confidence`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {level}
    </span>
  );
}

function Row({
  name,
  detail,
  sourceRef,
  rationale,
  confidence,
}: {
  name: string;
  detail?: string;
  sourceRef?: string;
  rationale: string;
  confidence: Confidence;
}) {
  return (
    <li className="border-b border-border/50 px-4 py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate font-mono text-xs font-medium">{name}</span>
        <ConfidenceDot level={confidence} />
      </div>
      {detail ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
      ) : null}
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {rationale}
      </p>
      {sourceRef ? (
        <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/70">
          {sourceRef}
        </p>
      ) : null}
    </li>
  );
}

function Group({
  label,
  Icon,
  count,
  children,
}: {
  label: string;
  Icon: ComponentType<IconProps>;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <Icon className="size-3 opacity-60" />
        <span className="leading-none">
          {label} ({count})
        </span>
      </h2>
      <Card className="overflow-hidden rounded-[20px] squircle:rounded-[20px] py-0">
        <CardContent className="p-0">
          <ul className="list-none">{children}</ul>
        </CardContent>
      </Card>
    </section>
  );
}

export function DecisionList({ plan }: { plan: DetectedPlan }) {
  const { agents, workflows, sessions, customer } = plan.decisions;
  const callById = new Map(plan.calls.map((c) => [c.id, c]));
  const callCount = (ids: string[]) =>
    `${ids.length} call${ids.length === 1 ? "" : "s"}`;

  return (
    <div className="flex flex-col gap-5">
      <Group label="Agents" Icon={IconAiAgent} count={agents.length}>
        {agents.map((a) => (
          <Row
            key={a.id}
            name={a.name}
            detail={`${a.oneOff ? "One-off trace" : "Agent"} · ${callCount(a.callIds)}`}
            sourceRef={a.sourceRef}
            rationale={a.rationale}
            confidence={a.confidence}
          />
        ))}
      </Group>

      <Group label="Workflows" Icon={IconRoute} count={workflows.length}>
        {workflows.map((w) => (
          <Row
            key={w.id}
            name={w.name}
            detail={`${callCount(w.callIds)} · run id from ${w.runIdSource}`}
            sourceRef={w.sourceRef}
            rationale={w.rationale}
            confidence={w.confidence}
          />
        ))}
      </Group>

      <Group label="Conversations" Icon={IconMessages} count={sessions.length}>
        {sessions.map((s) => (
          <Row
            key={s.id}
            name={s.label}
            detail={`${callCount(s.callIds)} · thread id from ${s.sessionIdSource}`}
            sourceRef={s.sourceRef}
            rationale={s.rationale}
            confidence={s.confidence}
          />
        ))}
      </Group>

      {/* Always shown, including the "no" answer — a user should be able to see
          that per-customer attribution was considered and deliberately skipped. */}
      <Group label="Customer attribution" Icon={IconUsers} count={1}>
        <Row
          name={customer.recommended ? "Enabled" : "Not recommended"}
          detail={
            customer.recommended && customer.idSource
              ? `Customer id from ${customer.idSource}`
              : undefined
          }
          rationale={customer.rationale}
          confidence={customer.confidence}
        />
      </Group>

      {plan.calls.length > 0 ? (
        <p className="px-1 text-[11px] text-muted-foreground">
          {plan.calls.length} model call
          {plan.calls.length === 1 ? "" : "s"} found across{" "}
          {new Set([...callById.values()].map((c) => c.sourceRef.split(":")[0])).size}{" "}
          files.
        </p>
      ) : null}
    </div>
  );
}
