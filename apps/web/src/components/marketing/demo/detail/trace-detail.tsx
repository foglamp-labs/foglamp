"use client";

import { Button } from "@foglamp/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@foglamp/ui/components/card";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@foglamp/ui/components/tooltip";
import { cn } from "@foglamp/ui/lib/utils";
import {
	IconAffiliate,
	IconChevronDown,
	IconChevronUp,
	IconMessage2Filled,
	IconSitemapFilled,
} from "@tabler/icons-react";
import { useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { CopyButton } from "@/components/app/copy-button";
import { CustomerAvatar } from "@/components/app/customer-avatar";
import { ScrollFade } from "@/components/app/page-parts";
import { TraceTimeline } from "@/components/app/trace-timeline";
import { ModelLogo, formatModelName } from "@/components/model-logo";
import {
	formatCost,
	formatDateTime,
	formatDuration,
	formatSpanDuration,
	formatTokens,
} from "@/lib/format";
import type { TraceSpan } from "@/lib/trace-timeline";

import { DemoContextChip, DemoModelChip, DetailHeader } from "../demo-chrome";
import { useDemo } from "../demo-context";
import { TRACE_MESSAGES, TRACE_ROWS, TRACE_SPANS } from "../mock-data";

// The demo trace shape matches the fields TraceTimeline reads (span tree,
// timing, tokens, cost); cast through `unknown` since the real type is deep
// tRPC inference.
const spans = TRACE_SPANS as unknown as TraceSpan[];

// ─── Inspector building blocks — local replicas of the trace page's private
//     BreakdownStrip / Field / TokenSplitBar helpers ─────────────────────────

type StripSegment = {
	label: string;
	value: number;
	color?: string;
	swatch?: string;
	weight?: number;
};

function BreakdownStrip({
	parts,
	format,
	total,
	className,
}: {
	parts: StripSegment[];
	format: (value: number) => string;
	total?: number;
	className?: string;
}) {
	const [hovered, setHovered] = useState<string | null>(null);
	const sum = parts.reduce((acc, p) => acc + p.value, 0);
	const denom = total ?? sum;
	if (parts.length === 0 || sum <= 0 || denom <= 0) return null;
	const share = (value: number) => {
		const pct = (value / denom) * 100;
		return pct < 1 ? "<1%" : `${Math.round(pct)}%`;
	};
	return (
		<span className={cn("flex flex-col gap-3", className)}>
			<span className="flex h-1 w-full gap-px overflow-hidden rounded-[1px]">
				<TooltipProvider>
					{parts.map((p) => (
						<Tooltip key={p.label}>
							<TooltipTrigger
								render={
									<span
										onMouseEnter={() => setHovered(p.label)}
										onMouseLeave={() => setHovered(null)}
										className={cn(
											"h-full cursor-zoom-in transition-opacity",
											p.swatch,
											hovered !== null && hovered !== p.label && "opacity-25",
										)}
										style={{
											width: `${((p.weight ?? p.value) / denom) * 100}%`,
											backgroundColor: p.color,
										}}
									/>
								}
							/>
							<TooltipContent>
								{p.label}: {format(p.value)} · {share(p.value)}
							</TooltipContent>
						</Tooltip>
					))}
				</TooltipProvider>
			</span>
			<span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
				{parts.map((p) => (
					<span
						key={p.label}
						onMouseEnter={() => setHovered(p.label)}
						onMouseLeave={() => setHovered(null)}
						className={cn(
							"inline-flex cursor-zoom-in items-center gap-1.5 transition-opacity",
							hovered !== null && hovered !== p.label && "opacity-40",
						)}
					>
						<span
							className={cn("size-2 rounded-xs", p.swatch)}
							style={{ backgroundColor: p.color }}
						/>
						{p.label} {format(p.value)}
						<span className="text-muted-foreground/60">{share(p.value)}</span>
					</span>
				))}
			</span>
		</span>
	);
}

function Field({
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
			<span className="text-[13px] tabular-nums">{value}</span>
		</div>
	);
}

// Token proportion strip in the cost-category palette (same colors as the
// per-category cost strip, so the two breakdowns visibly rhyme).
function TokenSplitBar({
	input,
	cached,
	output,
}: {
	input: number;
	cached: number;
	output: number;
}) {
	const cachedPart = Math.min(Math.max(cached, 0), input);
	const fresh = input - cachedPart;
	return (
		<BreakdownStrip
			format={formatTokens}
			parts={[
				{ label: "Input", value: fresh, color: "#F97316" },
				{ label: "Cached input", value: cachedPart, color: "#FDBA74" },
				{ label: "Output", value: output, color: "#0090FD" },
			].filter((p) => p.value > 0)}
		/>
	);
}

// ─── Fixed inspector numbers for the demo's support-triage trace ─────────────

const USAGE = { input: 3180, cached: 1240, output: 1095 };
const COST_BY_CATEGORY: StripSegment[] = [
	{ label: "Input", value: 0.0184, color: "#F97316" },
	{ label: "Cached input", value: 0.0031, color: "#FDBA74" },
	{ label: "Output", value: 0.0203, color: "#0090FD" },
];
const COST_BY_MODEL: StripSegment[] = [
	{ label: "gpt-5.6-sol", value: 0.0339, color: "#10a37f" },
	{ label: "gemini-3.5-flash", value: 0.0079, color: "#1ba1e3" },
];
// Wall-clock split of the waterfall: model calls, tool execution, idle gaps.
const TIME_PARTS: StripSegment[] = [
	{ label: "Model", value: 4460, swatch: "bg-violet-500" },
	{ label: "Tools", value: 1080, swatch: "bg-blue-500" },
	{ label: "Idle", value: 300, swatch: "bg-muted-foreground/15" },
];

export function TraceDetail({ traceId }: { traceId: string }) {
	const { closeDetail, openDetail } = useDemo();
	const [selected, setSelected] = useState<string | null>(null);
	const [costMode, setCostMode] = useState<"category" | "model">("category");
	const row = TRACE_ROWS.find((t) => t.traceId === traceId) ?? TRACE_ROWS[0]!;
	const models = [...new Set([row.model, "gemini-3.5-flash"])];

	return (
		<>
			<DetailHeader
				backHref="/traces"
				title={row.traceId}
				titleTrailing={
					<span className="flex min-w-0 items-center gap-0.5">
						<CopyButton value={row.traceId} title="Copy trace ID" />
					</span>
				}
				onBack={closeDetail}
			/>

			{/* Context chips: the owning session / workflow / agent, plus the
			    end-customer this trace served. */}
			<div className="mt-1 flex flex-wrap items-center gap-2 text-xs px-7">
				{row.customer && (
					<DemoContextChip
						icon={(p) => (
							<CustomerAvatar
								customerId={row.customer!}
								customerName={row.customer!}
								filled
								className={p.className}
							/>
						)}
						label={row.customer}
					/>
				)}
				{row.sessionId && (
					<DemoContextChip
						icon={IconMessage2Filled}
						iconClassName="text-sky-500"
						label={row.sessionId}
						onClick={() => openDetail({ type: "session", id: row.sessionId! })}
					/>
				)}
				{row.workflowName && (
					<DemoContextChip
						icon={IconSitemapFilled}
						iconClassName="text-emerald-500"
						label={row.workflowName}
						onClick={() =>
							openDetail({ type: "workflow", id: row.workflowName! })
						}
					/>
				)}
				<DemoContextChip
					icon={(p) => (
						<AgentIcon name={row.agentName} filled className={p.className} />
					)}
					label={row.agentName}
					onClick={() => openDetail({ type: "agent", id: row.agentName })}
				/>
				<DemoModelChip models={models} />
			</div>

			{/* Waterfall + the always-open whole-trace inspector, like the app. */}
			<div className="flex items-start gap-6 px-8 mt-2">
				<div className="min-w-0 flex-1">
					<TraceTimeline
						spans={spans}
						selected={selected}
						onSelect={setSelected}
					/>
				</div>

				<aside className="sticky top-4 w-105 shrink-0 self-start">
					<Card className="max-h-[calc(100svh-14rem)] gap-0 py-0">
						<CardHeader className="flex shrink-0 items-center gap-2 p-5 px-5 pb-1">
							<CardTitle className="flex min-w-0 flex-1 items-center gap-2">
								<span className="flex size-4.5 shrink-0 items-center shadow-[inset_0_0_0_1px_rgba(100,116,139,0.14),0_2px_6px_-2px_rgba(100,116,139,0.25)] dark:shadow-(--custom-shadow) justify-center rounded-md corner-squircle bg-primary/15 text-primary">
									<IconAffiliate className="size-3" />
								</span>
								<span className="truncate">Whole trace</span>
							</CardTitle>
							<div className="flex shrink-0 items-center gap-1">
								<Button
									type="button"
									size="xs"
									variant="ghost"
									className="text-muted-foreground/60 hover:text-foreground"
								>
									Raw
								</Button>
								<Button
									type="button"
									size="icon-xs"
									variant="ghost"
									className="text-muted-foreground/60 hover:text-foreground"
									disabled
									aria-label="Previous span"
								>
									<IconChevronUp className="size-4 text-current" />
								</Button>
								<Button
									type="button"
									size="icon-xs"
									variant="ghost"
									className="text-muted-foreground/60 hover:text-foreground"
									aria-label="Next span"
								>
									<IconChevronDown className="size-4 text-current" />
								</Button>
								<CopyButton
									value={row.traceId}
									title="Copy trace summary as JSON"
								/>
							</div>
						</CardHeader>
						<CardContent className="flex min-h-0 flex-1 flex-col p-0">
							<ScrollFade
								containerClassName="flex min-h-0 flex-1 flex-col"
								className="flex min-h-0 flex-1 flex-col gap-4 py-5"
							>
								<div className="grid grid-cols-2 gap-4 border-b border-border/40 pb-5 px-5">
									<Field
										label="Started"
										value={formatDateTime("2026-06-07 14:30:00")}
									/>
									<Field
										label="Models"
										value={
											<span className="flex flex-col gap-1.5">
												{models.map((m) => (
													<span
														key={m}
														className="flex min-w-0 items-center gap-1.5"
													>
														<ModelLogo
															modelId={m}
															className="size-3 shrink-0"
														/>
														<span className="truncate" title={m}>
															{formatModelName(m)}
														</span>
													</span>
												))}
											</span>
										}
									/>
									<Field
										label="Duration"
										value={formatSpanDuration(row.durationMs)}
									/>
									<Field label="Cost" value={formatCost(row.costValue)} />
									<Field
										label="Tokens"
										className="-mx-5 col-span-2 border-t border-border/40 px-5 pt-4"
										value={
											<span className="flex flex-col gap-2">
												{formatTokens(row.tokens)}
												<TokenSplitBar
													input={USAGE.input}
													cached={USAGE.cached}
													output={USAGE.output}
												/>
											</span>
										}
									/>
								</div>

								{/* One section for the spend, viewable by category or model. */}
								<div className="flex flex-col gap-3 border-b border-border/40 py-5 px-5">
									<div className="flex items-start justify-between gap-2">
										<div className="flex min-w-0 flex-col gap-1">
											<span className="text-xs text-muted-foreground">
												Cost breakdown
											</span>
											<span className="text-[13px] tabular-nums">
												{formatCost(row.costValue)}
											</span>
										</div>
										<div className="flex items-center gap-2 text-[11px]">
											{(
												[
													["category", "By category"],
													["model", "By model"],
												] as const
											).map(([value, label]) => (
												<button
													key={value}
													type="button"
													onClick={() => setCostMode(value)}
													className={cn(
														"cursor-pointer transition-colors",
														costMode === value
															? "font-medium text-foreground"
															: "text-muted-foreground hover:text-foreground",
													)}
												>
													{label}
												</button>
											))}
										</div>
									</div>
									<BreakdownStrip
										parts={
											costMode === "category"
												? COST_BY_CATEGORY
												: COST_BY_MODEL
										}
										format={formatCost}
									/>
								</div>

								<div className="flex flex-col gap-3 border-b border-border/40 py-5 px-5">
									<div className="flex min-w-0 flex-col gap-1">
										<span className="text-xs text-muted-foreground">
											Time distribution
										</span>
										<span className="text-[13px] tabular-nums">
											{formatSpanDuration(row.durationMs)}
										</span>
									</div>
									<BreakdownStrip
										parts={TIME_PARTS}
										total={row.durationMs}
										format={formatDuration}
									/>
								</div>

								{/* Root input/output — the conversation, readable without
								    hunting down the waterfall. */}
								<div className="flex flex-col gap-3 border-b border-border/40 px-5 py-5">
									<span className="text-xs text-muted-foreground">Input</span>
									{TRACE_MESSAGES.filter((m) => m.role !== "assistant").map(
										(m, i) => (
											<div key={i} className="flex flex-col gap-1">
												<span className="text-[11px] font-medium text-muted-foreground capitalize">
													{m.role}
												</span>
												<p className="text-[13px] text-pretty">{m.content}</p>
											</div>
										),
									)}
								</div>
								<div className="flex flex-col gap-3 px-5 pt-5">
									<span className="text-xs text-muted-foreground">Output</span>
									{TRACE_MESSAGES.filter((m) => m.role === "assistant").map(
										(m, i) => (
											<p key={i} className="text-[13px] text-pretty">
												{m.content}
											</p>
										),
									)}
								</div>
							</ScrollFade>
						</CardContent>
					</Card>
				</aside>
			</div>
		</>
	);
}
