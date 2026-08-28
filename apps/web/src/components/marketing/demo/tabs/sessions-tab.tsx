"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@foglamp/ui/components/table";
import { TooltipProvider } from "@foglamp/ui/components/tooltip";
import { IconAlertTriangle, IconGhost, IconUser } from "@tabler/icons-react";
import { useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { CustomerAvatar } from "@/components/app/customer-avatar";
import {
	ClearFiltersButton,
	FilterSelect,
	PaginationFooter,
	SearchInput,
	SortableHead,
	ToggleChip,
	Toolbar,
	sortRows,
	useTableSort,
} from "@/components/app/data-table";
import { HeatCell } from "@/components/app/heat-cell";
import { ModelLogo, formatModelName } from "@/components/model-logo";
import {
	formatCostFixed,
	formatCount,
	formatTokens,
} from "@/lib/format";

import { DemoListHeader, DemoRange } from "../demo-chrome";
import { useDemo } from "../demo-context";
import { SESSIONS, type SessionRow, quintiles } from "../mock-data";

// Cost quintiles across the listed sessions drive the Cost cell heat shade.
const COST_QUANTILES = quintiles(SESSIONS.map((s) => s.costValue));

const AGENT_NAMES = [...new Set(SESSIONS.map((s) => s.agentName))];
const CUSTOMERS = [
	...new Set(SESSIONS.flatMap((s) => (s.customer ? [s.customer] : []))),
];

type SessionSortKey = "turns" | "tokens" | "cost" | "last";

export function SessionsTab() {
	const { openDetail } = useDemo();

	const [search, setSearch] = useState("");
	const [agentFilter, setAgentFilter] = useState("");
	const [customerFilter, setCustomerFilter] = useState("");
	const [errorsOnly, setErrorsOnly] = useState(false);
	const [pageSize, setPageSize] = useState(25);
	const { sort, toggle } = useTableSort<SessionSortKey>();

	const q = search.trim().toLowerCase();
	const filtered = SESSIONS.filter(
		(s) =>
			(!q ||
				s.sessionId.toLowerCase().includes(q) ||
				s.userMessage.toLowerCase().includes(q)) &&
			(!agentFilter || s.agentName === agentFilter) &&
			(!customerFilter || s.customer === customerFilter) &&
			(!errorsOnly || s.errorCount > 0),
	);
	const rows = sortRows<SessionRow, SessionSortKey>(filtered, sort, {
		turns: (s) => s.turns,
		tokens: (s) => s.tokens,
		cost: (s) => s.costValue,
		last: (s) => -SESSIONS.indexOf(s),
	});

	const agentOptions = AGENT_NAMES.map((name) => ({
		value: name,
		label: name,
		icon: (p: { className?: string }) => (
			<AgentIcon name={name} className={p.className} />
		),
	}));
	const customerOptions = CUSTOMERS.map((name) => ({
		value: name,
		label: name,
		icon: (p: { className?: string }) => (
			<CustomerAvatar customerId={name} customerName={name} className={p.className} />
		),
	}));

	return (
		<>
			<DemoListHeader href="/sessions" title="Sessions" />
			<div className="flex flex-col gap-4 mt-1">
				<Toolbar>
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Search session id…"
					/>
					<FilterSelect
						value={agentFilter}
						onChange={setAgentFilter}
						allLabel="Any agent"
						icon={IconGhost}
						options={agentOptions}
					/>
					<FilterSelect
						value={customerFilter}
						onChange={setCustomerFilter}
						allLabel="Any customer"
						icon={IconUser}
						options={customerOptions}
					/>
					<ToggleChip
						active={errorsOnly}
						onClick={() => setErrorsOnly((v) => !v)}
					>
						<IconAlertTriangle className="size-3.5" />
						Errors only
					</ToggleChip>
					<ClearFiltersButton
						show={!!(search || agentFilter || customerFilter || errorsOnly)}
						onClick={() => {
							setSearch("");
							setAgentFilter("");
							setCustomerFilter("");
							setErrorsOnly(false);
						}}
					/>
					<div className="ml-auto">
						<DemoRange />
					</div>
				</Toolbar>

				<div className="flex flex-col -mt-2">
					<TooltipProvider delay={150}>
						<Table className="table-fixed min-w-240">
							<TableHeader>
								<TableRow>
									<TableHead>Session</TableHead>
									<SortableHead
										sortKey="turns"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-30"
									>
										Turns
									</SortableHead>
									<SortableHead
										sortKey="tokens"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-32"
									>
										Tokens
									</SortableHead>
									<SortableHead
										sortKey="cost"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-36"
									>
										Cost
									</SortableHead>
									<SortableHead
										sortKey="last"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-40"
									>
										Last activity
									</SortableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((s) => (
									<TableRow
										key={s.sessionId}
										interactive
										onClick={() => openDetail({ type: "session", id: s.sessionId })}
									>
										<TableCell className="h-16">
											<div className="flex flex-col gap-1">
												<div className="flex items-center gap-2">
													<span className="truncate font-normal text-[14px]">
														{s.userMessage}
													</span>
													{s.errorCount > 0 && (
														<span
															title={`${s.errorCount} ${s.errorCount === 1 ? "error" : "errors"}`}
															className="flex shrink-0 items-center gap-1 font-sans text-sm text-red-600 dark:text-red-400"
														>
															<IconAlertTriangle className="size-3.5 fill-current/20" />
															{s.errorCount}
														</span>
													)}
												</div>
												<div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
													{/* Same model line as the traces list; static here
													    since sessions have no model filter. */}
													{s.models.length > 0 && (
														<span
															title={s.models.map(formatModelName).join(", ")}
															className="inline-flex min-w-0 shrink items-center gap-1"
														>
															<ModelLogo
																modelId={s.models[0]!}
																className="size-2.75 shrink-0"
															/>
															<span className="truncate">
																{formatModelName(s.models[0]!)}
																{s.models.length > 1
																	? ` +${s.models.length - 1}`
																	: ""}
															</span>
														</span>
													)}
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															openDetail({ type: "agent", id: s.agentName });
														}}
														title="View agent"
														className="inline-flex min-w-0 shrink cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
													>
														<AgentIcon
															name={s.agentName}
															filled
															className="size-3 shrink-0"
														/>
														<span className="truncate">{s.agentName}</span>
													</button>
													{s.customer && (
														<button
															type="button"
															onClick={(e) => {
																e.stopPropagation();
																setCustomerFilter(s.customer!);
															}}
															title="Filter by customer"
															className="inline-flex min-w-0 shrink cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
														>
															<CustomerAvatar
																filled
																customerId={s.customer}
																customerName={s.customer}
																className="size-3 shrink-0"
															/>
															<span className="truncate">{s.customer}</span>
														</button>
													)}
												</div>
											</div>
										</TableCell>
										<TableCell align="right">{formatCount(s.turns)}</TableCell>
										<TableCell align="right">{formatTokens(s.tokens)}</TableCell>
										<HeatCell
											value={s.costValue}
											thresholds={COST_QUANTILES}
											bold
											mutedWhenZero
										>
											{formatCostFixed(s.costValue, 4)}
										</HeatCell>
										<TableCell align="right" className="text-muted-foreground ">
											{s.when}
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
							noun={["session", "sessions"]}
							onPageChange={() => {}}
							onPageSizeChange={setPageSize}
						/>
					)}
				</div>
			</div>
		</>
	);
}
