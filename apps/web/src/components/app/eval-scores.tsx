"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@foglamp/ui/components/badge";
import {
	IconArrowUpRight,
	IconCircleCheckFilled,
	IconForbidFilled,
	IconGauge,
} from "@tabler/icons-react";
import Link from "next/link";

import { FAMILY_CHIP, presetMeta } from "@/app/(app)/evals/preset-meta";
import type { RouterOutputs } from "@/utils/trpc";

export type TraceScore = RouterOutputs["evals"]["traceScores"][number];
export type EvalMeta = RouterOutputs["evals"]["list"][number];

/** The eval-run deep link for a score (focuses that run on the eval page). */
export function scoreHref(s: TraceScore): string {
	return `/evals/${encodeURIComponent(s.evalId)}?score=${encodeURIComponent(
		s.scoreId,
	)}`;
}

/** Everything the score chips need, resolved from the score + its eval meta:
 * the check icon, a result-tinted chip class (green pass / red fail / family
 * color otherwise), and friendly eval + check names. */
export function describeScore(
	s: TraceScore,
	meta: EvalMeta | undefined,
	presetName: Map<string, string>,
) {
	const presetId = meta?.presetId;
	const pm = presetId ? presetMeta(presetId) : null;
	const CheckIcon = pm?.outline ?? IconGauge;
	const chipClass =
		s.passed === true
			? "bg-emerald-100 text-emerald-500 dark:bg-emerald-950 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.14),0_2px_6px_-2px_rgba(16,185,129,0.25)] dark:shadow-(--custom-shadow)"
			: s.passed === false
				? "bg-rose-100 text-rose-500 dark:bg-rose-950 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.14),0_2px_6px_-2px_rgba(244,63,94,0.25)] dark:shadow-(--custom-shadow)"
				: pm
					? FAMILY_CHIP[pm.family]
					: "bg-muted text-muted-foreground";
	const evalName = meta?.name ?? s.evalId;
	const checkName = presetId
		? (presetName.get(presetId) ??
			presetId.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()))
		: s.scorer === "llm"
			? "LLM judge"
			: "Code check";
	return { CheckIcon, chipClass, evalName, checkName };
}

/** Short human result for a score, for tooltips. */
export function scoreResultLabel(s: TraceScore): string {
	if (s.passed !== null) return s.passed ? "pass" : "fail";
	if (s.score !== null) return String(s.score);
	return "scored";
}

/** Compact, at-a-glance eval indicators for one span — a tinted check-icon chip
 * per score (green pass / red fail), capped with a `+N` overflow. Non-interactive
 * (lives inside the waterfall's row button); the full clickable detail shows in
 * the span inspector. */
export function SpanScoreDots({
	scores,
	evalMeta,
	presetName,
	max = 3,
	className,
}: {
	scores: TraceScore[];
	evalMeta: Map<string, EvalMeta>;
	presetName: Map<string, string>;
	max?: number;
	className?: string;
}) {
	if (scores.length === 0) return null;
	const shown = scores.slice(0, max);
	const extra = scores.length - shown.length;
	return (
		<span className={cn("flex shrink-0 items-center gap-1", className)}>
			{shown.map((s) => {
				const { CheckIcon, chipClass, evalName, checkName } = describeScore(
					s,
					evalMeta.get(s.evalId),
					presetName,
				);
				return (
					<span
						key={s.scoreId}
						title={`${evalName} · ${checkName}: ${scoreResultLabel(s)}`}
						className={cn(
							"flex size-4 items-center justify-center rounded-md corner-squircle",
							chipClass,
						)}
					>
						<CheckIcon className="size-2.5" />
					</span>
				);
			})}
			{extra > 0 && (
				<span className="text-[10px] text-muted-foreground tabular-nums">
					+{extra}
				</span>
			)}
		</span>
	);
}

/** A clickable whole-trace eval result — a tinted check chip + eval name + the
 * pass/fail/score, linking through to that run on the eval page. */
