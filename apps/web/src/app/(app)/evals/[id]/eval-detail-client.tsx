"use client";

import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@foglamp/ui/components/dialog";
import { Field, FieldLabel } from "@foglamp/ui/components/field";
import { Input } from "@foglamp/ui/components/input";
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
  IconGauge,
  IconGaugeFilled,
  IconPencilFilled,
  IconStack2,
  IconTargetArrow,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/app/copy-button";
import {
  PaginationFooter,
  SortableHead,
  useTableSort,
} from "@/components/app/data-table";
import {
  useDelayedLoading,
  useEntranceOnce,
  useSkeletonShown,
} from "@/components/app/hooks";
import { navItem } from "@/components/app/nav";
import {
  EmptyState,
  NoProject,
  PageHeader,
  StatCard,
  TableSkeleton,
} from "@/components/app/page-parts";
import { PayloadView } from "@/components/app/payload-view";
import { useProject } from "@/components/app/project-context";
import { useRange } from "@/components/app/range-context";
import { RangeControl } from "@/components/app/range-picker";
import { RelativeTime } from "@/components/app/relative-time";
import { formatCost } from "@/lib/format";
import { type RouterOutputs, trpc } from "@/utils/trpc";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import {
  EvalSettingsFields,
  type Provider,
  promptOverrideError,
  settingsParamError,
} from "../eval-settings-fields";
import { presetBadgeVariant, presetMeta } from "../preset-meta";

type ScoreRow = RouterOutputs["evals"]["recentScores"]["scores"][number];

const PAGE_SIZES = [25, 50, 100];

// Edit-dialog draft: the eval's name plus the subset the "How should it
// score?" fields can change (judge model + sample rate, or a check's params).
type EditDraft = {
  name: string;
  judgeModel: string;
  judgeProvider: Provider;
  sampleRate: string;
  substring: string;
  pattern: string;
  maxChars: string;
  promptOverride: string;
};

