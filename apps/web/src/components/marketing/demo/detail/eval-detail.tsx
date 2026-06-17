"use client";

import { Badge } from "@foglamp/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";
import {
  IconAffiliate,
  IconBoltFilled,
  IconCircleCheckFilled,
  IconCoinFilled,
  IconFileCode,
  IconForbidFilled,
  IconGaugeFilled,
  IconSparkles,
  IconStack2,
} from "@tabler/icons-react";

import { navItem } from "@/components/app/nav";
import { StatCard } from "@/components/app/page-parts";
import { formatCost } from "@/lib/format";

import { DetailHeader } from "../demo-chrome";
import { useDemo } from "../demo-context";
import { EVAL_SAMPLES, EVALS } from "../mock-data";

// Parse a compact count string ("2.1k") back to an integer so we can price the
// judge spend. Code checks are deterministic and free.
function parseScored(scored: string): number {
  const s = scored.trim().toLowerCase();
  if (s.endsWith("k")) return Math.round(parseFloat(s) * 1000);
  return Math.round(parseFloat(s));
}

// The samples list carries no timestamp; stamp plausible relative labels so the
// "When" column reads like the real recent-scores table.
const SAMPLE_WHEN = ["30s ago", "1m ago", "3m ago", "5m ago"];

export function EvalDetail({ evalId }: { evalId: string }) {
  const { closeDetail } = useDemo();
  const e = EVALS.find((x) => x.id === evalId) ?? EVALS[0]!;
  const evalsNav = navItem("/evals")!;
  const isCode = e.type === "code";

  // LLM judges bill per scored trace; code checks run for free.
  const spend = isCode ? 0 : parseScored(e.scored) * 0.00032;

  return (
    <>
      <DetailHeader
        backIcon={evalsNav.icon}
        backLabel="Evals"
        backIconClassName={evalsNav.iconClassName}
        title={e.name}
        description={e.id}
        onBack={closeDetail}
      />

      {/* Definition chips: the check, what it runs on, and the sample rate. */}
      <div className="-mt-1 flex flex-wrap items-center gap-2">
        {isCode ? (
          <Badge variant="secondary">
            <IconFileCode />
            Code check
          </Badge>
        ) : (
          <Badge variant="violet">
            <IconSparkles />
            LLM judge
          </Badge>
        )}
        <Badge variant="secondary">
          {isCode ? <IconStack2 /> : <IconAffiliate />}
          {isCode ? "span" : "trace"}
        </Badge>
        <Badge variant="secondary">{isCode ? "100%" : "10%"} sampled</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={IconBoltFilled}
          iconClassName="text-violet-300 dark:text-violet-700"
          size="sm"
          label="Scored"
          value={e.scored}
        />
        <StatCard
          icon={IconGaugeFilled}
          iconClassName="text-fuchsia-300 dark:text-fuchsia-700"
          size="sm"
          label="Avg score"
          value={e.avgScore.toFixed(2)}
        />
        <StatCard
          icon={IconCircleCheckFilled}
          iconClassName="text-emerald-300 dark:text-emerald-700"
          size="sm"
          label="Pass rate"
          value={`${Math.round(e.passRate * 100)}%`}
        />
        <StatCard
          icon={IconCoinFilled}
          iconClassName="text-yellow-300 dark:text-yellow-600"
          size="sm"
          label="Eval spend"
          value={formatCost(spend, 4)}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Recent scores</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-72">Target</TableHead>
              <TableHead className="w-28">Score</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="w-32 text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {EVAL_SAMPLES.map((s, i) => (
              <TableRow key={s.traceId}>
                <TableCell className="max-w-96 truncate font-mono text-xs text-muted-foreground">
                  {s.traceId}
                </TableCell>
                <TableCell>
                  <Badge variant={s.verdict === "pass" ? "emerald" : "rose"}>
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
                  {SAMPLE_WHEN[i] ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
