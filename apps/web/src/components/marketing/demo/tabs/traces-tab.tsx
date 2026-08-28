"use client";

import { Button } from "@foglamp/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@foglamp/ui/components/dropdown-menu";
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
	IconCpu,
	IconGhost,
	IconMessage2Filled,
	IconPlus,
	IconSitemap,
	IconSitemapFilled,
	IconTag,
	IconTagFilled,
	IconUser,
} from "@tabler/icons-react";
import { useRef, useState } from "react";

import { AgentIcon } from "@/components/app/agent-icon";
import { CustomerAvatar } from "@/components/app/customer-avatar";
import {
	ClearFiltersButton,
	FilterSelect,
	PaginationFooter,
	SortableHead,
	ToggleChip,
	Toolbar,
	sortRows,
	useFilterGroupItem,
	useTableSort,
} from "@/components/app/data-table";
import { HeatCell } from "@/components/app/heat-cell";
import { ModelLogo, formatModelName } from "@/components/model-logo";
import {
	formatCostFixed,
	formatCount,
	formatSpanDuration,
	formatTokens,
} from "@/lib/format";

import { DemoListHeader, DemoRange } from "../demo-chrome";
import { useDemo } from "../demo-context";
import { AGENTS, TRACE_ROWS, type TraceRow, quintiles } from "../mock-data";

// Quintiles drive the heat shade on the Duration and Cost cells.
const COST_QUANTILES = quintiles(TRACE_ROWS.map((t) => t.costValue));
const DURATION_QUANTILES = quintiles(TRACE_ROWS.map((t) => t.durationMs));

const MODELS = [...new Set(TRACE_ROWS.map((t) => t.model))];
const WORKFLOW_NAMES = [
	...new Set(TRACE_ROWS.flatMap((t) => (t.workflowName ? [t.workflowName] : []))),
];
const CUSTOMERS = [
	...new Set(TRACE_ROWS.flatMap((t) => (t.customer ? [t.customer] : []))),
];

// Colored icons for the dropdown *options* only — the closed trigger keeps the
// neutral outline icon, matching the real traces toolbar.
const WorkflowIconFilled = (p: { className?: string }) => (
	<IconSitemapFilled className={cn(p.className, "text-emerald-500")} />
);
const MetaValueIcon = (p: { className?: string }) => (
	<IconTagFilled className={cn(p.className, "text-fuchsia-500")} />
);

// The metadata filter's mock key/value catalog + a deterministic value per row.
const META_KEYS = ["environment", "plan", "region"] as const;
const META_VALUES: Record<(typeof META_KEYS)[number], string[]> = {
	environment: ["production", "staging"],
	plan: ["enterprise", "pro", "free"],
	region: ["us-east-1", "eu-west-1"],
};
const metaValueFor = (key: (typeof META_KEYS)[number], i: number) =>
	META_VALUES[key][i % META_VALUES[key].length]!;

type SecondaryFilter = "workflow" | "customer" | "meta";

/** The "+ Filter" menu that summons the collapsed secondary filters — the real
 * page's AddFilterMenu, minus the URL plumbing. */
