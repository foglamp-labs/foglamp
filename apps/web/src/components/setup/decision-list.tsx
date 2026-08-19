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
import { type ComponentType, useState } from "react";

// What Foglamp decided, and why — one card, all sections, scrolling inside
// itself so the page never scrolls. Each section opens with its first few
// entries and a "Show N more" toggle; the point of the fold is that five good
// names prove the agent understood the repo better than a wall of 33 does.
// Read-only for now; editing is the next stage.

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

interface Entry {
  key: string;
  name: string;
  detail?: string;
  sourceRef?: string;
  rationale: string;
  confidence: Confidence;
}

function Section({
  label,
  Icon,
  entries,
}: {
  label: string;
  Icon: ComponentType<IconProps>;
  entries: Entry[];
}) {
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) return null;
  const shown = expanded ? entries : entries.slice(0, SHOWN);
  const hidden = entries.length - shown.length;

  return (
    <section className="border-b border-border/50 last:border-b-0">
      {/* Sticky so the section you're scrolled into stays named. */}
      <h2 className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/50 bg-card px-4 py-2.5 text-xs text-muted-foreground">
        <Icon className="size-3 opacity-60" />
        <span className="leading-none">
          {label} ({entries.length})
        </span>
      </h2>
      <ul className="list-none">
        {shown.map((e) => (
          <Row
            key={e.key}
            name={e.name}
            detail={e.detail}
            sourceRef={e.sourceRef}
            rationale={e.rationale}
            confidence={e.confidence}
          />
        ))}
      </ul>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
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
    <Card className="min-h-0 flex-1 overflow-hidden rounded-[28px] squircle:rounded-[28px] py-0">
      <CardContent className="no-scrollbar h-full overflow-y-auto p-0">
        <Section
          label="Agents"
          Icon={IconAiAgent}
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
          Icon={IconRoute}
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