export function EvalDetailClient({ evalId }: { evalId: string }) {
  const entrance = useEntranceOnce();
  const { projectId } = useProject();
  const qc = useQueryClient();
  // Shared time window drives the summary cards (the picker sits by the
  // "Recent scores" header below).
  const { range, setRange } = useRange();
  // A `?score=` deep-link (e.g. from a trace's Scores panel) focuses one run:
  // the matching row auto-expands and scrolls into view.
  const searchParams = useSearchParams();
  const focusScore = searchParams.get("score");
  // Which score row is expanded to glimpse its trace input/output.
  const [expanded, setExpanded] = useState<string | null>(focusScore);
  const focusRef = useRef<HTMLTableRowElement>(null);
  // Current page of the recent-scores table (0-based).
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  // Score-column sort (server-side, since the table is paginated). `null` keeps
  // the default recency order.
  const { sort, toggle } = useTableSort<"score">();
  // Edit dialog: open state + the draft seeded from the eval when opened.
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<EditDraft>({
    name: "",
    judgeModel: "",
    judgeProvider: "google",
    sampleRate: "0.1",
    substring: "",
    pattern: "",
    maxChars: "4000",
    promptOverride: "",
  });

  const list = useQuery({
    ...trpc.evals.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  const presets = useQuery(trpc.evals.presets.queryOptions());
  const providerKeys = useQuery({
    ...trpc.providerKeys.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  const series = useQuery({
    ...trpc.evals.timeseries.queryOptions({
      evalId,
      from: range.from,
      to: range.to,
    }),
    enabled: !!projectId,
  });
  // Reset to the first page when the eval or range changes.
  useEffect(() => setPage(0), [evalId, range, sort]);

  const recent = useQuery({
    ...trpc.evals.recentScores.queryOptions({
      evalId,
      limit: pageSize,
      offset: page * pageSize,
      from: range.from,
      to: range.to,
      sort: sort ? { field: "score", dir: sort.dir } : undefined,
    }),
    enabled: !!projectId,
    // Keep the current page visible while the range/page change refetches.
    placeholderData: (prev) => prev,
  });
  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  const showRecentSkeleton = useDelayedLoading(recent.isLoading);
  // Latch for the entrance fade (see useSkeletonShown): the scores table only
  // fades in if it never painted a skeleton first.
  const recentSkeletonShown = useSkeletonShown(showRecentSkeleton);

  // The deep-linked run, fetched by id directly — so it shows even when it
  // falls outside the active range or current page.
  const focused = useQuery({
    ...trpc.evals.score.queryOptions({ evalId, scoreId: focusScore ?? "" }),
    enabled: !!projectId && !!focusScore,
  });

  const scores = recent.data?.scores ?? [];
  const scoreTotal = recent.data?.total ?? 0;
  // Pin the focused run above the table only when it isn't already on this page
  // (otherwise the in-table highlight below already surfaces it).
  const focusInPage = focusScore
    ? scores.some((s) => s.scoreId === focusScore)
    : false;
  const pinnedScore = focusScore && !focusInPage ? focused.data : null;
  // Once the deep-linked run is present in the loaded page, scroll it into view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run as scores load
  useEffect(() => {
    if (focusScore && focusRef.current) {
      focusRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusScore, scores]);
  const ev = list.data?.find((e) => e.id === evalId) ?? null;

  const update = useMutation(
    trpc.evals.update.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.evals.list.queryKey() });
        setEditOpen(false);
        toast.success("Eval updated");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const configuredProviders = new Set(
    (providerKeys.data?.keys ?? []).map((k) => k.provider)
  );

  // Seed the draft from the current eval, then open the dialog.
  const openEdit = () => {
    if (!ev) return;
    const params = (ev.config?.params ?? {}) as Record<string, unknown>;
    const presetDefault =
      presets.data?.find((p) => p.id === ev.presetId)?.prompt ?? "";
    setDraft({
      name: ev.name,
      judgeModel: ev.model?.modelId ?? "",
      judgeProvider: (ev.model?.provider as Provider) ?? "google",
      sampleRate: String(ev.sampleRate),
      substring: params.substring != null ? String(params.substring) : "",
      pattern: params.pattern != null ? String(params.pattern) : "",
      maxChars: params.maxChars != null ? String(params.maxChars) : "4000",
      // Prefill with the saved override, else the preset default (editable).
      promptOverride: ev.config?.promptOverride ?? presetDefault,
    });
    setEditOpen(true);
  };

  const isJudge = ev?.scorerSource === "llm";
  const needsKey = isJudge && !configuredProviders.has(draft.judgeProvider);

  const saveEdit = () => {
    if (!ev) return;
    const params: Record<string, unknown> = {};
    if (ev.presetId === "contains" || ev.presetId === "not_contains")
      params.substring = draft.substring;
    if (ev.presetId === "regex_match") params.pattern = draft.pattern;
    if (ev.presetId === "max_length") params.maxChars = Number(draft.maxChars);

    // Rebuild config from scratch (preserving the contextSpec this dialog
    // doesn't touch) so reverting a prompt override back to the default
    // actually clears it. Keep an override only when it differs from default.
    const presetDefault =
      presets.data?.find((p) => p.id === ev.presetId)?.prompt ?? "";
    const prompt = draft.promptOverride.trim();
    const config: {
      promptOverride?: string;
      params?: Record<string, unknown>;
      contextSpec?: Record<string, unknown>;
    } = {};
    if (ev.config?.contextSpec) config.contextSpec = ev.config.contextSpec;
    if (Object.keys(params).length) config.params = params;
    if (isJudge && prompt && prompt !== presetDefault.trim())
      config.promptOverride = prompt;

    update.mutate({
      evalId,
      name: draft.name.trim(),
      sampleRate: Number(draft.sampleRate),
      model: isJudge
        ? { provider: draft.judgeProvider, modelId: draft.judgeModel.trim() }
        : undefined,
      config,
    });
  };

  // Friendly preset name for the check badge (falls back to a titled id).
  const checkName = useMemo(() => {
    if (!ev) return "";
    const p = presets.data?.find((x) => x.id === ev.presetId);
    return (
      p?.name ??
      ev.presetId.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
    );
  }, [presets.data, ev]);

  // Same per-preset icon the evals table uses for its Check column.
  const CheckIcon = ev ? presetMeta(ev.presetId).outline : IconGauge;

  const totals = useMemo(() => {
    const buckets = series.data ?? [];
    const count = buckets.reduce((n, b) => n + b.scoreCount, 0);
    const passes = buckets.reduce((n, b) => n + b.passCount, 0);
    // Pass rate over rows with a verdict only — score-only rows (numeric
    // judges) carry no pass/fail and would deflate the rate.
    const verdicts = buckets.reduce((n, b) => n + b.verdictCount, 0);
    // avgScore is per-bucket over non-null scores only, so re-weight by
    // scoredCount (not scoreCount) to recover the exact overall average.
    const scored = buckets.reduce((n, b) => n + b.scoredCount, 0);
    const scoreSum = buckets.reduce(
      (n, b) => n + (b.avgScore ?? 0) * b.scoredCount,
      0
    );
    const cost = buckets.reduce((n, b) => n + (b.cost ?? 0), 0);
    return {
      count,
      avgScore: scored > 0 ? scoreSum / scored : null,
      passRate: verdicts > 0 ? passes / verdicts : null,
      cost,
    };
  }, [series.data]);

  const back = navItem("/evals");

  if (!projectId) {
    return (
      <>
        <PageHeader title="Eval" back={back} />
        <NoProject />
      </>
    );
  }

  return (
    <>
      {/* Wrapped here (not inside a shared header component) so the copy
			    rendered by loading.tsx stays unanimated — only the page's own
			    header fades. */}
      <div className={cn(entrance && "page-fade-in")}>
        <PageHeader
          title={ev?.name ?? "Eval"}
          back={back}
          titleTrailing={
            <CopyButton
              value={evalId}
              title="Copy eval ID"
              iconSize="size-3.5"
              className="p-0.5"
            />
          }
          actions={
            <>
              <RangeControl value={range} onChange={setRange} />
              {/* Always rendered (disabled until the eval loads) so it doesn't
                  pop in — loading.tsx paints the same disabled button. */}
              <Button variant="secondary" disabled={!ev} onClick={openEdit}>
                <IconPencilFilled />
                Edit
              </Button>
            </>
          }
        />
      </div>

      {/* Definition chips: the check, what it runs on, and the sample rate. */}
      {ev && (
        <div
          className={cn(
            "-mt-1 flex flex-wrap items-center gap-2 px-8",
            entrance && "page-fade-in"
          )}
        >
          <Badge variant={presetBadgeVariant(ev.presetId)}>
            <CheckIcon />
            {checkName}
          </Badge>
          <Badge variant="secondary">
            {ev.targetLevel === "span" ? <IconStack2 /> : <IconAffiliate />}
            {ev.targetLevel}
          </Badge>
          <Badge variant="secondary">
            {`${Math.round(ev.sampleRate * 100)}%`} sampled
          </Badge>
        </div>
      )}

      <div
        className={cn(
          "grid gap-4 sm:grid-cols-2 lg:grid-cols-4 px-8",
          entrance && "page-fade-in"
        )}
      >
        <StatCard
          icon={IconBoltFilled}
          iconClassName="text-orange-500 dark:text-orange-500"
          size="sm"
          label="Scored"
          value={totals.count}
          formatValue={(n) => Math.round(n).toLocaleString("en-US")}
        />
        <StatCard
          icon={IconGaugeFilled}
          iconClassName="text-fuchsia-500 dark:text-fuchsia-500"
          size="sm"
          label="Avg score"
          value={totals.avgScore ?? "—"}
          formatValue={(n) => n.toFixed(2)}
        />
        <StatCard
          icon={IconCircleCheckFilled}
          iconClassName="text-emerald-500 dark:text-emerald-500"
          size="sm"
          label="Pass rate"
          value={totals.passRate ?? "—"}
          formatValue={(n) => `${Math.round(n * 100)}%`}
        />
        <StatCard
          icon={IconCoinFilled}
          iconClassName="text-yellow-400 dark:text-yellow-500"
          size="sm"
          label="Eval spend"
          value={totals.cost ?? "—"}
          formatValue={(n) => formatCost(n, 4)}
        />
      </div>

      <div className="flex flex-col gap-3">
        {pinnedScore && (
          <div className="px-8">
            <FocusedRun score={pinnedScore} projectId={projectId} />
          </div>
        )}
        {recent.isLoading ? (
          showRecentSkeleton ? (
            <div className={cn(entrance && "page-fade-in")}>
              <TableSkeleton rows={4} />
            </div>
          ) : null
        ) : scores.length === 0 ? (
          <EmptyState
            icon={IconGauge}
            title="No scores yet"
            description="Scores appear here as new matching traffic is sampled and scored."
            className={cn(
              entrance && !recentSkeletonShown && "page-fade-in",
              "px-40"
            )}
          />
        ) : (
          // Keep the footer flush with the table's last row, matching the
          // other paginated main tables.
          <div
            className={cn(
              "flex flex-col",
              entrance && !recentSkeletonShown && "page-fade-in"
            )}
          >
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
                  const isOpen = expanded === s.scoreId;
                  const isFocused = s.scoreId === focusScore;
                  return (
                    <Fragment key={s.scoreId}>
                      <TableRow
                        ref={isFocused ? focusRef : undefined}
                        interactive
                        onClick={() => setExpanded(isOpen ? null : s.scoreId)}
                        className={cn(
                          isFocused &&
                            "shadow-[inset_2px_0_0_0_var(--color-primary)]"
                        )}
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
                              {s.targetType}:{s.targetId}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {s.passed !== null ? (
                            <Badge variant={s.passed ? "emerald" : "rose"}>
                              {s.passed ? (
                                <IconCircleCheckFilled />
                              ) : (
                                <IconForbidFilled />
                              )}
                              {s.passed ? "pass" : "fail"}
                            </Badge>
                          ) : s.score !== null ? (
                            <Badge variant="secondary">
                              <IconGauge />
                              <span className="tabular-nums">
                                {s.score.toFixed(2)}
                              </span>
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <span className="line-clamp-2 whitespace-normal">
                            {s.reason}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          <RelativeTime value={s.scoredAt} />
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <ScoreDetail
                          score={s}
                          projectId={projectId}
                          colSpan={4}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>

            <PaginationFooter
              page={page}
              pageSize={pageSize}
              total={scoreTotal}
              shown={scores.length}
              noun={["run", "runs"]}
              isFetching={recent.isFetching}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(0);
              }}
              pageSizes={PAGE_SIZES}
            />
          </div>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit eval</DialogTitle>
            <DialogDescription>
              {isJudge
                ? "Change the judge model and how often it scores."
                : "Adjust the check and how often it runs."}
            </DialogDescription>
          </DialogHeader>
          {ev && (
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input
                value={draft.name}
                maxLength={200}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value }))
                }
              />
            </Field>
          )}
          {ev && (
            <EvalSettingsFields
              preset={{ id: ev.presetId, source: ev.scorerSource }}
              judgeModel={draft.judgeModel}
              judgeProvider={draft.judgeProvider}
              sampleRate={draft.sampleRate}
              substring={draft.substring}
              pattern={draft.pattern}
              maxChars={draft.maxChars}
              promptOverride={draft.promptOverride}
              defaultPrompt={
                presets.data?.find((p) => p.id === ev.presetId)?.prompt ??
                undefined
              }
              configuredProviders={configuredProviders}
              onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
              segmentedLayoutId="edit-sample-rate-pill"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                update.isPending ||
                needsKey ||
                !draft.name.trim() ||
                (isJudge && !draft.judgeModel.trim()) ||
                !!settingsParamError(ev ? { id: ev.presetId } : null, {
                  substring: draft.substring,
                  pattern: draft.pattern,
                  maxChars: draft.maxChars,
                }) ||
                !!promptOverrideError(
                  ev ? { id: ev.presetId, source: ev.scorerSource } : null,
                  draft.promptOverride
                )
              }
              onClick={saveEdit}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Expanded row: lazy-fetches the score's trace and shows a glimpse of the
 * scored target's input/output (the span for span-level scores, the whole run
 * for trace-level), plus a deep link into the full trace at that span. */
function ScoreDetail({
  score,
  projectId,
  colSpan,
}: {
  score: ScoreRow;
  projectId: string;
  colSpan: number;
}) {
  const detail = useQuery(
    trpc.traces.get.queryOptions({ projectId, traceId: score.traceId })
  );
  const spans = detail.data?.spans ?? [];
  // Span score → that exact span; trace score → the root span (whole run).
  const target =
    score.targetType === "span"
      ? spans.find((s) => s.spanId === score.targetId)
      : undefined;
  const root = spans.find((s) => !s.parentSpanId) ?? spans[0];
  const glimpse = target ?? root;

  const href =
    score.targetType === "span"
      ? `/traces/${encodeURIComponent(score.traceId)}?span=${encodeURIComponent(
          score.targetId
        )}`
      : `/traces/${encodeURIComponent(score.traceId)}`;

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="bg-muted/30 p-0">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-4">
            {score.reason && (
              <div className="flex min-w-0 max-w-[80%] flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Reason
                </span>
                <p className="whitespace-normal wrap-break-word text-sm">
                  {score.reason}
                </p>
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              // biome-ignore lint/suspicious/noExplicitAny: typed-routes string href
              render={<Link href={href as any} />}
            >
              See full trace
              <IconArrowUpRight />
            </Button>
          </div>
          {detail.isLoading ? (
            <span className="text-xs text-muted-foreground">
              Loading trace…
            </span>
          ) : !glimpse ? (
            <span className="text-xs text-muted-foreground">
              Trace payload unavailable.
            </span>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Glimpse label="Input" value={glimpse.input} />
              <Glimpse label="Output" value={glimpse.output} />
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

/** The deep-linked run, pinned above the table. Mirrors an expanded ScoreDetail
 * but stands alone (with a primary accent) so a targeted score is always shown,
 * even when it's outside the active range or on another page. */
function FocusedRun({
  score,
  projectId,
}: {
  score: ScoreRow;
  projectId: string;
}) {
  const detail = useQuery(
    trpc.traces.get.queryOptions({ projectId, traceId: score.traceId })
  );
  const spans = detail.data?.spans ?? [];
  const target =
    score.targetType === "span"
      ? spans.find((s) => s.spanId === score.targetId)
      : undefined;
  const root = spans.find((s) => !s.parentSpanId) ?? spans[0];
  const glimpse = target ?? root;

  const href =
    score.targetType === "span"
      ? `/traces/${encodeURIComponent(score.traceId)}?span=${encodeURIComponent(
          score.targetId
        )}`
      : `/traces/${encodeURIComponent(score.traceId)}`;

  return (
    <Card size="sm">
      <CardHeader className="flex items-center gap-2 w-full">
        <CardTitle className="w-full">Focused run</CardTitle>
        <div className="flex items-center gap-2 w-full justify-end">
          <span className="text-xs text-muted-foreground tabular-nums">
            <RelativeTime value={score.scoredAt} />
          </span>
          {score.passed !== null ? (
            <Badge variant={score.passed ? "emerald" : "rose"}>
              {score.passed ? <IconCircleCheckFilled /> : <IconForbidFilled />}
              {score.passed ? "pass" : "fail"}
            </Badge>
          ) : score.score !== null ? (
            <Badge variant="secondary">
              <IconGauge />
              <span className="tabular-nums">{score.score.toFixed(2)}</span>
            </Badge>
          ) : null}

          <Button
            size="sm"
            variant="outline"
            // biome-ignore lint/suspicious/noExplicitAny: typed-routes string href
            render={<Link href={href as any} />}
          >
            See full trace
            <IconArrowUpRight />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {score.reason && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Reason
            </span>
            <p className="text-sm">{score.reason}</p>
          </div>
        )}
        {detail.isLoading ? (
          <span className="text-xs text-muted-foreground">Loading trace…</span>
        ) : !glimpse ? (
          <span className="text-xs text-muted-foreground">
            Trace payload unavailable.
          </span>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Glimpse label="Input" value={glimpse.input} />
            <Glimpse label="Output" value={glimpse.output} />
          </div>
        )}
      </CardContent>
    </Card>
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
          <PayloadView value={value} />
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </div>
  );
}
