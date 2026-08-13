"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableRow,
} from "@foglamp/ui/components/table";
import { TooltipProvider } from "@foglamp/ui/components/tooltip";
import { cn } from "@foglamp/ui/lib/utils";
import {
	IconAlertTriangle,
	IconSitemap,
	IconSitemapFilled,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
	ClearFiltersButton,
	PaginationFooter,
	SearchInput,
	SortableHead,
	ToggleChip,
	Toolbar,
	cycleSortParam,
	parseSortParam,
	useUrlFilters,
} from "@/components/app/data-table";
import { HeatCell } from "@/components/app/heat-cell";
import {
	useDebouncedValue,
	useDelayedLoading,
	useEntranceOnce,
} from "@/components/app/hooks";
import { InstrumentEmptyState } from "@/components/app/instrument-empty-state";
import { navItem } from "@/components/app/nav";
import {
	EmptyState,
	NoProject,
	PageHeader,
	TableRowsSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { useRange } from "@/components/app/range-context";
import { RangeControl } from "@/components/app/range-picker";
import { RelativeTime } from "@/components/app/relative-time";
import { formatCost, formatCount, formatTokens } from "@/lib/format";
import { trpc } from "@/utils/trpc";
import { WorkflowsHeader } from "./header";

const PAGE_SIZES = [25, 50, 100];

// Sentinel path segment for the no-workflow-name ("Ungrouped") bucket, since a
// route segment can't be the empty string. The detail page maps it back to "".
export const UNGROUPED = "~ungrouped";

type WorkflowSortKey =
	| "name"
	| "runs"
	| "traces"
	| "tokens"
	| "errors"
	| "cost"
	| "lastRun";

const WORKFLOW_SORT_KEYS = [
	"name",
	"runs",
	"traces",
	"tokens",
	"errors",
	"cost",
	"lastRun",
] as const satisfies readonly WorkflowSortKey[];

export function WorkflowsClient() {
	const entrance = useEntranceOnce();
	const { projectId } = useProject();
	const { range, setRange } = useRange();
	const router = useRouter();
	// Filters + sorting (applied server-side across the full result set) live in
	// the URL so the view survives reload/back and can be shared. The search box
	// keeps local state for typing; the debounced value syncs to ?q=.
	const [params, patchParams] = useUrlFilters({
		q: "",
		errors: "",
		sort: "",
		page: "1",
		size: "25",
	});
	const [search, setSearch] = useState(params.q);
	const debouncedSearch = useDebouncedValue(search);
	useEffect(() => {
		patchParams({ q: debouncedSearch.trim() });
	}, [debouncedSearch, patchParams]);
	// Back/forward (or any external URL change) re-syncs the input; in-flight
	// typing wins when it already matches what the URL will settle on.
	useEffect(() => {
		setSearch((prev) => (prev.trim() === params.q ? prev : params.q));
	}, [params.q]);
	const errorsOnly = params.errors === "1";
	const sort = parseSortParam(params.sort, WORKFLOW_SORT_KEYS);
	const toggle = (key: WorkflowSortKey) =>
		patchParams({ sort: cycleSortParam(sort, key) });
	const page = Math.max(0, (Number.parseInt(params.page, 10) || 1) - 1);
	const setPage = (p: number) => patchParams({ page: String(p + 1) });
	const pageSize = PAGE_SIZES.includes(Number(params.size))
		? Number(params.size)
		: 25;
	const hasFilters = !!(debouncedSearch.trim() || errorsOnly);

	// Filter/sort changes reset the page inside patchParams; project and range
	// changes happen outside it, so reset explicitly (skipping mount, which
	// would wipe the page from a shared/reloaded URL).
	const mounted = useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: page reset on project/range change only
	useEffect(() => {
		if (!mounted.current) {
			mounted.current = true;
			return;
		}
		patchParams({ page: "1" });
	}, [projectId, range]);

	const workflows = useQuery({
		...trpc.workflows.list.queryOptions({
			projectId: projectId!,
			from: range.from.toISOString(),
			to: range.to.toISOString(),
			workflowName: debouncedSearch.trim() || undefined,
			errorsOnly: errorsOnly || undefined,
			sort: sort ? { field: sort.key, dir: sort.dir } : undefined,
			limit: pageSize,
			offset: page * pageSize,
		}),
		enabled: !!projectId,
		// Keep the current page visible while the next one loads.
		placeholderData: (prev) => prev,
	});

	// Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
	// Only the table body waits on data — the toolbar and column headers are
	// static chrome and paint immediately.
	const showSkeleton = useDelayedLoading(workflows.isLoading);

	if (!projectId) {
		return (
			<>
				<PageHeader
					title="Workflows"
					icon={navItem("/workflows")?.icon}
					iconClassName={navItem("/workflows")?.iconClassName}
				/>
				<NoProject />
			</>
		);
	}

	const rows = workflows.data?.workflows ?? [];
	const costQuantiles = workflows.data?.costQuantiles ?? [];
	const summary = workflows.data?.summary;
	const workflowCount = summary?.workflowCount ?? 0;

	return (
		<>
			{/* Wrapped here (not inside WorkflowsHeader) so the copy rendered by
          loading.tsx stays unanimated — only the page's own header fades. */}
			<div className={cn(entrance && "page-fade-in")}>
				<WorkflowsHeader />
			</div>
			{/* Toolbar and table chrome always render — even for an empty result —
			    so the range picker and filters stay reachable (an empty range needs
			    the range picker to escape). The empty states swap in for the table
			    only; the body rows wait on the query (skeleton rows below). */}
			<div
				className={cn("flex flex-col gap-4 mt-1", entrance && "page-fade-in")}
			>
				<Toolbar>
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Search workflows…"
					/>
					<ToggleChip
						active={errorsOnly}
						onClick={() => patchParams({ errors: errorsOnly ? "" : "1" })}
					>
						<IconAlertTriangle className="size-3.5" />
						Errors only
					</ToggleChip>
					<ClearFiltersButton
						show={!!(search || errorsOnly)}
						onClick={() => {
							setSearch("");
							patchParams({ q: "", errors: "" });
						}}
					/>
					<div className="ml-auto flex items-center gap-3">
						<RangeControl value={range} onChange={setRange} />
					</div>
				</Toolbar>

				{!workflows.isLoading && rows.length === 0 && page === 0 ? (
					<div className="px-8">
						{hasFilters ? (
							<EmptyState
								icon={IconSitemapFilled}
								title="No matching workflows"
								description="Try a different search or clearing filters."
							/>
						) : (
							<InstrumentEmptyState
								feature="workflow"
								icon={IconSitemapFilled}
								title="No workflows yet"
								description="Pass a workflowName to group runs."
							/>
						)}
					</div>
				) : (
					// Single column with no gap so the pagination footer's top border
					// sits flush against the table's last row.
					<div className="flex flex-col -mt-2">
						<TooltipProvider delay={150}>
							{/* Fixed layout: column widths come from the header's w-* classes,
                    so the skeleton→data swap can't re-measure and shift columns. */}
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
									{workflows.isLoading ? (
										showSkeleton ? (
											<TableRowsSkeleton cols={SKELETON_COLS} />
										) : null
									) : (
										rows.map((w) => (
											<TableRow
												key={workflowSlug(w.workflowName)}
												interactive
												onClick={() =>
													router.push(
														`/workflows/${workflowSlug(w.workflowName)}`,
													)
												}
											>
												<TableCell className="h-12">
													<div className="flex min-w-0 items-center gap-2">
														<IconSitemap className="size-4 shrink-0 text-emerald-500" />
														<span
															className={cn(
																"truncate font-medium",
																!w.workflowName &&
																	"text-muted-foreground italic",
															)}
														>
															{w.workflowName ?? "Ungrouped"}
														</span>
														{/* Compact error count — colored text, no pill. */}
														{w.errorCount > 0 && (
															<span
																title={`${w.errorCount} ${w.errorCount === 1 ? "error" : "errors"}`}
																className="flex shrink-0 items-center ml-1 gap-1 font-sans text-sm text-red-600 dark:text-red-400"
															>
																<IconAlertTriangle className="size-3.5 fill-current/20" />
																{formatCount(w.errorCount)}
															</span>
														)}
													</div>
												</TableCell>
												<TableCell align="right" className="tabular-nums">
													{formatCount(w.runCount)}
												</TableCell>
												<TableCell align="right" className="tabular-nums">
													{formatCount(w.traceCount)}
												</TableCell>
												<TableCell align="right" className="tabular-nums">
													{formatTokens(w.totalTokens)}
												</TableCell>
												<HeatCell
													value={w.totalCost}
													thresholds={costQuantiles}
													bold
												>
													{formatCost(w.totalCost, 4)}
												</HeatCell>
												<TableCell
													align="right"
													className="text-muted-foreground"
												>
													<RelativeTime value={w.lastRun} />
												</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</TooltipProvider>

						{!workflows.isLoading && rows.length > 0 && (
							<PaginationFooter
								page={page}
								pageSize={pageSize}
								total={workflowCount}
								shown={rows.length}
								noun={["workflow", "workflows"]}
								isFetching={workflows.isFetching}
								onPageChange={setPage}
								onPageSizeChange={(s) => patchParams({ size: String(s) })}
								pageSizes={PAGE_SIZES}
							/>
						)}
					</div>
				)}
			</div>
		</>
	);
}

// Skeleton column spec for the loading body rows (see TableRowsSkeleton).
const SKELETON_COLS = [
	{ icon: true, w: "w-28" },
	{ align: "right", w: "w-10" },
	{ align: "right", w: "w-10" },
	{ align: "right", w: "w-12" },
	{ align: "right", w: "w-16" },
	{ align: "right", w: "w-14" },
] as const;

/** Route segment for a workflow group. Named workflows use their encoded name;
 * the no-name bucket uses the UNGROUPED sentinel (a segment can't be empty). */
function workflowSlug(workflowName: string | null): string {
	return workflowName ? encodeURIComponent(workflowName) : UNGROUPED;
}
