"use client";

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@foglamp/ui/components/card";
import { useState } from "react";

import { ScrollFade } from "@/components/app/page-parts";
import { ToolIcon } from "@/components/app/tool-icon";
import {
	ChartLegend,
	formatBucketFull,
	makeBucketLabel,
	makeEdgeTick,
	themed,
	thinTicks,
} from "@/components/app/trend-charts";
import * as BarChart from "@/components/evilcharts/charts/bar-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import {
	formatCost,
	formatCount,
	formatDuration,
	formatPercent,
} from "@/lib/format";
import { cn } from "@foglamp/ui/lib/utils";

import { AGENT_SERIES } from "../mock-data";

// Same category set + colors as the real CostBreakdownCard (only the ones
// with non-zero totals render there; the demo mirrors that active set).
const CATEGORIES = [
	{ key: "input", label: "Input", color: "#F97316", share: 0.36 },
	{ key: "cacheRead", label: "Cached input", color: "#FDBA74", share: 0.14 },
	{ key: "cacheWrite", label: "Cache write", color: "#C2410C", share: 0.06 },
	{ key: "output", label: "Output", color: "#0090FD", share: 0.34 },
	{ key: "reasoning", label: "Reasoning", color: "#93C5FD", share: 0.1 },
] as const;

const costConfig: ChartConfig = Object.fromEntries(
	CATEGORIES.map((c) => [c.key, { label: c.label, colors: themed(c.color) }]),
);

// Per-bucket spend split by price dimension, derived from the span volume so
// the bars track the same daily wave as the other charts.
const COST_DATA = AGENT_SERIES.map((r) => {
	const total = r.spans * 0.00102;
	const row: Record<string, string | number> = { bucket: r.bucket };
	for (const c of CATEGORIES) row[c.key] = total * c.share;
	return row;
});

const WINDOW_MS = 24 * 60 * 60 * 1000;
const bucketLabel = makeBucketLabel(WINDOW_MS);
const edgeTick = makeEdgeTick(bucketLabel);
const costTicks = thinTicks(
	COST_DATA.map((r) => String(r.bucket)),
	bucketLabel,
);

// Y-axis currency capped at 3 decimals so labels stay short (e.g. "$0.026").
const costAxisUsd = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	maximumFractionDigits: 3,
});

export function DemoCostBreakdownCard({ className }: { className?: string }) {
	const [selected, setSelected] = useState<string | null>(null);

	return (
		<Card size="sm" className={className}>
			<CardHeader className="flex flex-row items-center justify-between gap-4">
				<CardTitle>Cost breakdown</CardTitle>
				<ChartLegend
					config={costConfig}
					selected={selected}
					onSelect={setSelected}
				/>
			</CardHeader>
			<CardContent className="mt-3">
				<BarChart.EvilBarChart
					config={costConfig}
					data={COST_DATA}
					stackType="stacked"
					selectedDataKey={selected}
					onSelectionChange={setSelected}
					className="h-[260px] w-full"
					chartProps={{
						margin: { top: 5, right: 5, bottom: 5, left: 2 },
						barCategoryGap: "40%",
					}}
				>
					<BarChart.Grid />
					<BarChart.XAxis
						dataKey="bucket"
						ticks={costTicks}
						tickFormatter={bucketLabel}
						interval={0}
						tick={edgeTick}
					/>
					<BarChart.YAxis tickFormatter={(v) => costAxisUsd.format(Number(v))} />
					<BarChart.Tooltip
						labelFormatter={(v) => formatBucketFull(String(v))}
						valueFormatter={(v) => formatCost(Number(v))}
						reverse
					/>
					{CATEGORIES.map((c) => (
						<BarChart.Bar key={c.key} dataKey={c.key} isClickable />
					))}
				</BarChart.EvilBarChart>
			</CardContent>
		</Card>
	);
}

type DemoTool = {
	toolName: string;
	callCount: number;
	runShare: number;
	p50: number;
	p95: number;
	p99: number;
	errorRate?: number;
};

const TOOLS: DemoTool[] = [
	{
		toolName: "search-knowledge-base",
		callCount: 4210,
		runShare: 0.86,
		p50: 320,
		p95: 940,
		p99: 1620,
	},
	{
		toolName: "fetch-order",
		callCount: 2840,
		runShare: 0.61,
		p50: 210,
		p95: 480,
		p99: 890,
	},
	{
		toolName: "crm-lookup",
		callCount: 1460,
		runShare: 0.34,
		p50: 380,
		p95: 1120,
		p99: 2040,
		errorRate: 0.012,
	},
	{
		toolName: "send-email",
		callCount: 620,
		runShare: 0.14,
		p50: 540,
		p95: 1480,
		p99: 2320,
	},
	{
		toolName: "escalate-ticket",
		callCount: 180,
		runShare: 0.04,
		p50: 260,
		p95: 720,
		p99: 1180,
		errorRate: 0.028,
	},
];

export function DemoToolBreakdownCard({ className }: { className?: string }) {
	const maxCalls = Math.max(1, ...TOOLS.map((t) => t.callCount));

	return (
		<Card
			size="sm"
			className={cn("pb-0! group-data-[size=sm]/card:pb-0!", className)}
		>
			<CardHeader>
				<CardTitle>Tools</CardTitle>
			</CardHeader>
			<CardContent className="mt-1">
				<ScrollFade className="max-h-72 pr-1">
					<div className="divide-y divide-border/40 pb-6">
						{TOOLS.map((t) => (
							<div
								key={t.toolName}
								className="flex items-center justify-between gap-6 px-0.5 py-3 first:pt-0 last:pb-0"
							>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-1.75">
										<ToolIcon
											name={t.toolName}
											className="size-3.25 shrink-0 text-blue-500"
										/>
										<span className="truncate text-sm font-medium">
											{t.toolName}
										</span>
									</div>
									<div className="mt-1 text-xs tabular-nums text-muted-foreground/70">
										p50 {formatDuration(t.p50)} · p95 {formatDuration(t.p95)} ·
										p99 {formatDuration(t.p99)}
										{t.errorRate ? (
											<span className="text-red-500/80">
												{" "}
												· {formatPercent(t.errorRate)} err
											</span>
										) : null}
									</div>
								</div>
								<div className="flex shrink-0 flex-col items-end gap-1">
									<span className="text-sm tabular-nums">
										{formatCount(t.callCount)}
										{t.callCount === 1 ? " call" : " calls"}
									</span>
									<span className="text-xs tabular-nums text-muted-foreground/70">
										{formatPercent(t.runShare)} of runs
									</span>
									<div className="h-0.5 w-14 overflow-hidden rounded-full bg-muted-foreground/10">
										<div
											className="ml-auto h-full rounded-full bg-blue-500"
											style={{
												width: `${Math.max(2, (t.callCount / maxCalls) * 100)}%`,
											}}
										/>
									</div>
								</div>
							</div>
						))}
					</div>
				</ScrollFade>
			</CardContent>
		</Card>
	);
}
