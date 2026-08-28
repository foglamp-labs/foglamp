"use client";

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
	IconAlertTriangle,
	IconCircleCheck,
	IconFileCode,
	IconForbid,
	IconKey,
	IconListCheck,
	IconPlus,
	IconProgress,
	IconSparkles,
	IconStack2,
	IconTool,
	IconTrashFilled,
} from "@tabler/icons-react";
import { useState } from "react";

import { FAMILY_ICON, presetMeta } from "@/app/(app)/evals/preset-meta";
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
import { formatCostFixed, formatPercent } from "@/lib/format";

import { DemoListHeader, DemoRange } from "../demo-chrome";
import { useDemo } from "../demo-context";
import { EVALS, type EvalRow, quintiles } from "../mock-data";

const SPEND_QUANTILES = quintiles(EVALS.map((e) => e.spend));

type EvalSortKey = "name" | "passRate" | "avgScore" | "spend";

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
		passRate: (e) => e.passRate,
		avgScore: (e) => e.avgScore,
		spend: (e) => e.spend,
	});

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
			<div className="flex flex-col gap-4 mt-1">
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
								<TableHead className="w-52">Scope</TableHead>
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
								const { icon: CheckIcon, family } = presetMeta(r.presetId);
								// Trace evals score the whole run; span evals score every
								// tool or LLM call individually (mirrors the app's targets).
								const target =
									r.level === "trace"
										? { icon: IconAffiliate, label: "Whole trace" }
										: r.spanType === "llm"
											? { icon: IconStack2, label: "LLM calls" }
											: { icon: IconTool, label: "Tool calls" };
								const TargetIcon = target.icon;
								return (
									<TableRow
										key={r.id}
										interactive
										onClick={() => openDetail({ type: "eval", id: r.id })}
									>
										<TableCell className="h-16">
											<div className="flex min-w-0 flex-col gap-1">
												<div className="flex min-w-0 items-center gap-2">
													<span className="truncate text-[14px]">{r.name}</span>
												{(r.status === "error" ||
													r.status === "paused_no_key") && (
													<span
														title={
															r.status === "paused_no_key"
																? "Needs an API key"
																: "Erroring"
														}
														className="flex shrink-0 items-center font-sans text-sm text-red-600 dark:text-red-400"
													>
														<IconAlertTriangle className="size-3.5 fill-current/20" />
													</span>
												)}
												</div>
												<div
													className={cn(
														"flex min-w-0 items-center gap-1 text-xs",
														FAMILY_ICON[family]
													)}
												>
													<CheckIcon className="size-3 shrink-0" />
													<span className="truncate">{r.presetName}</span>
												</div>
											</div>
										</TableCell>
										<TableCell className="text-muted-foreground">
											<span className="flex min-w-0 items-center gap-1.5">
												<TargetIcon className="size-3.5 shrink-0" />
												{/* Level, agent filter, and the sample rate in one line. */}
												<span className="truncate">
													{target.label}
													{r.agentName ? ` · ${r.agentName}` : ""}
													<span className="tabular-nums">{` · ${r.sample}%`}</span>
												</span>
											</span>
										</TableCell>
										<TableCell className="text-right tabular-nums font-medium">
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
											mutedWhenZero
										>
											{r.spend > 0 ? formatCostFixed(r.spend, 4) : "—"}
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
