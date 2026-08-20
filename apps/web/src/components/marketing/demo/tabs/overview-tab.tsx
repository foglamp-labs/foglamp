"use client";

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import {
	IconAlertTriangleFilled,
	IconCirclesFilled,
	IconCoinFilled,
	IconGaugeFilled,
	IconSitemapFilled,
} from "@tabler/icons-react";
import { useTheme } from "next-themes";
import { useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { CustomerAvatar } from "@/components/app/customer-avatar";
import {
	CardSparkline,
	PillMeter,
	ScrollFade,
	StatCard,
} from "@/components/app/page-parts";
import {
	formatBucketFull,
	makeBucketLabel,
	makeEdgeTick,
	thinTicks,
} from "@/components/app/trend-charts";
import * as AreaChart from "@/components/evilcharts/charts/area-chart";
import * as BarChart from "@/components/evilcharts/charts/bar-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { ModelLogo } from "@/components/model-logo";
import { formatCost, formatCount, formatDuration } from "@/lib/format";

import { DemoListHeader } from "../demo-chrome";
import { useDemo } from "../demo-context";
import {
	KPIS,
	OVERVIEW_BREAKDOWN,
	OVERVIEW_COST_CONFIG,
	OVERVIEW_COST_ITEMS,
	OVERVIEW_COST_SERIES,
	OVERVIEW_ERROR_RATE,
	OVERVIEW_PASS_RATE,
	OVERVIEW_SERIES,
} from "../mock-data";

// Matches overview-client: the demo window is a fixed "Last 24 hours", so the
// bucket axis renders time-of-day labels.
const WINDOW_MS = 24 * 60 * 60 * 1000;

const themed = (color: string) => ({ light: [color], dark: [color] });

// Cost Y-axis ticks: currency capped at 3 decimals so labels stay short.
const costAxisUsd = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	maximumFractionDigits: 3,
});

const latencyConfig = {
	// neutral-800 on light, neutral-200 on dark
	p50: { label: "p50", colors: { light: ["#262626"], dark: ["#e5e5e5"] } },
	p95: { label: "p95", colors: themed("#0090FD") },
	p99: { label: "p99", colors: themed("#FF5513") },
} satisfies ChartConfig;

const volumeConfig = {
	requests: { label: "Requests", colors: themed("var(--chart-2)") },
	errors: { label: "Errors", colors: themed("var(--destructive)") },
} satisfies ChartConfig;

type LegendItem = {
	key: string;
	label: React.ReactNode;
	color?: string;
	logo?: React.ReactNode;
};

// Cost legend rows pair the swatch with the model's brand logo, like the app.
const costItems: LegendItem[] = OVERVIEW_COST_ITEMS.map((it) => ({
	...it,
	logo: <ModelLogo modelId={it.label} className="size-3.5" />,
}));

// Clickable legend, mirroring overview-client's local items-based legend.
function ChartLegend({
	items,
	selected,
	onSelect,
}: {
	items: LegendItem[];
	selected: string | null;
	onSelect: (key: string | null) => void;
}) {
	return (
		<div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5 select-none">
			{items.map((it) => {
				const dimmed = selected !== null && selected !== it.key;
				const active = selected === it.key;
				return (
					<button
						key={it.key}
						type="button"
						onClick={() => onSelect(active ? null : it.key)}
						className={cn(
							"text-muted-foreground flex cursor-pointer items-center gap-1.5 text-sm transition-all hover:text-foreground",
							dimmed && "opacity-30",
							active && "text-foreground",
						)}
					>
						{it.color && (
							<span
								className="h-2 w-2 shrink-0 rounded-2xl corner-squircle"
								style={{ backgroundColor: it.color }}
							/>
						)}
						{it.logo}
						{it.label}
					</button>
				);
			})}
		</div>
	);
}

