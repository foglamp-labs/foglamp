"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@foglamp/ui/components/alert";
import { Button } from "@foglamp/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAffiliateFilled,
  IconAlertTriangle,
  IconArrowUpRight,
  IconBoltFilled,
  IconCircleCheckFilled,
  IconCoinFilled,
  IconForbidFilled,
  IconGaugeFilled,
  IconPencilFilled,
  IconPercentage,
  IconStack2Filled,
} from "@tabler/icons-react";
import { Fragment, useState } from "react";

import { FAMILY_ICON, presetMeta } from "@/app/(app)/evals/preset-meta";
import { AgentIcon } from "@/components/app/agent-icon";
import { DRAWER_BUTTON_CLASS } from "@/components/app/button-styles";
import {
  PaginationFooter,
  SortableHead,
  sortRows,
  useTableSort,
} from "@/components/app/data-table";
import { HeatCell } from "@/components/app/heat-cell";
import { CopyButton } from "@/components/app/copy-button";
import { StatCard } from "@/components/app/page-parts";
import {
  Bubble,
  DrawerColumns,
  DrawerRow,
  ExpandChevron,
  Meta,
  OPEN_ROW_CLASS,
} from "@/components/app/run-exchange";
import { formatCost, formatCostFixed } from "@/lib/format";

import { DemoContextChip, DemoRange, DetailHeader } from "../demo-chrome";
import { useDemo } from "../demo-context";
import { EVAL_SAMPLES, EVALS, quintiles, TRACE_MESSAGES } from "../mock-data";

const SAMPLE_WHEN = ["2m ago", "9m ago", "31m ago", "1h ago"];

type SampleRow = (typeof EVAL_SAMPLES)[number] & { when: string };

const SAMPLES: SampleRow[] = EVAL_SAMPLES.map((s, i) => ({
  ...s,
  when: SAMPLE_WHEN[i] ?? "2h ago",
}));

const SPEND_QUANTILES = quintiles(SAMPLES.map((s) => s.cost));

