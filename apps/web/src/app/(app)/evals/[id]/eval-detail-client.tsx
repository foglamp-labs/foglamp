"use client";

import { IconArrowLeft, IconGauge } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";
import Link from "next/link";
import { useMemo } from "react";

import {
  EmptyState,
  NoProject,
  PageHeader,
  StatCard,
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { formatCost, formatRelative } from "@/lib/format";
import { trpc } from "@/utils/trpc";

export function EvalDetailClient({ evalId }: { evalId: string }) {
  const { projectId } = useProject();
  // Fixed trailing-7d window for the detail summary.
  const window = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { from, to };
  }, []);

  const list = useQuery({
    ...trpc.evals.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  const series = useQuery({
    ...trpc.evals.timeseries.queryOptions({ evalId, from: window.from, to: window.to }),
    enabled: !!projectId,
  });
  const recent = useQuery({
    ...trpc.evals.recentScores.queryOptions({ evalId, limit: 50 }),
    enabled: !!projectId,
  });

  const ev = list.data?.find((e) => e.id === evalId) ?? null;

  const totals = useMemo(() => {
    const buckets = series.data ?? [];
    const count = buckets.reduce((n, b) => n + b.scoreCount, 0);
    const passes = buckets.reduce((n, b) => n + b.passCount, 0);
    const scoreSum = buckets.reduce((n, b) => n + (b.avgScore ?? 0) * b.scoreCount, 0);
    const cost = buckets.reduce((n, b) => n + (b.cost ?? 0), 0);
    const scored = buckets.filter((b) => (b.avgScore ?? null) !== null);
    const hasScores = scored.reduce((n, b) => n + b.scoreCount, 0) > 0;
    return {
      count,
      avgScore: hasScores && count > 0 ? scoreSum / count : null,
      passRate: count > 0 ? passes / count : null,
      cost,
    };
  }, [series.data]);

  const back = (
    <Button variant="outline" size="sm" render={<Link href="/evals" />}>
      <IconArrowLeft />
      Evals
    </Button>
  );

  if (!projectId) {
    return (
      <>
        <PageHeader title="Eval" actions={back} />
        <NoProject />
      </>
    );
  }

  return (
    <>
      <PageHeader title={ev?.name ?? "Eval"} description={evalId} actions={back} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Scored (7d)" value={totals.count.toLocaleString("en-US")} />
        <StatCard
          label="Avg score"
          value={totals.avgScore === null ? "—" : totals.avgScore.toFixed(2)}
        />
        <StatCard
          label="Pass rate"
          value={
            totals.passRate === null ? "—" : `${Math.round(totals.passRate * 100)}%`
          }
        />
        <StatCard label="Eval spend (7d)" value={formatCost(totals.cost)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent scores</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recent.isLoading ? (
            <TableSkeleton rows={4} />
          ) : (recent.data ?? []).length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={IconGauge}
                title="No scores yet"
                description="Scores appear here as new matching traffic is sampled and scored."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Target</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(recent.data ?? []).map((s) => (
                  <TableRow key={s.scoreId}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <Link
                        href={`/traces/${encodeURIComponent(s.traceId)}`}
                        className="hover:underline"
                      >
                        {s.targetType}:{s.targetId.slice(0, 12)}…
                      </Link>
                    </TableCell>
                    <TableCell>
                      {s.passed !== null ? (
                        <Badge variant={s.passed ? "emerald" : "rose"}>
                          {s.passed ? "pass" : "fail"}
                        </Badge>
                      ) : s.score !== null ? (
                        <span className="tabular-nums">{s.score}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                      {s.reason}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatRelative(s.scoredAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