// A ranked breakdown entry: glyph + name + metrics on the left; cost + a share
// bar on the right. Interactive rows (agents/workflows) pop the matching detail.
function BreakdownRow({
	renderIcon,
	title,
	value,
	fraction,
	color,
	metrics,
	onClick,
}: {
	renderIcon: (className: string) => React.ReactNode;
	title: string;
	value: React.ReactNode;
	fraction: number;
	color: string;
	metrics: React.ReactNode;
	onClick?: () => void;
}) {
	const rowClassName =
		"flex w-full items-center justify-between gap-6 py-3 last:pb-0 px-5 last:pb-6";
	const inner = (
		<>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					{renderIcon("size-4 shrink-0")}
					<span className="truncate text-sm font-medium">{title}</span>
				</div>
				<div className="mt-1 text-xs tabular-nums text-muted-foreground/70 text-left">
					{metrics}
				</div>
			</div>
			<div className="flex shrink-0 flex-col items-end gap-2">
				<span className="text-sm tabular-nums">{value}</span>
				<div className="h-0.5 w-14 overflow-hidden rounded-full bg-muted-foreground/10">
					<div
						className="ml-auto h-full rounded-full"
						style={{
							width: `${Math.max(2, fraction * 100)}%`,
							backgroundColor: color,
						}}
					/>
				</div>
			</div>
		</>
	);
	if (onClick) {
		return (
			<button
				type="button"
				onClick={onClick}
				className={cn(
					rowClassName,
					"cursor-pointer text-left transition-colors hover:bg-muted/50",
				)}
			>
				{inner}
			</button>
		);
	}
	return <div className={rowClassName}>{inner}</div>;
}

