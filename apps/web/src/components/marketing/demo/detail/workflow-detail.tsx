"use client";

import { Badge } from "@foglamp/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@foglamp/ui/components/card";
import {
	Pagination,
	PaginationContent,
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
import { TooltipProvider } from "@foglamp/ui/components/tooltip";
import { cn } from "@foglamp/ui/lib/utils";
import {
	IconAlertTriangle,
	IconAlertTriangleFilled,
	IconBoltFilled,
	IconClockFilled,
	IconCoinFilled,
	IconGhost,
} from "@tabler/icons-react";
import { useState } from "react";

import { SortableHead, sortRows, useTableSort } from "@/components/app/data-table";
import { HeatCell } from "@/components/app/heat-cell";
import { type FlowNode, NodeFlow } from "@/components/app/node-flow";
import { StatCard } from "@/components/app/page-parts";
import {
	ChartLegend,
	formatBucketFull,
	makeBucketLabel,
	makeEdgeTick,
	themed,
	thinTicks,
} from "@/components/app/trend-charts";
import * as AreaChart from "@/components/evilcharts/charts/area-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import {
	formatCost,
	formatCount,
	formatDuration,
	formatPercent,
	formatSpanDuration,
	formatTokens,
} from "@/lib/format";

import { DemoRange, DetailHeader } from "../demo-chrome";
import { useDemo } from "../demo-context";
import {
	quintiles,
	WORKFLOW_FLOW,
	WORKFLOW_RUNS,
	WORKFLOW_SERIES,
	WORKFLOWS,
	type WorkflowRun,
} from "../mock-data";

// The demo window is a fixed "Last 24 hours", so the bucket axis renders
// time-of-day labels.
const WINDOW_MS = 24 * 60 * 60 * 1000;
const bucketLabel = makeBucketLabel(WINDOW_MS);
const edgeTick = makeEdgeTick(bucketLabel);
const seriesTicks = thinTicks(
	WORKFLOW_SERIES.map((d) => d.bucket),
	bucketLabel,
);

const volumeConfig = {
	runs: { label: "Runs", colors: themed("var(--chart-2)") },
	errors: { label: "Errored", colors: themed("var(--destructive)") },
} satisfies ChartConfig;

const latencyConfig = {
	// neutral-800 on light, neutral-200 on dark — matches the Overview latency chart
	p50: { label: "p50", colors: { light: ["#262626"], dark: ["#e5e5e5"] } },
	p95: { label: "p95", colors: themed("#0090FD") },
	p99: { label: "p99", colors: themed("#FF5513") },
} satisfies ChartConfig;

// Duration as a stacked *band* (p50, p95−p50, p99−p95); the absolutes ride
// along for the tooltip. Same transform as the real workflow detail.
const latencyData = WORKFLOW_SERIES.map((r) => ({
	bucket: r.bucket,
	p50: r.p50,
	p95: Math.max(0, r.p95 - r.p50),
	p99: Math.max(0, r.p99 - r.p95),
	p50Abs: r.p50,
	p95Abs: r.p95,
	p99Abs: r.p99,
}));

const DURATION_QUANTILES = quintiles(WORKFLOW_RUNS.map((r) => r.durationMs));
const COST_QUANTILES = quintiles(WORKFLOW_RUNS.map((r) => r.cost));

type RunSortKey = "when" | "duration" | "traces" | "cost";

