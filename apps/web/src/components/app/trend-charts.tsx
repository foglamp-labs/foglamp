"use client";

import { useTheme } from "next-themes";
import { useCallback, useRef } from "react";
import { Text as RechartsText } from "recharts";

import { useRange } from "@/components/app/range-context";
import type { ChartConfig } from "@/components/evilcharts/ui/chart";
import { type RangeValue, exactRange } from "@/lib/range";
import { cn } from "@/lib/utils";

// Evil Charts wants `colors: { light, dark }`; our --chart-* vars adapt to the
// theme already, so the same value serves both.
export const themed = (color: string) => ({ light: [color], dark: [color] });

/** Clickable legend for the trend charts. Lives in the card header so it lines
 * up with the description, and drives the chart's selection in a controlled way.
 * Swatch colors are resolved from the config for the active theme. */
export function ChartLegend({
	config,
	selected,
	onSelect,
}: {
	config: ChartConfig;
	selected: string | null;
	onSelect: (key: string | null) => void;
}) {
	// Honor a forced theme (the marketing demo forces dark) before the user's
	// stored theme, which next-themes still reports via resolvedTheme.
	const { resolvedTheme, forcedTheme } = useTheme();
	const mode = (forcedTheme ?? resolvedTheme) === "dark" ? "dark" : "light";

	return (
		<div className="flex items-center gap-3 select-none">
			{Object.entries(config).map(([key, entry]) => {
				const color = entry.colors?.[mode]?.[0] ?? entry.colors?.light?.[0];
				const dimmed = selected !== null && selected !== key;
				const active = selected === key;
				return (
					<button
						key={key}
						type="button"
						onClick={() => onSelect(selected === key ? null : key)}
						className={cn(
							"text-muted-foreground flex items-center cursor-pointer gap-1.5 text-sm transition-all hover:text-foreground",
							dimmed && "opacity-30",
							active && "text-foreground",
						)}
					>
						<span
							className="h-2 w-2 shrink-0 rounded-2xl corner-squircle"
							style={{ backgroundColor: color }}
						/>
						{entry.label}
					</button>
				);
			})}
		</div>
	);
}

/** A bucket-axis label: time-of-day for short windows, month/day for spans over
 * ~2 days (where bare times would repeat across days). */
export function makeBucketLabel(windowMs: number) {
	const multiDay = windowMs > 2 * 86_400_000;
	return (bucket: string) => {
		const d = new Date(`${bucket.replace(" ", "T")}Z`);
		if (Number.isNaN(d.getTime())) return bucket;
		return multiDay
			? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
			: d.toLocaleTimeString(undefined, {
					hour: "2-digit",
					minute: "2-digit",
					hour12: false,
				});
	};
}

/** A full date+time label for tooltips, where every bucket should stay
 * distinguishable even when the axis only shows the day. */
