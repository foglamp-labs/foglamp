"use client";

import {
	ALERT_COMPARISON_SYMBOLS,
	formatAlertMetricValue,
} from "@foglamp/contracts/alerts";
import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
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
	IconCircleCheck,
	IconClock,
	IconCoin,
	IconPencilFilled,
	IconPlus,
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
import { formatCostFixed, formatDuration } from "@/lib/format";

import { DemoListHeader } from "../demo-chrome";
import { ALERTS, type AlertRow } from "../mock-data";

const METRIC_META: Record<
	AlertRow["metric"],
	{
		icon: React.ComponentType<{ className?: string }>;
		label: string;
		badgeVariant: "green" | "amber" | "rose" | "violet";
	}
> = {
	cost: { icon: IconCoin, label: "Cost", badgeVariant: "green" },
	latency_p95: {
		icon: IconClock,
		label: "Latency p95",
		badgeVariant: "amber",
	},
	error_rate: {
		icon: IconAlertTriangle,
		label: "Error rate",
		badgeVariant: "rose",
	},
	eval_pass_rate: {
		icon: IconCircleCheck,
		label: "Eval pass rate",
		badgeVariant: "violet",
	},
};

type AlertSortKey = "name" | "window";

export function AlertsTab() {
	const [search, setSearch] = useState("");
	const [firingOnly, setFiringOnly] = useState(false);
	const [pageSize, setPageSize] = useState(25);
	const { sort, toggle } = useTableSort<AlertSortKey>();

	const q = search.trim().toLowerCase();
	const filtered = ALERTS.filter(
		(a) =>
			(!q || a.name.toLowerCase().includes(q)) &&
			(!firingOnly || (a.enabled && a.status === "firing")),
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
						<IconPlus strokeWidth={2.4} />
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
						<Table className="table-fixed min-w-[64rem]">
							<TableHeader>
								<TableRow>
									<SortableHead
										sortKey="name"
										sort={sort}
										onSort={toggle}
										className="w-48"
									>
										Alert
									</SortableHead>
									<TableHead className="w-64">Condition</TableHead>
									<SortableHead
										sortKey="window"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-28"
									>
										Over the last
									</SortableHead>
									<TableHead className="w-32 text-right">Current</TableHead>
									<TableHead className="w-36 text-right">Last fired</TableHead>
									<TableHead className="w-24" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((r) => {
									const enabled = r.enabled;
									const metric = METRIC_META[r.metric];
									const MetricIcon = metric.icon;
									const firing = enabled && r.status === "firing";
									return (
										<TableRow
											key={r.id}
											className={cn(!enabled && "opacity-60")}
										>
											<TableCell>
												<div className="flex min-w-0 items-center gap-2">
													<span className="truncate font-normal">{r.name}</span>
													{firing && (
														<span
															title="Firing"
															className="flex shrink-0 items-center text-destructive"
														>
															<IconAlertTriangle className="size-3.5 fill-current/20" />
														</span>
													)}
												</div>
											</TableCell>
											<TableCell>
												<div className="flex min-w-0 items-center gap-2">
													<Badge
														variant={metric.badgeVariant}
														className="min-w-0 max-w-full"
													>
														<MetricIcon />
														<span className="min-w-0 truncate">
															{metric.label}
														</span>
													</Badge>
													<span className="shrink-0 tabular-nums">
														{ALERT_COMPARISON_SYMBOLS[r.comparison]}{" "}
														{formatAlertMetricValue(r.metric, r.threshold)}
													</span>
												</div>
											</TableCell>
											<TableCell className="text-right tabular-nums text-muted-foreground">
												{formatDuration(r.windowSeconds * 1000)}
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{r.metric === "cost"
													? formatCostFixed(r.currentValue, 4)
													: formatAlertMetricValue(r.metric, r.currentValue)}
											</TableCell>
											<TableCell
												align="right"
												className="text-muted-foreground"
											>
												{r.lastFired ?? "Never"}
											</TableCell>
											<TableCell align="center">
												<div className="flex items-center justify-center gap-2">
													<Button
														size="icon-sm"
														variant="ghost"
														className="size-7"
														aria-label={`Edit ${r.name}`}
													>
														<IconPencilFilled />
													</Button>
													<Button
														size="icon-sm"
														variant="ghost-destructive"
														className="size-7"
														aria-label={`Delete ${r.name}`}
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
