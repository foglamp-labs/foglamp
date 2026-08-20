"use client";

import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@foglamp/ui/components/card";
import { Switch } from "@foglamp/ui/components/switch";
import { cn } from "@foglamp/ui/lib/utils";
import {
	IconAlertTriangle,
	IconAlertTriangleFilled,
	IconCircleCheck,
	IconCircleCheckFilled,
	IconClock,
	IconCoin,
	IconPlus,
	IconStack2,
	IconTrashFilled,
} from "@tabler/icons-react";
import { useState } from "react";

import { formatDuration } from "@/lib/format";

import { DemoListHeader } from "../demo-chrome";
import { ALERTS, type AlertRow } from "../mock-data";

const STATUS_META = {
	firing: {
		variant: "rose",
		icon: IconAlertTriangleFilled,
		chip: "bg-rose-100 text-rose-500 dark:bg-rose-950",
	},
	ok: {
		variant: "emerald",
		icon: IconCircleCheckFilled,
		chip: "bg-emerald-100 text-emerald-500 dark:bg-emerald-950",
	},
} as const;

const COMPARISON_SYMBOLS: Record<AlertRow["comparison"], string> = {
	gt: ">",
	gte: "≥",
	lt: "<",
	lte: "≤",
};

const METRIC_META: Record<
	AlertRow["metric"],
	{ icon: React.ComponentType<{ className?: string }>; label: string }
> = {
	cost: { icon: IconCoin, label: "Cost" },
	latency_p95: { icon: IconClock, label: "Latency p95" },
	error_rate: { icon: IconAlertTriangle, label: "Error rate" },
	token_usage: { icon: IconStack2, label: "Token usage" },
	eval_pass_rate: { icon: IconCircleCheck, label: "Eval pass rate" },
};

export function AlertsTab() {
	const [enabledById, setEnabledById] = useState<Record<string, boolean>>(() =>
		Object.fromEntries(ALERTS.map((a) => [a.id, a.enabled])),
	);

	return (
		<>
			<DemoListHeader
				href="/alerts"
				title="Alerts"
				actions={
					<Button size="sm">
						<IconPlus />
						New alert
					</Button>
				}
			/>
			<div className="grid gap-4 md:grid-cols-2 px-8">
				{ALERTS.map((r) => {
					const enabled = enabledById[r.id];
					const status = STATUS_META[r.status];
					const StatusIcon = status.icon;
					const metric = METRIC_META[r.metric];
					const MetricIcon = metric.icon;
					return (
						<Card
							key={r.id}
							className={cn(
								"transition-opacity",
								r.status === "firing" &&
									"shadow-[inset_0_0_0_1px_rgba(244,63,94,0.3),0_2px_10px_-4px_rgba(244,63,94,0.4)]",
								!enabled && "opacity-60",
							)}
						>
							<CardHeader>
								<div className="flex items-center gap-2.5">
									<span
										className={cn(
											"grid size-7 shrink-0 place-items-center rounded-md squircle:rounded-xl corner-squircle p-0.5",
											status.chip,
										)}
									>
										{r.status === "firing" ? (
											<span className="relative grid place-items-center">
												<span className="absolute size-4 animate-ping rounded-full bg-rose-500/40" />
												<StatusIcon className="relative size-4" />
											</span>
										) : (
											<StatusIcon className="size-4" />
										)}
									</span>
									<CardTitle className="truncate">{r.name}</CardTitle>
									<Badge variant={status.variant} className="ml-auto shrink-0">
										{r.status}
									</Badge>
								</div>
								<CardDescription className="flex flex-wrap items-center gap-1.5">
									<Badge variant="secondary">
										<MetricIcon />
										{metric.label}
									</Badge>
									<span className="tabular-nums text-foreground">
										{COMPARISON_SYMBOLS[r.comparison]} {r.threshold}
									</span>
									<span>·</span>
									<span className="tabular-nums">
										{formatDuration(r.windowSeconds * 1000)}
									</span>
								</CardDescription>
							</CardHeader>
							<CardContent className="flex items-center justify-between">
								<label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
									<Switch
										checked={enabled}
										size="sm"
										onCheckedChange={(checked) =>
											setEnabledById((prev) => ({ ...prev, [r.id]: checked }))
										}
									/>
									{enabled ? "Enabled" : "Paused"}
								</label>
								<Button
									size="icon-sm"
									variant="ghost-destructive"
									className="size-7"
								>
									<IconTrashFilled />
								</Button>
							</CardContent>
						</Card>
					);
				})}
			</div>
		</>
	);
}
