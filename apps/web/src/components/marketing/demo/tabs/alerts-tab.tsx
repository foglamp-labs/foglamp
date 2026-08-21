"use client";

import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import { Switch } from "@foglamp/ui/components/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@foglamp/ui/components/table";
import { TooltipProvider } from "@foglamp/ui/components/tooltip";
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

import {
	ClearFiltersButton,
	PaginationFooter,
	SearchInput,
	SortableHead,
	ToggleChip,
	Toolbar,
	sortRows,
	useTableSort,
} from "@/components/app/data-table";
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

type AlertSortKey = "name" | "window";

export function AlertsTab() {
	const [search, setSearch] = useState("");
	const [firingOnly, setFiringOnly] = useState(false);
	const [pageSize, setPageSize] = useState(25);
	const [enabledById, setEnabledById] = useState<Record<string, boolean>>(() =>
		Object.fromEntries(ALERTS.map((a) => [a.id, a.enabled])),
	);
	const { sort, toggle } = useTableSort<AlertSortKey>();

	const q = search.trim().toLowerCase();
	const filtered = ALERTS.filter(
		(a) =>
			(!q || a.name.toLowerCase().includes(q)) &&
			(!firingOnly || a.status === "firing"),
	);
	const rows = sortRows<AlertRow, AlertSortKey>(filtered, sort, {
		name: (a) => a.name,
		window: (a) => a.windowSeconds,
	});

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
			<div className="flex flex-col gap-4 mt-1">
				<Toolbar>
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Search alerts…"
					/>
					<ToggleChip
						active={firingOnly}
						onClick={() => setFiringOnly((v) => !v)}
					>
						<IconAlertTriangle className="size-3.5" />
						Firing only
					</ToggleChip>
					<ClearFiltersButton
						show={!!(search || firingOnly)}
						onClick={() => {
							setSearch("");
							setFiringOnly(false);
						}}
					/>
				</Toolbar>

				<div className="flex flex-col -mt-2">
					<TooltipProvider delay={150}>
						<Table className="table-fixed min-w-[56rem]">
							<TableHeader>
								<TableRow>
									<SortableHead sortKey="name" sort={sort} onSort={toggle}>
										Alert
									</SortableHead>
									<TableHead className="w-44">Metric</TableHead>
									<TableHead className="w-36">Condition</TableHead>
									<SortableHead
										sortKey="window"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-28"
									>
										Window
									</SortableHead>
									<TableHead className="w-28 text-right">Status</TableHead>
									<TableHead className="w-24" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((r) => {
									const enabled = enabledById[r.id];
									const status = STATUS_META[r.status];
									const StatusIcon = status.icon;
									const metric = METRIC_META[r.metric];
									const MetricIcon = metric.icon;
									return (
										<TableRow
											key={r.id}
											className={cn(!enabled && "opacity-60")}
										>
											<TableCell>
												<div className="flex min-w-0 items-center gap-2.5">
													<span
														className={cn(
															"grid size-6 shrink-0 place-items-center rounded-md squircle:rounded-lg corner-squircle",
															status.chip,
														)}
													>
														{r.status === "firing" ? (
															<span className="relative grid place-items-center">
																<span className="absolute size-3.5 animate-ping rounded-full bg-rose-500/40" />
																<StatusIcon className="relative size-3.5" />
															</span>
														) : (
															<StatusIcon className="size-3.5" />
														)}
													</span>
													<span className="truncate font-medium">{r.name}</span>
													{r.status === "firing" && (
														<span
															title="Firing"
															className="flex shrink-0 items-center font-sans text-sm text-red-600 dark:text-red-400"
														>
															<IconAlertTriangle className="size-3.5 fill-current/20" />
														</span>
													)}
												</div>
											</TableCell>
											<TableCell>
												<Badge variant="secondary" className="min-w-0 max-w-full">
													<MetricIcon />
													<span className="min-w-0 truncate">
														{metric.label}
													</span>
												</Badge>
											</TableCell>
											<TableCell className="tabular-nums">
												{COMPARISON_SYMBOLS[r.comparison]} {r.threshold}
											</TableCell>
											<TableCell className="text-right tabular-nums text-muted-foreground">
												{formatDuration(r.windowSeconds * 1000)}
											</TableCell>
											<TableCell align="right">
												<Badge variant={status.variant}>{r.status}</Badge>
											</TableCell>
											<TableCell align="center">
												<div className="flex items-center justify-center gap-2">
													<Switch
														size="sm"
														checked={enabled}
														onCheckedChange={(checked) =>
															setEnabledById((prev) => ({
																...prev,
																[r.id]: checked,
															}))
														}
													/>
													<Button
														size="icon-sm"
														variant="ghost-destructive"
														className="size-7"
													>
														<IconTrashFilled />
													</Button>
												</div>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</TooltipProvider>

					{rows.length > 0 && (
						<PaginationFooter
							page={0}
							pageSize={pageSize}
							total={rows.length}
							shown={rows.length}
							noun={["alert", "alerts"]}
							onPageChange={() => {}}
							onPageSizeChange={setPageSize}
						/>
					)}
				</div>
			</div>
		</>
	);
}