export function OverviewTab() {
	const { openDetail } = useDemo();
	// Prefer forcedTheme: the marketing site forces dark, but next-themes still
	// reports the user's stored theme via resolvedTheme, so honor the force first.
	const { resolvedTheme, forcedTheme } = useTheme();
	const mode = (forcedTheme ?? resolvedTheme) === "dark" ? "dark" : "light";

	const [volumeSelected, setVolumeSelected] = useState<string | null>(null);
	const [latencySelected, setLatencySelected] = useState<string | null>(null);
	const [costSelected, setCostSelected] = useState<string | null>(null);

	const bucketLabel = makeBucketLabel(WINDOW_MS);
	const edgeTick = makeEdgeTick(bucketLabel);
	const seriesTicks = thinTicks(
		OVERVIEW_SERIES.map((d) => d.bucket),
		bucketLabel,
	);

	// Latency drawn as a stacked band (p50, p95−p50, p99−p95); absolutes ride
	// along for the tooltip. Same transform as overview-client.
	const latencyData = OVERVIEW_SERIES.map((r) => ({
		bucket: r.bucket,
		p50: r.p50,
		p95: Math.max(0, r.p95 - r.p50),
		p99: Math.max(0, r.p99 - r.p95),
		p50Abs: r.p50,
		p95Abs: r.p95,
		p99Abs: r.p99,
	}));

	const volumeItems: LegendItem[] = Object.entries(volumeConfig).map(
		([key, entry]) => ({
			key,
			label: entry.label,
			color: entry.colors.light[0],
		}),
	);
	const latencyItems: LegendItem[] = Object.entries(latencyConfig).map(
		([key, entry]) => ({
			key,
			label: entry.label,
			color: (mode === "dark" ? entry.colors.dark : entry.colors.light)[0],
		}),
	);

	return (
		<>
			<DemoListHeader href="/overview" title="Overview" withRange />

			{/* KPIs */}
			<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 px-8">
				<StatCard
					icon={IconCirclesFilled}
					iconClassName="text-blue-500 dark:text-blue-500"
					label={KPIS[0]!.label}
					size="sm"
					value={KPIS[0]!.value}
					delta={KPIS[0]!.delta}
					hint={KPIS[0]!.hint}
					chart={
						<CardSparkline
							data={OVERVIEW_SERIES.map((d) => d.tokens)}
							className="text-blue-400/50 dark:text-blue-600/50"
						/>
					}
				/>
				<StatCard
					icon={IconCoinFilled}
					iconClassName="text-yellow-400 dark:text-yellow-500"
					label={KPIS[1]!.label}
					size="sm"
					value={KPIS[1]!.value}
					delta={KPIS[1]!.delta}
					deltaInverted
					hint={KPIS[1]!.hint}
					chart={
						<CardSparkline
							data={OVERVIEW_SERIES.map((d) => d.cost)}
							className="text-yellow-400/50 dark:text-yellow-600/50"
						/>
					}
				/>
				<StatCard
					icon={IconGaugeFilled}
					iconClassName="text-fuchsia-500 dark:text-fuchsia-500"
					label={KPIS[2]!.label}
					size="sm"
					value={KPIS[2]!.value}
					delta={KPIS[2]!.delta}
					hint={KPIS[2]!.hint}
					chart={
						<PillMeter
							fraction={OVERVIEW_PASS_RATE}
							className="text-fuchsia-400 dark:text-fuchsia-700"
						/>
					}
				/>
				<StatCard
					icon={IconAlertTriangleFilled}
					iconClassName="text-red-500 dark:text-red-600"
					label={KPIS[3]!.label}
					size="sm"
					value={KPIS[3]!.value}
					delta={KPIS[3]!.delta}
					deltaInverted
					hint={KPIS[3]!.hint}
					chart={
						<PillMeter
							fraction={OVERVIEW_ERROR_RATE}
							className="text-red-400 dark:text-red-700"
						/>
					}
				/>
			</section>

			{/* Models / Agents / Workflows / Customers breakdown */}
			<section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4 px-8">
				<BreakdownCard title="Models">
					{OVERVIEW_BREAKDOWN.models.map((m) => (
						<BreakdownRow
							key={m.name}
							renderIcon={(cls) => (
								<ModelLogo modelId={m.name} className={cn(cls, "size-3")} />
							)}
							title={m.name}
							value={formatCost(m.cost, 3)}
							fraction={m.fraction}
							color={m.color}
							metrics={m.metrics}
						/>
					))}
				</BreakdownCard>

				<BreakdownCard title="Agents">
					{OVERVIEW_BREAKDOWN.agents.map((a) => (
						<BreakdownRow
							key={a.name}
							onClick={() => openDetail({ type: "agent", id: a.name })}
							renderIcon={(cls) => <AgentIcon name={a.name} className={cls} />}
							title={a.name}
							value={formatCost(a.cost, 3)}
							fraction={a.fraction}
							color={a.color}
							metrics={a.metrics}
						/>
					))}
				</BreakdownCard>

				<BreakdownCard title="Workflows">
					{OVERVIEW_BREAKDOWN.workflows.map((w) => (
						<BreakdownRow
							key={w.name}
							onClick={() => openDetail({ type: "workflow", id: w.name })}
							renderIcon={(cls) => (
								<IconSitemapFilled className={cn(cls, "text-emerald-500")} />
							)}
							title={w.name}
							value={formatCost(w.cost, 3)}
							fraction={w.fraction}
							color={w.color}
							metrics={w.metrics}
						/>
					))}
				</BreakdownCard>

				<BreakdownCard title="Customers">
					{OVERVIEW_BREAKDOWN.customers.map((c) => (
						<BreakdownRow
							key={c.name}
							renderIcon={(cls) => (
								<CustomerAvatar customerId={c.name} filled className={cls} />
							)}
							title={c.name}
							value={formatCost(c.cost, 3)}
							fraction={c.fraction}
							color={c.color}
							metrics={c.metrics}
						/>
					))}
				</BreakdownCard>
			</section>

			{/* Cost over time, stacked by model */}
			<div className="px-8">
				<Card size="sm">
					<CardHeader className="flex flex-row items-center justify-between gap-4">
						<CardTitle>Cost over time</CardTitle>
						<ChartLegend
							items={costItems}
							selected={costSelected}
							onSelect={setCostSelected}
						/>
					</CardHeader>
					<CardContent className="mt-3">
						<BarChart.EvilBarChart
							config={OVERVIEW_COST_CONFIG}
							data={OVERVIEW_COST_SERIES}
							stackType="stacked"
							selectedDataKey={costSelected}
							onSelectionChange={setCostSelected}
							className="h-65 w-full"
							chartProps={{
								// left: 2 (vs Recharts' default 5) tucks the auto-width
								// y-axis labels closer to the card content edge.
								margin: { top: 5, right: 5, bottom: 5, left: 2 },
								// Wider gap between buckets (Recharts default: 10%) keeps
								// the bars slim at any bucket count.
								barCategoryGap: "40%",
							}}
						>
							<BarChart.Grid />
							<BarChart.XAxis
								dataKey="bucket"
								ticks={seriesTicks}
								tickFormatter={bucketLabel}
								interval={0}
								tick={edgeTick}
							/>
							<BarChart.YAxis
								tickFormatter={(v) => costAxisUsd.format(Number(v))}
							/>
							<BarChart.Tooltip
								labelFormatter={(v) => formatBucketFull(String(v))}
								valueFormatter={(v) => formatCost(Number(v))}
								reverse
							/>
							{Object.keys(OVERVIEW_COST_CONFIG).map((k) => (
								<BarChart.Bar key={k} dataKey={k} isClickable />
							))}
						</BarChart.EvilBarChart>
					</CardContent>
				</Card>
			</div>

			{/* Requests & errors + Latency */}
			<section className="grid gap-4 lg:grid-cols-2 px-8">
				<Card size="sm">
					<CardHeader className="flex flex-row items-center justify-between gap-4">
						<CardTitle>Requests & errors</CardTitle>
						<ChartLegend
							items={volumeItems}
							selected={volumeSelected}
							onSelect={setVolumeSelected}
						/>
					</CardHeader>
					<CardContent className="mt-3">
						<AreaChart.EvilAreaChart
							config={volumeConfig}
							data={OVERVIEW_SERIES}
							xDataKey="bucket"
							selectedDataKey={volumeSelected}
							onSelectionChange={setVolumeSelected}
							className="h-65 w-full"
							chartProps={{ margin: { top: 5, right: 5, bottom: 5, left: 2 } }}
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
							<AreaChart.Area dataKey="requests" strokeVariant="solid" />
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
						<CardTitle>Latency</CardTitle>
						<ChartLegend
							items={latencyItems}
							selected={latencySelected}
							onSelect={setLatencySelected}
						/>
					</CardHeader>
					<CardContent className="mt-3">
						<AreaChart.EvilAreaChart
							config={latencyConfig}
							data={latencyData}
							xDataKey="bucket"
							stackType="stacked"
							selectedDataKey={latencySelected}
							onSelectionChange={setLatencySelected}
							className="h-65 w-full"
							chartProps={{ margin: { top: 5, right: 5, bottom: 5, left: 2 } }}
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
							<AreaChart.Area dataKey="p50" strokeVariant="solid" />
							<AreaChart.Area dataKey="p95" strokeVariant="solid" />
							<AreaChart.Area dataKey="p99" strokeVariant="solid" />
						</AreaChart.EvilAreaChart>
					</CardContent>
				</Card>
			</section>
		</>
	);
}

// Shared shell for the four ranked-breakdown cards.
function BreakdownCard({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<Card size="sm" className="pb-0! group-data-[size=sm]/card:pb-0!">
			<CardHeader>
				<CardTitle>{title}</CardTitle>
			</CardHeader>
			<CardContent className="px-0 group-data-[size=sm]/card:px-0!">
				<ScrollFade className="max-h-60">
					<div className="divide-y divide-border/40 pb-6">{children}</div>
				</ScrollFade>
			</CardContent>
		</Card>
	);
}
