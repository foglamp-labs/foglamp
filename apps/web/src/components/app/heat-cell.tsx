"use client";

import { TableCell } from "@foglamp/ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@foglamp/ui/components/tooltip";
import { cn } from "@foglamp/ui/lib/utils";
import type { ReactNode } from "react";

// Traffic-light shades for the five quintile buckets. Green = cheapest/fastest,
// red = priciest/slowest. Light uses 600, dark uses 400 for contrast. Literal
// classes so Tailwind keeps them.
export const HEAT_SHADES = [
	"text-green-600 dark:text-green-400",
	"text-yellow-600 dark:text-yellow-400",
	"text-amber-600 dark:text-amber-400",
	"text-orange-600 dark:text-orange-400",
	"text-red-600 dark:text-red-400",
] as const;

// Labels for the five quintile buckets, shown in cell tooltips.
export const PCT_RANGE = [
	"0–20th",
	"20–40th",
	"40–60th",
	"60–80th",
	"80–100th",
] as const;

/** Which quintile bucket (0..4) `value` falls in against the global `thresholds`
 * (the 20/40/60/80th percentiles). null when there's nothing to place. */
export function percentileBucket(
	value: number | null | undefined,
	thresholds: number[],
) {
	if (!value || value <= 0 || thresholds.length === 0) return null;
	let i = 0;
	for (const t of thresholds) if (value > t) i += 1;
	return Math.min(i, HEAT_SHADES.length - 1);
}

/** A right-aligned numeric cell tinted by its percentile bucket, with a tooltip
 * naming the bucket. Unbucketed values render plain — muted for null/unpriced.
 *
 * - `metric` controls tooltip wording: "cost" (default) → "cheapest/priciest",
 *   "duration" → "fastest/slowest", "spend" → "cheapest/priciest" with "by spend".
 * - `bold` applies `font-medium` to the cell text.
 * - `mutedWhenZero` also dims zero-cost cells (use when zero is unpriced). */
export function HeatCell({
	value,
	thresholds,
	metric = "cost",
	bold,
	mutedWhenZero,
	children,
}: {
	value: number | null | undefined;
	thresholds: number[];
	metric?: "cost" | "duration" | "spend";
	bold?: boolean;
	mutedWhenZero?: boolean;
	children: ReactNode;
}) {
	const bucket = percentileBucket(value, thresholds);
	const muted = mutedWhenZero ? value == null || value <= 0 : value == null;
	const className = cn(
		"text-right tabular-nums",
		bold && "font-medium",
		muted ? "text-muted-foreground/40" : bucket != null && HEAT_SHADES[bucket],
	);
	if (bucket == null) {
		return <TableCell className={className}>{children}</TableCell>;
	}
	const tip = buildTip(bucket, metric);
	return (
		<TableCell className={className}>
			<Tooltip>
				<TooltipTrigger render={<span className="cursor-default" />}>
					{children}
				</TooltipTrigger>
				<TooltipContent>{tip}</TooltipContent>
			</Tooltip>
		</TableCell>
	);
}

function buildTip(bucket: number, metric: "cost" | "duration" | "spend") {
	if (metric === "duration") {
		const extreme =
			bucket === 0 ? " · fastest" : bucket === 4 ? " · slowest" : "";
		return `${PCT_RANGE[bucket]} percentile by duration${extreme}`;
	}
	const label = metric === "spend" ? "spend" : "cost";
	const extreme =
		bucket === 0 ? " · cheapest" : bucket === 4 ? " · priciest" : "";
	return `${PCT_RANGE[bucket]} percentile by ${label}${extreme}`;
}
