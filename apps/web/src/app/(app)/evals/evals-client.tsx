"use client";

import { IconGaugeFilled, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@foglamp/ui/components/dialog";
import { Field, FieldLabel } from "@foglamp/ui/components/field";
import { Input } from "@foglamp/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@foglamp/ui/components/native-select";
import { Switch } from "@foglamp/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  NoProject,
  PageHeader,
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { formatRelative } from "@/lib/format";
import { trpc } from "@/utils/trpc";

type Provider = "google" | "openai" | "anthropic";
const SAMPLE_PRESETS = ["0.01", "0.05", "0.1", "0.25", "0.5", "1"] as const;

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

export function EvalsClient() {
  const { projectId } = useProject();
  const qc = useQueryClient();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(DEFAULT_FORM);
  const set = (patch: Partial<typeof DEFAULT_FORM>) =>
    setForm((f) => ({ ...f, ...patch }));

  const evals = useQuery({
    ...trpc.evals.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  const presets = useQuery(trpc.evals.presets.queryOptions());
  const providerKeys = useQuery({
    ...trpc.providerKeys.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  // Existing agent names → datalist suggestions (free typing still allowed).
  const agents = useQuery({
    ...trpc.agents.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const selectedPreset = useMemo(
    () => presets.data?.find((p) => p.id === form.presetId) ?? null,
    [presets.data, form.presetId],
  );
  const configuredProviders = new Set(
    (providerKeys.data?.keys ?? []).map((k) => k.provider),
  );

  const create = useMutation(
    trpc.evals.create.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.evals.list.queryKey() });
        setOpen(false);
        setStep(1);
        setForm(DEFAULT_FORM);
        toast.success("Eval created — scoring new traffic from now.");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const update = useMutation(
    trpc.evals.update.mutationOptions({
      onSuccess: () => qc.invalidateQueries({ queryKey: trpc.evals.list.queryKey() }),
      onError: (e) => toast.error(e.message),
    }),
  );
  const remove = useMutation(
    trpc.evals.delete.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.evals.list.queryKey() });
        toast.success("Eval deleted");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  if (!projectId) {
    return (
      <>
        <PageHeader title="Evals" />
        <NoProject />
      </>
    );
  }

  const rows = evals.data ?? [];
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
    if (selectedPreset.id === "contains" || selectedPreset.id === "not_contains")
      params.substring = form.substring;
    if (selectedPreset.id === "regex_match") params.pattern = form.pattern;
    if (selectedPreset.id === "max_length") params.maxChars = Number(form.maxChars);

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
        description="Score production traces and spans — code checks and LLM judges (BYOK)."
        actions={
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
            <DialogTrigger render={<Button size="sm" />}>
              <IconPlus />
              New eval
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New eval · step {step} of 3</DialogTitle>
                <DialogDescription>
                  {step === 1 && "What should this eval run on?"}
                  {step === 2 && "What do you want to check?"}
                  {step === 3 && "How should it score?"}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4">
                {step === 1 && (
                  <>
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
                      <NativeSelect
                        value={form.targetLevel}
                        onChange={(e) =>
                          set({ targetLevel: e.target.value as "trace" | "span" })
                        }
                      >
                        <NativeSelectOption value="trace">
                          Traces (the whole agent run)
                        </NativeSelectOption>
                        <NativeSelectOption value="span">
                          Spans (individual steps)
                        </NativeSelectOption>
                      </NativeSelect>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field>
                        <FieldLabel>Agent (optional)</FieldLabel>
                        <Input
                          placeholder="any"
                          list="eval-agent-options"
                          value={form.agentName}
                          onChange={(e) => set({ agentName: e.target.value })}
                        />
                        <datalist id="eval-agent-options">
                          {(agents.data ?? []).map((a) => (
                            <option key={a.agentName} value={a.agentName} />
                          ))}
                        </datalist>
                      </Field>
                      <Field>
                        <FieldLabel>Trace name (optional)</FieldLabel>
                        <Input
                          placeholder="any"
                          value={form.traceName}
                          onChange={(e) => set({ traceName: e.target.value })}
                        />
                      </Field>
                      {form.targetLevel === "span" && (
                        <>
                          <Field>
                            <FieldLabel>Span type (optional)</FieldLabel>
                            <NativeSelect
                              value={form.spanType}
                              onChange={(e) => set({ spanType: e.target.value })}
                            >
                              <NativeSelectOption value="">any</NativeSelectOption>
                              <NativeSelectOption value="llm">llm</NativeSelectOption>
                              <NativeSelectOption value="tool">tool</NativeSelectOption>
                              <NativeSelectOption value="embedding">
                                embedding
                              </NativeSelectOption>
                            </NativeSelect>
                          </Field>
                          <Field>
                            <FieldLabel>Model (optional)</FieldLabel>
                            <Input
                              placeholder="any"
                              value={form.modelId}
                              onChange={(e) => set({ modelId: e.target.value })}
                            />
                          </Field>
                        </>
                      )}
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <Field>
                      <FieldLabel>Check</FieldLabel>
                      <NativeSelect
                        value={form.presetId}
                        onChange={(e) => pickPreset(e.target.value)}
                      >
                        <NativeSelectOption value="">Select a preset…</NativeSelectOption>
                        <optgroup label="Code (free, deterministic)">
                          {(presets.data ?? [])
                            .filter((p) => p.source === "code")
                            .map((p) => (
                              <NativeSelectOption key={p.id} value={p.id}>
                                {p.name}
                              </NativeSelectOption>
                            ))}
                        </optgroup>
                        <optgroup label="LLM judge (BYOK)">
                          {(presets.data ?? [])
                            .filter((p) => p.source === "llm")
                            .map((p) => (
                              <NativeSelectOption key={p.id} value={p.id}>
                                {p.name}
                              </NativeSelectOption>
                            ))}
                        </optgroup>
                      </NativeSelect>
                    </Field>
                    {selectedPreset && (
                      <p className="text-sm text-muted-foreground">
                        {selectedPreset.description}
                      </p>
                    )}
                  </>
                )}

                {step === 3 && selectedPreset && (
                  <>
                    {isJudge && (
                      <>
                        <Field>
                          <FieldLabel>Judge provider</FieldLabel>
                          <NativeSelect
                            value={form.judgeProvider}
                            onChange={(e) =>
                              set({ judgeProvider: e.target.value as Provider })
                            }
                          >
                            <NativeSelectOption value="google">Google</NativeSelectOption>
                            <NativeSelectOption value="openai">OpenAI</NativeSelectOption>
                          </NativeSelect>
                        </Field>
                        <Field>
                          <FieldLabel>Judge model</FieldLabel>
                          <Input
                            value={form.judgeModel}
                            onChange={(e) => set({ judgeModel: e.target.value })}
                          />
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
                          onChange={(e) => set({ substring: e.target.value })}
                        />
                      </Field>
                    )}
                    {selectedPreset.id === "regex_match" && (
                      <Field>
                        <FieldLabel>Pattern</FieldLabel>
                        <Input
                          value={form.pattern}
                          onChange={(e) => set({ pattern: e.target.value })}
                        />
                      </Field>
                    )}
                    {selectedPreset.id === "max_length" && (
                      <Field>
                        <FieldLabel>Max characters</FieldLabel>
                        <Input
                          type="number"
                          value={form.maxChars}
                          onChange={(e) => set({ maxChars: e.target.value })}
                        />
                      </Field>
                    )}
                    <Field>
                      <FieldLabel>Sample rate</FieldLabel>
                      <NativeSelect
                        value={form.sampleRate}
                        onChange={(e) => set({ sampleRate: e.target.value })}
                      >
                        {SAMPLE_PRESETS.map((s) => (
                          <NativeSelectOption key={s} value={s}>
                            {Math.round(Number(s) * 100)}% of matching {form.targetLevel}s
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                  </>
                )}
              </div>

              <DialogFooter>
                {step > 1 && (
                  <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
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
                    disabled={create.isPending || needsKey || (isJudge && !form.judgeModel.trim())}
                    onClick={submit}
                  >
                    Create eval
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {evals.isLoading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={IconGaugeFilled}
          title="No evals yet"
          description="Create an eval to score your production traces and spans."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Check</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Sample</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() => router.push(`/evals/${r.id}`)}
              >
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>
                  <Badge variant={r.scorerSource === "llm" ? "violet" : "secondary"}>
                    {r.presetId}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.targetLevel}
                  {r.filters?.agentName ? ` · ${r.filters.agentName}` : ""}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {Math.round(r.sampleRate * 100)}%
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      r.status === "paused_no_key"
                        ? "rose"
                        : r.status === "error"
                          ? "rose"
                          : "emerald"
                    }
                  >
                    {r.status === "paused_no_key" ? "needs key" : r.status}
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
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => remove.mutate({ evalId: r.id })}
                  >
                    <IconTrash />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}

function clean(obj: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v.trim() !== ""),
  );
}
