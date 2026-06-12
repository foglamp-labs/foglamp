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
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@foglamp/ui/components/pagination";
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
	IconPencil,
	IconStack2,
	IconTargetArrow,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { CopyIcon } from "@/components/app/copy-icon";
import { useDelayedLoading } from "@/components/app/data-table";
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
import { RangePicker } from "@/components/app/range-picker";
import { RelativeTime } from "@/components/app/relative-time";
import { useCopied } from "@/components/app/use-copied";
import { formatCost, formatCount } from "@/lib/format";
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
import { presetMeta } from "../preset-meta";

type ScoreRow = RouterOutputs["evals"]["recentScores"]["scores"][number];

const PAGE_SIZE = 25;

/** Page numbers to render (1-based), collapsing long runs to a single ellipsis.
 * Always keeps the first/last page and the current page ±1 in view, e.g.
 * `1 … 4 5 6 … 20`. */
function pageWindow(current: number, total: number): (number | "ellipsis")[] {
	if (total <= 7) {
		return Array.from({ length: total }, (_, i) => i + 1);
	}
	const middle: number[] = [];
	for (
		let i = Math.max(2, current - 1);
		i <= Math.min(total - 1, current + 1);
		i++
	) {
		middle.push(i);
	}
	const out: (number | "ellipsis")[] = [1];
	if (middle[0] > 2) out.push("ellipsis");
	out.push(...middle);
	if (middle[middle.length - 1] < total - 1) out.push("ellipsis");
	out.push(total);
	return out;
}

// Edit-dialog draft: the subset of an eval that the "How should it score?"
// fields can change (judge model + sample rate, or a code check's params).
type EditDraft = {
	judgeModel: string;
	judgeProvider: Provider;
	sampleRate: string;
	substring: string;
	pattern: string;
	maxChars: string;
	promptOverride: string;
};