function AddFilterMenu({
	showWorkflow,
	showCustomer,
	showMeta,
	onAdd,
}: {
	showWorkflow: boolean;
	showCustomer: boolean;
	showMeta: boolean;
	onAdd: (k: SecondaryFilter) => void;
}) {
	const group = useFilterGroupItem();
	// Insert the summoned select only once the close animation completes, so the
	// "+ Filter" anchor doesn't shift mid-exit (same trick as the real page).
	const pendingAdd = useRef<SecondaryFilter | null>(null);
	return (
		<DropdownMenu
			modal={false}
			open={group.open}
			onOpenChange={group.onOpenChange}
			onOpenChangeComplete={(open) => {
				if (!open && pendingAdd.current) {
					onAdd(pendingAdd.current);
					pendingAdd.current = null;
				}
			}}
		>
			<DropdownMenuTrigger
				render={
					<Button
						variant="outline"
						className="font-normal transition-[color,box-shadow] bg-card active:scale-100 text-muted-foreground/50 hover:text-muted-foreground/50 aria-expanded:text-muted-foreground/50"
						onMouseEnter={group.onTriggerMouseEnter}
					/>
				}
			>
				<IconPlus className="text-[#B8B8B8] dark:text-[#5B5B5B]" />
				Filter
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-auto min-w-36" align="start" sideOffset={8}>
				{!showWorkflow && (
					<DropdownMenuItem
						onClick={() => {
							pendingAdd.current = "workflow";
						}}
					>
						<IconSitemap />
						Workflow
					</DropdownMenuItem>
				)}
				{!showCustomer && (
					<DropdownMenuItem
						onClick={() => {
							pendingAdd.current = "customer";
						}}
					>
						<IconUser />
						Customer
					</DropdownMenuItem>
				)}
				{!showMeta && (
					<DropdownMenuItem
						onClick={() => {
							pendingAdd.current = "meta";
						}}
					>
						<IconTag />
						Metadata
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

type TraceSortKey = "when" | "cost" | "duration" | "tokens" | "spans";

export function TracesTab() {
	const { openDetail } = useDemo();

	const [agentFilter, setAgentFilter] = useState("");
	const [modelFilter, setModelFilter] = useState("");
	const [workflowFilter, setWorkflowFilter] = useState("");
	const [customerFilter, setCustomerFilter] = useState("");
	const [metaKeyFilter, setMetaKeyFilter] = useState("");
	const [metaValueFilter, setMetaValueFilter] = useState("");
	const [errorsOnly, setErrorsOnly] = useState(false);
	const [pageSize, setPageSize] = useState(25);
	const { sort, toggle } = useTableSort<TraceSortKey>();

	// Secondary filters stay out of the toolbar until summoned via "+ Filter".
	const [added, setAdded] = useState<Set<SecondaryFilter>>(() => new Set());
	const addFilter = (k: SecondaryFilter) =>
		setAdded((s) => new Set(s).add(k));
	const removeFilter = (k: SecondaryFilter) =>
		setAdded((s) => {
			const next = new Set(s);
			next.delete(k);
			return next;
		});
	const showWorkflow = added.has("workflow") || !!workflowFilter;
	const showCustomer = added.has("customer") || !!customerFilter;
	const showMeta = added.has("meta") || !!metaKeyFilter;
	const canAddFilter = !showWorkflow || !showCustomer || !showMeta;
	const hasFilters = !!(
		agentFilter ||
		modelFilter ||
		workflowFilter ||
		customerFilter ||
		metaKeyFilter ||
		errorsOnly
	);

	const metaKey = META_KEYS.includes(metaKeyFilter as (typeof META_KEYS)[number])
		? (metaKeyFilter as (typeof META_KEYS)[number])
		: null;

	const filtered = TRACE_ROWS.filter(
		(t) =>
			(!agentFilter || t.agentName === agentFilter) &&
			(!modelFilter || t.model === modelFilter) &&
			(!workflowFilter || t.workflowName === workflowFilter) &&
			(!customerFilter || t.customer === customerFilter) &&
			(!metaKey ||
				!metaValueFilter ||
				metaValueFor(metaKey, TRACE_ROWS.indexOf(t)) === metaValueFilter) &&
			(!errorsOnly || (t.errors ?? 0) > 0),
	);
	const rows = sortRows<TraceRow, TraceSortKey>(filtered, sort, {
		when: (t) => -TRACE_ROWS.indexOf(t),
		cost: (t) => t.costValue,
		duration: (t) => t.durationMs,
		tokens: (t) => t.tokens,
		spans: (t) => t.spans,
	});

	const agentOptions = AGENTS.map((a) => ({
		value: a.name,
		label: a.name,
		icon: (p: { className?: string }) => (
			<AgentIcon name={a.name} className={p.className} />
		),
	}));
	const modelOptions = MODELS.map((m) => ({
		value: m,
		label: formatModelName(m),
		icon: (p: { className?: string }) => (
			<ModelLogo modelId={m} className={p.className} />
		),
	}));
	const workflowOptions = WORKFLOW_NAMES.map((name) => ({
		value: name,
		label: name,
		icon: WorkflowIconFilled,
	}));
	const customerOptions = CUSTOMERS.map((name) => ({
		value: name,
		label: name,
		icon: (p: { className?: string }) => (
			<CustomerAvatar customerId={name} customerName={name} className={p.className} />
		),
	}));
	const metaKeyOptions = META_KEYS.map((key) => ({
		value: key as string,
		label: key as string,
		icon: MetaValueIcon,
	}));
	const metaValueOptions = (metaKey ? META_VALUES[metaKey] : []).map((v) => ({
		value: v,
		label: v,
		icon: MetaValueIcon,
	}));

	return (
		<>
			<DemoListHeader href="/traces" title="Traces" />
			<div className="flex flex-col gap-4 mt-1">
				<Toolbar>
					<FilterSelect
						value={agentFilter}
						onChange={setAgentFilter}
						allLabel="Any agent"
						icon={IconGhost}
						options={agentOptions}
					/>
					<FilterSelect
						value={modelFilter}
						onChange={setModelFilter}
						allLabel="Any model"
						icon={IconCpu}
						options={modelOptions}
					/>
					{showWorkflow && (
						<FilterSelect
							value={workflowFilter}
							onChange={(v) => {
								setWorkflowFilter(v);
								if (!v) removeFilter("workflow");
							}}
							allLabel="Any workflow"
							icon={IconSitemap}
							options={workflowOptions}
						/>
					)}
					{showCustomer && (
						<FilterSelect
							value={customerFilter}
							onChange={(v) => {
								setCustomerFilter(v);
								if (!v) removeFilter("customer");
							}}
							allLabel="Any customer"
							icon={IconUser}
							options={customerOptions}
						/>
					)}
					{showMeta && (
						<FilterSelect
							value={metaKeyFilter}
							onChange={(v) => {
								setMetaKeyFilter(v);
								setMetaValueFilter("");
								if (!v) removeFilter("meta");
							}}
							allLabel="Any metadata"
							icon={IconTag}
							options={metaKeyOptions}
						/>
					)}
					{showMeta && metaKey && (
						<FilterSelect
							value={metaValueFilter}
							onChange={setMetaValueFilter}
							allLabel={`Any ${metaKey}`}
							icon={IconTag}
							options={metaValueOptions}
						/>
					)}
					{canAddFilter && (
						<AddFilterMenu
							showWorkflow={showWorkflow}
							showCustomer={showCustomer}
							showMeta={showMeta}
							onAdd={addFilter}
						/>
					)}
					<ToggleChip
						active={errorsOnly}
						onClick={() => setErrorsOnly((v) => !v)}
					>
						<IconAlertTriangle className="size-3.5" />
						Errors only
					</ToggleChip>
					<ClearFiltersButton
						show={hasFilters}
						onClick={() => {
							setAgentFilter("");
							setModelFilter("");
							setWorkflowFilter("");
							setCustomerFilter("");
							setMetaKeyFilter("");
							setMetaValueFilter("");
							setErrorsOnly(false);
							setAdded(new Set());
						}}
					/>
					<div className="ml-auto">
						<DemoRange />
					</div>
				</Toolbar>

				{/* Single column with no gap so the pagination footer's top border
				    sits flush against the table's last row. */}
				<div className="flex flex-col -mt-2">
					<TooltipProvider delay={150}>
						<Table className="table-fixed min-w-5xl">
							<TableHeader>
								<TableRow>
									<TableHead>Trace</TableHead>
									{metaKey && (
										<TableHead className="w-40">
											<span className="inline-flex items-center gap-1.5">
												<IconTagFilled className="size-3.5 text-fuchsia-500" />
												{metaKey}
											</span>
										</TableHead>
									)}
									<SortableHead
										sortKey="spans"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-25"
									>
										Spans
									</SortableHead>
									<SortableHead
										sortKey="tokens"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-27"
									>
										Tokens
									</SortableHead>
									<SortableHead
										sortKey="duration"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-29"
									>
										Duration
									</SortableHead>
									<SortableHead
										sortKey="cost"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-34"
									>
										Cost
									</SortableHead>
									<SortableHead
										sortKey="when"
										sort={sort}
										onSort={toggle}
										align="right"
										className="w-32 pr-6"
									>
										When
									</SortableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((t) => (
									<TableRow
										key={t.traceId}
										interactive
										onClick={() => openDetail({ type: "trace", id: t.traceId })}
									>
										<TableCell className="h-16">
											<div className="min-w-0 flex justify-between items-center">
												{/* min-w-0 so the meta line truncates instead of
												    overflowing into the next column. */}
												<div className="min-w-0 flex flex-col gap-1">
													<div className="flex items-center gap-2">
														<span className="truncate text-[14px]">
															{t.title}
														</span>
														{t.errors ? (
															<span
																title={`${t.errors} ${t.errors === 1 ? "error" : "errors"}`}
																className="flex shrink-0 items-center gap-0.75 font-sans text-sm text-red-600 dark:text-red-400"
															>
																<IconAlertTriangle className="size-3.5 fill-current/20" />
																{t.errors}
															</span>
														) : null}
													</div>
													<div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
														<button
															type="button"
															onClick={(e) => {
																e.stopPropagation();
																setModelFilter(t.model);
															}}
															title="Filter by model"
															className="inline-flex min-w-0 shrink cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
														>
															<ModelLogo
																modelId={t.model}
																className="size-2.75 shrink-0"
															/>
															<span className="truncate">
																{formatModelName(t.model)}
															</span>
														</button>
														{t.sessionId && (
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation();
																	openDetail({
																		type: "session",
																		id: t.sessionId!,
																	});
																}}
																title="View session"
																className="inline-flex shrink-0 items-center gap-1 transition-colors hover:text-foreground cursor-pointer"
															>
																<IconMessage2Filled className="size-3 text-sky-500" />
																Session
															</button>
														)}
														<button
															type="button"
															onClick={(e) => {
																e.stopPropagation();
																openDetail({ type: "agent", id: t.agentName });
															}}
															title="View agent"
															className="inline-flex min-w-0 shrink cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
														>
															<AgentIcon
																name={t.agentName}
																filled
																className="size-3 shrink-0"
															/>
															<span className="truncate">{t.agentName}</span>
														</button>
														{t.workflowName && (
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation();
																	openDetail({
																		type: "workflow",
																		id: t.workflowName!,
																	});
																}}
																title="View workflow"
																className="inline-flex min-w-0 shrink cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
															>
																<IconSitemapFilled className="size-3 shrink-0 text-emerald-500" />
																<span className="truncate">{t.workflowName}</span>
															</button>
														)}
														{t.customer && (
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation();
																	setCustomerFilter(t.customer!);
																}}
																title="Filter by customer"
																className="inline-flex min-w-0 shrink cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
															>
																<CustomerAvatar
																	customerId={t.customer}
																	customerName={t.customer}
																	filled
																	className="size-3 shrink-0"
																/>
																<span className="truncate">{t.customer}</span>
															</button>
														)}
													</div>
												</div>
											</div>
										</TableCell>
										{metaKey && (
											<TableCell>
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														setMetaValueFilter(
															metaValueFor(metaKey, TRACE_ROWS.indexOf(t)),
														);
													}}
													title={`Filter by ${metaKey}`}
													className="block max-w-36 cursor-pointer truncate text-muted-foreground transition-colors hover:text-foreground"
												>
													{metaValueFor(metaKey, TRACE_ROWS.indexOf(t))}
												</button>
											</TableCell>
										)}
										<TableCell className="text-right tabular-nums text-muted-foreground">
											{formatCount(t.spans)}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatTokens(t.tokens)}
										</TableCell>
										<HeatCell
											value={t.durationMs}
											thresholds={DURATION_QUANTILES}
											metric="duration"
										>
											{formatSpanDuration(t.durationMs)}
										</HeatCell>
										<HeatCell
											value={t.costValue}
											thresholds={COST_QUANTILES}
											metric="cost"
											bold
										>
											{formatCostFixed(t.costValue, 6)}
										</HeatCell>
										<TableCell className="text-right text-muted-foreground pr-6">
											{t.when}
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
							noun={["trace", "traces"]}
							onPageChange={() => {}}
							onPageSizeChange={setPageSize}
						/>
					)}
				</div>
			</div>
		</>
	);
}
