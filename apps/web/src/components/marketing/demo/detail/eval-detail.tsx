"use client";

import { Badge } from "@foglamp/ui/components/badge";
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
  IconAffiliate,
  IconArrowUpRight,
  IconBoltFilled,
  IconChevronRight,
  IconCircleCheckFilled,
  IconCoinFilled,
  IconForbidFilled,
  IconGaugeFilled,
  IconPencilFilled,
  IconStack2,
} from "@tabler/icons-react";
import { Fragment, useState } from "react";

import { presetMeta } from "@/app/(app)/evals/preset-meta";
import { CopyButton } from "@/components/app/copy-button";
import {
  PaginationFooter,
  SortableHead,
  sortRows,
  useTableSort,
} from "@/components/app/data-table";
import { StatCard } from "@/components/app/page-parts";
import { formatCost } from "@/lib/format";

import { DemoRange, DetailHeader } from "../demo-chrome";
import { useDemo } from "../demo-context";
import { EVAL_SAMPLES, EVALS, TRACE_MESSAGES } from "../mock-data";

const SAMPLE_WHEN = ["2m ago", "9m ago", "31m ago", "1h ago"];

type SampleRow = (typeof EVAL_SAMPLES)[number] & { when: string };

const SAMPLES: SampleRow[] = EVAL_SAMPLES.map((s, i) => ({
  ...s,
  when: SAMPLE_WHEN[i] ?? "2h ago",
}));

export function EvalDetail({ evalId }: { evalId: string }) {
  const { closeDetail } = useDemo();
  const ev = EVALS.find((e) => e.id === evalId) ?? EVALS[0]!;

  // Which score row is expanded to glimpse its trace input/output.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(25);
  const { sort, toggle } = useTableSort<"score">();

  const CheckIcon = presetMeta(ev.presetId).outline;
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
        actions={
          <>
            <DemoRange />
            <Button variant="secondary">
              <IconPencilFilled />
              Edit
            </Button>
          </>
        }
        onBack={closeDetail}
      />

      {/* Definition chips: the check, what it runs on, and the sample rate. */}
      <div className="-mt-1 flex flex-wrap items-center gap-2 px-8">
        <Badge variant={ev.type === "llm-judge" ? "violet" : "secondary"}>
          <CheckIcon />
          {ev.presetName}
        </Badge>
        <Badge variant="secondary">
          {ev.level === "span" ? <IconStack2 /> : <IconAffiliate />}
          {ev.level}
        </Badge>
        <Badge variant="secondary">{ev.sample}% sampled</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 px-8">
        <StatCard
          icon={IconBoltFilled}
          iconClassName="text-orange-500 dark:text-orange-500"
          size="sm"
          label="Scored"
          value={scoredCount}
          formatValue={(n) => Math.round(n).toLocaleString("en-US")}
        />
        <StatCard
          icon={IconGaugeFilled}
          iconClassName="text-fuchsia-500 dark:text-fuchsia-500"
          size="sm"
          label="Avg score"
          value={ev.avgScore}
          formatValue={(n) => n.toFixed(2)}
        />
        <StatCard
          icon={IconCircleCheckFilled}
          iconClassName="text-emerald-500 dark:text-emerald-500"
          size="sm"
          label="Pass rate"
          value={ev.passRate}
          formatValue={(n) => `${Math.round(n * 100)}%`}
        />
        <StatCard
          icon={IconCoinFilled}
          iconClassName="text-yellow-400 dark:text-yellow-500"
          size="sm"
          label="Eval spend"
          value={ev.spend}
          formatValue={(n) => formatCost(n, 4)}
        />
      </div>

      <div className="flex flex-col gap-3">
        {/* Keep the footer flush with the table's last row, matching the
				    other paginated main tables. */}
        <div className="flex flex-col">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-72">Target</TableHead>
                <SortableHead
                  sortKey="score"
                  sort={sort}
                  onSort={toggle}
                  className="w-28"
                >
                  Score
                </SortableHead>
                <TableHead>Reason</TableHead>
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
                      onClick={() => setExpanded(isOpen ? null : s.traceId)}
                    >
                      <TableCell className="max-w-96 text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <IconChevronRight
                            className={cn(
                              "size-3.5 shrink-0 transition-transform",
                              isOpen && "rotate-90"
                            )}
                          />
                          <span className="truncate font-mono text-xs">
                            trace:{s.traceId}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={s.verdict === "pass" ? "emerald" : "rose"}
                        >
                          {s.verdict === "pass" ? (
                            <IconCircleCheckFilled />
                          ) : (
                            <IconForbidFilled />
                          )}
                          {s.verdict}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <span className="line-clamp-2 whitespace-normal">
                          {s.note}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {s.when}
                      </TableCell>
                    </TableRow>
                    {isOpen && <ScoreDetail score={s} colSpan={4} />}
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

/** Expanded row: shows the score's reason plus a glimpse of the scored run's
 * input/output, with a deep link into the full trace. Mirrors the real page's
 * ScoreDetail. */
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
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="bg-muted/30 p-0">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 max-w-[80%] flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Reason
              </span>
              <p className="whitespace-normal wrap-break-word text-sm">
                {score.note}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => openDetail({ type: "trace", id: score.traceId })}
            >
              See full trace
              <IconArrowUpRight />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Glimpse label="Input" value={input} />
            <Glimpse label="Output" value={output} />
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

function Glimpse({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {value ? (
        <div className="max-h-64 overflow-x-hidden overflow-y-auto rounded-md bg-muted p-2.5">
          <p className="text-[13px] whitespace-pre-wrap wrap-break-word">
            {value}
          </p>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </div>
  );
}
