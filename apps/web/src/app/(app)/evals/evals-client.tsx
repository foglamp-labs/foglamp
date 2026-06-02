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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { cn } from "@foglamp/ui/lib/utils";
import {
  type Icon,
  IconAdjustments,
  IconAdjustmentsFilled,
  IconAffiliate,
  IconAlertTriangleFilled,
  IconArrowAutofitWidth,
  IconArrowAutofitWidthFilled,
  IconBiohazard,
  IconBiohazardFilled,
  IconBolt,
  IconBoltFilled,
  IconBook,
  IconBookFilled,
  IconCircleCheck,
  IconCircleCheckFilled,
  IconClipboardCheck,
  IconClipboardCheckFilled,
  IconCurrentLocation,
  IconCurrentLocationFilled,
  IconFileCode,
  IconFileCodeFilled,
  IconFileText,
  IconFileTextFilled,
  IconFilter,
  IconFilterFilled,
  IconForbid,
  IconForbidFilled,
  IconGaugeFilled,
  IconHeart,
  IconHeartFilled,
  IconKey,
  IconKeyFilled,
  IconListCheck,
  IconListCheckFilled,
  IconMoodSmile,
  IconMoodSmileFilled,
  IconPlus,
  IconProgress,
  IconPuzzle,
  IconPuzzleFilled,
  IconRosetteDiscountCheck,
  IconRosetteDiscountCheckFilled,
  IconSearch,
  IconSearchFilled,
  IconShieldLock,
  IconShieldLockFilled,
  IconSparkles,
  IconSparklesFilled,
  IconStack2,
  IconToggleRight,
  IconTrash,
  IconTrashFilled,
  IconZoom,
  IconZoomFilled,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import {
  ClearFiltersButton,
  FilterSelect,
  SearchInput,
  SortableHead,
  sortRows,
  Toolbar,
  useDelayedLoading,
  useTableSort,
  useTextFilter,
} from "@/components/app/data-table";
import {
  EmptyState,
  NoProject,
  PageHeader,
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { ModelLogo } from "@/components/model-logo";
import { formatRelative } from "@/lib/format";
import { trpc } from "@/utils/trpc";

type Provider = "google" | "openai" | "anthropic";
const SAMPLE_PRESETS = ["0.01", "0.05", "0.1", "0.25", "0.5", "1"] as const;

// Judge model catalog per provider. Kept to known-good ids (BYOK calls these
// directly), surfaced as a dropdown so users don't have to type a model id.
const JUDGE_MODELS: Record<Provider, { id: string; label: string }[]> = {
  google: [
    { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  ],
  openai: [
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
    { id: "gpt-5.5", label: "GPT-5.5" },
  ],
  anthropic: [
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
  ],
};

// Provider display order + labels for the grouped judge-model dropdown.
const PROVIDER_GROUPS: {
  provider: Provider;
  label: string;
  disabled?: boolean;
}[] = [
  { provider: "google", label: "Google" },
  { provider: "openai", label: "OpenAI" },
  // Anthropic judges aren't wired yet (@ai-sdk/anthropic is canary-only); shown
  // but disabled so the lineup is visible without producing broken evals.
  { provider: "anthropic", label: "Anthropic", disabled: true },
];

// Flat lookups: which provider/label owns a given model id (ids are unique
// across providers), so selecting a model derives its provider.
const MODEL_PROVIDER: Record<string, Provider> = Object.fromEntries(
  (Object.entries(JUDGE_MODELS) as [Provider, { id: string }[]][]).flatMap(
    ([p, list]) => list.map((m) => [m.id, p] as const)
  )
);
const MODEL_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(JUDGE_MODELS)
    .flat()
    .map((m) => [m.id, m.label] as const)
);

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

// Colored icon chips for the step-2 check cards, in the same vein as the
// sidebar nav: a tinted square with a filled icon and a matching inset/drop
// shadow. Checks are grouped into families that share a color, so related
// checks (e.g. Valid JSON / Non-empty) read as siblings at a glance.
type Family = "safety" | "format" | "match" | "quality" | "grounding" | "tool";

const FAMILY_CHIP: Record<Family, string> = {
  safety:
    "bg-rose-100 dark:bg-rose-950 text-rose-500 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.14),0_2px_6px_-2px_rgba(244,63,94,0.25)] dark:shadow-(--custom-shadow)",
  format:
    "bg-sky-100 dark:bg-sky-950 text-sky-500 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.14),0_2px_6px_-2px_rgba(14,165,233,0.25)] dark:shadow-(--custom-shadow)",
  match:
    "bg-violet-100 dark:bg-violet-950 text-violet-500 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.14),0_2px_6px_-2px_rgba(139,92,246,0.25)] dark:shadow-(--custom-shadow)",
  quality:
    "bg-fuchsia-100 dark:bg-fuchsia-950 text-fuchsia-500 shadow-[inset_0_0_0_1px_rgba(217,70,239,0.14),0_2px_6px_-2px_rgba(217,70,239,0.25)] dark:shadow-(--custom-shadow)",
  grounding:
    "bg-emerald-100 dark:bg-emerald-950 text-emerald-500 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.14),0_2px_6px_-2px_rgba(16,185,129,0.25)] dark:shadow-(--custom-shadow)",
  tool: "bg-amber-100 dark:bg-amber-950 text-amber-500 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.14),0_2px_6px_-2px_rgba(245,158,11,0.25)] dark:shadow-(--custom-shadow)",
};

// Filled icon + color family per preset id (stable). Anything new falls back to
// a generic sparkle in the "quality" color.
const PRESET_META: Record<
  string,
  { icon: Icon; outline: Icon; family: Family }
> = {
  // Safety / privacy
  pii: {
    icon: IconShieldLockFilled,
    outline: IconShieldLock,
    family: "safety",
  },
  secret_leak: { icon: IconKeyFilled, outline: IconKey, family: "safety" },
  toxicity: {
    icon: IconBiohazardFilled,
    outline: IconBiohazard,
    family: "safety",
  },
  // Format / structure
  valid_json: {
    icon: IconFileCodeFilled,
    outline: IconFileCode,
    family: "format",
  },
  not_empty: {
    icon: IconFileTextFilled,
    outline: IconFileText,
    family: "format",
  },
  max_length: {
    icon: IconArrowAutofitWidthFilled,
    outline: IconArrowAutofitWidth,
    family: "format",
  },
  tool_args_valid: {
    icon: IconClipboardCheckFilled,
    outline: IconClipboardCheck,
    family: "format",
  },
  // Content match
  contains: { icon: IconSearchFilled, outline: IconSearch, family: "match" },
  not_contains: {
    icon: IconForbidFilled,
    outline: IconForbid,
    family: "match",
  },
  regex_match: { icon: IconFilterFilled, outline: IconFilter, family: "match" },
  // Quality judges
  relevance: {
    icon: IconCurrentLocationFilled,
    outline: IconCurrentLocation,
    family: "quality",
  },
  helpfulness: { icon: IconHeartFilled, outline: IconHeart, family: "quality" },
  coherence: {
    icon: IconAdjustmentsFilled,
    outline: IconAdjustments,
    family: "quality",
  },
  conciseness: { icon: IconBoltFilled, outline: IconBolt, family: "quality" },
  instruction_following: {
    icon: IconListCheckFilled,
    outline: IconListCheck,
    family: "quality",
  },
  completeness: {
    icon: IconRosetteDiscountCheckFilled,
    outline: IconRosetteDiscountCheck,
    family: "quality",
  },
  no_refusal: {
    icon: IconMoodSmileFilled,
    outline: IconMoodSmile,
    family: "quality",
  },
  // Grounding / RAG
  faithfulness: {
    icon: IconBookFilled,
    outline: IconBook,
    family: "grounding",
  },
  context_relevance: {
    icon: IconZoomFilled,
    outline: IconZoom,
    family: "grounding",
  },
  correctness: {
    icon: IconCircleCheckFilled,
    outline: IconCircleCheck,
    family: "grounding",
  },
  // Tool
  tool_selection: {
    icon: IconPuzzleFilled,
    outline: IconPuzzle,
    family: "tool",
  },
};
const presetMeta = (
  id: string
): { icon: Icon; outline: Icon; family: Family } =>
  PRESET_META[id] ?? {
    icon: IconSparklesFilled,
    outline: IconSparkles,
    family: "quality",
  };

// Display order for the check cards: group by family so same-colored chips sit
// next to each other in the grid rather than scattered.
const FAMILY_ORDER: Family[] = [
  "safety",
  "format",
  "match",
  "quality",
  "grounding",
  "tool",
];
const familyRank = (id: string) => FAMILY_ORDER.indexOf(presetMeta(id).family);

// Run-status badge styling (variant + filled icon + label), à la the alerts
// table's status column.
const STATUS_META: Record<
  string,
  { variant: "rose" | "emerald" | "secondary"; icon: Icon; label?: string }
> = {
  ok: { variant: "emerald", icon: IconCircleCheckFilled },
  paused_no_key: {
    variant: "rose",
    icon: IconKeyFilled,
    label: "needs key",
  },
  error: { variant: "rose", icon: IconAlertTriangleFilled },
};
const DEFAULT_STATUS_META = {
  variant: "secondary" as const,
  icon: IconProgress,
};

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

// A scroll viewport with fade overlays: the top fade appears once scrolled away
// from the top, the bottom fade while there's more content below. Both track
// the live scroll position (and recompute when the content size changes, e.g.
// presets finish loading).
function ScrollFade({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const update = useCallback(() => {
    const el = viewport.current;
    if (!el) return;
    setEdges({
      top: el.scrollTop > 1,
      bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
    });
  }, []);
  useLayoutEffect(() => {
    update();
    const el = content.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);
  return (
    <div className="relative">
      <div
        ref={viewport}
        onScroll={update}
        className={cn("overflow-y-auto", className)}
      >
        <div ref={content}>{children}</div>
      </div>
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-10 bg-linear-to-b from-popover to-transparent transition-opacity duration-150",
          edges.top ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-popover to-transparent transition-opacity duration-150",
          edges.bottom ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}

// A segmented control — the look of tabs, but a plain single-select with a
// sliding pill (shared layoutId) that glides under the active option.
function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex w-full rounded-2xl corner-squircle bg-muted p-[3px] dark:bg-muted/50">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative flex-1 cursor-pointer rounded-xl corner-squircle px-2 py-1 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "text-foreground"
                : "text-foreground/60 hover:text-foreground"
            )}
          >
            {active && (
              <motion.span
                layoutId="sample-rate-pill"
                transition={MORPH}
                className="absolute inset-0 rounded-xl corner-squircle bg-background shadow-(--custom-shadow) dark:bg-input/50"
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
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
};

type EvalSortKey = "name" | "sample" | "status";

export function EvalsClient() {
  const { projectId } = useProject();
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
    ""
  );
  const { sort, toggle } = useTableSort<EvalSortKey>();

  const evals = useQuery({
    ...trpc.evals.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  const presets = useQuery(trpc.evals.presets.queryOptions());
  const providerKeys = useQuery({
    ...trpc.providerKeys.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  // Existing agent names → combobox suggestions (free typing still allowed).
  const agents = useQuery({
    ...trpc.agents.list.queryOptions({ projectId: projectId! }),
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
  const agentNames = (agents.data ?? []).map((a) => a.agentName);

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
      onSuccess: () =>
        qc.invalidateQueries({ queryKey: trpc.evals.list.queryKey() }),
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
      status: (r) => r.status,
    });
  }, [searched, statusFilter, sourceFilter, levelFilter, stateFilter, sort]);

  if (!projectId) {
    return (
      <>
        <PageHeader title="Evals" />
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
      config: Object.keys(params).length ? { params } : undefined,
    });
  };

  return (
    <>
      <PageHeader
        title="Evals"
        description="Score production traces and spans with code checks and LLM-as-a-judge."
        actions={
          <>
            {/* With data the New eval button lives in the toolbar; with none,
                show it here in the header. */}
            {rows.length === 0 && (
              <Button size="sm" onClick={() => setOpen(true)}>
                <IconPlus />
                New eval
              </Button>
            )}
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
                animate={{ width: step === 2 ? 800 : 460 }}
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
                                        {item}
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
                        <ScrollFade className="max-h-[55vh]">
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
                                        familyRank(a.id) - familyRank(b.id)
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
                        <div className="flex flex-col gap-4">
                          {isJudge && (
                            <>
                              <Field>
                                <FieldLabel>Judge model</FieldLabel>
                                <Select
                                  value={form.judgeModel}
                                  onValueChange={(v) => {
                                    const id = v as string;
                                    // Derive the provider from the chosen model
                                    // so the two stay in lockstep without a
                                    // separate field.
                                    set({
                                      judgeModel: id,
                                      judgeProvider:
                                        MODEL_PROVIDER[id] ??
                                        form.judgeProvider,
                                    });
                                  }}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select a model">
                                      {(value) => {
                                        const id = value as string;
                                        return (
                                          <span className="flex items-center gap-2">
                                            <ModelLogo
                                              provider={MODEL_PROVIDER[id]}
                                              modelId={id}
                                            />
                                            {MODEL_LABEL[id] ?? id}
                                          </span>
                                        );
                                      }}
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PROVIDER_GROUPS.map((g) => (
                                      <SelectGroup key={g.provider}>
                                        <SelectLabel>{g.label}</SelectLabel>
                                        {JUDGE_MODELS[g.provider].map((m) => (
                                          <SelectItem
                                            key={m.id}
                                            value={m.id}
                                            label={m.label}
                                            disabled={g.disabled}
                                          >
                                            <ModelLogo
                                              provider={g.provider}
                                              modelId={m.id}
                                            />
                                            {m.label}
                                            {g.disabled && (
                                              <span className="ml-auto text-xs text-muted-foreground">
                                                Soon
                                              </span>
                                            )}
                                          </SelectItem>
                                        ))}
                                      </SelectGroup>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </Field>
                              {needsKey && (
                                <p className="text-sm text-destructive">
                                  No {form.judgeProvider} key saved.{" "}
                                  <Link
                                    href="/settings/provider-keys"
                                    className="underline"
                                  >
                                    Add one
                                  </Link>{" "}
                                  to enable this judge.
                                </p>
                              )}
                            </>
                          )}
                          {(selectedPreset.id === "contains" ||
                            selectedPreset.id === "not_contains") && (
                            <Field>
                              <FieldLabel>Substring</FieldLabel>
                              <Input
                                value={form.substring}
                                onChange={(e) =>
                                  set({ substring: e.target.value })
                                }
                              />
                            </Field>
                          )}
                          {selectedPreset.id === "regex_match" && (
                            <Field>
                              <FieldLabel>Pattern</FieldLabel>
                              <Input
                                value={form.pattern}
                                onChange={(e) =>
                                  set({ pattern: e.target.value })
                                }
                              />
                            </Field>
                          )}
                          {selectedPreset.id === "max_length" && (
                            <Field>
                              <FieldLabel>Max characters</FieldLabel>
                              <Input
                                type="number"
                                value={form.maxChars}
                                onChange={(e) =>
                                  set({ maxChars: e.target.value })
                                }
                              />
                            </Field>
                          )}
                          <Field>
                            <FieldLabel>Sample rate</FieldLabel>
                            <Segmented
                              options={SAMPLE_PRESETS.map((s) => ({
                                value: s,
                                label: `${Math.round(Number(s) * 100)}%`,
                              }))}
                              value={form.sampleRate}
                              onChange={(v) => set({ sampleRate: v })}
                            />
                          </Field>
                        </div>
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
                          (isJudge && !form.judgeModel.trim())
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
            <Button size="sm" className="ml-auto" onClick={() => setOpen(true)}>
              <IconPlus />
              New eval
            </Button>
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
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <SortableHead sortKey="name" sort={sort} onSort={toggle}>
                    Name
                  </SortableHead>
                  <TableHead className="w-44">Check</TableHead>
                  <TableHead className="w-40">Target</TableHead>
                  <SortableHead
                    sortKey="sample"
                    sort={sort}
                    onSort={toggle}
                    className="w-28"
                  >
                    Sample
                  </SortableHead>
                  <SortableHead
                    sortKey="status"
                    sort={sort}
                    onSort={toggle}
                    className="w-32"
                  >
                    Status
                  </SortableHead>
                  <TableHead className="w-24">Enabled</TableHead>
                  <TableHead className="w-14" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => {
                  const CheckIcon = presetMeta(r.presetId).outline;
                  const status = STATUS_META[r.status] ?? DEFAULT_STATUS_META;
                  const StatusIcon = status.icon;
                  return (
                    <TableRow
                      key={r.id}
                      interactive
                      onClick={() => router.push(`/evals/${r.id}`)}
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
                      <TableCell className="truncate text-muted-foreground">
                        {r.targetLevel}
                        {r.filters?.agentName
                          ? ` · ${r.filters.agentName}`
                          : ""}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {Math.round(r.sampleRate * 100)}%
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>
                          <StatusIcon />
                          {status.label ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={r.enabled}
                          onCheckedChange={(checked) =>
                            update.mutate({ evalId: r.id, enabled: checked })
                          }
                        />
                      </TableCell>
                      <TableCell
                        onClick={(e) => e.stopPropagation()}
                        align="center"
                      >
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() =>
                            setDeleteTarget({ id: r.id, name: r.name })
                          }
                        >
                          <IconTrashFilled />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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
    Object.entries(obj).filter(([, v]) => v.trim() !== "")
  );
}
