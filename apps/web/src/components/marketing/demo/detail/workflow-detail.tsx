"use client";

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
import { TooltipProvider } from "@foglamp/ui/components/tooltip";
import { cn } from "@foglamp/ui/lib/utils";
import {
	IconAlertTriangle,
	IconAlertTriangleFilled,
	IconArrowUpRight,
	IconBoltFilled,
	IconClockFilled,
	IconCoinFilled,
	IconTool,
	IconAffiliateFilled,
} from "@tabler/icons-react";
import { Fragment, useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { DRAWER_BUTTON_CLASS } from "@/components/app/button-styles";
import {
	PaginationFooter,
	SortableHead,
	sortRows,
	useTableSort,
} from "@/components/app/data-table";
import { HeatCell } from "@/components/app/heat-cell";
import { type FlowNode, NodeFlow } from "@/components/app/node-flow";
import { StatCard } from "@/components/app/page-parts";
import {
	Bubble,
	CustomerValue,
	DrawerColumns,
	DrawerRow,
	ExpandChevron,
	Meta,
	ModelsValue,
	OPEN_ROW_CLASS,
} from "@/components/app/run-exchange";
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
	formatCostFixed,
	formatCount,
	formatDateTime,
	formatDuration,
	formatPercent,
	formatSpanDuration,
	formatTokens,
} from "@/lib/format";

