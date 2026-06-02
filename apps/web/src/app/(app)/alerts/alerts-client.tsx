"use client";

import {
  IconAlertTriangle,
  IconAlertTriangleFilled,
  IconBolt,
  IconChartDots,
  IconCircleCheck,
  IconCircleCheckFilled,
  IconCircleDotFilled,
  IconClock,
  IconCoin,
  IconPlus,
  IconStack2,
  IconStar,
  IconTrash,
  IconTrashFilled,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@foglamp/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@foglamp/ui/components/field";
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
import { type ComponentType, useRef, useState } from "react";
import { toast } from "sonner";

import { useDelayedLoading } from "@/components/app/data-table";
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

const METRICS: {
  value: Metric;
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { value: "cost", label: "Cost", icon: IconCoin },
  { value: "latency_p50", label: "Latency p50", icon: IconClock },
  { value: "latency_p95", label: "Latency p95", icon: IconClock },
  { value: "latency_p99", label: "Latency p99", icon: IconClock },
  { value: "ttft_p95", label: "TTFT p95", icon: IconBolt },
  { value: "error_rate", label: "Error rate", icon: IconAlertTriangle },
  { value: "token_usage", label: "Token usage", icon: IconStack2 },
  { value: "request_count", label: "Request count", icon: IconChartDots },
  { value: "eval_avg_score", label: "Avg eval score", icon: IconStar },
  {
    value: "eval_pass_rate",
    label: "Eval pass rate",
    icon: IconCircleCheck,
  },
];

const METRIC_BY_VALUE = Object.fromEntries(
  METRICS.map((m) => [m.value, m])
) as Record<Metric, (typeof METRICS)[number]>;

const isEvalMetric = (m: Metric) =>
  m === "eval_avg_score" || m === "eval_pass_rate";

const COMPARISON_SYMBOLS: Record<Comparison, string> = {
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};

const COMPARISONS: { value: Comparison; label: string }[] = [
  { value: "gt", label: "greater than" },
  { value: "gte", label: "greater than or equal" },
  { value: "lt", label: "less than" },
  { value: "lte", label: "less than or equal" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS_META: Record<
  string,
  {
    variant: "rose" | "emerald" | "secondary";
    icon: ComponentType<{ className?: string }>;
  }
> = {
  firing: { variant: "rose", icon: IconAlertTriangleFilled },
  ok: { variant: "emerald", icon: IconCircleCheckFilled },
};

const DEFAULT_STATUS_META = {
  variant: "secondary" as const,
  icon: IconCircleDotFilled,
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
  const [errors, setErrors] = useState<
    Partial<Record<"name" | "evalId" | "threshold" | "email", string>>
  >({});
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // Hold onto the last target so the name doesn't blank out during the
  // dialog's close animation (deleteTarget is cleared the instant it closes).
  const lastDeleteTarget = useRef(deleteTarget);
  if (deleteTarget) lastDeleteTarget.current = deleteTarget;

  const alerts = useQuery({
    ...trpc.alerts.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  const evals = useQuery({
    ...trpc.evals.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  const showSkeleton = useDelayedLoading(alerts.isLoading);

  const create = useMutation(
    trpc.alerts.create.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.alerts.list.queryKey() });
        setOpen(false);
        setForm(DEFAULT_FORM);
        setErrors({});
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
        setDeleteTarget(null);
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

  // Clear a field's error as soon as the user edits it, so stale messages
  // don't linger while they're fixing the problem.
  const setField = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) =>
    setForm((f) => {
      setErrors((e) => {
        if (!(key in e)) return e;
        const next = { ...e };
        delete next[key as keyof typeof e];
        return next;
      });
      return { ...f, [key]: value };
    });

  const validate = () => {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = "Name is required";
    if (isEvalMetric(form.metric) && !form.evalId)
      next.evalId = "Select an eval";
    if (form.threshold.trim() === "" || Number.isNaN(Number(form.threshold)))
      next.threshold = "Enter a number";
    const email = form.email.trim();
    if (!email) next.email = "Email is required";
    else if (!EMAIL_RE.test(email)) next.email = "Enter a valid email address";
    return next;
  };

  const handleSubmit = () => {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
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
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>New alert</DialogTitle>
                <DialogDescription>
                  Create a threshold rule to get notified when a metric crosses
                  a value.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <Field data-invalid={!!errors.name}>
                  <FieldLabel>Name</FieldLabel>
                  <Input
                    placeholder="e.g. High error rate"
                    aria-invalid={!!errors.name}
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                  />
                  <FieldError>{errors.name}</FieldError>
                </Field>
                <div className="flex items-end gap-3">
                  <Field className="flex-1">
                    <FieldLabel>Metric</FieldLabel>
                    <Select
                      value={form.metric}
                      onValueChange={(v) => setField("metric", v as Metric)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(value) => {
                            const m = METRIC_BY_VALUE[value as Metric];
                            if (!m) return null;
                            const Logo = m.icon;
                            return (
                              <span className="flex items-center gap-1.5">
                                <Logo className="text-muted-foreground" />
                                {m.label}
                              </span>
                            );
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {METRICS.map((m) => {
                          const Logo = m.icon;
                          return (
                            <SelectItem
                              key={m.value}
                              value={m.value}
                              label={m.label}
                            >
                              <Logo className="text-muted-foreground mt-0.5" />
                              {m.label}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field className="w-fit">
                    <FieldLabel className="sr-only">Comparison</FieldLabel>
                    <Select
                      value={form.comparison}
                      onValueChange={(v) =>
                        setField("comparison", v as Comparison)
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue>
                          {(value) => (
                            <span className="tabular-nums">
                              {COMPARISON_SYMBOLS[value as Comparison]}
                            </span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="w-56">
                        {COMPARISONS.map((c) => (
                          <SelectItem
                            key={c.value}
                            value={c.value}
                            label={COMPARISON_SYMBOLS[c.value]}
                          >
                            <span className="w-4 tabular-nums">
                              {COMPARISON_SYMBOLS[c.value]}
                            </span>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field className="w-28" data-invalid={!!errors.threshold}>
                    <FieldLabel>Threshold</FieldLabel>
                    <Input
                      type="number"
                      placeholder="0"
                      aria-invalid={!!errors.threshold}
                      value={form.threshold}
                      onChange={(e) => setField("threshold", e.target.value)}
                    />
                  </Field>
                </div>
                {errors.threshold && (
                  <FieldError>{errors.threshold}</FieldError>
                )}
                {isEvalMetric(form.metric) && (
                  <Field data-invalid={!!errors.evalId}>
                    <FieldLabel>Eval</FieldLabel>
                    <Select
                      value={form.evalId}
                      onValueChange={(v) => setField("evalId", v as string)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select an eval…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(evals.data ?? []).map((ev) => (
                          <SelectItem key={ev.id} value={ev.id}>
                            {ev.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError>{errors.evalId}</FieldError>
                  </Field>
                )}
                <div className="flex items-start gap-3">
                  <Field className="w-40">
                    <FieldLabel>Window</FieldLabel>
                    <Select
                      value={form.windowSeconds}
                      onValueChange={(v) =>
                        setField("windowSeconds", v as string)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WINDOW_PRESETS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field className="flex-1" data-invalid={!!errors.email}>
                    <FieldLabel>Email channel</FieldLabel>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      aria-invalid={!!errors.email}
                      value={form.email}
                      onChange={(e) => setField("email", e.target.value)}
                    />
                    <FieldError>{errors.email}</FieldError>
                  </Field>
                </div>
              </div>
              <DialogFooter>
                <Button disabled={create.isPending} onClick={handleSubmit}>
                  Create alert
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      {alerts.isLoading ? (
        showSkeleton ? <TableSkeleton /> : null
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
              <TableHead align="right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const metric = METRIC_BY_VALUE[r.metric as Metric];
              const MetricIcon = metric?.icon;
              const status = STATUS_META[r.status] ?? DEFAULT_STATUS_META;
              const StatusIcon = status.icon;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {MetricIcon && <MetricIcon />}
                      {metric?.label ?? r.metric}
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
                    <Badge variant={status.variant}>
                      <StatusIcon />
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
                  <TableCell align="center">
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
              This permanently deletes the alert rule and its history. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteAlert.isPending}
              onClick={() =>
                deleteTarget && deleteAlert.mutate({ ruleId: deleteTarget.id })
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
