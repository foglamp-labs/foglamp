"use client";

import {
  IconAlertTriangle,
  IconAlertTriangleFilled,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
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
import { useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  NoProject,
  PageHeader,
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { formatDuration } from "@/lib/format";
import { trpc } from "@/utils/trpc";

type Metric =
  | "cost"
  | "latency_p50"
  | "latency_p95"
  | "latency_p99"
  | "ttft_p95"
  | "error_rate"
  | "token_usage"
  | "request_count"
  | "eval_avg_score"
  | "eval_pass_rate";

type Comparison = "gt" | "gte" | "lt" | "lte";

const METRIC_LABELS: Record<Metric, string> = {
  cost: "Cost",
  latency_p50: "Latency p50",
  latency_p95: "Latency p95",
  latency_p99: "Latency p99",
  ttft_p95: "TTFT p95",
  error_rate: "Error rate",
  token_usage: "Token usage",
  request_count: "Request count",
  eval_avg_score: "Avg eval score",
  eval_pass_rate: "Eval pass rate",
};

const isEvalMetric = (m: Metric) =>
  m === "eval_avg_score" || m === "eval_pass_rate";

const COMPARISON_SYMBOLS: Record<Comparison, string> = {
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};

const WINDOW_PRESETS = [
  { value: "300", label: "5 min" },
  { value: "900", label: "15 min" },
  { value: "3600", label: "1 hour" },
  { value: "86400", label: "24 hours" },
] as const;

const DEFAULT_FORM = {
  name: "",
  metric: "cost" as Metric,
  evalId: "",
  comparison: "gt" as Comparison,
  threshold: "",
  windowSeconds: "3600",
  email: "",
};

export function AlertsClient() {
  const { projectId } = useProject();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  const alerts = useQuery({
    ...trpc.alerts.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  const evals = useQuery({
    ...trpc.evals.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const create = useMutation(
    trpc.alerts.create.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.alerts.list.queryKey() });
        setOpen(false);
        setForm(DEFAULT_FORM);
        toast.success("Alert created");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const update = useMutation(
    trpc.alerts.update.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.alerts.list.queryKey() });
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const deleteAlert = useMutation(
    trpc.alerts.delete.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.alerts.list.queryKey() });
        toast.success("Alert deleted");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  if (!projectId) {
    return (
      <>
        <PageHeader title="Alerts" />
        <NoProject />
      </>
    );
  }

  const rows = alerts.data ?? [];

  const handleSubmit = () => {
    if (!form.name.trim() || !form.email.trim()) return;
    if (isEvalMetric(form.metric) && !form.evalId) return;
    create.mutate({
      projectId: projectId!,
      name: form.name.trim(),
      metric: form.metric,
      evalId: isEvalMetric(form.metric) ? form.evalId : undefined,
      comparison: form.comparison,
      threshold: Number(form.threshold),
      windowSeconds: Number(form.windowSeconds),
      channels: [{ type: "email", to: form.email.trim() }],
    });
  };

  const isSubmitDisabled =
    create.isPending ||
    !form.name.trim() ||
    !form.email.trim() ||
    (isEvalMetric(form.metric) && !form.evalId);

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Threshold rules evaluated against your metrics."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <IconPlus />
              New alert
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New alert</DialogTitle>
                <DialogDescription>
                  Create a threshold rule to get notified when a metric crosses
                  a value.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <Input
                    placeholder="e.g. High error rate"
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>Metric</FieldLabel>
                  <NativeSelect
                    value={form.metric}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        metric: e.target.value as Metric,
                      }))
                    }
                  >
                    {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
                      <NativeSelectOption key={m} value={m}>
                        {METRIC_LABELS[m]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                {isEvalMetric(form.metric) && (
                  <Field>
                    <FieldLabel>Eval</FieldLabel>
                    <NativeSelect
                      value={form.evalId}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, evalId: e.target.value }))
                      }
                    >
                      <NativeSelectOption value="">Select an eval…</NativeSelectOption>
                      {(evals.data ?? []).map((ev) => (
                        <NativeSelectOption key={ev.id} value={ev.id}>
                          {ev.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                )}
                <Field>
                  <FieldLabel>Comparison</FieldLabel>
                  <NativeSelect
                    value={form.comparison}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        comparison: e.target.value as Comparison,
                      }))
                    }
                  >
                    <NativeSelectOption value="gt">
                      {">"} greater than
                    </NativeSelectOption>
                    <NativeSelectOption value="gte">
                      {"≥"} greater than or equal
                    </NativeSelectOption>
                    <NativeSelectOption value="lt">
                      {"<"} less than
                    </NativeSelectOption>
                    <NativeSelectOption value="lte">
                      {"≤"} less than or equal
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Threshold</FieldLabel>
                  <Input
                    type="number"
                    placeholder="0"
                    value={form.threshold}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, threshold: e.target.value }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel>Window</FieldLabel>
                  <NativeSelect
                    value={form.windowSeconds}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, windowSeconds: e.target.value }))
                    }
                  >
                    {WINDOW_PRESETS.map((p) => (
                      <NativeSelectOption key={p.value} value={p.value}>
                        {p.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Email channel</FieldLabel>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                </Field>
              </div>
              <DialogFooter>
                <Button disabled={isSubmitDisabled} onClick={handleSubmit}>
                  Create alert
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      {alerts.isLoading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={IconAlertTriangleFilled}
          title="No alerts yet"
          description="Create a rule to get notified when a metric crosses a threshold."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Metric</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Window</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {METRIC_LABELS[r.metric as Metric] ?? r.metric}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums text-sm">
                  {COMPARISON_SYMBOLS[r.comparison as Comparison] ??
                    r.comparison}{" "}
                  {r.threshold ?? "—"}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {formatDuration(r.windowSeconds * 1000)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      r.status === "firing"
                        ? "rose"
                        : r.status === "ok"
                          ? "emerald"
                          : "secondary"
                    }
                  >
                    {r.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={r.enabled}
                    onCheckedChange={(checked) =>
                      update.mutate({ ruleId: r.id, enabled: checked })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => deleteAlert.mutate({ ruleId: r.id })}
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
