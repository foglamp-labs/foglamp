"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@foglamp/ui/components/alert";
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
import { Skeleton } from "@foglamp/ui/components/skeleton";
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
  IconChevronRight,
  IconCircleCheckFilled,
  IconCoinFilled,
  IconForbidFilled,
  IconGauge,
  IconGaugeFilled,
  IconScaleFilled,
  IconGhostFilled,
  IconPencilFilled,
  IconPercentage,
  IconScissors,
  IconTool,
  IconStack2Filled,
  IconTargetArrow,
  IconUserFilled,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

import { AgentIcon } from "@/components/app/agent-icon";
import { ContextChip } from "@/components/app/context-chip";
import { CopyButton } from "@/components/app/copy-button";
import {
  PaginationFooter,
  SortableHead,
  useTableSort,
} from "@/components/app/data-table";
import { HeatCell } from "@/components/app/heat-cell";
import {
  useDelayedLoading,
  useEntranceOnce,
  useSkeletonShown,
} from "@/components/app/hooks";
import { markdownComponents } from "@/components/app/markdown";
import { navItem } from "@/components/app/nav";
import {
  EmptyState,
  NoProject,
  PageHeader,
  StatCard,
  TableRowsSkeleton,
} from "@/components/app/page-parts";
import {
  type Message,
  type Part,
  fromHumanized,
  toMessages,
} from "@/components/app/payload-messages";
import { useProject } from "@/components/app/project-context";
import { formatModelName, ModelLogo } from "@/components/model-logo";
import { useRange } from "@/components/app/range-context";
import { RangeControl } from "@/components/app/range-picker";
import { RelativeTime } from "@/components/app/relative-time";
import { formatCost, formatDateTime } from "@/lib/format";
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
import { FAMILY_ICON, presetMeta } from "../preset-meta";
import { EvalChipPlaceholders } from "./chip-placeholders";

type ScoreRow = RouterOutputs["evals"]["recentScores"]["scores"][number];
// The deep-linked run comes from `evals.score`, which has no headline snippet.
type BaseScoreRow = Omit<ScoreRow, "userMessage">;

const PAGE_SIZES = [25, 50, 100];

// Skeleton column spec for the loading body rows (see TableRowsSkeleton).
const SKELETON_COLS = [
  { icon: true, w: "w-64" },
  { w: "w-10" },
  { w: "w-72" },
  { align: "right", w: "w-12" },
  { align: "right", w: "w-14" },
] as const;

