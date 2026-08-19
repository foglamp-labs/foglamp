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

// What Foglamp decided, and why — compact on purpose. This column exists to
// prove the agent understood the repo, not to enumerate it: each section shows
// its first few entries and a "+N more" line, and the map is the real browser
// of everything. Read-only for now; editing is the next stage.

/** Entries shown per section before folding into "+N more". */
const SHOWN = 4;

// Confidence renders only when it's a warning. A green "high" on every row is
// noise; an amber "medium"/"low" is exactly the row the user should read
// before approving.
function ConfidenceDot({ level }: { level: Confidence }) {
  if (level === "high") return null;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 text-[10px]",
        level === "medium" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
      )}
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
    <li className="border-b border-border/50 px-4 py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate font-mono text-xs font-medium">{name}</span>
        <ConfidenceDot level={confidence} />
      </div>
      {detail ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
      ) : null}
      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
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

function More({ hidden }: { hidden: number }) {
  if (hidden <= 0) return null;
  return (
    <li className="px-4 py-2 text-[11px] text-muted-foreground/70">
      + {hidden} more — all of them are on the map.
    </li>
  );
}

export function DecisionList({ plan }: { plan: DetectedPlan }) {
  const { agents, workflows, sessions, customer } = plan.decisions;

  return (
    <div className="flex flex-col gap-4">
      <Group label="Agents" Icon={IconAiAgent} count={agents.length}>
        {agents.slice(0, SHOWN).map((a) => (
          <Row
            key={a.id}
            name={a.name}
            detail={a.oneOff ? "One-off trace" : undefined}
            sourceRef={a.sourceRef}
            rationale={a.rationale}
            confidence={a.confidence}
          />
        ))}
        <More hidden={agents.length - SHOWN} />
      </Group>

      <Group label="Workflows" Icon={IconRoute} count={workflows.length}>
        {workflows.slice(0, SHOWN).map((w) => (
          <Row
            key={w.id}
            name={w.name}
            detail={`Run id from ${w.runIdSource}`}
            sourceRef={w.sourceRef}
            rationale={w.rationale}
            confidence={w.confidence}
          />
        ))}
        <More hidden={workflows.length - SHOWN} />
      </Group>

      <Group label="Conversations" Icon={IconMessages} count={sessions.length}>
        {sessions.slice(0, SHOWN).map((s) => (
          <Row
            key={s.id}
            name={s.label}
            detail={`Thread id from ${s.sessionIdSource}`}
            sourceRef={s.sourceRef}
            rationale={s.rationale}
            confidence={s.confidence}
          />
        ))}
        <More hidden={sessions.length - SHOWN} />
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
    </div>
  );
}
