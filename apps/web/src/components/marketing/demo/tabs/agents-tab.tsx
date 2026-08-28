"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableRow,
} from "@foglamp/ui/components/table";
import { TooltipProvider } from "@foglamp/ui/components/tooltip";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
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
import {
	formatCostFixed,
	formatCount,
	formatDuration,
	formatTokens,
} from "@/lib/format";

import { DemoListHeader, DemoRange } from "../demo-chrome";
import { useDemo } from "../demo-context";
import { AGENTS, type AgentCard, quintiles } from "../mock-data";

const COST_QUANTILES = quintiles(AGENTS.map((a) => a.costValue));

type AgentSortKey = "name" | "tokens" | "latency" | "cost" | "lastRun";

export function AgentsTab() {
	const { openDetail } = useDemo();

	const [search, setSearch] = useState("");
	const [errorsOnly, setErrorsOnly] = useState(false);
	const [pageSize, setPageSize] = useState(25);
	const { sort, toggle } = useTableSort<AgentSortKey>();

	const q = search.trim().toLowerCase();
	const filtered = AGENTS.filter(
		(a) =>
			(!q || a.name.toLowerCase().includes(q)) &&
			(!errorsOnly || a.errorCount > 0),
	);
	const rows = sortRows<AgentCard, AgentSortKey>(filtered, sort, {
		name: (a) => a.name,
		tokens: (a) => a.totalTokens,
		latency: (a) => a.p95Ms,
		cost: (a) => a.costValue,
		lastRun: (a) => -AGENTS.indexOf(a),
	});

	return (
		<>
			<DemoListHeader href="/agents" title="Agents" />
			<div className="flex flex-col gap-4 mt-1">
				<Toolbar>
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Search agents…"
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
						<Table className="table-fixed min-w-[64rem]">
							<TableHeader>
								<TableRow>
									<SortableHead sortKey="name" sort={sort} onSort={toggle}>
										Agent
									</SortableHead>
									<SortableHead
										sortKey="tokens"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-28"
									>
										Tokens
									</SortableHead>
									<SortableHead
										sortKey="latency"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-32"
									>
										Latency p95
									</SortableHead>
									<SortableHead
										sortKey="cost"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-28"
									>
										Cost
									</SortableHead>
									<SortableHead
										sortKey="lastRun"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-32"
									>
										Last run
									</SortableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((a) => (
									<TableRow
										key={a.name}
										interactive
										onClick={() => openDetail({ type: "agent", id: a.name })}
									>
										<TableCell className="h-12">
											<div className="flex min-w-0 items-center gap-2">
												<AgentIcon name={a.name} className="size-4" />
												<span className="truncate font-normal">{a.name}</span>
												{a.errorCount > 0 && (
													<span
														title={`${a.errorCount} ${a.errorCount === 1 ? "error" : "errors"}`}
														className="flex shrink-0 items-center gap-1 ml-1 font-sans text-sm text-red-600 dark:text-red-400"
													>
														<IconAlertTriangle className="size-3.5 fill-current/20" />
														{formatCount(a.errorCount)}
													</span>
												)}
											</div>
										</TableCell>
										<TableCell align="right" className="tabular-nums">
											{formatTokens(a.totalTokens)}
										</TableCell>
										<TableCell align="right" className="tabular-nums">
											{formatDuration(a.p95Ms)}
										</TableCell>
										<HeatCell value={a.costValue} thresholds={COST_QUANTILES} bold>
											{formatCostFixed(a.costValue, 4)}
										</HeatCell>
										<TableCell align="right" className="text-muted-foreground">
											{a.lastRun}
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
							noun={["agent", "agents"]}
							onPageChange={() => {}}
							onPageSizeChange={setPageSize}
						/>
					)}
				</div>
			</div>
		</>
	);
}