/** 20/40/60/80th percentile thresholds (positive values only) for HeatCell. */
function quintiles(values: number[]): number[] {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (v.length === 0) return [];
  return [0.2, 0.4, 0.6, 0.8].map((q) => v[Math.floor(q * (v.length - 1))]!);
}

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
  const CheckIcon = ev ? presetMeta(ev.presetId).icon : IconGaugeFilled;

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

  // Per-page spend quintiles for the Cost heat cell (the table is paginated,
  // so thresholds are relative to the visible page).
  const spendThresholds = useMemo(
    () => quintiles(scores.map((s) => s.cost ?? 0)),
    [scores]
  );

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
        <PageHeader title={ev?.name ?? "Eval"} back={back} />
      </div>

      {/* Definition chips (the check, what it runs on, the sample rate) on the
          left — same pills as the session page's context chips — with the
          range picker and Edit button aligned on the same row. Chip-shaped
          placeholders hold the layout until the eval loads; loading.tsx paints
          the same row. */}
      <div
        className={cn(
          "mt-1 flex flex-wrap items-center justify-between gap-2 text-xs px-7",
          entrance && "page-fade-in"
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {ev ? (
            <>
              <ContextChip
                icon={CheckIcon}
                iconClassName={cn(
                  "mb-px",
                  FAMILY_ICON[presetMeta(ev.presetId).family]
                )}
                label={checkName}
              />
              <ContextChip
                icon={
                  ev.targetLevel === "span"
                    ? IconStack2Filled
                    : IconAffiliateFilled
                }
                label={ev.targetLevel === "span" ? "Span" : "Trace"}
              />
              <ContextChip
                icon={IconPercentage}
                label={`${Math.round(ev.sampleRate * 100)}% sampled`}
              />
              {ev.filters?.agentName && (
                <ContextChip
                  href={`/agents/${encodeURIComponent(ev.filters.agentName)}`}
                  icon={(p) => (
                    <AgentIcon
                      name={ev.filters?.agentName ?? ""}
                      filled
                      className={p.className}
                    />
                  )}
                  iconClassName=""
                  label={ev.filters.agentName}
                />
              )}
            </>
          ) : (
            <EvalChipPlaceholders />
          )}
        </div>
        <div className="flex items-center gap-2">
          <RangeControl value={range} onChange={setRange} />
          <Button variant="secondary" disabled={!ev} onClick={openEdit}>
            <IconPencilFilled className="mb-px" />
            Edit
          </Button>
        </div>
      </div>

      {/* Scoring health: when the worker can't score this eval (dead jobs, no
          provider key) say so up front with the actual reason. */}
      {ev && ev.status !== "ok" && (
        <div className={cn("px-7", entrance && "page-fade-in")}>
          <Alert variant="destructive">
            <IconAlertTriangle />
            <AlertTitle>
              {ev.status === "paused_no_key"
                ? "Scoring is paused"
                : "Scoring is failing"}
            </AlertTitle>
            <AlertDescription className="break-words">
              {ev.status === "paused_no_key"
                ? "Add an API key for the judge model's provider in the organization settings to resume."
                : (ev.lastError ??
                  "Recent scoring jobs failed. It will retry on the next sweep.")}
            </AlertDescription>
          </Alert>
        </div>
      )}

      <div
        className={cn(
          "grid gap-4 sm:grid-cols-2 lg:grid-cols-4 px-7",
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
        {!recent.isLoading && scores.length === 0 ? (
          <div
            className={cn(
              "px-7",
              entrance && !recentSkeletonShown && "page-fade-in"
            )}
          >
            <EmptyState
              icon={IconGauge}
              title="No scores yet"
              description="Scores appear here as new matching traffic is sampled and scored."
            />
          </div>
        ) : (
          // The table (header included) is mounted while loading, with
          // skeleton rows in the body, so the fallback → data swap doesn't
          // reflow. Footer flush with the last row, like the other main tables.
          <div
            className={cn(
              "flex flex-col",
              entrance && !recentSkeletonShown && "page-fade-in"
            )}
          >
            <Table className="table-fixed" stickyHeader>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-96">Run</TableHead>
                  <SortableHead
                    sortKey="score"
                    sort={sort}
                    onSort={toggle}
                    className="w-24"
                  >
                    Verdict
                  </SortableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="w-24 text-right">Cost</TableHead>
                  <TableHead className="w-32 text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.isLoading ? (
                  showRecentSkeleton ? (
                    <TableRowsSkeleton cols={SKELETON_COLS} />
                  ) : null
                ) : (
                  scores.map((s) => {
                    const isOpen = expanded === s.scoreId;
                    const isFocused = s.scoreId === focusScore;
                    return (
                      <Fragment key={s.scoreId}>
                        <TableRow
                          ref={isFocused ? focusRef : undefined}
                          interactive
                          aria-expanded={isOpen}
                          onClick={() => setExpanded(isOpen ? null : s.scoreId)}
                          className={cn(
                            "group",
                            // Open row + drawer read as one unit: no divider between them.
                            isOpen &&
                              "border-b-0 bg-card data-interactive:hover:bg-card",
                            // Deep-linked run: a soft tint (same as a selected
                            // preset card) rather than an edge bar.
                            isFocused &&
                              "bg-primary/5 dark:bg-primary/10 data-interactive:hover:bg-primary/10 dark:data-interactive:hover:bg-primary/15"
                          )}
                        >
                          {/* Content-first, like the traces list: the trace's user
                            message, falling back to the id. */}
                          <TableCell className="h-12 font-medium">
                            <div className="flex items-center gap-2">
                              {/* Expand affordance (agents page convention): muted chevron
                                that brightens on hover and turns when open. */}
                              <IconChevronRight
                                className={cn(
                                  "size-3.5 shrink-0 text-muted-foreground/50 transition-[transform,color] group-hover:text-muted-foreground",
                                  isOpen && "rotate-90 text-muted-foreground"
                                )}
                              />
                              <span className="truncate">
                                {s.userMessage ?? s.traceId}
                              </span>
                            </div>
                          </TableCell>
                          {/* Colored text, no pill — same weight in every row. */}
                          <TableCell>
                            {s.passed !== null ? (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 text-sm font-medium",
                                  s.passed
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-rose-600 dark:text-rose-400"
                                )}
                              >
                                {s.passed ? (
                                  <IconCircleCheckFilled className="size-3.25" />
                                ) : (
                                  <IconForbidFilled className="size-3.25" />
                                )}
                                {s.passed ? "Pass" : "Fail"}
                              </span>
                            ) : s.score !== null ? (
                              <span
                                className={cn(
                                  "tabular-nums",
                                  s.score >= 0.9
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : s.score < 0.5 &&
                                        "text-rose-600 dark:text-rose-400"
                                )}
                              >
                                {s.score.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-0 text-muted-foreground">
                            <span className="block truncate">{s.reason}</span>
                          </TableCell>
                          <HeatCell
                            value={s.cost}
                            thresholds={spendThresholds}
                            metric="spend"
                            mutedWhenZero
                          >
                            {s.cost == null || s.cost <= 0
                              ? "—"
                              : formatCost(s.cost, 4)}
                          </HeatCell>
                          <TableCell className="text-right text-muted-foreground">
                            <RelativeTime value={s.scoredAt} />
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <ScoreDetail
                            score={s}
                            projectId={projectId}
                            colSpan={5}
                          />
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {!recent.isLoading && (
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
            )}
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
  score: BaseScoreRow;
  projectId: string;
  colSpan: number;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      {/* px-8 matches the row cells' inset so the drawer's content lines up
          with the row text; the hairline + tint make it read as a drawer
          under the open row. */}
      <TableCell colSpan={colSpan} className="bg-card px-8 pt-2 pb-8">
        <RunExchange score={score} projectId={projectId} />
      </TableCell>
    </TableRow>
  );
}

/** Two columns: the judgment on the left as labelled fields (the same
 * treatment as the trace detail panel), the scored exchange on the right laid
 * out like a session — the user's turn in a bubble, the answer as prose. */
function RunExchange({
  score,
  projectId,
}: {
  score: BaseScoreRow;
  projectId: string;
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

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <Judgment score={score} showReason={!judged} />
      <div className="min-w-0 flex-1">
        {judged ? (
          <JudgeInput score={score} />
        ) : detail.isLoading ? (
          <ConversationSkeleton />
        ) : !glimpse ? (
          <span className="text-xs text-muted-foreground">
            Trace payload unavailable.
          </span>
        ) : (
          <Conversation
            input={glimpse.input}
            output={glimpse.output}
            emptyHint={emptyOutputHint(spans)}
  // A judged run shows the exact prompt the model graded (rendered from the
  // eval's template) rather than the trace's transcript — that's what the
  // reason refers to. Code checks and skipped rows keep the conversation.
  const judged = score.scorer === "llm" && score.label !== "skipped";
          />
        )}
      </div>
    </div>
  );
}

function Meta({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-[13px] tabular-nums">{value}</span>
    </div>
  );
}
/** The right column for a judged run: the exact material the judge graded,
 * laid out in the order the template presents it. Instruction text reads as
 * the rubric; each placeholder becomes a labelled section rendered the same
 * way the trace's own exchange is (transcript for the input, a bubble for the
 * output), so an empty field is a visible gap rather than a blank line in a
 * wall of prompt. The judge's reason sits right above the output it is
 * about; the raw prompt stays available at the bottom. */
function JudgeInput({ score }: { score: BaseScoreRow }) {
  const q = useQuery(
    trpc.evals.judgeInput.queryOptions({
      evalId: score.evalId,
      scoreId: score.scoreId,
    })
  );
  if (q.isLoading) return <JudgeInputSkeleton />;
  const d = q.data;
  if (!d || !d.prompt) {
    return (
      <span className="text-xs text-muted-foreground">
        Judge input unavailable. The trace may have expired.
      </span>
    );
  }
  const { text: reason } = splitReason(score.reason);
  const PresetIcon = presetMeta(d.preset.id).icon;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <PresetIcon className="size-3 shrink-0" />
          {d.preset.name}
        </span>
        {d.truncated && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            truncated before judging
          </span>
        )}
      </div>

      {d.segments.map((seg, i) =>
        seg.kind === "text" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional template segments
          <JudgeSection key={`t${i}`} label="Rubric">
            <p className="whitespace-pre-wrap wrap-break-word text-[13px] leading-relaxed text-muted-foreground">
              {seg.text}
            </p>
          </JudgeSection>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional template segments
          <JudgeSection key={`f${i}`} label={FIELD_LABEL[seg.field]}>
            <JudgeField
              field={seg.field}
              value={d.fields[seg.field]}
              reason={seg.field === "output" ? reason : undefined}
            />
          </JudgeSection>
        )
      )}

      <details className="group/raw">
        <summary className="flex h-5 cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <IconChevronRight className="size-3.5 transition-transform group-open/raw:rotate-90" />
          Raw prompt
        </summary>
        <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
          {d.prompt}
        </pre>
      </details>
    </div>
  );
}

const FIELD_LABEL = {
  input: "Input",
  output: "Output",
  context: "Context",
  reference: "Reference",
  tools: "Tools",
} as const;

/** What the judge would have been missing. Same wording as the worker's skip
 * reasons so a near-miss reads like the skipped rows in the table. */
const FIELD_EMPTY = {
  input: "No input was captured for this run.",
  output: "The run has no output to grade.",
  context: "No retrieved context found in the trace.",
  reference: "No reference answer in the trace metadata.",
  tools: "No tool calls in this run.",
} as const;

function JudgeSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function JudgeField({
  field,
  value,
  reason,
}: {
  field: keyof typeof FIELD_LABEL;
  value: string | undefined;
  reason?: string;
}) {
  const text = value?.trim() ?? "";
  if (!text) {
    return (
      <p className="text-[13px] text-rose-600 italic dark:text-rose-400">
        {FIELD_EMPTY[field]}
      </p>
    );
  }
  if (field === "input") return <Transcript input={text} />;
  if (field === "output") {
    return (
      <div className="flex flex-col gap-4">
        {reason && (
          <div className="rounded-lg border border-dashed px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <IconScaleFilled className="size-3 shrink-0 mb-px" />
              Judge's reason
            </span>
            <p className="mt-1 whitespace-pre-wrap wrap-break-word text-[13px] leading-relaxed">
              {reason}
            </p>
          </div>
        )}
        <Bubble who="assistant" text={text} />
      </div>
    );
  }
  return (
    <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed">
      {text}
    </pre>
  );
}


/** The left column: verdict, score, judge, cost, when, what was scored, and
 * the full reason — each under a field label, like a trace's overview. */
function Judgment({
  score,
  showReason = true,
}: {
  score: BaseScoreRow;
  showReason?: boolean;
}) {
  const { text, truncated } = splitReason(score.reason);
  const isSpan = score.targetType === "span";
  const href = isSpan
    ? `/traces/${encodeURIComponent(score.traceId)}?span=${encodeURIComponent(
        score.targetId
      )}`
    : `/traces/${encodeURIComponent(score.traceId)}`;
  const showCost = score.cost != null && score.cost > 0;
  return (
    // w-88 + the 2rem column gap = the table's w-96 Run column, so the
    // conversation starts under the Verdict cell above it.
    <div className="flex shrink-0 flex-col gap-4 lg:w-88">
      <div className="flex flex-col gap-2">
        <div className="flex h-5 flex-wrap items-center gap-2">
          {/* Same plain verdict/score treatment as the table cell. */}
          {score.passed !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-sm font-medium",
                score.passed
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              )}
            >
              {score.passed ? (
                <IconCircleCheckFilled className="size-3.25" />
              ) : (
                <IconForbidFilled className="size-3.25" />
              )}
              {score.passed ? "Pass" : "Fail"}
            </span>
          )}
          {score.score !== null && (
            <span
              className={cn(
                "text-sm tabular-nums",
                score.score >= 0.9
                  ? "text-emerald-600 dark:text-emerald-400"
                  : score.score < 0.5
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-foreground"
              )}
            >
              {score.score.toFixed(2)}
            </span>
          )}
          {truncated && (
            <Badge variant="amber">
              <IconScissors />
              judged on truncated payload
            </Badge>
          )}
        </div>
        {showReason && text && (
          <p className="whitespace-pre-wrap wrap-break-word text-balance text-[13px] leading-relaxed">
            {text}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Meta
          label="Scored"
          value={formatDateTime(score.scoredAt)}
          className="col-span-2"
        />
        {score.modelId && (
          <Meta
            label="Judge"
            className="col-span-2"
            value={
              <span className="flex min-w-0 items-center gap-1.5">
                <ModelLogo
                  modelId={score.modelId}
                  className="size-3 shrink-0"
                />
                <span className="truncate" title={score.modelId}>
                  {formatModelName(score.modelId)}
                </span>
              </span>
            }
          />
        )}
        {showCost && (
          <Meta
            label="Cost"
            className="col-span-2"
            value={formatCost(score.cost as number, 4)}
          />
        )}
      </div>
      <Button
        size="sm"
        variant="secondary"
        className="w-fit"
        // biome-ignore lint/suspicious/noExplicitAny: typed-routes string href
        render={<Link href={href as any} />}
      >
        See full trace
        <IconArrowUpRight />
      </Button>
    </div>
  );
}

/** The scored exchange as a conversation. Earlier history folds behind a
 * disclosure so the drawer opens on the latest user turn and the answer;
 * payloads that aren't message-shaped fall back to the raw viewer. */
function Conversation({
  input,
  output,
  emptyHint,
}: {
  input: string | null | undefined;
  output: string | null | undefined;
  emptyHint: string;
}) {
  const outMessages = useMemo(
    () => (output ? toMessages(output) : null),
    [output]
  );
  // A payload that is not JSON is prose (the SDK stores plain strings
  // verbatim) — a bubble, not the raw viewer.
  const outputText = outMessages
    ? messagesText(outMessages)
    : (output?.trim() ?? "");

  return (
    <div className="flex flex-col gap-4">
      {input ? <Transcript input={input} /> : null}
      {outputText ? (
        <Bubble who="assistant" text={outputText} />
      ) : (
        <div className="flex gap-3">
          <Avatar who="assistant" />
          <p className="inline-flex items-center gap-1.5 px-1 text-sm text-muted-foreground italic">
            <IconTool className="size-3.5 shrink-0 text-muted-foreground/60" />
            {emptyHint}
          </p>
        </div>
      )}
    </div>
  );
}

function partsText(parts: Part[]): string {
  return parts
    .filter((p): p is Extract<Part, { kind: "text" }> => p.kind === "text")
    .map((p) => p.text)
    .join("\n\n")
    .trim();
}
function messagesText(messages: Message[]): string {
  return messages
    .filter((m) => m.role !== "user" && m.role !== "system")
    .map((m) => partsText(m.parts))
    .filter(Boolean)
    .join("\n\n");
}

/** One message of the transcript. User turns get the bubble, assistant turns
/** The input side of an exchange: message-shaped payloads become turns with
 * everything before the latest user message folded away; anything else is a
 * single user bubble. */
function Transcript({ input }: { input: string }) {
  const messages = useMemo(
    () => toMessages(input) ?? fromHumanized(input),
    [input]
  );
  if (!messages) return <Bubble who="user" text={input} />;
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      lastUser = i;
      break;
    }
  }
  const history = lastUser > 0 ? messages.slice(0, lastUser) : [];
  const current = messages.slice(Math.max(0, lastUser));
  return (
    <div className="flex flex-col gap-4">
      {history.length > 0 && (
        <details className="group/history">
          <summary className="flex h-5 cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <IconChevronRight className="size-3.5 transition-transform group-open/history:rotate-90" />
            {history.length} earlier{" "}
            {history.length === 1 ? "message" : "messages"}
          </summary>
          <div className="mt-4 flex flex-col gap-4">
            {history.map((m, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: positional transcript
              <Turn key={i} message={m} />
            ))}
          </div>
        </details>
      )}
      {current.map((m, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: positional transcript
        <Turn key={i} message={m} />
      ))}
    </div>
  );
}

 * prose; tool calls and results collapse to chips; system prompts and other
 * roles show as a muted note. */
function Turn({ message }: { message: Message }) {
  const text = partsText(message.parts);
  const tools = message.parts.filter(
    (p) =>
      p.kind === "tool-call" ||
      p.kind === "tool-result" ||
      p.kind === "tool-error"
  ) as Extract<Part, { kind: "tool-call" | "tool-result" | "tool-error" }>[];
  if (message.role === "user") {
    return <Bubble who="user" text={text || "(no text)"} />;
  }
  if (message.role === "assistant" || message.role === null) {
    return (
      <div className="flex flex-col gap-2">
        {text && <Bubble who="assistant" text={text} />}
        {tools.length > 0 && <ToolChips tools={tools} />}
      </div>
    );
  }
  if (tools.length > 0 && !text) return <ToolChips tools={tools} />;
  return (
    <div className="flex gap-3">
      <span className="w-6 shrink-0 text-right text-[10px] font-medium uppercase leading-6 text-muted-foreground/60">
        {message.role}
      </span>
      <p className="max-h-40 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap wrap-break-word px-1 text-xs text-muted-foreground">
        {text || JSON.stringify(message.parts)}
      </p>
    </div>
  );
}

function ToolChips({
  tools,
}: {
  tools: Extract<Part, { kind: "tool-call" | "tool-result" | "tool-error" }>[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 pl-9">
      {tools.map((t, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: positional
          key={i}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border bg-card/40 px-2 py-0.5 text-xs text-muted-foreground",
            t.kind === "tool-error" &&
              "border-rose-500/40 text-rose-600 dark:text-rose-400"
          )}
        >
          <IconTool className="size-3 shrink-0" />
          <span className="max-w-40 truncate font-mono">{t.name}</span>
          {t.kind !== "tool-call" && (
            <span className="text-muted-foreground/60">
              {t.kind === "tool-error" ? "error" : "result"}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

/** Loading treatment shaped like the loaded conversation (same as the
 * session page): a user bubble and a few prose lines under real avatars. */
function ConversationSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <div className="mt-1.5 size-6 shrink-0 animate-pulse rounded-full bg-muted-foreground/15" />
        <Skeleton className="h-11 min-w-0 flex-1 corner-squircle rounded-lg squircle:rounded-2xl" />
      </div>
      <div className="flex gap-3">
        <div className="size-6 shrink-0 animate-pulse rounded-full bg-muted-foreground/15" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 px-1 pt-1">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      </div>
    </div>
/** Mirrors JudgeInput: header, rubric, input transcript, reason and output. */
function JudgeInputSkeleton() {
  const label = <Skeleton className="h-3 w-12" />;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1.5">
        <Skeleton className="size-3 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex flex-col gap-2">
        {label}
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
      <div className="flex flex-col gap-2">
        {label}
        <div className="flex gap-3">
          <div className="mt-1.5 size-6 shrink-0 animate-pulse rounded-full bg-muted-foreground/15" />
          <Skeleton className="h-11 min-w-0 flex-1 corner-squircle rounded-lg squircle:rounded-2xl" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {label}
        <div className="flex flex-col gap-2 rounded-lg border border-dashed px-3 py-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
        <div className="flex gap-3">
          <div className="size-6 shrink-0 animate-pulse rounded-full bg-muted-foreground/15" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 px-1 pt-1">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}

  );
}

function Avatar({ who }: { who: "user" | "assistant" }) {
  const Icon = who === "user" ? IconUserFilled : IconGhostFilled;
  return (
    <div
      className={cn(
        who === "user" && "mt-1.5",
        "flex size-6 shrink-0 items-center justify-center rounded-full bg-muted-foreground/15 text-muted-foreground shadow-(--custom-shadow)"
      )}
    >
      <Icon className="size-3.5" />
    </div>
  );
}

// Same bubble as the session page: user text in a card, assistant markdown
// as prose with a hover copy button.
function Bubble({ who, text }: { who: "user" | "assistant"; text: string }) {
  const isUser = who === "user";
  return (
    <div className="group/bubble flex gap-3">
      <Avatar who={who} />
      <div
        className={
          isUser
            ? "min-w-0 flex-1 corner-squircle rounded-lg squircle:rounded-2xl bg-card dark:bg-muted-foreground/20 shadow-(--custom-shadow) px-3 py-2.5"
            : "min-w-0 flex-1 px-1 py-0"
        }
      >
        {isUser ? (
          <p className="whitespace-pre-wrap wrap-break-word text-sm">{text}</p>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 text-sm leading-relaxed [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:my-2 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 *:last:mb-0 [&>*:first-child>*:first-child]:mt-0 [&>*:first-child>*:first-child>*:first-child]:mt-0">
              <Streamdown
                components={markdownComponents}
                controls={{ table: false }}
              >
                {text}
              </Streamdown>
            </div>
            <div className="shrink-0 opacity-0 transition-opacity group-hover/bubble:opacity-100">
              <CopyButton value={text} title="Copy output" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// The worker prefixes a judge's reason when it scored a payload cut at the
// input cap; split that flag back out so it renders as a badge, not prose.
const TRUNCATED_PREFIX = "[judged on truncated payload] ";
function splitReason(reason: string): { text: string; truncated: boolean } {
  return reason.startsWith(TRUNCATED_PREFIX)
    ? { text: reason.slice(TRUNCATED_PREFIX.length), truncated: true }
    : { text: reason, truncated: false };
}

/** Why a scored target has no output: an agent run that stopped after a tool
 * call never produced a final answer (the usual case for a blank root span). */
function emptyOutputHint(spans: { spanType: string }[]): string {
  return spans.some((s) => s.spanType === "tool")
    ? "No final answer, the run ended after a tool call."
    : "No output was recorded for this run.";
}

function FocusedRun({
  score,
  projectId,
}: {
  score: BaseScoreRow;
  projectId: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Focused run</CardTitle>
      </CardHeader>
      <CardContent>
        <RunExchange score={score} projectId={projectId} />
      </CardContent>
    </Card>
  );
}
