"use client";

import { Skeleton } from "@foglamp/ui/components/skeleton";
import { IconChevronRight } from "@tabler/icons-react";
import { Fragment } from "react";

import { Chip } from "@/components/app/context-chip";

import { formatDateTime, formatSpanDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

export type FlowNode = {
	/** Stable key. */
	id: string;
	/** Brand/type icon shown in the chip (e.g. <ModelLogo /> or a tabler icon). */
	icon: React.ReactNode;
	/** Chip text — the step/agent name. */
	label: string;
	/** Optional muted second line (e.g. model id); shown in the tooltip. */
	sublabel?: string | null;
	/** Drives the chip tint. Only failures are coloured — `ok` stays neutral. */
	status: "ok" | "error" | "aborted";
	/** ClickHouse datetime / ISO string; shown in the tooltip. */
	timestamp: string;
	/** Optional duration (ms) shown inline after the label. */
	durationMs?: number | null;
};

/** A run of consecutive identical steps collapsed to one `×N` chip — the same
 * fold the trace waterfall applies to repeated siblings, so a tool loop reads
 * as one step instead of thirty. */
type FlowStep = {
	head: FlowNode;
	count: number;
	durationMs: number | null;
	status: FlowNode["status"];
};

function groupNodes(nodes: FlowNode[]): FlowStep[] {
	const steps: FlowStep[] = [];
	for (const node of nodes) {
		const prev = steps[steps.length - 1];
		if (
			prev &&
			prev.head.label === node.label &&
			(prev.head.sublabel ?? null) === (node.sublabel ?? null)
		) {
			prev.count += 1;
			prev.durationMs =
				node.durationMs == null
					? prev.durationMs
					: (prev.durationMs ?? 0) + node.durationMs;
			// A single failure tints the whole fold.
			if (node.status === "error") prev.status = "error";
			else if (node.status === "aborted" && prev.status === "ok")
				prev.status = "aborted";
			continue;
		}
		steps.push({
			head: node,
			count: 1,
			durationMs: node.durationMs ?? null,
			status: node.status,
		});
	}
	return steps;
}

/**
 * A run's steps as a wrapping strip of chips joined by chevrons — the same
 * chip vocabulary as the exchange's tool chips and the waterfall's type chips,
 * so it reads as part of the drawer rather than a diagram dropped into it.
 * Neutral by default; only errors (rose) and aborts (amber) are tinted.
 * Consecutive identical steps fold to `×N`. Hovering a chip shows its start
 * time and sublabel; when `onNodeClick` is given each chip is a button.
 */
export function NodeFlow({
	nodes,
	onNodeClick,
}: {
	nodes: FlowNode[];
	onNodeClick?: (id: string) => void;
}) {
	if (nodes.length === 0) return null;
	const steps = groupNodes(nodes);
	return (
		<div className="flex flex-wrap items-center gap-y-1.5">
			{steps.map((step, i) => {
				const node = step.head;
				const title = [
					step.count > 1 ? `${step.count} × ${node.label}` : node.label,
					node.sublabel,
					formatDateTime(node.timestamp),
				]
					.filter(Boolean)
					.join(" · ");
				return (
					<Fragment key={node.id}>
						{i > 0 && (
							<IconChevronRight className="mx-1 size-3 shrink-0 text-muted-foreground/50" />
						)}
						<Chip
							title={title}
							tone={step.status}
							onClick={onNodeClick ? () => onNodeClick(node.id) : undefined}
							icon={
								<span className="flex shrink-0 items-center justify-center *:not-[[class*=size-]]:size-3.25">
									{node.icon}
								</span>
							}
							label={
								step.count > 1 ? (
									<>
										<span className="tabular-nums text-muted-foreground">
											×{step.count}{" "}
										</span>
										{node.label}
									</>
								) : (
									node.label
								)
							}
							trailing={
								step.durationMs != null
									? formatSpanDuration(step.durationMs)
									: undefined
							}
						/>
					</Fragment>
				);
			})}
		</div>
	);
}

/**
 * Loading placeholder shaped like {@link NodeFlow}: a row of chip-sized
 * skeletons joined by chevrons, so swapping in the real flow doesn't shift
 * the drawer. `count` should track the run's step count when known.
 */
export function NodeFlowSkeleton({ count = 3 }: { count?: number }) {
	const widths = ["w-24", "w-32", "w-20", "w-28", "w-24", "w-36"];
	return (
		<div className="flex flex-wrap items-center gap-y-1.5">
			{Array.from({ length: Math.max(1, count) }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder
				<Fragment key={i}>
					{i > 0 && (
						<IconChevronRight className="mx-1 size-3 shrink-0 text-muted-foreground/30" />
					)}
					<Skeleton
						className={cn(
							"h-6 rounded-full bg-muted-foreground/15",
							widths[i % widths.length],
						)}
					/>
				</Fragment>
			))}
		</div>
	);
}
