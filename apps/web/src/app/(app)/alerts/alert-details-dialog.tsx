"use client";

import {
  formatAlertMetricValue,
  generateAlertName,
  type AlertComparison,
  type AlertMetric,
} from "@foglamp/contracts/alerts";
import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@foglamp/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@foglamp/ui/components/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@foglamp/ui/components/field";
import { Input } from "@foglamp/ui/components/input";
import { ScrollArea } from "@foglamp/ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@foglamp/ui/components/select";
import { Separator } from "@foglamp/ui/components/separator";
import { Spinner } from "@foglamp/ui/components/spinner";
import { Switch } from "@foglamp/ui/components/switch";
import { IconHistory } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { formatDateTime, formatRelative } from "@/lib/format";
import { type RouterOutputs, trpc } from "@/utils/trpc";
import {
  COMPARISON_OPTIONS,
  CREATABLE_METRIC_OPTIONS,
  isCreatableMetric,
  isEvalMetric,
  isRateMetric,
  METRIC_META,
  thresholdFromInput,
  thresholdToInput,
  WINDOW_PRESETS,
} from "./alert-config";

type AlertRow = RouterOutputs["alerts"]["list"][number];
type EvalRow = RouterOutputs["evals"]["list"][number];

type Draft = {
  name: string;
  automaticName: boolean;
  metric: AlertMetric;
  evalId: string;
  comparison: AlertComparison;
  threshold: string;
  windowSeconds: string;
  email: string;
  enabled: boolean;
};

type Errors = Partial<
  Record<"name" | "evalId" | "threshold" | "email", string>
>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function draftFor(alert: AlertRow): Draft {
  const email =
    alert.channels.find((channel) => channel.type === "email")?.to ?? "";
  return {
    name: alert.name,
    automaticName: alert.automaticName,
    metric: alert.metric,
    evalId: alert.evalId ?? "",
    comparison: alert.comparison,
    threshold: thresholdToInput(alert.metric, alert.threshold ?? 0),
    windowSeconds: String(alert.windowSeconds),
    email,
    enabled: alert.enabled,
  };
}

function autoNameFor(draft: Draft): string | null {
  const threshold = thresholdFromInput(draft.metric, draft.threshold);
  if (!Number.isFinite(threshold) || threshold < 0) return null;
  return generateAlertName({
    metric: draft.metric,
    comparison: draft.comparison,
    threshold,
  });
}

