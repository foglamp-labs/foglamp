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
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@foglamp/ui/components/alert";
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
import { Field, FieldLabel } from "@foglamp/ui/components/field";
import { InputGroupAddon } from "@foglamp/ui/components/input-group";
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
  IconAlertTriangle,
  IconCircleCheck,
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AgentIcon } from "@/components/app/agent-icon";
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
import {
  useDelayedLoading,
  useEntranceOnce,
  useTextFilter,
} from "@/components/app/hooks";
import { navItem } from "@/components/app/nav";
import {
  EmptyState,
  NoProject,
  PageHeader,
  ScrollFade,
  TableRowsSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { useRange } from "@/components/app/range-context";
import { RangeControl } from "@/components/app/range-picker";
import { formatCostFixed, formatPercent } from "@/lib/format";
import { trpc } from "@/utils/trpc";
import { EvalsHeader } from "./header";

import {
  EvalSettingsFields,
  type Provider,
  passThresholdError,
  promptOverrideError,
  settingsParamError,
} from "./eval-settings-fields";
import {
  FAMILY_CHIP,
  familyRank,
  presetBadgeVariant,
  presetMeta,
} from "./preset-meta";

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
  targetLevel: "trace" as "trace" | "span",
  agentName: "",
  workflowName: "",
  spanType: "",
  status: "",
  presetId: "",
  judgeProvider: "google" as Provider,
  judgeModel: "",
  sampleRate: "0.1",
  passThreshold: "0.7",
  substring: "",
  pattern: "",
  maxChars: "4000",
  promptOverride: "",
};

type EvalSortKey = "name" | "passRate" | "avgScore" | "spend";

/** The 20/40/60/80th percentile cost thresholds across the list, so each shade
 * holds ~1/5 of evals. Computed client-side (the eval list is small/unpaged). */
function costThresholds(values: number[]): number[] {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (v.length === 0) return [];
  return [0.2, 0.4, 0.6, 0.8].map((q) => v[Math.floor(q * (v.length - 1))]!);
}