export function WorkflowDetail({ workflowName }: { workflowName: string }) {
	const { closeDetail } = useDemo();
	const workflow =
		WORKFLOWS.find((w) => w.name === workflowName) ?? WORKFLOWS[0]!;

	const [volumeSelected, setVolumeSelected] = useState<string | null>(null);
	const [latencySelected, setLatencySelected] = useState<string | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const { sort, toggle } = useTableSort<RunSortKey>();

	const runRows = sortRows<WorkflowRun, RunSortKey>(WORKFLOW_RUNS, sort, {
		when: (r) => -WORKFLOW_RUNS.indexOf(r),
		duration: (r) => r.durationMs,
		traces: (r) => r.traces,
		cost: (r) => r.cost,
	});

	// Default the flow to the most recent run (list is newest-first).
	const activeRunId = selected ?? runRows[0]?.runId ?? null;
	const activeRun = runRows.find((r) => r.runId === activeRunId);

	const errorRate = workflow.errors / workflow.runs;
	const tokensPerRun = Math.round(workflow.tokens / workflow.runs);

	const nodes: FlowNode[] = WORKFLOW_FLOW.map((s) => ({
		id: s.id,
		icon: <IconGhost className="size-5" />,
		label: s.label,
		status: s.status,
		timestamp: s.timestamp,
		durationMs: s.durationMs,
	}));

	return (
		<>
			<DetailHeader
				backHref="/workflows"
				title={workflow.name}
				actions={<DemoRange />}
				onBack={closeDetail}
			/>

			{/* Stat strip — totals over all runs in the window. */}
			<section className="grid grid-cols-2 gap-4 md:grid-cols-4 px-8 mt-1">
				<StatCard
					icon={IconCoinFilled}
					iconClassName="text-amber-400 dark:text-yellow-500"
					size="sm"
					label="Total cost"
					value={workflow.costValue}
					formatValue={(n) => formatCost(n, 4)}
					hint={`${formatTokens(tokensPerRun * workflow.runs)} tokens`}
				/>
				<StatCard
					icon={IconAlertTriangleFilled}
					iconClassName="text-red-500/90 dark:text-red-600/95 mt-px"
					size="sm"
					label="Error rate"
					value={errorRate}
					formatValue={formatPercent}
					hint={`${formatCount(workflow.errors)} errored`}
				/>
				<StatCard
					icon={IconClockFilled}
					iconClassName="text-sky-400 dark:text-sky-500"
					size="sm"
					label="p95 duration"
					value={workflow.p95}
					hint={`p50 ${workflow.p50}`}
				/>
				<StatCard
					icon={IconBoltFilled}
					iconClassName="text-orange-500 dark:text-orange-500"
					size="sm"
					label="Runs"
					value={workflow.runs}
					formatValue={formatCount}
					hint={`${formatCount(workflow.traces)} traces`}
				/>
			</section>

			{/* Trend: run volume + run-duration percentiles over the window. */}
			<section className="grid gap-4 lg:grid-cols-2 px-8">
				<Card size="sm">
					<CardHeader className="flex flex-row items-center justify-between gap-4">
						<CardTitle>Runs & errors</CardTitle>
						<ChartLegend
							config={volumeConfig}
							selected={volumeSelected}
							onSelect={setVolumeSelected}
						/>
					</CardHeader>
					<CardContent className="mt-2">
						<AreaChart.EvilAreaChart
							config={volumeConfig}
							data={WORKFLOW_SERIES}
							xDataKey="bucket"
							selectedDataKey={volumeSelected}
							onSelectionChange={setVolumeSelected}
							className="h-55 w-full"
							chartProps={{
								margin: { top: 5, right: 5, bottom: 5, left: 2 },
							}}
						>
							<AreaChart.Grid />
							<AreaChart.XAxis
								dataKey="bucket"
								ticks={seriesTicks}
								tickFormatter={bucketLabel}
								interval={0}
								tick={edgeTick}
							/>
							<AreaChart.YAxis
								allowDecimals={false}
								tickFormatter={(v) => formatCount(Number(v))}
							/>
							<AreaChart.Tooltip
								labelFormatter={(v) => formatBucketFull(String(v))}
							/>
							<AreaChart.Area dataKey="runs" strokeVariant="solid" />
							<AreaChart.Area
								dataKey="errors"
								strokeVariant="solid"
								variant="lines"
							/>
						</AreaChart.EvilAreaChart>
					</CardContent>
				</Card>

				<Card size="sm">
					<CardHeader className="flex flex-row items-center justify-between gap-4">
						<CardTitle>Run duration</CardTitle>
						<ChartLegend
							config={latencyConfig}
							selected={latencySelected}
							onSelect={setLatencySelected}
						/>
					</CardHeader>
					<CardContent className="mt-2">
						<AreaChart.EvilAreaChart
							config={latencyConfig}
							data={latencyData}
							xDataKey="bucket"
							stackType="stacked"
							selectedDataKey={latencySelected}
							onSelectionChange={setLatencySelected}
							className="h-55 w-full"
							chartProps={{
								margin: { top: 5, right: 5, bottom: 5, left: 2 },
							}}
						>
							<AreaChart.Grid />
							<AreaChart.XAxis
								dataKey="bucket"
								ticks={seriesTicks}
								tickFormatter={bucketLabel}
								interval={0}
								tick={edgeTick}
							/>
							<AreaChart.YAxis
								tickFormatter={(v) => formatDuration(Number(v))}
							/>
							<AreaChart.Tooltip
								labelFormatter={(v) => formatBucketFull(String(v))}
								valueFormatter={(_v, key, row) =>
									formatDuration(Number(row[`${key}Abs`] ?? _v))
								}
								reverse
							/>
							{/* Stacked deltas (see latencyData): draw bottom band → top
                  so the stack reads p50, then p95−p50, then p99−p95. */}
							<AreaChart.Area dataKey="p50" strokeVariant="solid" />
							<AreaChart.Area dataKey="p95" strokeVariant="solid" />
							<AreaChart.Area dataKey="p99" strokeVariant="solid" />
						</AreaChart.EvilAreaChart>
					</CardContent>
				</Card>
			</section>

			{/* Step flow for the selected run. */}
			<div className="px-8">
				<Card size="sm" className="pb-4">
					<CardHeader>
						<CardTitle className="flex flex-wrap items-center gap-2">
							Run flow
						</CardTitle>
						{activeRun && (
							<CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
								<span>{formatCount(activeRun.traces)} traces</span>
								<span>·</span>
								<span>{formatSpanDuration(activeRun.durationMs)}</span>
								<span>·</span>
								<span>{formatCost(activeRun.cost)}</span>
								<span>·</span>
								<span>{formatTokens(activeRun.traces * 3400)} tokens</span>
								{activeRun.errorCount > 0 && (
									<Badge variant="rose" className="font-sans">
										<IconAlertTriangle />
										{formatCount(activeRun.errorCount)}
										{activeRun.errorCount === 1 ? "error" : "errors"}
									</Badge>
								)}
							</CardDescription>
						)}
					</CardHeader>
					<CardContent className="px-4 mt-3">
						<NodeFlow nodes={nodes} />
					</CardContent>
				</Card>
			</div>

			{/* Runs table — click a row to drive the flow above. */}
			<div className="flex flex-col gap-3 mt-4">
				<div className="flex flex-col gap-3">
					<TooltipProvider delay={150}>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Run</TableHead>
									<SortableHead
										sortKey="traces"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-28"
									>
										Traces
									</SortableHead>
									<SortableHead
										sortKey="duration"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-32"
									>
										Duration
									</SortableHead>
									<SortableHead
										sortKey="cost"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-32"
									>
										Cost
									</SortableHead>
									<SortableHead
										sortKey="when"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-32"
									>
										When
									</SortableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{runRows.map((r) => (
									<TableRow
										key={r.runId}
										interactive
										className={cn(
											r.runId === activeRunId &&
												"bg-accent/60 dark:bg-accent/30",
											// Left accent bar on errored runs — scannable at a glance.
											r.errorCount > 0 &&
												"shadow-[inset_1px_0_0_0_var(--color-rose-500)]",
										)}
										onClick={() => setSelected(r.runId)}
									>
										<TableCell>
											<div className="flex items-center gap-2">
												<span className="font-medium">
													<span className="font-mono text-xs text-muted-foreground">
														{r.runId}
													</span>
												</span>
												{r.errorCount > 0 && (
													<Badge
														variant="rose"
														className="shrink-0 font-sans ml-auto"
													>
														<IconAlertTriangle />
														{formatCount(r.errorCount)}
														{r.errorCount === 1 ? "error" : "errors"}
													</Badge>
												)}
											</div>
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatCount(r.traces)}
										</TableCell>
										<HeatCell
											value={r.durationMs}
											thresholds={DURATION_QUANTILES}
											metric="duration"
										>
											{formatSpanDuration(r.durationMs)}
										</HeatCell>
										<HeatCell
											value={r.cost}
											thresholds={COST_QUANTILES}
											metric="cost"
											bold
										>
											{formatCost(r.cost)}
										</HeatCell>
										<TableCell className="text-right text-muted-foreground">
											{r.when}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</TooltipProvider>

					<div className="flex items-center justify-between px-1">
						<span className="text-sm text-muted-foreground/50 tabular-nums">
							Showing 1–{runRows.length} of {formatCount(runRows.length)}
						</span>
						<Pagination className="mx-0 w-auto justify-end">
							<PaginationContent>
								<PaginationItem>
									<PaginationPrevious
										aria-disabled
										className="pointer-events-none opacity-50"
									/>
								</PaginationItem>
								<PaginationItem>
									<PaginationLink isActive>1</PaginationLink>
								</PaginationItem>
								<PaginationItem>
									<PaginationNext
										aria-disabled
										className="pointer-events-none opacity-50"
									/>
								</PaginationItem>
							</PaginationContent>
						</Pagination>
					</div>
				</div>
			</div>
		</>
	);
}
