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
	IconAffiliate,
	IconBoltFilled,
	IconCircleCheck,
	IconCircleCheckFilled,
	IconCoinFilled,
	IconFileCode,
	IconForbid,
	IconGaugeFilled,
	IconKey,
	IconListCheck,
	IconPlus,
	IconProgress,
	IconSparkles,
	IconStack2,
	IconTrashFilled,
} from "@tabler/icons-react";
import { useState } from "react";

import { presetMeta } from "@/app/(app)/evals/preset-meta";
import {
	ClearFiltersButton,
	FilterSelect,
	SearchInput,
	SortableHead,
	Toolbar,
	sortRows,
	useTableSort,
} from "@/components/app/data-table";
import { HeatCell } from "@/components/app/heat-cell";
import { StatCard } from "@/components/app/page-parts";
import { formatCost, formatCount, formatPercent } from "@/lib/format";

import { DemoListHeader, DemoRange } from "../demo-chrome";
import { useDemo } from "../demo-context";
import { EVALS, type EvalRow, quintiles } from "../mock-data";

const SPEND_QUANTILES = quintiles(EVALS.map((e) => e.spend));

type EvalSortKey = "name" | "sample" | "passRate" | "avgScore" | "spend";

export function EvalsTab() {
	const { openDetail } = useDemo();

	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState("");
	const [sourceFilter, setSourceFilter] = useState("");
	const [levelFilter, setLevelFilter] = useState("");
	const [enabledById, setEnabledById] = useState<Record<string, boolean>>(() =>
		Object.fromEntries(EVALS.map((e) => [e.id, e.enabled])),
	);
	const { sort, toggle } = useTableSort<EvalSortKey>();

	const q = search.trim().toLowerCase();
	const filtered = EVALS.filter(
		(e) =>
			(!q ||
				e.name.toLowerCase().includes(q) ||
				e.presetId.toLowerCase().includes(q)) &&
			(!statusFilter || e.status === statusFilter) &&
			(!sourceFilter ||
				(sourceFilter === "llm" ? e.type === "llm-judge" : e.type === "code")) &&
			(!levelFilter || e.level === levelFilter),
	);
	const visible = sortRows<EvalRow, EvalSortKey>(filtered, sort, {
		name: (e) => e.name,
		sample: (e) => e.sample,
		passRate: (e) => e.passRate,
		avgScore: (e) => e.avgScore,
		spend: (e) => e.spend,
	});

	const totalSpend = EVALS.reduce((sum, e) => sum + e.spend, 0);
	const avgScore =
		EVALS.reduce((sum, e) => sum + e.avgScore, 0) / EVALS.length;
	const avgPassRate =
		EVALS.reduce((sum, e) => sum + e.passRate, 0) / EVALS.length;

	return (
		<>
			<DemoListHeader
				href="/evals"
				title="Evals"
				actions={
					<Button size="sm">
						<IconPlus />
						New eval
					</Button>
				}
			/>
			<div className="flex flex-col gap-4">
				<section className="grid grid-cols-2 gap-4 md:grid-cols-4 px-5.5">
					<StatCard
						icon={IconGaugeFilled}
						iconClassName="text-fuchsia-500 dark:text-fuchsia-500"
						size="sm"
						label="Evals"
						value={visible.length}
						formatValue={formatCount}
					/>
					<StatCard
						icon={IconBoltFilled}
						iconClassName="text-orange-500 dark:text-orange-500"
						size="sm"
						label="Avg score"
						value={avgScore}
						formatValue={(n) => n.toFixed(2)}
						delta={{ pct: 0.022, dir: "up" }}
					/>
					<StatCard
						icon={IconCircleCheckFilled}
						iconClassName="text-emerald-500 dark:text-emerald-500"
						size="sm"
						label="Avg pass rate"
						value={avgPassRate}
						formatValue={formatPercent}
						delta={{ pct: 0.012, dir: "up" }}
					/>
					<StatCard
						icon={IconCoinFilled}
						iconClassName="text-yellow-400 dark:text-yellow-500"
						size="sm"
						label="Total spend"
						value={totalSpend}
						formatValue={(n) => formatCost(n, 4)}
						delta={{ pct: 0.084, dir: "up" }}
						deltaInverted
					/>
				</section>

				<Toolbar>
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Search evals…"
					/>
					<FilterSelect
						value={statusFilter}
						onChange={setStatusFilter}
						allLabel="Any status"
						icon={IconProgress}
						options={[
							{ value: "ok", label: "OK", icon: IconCircleCheck },
							{ value: "error", label: "Error", icon: IconForbid },
							{ value: "paused_no_key", label: "Needs key", icon: IconKey },
						]}
					/>
					<FilterSelect
						value={sourceFilter}
						onChange={setSourceFilter}
						allLabel="Any check"
						icon={IconListCheck}
						options={[
							{ value: "code", label: "Code", icon: IconFileCode },
							{ value: "llm", label: "LLM judge", icon: IconSparkles },
						]}
					/>
					<FilterSelect
						value={levelFilter}
						onChange={setLevelFilter}
						allLabel="Any level"
						icon={IconStack2}
						options={[
							{ value: "trace", label: "Traces", icon: IconAffiliate },
							{ value: "span", label: "Spans", icon: IconStack2 },
						]}
					/>
					<ClearFiltersButton
						show={!!(search || statusFilter || sourceFilter || levelFilter)}
						onClick={() => {
							setSearch("");
							setStatusFilter("");
							setSourceFilter("");
							setLevelFilter("");
						}}
					/>
					<div className="ml-auto flex items-center gap-3">
						<span className="hidden whitespace-nowrap text-sm text-muted-foreground/50 tabular-nums sm:inline">
							{formatCount(visible.length)}{" "}
							{visible.length === 1 ? "eval" : "evals"}
						</span>
						<DemoRange />
					</div>
				</Toolbar>

				<TooltipProvider delay={150}>
					<Table className="table-fixed min-w-[64rem] -mt-2">
						<TableHeader>
							<TableRow>
								<SortableHead
									className="w-40 truncate"
									sortKey="name"
									sort={sort}
									onSort={toggle}
								>
									Name
								</SortableHead>
								<TableHead className="w-40">Check</TableHead>
								<TableHead className="w-32">Target</TableHead>
								<SortableHead
									sortKey="sample"
									sort={sort}
									onSort={toggle}
									align="right"
									className="w-24"
								>
									Sample
								</SortableHead>
								<SortableHead
									sortKey="passRate"
									sort={sort}
									onSort={toggle}
									align="right"
									className="w-28"
								>
									Pass rate
								</SortableHead>
								<SortableHead
									sortKey="avgScore"
									sort={sort}
									onSort={toggle}
									align="right"
									className="w-24"
								>
									Avg score
								</SortableHead>
								<SortableHead
									sortKey="spend"
									sort={sort}
									onSort={toggle}
									align="right"
									className="w-28"
								>
									Spend
								</SortableHead>
								<TableHead className="w-24" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{visible.map((r) => {
								const CheckIcon = presetMeta(r.presetId).outline;
								return (
									<TableRow
										key={r.id}
										interactive
										onClick={() => openDetail({ type: "eval", id: r.id })}
										className={cn(
											(r.status === "error" ||
												r.status === "paused_no_key") &&
												"shadow-[inset_1px_0_0_0_var(--color-rose-500)]",
										)}
									>
										<TableCell className="truncate font-medium">
											{r.name}
										</TableCell>
										<TableCell>
											<Badge
												variant={
													r.type === "llm-judge" ? "violet" : "secondary"
												}
												className="min-w-0 max-w-full"
											>
												<CheckIcon />
												<span className="min-w-0 truncate">
													{r.presetName}
												</span>
											</Badge>
										</TableCell>
										<TableCell className="text-muted-foreground">
											<span className="flex min-w-0 items-center gap-1.5">
												{r.level === "span" ? (
													<IconStack2 className="size-3.5 shrink-0" />
												) : (
													<IconAffiliate className="size-3.5 shrink-0" />
												)}
												<span className="truncate capitalize">
													{r.level}
													{r.agentName ? ` · ${r.agentName}` : ""}
												</span>
											</span>
										</TableCell>
										<TableCell className="text-right tabular-nums text-muted-foreground">
											{r.sample}%
										</TableCell>
										<TableCell className="text-right tabular-nums">
											<span
												className={cn(
													r.passRate >= 0.9
														? "text-emerald-600 dark:text-emerald-400"
														: r.passRate < 0.5 &&
																"text-rose-600 dark:text-rose-400",
												)}
											>
												{formatPercent(r.passRate)}
											</span>
										</TableCell>
										<TableCell className="text-right tabular-nums text-muted-foreground">
											{r.avgScore.toFixed(2)}
										</TableCell>
										<HeatCell
											value={r.spend}
											thresholds={SPEND_QUANTILES}
											metric="spend"
											bold
											mutedWhenZero
										>
											{r.spend > 0 ? formatCost(r.spend, 4) : "—"}
										</HeatCell>
										<TableCell
											onClick={(e) => e.stopPropagation()}
											align="center"
										>
											<div className="flex items-center gap-2 justify-center">
												<Switch
													size="sm"
													checked={enabledById[r.id]}
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
			</div>
		</>
	);
}