export function EvalsClient() {
  const entrance = useEntranceOnce();
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
    []
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
    [presets.data, form.presetId]
  );
  // presetId → friendly name, for the table's Check badge.
  const presetName = useMemo(() => {
    const byId = new Map((presets.data ?? []).map((p) => [p.id, p.name]));
    return (id: string) =>
      byId.get(id) ??
      id.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }, [presets.data]);
  const configuredProviders = new Set(
    (providerKeys.data?.keys ?? []).map((k) => k.provider)
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
    })
  );
  const update = useMutation(
    trpc.evals.update.mutationOptions({
      onSuccess: (_data, variables) => {
        qc.invalidateQueries({ queryKey: trpc.evals.list.queryKey() });
        toast.success(variables.enabled ? "Eval resumed" : "Eval paused");
      },
      onError: (e) => toast.error(e.message),
    })
  );
  const remove = useMutation(
    trpc.evals.delete.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.evals.list.queryKey() });
        setDeleteTarget(null);
        toast.success("Eval deleted");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  // Only the table body waits on data — the stat cards, toolbar and column
  // headers are static chrome and paint immediately.
  const showSkeleton = useDelayedLoading(evals.isLoading);

  const rows = evals.data ?? [];
  const searched = useTextFilter(rows, search, (r) => [r.name, r.presetId]);
  const visible = useMemo(() => {
    let f = searched;
    if (statusFilter) f = f.filter((r) => r.status === statusFilter);
    if (sourceFilter) f = f.filter((r) => r.scorerSource === sourceFilter);
    return sortRows(f, sort, {
      name: (r) => r.name,
      passRate: (r) => r.passRate ?? -1,
      avgScore: (r) => r.avgScore ?? -1,
      spend: (r) => r.cost,
    });
  }, [searched, statusFilter, sourceFilter, sort]);

  // Spend percentile thresholds across the filtered list (heatmap).
  const spendThresholds = useMemo(
    () => costThresholds(visible.map((r) => r.cost)),
    [visible]
  );

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
      judgeModel: p?.defaultModel?.modelId ?? "gemini-3.5-flash-lite",
      // Prefill the prompt editor with the preset default so it's editable.
      promptOverride: p?.prompt ?? "",
    });
  };

  const submit = () => {
    if (!selectedPreset) return;
    const filters = clean({
      agentName: form.agentName,
      workflowName: form.workflowName,
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

    // No name — the server generates one from the definition (like alerts);
    // it's renamable from the eval's edit dialog afterwards.
    create.mutate({
      projectId,
      presetId: form.presetId,
      targetLevel: form.targetLevel,
      filters: Object.keys(filters).length ? filters : undefined,
      sampleRate: Number(form.sampleRate),
      passThreshold: isJudge ? Number(form.passThreshold) : undefined,
      model: isJudge
        ? { provider: form.judgeProvider, modelId: form.judgeModel.trim() }
        : undefined,
      config: Object.keys(config).length ? config : undefined,
    });
  };

  // Shared between the footer buttons and the form's Enter-key submit.
  const nextDisabled = step === 2 && !form.presetId;
  const createDisabled =
    create.isPending ||
    needsKey ||
    (isJudge && !form.judgeModel.trim()) ||
    !!settingsParamError(selectedPreset, {
      substring: form.substring,
      pattern: form.pattern,
      maxChars: form.maxChars,
    }) ||
    !!promptOverrideError(selectedPreset, form.promptOverride) ||
    (isJudge && !!passThresholdError(form.passThreshold));

  // With no evals at all, the create button lives inside the empty state
  // (more discoverable there) instead of the header.
  const noEvals = !evals.isLoading && rows.length === 0;

  return (
    <>
      {/* Wrapped here (not inside EvalsHeader) so the copy rendered by
			    loading.tsx stays unanimated — only the page's own header fades. */}
      <div className={cn(entrance && "page-fade-in")}>
        <EvalsHeader />
      </div>
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
        {/* Opened from the header (with data) or the empty state (none) — controlled. */}
        <DialogContent className="block w-auto max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0 sm:max-w-none">
          <motion.div
            initial={false}
            animate={{
              width: step === 2 ? 800 : step === 3 ? 600 : 460,
            }}
            transition={MORPH}
            className="overflow-hidden"
          >
            {/* Enter advances the wizard (or creates on the last step). */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (step < 3) {
                  if (!nextDisabled) setStep((s) => s + 1);
                } else if (!createDisabled) {
                  submit();
                }
              }}
              className="flex flex-col gap-6 py-6"
            >
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
                                  (l) => l.value === value
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
                      <Field>
                        <FieldLabel>Agent (optional)</FieldLabel>
                        <Combobox
                          items={agentNames}
                          inputValue={form.agentName}
                          onInputValueChange={(v) => set({ agentName: v })}
                        >
                          <ComboboxInput placeholder="any" className="w-full">
                            {/* Same treatment as the alert dialog's metric
                                select: the chosen agent keeps its icon in
                                the value, not just in the list. */}
                            {agentNames.includes(form.agentName) && (
                              <InputGroupAddon align="inline-start">
                                <AgentIcon
                                  name={form.agentName}
                                  className="size-3.5"
                                />
                              </InputGroupAddon>
                            )}
                          </ComboboxInput>
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
                            <ComboboxEmpty>No matching agents.</ComboboxEmpty>
                          </ComboboxContent>
                        </Combobox>
                      </Field>
                      {form.targetLevel === "span" && (
                        <Field>
                          <FieldLabel>Span type (optional)</FieldLabel>
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
                              <SelectItem value="tool">tool</SelectItem>
                              <SelectItem value="embedding">
                                embedding
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                      )}
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
                                  (a, b) => familyRank(a.id) - familyRank(b.id)
                                )
                                .map((p) => {
                                  const { icon: PIcon, family } = presetMeta(
                                    p.id
                                  );
                                  const selected = form.presetId === p.id;
                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => pickPreset(p.id)}
                                      data-selected={selected}
                                      className="group flex cursor-pointer items-start gap-3 rounded-lg squircle:rounded-3xl corner-squircle border border-border/60 p-3 text-left transition-colors hover:bg-muted/50 data-[selected=true]:border-primary/5 data-[selected=true]:bg-primary/5 dark:data-[selected=true]:bg-primary/10"
                                    >
                                      <PIcon
                                        className={cn(
                                          "size-6 shrink-0 rounded-md squircle:rounded-xl corner-squircle p-1",
                                          FAMILY_CHIP[family]
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
                    <PreflightNotice
                      projectId={projectId}
                      presetId={selectedPreset.id}
                      targetLevel={form.targetLevel}
                      filters={clean({
                        agentName: form.agentName,
                        workflowName: form.workflowName,
                        spanType:
                          form.targetLevel === "span" ? form.spanType : "",
                        status: form.status,
                      })}
                    />
                  )}
                  {step === 3 && selectedPreset && (
                    <EvalSettingsFields
                      preset={selectedPreset}
                      judgeModel={form.judgeModel}
                      judgeProvider={form.judgeProvider}
                      sampleRate={form.sampleRate}
                      passThreshold={form.passThreshold}
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
                    type="button"
                    variant="ghost"
                    onClick={() => setStep((s) => s - 1)}
                  >
                    Back
                  </Button>
                )}
                {step < 3 ? (
                  <Button type="submit" disabled={nextDisabled}>
                    Next
                  </Button>
                ) : (
                  <Button type="submit" disabled={createDisabled}>
                    Create eval
                  </Button>
                )}
              </DialogFooter>
            </form>
          </motion.div>
        </DialogContent>
      </Dialog>
      {/* Toolbar and table chrome always render — even for an empty result —
			    so the filters stay reachable. The empty states swap in for the
			    table only; the body rows wait on the query (skeleton rows below). */}
      <div
        className={cn("flex flex-col gap-4 mt-1", entrance && "page-fade-in")}
      >
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
          <ClearFiltersButton
            show={!!(search || statusFilter || sourceFilter)}
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setSourceFilter("");
            }}
          />
          <div className="ml-auto flex items-center gap-2">
            <RangeControl value={range} onChange={setRange} />
            {!noEvals && (
              <Button onClick={() => setOpen(true)} variant="secondary">
                <IconPlus strokeWidth={2.4} />
                New eval
              </Button>
            )}
          </div>
        </Toolbar>

        {!evals.isLoading && visible.length === 0 ? (
          // Zero evals defined → onboarding + CTA; evals exist but the
          // filters exclude them all → "no matching".
          <div className="mt-2 px-8">
            {rows.length === 0 ? (
              <EmptyState
                icon={IconGaugeFilled}
                title="No evals yet"
                description="Create an eval to score your production traces and spans."
              >
                <Button className="mt-2" onClick={() => setOpen(true)}>
                  <IconPlus strokeWidth={2.4} />
                  New eval
                </Button>
              </EmptyState>
            ) : (
              <EmptyState
                icon={IconGaugeFilled}
                title="No matching evals"
                description="Try a different search or clearing filters."
              />
            )}
          </div>
        ) : (
          // Fixed layout so column widths never depend on row content — the
          // table doesn't reflow as sorting changes which rows are visible.
          // The text/badge columns truncate (see cells below).
          <TooltipProvider delay={150}>
            <Table className="table-fixed min-w-5xl -mt-2" stickyHeader>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    className="w-40  truncate"
                    sortKey="name"
                    sort={sort}
                    onSort={toggle}
                  >
                    Name
                  </SortableHead>
                  <TableHead className="w-36">Check</TableHead>
                  <TableHead className="w-52">Scope</TableHead>
                  <SortableHead
                    sortKey="passRate"
                    sort={sort}
                    onSort={toggle}
                    align="right"
                    className="w-20"
                  >
                    Pass rate
                  </SortableHead>
                  <SortableHead
                    sortKey="avgScore"
                    sort={sort}
                    onSort={toggle}
                    align="right"
                    className="w-20"
                  >
                    Avg score
                  </SortableHead>
                  <SortableHead
                    sortKey="spend"
                    sort={sort}
                    onSort={toggle}
                    align="right"
                    className="w-20"
                  >
                    Spend
                  </SortableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {evals.isLoading ? (
                  showSkeleton ? (
                    <TableRowsSkeleton cols={SKELETON_COLS} />
                  ) : null
                ) : (
                  visible.map((r) => {
                    const CheckIcon = presetMeta(r.presetId).icon;
                    return (
                      <TableRow
                        key={r.id}
                        interactive
                        onClick={() => router.push(`/evals/${r.id}`)}
                      >
                        <TableCell className="font-medium h-12">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-normal">
                              {r.name}
                            </span>
                            {(r.status === "error" ||
                              r.status === "paused_no_key") && (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <span className="flex shrink-0 items-center font-sans text-sm text-red-600 dark:text-red-400" />
                                  }
                                >
                                  <IconAlertTriangle className="size-3.5 fill-current/20" />
                                </TooltipTrigger>
                                <TooltipContent
                                  side="bottom"
                                  className="max-w-sm items-start"
                                >
                                  <span className="wrap-break-word">
                                    {r.status === "paused_no_key"
                                      ? "Paused: add an API key for the judge model's provider."
                                      : (r.lastError ?? "Scoring is failing.")}
                                  </span>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={presetBadgeVariant(r.presetId)}
                            className="min-w-0 max-w-full"
                          >
                            <CheckIcon className="opacity-80 mb-px" />
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
                            {/* Level, agent filter, and the sample rate in one line. */}
                            <span className="truncate">
                              <span className="capitalize">
                                {r.targetLevel}
                              </span>
                              {r.filters?.agentName
                                ? ` · ${r.filters.agentName}`
                                : ""}
                              <span className="tabular-nums">
                                {` · ${Math.round(r.sampleRate * 100)}%`}
                              </span>
                            </span>
                          </span>
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
                                      "text-rose-600 dark:text-rose-400"
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
                        <HeatCell
                          value={r.cost}
                          thresholds={spendThresholds}
                          metric="spend"
                          bold
                          mutedWhenZero
                        >
                          {r.cost > 0
                            ? formatCostFixed(r.cost, 4)
                            : r.scorerSource === "code"
                              ? "$0"
                              : "—"}
                        </HeatCell>
                        <TableCell
                          onClick={(e) => e.stopPropagation()}
                          align="center"
                        >
                          <div className="flex items-center gap-2 justify-center">
                            <Switch
                              size="sm"
                              checked={r.enabled}
                              // Lock only the row being toggled.
                              disabled={
                                update.isPending &&
                                update.variables?.evalId === r.id
                              }
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
                  })
                )}
              </TableBody>
            </Table>
          </TooltipProvider>
        )}
      </div>
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
    Object.entries(obj).filter(([, v]) => v.trim() !== "")
  );
}

