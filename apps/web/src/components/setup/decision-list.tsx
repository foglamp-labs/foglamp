"use client";

import type { Confidence, DetectedPlan } from "@foglamp/contracts/instrumentation";
import { Card, CardContent } from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconGhostFilled,
  IconMessages,
  type IconProps,
  IconSitemapFilled,
  IconUsers,
} from "@tabler/icons-react";
import { type ComponentType, useState } from "react";

// What Foglamp decided, and why — one card, styled like the scan's left rail:
// airy sections instead of bordered rows, all scrolling inside the card so the
// page never scrolls. Each section opens with its first few entries and a
// "Show N more" toggle. Read-only for now; editing is the next stage.

/** Entries shown per section before folding behind "Show N more". */
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

interface Entry {
  key: string;
  name: string;
  detail?: string;
  sourceRef?: string;
  rationale: string;
  confidence: Confidence;
}

function Row({ entry }: { entry: Entry }) {
  return (
    <li className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium">{entry.name}</span>
        <ConfidenceDot level={entry.confidence} />
      </div>
      {entry.detail ? (
        <p className="text-[11px] text-muted-foreground">{entry.detail}</p>
      ) : null}
      <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
        {entry.rationale}
      </p>
      {entry.sourceRef ? (
        <p className="truncate font-mono text-[10px] text-muted-foreground/60">
          {entry.sourceRef}
        </p>
      ) : null}
    </li>
  );
}

function Section({
  label,
  Icon,
  iconClassName,
  entries,
}: {
  label: string;
  Icon: ComponentType<IconProps>;
  /** Map vocabulary: the same tint this thing carries on the flow map. */
  iconClassName: string;
  entries: Entry[];
}) {
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) return null;
  const shown = expanded ? entries : entries.slice(0, SHOWN);
  const hidden = entries.length - shown.length;

  return (
    <section className="mt-8 px-1 first:mt-1">
      <h2 className="mb-3 ml-px flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={cn("size-[12px]", iconClassName)} />
        <span className="leading-none">
          {label} ({entries.length})
        </span>
      </h2>
      <ul className="flex list-none flex-col gap-4">
        {shown.map((e) => (
          <Row key={e.key} entry={e} />
        ))}
      </ul>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Show {hidden} more
        </button>
      ) : null}
    </section>
  );
}

export function DecisionList({ plan }: { plan: DetectedPlan }) {
  const { agents, workflows, sessions, customer } = plan.decisions;

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[36px] squircle:rounded-[36px] py-0">
      {/* Scroll (and all vertical padding) lives on the content so the fade
          mask reaches the card edges and dissolves rows, not the card. */}
      <CardContent className="scroll-fade no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5 pb-10">
        <Section
          label="Agents"
          Icon={IconGhostFilled}
          iconClassName="text-orange-500"
          entries={agents.map((a) => ({
            key: a.id,
            name: a.name,
            detail: a.oneOff ? "One-off trace" : undefined,
            sourceRef: a.sourceRef,
            rationale: a.rationale,
            confidence: a.confidence,
          }))}
        />
        <Section
          label="Workflows"
          Icon={IconSitemapFilled}
          iconClassName="text-emerald-500"
          entries={workflows.map((w) => ({
            key: w.id,
            name: w.name,
            detail: `Run id from ${w.runIdSource}`,
            sourceRef: w.sourceRef,
            rationale: w.rationale,
            confidence: w.confidence,
          }))}
        />
        <Section
          label="Conversations"
          Icon={IconMessages}
          iconClassName="text-sky-500"
          entries={sessions.map((s) => ({
            key: s.id,
            name: s.label,
            detail: `Thread id from ${s.sessionIdSource}`,
            sourceRef: s.sourceRef,
            rationale: s.rationale,
            confidence: s.confidence,
          }))}
        />
        {/* Always shown, including the "no" answer — a user should be able to
            see that per-customer attribution was considered and skipped. */}
        <Section
          label="Customer attribution"
          Icon={IconUsers}
          iconClassName="text-violet-500"
          entries={[
            {
              key: "customer",
              name: customer.recommended ? "Enabled" : "Not recommended",
              detail:
                customer.recommended && customer.idSource
                  ? `Customer id from ${customer.idSource}`
                  : undefined,
              rationale: customer.rationale,
              confidence: customer.confidence,
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
