"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@foglamp/ui/components/alert-dialog";
import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "@foglamp/ui/components/combobox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@foglamp/ui/components/dialog";
import {
	Field,
	FieldDescription,
	FieldLabel,
} from "@foglamp/ui/components/field";
import { Input } from "@foglamp/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@foglamp/ui/components/select";
import { Switch } from "@foglamp/ui/components/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@foglamp/ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@foglamp/ui/components/tooltip";
import { cn } from "@foglamp/ui/lib/utils";
import {
	type Icon,
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
	IconToggleRight,
	IconTrashFilled,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import {
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";

import { AgentIcon } from "@/components/app/agent-icon";
import {
	ClearFiltersButton,
	FilterSelect,
	SearchInput,
	SortableHead,
	Toolbar,
	sortRows,
	useDelayedLoading,
	useTableSort,
	useTextFilter,
} from "@/components/app/data-table";
import { navItem } from "@/components/app/nav";
import {
	EmptyState,
	NoProject,
	PageHeader,
	ScrollFade,
	StatCard,
	TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { useRange } from "@/components/app/range-context";
import { RangePicker } from "@/components/app/range-picker";
import { formatCost, formatCount, formatPercent } from "@/lib/format";
import { trpc } from "@/utils/trpc";
import { EvalsHeader } from "./header";

import {
	EvalSettingsFields,
	type Provider,
	promptOverrideError,
	settingsParamError,
} from "./eval-settings-fields";
import { FAMILY_CHIP, familyRank, presetMeta } from "./preset-meta";

// What an eval runs on. Surfaced as an icon'd Select so the two levels read at
// a glance.
const LEVELS: {
	value: "trace" | "span";
	label: string;
	description: string;
	icon: Icon;
}[] = [
	{
		value: "trace",
		label: "Traces",
		description: "The whole agent run",
		icon: IconAffiliate,
	},
	{
		value: "span",
		label: "Spans",
		description: "Individual steps",
		icon: IconStack2,
	},
];

const MORPH = { type: "spring", stiffness: 400, damping: 38 } as const;

// Animates its own height to fit whatever it wraps, so the dialog can morph
// smoothly as the step content changes height. A ResizeObserver tracks the
// inner content (including conditional fields appearing) and springs the
// wrapper height to match.
function AutoHeight({ children }: { children: React.ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	const [height, setHeight] = useState<number>();
	// The very first measurement (dialog open) is snapped, not animated — we
	// don't want a height tween the instant it opens. Later changes (step nav,
	// conditional fields) spring with MORPH.
	const ready = useRef(false);
	// Measure before paint so the correct height is set on the first visible
	// frame. Use offsetHeight (the layout height) rather than a bounding rect:
	// the dialog opens with a zoom-in (scale) animation, and a rect would report
	// the scaled-down size — offsetHeight ignores transforms. (Mounts only when
	// the dialog opens, so the layout effect never runs on the server.)
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		const update = () => setHeight(el.offsetHeight);
		update();
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	useEffect(() => {
		if (height != null) ready.current = true;
	}, [height]);
	return (
		<motion.div
			initial={false}
			animate={{ height: height ?? "auto" }}
			transition={ready.current ? MORPH : { duration: 0 }}
			className="overflow-hidden"
		>
			{/* Horizontal/vertical padding lives here (not on the dialog body) so
			    the overflow-hidden clip box has room for focus rings; offsetHeight
			    includes it, so the height animation stays correct. */}
			<div ref={ref} className="px-6 py-1.5">
				{children}
			</div>
		</motion.div>
	);
}

const DEFAULT_FORM = {
	name: "",
	targetLevel: "trace" as "trace" | "span",
	agentName: "",
	workflowName: "",
	traceName: "",
	modelId: "",
	spanType: "",
	status: "",
	presetId: "",
	judgeProvider: "google" as Provider,
	judgeModel: "",
	sampleRate: "0.1",
	substring: "",
	pattern: "",
	maxChars: "4000",
	promptOverride: "",
};

type EvalSortKey = "name" | "sample" | "passRate" | "avgScore" | "spend";

// Spend heatmap: tint each eval's windowed cost by its percentile across the
// (filtered) list — same traffic-light scale as the traces table. Green = the
// cheapest fifth, red = the priciest. Literal classes so Tailwind keeps them.
const HEAT_SHADES = [
	"text-green-600 dark:text-green-400",
	"text-yellow-600 dark:text-yellow-400",
	"text-amber-600 dark:text-amber-400",
	"text-orange-600 dark:text-orange-400",
	"text-red-600 dark:text-red-400",
] as const;

const PCT_RANGE = [
	"0–20th",
	"20–40th",
	"40–60th",
	"60–80th",
	"80–100th",
] as const;

/** The 20/40/60/80th percentile cost thresholds across the list, so each shade
 * holds ~1/5 of evals. Computed client-side (the eval list is small/unpaged). */
function costThresholds(values: number[]): number[] {
	const v = values.filter((x) => x > 0).sort((a, b) => a - b);
	if (v.length === 0) return [];
	return [0.2, 0.4, 0.6, 0.8].map((q) => v[Math.floor(q * (v.length - 1))]!);
}

/** Which quintile bucket (0..4) `value` falls in against `thresholds`. null when
 * there's nothing to place (no spend). */
function percentileBucket(
	value: number | null | undefined,
	thresholds: number[],
) {
	if (!value || value <= 0 || thresholds.length === 0) return null;
	let i = 0;
	for (const t of thresholds) if (value > t) i += 1;
	return Math.min(i, HEAT_SHADES.length - 1);
}

export function EvalsClient() {
	const { projectId } = useProject();
	const { range, setRange } = useRange();
	const qc = useQueryClient();
	const router = useRouter();

	const [open, setOpen] = useState(false);
	const [step, setStep] = useState(1);
	const [form, setForm] = useState(DEFAULT_FORM);
	const [deleteTarget, setDeleteTarget] = useState<{
		id: string;
		name: string;
	} | null>(null);
	// Hold onto the last target so the name doesn't blank out during the
	// dialog's close animation (deleteTarget is cleared the instant it closes).
	const lastDeleteTarget = useRef(deleteTarget);
	if (deleteTarget) lastDeleteTarget.current = deleteTarget;
	const set = (patch: Partial<typeof DEFAULT_FORM>) =>
		setForm((f) => ({ ...f, ...patch }));

	// Table filters + sorting (client-side: the eval list is small and unpaged).
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<
		"" | "ok" | "error" | "paused_no_key"
	>("");
	const [sourceFilter, setSourceFilter] = useState<"" | "code" | "llm">("");
	const [levelFilter, setLevelFilter] = useState<"" | "trace" | "span">("");
	const [stateFilter, setStateFilter] = useState<"" | "enabled" | "disabled">(
		"",
	);
	const { sort, toggle } = useTableSort<EvalSortKey>();

	const evals = useQuery({
		...trpc.evals.list.queryOptions({
			projectId: projectId!,
			from: range.from.toISOString(),
			to: range.to.toISOString(),
		}),
		enabled: !!projectId,
		// Keep the table populated while a range change refetches.
		placeholderData: (prev) => prev,
	});
	const presets = useQuery(trpc.evals.presets.queryOptions());
	const providerKeys = useQuery({
		...trpc.providerKeys.list.queryOptions({ projectId: projectId! }),
		enabled: !!projectId,
	});
	// Existing agent names → combobox suggestions (free typing still allowed).
	// An eval attaches to an agent and scores its *future* traffic, so the
	// picker should surface every agent you've ever run — not just ones active
	// in the dashboard's current range. Query an all-time window, computed once
	// at mount so the query key stays stable across re-renders.
	const agentNamesRange = useMemo(
		() => ({
			from: new Date(0).toISOString(),
			to: new Date().toISOString(),
		}),
		[],
	);
	const agents = useQuery({
		...trpc.agents.names.queryOptions({
			projectId: projectId!,
			from: agentNamesRange.from,
			to: agentNamesRange.to,
		}),
		enabled: !!projectId,
	});

	const selectedPreset = useMemo(
		() => presets.data?.find((p) => p.id === form.presetId) ?? null,
		[presets.data, form.presetId],
	);
	// presetId → friendly name, for the table's Check badge.
	const presetName = useMemo(() => {
		const byId = new Map((presets.data ?? []).map((p) => [p.id, p.name]));
		return (id: string) =>
			byId.get(id) ??
			id.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
	}, [presets.data]);
	const configuredProviders = new Set(
		(providerKeys.data?.keys ?? []).map((k) => k.provider),
	);
	// Existing agent names → combobox suggestions (free typing still allowed).
	const agentNames = agents.data ?? [];

	const create = useMutation(
		trpc.evals.create.mutationOptions({
			onSuccess: () => {
				qc.invalidateQueries({ queryKey: trpc.evals.list.queryKey() });
				setOpen(false);
				setStep(1);
				setForm(DEFAULT_FORM);
				toast.success("Eval created, scoring new traffic from now.");
			},
			onError: (e) => toast.error(e.message),
		}),
	);
	const update = useMutation(
		trpc.evals.update.mutationOptions({
			onSuccess: () =>
				qc.invalidateQueries({ queryKey: trpc.evals.list.queryKey() }),
			onError: (e) => toast.error(e.message),
		}),
	);
	const remove = useMutation(
		trpc.evals.delete.mutationOptions({
			onSuccess: () => {
				qc.invalidateQueries({ queryKey: trpc.evals.list.queryKey() });
				setDeleteTarget(null);
				toast.success("Eval deleted");
			},
			onError: (e) => toast.error(e.message),
		}),
	);

	// Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
	const showSkeleton = useDelayedLoading(evals.isLoading);

	const rows = evals.data ?? [];
	const searched = useTextFilter(rows, search, (r) => [r.name, r.presetId]);
	const visible = useMemo(() => {
		let f = searched;
		if (statusFilter) f = f.filter((r) => r.status === statusFilter);
		if (sourceFilter) f = f.filter((r) => r.scorerSource === sourceFilter);
		if (levelFilter) f = f.filter((r) => r.targetLevel === levelFilter);
		if (stateFilter)
			f = f.filter((r) => r.enabled === (stateFilter === "enabled"));
		return sortRows(f, sort, {
			name: (r) => r.name,
			sample: (r) => r.sampleRate,
			passRate: (r) => r.passRate ?? -1,
			avgScore: (r) => r.avgScore ?? -1,
			spend: (r) => r.cost,
		});
	}, [searched, statusFilter, sourceFilter, levelFilter, stateFilter, sort]);

	// Spend percentile thresholds across the filtered list (heatmap), plus the
	// windowed stat-strip totals (avg score / avg pass rate / spend).
	const spendThresholds = useMemo(
		() => costThresholds(visible.map((r) => r.cost)),
		[visible],
	);
	// Stat-strip totals track the filtered/searched list (`visible`), so the cards
	// always reflect whatever the toolbar is currently showing.
	const totals = useMemo(() => {
		let passed = 0;
		let cost = 0;
		let passable = 0;
		let scoreSum = 0;
		let scorable = 0;
		for (const r of visible) {
			cost += r.cost;
			if (r.passRate != null) {
				passed += r.passRate * r.scoreCount;
				passable += r.scoreCount;
			}
			if (r.avgScore != null) {
				scoreSum += r.avgScore * r.scoreCount;
				scorable += r.scoreCount;
			}
		}
		return {
			cost,
			passRate: passable > 0 ? passed / passable : null,
			avgScore: scorable > 0 ? scoreSum / scorable : null,
		};
	}, [visible]);

	if (!projectId) {
		return (
			<>
				<PageHeader
					title="Evals"
					icon={navItem("/evals")?.icon}
					iconClassName={navItem("/evals")?.iconClassName}
				/>
				<NoProject />
			</>
		);
	}

	const isJudge = selectedPreset?.source === "llm";
	const needsKey = isJudge && !configuredProviders.has(form.judgeProvider);

	// When a preset is picked, seed the judge model from its default.
	const pickPreset = (id: string) => {
		const p = presets.data?.find((x) => x.id === id);
		set({
			presetId: id,
			targetLevel: p?.level === "span" ? "span" : form.targetLevel,
			judgeProvider: (p?.defaultModel?.provider as Provider) ?? "google",
			judgeModel: p?.defaultModel?.modelId ?? "gemini-3.1-flash-lite",
			// Prefill the prompt editor with the preset default so it's editable.
			promptOverride: p?.prompt ?? "",
		});
	};

	const submit = () => {
		if (!form.name.trim() || !selectedPreset) return;
		const filters = clean({
			agentName: form.agentName,
			workflowName: form.workflowName,
			traceName: form.traceName,
			modelId: form.targetLevel === "span" ? form.modelId : "",
			spanType: form.targetLevel === "span" ? form.spanType : "",
			status: form.status,
		});
		const params: Record<string, unknown> = {};
		if (
			selectedPreset.id === "contains" ||
			selectedPreset.id === "not_contains"
		)
			params.substring = form.substring;
		if (selectedPreset.id === "regex_match") params.pattern = form.pattern;
		if (selectedPreset.id === "max_length")
			params.maxChars = Number(form.maxChars);

		// Only persist a prompt override when it differs from the preset default —
		// an untouched prefill stays unset so future preset updates flow through.
		const prompt = form.promptOverride.trim();
		const config: {
			promptOverride?: string;
			params?: Record<string, unknown>;
		} = {};
		if (Object.keys(params).length) config.params = params;
		if (isJudge && prompt && prompt !== (selectedPreset.prompt ?? "").trim())
			config.promptOverride = prompt;

		create.mutate({
			projectId,
			name: form.name.trim(),
			presetId: form.presetId,
			targetLevel: form.targetLevel,
			filters: Object.keys(filters).length ? filters : undefined,
			sampleRate: Number(form.sampleRate),
			model: isJudge
				? { provider: form.judgeProvider, modelId: form.judgeModel.trim() }
				: undefined,
			config: Object.keys(config).length ? config : undefined,
		});
	};

	return (
		<>
			<EvalsHeader
				actions={
					<>
						<Button size="sm" onClick={() => setOpen(true)}>
							<IconPlus />
							New eval
						</Button>
						<Dialog
							open={open}
							onOpenChange={(o) => {
								setOpen(o);
								if (!o) {
									setStep(1);
									setForm(DEFAULT_FORM);
								}
							}}
						>
							{/* Opened from the header (no data) or toolbar (with data) — controlled. */}
							<DialogContent className="block w-auto max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0 sm:max-w-none">
								<motion.div
									initial={false}
									animate={{ width: step === 2 ? 800 : step === 3 ? 600 : 460 }}
									transition={MORPH}
									className="overflow-hidden"
								>
									<div className="flex flex-col gap-6 py-6">
										<DialogHeader className="px-6">
											<DialogTitle>New eval</DialogTitle>
											<DialogDescription>
												{step === 1 && "What should this eval run on?"}
												{step === 2 && "What do you want to check?"}
												{step === 3 && "How should it score?"}
											</DialogDescription>
										</DialogHeader>

										<AutoHeight>
											<motion.div
												key={step}
												initial={{ opacity: 0 }}
												animate={{ opacity: 1 }}
												transition={{ duration: 0.18 }}
											>
												{step === 1 && (
													<div className="flex flex-col gap-4">
														<Field>
															<FieldLabel>Name</FieldLabel>
															<Input
																placeholder="e.g. Support answer relevance"
																value={form.name}
																onChange={(e) => set({ name: e.target.value })}
															/>
														</Field>
														<Field>
															<FieldLabel>Level</FieldLabel>
															<Select
																value={form.targetLevel}
																onValueChange={(v) =>
																	set({ targetLevel: v as "trace" | "span" })
																}
															>
																<SelectTrigger className="w-full">
																	<SelectValue>
																		{(value) => {
																			const lvl = LEVELS.find(
																				(l) => l.value === value,
																			);
																			if (!lvl) return null;
																			const LIcon = lvl.icon;
																			return (
																				<span className="flex items-center gap-1.5">
																					<LIcon className="size-4 text-muted-foreground" />
																					{lvl.label}
																					<span className="text-muted-foreground">
																						· {lvl.description}
																					</span>
																				</span>
																			);
																		}}
																	</SelectValue>
																</SelectTrigger>
																<SelectContent>
																	{LEVELS.map((l) => {
																		const LIcon = l.icon;
																		return (
																			<SelectItem
																				key={l.value}
																				value={l.value}
																				label={l.label}
																			>
																				<LIcon className="size-4 text-muted-foreground mt-0.5" />
																				<span className="flex flex-col">
																					<span>{l.label}</span>
																					<span className="text-xs text-muted-foreground">
																						{l.description}
																					</span>
																				</span>
																			</SelectItem>
																		);
																	})}
																</SelectContent>
															</Select>
														</Field>
														<div className="grid grid-cols-2 gap-3">
															<Field>
																<FieldLabel>Agent (optional)</FieldLabel>
																<Combobox
																	items={agentNames}
																	inputValue={form.agentName}
																	onInputValueChange={(v) =>
																		set({ agentName: v })
																	}
																>
																	<ComboboxInput
																		placeholder="any"
																		className="w-full"
																	/>
																	<ComboboxContent>
																		<ComboboxList>
																			{(item: string) => (
																				<ComboboxItem key={item} value={item}>
																					<span className="flex items-center gap-1.5">
																						<AgentIcon
																							name={item}
																							className="size-3.5"
																						/>
																						{item}
																					</span>
																				</ComboboxItem>
																			)}
																		</ComboboxList>
																		<ComboboxEmpty>
																			No matching agents.
																		</ComboboxEmpty>
																	</ComboboxContent>
																</Combobox>
															</Field>
															<Field>
																<FieldLabel>Trace name (optional)</FieldLabel>
																<Input
																	placeholder="any"
																	value={form.traceName}
																	onChange={(e) =>
																		set({ traceName: e.target.value })
																	}
																/>
															</Field>
															{form.targetLevel === "span" && (
																<>
																	<Field>
																		<FieldLabel>
																			Span type (optional)
																		</FieldLabel>
																		<Select
																			value={form.spanType}
																			onValueChange={(v) =>
																				set({ spanType: v as string })
																			}
																		>
																			<SelectTrigger className="w-full">
																				<SelectValue placeholder="any" />
																			</SelectTrigger>
																			<SelectContent>
																				<SelectItem value="">any</SelectItem>
																				<SelectItem value="llm">llm</SelectItem>
																				<SelectItem value="tool">
																					tool
																				</SelectItem>
																				<SelectItem value="embedding">
																					embedding
																				</SelectItem>
																			</SelectContent>
																		</Select>
																	</Field>
																	<Field>
																		<FieldLabel>Model (optional)</FieldLabel>
																		<Input
																			placeholder="any"
																			value={form.modelId}
																			onChange={(e) =>
																				set({ modelId: e.target.value })
																			}
																		/>
																	</Field>
																</>
															)}
														</div>
													</div>
												)}

												{step === 2 && (
													<ScrollFade
														className="max-h-[55vh]"
														fromClassName="from-popover"
													>
														<div className="flex flex-col gap-5">
															{(
																[
																	{
																		source: "code",
																		label: "Code",
																	},
																	{ source: "llm", label: "LLM-as-a-judge" },
																] as const
															).map((group) => (
																<div
																	key={group.source}
																	className="flex flex-col gap-2"
																>
																	<p className="text-sm font-medium text-muted-foreground">
																		{group.label}
																	</p>
																	<div className="grid grid-cols-2 gap-2">
																		{(presets.data ?? [])
																			.filter((p) => p.source === group.source)
																			.sort(
																				(a, b) =>
																					familyRank(a.id) - familyRank(b.id),
																			)
																			.map((p) => {
																				const { icon: PIcon, family } =
																					presetMeta(p.id);
																				const selected = form.presetId === p.id;
																				return (
																					<button
																						key={p.id}
																						type="button"
																						onClick={() => pickPreset(p.id)}
																						data-selected={selected}
																						className="group flex cursor-pointer items-start gap-3 rounded-3xl corner-squircle border border-border/60 p-3 text-left transition-colors hover:bg-muted/50 data-[selected=true]:border-primary/5 data-[selected=true]:bg-primary/5 dark:data-[selected=true]:bg-primary/10"
																					>
																						<PIcon
																							className={cn(
																								"size-6 shrink-0 rounded-xl corner-squircle p-1",
																								FAMILY_CHIP[family],
																							)}
																						/>
																						<span className="flex min-w-0 flex-1 flex-col gap-0.5">
																							<span className="text-sm font-medium leading-none">
																								{p.name}
																							</span>
																							<span className="truncate text-xs leading-snug text-muted-foreground">
																								{p.description}
																							</span>
																						</span>
																					</button>
																				);
																			})}
																	</div>
																</div>
															))}
														</div>
													</ScrollFade>
												)}

												{step === 3 && selectedPreset && (
													<EvalSettingsFields
														preset={selectedPreset}
														judgeModel={form.judgeModel}
														judgeProvider={form.judgeProvider}
														sampleRate={form.sampleRate}
														substring={form.substring}
														pattern={form.pattern}
														maxChars={form.maxChars}
														promptOverride={form.promptOverride}
														defaultPrompt={selectedPreset.prompt ?? undefined}
														configuredProviders={configuredProviders}
														onChange={set}
														segmentedLayoutId="create-sample-rate-pill"
													/>
												)}
											</motion.div>
										</AutoHeight>

										<DialogFooter className="px-6">
											{step > 1 && (
												<Button
													variant="outline"
													onClick={() => setStep((s) => s - 1)}
												>
													Back
												</Button>
											)}
											{step < 3 ? (
												<Button
													disabled={
														(step === 1 && !form.name.trim()) ||
														(step === 2 && !form.presetId)
													}
													onClick={() => setStep((s) => s + 1)}
												>
													Next
												</Button>
											) : (
												<Button
													disabled={
														create.isPending ||
														needsKey ||
														(isJudge && !form.judgeModel.trim()) ||
														!!settingsParamError(selectedPreset, {
															substring: form.substring,
															pattern: form.pattern,
															maxChars: form.maxChars,
														}) ||
														!!promptOverrideError(
															selectedPreset,
															form.promptOverride,
														)
													}
													onClick={submit}
												>
													Create eval
												</Button>
											)}
										</DialogFooter>
									</div>
								</motion.div>
							</DialogContent>
						</Dialog>
					</>
				}
			/>

			{evals.isLoading ? (
				showSkeleton ? (
					<TableSkeleton />
				) : null
			) : rows.length === 0 ? (
				<EmptyState
					icon={IconGaugeFilled}
					title="No evals yet"
					description="Create an eval to score your production traces and spans."
				/>
			) : (
				<div className="flex flex-col gap-4">
					<section className="grid grid-cols-2 gap-4 md:grid-cols-4">
						<StatCard
							icon={IconGaugeFilled}
							iconClassName="text-fuchsia-300 dark:text-fuchsia-700"
							size="sm"
							label="Evals"
							value={formatCount(visible.length)}
						/>
						<StatCard
							icon={IconBoltFilled}
							iconClassName="text-violet-300 dark:text-violet-700"
							size="sm"
							label="Avg score"
							value={totals.avgScore == null ? "—" : totals.avgScore.toFixed(2)}
						/>
						<StatCard
							icon={IconCircleCheckFilled}
							iconClassName="text-emerald-300 dark:text-emerald-700"
							size="sm"
							label="Avg pass rate"
							value={
								totals.passRate == null ? "—" : formatPercent(totals.passRate)
							}
						/>
						<StatCard
							icon={IconCoinFilled}
							iconClassName="text-yellow-300 dark:text-yellow-600"
							size="sm"
							label="Total spend"
							value={formatCost(totals.cost)}
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
						<FilterSelect
							value={stateFilter}
							onChange={setStateFilter}
							allLabel="Any state"
							icon={IconToggleRight}
							options={[
								{ value: "enabled", label: "Enabled", icon: IconCircleCheck },
								{ value: "disabled", label: "Disabled", icon: IconForbid },
							]}
						/>
						<ClearFiltersButton
							show={
								!!(
									search ||
									statusFilter ||
									sourceFilter ||
									levelFilter ||
									stateFilter
								)
							}
							onClick={() => {
								setSearch("");
								setStatusFilter("");
								setSourceFilter("");
								setLevelFilter("");
								setStateFilter("");
							}}
						/>
						<div className="ml-auto flex items-center gap-3">
							<span className="hidden whitespace-nowrap text-sm text-muted-foreground/50 tabular-nums sm:inline">
								{formatCount(visible.length)}{" "}
								{visible.length === 1 ? "eval" : "evals"}
							</span>
							<RangePicker value={range} onChange={setRange} />
						</div>
					</Toolbar>

					{visible.length === 0 ? (
						<EmptyState
							icon={IconGaugeFilled}
							title="No matching evals"
							description="Try a different search or clearing filters."
						/>
					) : (
						// Fixed layout so column widths never depend on row content — the
						// table doesn't reflow as sorting changes which rows are visible.
						// The text/badge columns truncate (see cells below).
						<TooltipProvider delay={150}>
							<Table className="table-fixed">
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
												onClick={() => router.push(`/evals/${r.id}`)}
												className={cn(
													// Left accent bar on errored / key-less evals — they
													// aren't scoring, so they read at a glance.
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
															r.scorerSource === "llm" ? "violet" : "secondary"
														}
														className="min-w-0 max-w-full"
													>
														<CheckIcon />
														<span className="min-w-0 truncate">
															{presetName(r.presetId)}
														</span>
													</Badge>
												</TableCell>
												<TableCell className="text-muted-foreground">
													<span className="flex min-w-0 items-center gap-1.5">
														{r.targetLevel === "span" ? (
															<IconStack2 className="size-3.5 shrink-0" />
														) : (
															<IconAffiliate className="size-3.5 shrink-0" />
														)}
														<span className="truncate capitalize">
															{r.targetLevel}
															{r.filters?.agentName
																? ` · ${r.filters.agentName}`
																: ""}
														</span>
													</span>
												</TableCell>
												<TableCell className="text-right tabular-nums text-muted-foreground">
													{Math.round(r.sampleRate * 100)}%
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{r.passRate == null ? (
														<span className="text-muted-foreground/40">—</span>
													) : (
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
													)}
												</TableCell>
												<TableCell className="text-right tabular-nums text-muted-foreground">
													{r.avgScore == null ? (
														<span className="text-muted-foreground/40">—</span>
													) : (
														r.avgScore.toFixed(2)
													)}
												</TableCell>
												<HeatCell value={r.cost} thresholds={spendThresholds}>
													{r.cost > 0 ? formatCost(r.cost) : "—"}
												</HeatCell>
												<TableCell
													onClick={(e) => e.stopPropagation()}
													align="center"
												>
													<div className="flex items-center gap-2 justify-center">
														<Switch
															size="sm"
															checked={r.enabled}
															disabled={update.isPending}
															onCheckedChange={(checked) =>
																update.mutate({
																	evalId: r.id,
																	enabled: checked,
																})
															}
														/>
														<Button
															size="icon-sm"
															variant="ghost-destructive"
															className="size-7"
															onClick={() =>
																setDeleteTarget({ id: r.id, name: r.name })
															}
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
					)}
				</div>
			)}

			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(o) => !o && setDeleteTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Delete {lastDeleteTarget.current?.name}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently deletes the eval and stops scoring new traffic.
							This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={remove.isPending}
							onClick={() =>
								deleteTarget && remove.mutate({ evalId: deleteTarget.id })
							}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

function clean(obj: Record<string, string>): Record<string, string> {
	return Object.fromEntries(
		Object.entries(obj).filter(([, v]) => v.trim() !== ""),
	);
}

/** A right-aligned spend cell tinted by its percentile bucket across the list,
 * with a tooltip naming the bucket. Unbucketed (no spend) renders muted. */
function HeatCell({
	value,
	thresholds,
	children,
}: {
	value: number | null | undefined;
	thresholds: number[];
	children: ReactNode;
}) {
	const bucket = percentileBucket(value, thresholds);
	const className = cn(
		"text-right font-medium tabular-nums",
		value == null || value <= 0
			? "text-muted-foreground/40"
			: bucket != null && HEAT_SHADES[bucket],
	);
	if (bucket == null) {
		return <TableCell className={className}>{children}</TableCell>;
	}
	const extreme =
		bucket === 0 ? " · cheapest" : bucket === 4 ? " · priciest" : "";
	return (
		<TableCell className={className}>
			<Tooltip>
				<TooltipTrigger render={<span className="cursor-default" />}>
					{children}
				</TooltipTrigger>
				<TooltipContent>{`${PCT_RANGE[bucket]} percentile by spend${extreme}`}</TooltipContent>
			</Tooltip>
		</TableCell>
	);
}