// Placeholder blob for stat-card values while the query is in flight.

// Skeleton column spec for the loading body rows (see TableRowsSkeleton).
const SKELETON_COLS = [
  { w: "w-28" },
  { w: "w-24" },
  { icon: true, w: "w-20" },
  { align: "right", w: "w-10" },
  { align: "right", w: "w-10" },
  { align: "right", w: "w-14" },
  {},
] as const;

/** Step-3 dry run: samples the last week of matching traffic and warns when
 * the check would skip most of it (no output, no reference in metadata, no
 * retrieved context) — the eval can still be created, but the user learns
 * *before* paying a judge that the traffic lacks what the preset needs. */
function PreflightNotice({
  projectId,
  presetId,
  targetLevel,
  filters,
}: {
  projectId: string;
  presetId: string;
  targetLevel: "trace" | "span";
  filters: Record<string, string>;
}) {
  const preflight = useQuery({
    ...trpc.evals.preflight.queryOptions({
      projectId,
      presetId,
      targetLevel,
      filters: Object.keys(filters).length ? filters : undefined,
    }),
    staleTime: 60_000,
  });
  const d = preflight.data;
  if (!d || d.sampled === 0) return null;
  const top = d.skips[0];
  if (!top) return null;
  const reason = top.reason.replace(/^Skipped: /, "").replace(/\.$/, "");
  const others =
    d.skips.length > 1
      ? ` (+${d.skips.length - 1} other ${d.skips.length === 2 ? "reason" : "reasons"})`
      : "";
  if (d.gradable === 0) {
    return (
      <Alert variant="destructive" className="-mt-2 mb-4">
        <IconAlertTriangle />
        <AlertTitle>
          This check can't grade any of the recent matching runs
        </AlertTitle>
        <AlertDescription>
          {reason}
          {others}. Pick a different check, or adjust the target filters.
        </AlertDescription>
      </Alert>
    );
  }
  // Partial skips are advisory: one quiet line, not a banner.
  return (
    <p className="-mt-2 mb-4 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
      <IconAlertTriangle className="size-3.5 shrink-0" />
      <span>
        {d.sampled - d.gradable} of the last {d.sampled} matching runs would be
        skipped: {reason}
        {others}.
      </span>
    </p>
  );
}
