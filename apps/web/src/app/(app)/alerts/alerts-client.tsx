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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
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
import { cn } from "@foglamp/ui/lib/utils";
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
import { type ComponentType, useRef, useState } from "react";
import { toast } from "sonner";

import { useDelayedLoading } from "@/components/app/data-table";
import { navItem } from "@/components/app/nav";
import {
  EmptyState,
  NoProject,
  PageHeader,
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { formatDuration } from "@/lib/format";
import { trpc } from "@/utils/trpc";
import { AlertsHeader } from "./header";

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
  // Shown next to the threshold label and as its placeholder so users know
  // which unit the number is in (dollars vs ms vs a 0–1 ratio).
  unit: string;
  placeholder: string;
}[] = [
  {
    value: "cost",
    label: "Cost",
    icon: IconCoin,
    unit: "USD",
    placeholder: "5.00",
  },
  {
    value: "latency_p50",
    label: "Latency p50",
    icon: IconClock,
    unit: "ms",
    placeholder: "2000",
  },
  {
    value: "latency_p95",
    label: "Latency p95",
    icon: IconClock,
    unit: "ms",
    placeholder: "2000",
  },
  {
    value: "latency_p99",
    label: "Latency p99",
    icon: IconClock,
    unit: "ms",
    placeholder: "2000",
  },
  {
    value: "ttft_p95",
    label: "TTFT p95",
    icon: IconBolt,
    unit: "ms",
    placeholder: "1000",
  },
  {
    value: "error_rate",
    label: "Error rate",
    icon: IconAlertTriangle,
    unit: "0–1",
    placeholder: "0.05",
  },
  {
    value: "token_usage",
    label: "Token usage",
    icon: IconStack2,
    unit: "tokens",
    placeholder: "100000",
  },
  {
    value: "request_count",
    label: "Request count",
    icon: IconChartDots,
    unit: "requests",
    placeholder: "1000",
  },
  {
    value: "eval_avg_score",
    label: "Avg eval score",
    icon: IconStar,
    unit: "0–1",
    placeholder: "0.8",
  },
  {
    value: "eval_pass_rate",
    label: "Eval pass rate",
    icon: IconCircleCheck,
    unit: "0–1",
    placeholder: "0.9",
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
      onSuccess: (_data, variables) => {
        qc.invalidateQueries({ queryKey: trpc.alerts.list.queryKey() });
        toast.success(variables.enabled ? "Alert resumed" : "Alert paused");
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
        <PageHeader
          title="Alerts"
          icon={navItem("/alerts")?.icon}
          iconClassName={navItem("/alerts")?.iconClassName}
        />
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
    const threshold = Number(form.threshold);
    if (form.threshold.trim() === "" || Number.isNaN(threshold))
      next.threshold = "Enter a number";
    else if (!Number.isFinite(threshold) || threshold < 0)
      next.threshold = "Must be 0 or more";
    else if (METRIC_BY_VALUE[form.metric].unit === "0–1" && threshold > 1)
      next.threshold = "Must be between 0 and 1";
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
      <AlertsHeader
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
              {/* A real form so Enter in any field submits the dialog. */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit();
                }}
                className="flex flex-col gap-4"
              >
                <Field data-invalid={!!errors.name}>
                  <FieldLabel>Name</FieldLabel>
                  <Input
                    placeholder="e.g. High error rate"
                    aria-invalid={!!errors.name}
                    maxLength={200}
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
                    <FieldLabel className="flex items-center gap-1.5">
                      Threshold
                      <span className="text-xs font-normal text-muted-foreground">
                        {METRIC_BY_VALUE[form.metric].unit}
                      </span>
                    </FieldLabel>
                    <Input
                      type="number"
                      min={0}
                      placeholder={METRIC_BY_VALUE[form.metric].placeholder}
                      aria-invalid={!!errors.threshold}
                      value={form.threshold}
                      onChange={(e) => setField("threshold", e.target.value)}
                    />
                    <FieldError>{errors.threshold}</FieldError>
                  </Field>
                </div>
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
                <DialogFooter>
                  <Button type="submit" disabled={create.isPending}>
                    Create alert
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      {alerts.isLoading ? (
        showSkeleton ? (
          <TableSkeleton />
        ) : null
      ) : rows.length === 0 ? (
        <EmptyState
          icon={IconAlertTriangleFilled}
          title="No alerts yet"
          description="Create a rule to get notified when a metric crosses a threshold."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => {
            const metric = METRIC_BY_VALUE[r.metric as Metric];
            const MetricIcon = metric?.icon;
            const status = STATUS_META[r.status] ?? DEFAULT_STATUS_META;
            const StatusIcon = status.icon;
            const firing = r.status === "firing";
            return (
              <Card
                key={r.id}
                className={cn(
                  "transition-opacity",
                  // Rose ring + soft glow when a rule is actively firing.
                  firing &&
                    "shadow-[inset_0_0_0_1px_rgba(244,63,94,0.3),0_2px_10px_-4px_rgba(244,63,94,0.4)]",
                  // Dim paused rules so the active set reads first.
                  !r.enabled && "opacity-60",
                )}
              >
                <CardHeader>
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-xl corner-squircle p-0.5",
                        status.variant === "rose" &&
                          "bg-rose-100 text-rose-500 dark:bg-rose-950",
                        status.variant === "emerald" &&
                          "bg-emerald-100 text-emerald-500 dark:bg-emerald-950",
                        status.variant === "secondary" &&
                          "bg-muted text-muted-foreground",
                      )}
                    >
                      {firing ? (
                        <span className="relative grid place-items-center">
                          <span className="absolute size-4 animate-ping rounded-full bg-rose-500/40" />
                          <StatusIcon className="relative size-4" />
                        </span>
                      ) : (
                        <StatusIcon className="size-4" />
                      )}
                    </span>
                    <CardTitle className="truncate">{r.name}</CardTitle>
                    <Badge variant={status.variant} className="ml-auto shrink-0">
                      {r.status}
                    </Badge>
                  </div>
                  <CardDescription className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">
                      {MetricIcon && <MetricIcon />}
                      {metric?.label ?? r.metric}
                    </Badge>
                    <span className="tabular-nums text-foreground">
                      {COMPARISON_SYMBOLS[r.comparison as Comparison] ??
                        r.comparison}{" "}
                      {r.threshold ?? "—"}
                    </span>
                    <span>·</span>
                    <span className="tabular-nums">
                      {formatDuration(r.windowSeconds * 1000)}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                    <Switch
                      checked={r.enabled}
                      size="sm"
                      // Lock only the rule being toggled.
                      disabled={
                        update.isPending && update.variables?.ruleId === r.id
                      }
                      onCheckedChange={(checked) =>
                        update.mutate({ ruleId: r.id, enabled: checked })
                      }
                    />
                    {r.enabled ? "Enabled" : "Paused"}
                  </label>
                  <Button
                    size="icon-sm"
                    variant="ghost-destructive"
                    className="size-7"
                    onClick={() => setDeleteTarget({ id: r.id, name: r.name })}
                  >
                    <IconTrashFilled />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
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
