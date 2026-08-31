"use client";

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@foglamp/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { useProject } from "@/components/app/project-context";
import { useRange } from "@/components/app/range-context";
import {
	ChartLegend,
	formatBucketFull,
	makeBucketLabel,
	makeEdgeTick,
	themed,
	thinTicks,
	useZoomRange,
} from "@/components/app/trend-charts";
import * as BarChart from "@/components/evilcharts/charts/bar-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { formatCost } from "@/lib/format";
import { trpc } from "@/utils/trpc";
import { cn } from "@foglamp/ui/lib/utils";

// Price dimensions in stack order (bottom → top), grouped into two color
// families: the input side in oranges (fresh input, cached input, cache
// write) and the output side in blues (output, reasoning). Colors are fixed
// per category — a range with no cache writes must not repaint the survivors.
// Note: providers only cache *input* tokens, so there is no "cached output"
// dimension — cache read cost IS the cached share of input.
const CATEGORIES = [
	{ key: "input", label: "Input", color: "#F97316" },
	{ key: "cacheRead", label: "Cached input", color: "#FDBA74" },
	{ key: "cacheWrite", label: "Cache write", color: "#C2410C" },
	{ key: "output", label: "Output", color: "#0090FD" },
	{ key: "reasoning", label: "Reasoning", color: "#93C5FD" },
	{ key: "other", label: "Other", color: "var(--muted-foreground)" },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

// Y-axis currency capped at 3 decimals so labels stay short (e.g. "$0.026").
const costAxisUsd = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	maximumFractionDigits: 3,
});

/**
 * Cost over time stacked by price dimension (input / output / cache read /
 * cache write / reasoning / other), scoped to the whole project or to one
 * agent or workflow. Reusable: mount it on any detail page and pass the scope.
 */
export function CostBreakdownCard({
	agentName,
	workflowName,
	title = "Cost breakdown",
	className,
	syncId,
}: {
	agentName?: string;
	workflowName?: string;
	title?: string;
	className?: string;
	/** Recharts sync group — pass the host page's id to share its crosshair. */
	syncId?: string;
}) {
	const { projectId } = useProject();
	const { range } = useRange();
	const zoom = useZoomRange();
	const from = range.from.toISOString();
	const to = range.to.toISOString();
	const windowMs = range.to.getTime() - range.from.getTime();
	const bucketLabel = useMemo(() => makeBucketLabel(windowMs), [windowMs]);
	const edgeTick = useMemo(() => makeEdgeTick(bucketLabel), [bucketLabel]);

	const [selected, setSelected] = useState<string | null>(null);
	// The visible category set can change with the range, so a stale selection
	// could point at a series that no longer renders.
	useEffect(() => setSelected(null), [from, to]);

	const query = useQuery({
		...trpc.metrics.costByCategory.queryOptions({
			projectId: projectId!,
			from,
			to,
			agentName,
			workflowName,
		}),
		enabled: !!projectId,
		// Keep the previous range's bars on screen while the new range loads —
		// matches the other charts on the detail pages, which would otherwise
		// sit still while this card alone flashes its loading shimmer.
		placeholderData: (prev) => prev,
	});

	const { data, config, keys, ticks, empty } = useMemo(() => {
		const rows = query.data ?? [];
		const totals: Record<CategoryKey, number> = {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			reasoning: 0,
			other: 0,
		};
		const data = rows.map((r) => {
			const row: Record<string, string | number> = { bucket: r.bucket };
			row.input = r.inputCost;
			row.output = r.outputCost;
			row.cacheRead = r.cacheReadCost;
			row.cacheWrite = r.cacheWriteCost;
			row.reasoning = r.reasoningCost;
			row.other = r.otherCost;
			for (const c of CATEGORIES) totals[c.key] += Number(row[c.key]) || 0;
			return row;
		});
		// Only categories that actually cost something get a series — reasoning
		// and "other" are usually all-zero and would just clutter the legend.
		const active = CATEGORIES.filter((c) => totals[c.key] > 0);
		const config: ChartConfig = {};
		for (const c of active)
			config[c.key] = { label: c.label, colors: themed(c.color) };
		return {
			data,
			config,
			keys: active.map((c) => c.key),
			ticks: thinTicks(
				rows.map((r) => r.bucket),
				bucketLabel,
			),
			empty: !query.isLoading && active.length === 0,
		};
	}, [query.data, query.isLoading, bucketLabel]);

	// Dash-hatch the trailing bar only when the last bucket is still filling.
	const lastBucketLive = useMemo(() => {
		if (data.length < 2) return false;
		const ms = (b: string) => new Date(`${b.replace(" ", "T")}Z`).getTime();
		const last = ms(String(data[data.length - 1]!.bucket));
		const prev = ms(String(data[data.length - 2]!.bucket));
		if (Number.isNaN(last) || Number.isNaN(prev)) return false;
		return Date.now() < last + (last - prev);
	}, [data]);

	return (
		<Card size="sm" className={className}>
			<CardHeader className="flex flex-row items-center justify-between gap-4">
				<CardTitle>{title}</CardTitle>
				{keys.length > 0 && (
					<ChartLegend
						config={config}
						selected={selected}
						onSelect={setSelected}
					/>
				)}
			</CardHeader>
			<CardContent className="mt-3">
				<div className="relative">
					<BarChart.EvilBarChart
						config={config}
						data={data}
						stackType="stacked"
						xDataKey="bucket"
						syncId={syncId}
						onZoomSelect={empty ? undefined : zoom.zoomTo}
						onZoomReset={zoom.reset}
						selectedDataKey={selected}
						onSelectionChange={setSelected}
						isLoading={query.isLoading}
						className={cn("h-[260px] w-full", empty && "opacity-40")}
						chartProps={{
							margin: { top: 5, right: 5, bottom: 5, left: 2 },
							barCategoryGap: "40%",
						}}
					>
						<BarChart.Grid />
						<BarChart.XAxis
							dataKey="bucket"
							ticks={ticks}
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
						{keys.map((k) => (
							<BarChart.Bar
								key={k}
								dataKey={k}
								isClickable
								bufferBar={lastBucketLive}
							/>
						))}
					</BarChart.EvilBarChart>
					{empty && (
						<p className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
							No cost recorded in this range.
						</p>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
