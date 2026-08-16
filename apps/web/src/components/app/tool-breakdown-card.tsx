"use client";

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@foglamp/ui/components/card";
import { IconTool } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";

import {
	EmptyState,
	ScrollFade,
	TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { useRange } from "@/components/app/range-context";
import { ToolIcon } from "@/components/app/tool-icon";
import { formatCount, formatDuration, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

/**
 * Which tools this agent leans on: per-tool call volume, error rate, and
 * latency quantiles over the window, most-called first. Reusable: mount it on
 * any detail page and pass the scope (mirrors CostBreakdownCard).
 */
export function ToolBreakdownCard({
	agentName,
	workflowName,
	title = "Tools",
	className,
}: {
	agentName?: string;
	workflowName?: string;
	title?: string;
	className?: string;
}) {
	const { projectId } = useProject();
	const { range } = useRange();

	const query = useQuery({
		...trpc.metrics.toolBreakdown.queryOptions({
			projectId: projectId!,
			from: range.from.toISOString(),
			to: range.to.toISOString(),
			agentName,
			workflowName,
		}),
		enabled: !!projectId,
		// Keep the previous range's rows on screen while the new range loads —
		// matches the cost breakdown card beside it.
		placeholderData: (prev) => prev,
	});

	const tools = query.data ?? [];
	// Share bars are scaled to the most-called tool, like the overview's
	// breakdown cards scale to the top cost.
	const maxCalls = Math.max(1, ...tools.map((t) => t.callCount));

	return (
		<Card
			size="sm"
			className={cn("pb-0! group-data-[size=sm]/card:pb-0!", className)}
		>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
			</CardHeader>
			<CardContent className="mt-1">
				{query.isLoading ? (
					<div className="pb-6">
						<TableSkeleton />
					</div>
				) : tools.length === 0 ? (
					<EmptyState
						icon={IconTool}
						title="No tool calls in this range"
						description="Tool executions will show up here once they run."
						className="mb-6"
					/>
				) : (
					<ScrollFade className="max-h-72 pr-1">
						<div className="divide-y divide-border/40 pb-6">
							{tools.map((t) => (
								<div
									key={t.toolName}
									className="flex items-center justify-between gap-6 px-0.5 py-3 first:pt-0 last:pb-0"
								>
									{/* Left: name + secondary metrics (mirrors BreakdownRow). */}
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-1.75">
											<ToolIcon
												name={t.toolName}
												className="size-3.25 shrink-0 text-blue-500"
											/>
											<span className="truncate text-sm font-medium">
												{t.toolName || "unnamed"}
											</span>
										</div>
										<div className="mt-1 text-xs tabular-nums text-muted-foreground/70">
											p50 {formatDuration(t.latencyMs.p50)} · p95{" "}
											{formatDuration(t.latencyMs.p95)} · p99{" "}
											{formatDuration(t.latencyMs.p99)}
											{t.errorCount > 0 && (
												<span className="text-red-500/80">
													{" "}
													· {formatPercent(t.errorCount / t.callCount)} err
												</span>
											)}
										</div>
									</div>
									{/* Right: call count + share-of-calls bar. */}
									<div className="flex shrink-0 flex-col items-end gap-1">
										<span className="text-sm tabular-nums">
											{formatCount(t.callCount)}
											{t.callCount === 1 ? " call" : " calls"}
										</span>
										{t.totalRunCount > 0 && (
											<span className="text-xs tabular-nums text-muted-foreground/70">
												{formatPercent(t.runCount / t.totalRunCount)} of runs
											</span>
										)}
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
				)}
			</CardContent>
		</Card>
	);
}