export function TraceScorePill({
	score: s,
	meta,
	presetName,
}: {
	score: TraceScore;
	meta: EvalMeta | undefined;
	presetName: Map<string, string>;
}) {
	const { CheckIcon, chipClass, evalName, checkName } = describeScore(
		s,
		meta,
		presetName,
	);
	return (
		<Link
			// biome-ignore lint/suspicious/noExplicitAny: app routes are typed as Route
			href={scoreHref(s) as any}
			title={`${evalName} · ${checkName}`}
			className="group inline-flex items-center gap-1.5 rounded-full bg-card py-1 pr-2 pl-1 text-xs text-muted-foreground shadow-(--custom-shadow) transition-colors hover:text-foreground"
		>
			<span
				className={cn(
					"flex size-5 items-center justify-center rounded-full",
					chipClass,
				)}
			>
				<CheckIcon className="size-3" />
			</span>
			<span className="max-w-40 truncate font-medium text-foreground">
				{evalName}
			</span>
			<ScoreResult score={s} compact />
			<IconArrowUpRight className="size-3 shrink-0 -ml-0.5" />
		</Link>
	);
}

/** The pass / fail / numeric-score badge for a single score. `compact` renders
 * a borderless inline glyph for use inside a pill. */
export function ScoreResult({
	score: s,
	compact = false,
}: {
	score: TraceScore;
	compact?: boolean;
}) {
	if (compact) {
		if (s.passed !== null) {
			return s.passed ? (
				<IconCircleCheckFilled className="size-3.5 shrink-0 text-emerald-500" />
			) : (
				<IconForbidFilled className="size-3.5 shrink-0 text-rose-500" />
			);
		}
		if (s.score !== null) {
			return (
				<span className="shrink-0 tabular-nums text-foreground">
					{s.score.toFixed(2)}
				</span>
			);
		}
		return null;
	}
	if (s.passed !== null) {
		return (
			<Badge variant={s.passed ? "emerald" : "rose"} className="shrink-0">
				{s.passed ? <IconCircleCheckFilled /> : <IconForbidFilled />}
				{s.passed ? "pass" : "fail"}
			</Badge>
		);
	}
	if (s.score !== null) {
		return (
			<Badge variant="secondary" className="shrink-0">
				<IconGauge />
				<span className="tabular-nums">{s.score.toFixed(2)}</span>
			</Badge>
		);
	}
	return <span className="shrink-0 text-xs text-muted-foreground">—</span>;
}

/** A single eval result for a target — the check's icon + name, the eval name,
 * its result and reason, linking to that run on the eval page. */
export function ScoreRow({
	score: s,
	meta,
	presetName,
}: {
	score: TraceScore;
	meta: EvalMeta | undefined;
	presetName: Map<string, string>;
}) {
	const { CheckIcon, chipClass, evalName, checkName } = describeScore(
		s,
		meta,
		presetName,
	);
	return (
		<Link
			// biome-ignore lint/suspicious/noExplicitAny: app routes are typed as Route
			href={scoreHref(s) as any}
			className="group flex items-center gap-3 rounded-md squircle:rounded-2xl corner-squircle py-2 hover:bg-accent px-2"
		>
			<span
				className={cn(
					"flex size-8 shrink-0 items-center justify-center rounded-lg",
					chipClass,
				)}
			>
				<CheckIcon className="size-4" />
			</span>
			<div className="flex min-w-0 flex-1 flex-col">
				<div className="flex items-baseline gap-1.5">
					<span className="truncate text-sm font-medium">{evalName}</span>
					<span className="shrink-0 text-xs text-muted-foreground">
						· {checkName}
					</span>
				</div>
				{s.reason && (
					<p
						className="truncate text-xs text-muted-foreground/80"
						title={s.reason}
					>
						{s.reason}
					</p>
				)}
			</div>
			<ScoreResult score={s} />
			<IconArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
		</Link>
	);
}
