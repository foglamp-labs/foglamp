"use client";

import type { AppliedReport } from "@foglamp/contracts/instrumentation";
import type { ScanData } from "@foglamp/contracts/scan";
import { Button } from "@foglamp/ui/components/button";
import { Card, CardContent } from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAlertTriangleFilled,
  IconCircleCheckFilled,
  IconEditFilled,
  IconFileCodeFilled,
  IconFileDiffFilled,
  IconMinus,
  IconPlusFilled,
  IconWorldShare,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { diffScans } from "@/components/scan/diff";
import { KIND_STYLES } from "@/components/scan/kinds";

// The Stage 3 payoff: once the agent has applied the plan, the review page
// stops being a promise and becomes a receipt. This card renders the agent's
// AppliedReport — instrumentation coverage, what moved on the map (before
// scan vs after scan), which files were touched, and anything the agent
// flagged. Same card anatomy as the decision list: sections inside one
// scrolling content area.

/** Entries shown per foldable list before "Show N more". */
const SHOWN = 4;

function Section({
  label,
  Icon,
  iconClassName,
  children,
}: {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 px-1 first:mt-1">
      <h2 className="mb-2.5 ml-px flex items-center gap-2 text-[13px] text-muted-foreground">
        <Icon className={cn("size-3.5 mb-px", iconClassName)} />
        <span className="leading-none font-medium text-foreground">
          {label}
        </span>
      </h2>
      {children}
    </section>
  );
}

/** A list that folds behind "Show N more" past the first few entries. */
function Foldable<T>({
  items,
  render,
}: {
  items: T[];
  render: (item: T, i: number) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, SHOWN);
  const hidden = items.length - shown.length;
  return (
    <>
      <ul className="flex list-none flex-col gap-1">{shown.map(render)}</ul>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-[11px] font-medium cursor-pointer text-muted-foreground/50 hover:text-foreground"
        >
          Show {hidden} more
        </button>
      ) : null}
    </>
  );
}

export function VerificationReport({
  before,
  report,
  verified,
  spanCount,
  secondsToFirstTrace,
  shareSlug,
  onShare,
  sharing,
}: {
  /** The scan the plan was approved against — the "before" of the diff. */
  before: ScanData;
  report: AppliedReport;
  verified: boolean;
  spanCount?: number | null;
  secondsToFirstTrace?: number | null;
  /** Public /scan slug once shared; the footer flips from ask to link. */
  shareSlug?: string | null;
  onShare?: () => void;
  sharing?: boolean;
}) {
  const diff = useMemo(() => diffScans(report.scan, before), [report, before]);
  const instrumented = report.calls.filter((c) => c.instrumented).length;
  const skipped = report.calls.filter((c) => !c.instrumented);

  return (
    <Card className="flex max-h-[45%] shrink-0 flex-col overflow-hidden rounded-[36px] squircle:rounded-[36px] py-0">
      <CardContent className="scroll-fade no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5 pb-8">
        <Section
          label="What your agent did"
          Icon={IconCircleCheckFilled}
          iconClassName="text-emerald-500"
        >
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Instrumented {instrumented} of {report.calls.length} model calls
            {report.hudEnabled ? ", and enabled the dev HUD" : ""}.
            {verified && spanCount
              ? ` Your first trace landed${
                  secondsToFirstTrace
                    ? ` ${formatSeconds(secondsToFirstTrace)} later`
                    : ""
                } with ${spanCount} ${spanCount === 1 ? "span" : "spans"}.`
              : ""}
          </p>
          {skipped.length > 0 ? (
            <ul className="mt-2 flex list-none flex-col gap-1">
              {skipped.map((c) => (
                <li
                  key={c.id}
                  className="text-[11px] leading-relaxed text-muted-foreground"
                >
                  <span className="text-amber-600 dark:text-amber-400">
                    Skipped
                  </span>{" "}
                  {c.note ?? c.id}
                </li>
              ))}
            </ul>
          ) : null}
        </Section>

        {diff.hasChanges ? (
          <Section
            label="On the map"
            Icon={IconFileDiffFilled}
            iconClassName="text-muted-foreground"
          >
            <Foldable
              items={[
                ...diff.addedNodes.map((n) => ({ n, change: "added" as const })),
                ...diff.changedNodes.map((n) => ({
                  n,
                  change: "changed" as const,
                })),
                ...diff.removedNodes.map((n) => ({
                  n,
                  change: "removed" as const,
                })),
              ]}
              render={({ n, change }) => (
                <li
                  key={`${change}:${n.id}`}
                  className="flex items-center gap-2"
                >
                  {change === "added" ? (
                    <IconPlusFilled className="size-3 flex-none text-green-600 dark:text-green-400" />
                  ) : change === "changed" ? (
                    <IconEditFilled className="size-3 flex-none text-yellow-600 dark:text-yellow-400" />
                  ) : (
                    <IconMinus className="size-3 flex-none text-red-600 dark:text-red-400" />
                  )}
                  <span
                    className={cn(
                      "truncate text-[12px]",
                      change === "removed" &&
                        "text-muted-foreground line-through"
                    )}
                  >
                    {n.label}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {change === "changed"
                      ? "updated"
                      : KIND_STYLES[n.kind].label.toLowerCase()}
                  </span>
                </li>
              )}
            />
          </Section>
        ) : null}

        {report.filesChanged.length > 0 ? (
          <Section
            label={`Files changed · ${report.filesChanged.length}`}
            Icon={IconFileCodeFilled}
            iconClassName="text-muted-foreground"
          >
            <Foldable
              items={report.filesChanged}
              render={(path) => (
                <li
                  key={path}
                  className="truncate font-mono text-[10px] text-muted-foreground"
                  title={path}
                >
                  {path}
                </li>
              )}
            />
          </Section>
        ) : null}

        {report.warnings.length > 0 ? (
          <Section
            label="Heads up"
            Icon={IconAlertTriangleFilled}
            iconClassName="text-amber-500"
          >
            <ul className="flex list-none flex-col gap-1.5">
              {report.warnings.map((w) => (
                <li
                  key={w}
                  className="text-[11px] leading-relaxed text-muted-foreground"
                >
                  {w}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </CardContent>

      {onShare ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-3">
          {shareSlug ? (
            <>
              <a
                href={`/scan/${encodeURIComponent(shareSlug)}`}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium hover:underline"
              >
                <IconWorldShare className="size-3.5 flex-none text-muted-foreground" />
                <span className="truncate">View your public map</span>
              </a>
              <button
                type="button"
                onClick={onShare}
                disabled={sharing}
                className="shrink-0 cursor-pointer text-[11px] font-medium text-muted-foreground/60 hover:text-foreground disabled:cursor-default"
              >
                {sharing ? "Updating…" : "Update"}
              </button>
            </>
          ) : (
            <>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Share a public, read-only map — structure only, never code.
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0"
                onClick={onShare}
                disabled={sharing}
              >
                {sharing ? "Sharing…" : "Share"}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function formatSeconds(s: number): string {
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 5400) return `${Math.round(s / 60)}min`;
  return `${Math.round(s / 3600)}h`;
}
