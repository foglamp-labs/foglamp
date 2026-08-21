"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableRow,
} from "@foglamp/ui/components/table";
import { TooltipProvider } from "@foglamp/ui/components/tooltip";
import { IconAlertTriangle, IconSitemap } from "@tabler/icons-react";
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
import { HeatCell } from "@/components/app/heat-cell";
import { formatCost, formatCount, formatTokens } from "@/lib/format";

import { DemoListHeader, DemoRange } from "../demo-chrome";
import { useDemo } from "../demo-context";
import { WORKFLOWS, type WorkflowRow, quintiles } from "../mock-data";

const COST_QUANTILES = quintiles(WORKFLOWS.map((w) => w.costValue));

type WorkflowSortKey =
	| "name"
	| "runs"
	| "traces"
	| "tokens"
	| "cost"
	| "lastRun";

export function WorkflowsTab() {
	const { openDetail } = useDemo();

	const [search, setSearch] = useState("");
	const [errorsOnly, setErrorsOnly] = useState(false);
	const [pageSize, setPageSize] = useState(25);
	const { sort, toggle } = useTableSort<WorkflowSortKey>();

	const q = search.trim().toLowerCase();
	const filtered = WORKFLOWS.filter(
		(w) =>
			(!q || w.name.toLowerCase().includes(q)) &&
			(!errorsOnly || w.errors > 0),
	);
	const rows = sortRows<WorkflowRow, WorkflowSortKey>(filtered, sort, {
		name: (w) => w.name,
		runs: (w) => w.runs,
		traces: (w) => w.traces,
		tokens: (w) => w.tokens,
		cost: (w) => w.costValue,
		lastRun: (w) => -WORKFLOWS.indexOf(w),
	});

	return (
		<>
			<DemoListHeader href="/workflows" title="Workflows" />
			<div className="flex flex-col gap-4 mt-1">
				<Toolbar>
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Search workflows…"
					/>
					<ToggleChip
						active={errorsOnly}
						onClick={() => setErrorsOnly((v) => !v)}
					>
						<IconAlertTriangle className="size-3.5" />
						Errors only
					</ToggleChip>
					<ClearFiltersButton
						show={!!(search || errorsOnly)}
						onClick={() => {
							setSearch("");
							setErrorsOnly(false);
						}}
					/>
					<div className="ml-auto flex items-center gap-3">
						<DemoRange />
					</div>
				</Toolbar>

				<div className="flex flex-col -mt-2">
					<TooltipProvider delay={150}>
						<Table className="table-fixed min-w-5xl">
							<TableHeader>
								<TableRow>
									<SortableHead sortKey="name" sort={sort} onSort={toggle}>
										Workflow
									</SortableHead>
									<SortableHead
										sortKey="runs"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-32"
									>
										Runs
									</SortableHead>
									<SortableHead
										sortKey="traces"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-36"
									>
										Traces
									</SortableHead>
									<SortableHead
										sortKey="tokens"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-36"
									>
										Tokens
									</SortableHead>
									<SortableHead
										sortKey="cost"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-40"
									>
										Cost
									</SortableHead>
									<SortableHead
										sortKey="lastRun"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-40"
									>
										Last run
									</SortableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((w) => (
									<TableRow
										key={w.name}
										interactive
										onClick={() => openDetail({ type: "workflow", id: w.name })}
									>
										<TableCell className="h-12">
											<div className="flex min-w-0 items-center gap-2">
												<IconSitemap className="size-4 shrink-0 text-emerald-500" />
												<span className="truncate font-medium">{w.name}</span>
												{w.errors > 0 && (
													<span
														title={`${w.errors} ${w.errors === 1 ? "error" : "errors"}`}
														className="flex shrink-0 items-center ml-1 gap-1 font-sans text-sm text-red-600 dark:text-red-400"
													>
														<IconAlertTriangle className="size-3.5 fill-current/20" />
														{formatCount(w.errors)}
													</span>
												)}
											</div>
										</TableCell>
										<TableCell align="right" className="tabular-nums">
											{formatCount(w.runs)}
										</TableCell>
										<TableCell align="right" className="tabular-nums">
											{formatCount(w.traces)}
										</TableCell>
										<TableCell align="right" className="tabular-nums">
											{formatTokens(w.tokens)}
										</TableCell>
										<HeatCell value={w.costValue} thresholds={COST_QUANTILES} bold>
											{formatCost(w.costValue, 4)}
										</HeatCell>
										<TableCell align="right" className="text-muted-foreground">
											{w.lastRun}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</TooltipProvider>

					{rows.length > 0 && (
						<PaginationFooter
							page={0}
							pageSize={pageSize}
							total={rows.length}
							shown={rows.length}
							noun={["workflow", "workflows"]}
							onPageChange={() => {}}
							onPageSizeChange={setPageSize}
						/>
					)}
				</div>
			</div>
		</>
	);
}