export function AlertDetailsDialog({
  alert,
  evals,
  open,
  onOpenChange,
  onOpenChangeComplete,
}: {
  alert: AlertRow;
  evals: EvalRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChangeComplete: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => draftFor(alert));
  const [errors, setErrors] = useState<Errors>({});

  const history = useQuery({
    ...trpc.alerts.history.queryOptions({ ruleId: alert.id, limit: 20 }),
    enabled: open,
    refetchInterval: open ? 60_000 : false,
  });

  const update = useMutation(
    trpc.alerts.update.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.alerts.list.queryKey() });
        qc.invalidateQueries({ queryKey: trpc.alerts.history.queryKey() });
        toast.success("Alert updated");
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const patchRule = (
    patch: Partial<Pick<Draft, "metric" | "comparison" | "threshold">>,
  ) => {
    setDraft((current) => {
      const next = { ...current, ...patch };
      if (next.automaticName) {
        const generated = autoNameFor(next);
        if (generated) next.name = generated;
      }
      return next;
    });
  };

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key as keyof Errors];
      return next;
    });
  };

  const validate = (): Errors => {
    const next: Errors = {};
    if (!draft.name.trim()) next.name = "Enter an alert name";
    if (isEvalMetric(draft.metric) && !draft.evalId)
      next.evalId = "Select an eval";
    const threshold = Number(draft.threshold);
    if (!draft.threshold.trim() || !Number.isFinite(threshold))
      next.threshold = "Enter a number";
    else if (threshold < 0) next.threshold = "Must be 0 or more";
    else if (isRateMetric(draft.metric) && threshold > 100)
      next.threshold = "Must be between 0 and 100";
    const email = draft.email.trim();
    if (!email) next.email = "Email is required";
    else if (!EMAIL_RE.test(email)) next.email = "Enter a valid email address";
    return next;
  };

  const save = () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const metricChanged = draft.metric !== alert.metric;
    if (metricChanged && !isCreatableMetric(draft.metric)) return;

    update.mutate({
      ruleId: alert.id,
      ...(metricChanged && isCreatableMetric(draft.metric)
        ? { metric: draft.metric }
        : {}),
      evalId: isEvalMetric(draft.metric) ? draft.evalId : null,
      comparison: draft.comparison,
      threshold: thresholdFromInput(draft.metric, draft.threshold),
      windowSeconds: Number(draft.windowSeconds),
      enabled: draft.enabled,
      channels: [{ type: "email", to: draft.email.trim() }],
      ...(draft.automaticName
        ? { automaticName: true }
        : draft.name.trim() !== alert.name
          ? { name: draft.name.trim() }
          : { automaticName: false }),
    });
  };

  const metricOptions = isCreatableMetric(draft.metric)
    ? CREATABLE_METRIC_OPTIONS
    : [
        {
          value: draft.metric,
          ...METRIC_META[draft.metric],
        },
        ...CREATABLE_METRIC_OPTIONS,
      ];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="p-6">
          <DialogTitle>Edit alert</DialogTitle>
          <DialogDescription>
            Change the rule and review its recent activity.
          </DialogDescription>
        </DialogHeader>
        <Separator className="dark:bg-border/40" />

        <ScrollArea className="h-[min(40rem,calc(100vh-16rem))]">
          <form
            id="alert-details-form"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
            className="flex flex-col gap-6 py-6"
          >
            <dl className="flex items-center gap-6 px-6">
              <div className="flex flex-1 flex-col gap-1">
                <dt className="text-sm font-medium">Current value</dt>
                <dd className="tabular-nums text-muted-foreground">
                  {alert.lastValue === null
                    ? "Waiting for first check"
                    : formatAlertMetricValue(alert.metric, alert.lastValue)}
                </dd>
              </div>
              <Separator className="dark:bg-border/40" orientation="vertical" />
              <div className="flex flex-1 flex-col gap-1">
                <dt className="text-sm font-medium">Last checked</dt>
                <dd
                  className="text-muted-foreground"
                  title={formatDateTime(alert.lastEvaluatedAt)}
                >
                  {alert.lastEvaluatedAt
                    ? formatRelative(alert.lastEvaluatedAt)
                    : "Not checked yet"}
                </dd>
              </div>

              <Separator className="dark:bg-border/40" orientation="vertical" />

              <div className="flex flex-1 flex-col gap-2.5">
                <dt className="text-sm font-medium">
                  <label htmlFor="alert-enabled">Active</label>
                </dt>
                <dd className="flex items-center gap-2 text-muted-foreground">
                  <Switch
                    id="alert-enabled"
                    size="sm"
                    checked={draft.enabled}
                    onCheckedChange={(checked) => setField("enabled", checked)}
                  />
                </dd>
              </div>
            </dl>

            <Separator className="dark:bg-border/40" />

            <FieldGroup className="gap-5 px-6">
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="alert-name">Name</FieldLabel>
                <Input
                  id="alert-name"
                  name="name"
                  autoComplete="off"
                  maxLength={200}
                  aria-invalid={!!errors.name}
                  value={draft.name}
                  onChange={(event) => {
                    setField("name", event.target.value);
                    setDraft((current) => ({
                      ...current,
                      automaticName: false,
                    }));
                  }}
                />
                <FieldError>{errors.name}</FieldError>
                {!draft.automaticName && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    className="w-fit"
                    onClick={() => {
                      const generated = autoNameFor(draft);
                      if (generated)
                        setDraft((current) => ({
                          ...current,
                          name: generated,
                          automaticName: true,
                        }));
                    }}
                  >
                    Use automatic name
                  </Button>
                )}
              </Field>

              <div className="grid grid-cols-[1fr_auto_16.5rem] items-end gap-3">
                <Field>
                  <FieldLabel htmlFor="alert-metric">Metric</FieldLabel>
                  <Select
                    value={draft.metric}
                    onValueChange={(value) =>
                      patchRule({ metric: value as AlertMetric })
                    }
                  >
                    <SelectTrigger id="alert-metric" className="w-full">
                      <SelectValue>
                        {(value) => {
                          const metric = METRIC_META[value as AlertMetric];
                          if (!metric) return null;
                          const MetricIcon = metric.icon;
                          return (
                            <span className="flex items-center gap-1.5">
                              <MetricIcon className="text-muted-foreground" />
                              {metric.label}
                            </span>
                          );
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {metricOptions.map((metric) => {
                          const MetricIcon = metric.icon;
                          return (
                            <SelectItem
                              key={metric.value}
                              value={metric.value}
                              label={metric.label}
                            >
                              <MetricIcon />
                              {metric.label}
                              {!isCreatableMetric(metric.value) && (
                                <Badge variant="secondary">Legacy</Badge>
                              )}
                            </SelectItem>
                          );
                        })}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="alert-comparison" className="sr-only">
                    Comparison
                  </FieldLabel>
                  <Select
                    value={draft.comparison}
                    onValueChange={(value) =>
                      patchRule({ comparison: value as AlertComparison })
                    }
                  >
                    <SelectTrigger id="alert-comparison">
                      <SelectValue>
                        {(value) =>
                          COMPARISON_OPTIONS.find(
                            (item) => item.value === value,
                          )?.symbol
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="w-56">
                      <SelectGroup>
                        {COMPARISON_OPTIONS.map((comparison) => (
                          <SelectItem
                            key={comparison.value}
                            value={comparison.value}
                            label={comparison.symbol}
                          >
                            <span className="w-4 tabular-nums">
                              {comparison.symbol}
                            </span>
                            {comparison.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <Field data-invalid={!!errors.threshold}>
                  <FieldLabel htmlFor="alert-threshold">
                    Threshold {METRIC_META[draft.metric].unit}
                  </FieldLabel>
                  <Input
                    id="alert-threshold"
                    name="threshold"
                    type="number"
                    min={0}
                    max={isRateMetric(draft.metric) ? 100 : undefined}
                    step="any"
                    autoComplete="off"
                    aria-invalid={!!errors.threshold}
                    value={draft.threshold}
                    onChange={(event) =>
                      patchRule({ threshold: event.target.value })
                    }
                  />
                  <FieldError>{errors.threshold}</FieldError>
                </Field>
              </div>

              {isEvalMetric(draft.metric) && (
                <Field data-invalid={!!errors.evalId}>
                  <FieldLabel htmlFor="alert-eval">Eval</FieldLabel>
                  <Select
                    value={draft.evalId}
                    onValueChange={(value) =>
                      setField("evalId", value as string)
                    }
                  >
                    <SelectTrigger id="alert-eval" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {evals.map((evaluation) => (
                          <SelectItem key={evaluation.id} value={evaluation.id}>
                            {evaluation.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError>{errors.evalId}</FieldError>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="alert-window">Over the last</FieldLabel>
                  <Select
                    value={draft.windowSeconds}
                    onValueChange={(value) =>
                      setField("windowSeconds", value as string)
                    }
                  >
                    <SelectTrigger id="alert-window" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {WINDOW_PRESETS.map((preset) => (
                          <SelectItem key={preset.value} value={preset.value}>
                            {preset.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field data-invalid={!!errors.email}>
                  <FieldLabel htmlFor="alert-email">Email</FieldLabel>
                  <Input
                    id="alert-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    spellCheck={false}
                    aria-invalid={!!errors.email}
                    value={draft.email}
                    onChange={(event) => setField("email", event.target.value)}
                  />
                  <FieldError>{errors.email}</FieldError>
                </Field>
              </div>
            </FieldGroup>
          </form>

          <Separator className="dark:bg-border/40" />
          <section
            className="flex flex-col gap-4 p-6"
            aria-labelledby="history-title"
          >
            <h3 id="history-title" className="font-medium">
              Recent activity
            </h3>
            {history.isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : (history.data ?? []).length === 0 ? (
              <Empty className="p-8 py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconHistory />
                  </EmptyMedia>
                  <EmptyTitle>No activity yet</EmptyTitle>
                  <EmptyDescription>
                    Fired and resolved events will appear here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col gap-3 text-sm">
                {history.data?.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge
                        variant={event.type === "fired" ? "rose" : "emerald"}
                      >
                        {event.type === "fired" ? "Fired" : "Resolved"}
                      </Badge>
                      <span className="truncate text-muted-foreground">
                        {formatAlertMetricValue(alert.metric, event.value)} at a{" "}
                        {formatAlertMetricValue(alert.metric, event.threshold)}{" "}
                        threshold
                      </span>
                    </div>
                    <span
                      className="shrink-0 text-xs text-muted-foreground"
                      title={formatDateTime(event.createdAt)}
                    >
                      {formatRelative(event.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </ScrollArea>

        <Separator />
        <DialogFooter className="p-6">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="alert-details-form"
            disabled={update.isPending}
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