import { DemoRange, DemoSessionButton, DetailHeader } from "../demo-chrome";
import { useDemo } from "../demo-context";
import {
	AGENT_TRACES,
	quintiles,
	TRACE_MESSAGES,
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
	const [pageSize, setPageSize] = useState(25);
	const workflow =
		WORKFLOWS.find((w) => w.name === workflowName) ?? WORKFLOWS[0]!;

	const [volumeSelected, setVolumeSelected] = useState<string | null>(null);
	const [latencySelected, setLatencySelected] = useState<string | null>(null);
	// Which run row is expanded into its drawer (agents + exchange).
	const [expanded, setExpanded] = useState<string | null>(null);
	const { sort, toggle } = useTableSort<RunSortKey>();

	const runRows = sortRows<WorkflowRun, RunSortKey>(WORKFLOW_RUNS, sort, {
		when: (r) => -WORKFLOW_RUNS.indexOf(r),
		duration: (r) => r.durationMs,
		traces: (r) => r.traces,
		cost: (r) => r.cost,
	});

	const errorRate = workflow.errors / workflow.runs;
	const tokensPerRun = Math.round(workflow.tokens / workflow.runs);

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
					formatValue={(n) => formatCostFixed(n, 4)}
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

			{/* Runs table — click a row to open its drawer. */}
			<div className="flex flex-col gap-3 mt-4">
				<div className="flex flex-col gap-3">
					<TooltipProvider delay={150}>
						<Table className="table-fixed">
							<TableHeader>
								<TableRow>
									<TableHead>Run</TableHead>
									<SortableHead
										sortKey="traces"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-24"
									>
										Traces
									</SortableHead>
									<SortableHead
										sortKey="duration"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-28"
									>
										Duration
									</SortableHead>
									<SortableHead
										sortKey="cost"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-28"
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
								{runRows.map((r) => {
									const isOpen = expanded === r.runId;
									return (
										<Fragment key={r.runId}>
											<TableRow
												interactive
												aria-expanded={isOpen}
												className={cn("group", isOpen && OPEN_ROW_CLASS)}
												onClick={() => setExpanded(isOpen ? null : r.runId)}
											>
												{/* Content-first: the run's opening user message,
												    falling back to the id; the agents involved
												    trail on the right. */}
												<TableCell className="h-12 font-normal">
													<div className="flex items-center gap-2">
														<ExpandChevron open={isOpen} />
														<span className="truncate">
															{r.userMessage ?? (
																<span className="font-mono text-xs text-muted-foreground">
																	{r.runId}
																</span>
															)}
														</span>
														{/* Compact error count — colored text, no pill. */}
														{r.errorCount > 0 && (
															<span
																title={`${r.errorCount} ${r.errorCount === 1 ? "error" : "errors"}`}
																className="flex shrink-0 items-center gap-0.75 font-sans text-sm text-red-600 dark:text-red-400"
															>
																<IconAlertTriangle className="size-3.5 fill-current/20" />
																{r.errorCount}
															</span>
														)}
														<AgentStack names={r.agentNames} />
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
											{isOpen && <RunDrawer run={r} colSpan={5} />}
										</Fragment>
									);
								})}
							</TableBody>
						</Table>
					</TooltipProvider>

					<PaginationFooter
						page={0}
						pageSize={pageSize}
						total={runRows.length}
						shown={runRows.length}
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

function AgentStack({ names }: { names: string[] }) {
	if (names.length === 0) return null;
	const shown = names.slice(0, 4);
	const rest = names.length - shown.length;
	return (
		<span
			className="ml-auto flex shrink-0 items-center gap-1 pl-2"
			title={names.join(" → ")}
		>
			{shown.map((n) => (
				<AgentIcon key={n} name={n} className="size-3.5" />
			))}
			{rest > 0 && (
				<span className="text-xs text-muted-foreground tabular-nums">
					+{rest}
				</span>
			)}
		</span>
	);
}

/** Expanded row: the run's overview on the left (timing, size, cost,
 * customer, models), its agent hand-offs as a flow and the whole run's
 * exchange on the right. Mirrors the real page's RunDrawer. */
function RunDrawer({ run, colSpan }: { run: WorkflowRun; colSpan: number }) {
	const { openDetail } = useDemo();
	const input = TRACE_MESSAGES.find((m) => m.role === "user")?.content;
	const output = TRACE_MESSAGES.find((m) => m.role === "assistant")?.content;
	const firstTraceId = AGENT_TRACES[0]!.traceId;

	const nodes: FlowNode[] = WORKFLOW_FLOW.map((s) => ({
		id: s.id,
		icon:
			s.sublabel === "agent" ? (
				<AgentIcon name={s.label} className="size-3.25" />
			) : (
				<IconTool className="size-3 shrink-0 fill-current stroke-1 text-blue-500 mb-px" />
			),
		label: s.label,
		status: s.status,
		timestamp: s.timestamp,
		durationMs: s.durationMs,
	}));

	return (
		<DrawerRow colSpan={colSpan} className="pt-6">
			<DrawerColumns
				overview={
					<>
						{run.errorCount > 0 && (
							<div className="flex h-5 items-center">
								<Badge variant="rose" className="font-sans">
									<IconAlertTriangle />
									{formatCount(run.errorCount)}
									{run.errorCount === 1 ? " error" : " errors"}
								</Badge>
							</div>
						)}
						<div className="grid grid-cols-2 gap-4">
							<Meta label="Started" value={formatDateTime(run.startedAt)} />
							<Meta
								label="Duration"
								value={formatSpanDuration(run.durationMs)}
							/>
							<Meta label="Traces" value={formatCount(run.traces)} />
							<Meta label="Tokens" value={formatTokens(run.tokens)} />
							<Meta label="Cost" value={formatCost(run.cost, 4)} />
							<Meta
								label="Customer"
								value={
									<CustomerValue
										customerId={run.customer}
										customerName={run.customer}
									/>
								}
							/>
							<Meta
								label={run.models.length === 1 ? "Model" : "Models"}
								className="col-span-2"
								value={<ModelsValue models={run.models} />}
							/>
						</div>
						<div className="flex flex-wrap gap-2.5 mt-3">
							<Button
								size="sm"
								variant="secondary"
								className={cn("w-fit", DRAWER_BUTTON_CLASS)}
								onClick={() => openDetail({ type: "trace", id: firstTraceId })}
							>
								<IconAffiliateFilled className="text-[#8b5e34] dark:text-[#c9a888]" />
								See first trace
								<IconArrowUpRight className="mt-px" />
							</Button>
							{run.sessionId && (
								<DemoSessionButton
									onClick={() =>
										openDetail({ type: "session", id: run.sessionId! })
									}
								/>
							)}
						</div>
					</>
				}
			>
				<div className="flex flex-col gap-5">
					<DrawerSection label="Agents">
						<NodeFlow
							nodes={nodes}
							onNodeClick={() =>
								openDetail({ type: "trace", id: firstTraceId })
							}
						/>
					</DrawerSection>
					<DrawerSection label="Exchange">
						<div className="flex flex-col gap-4">
							{input ? <Bubble who="user" text={input} /> : null}
							{output ? <Bubble who="assistant" text={output} /> : null}
						</div>
					</DrawerSection>
				</div>
			</DrawerColumns>
		</DrawerRow>
	);
}

function DrawerSection({
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