export function EvalDetailClient({ evalId }: { evalId: string }) {
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
	// Edit dialog: open state + the draft seeded from the eval when opened.
	const [editOpen, setEditOpen] = useState(false);
	const [draft, setDraft] = useState<EditDraft>({
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
	useEffect(() => setPage(0), [evalId, range]);

	const recent = useQuery({
		...trpc.evals.recentScores.queryOptions({
			evalId,
			limit: PAGE_SIZE,
			offset: page * PAGE_SIZE,
			from: range.from,
			to: range.to,
		}),
		enabled: !!projectId,
		// Keep the current page visible while the range/page change refetches.
		placeholderData: (prev) => prev,
	});
	// Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
	const showRecentSkeleton = useDelayedLoading(recent.isLoading);

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
	// Total pages from the filtered count (all pages). Falls back to "at least
	// the current page" before the count loads.
	const totalPages = Math.max(page + 1, Math.ceil(scoreTotal / PAGE_SIZE) || 1);
	const currentPage = page + 1;
	const pages = pageWindow(currentPage, totalPages);

	const ev = list.data?.find((e) => e.id === evalId) ?? null;

	const update = useMutation(
		trpc.evals.update.mutationOptions({
			onSuccess: () => {
				qc.invalidateQueries({ queryKey: trpc.evals.list.queryKey() });
				setEditOpen(false);
				toast.success("Eval updated");
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	const configuredProviders = new Set(
		(providerKeys.data?.keys ?? []).map((k) => k.provider),
	);

	// Seed the draft from the current eval, then open the dialog.
	const openEdit = () => {
		if (!ev) return;
		const params = (ev.config?.params ?? {}) as Record<string, unknown>;
		const presetDefault =
			presets.data?.find((p) => p.id === ev.presetId)?.prompt ?? "";
		setDraft({
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
			0,
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
			<PageHeader
				title={ev?.name ?? "Eval"}
				back={back}
				description={
					<span className="inline-flex items-center gap-1 font-mono text-xs">
						{evalId}
						<CopyButton value={evalId} title="Copy eval ID" />
					</span>
				}
				actions={
					ev ? (
						<Button size="sm" variant="secondary" onClick={openEdit}>
							<IconPencil />
							Edit
						</Button>
					) : undefined
				}
			/>

			{/* Definition chips: the check, what it runs on, and the sample rate. */}
			{ev && (
				<div className="-mt-1 flex flex-wrap items-center gap-2">
					<Badge variant={ev.scorerSource === "llm" ? "violet" : "secondary"}>
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

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard
					icon={IconBoltFilled}
					iconClassName="text-violet-300 dark:text-violet-700"
					size="sm"
					label="Scored"
					value={totals.count.toLocaleString("en-US")}
				/>
				<StatCard
					icon={IconGaugeFilled}
					iconClassName="text-fuchsia-300 dark:text-fuchsia-700"
					size="sm"
					label="Avg score"
					value={totals.avgScore === null ? "—" : totals.avgScore.toFixed(2)}
				/>
				<StatCard
					icon={IconCircleCheckFilled}
					iconClassName="text-emerald-300 dark:text-emerald-700"
					size="sm"
					label="Pass rate"
					value={
						totals.passRate === null
							? "—"
							: `${Math.round(totals.passRate * 100)}%`
					}
				/>
				<StatCard
					icon={IconCoinFilled}
					iconClassName="text-yellow-300 dark:text-yellow-600"
					size="sm"
					label="Eval spend"
					value={formatCost(totals.cost)}
				/>
			</div>

			<div className="flex flex-col gap-3">
				<div className="flex items-center justify-between gap-3">
					<h2 className="text-sm font-medium">Recent scores</h2>
					<RangePicker value={range} onChange={setRange} />
				</div>
				{pinnedScore && (
					<FocusedRun score={pinnedScore} projectId={projectId} />
				)}
				{recent.isLoading ? (
					showRecentSkeleton ? (
						<TableSkeleton rows={4} />
					) : null
				) : scores.length === 0 ? (
					<EmptyState
						icon={IconGauge}
						title="No scores yet"
						description="Scores appear here as new matching traffic is sampled and scored."
					/>
				) : (
					<>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-8" />
									<TableHead className="border-l-0 pl-0 w-72">Target</TableHead>
									<TableHead className="w-28">Score</TableHead>
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
														"shadow-[inset_2px_0_0_0_var(--color-primary)]",
												)}
											>
												<TableCell className="text-muted-foreground/50 pr-2">
													<IconChevronRight
														className={cn(
															"size-3.5 transition-transform",
															isOpen && "rotate-90",
														)}
													/>
												</TableCell>
												<TableCell className="font-mono text-xs text-muted-foreground truncate max-w-96 border-l-0 pl-0">
													{s.targetType}:{s.targetId}
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
													colSpan={5}
												/>
											)}
										</Fragment>
									);
								})}
							</TableBody>
						</Table>

						<div className="flex items-center justify-between px-1">
							<span className="text-sm text-muted-foreground/50 tabular-nums">
								{scores.length === 0
									? `Showing 0 of ${formatCount(scoreTotal)}`
									: `Showing ${page * PAGE_SIZE + 1}–${
											page * PAGE_SIZE + scores.length
										} of ${formatCount(scoreTotal)}`}
							</span>
							<Pagination className="mx-0 w-auto justify-end">
								<PaginationContent>
									<PaginationItem>
										<PaginationPrevious
											aria-disabled={page === 0 || recent.isFetching}
											className={cn(
												(page === 0 || recent.isFetching) &&
													"pointer-events-none opacity-50",
											)}
											onClick={() => setPage((p) => Math.max(0, p - 1))}
										/>
									</PaginationItem>
									{pages.map((p, i) =>
										p === "ellipsis" ? (
											// biome-ignore lint/suspicious/noArrayIndexKey: positional separator
											<PaginationItem key={`ellipsis-${i}`}>
												<PaginationEllipsis />
											</PaginationItem>
										) : (
											<PaginationItem key={p}>
												<PaginationLink
													isActive={p === currentPage}
													className={cn(
														recent.isFetching && "pointer-events-none",
													)}
													onClick={() => setPage(p - 1)}
												>
													{p}
												</PaginationLink>
											</PaginationItem>
										),
									)}
									<PaginationItem>
										<PaginationNext
											aria-disabled={
												currentPage >= totalPages || recent.isFetching
											}
											className={cn(
												(currentPage >= totalPages || recent.isFetching) &&
													"pointer-events-none opacity-50",
											)}
											onClick={() => setPage((p) => p + 1)}
										/>
									</PaginationItem>
								</PaginationContent>
							</Pagination>
						</div>
					</>
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
								(isJudge && !draft.judgeModel.trim()) ||
								!!settingsParamError(ev ? { id: ev.presetId } : null, {
									substring: draft.substring,
									pattern: draft.pattern,
									maxChars: draft.maxChars,
								}) ||
								!!promptOverrideError(
									ev ? { source: ev.scorerSource } : null,
									draft.promptOverride,
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
		trpc.traces.get.queryOptions({ projectId, traceId: score.traceId }),
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
					score.targetId,
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
		trpc.traces.get.queryOptions({ projectId, traceId: score.traceId }),
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
					score.targetId,
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

/** Copy a string to the clipboard, with a brief check-mark confirmation. */
function CopyButton({ value, title }: { value: string; title: string }) {
	const { copied, markCopied } = useCopied();
	return (
		<button
			type="button"
			title={title}
			onClick={() => {
				void navigator.clipboard.writeText(value);
				markCopied();
			}}
			className="inline-flex shrink-0 items-center justify-center rounded p-0.5 text-muted-foreground/60 cursor-pointer transition-colors hover:text-foreground"
		>
			<CopyIcon
				copied={copied}
				className="size-3.5"
				checkClassName="size-3.5 text-green-600 dark:text-green-400"
			/>
		</button>
	);
}