export function EvalDetail({ evalId }: { evalId: string }) {
  const { closeDetail, openDetail } = useDemo();
  const ev = EVALS.find((e) => e.id === evalId) ?? EVALS[0]!;

  // Which score row is expanded to glimpse its trace input/output.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(25);
  const { sort, toggle } = useTableSort<"score">();

  const { icon: CheckIcon, family } = presetMeta(ev.presetId);
  const scores = sortRows<SampleRow, "score">(SAMPLES, sort, {
    score: (s) => s.score,
  });

  // Rough scored count for the stat strip ("2.4k" → 2400).
  const scoredCount = Math.round(Number.parseFloat(ev.scored) * 1000);

  return (
    <>
      <DetailHeader
        backHref="/evals"
        title={ev.name}
        titleTrailing={
          <CopyButton
            value={ev.id}
            title="Copy eval ID"
            iconSize="size-3.5"
            className="p-0.5"
          />
        }
        onBack={closeDetail}
      />

      {/* Definition chips: the check, what it runs on, the sample rate, and
          (when scoped to one agent) a link to that agent's filter. */}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <DemoContextChip
            icon={CheckIcon}
            iconClassName={FAMILY_ICON[family]}
            label={ev.presetName}
          />
          <DemoContextChip
            icon={ev.level === "span" ? IconStack2Filled : IconAffiliateFilled}
            label={ev.level === "span" ? "Span" : "Trace"}
          />
          <DemoContextChip
            icon={IconPercentage}
            label={`${ev.sample}% sampled`}
          />
          {ev.agentName && (
            <DemoContextChip
              icon={(p) => (
                <AgentIcon
                  name={ev.agentName!}
                  filled
                  className={p.className}
                />
              )}
              label={ev.agentName}
              onClick={() => openDetail({ type: "agent", id: ev.agentName! })}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <DemoRange />
          <Button variant="secondary">
            <IconPencilFilled className="mb-px" />
            Edit
          </Button>
        </div>
      </div>

      {/* Scoring health: when the eval can't score (dead jobs, no provider
          key) say so up front with the reason. */}
      {ev.status !== "ok" && (
        <div className="px-6">
          <Alert variant="destructive">
            <IconAlertTriangle />
            <AlertTitle>
              {ev.status === "paused_no_key"
                ? "Scoring is paused"
                : "Scoring is failing"}
            </AlertTitle>
            <AlertDescription>
              {ev.status === "paused_no_key"
                ? "Add an API key for the judge model's provider in the organization settings to resume."
                : "Recent scoring jobs failed. It will retry on the next sweep."}
            </AlertDescription>
          </Alert>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 px-6">
        <StatCard
          icon={IconCircleCheckFilled}
          iconClassName="text-emerald-500 dark:text-emerald-500"
          size="sm"
          label="Pass rate"
          value={ev.passRate}
          formatValue={(n) => `${Math.round(n * 100)}%`}
        />
        <StatCard
          icon={IconGaugeFilled}
          iconClassName="text-fuchsia-400 dark:text-fuchsia-500"
          size="sm"
          label="Avg score"
          value={ev.avgScore}
          formatValue={(n) => n.toFixed(2)}
        />
        <StatCard
          icon={IconCoinFilled}
          iconClassName="text-amber-400 dark:text-yellow-500"
          size="sm"
          label="Eval spend"
          value={ev.spend}
          formatValue={(n) => formatCost(n, 4)}
        />
        <StatCard
          icon={IconBoltFilled}
          iconClassName="text-orange-500 dark:text-orange-500"
          size="sm"
          label="Scored"
          value={scoredCount}
          formatValue={(n) => Math.round(n).toLocaleString("en-US")}
        />
      </div>

      <div className="flex flex-col gap-3">
        {/* Keep the footer flush with the table's last row, matching the
					    other paginated main tables. */}
        <div className="flex flex-col">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-96">Run</TableHead>
                <TableHead className="w-20">Verdict</TableHead>
                <SortableHead
                  sortKey="score"
                  sort={sort}
                  onSort={toggle}
                  className="w-20 text-right"
                >
                  Score
                </SortableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="w-24 text-right">Cost</TableHead>
                <TableHead className="w-32 text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scores.map((s) => {
                const isOpen = expanded === s.traceId;
                return (
                  <Fragment key={s.traceId}>
                    <TableRow
                      interactive
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : s.traceId)}
                      // Open row + drawer read as one unit: no divider between them.
                      className={cn("group", isOpen && OPEN_ROW_CLASS)}
                    >
                      <TableCell className="h-12 font-normal">
                        <div className="flex items-center gap-2">
                          <ExpandChevron open={isOpen} />
                          <span className="truncate">{s.traceId}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-sm font-medium",
                            s.verdict === "pass"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400",
                          )}
                        >
                          {s.verdict === "pass" ? (
                            <IconCircleCheckFilled className="size-3.25" />
                          ) : (
                            <IconForbidFilled className="size-3.25" />
                          )}
                          {s.verdict === "pass" ? "Pass" : "Fail"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span
                          className={cn(
                            s.verdict === "fail"
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {s.score.toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-0 text-muted-foreground">
                        <span className="block truncate">{s.note}</span>
                      </TableCell>
                      <HeatCell
                        value={s.cost}
                        thresholds={SPEND_QUANTILES}
                        metric="spend"
                        mutedWhenZero
                      >
                        {formatCostFixed(s.cost, 4)}
                      </HeatCell>
                      <TableCell className="text-right text-muted-foreground">
                        {s.when}
                      </TableCell>
                    </TableRow>
                    {isOpen && <ScoreDetail score={s} colSpan={6} />}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>

          <PaginationFooter
            page={0}
            pageSize={pageSize}
            total={scores.length}
            shown={scores.length}
            noun={["run", "runs"]}
            onPageChange={() => {}}
            onPageSizeChange={setPageSize}
            pageSizes={[25, 50, 100]}
          />
        </div>
      </div>
    </>
  );
}

/** Expanded row: the judgment (verdict, score, reason, and a few facts) on the
 * left, the scored exchange laid out like a session on the right, with a deep
 * link into the full trace. Mirrors the real page's judgment + conversation
 * layout — the conversation starts under the Verdict column above it. */
function ScoreDetail({
  score,
  colSpan,
}: {
  score: SampleRow;
  colSpan: number;
}) {
  const { openDetail } = useDemo();
  const input = TRACE_MESSAGES.find((m) => m.role === "user")?.content;
  const output = TRACE_MESSAGES.find((m) => m.role === "assistant")?.content;

  return (
    <DrawerRow colSpan={colSpan} className="pt-6">
      <DrawerColumns
        overview={
          <>
            <div className="flex flex-col gap-2">
              <div className="flex h-5 flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-sm font-medium",
                    score.verdict === "pass"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400",
                  )}
                >
                  {score.verdict === "pass" ? (
                    <IconCircleCheckFilled className="size-3.25" />
                  ) : (
                    <IconForbidFilled className="size-3.25" />
                  )}
                  {score.verdict === "pass" ? "Pass" : "Fail"}
                </span>
                <span
                  className={cn(
                    "text-sm tabular-nums",
                    score.score >= 0.9
                      ? "text-emerald-600 dark:text-emerald-400"
                      : score.score < 0.5
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-foreground",
                  )}
                >
                  {score.score.toFixed(2)}
                </span>
              </div>
              <p className="whitespace-normal wrap-break-word text-balance text-[13px] leading-relaxed">
                {score.note}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Meta label="Scored" value={score.when} className="col-span-2" />
              <Meta
                label="Cost"
                value={formatCost(score.cost, 4)}
                className="col-span-2"
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              className={cn("w-fit", DRAWER_BUTTON_CLASS)}
              onClick={() => openDetail({ type: "trace", id: score.traceId })}
            >
              <IconAffiliateFilled className="text-[#8b5e34] dark:text-[#c9a888]" />
              See trace
              <IconArrowUpRight className="mt-px" />
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {input ? <Bubble who="user" text={input} /> : null}
          {output ? <Bubble who="assistant" text={output} /> : null}
        </div>
      </DrawerColumns>
    </DrawerRow>
  );
}