export function formatBucketFull(bucket: string) {
	const d = new Date(`${bucket.replace(" ", "T")}Z`);
	if (Number.isNaN(d.getTime())) return bucket;
	return d.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

/** One representative bucket per distinct axis label, so the x-axis shows e.g.
 * a single "May 29" tick instead of one per sub-day bucket. */
export function dedupeTicks(buckets: string[], labelFn: (b: string) => string) {
	const ticks: string[] = [];
	let last: string | null = null;
	for (const b of buckets) {
		const l = labelFn(b);
		if (l !== last) {
			ticks.push(b);
			last = l;
		}
	}
	return ticks;
}

/** Thin the per-label representatives down to ~`target` evenly-spaced ticks,
 * always keeping both endpoints. Crucially, the final tick is held a full step
 * away from its neighbour (replacing the penultimate pick when needed) so the
 * end-anchored last label doesn't crowd the one before it. */
export function thinTicks(
	buckets: string[],
	labelFn: (b: string) => string,
	target = 8,
) {
	let reps = dedupeTicks(buckets, labelFn);
	if (reps.length > 1) {
		const pos = new Map(buckets.map((b, i) => [b, i]));
		const at = (b: string) => pos.get(b) ?? 0;
		// Ticks closer together than this many buckets render overlapping labels
		// (~7% of the axis width). Spacing must be enforced positionally: sparse
		// series (e.g. an agent idle for most of a day) make periods unequally
		// wide, so "one tick per day" alone doesn't guarantee separation.
		const minGap = Math.max(1, Math.ceil(buckets.length / 14));
		// A partial leading period (e.g. a "last 7 days" range starting at 22:00)
		// puts its rep a sliver left of the next label — drop it and let the
		// first full period anchor the left edge instead.
		if (reps.length >= 2 && at(reps[1]!) - at(reps[0]!) < minGap)
			reps = reps.slice(1);
		// Greedy min-spacing pass that always keeps the final rep: drop any rep
		// that crowds its kept predecessor, and before appending the endpoint pop
		// kept reps that would crowd *it* (the end-anchored label needs the same
		// clearance).
		const kept: string[] = [reps[0]!];
		for (let i = 1; i < reps.length - 1; i++) {
			if (at(reps[i]!) - at(kept[kept.length - 1]!) >= minGap)
				kept.push(reps[i]!);
		}
		const last = reps[reps.length - 1]!;
		if (last !== kept[kept.length - 1]) {
			while (kept.length > 0 && at(last) - at(kept[kept.length - 1]!) < minGap)
				kept.pop();
			kept.push(last);
		}
		reps = kept;
	}
	const n = reps.length;
	if (n <= target) return reps;
	const step = Math.ceil((n - 1) / (target - 1));
	const idx: number[] = [];
	for (let i = 0; i < n - 1; i += step) idx.push(i);
	if (n - 1 - idx[idx.length - 1]! < step) idx[idx.length - 1] = n - 1;
	else idx.push(n - 1);
	return idx.map((i) => reps[i]!);
}

/**
 * An x-axis tick renderer that anchors the first label to its start and the last
 * to its end, so the edge labels tuck inward instead of overhanging the plot —
 * keeping the chart data full-bleed (no plot-area padding). Middle labels stay
 * centred. Inherits the muted axis color/size from the ChartContainer CSS since
 * it renders inside the `.recharts-cartesian-axis-tick` group.
 */
export function makeEdgeTick(labelFn: (b: string) => string) {
	return function EdgeTick(props: {
		x?: string | number;
		y?: string | number;
		index?: number;
		visibleTicksCount?: number;
		payload?: { value: string | number };
	}) {
		const { x = 0, y = 0, index = 0, visibleTicksCount = 0, payload } = props;
		const anchor =
			index === 0
				? "start"
				: index === visibleTicksCount - 1
					? "end"
					: "middle";
		return (
			<RechartsText
				x={Number(x)}
				y={Number(y)}
				dy={4}
				textAnchor={anchor}
				verticalAnchor="start"
			>
				{payload ? labelFn(String(payload.value)) : ""}
			</RechartsText>
		);
	};
}

/** Page numbers to render (1-based), collapsing long runs to a single ellipsis,
 * e.g. `1 … 4 5 6 … 20`. */
export function pageWindow(
	current: number,
	total: number,
): (number | "ellipsis")[] {
	if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
	const middle: number[] = [];
	for (
		let i = Math.max(2, current - 1);
		i <= Math.min(total - 1, current + 1);
		i++
	)
		middle.push(i);
	const out: (number | "ellipsis")[] = [1];
	if (middle[0] > 2) out.push("ellipsis");
	out.push(...middle);
	if (middle[middle.length - 1] < total - 1) out.push("ellipsis");
	out.push(total);
	return out;
}

/** A bucket string ("YYYY-MM-DD HH:MM:SS", UTC) → epoch ms, or NaN. */
export function parseBucket(bucket: string): number {
	return new Date(`${bucket.replace(" ", "T")}Z`).getTime();
}

/** Bucket width the server picks for a window — client-side mirror of the
 * API's `pickBucketSec` (packages/api/src/lib/util.ts). Keep the two in sync:
 * gap filling only works when the generated grid matches the server's. */
export function pickBucketMs(windowMs: number): number {
	const target = windowMs / 1000 / 50;
	const steps = [
		60, 120, 300, 600, 900, 1800, 3600, 7200, 10_800, 21_600, 43_200, 86_400,
	];
	return (steps.find((s) => s >= target) ?? 86_400) * 1000;
}

/**
 * Zero-fills the gaps the main timeseries query leaves for empty buckets (it
 * has no `WITH FILL`), so quiet periods keep their real width on the x-axis
 * instead of compressing. Rows are keyed by parsed epoch, gaps get rows from
 * `makeEmpty`. Bails out — returning the rows untouched — if any row doesn't
 * sit on the expected grid or the grid would be implausibly large.
 *
 * Pass `stale` (the query's `isPlaceholderData`) when the rows may belong to a
 * previous window kept on screen during a refetch: rows on a different bucket
 * grid then freeze as-is until the fresh response lands — one clean transition
 * instead of an intermediate mis-bucketed render — while rows that share the
 * new window's grid still fill immediately (they're valid data for it).
 */
export function fillBuckets<T extends { bucket: string }>(
	rows: T[],
	from: Date,
	to: Date,
	makeEmpty: (bucket: string) => T,
	stale = false,
): T[] {
	// An empty result set stays empty (pages detect "no data" by length), and a
	// degenerate window has no grid to fill.
	if (rows.length === 0) return rows;
	const fromMs = from.getTime();
	const toMs = to.getTime();
	if (!(toMs > fromMs)) return rows;

	const bucketMs = pickBucketMs(toMs - fromMs);
	// ClickHouse's toStartOfInterval aligns buckets to the epoch.
	const start = Math.floor(fromMs / bucketMs) * bucketMs;
	const count = Math.ceil((toMs - start) / bucketMs);
	if (count <= 0 || count > 1000) return rows;

	const byEpoch = new Map<number, T>();
	const epochs: number[] = [];
	let onGrid = true;
	for (const row of rows) {
		const t = parseBucket(row.bucket);
		if (Number.isNaN(t)) return rows;
		if ((t - start) % bucketMs !== 0) onGrid = false;
		epochs.push(t);
		byEpoch.set(t, row);
	}
	if (stale) {
		// Rows kept on screen from a previous window (placeholderData). Coarser
		// buckets often still sit on the finer grid (the widths divide evenly),
		// so filling them would weave zeros between the real rows and flash a
		// comb pattern; check the rows' own cadence — the smallest gap between
		// consecutive buckets — and freeze the old chart untouched unless it
		// matches the new window's grid exactly.
		epochs.sort((a, b) => a - b);
		let cadence: number | null = null;
		for (let i = 1; i < epochs.length; i++) {
			const gap = epochs[i]! - epochs[i - 1]!;
			if (cadence === null || gap < cadence) cadence = gap;
		}
		if (!onGrid || (cadence !== null && cadence !== bucketMs)) return rows;
	}
	if (!onGrid) return rows;

	const out: T[] = [];
	for (let t = start; t < toMs; t += bucketMs) {
		const existing = byEpoch.get(t);
		out.push(
			existing ??
				makeEmpty(new Date(t).toISOString().slice(0, 19).replace("T", " ")),
		);
	}
	return out;
}

// The zoom-undo session, shared by every useZoomRange instance: the date range
// is one global filter, so a zoom started on any chart (or card) must be
// undoable by a double-click on any other. `prev` is the range to restore —
// captured before the first zoom of a chain — and `zoomed` is the range the
// last zoom set, compared *by identity* against the live range so a manual
// range change (the picker) invalidates the session instead of being clobbered
// by a later double-click.
let zoomSession: { prev: RangeValue; zoomed: RangeValue } | null = null;

/**
 * Drag-to-zoom glue between a chart and the global date filter: `zoomTo` maps
 * a selected bucket range to an exact absolute range ending at the bucket the
 * drag released on — exactly the span the selection overlay covered — and
 * `reset` restores the range that was active before the first zoom.
 */
export function useZoomRange() {
	const { range, setRange } = useRange();
	const rangeRef = useRef(range);
	rangeRef.current = range;

	const zoomTo = useCallback(
		(fromBucket: string, toBucket: string) => {
			const current = rangeRef.current;
			const fromMs = parseBucket(fromBucket);
			const toMs = parseBucket(toBucket);
			if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return;
			const start = Math.max(fromMs, current.from.getTime());
			const end = Math.min(toMs, current.to.getTime());
			if (end <= start) return;
			const next = exactRange(new Date(start), new Date(end));
			// Chain onto the open session only while the live range is still the
			// one our last zoom set; anything else starts a fresh session.
			zoomSession = {
				prev: zoomSession?.zoomed === current ? zoomSession.prev : current,
				zoomed: next,
			};
			setRange(next);
		},
		[setRange],
	);

	const reset = useCallback(() => {
		if (zoomSession === null) return;
		if (zoomSession.zoomed === rangeRef.current) setRange(zoomSession.prev);
		zoomSession = null;
	}, [setRange]);

	return { zoomTo, reset };
}
