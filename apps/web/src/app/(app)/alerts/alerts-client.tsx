"use client";

import {
  ALERT_COMPARISON_SYMBOLS,
  formatAlertMetricValue,
  type AlertComparison,
  type AlertMetric,
  type CreatableAlertMetric,
} from "@foglamp/contracts/alerts";
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
} from "@foglamp/ui/components/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@foglamp/ui/components/field";
import { Input } from "@foglamp/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@foglamp/ui/components/select";
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
  IconAlertTriangle,
  IconAlertTriangleFilled,
  IconPencilFilled,
  IconPlus,
  IconTrashFilled,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  ClearFiltersButton,
  PaginationFooter,
  SearchInput,
  SortableHead,
  ToggleChip,
  Toolbar,
  sortRows,
  useTableSort,
} from "@/components/app/data-table";
import {
  useDelayedLoading,
  useEntranceOnce,
  useSkeletonShown,
} from "@/components/app/hooks";
import { navItem } from "@/components/app/nav";
import {
  EmptyState,
  NoProject,
  PageHeader,
  TableRowsSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { formatDateTime, formatDuration, formatRelative } from "@/lib/format";
import { trpc } from "@/utils/trpc";
import {
  COMPARISON_OPTIONS,
  CREATABLE_METRIC_OPTIONS,
  isEvalMetric,
  isRateMetric,
  METRIC_META,
  thresholdFromInput,
  WINDOW_PRESETS,
} from "./alert-config";
import { AlertDetailsDialog } from "./alert-details-dialog";
import { AlertsHeader } from "./header";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_FORM = {
  metric: "cost" as CreatableAlertMetric,
  evalId: "",
  comparison: "gt" as AlertComparison,
  threshold: "",
  windowSeconds: "3600",
  email: "",
};

export function AlertsClient() {
  const entrance = useEntranceOnce();
  const { projectId } = useProject();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [firingOnly, setFiringOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const { sort, toggle } = useTableSort<"name" | "window">();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [errors, setErrors] = useState<
    Partial<Record<"evalId" | "threshold" | "email", string>>
  >({});
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
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
    refetchInterval: projectId ? 60_000 : false,
  });
  const evals = useQuery({
    ...trpc.evals.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  const showSkeleton = useDelayedLoading(alerts.isLoading);
  // Latch for the entrance fade (see useSkeletonShown): the list only fades in
  // if it never painted a skeleton first.
  const skeletonShown = useSkeletonShown(showSkeleton);

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
  const selectedAlert = selectedRuleId
    ? (rows.find((row) => row.id === selectedRuleId) ?? null)
    : null;

  const q = search.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (!q || r.name.toLowerCase().includes(q)) &&
      (!firingOnly || (r.enabled && r.status === "firing"))
  );
  const sorted = sortRows(filtered, sort, {
    name: (a) => a.name,
    window: (a) => a.windowSeconds,
  });
  // Clamp instead of resetting on filter change so the page state never has
  // to be synchronized with the filters.
  const safePage = Math.min(
    page,
    Math.max(0, Math.ceil(sorted.length / pageSize) - 1)
  );
  const paged = sorted.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize
  );

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
    if (isEvalMetric(form.metric) && !form.evalId)
      next.evalId = "Select an eval";
    const threshold = Number(form.threshold);
    if (form.threshold.trim() === "" || Number.isNaN(threshold))
      next.threshold = "Enter a number";
    else if (!Number.isFinite(threshold) || threshold < 0)
      next.threshold = "Must be 0 or more";
    else if (isRateMetric(form.metric) && threshold > 100)
      next.threshold = "Must be between 0 and 100";
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
      metric: form.metric,
      evalId: isEvalMetric(form.metric) ? form.evalId : undefined,
      comparison: form.comparison,
      threshold: thresholdFromInput(form.metric, form.threshold),
      windowSeconds: Number(form.windowSeconds),
      channels: [{ type: "email", to: form.email.trim() }],
    });
  };

  // With no alerts at all, the create button lives inside the empty state
  // (more discoverable there) instead of the header.
  const noAlerts = !alerts.isLoading && rows.length === 0;

  return (
    <>
      {/* Wrapped here (not inside AlertsHeader) so the copy rendered by
          loading.tsx stays unanimated — only the page's own header fades. */}
      <div className={cn(entrance && "page-fade-in")}>
        <AlertsHeader />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New alert</DialogTitle>
            <DialogDescription>
              Create a threshold rule to get notified when a metric crosses a
              value.
            </DialogDescription>
          </DialogHeader>
          {/* A real form so Enter in any field submits the dialog. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="flex flex-col gap-6"
          >
            <FieldGroup className="gap-4">
              <div className="flex items-end gap-3">
                <Field className="w-1/2">
                  <FieldLabel htmlFor="new-alert-metric">Metric</FieldLabel>
                  <Select
                    value={form.metric}
                    onValueChange={(v) =>
                      setField("metric", v as CreatableAlertMetric)
                    }
                  >
                    <SelectTrigger id="new-alert-metric" className="w-full">
                      <SelectValue>
                        {(value) => {
                          const m = METRIC_META[value as AlertMetric];
                          if (!m) return null;
                          const MetricIcon = m.icon;
                          return (
                            <span className="flex items-center gap-1.5">
                              <MetricIcon className="text-muted-foreground" />
                              {m.label}
                            </span>
                          );
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {CREATABLE_METRIC_OPTIONS.map((metric) => {
                          const MetricIcon = metric.icon;
                          return (
                            <SelectItem
                              key={metric.value}
                              value={metric.value}
                              label={metric.label}
                            >
                              <MetricIcon />
                              {metric.label}
                            </SelectItem>
                          );
                        })}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field className="w-fit">
                  <FieldLabel
                    htmlFor="new-alert-comparison"
                    className="sr-only"
                  >
                    Comparison
                  </FieldLabel>
                  <Select
                    value={form.comparison}
                    onValueChange={(v) =>
                      setField("comparison", v as AlertComparison)
                    }
                  >
                    <SelectTrigger id="new-alert-comparison" className="h-9">
                      <SelectValue>
                        {(value) => (
                          <span className="tabular-nums">
                            {ALERT_COMPARISON_SYMBOLS[value as AlertComparison]}
                          </span>
                        )}
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
                <Field className="w-1/2" data-invalid={!!errors.threshold}>
                  <FieldLabel htmlFor="new-alert-threshold">
                    Threshold{" "}
                    <span className="text-muted-foreground/50">
                      {METRIC_META[form.metric].unit}
                    </span>
                  </FieldLabel>
                  <Input
                    id="new-alert-threshold"
                    name="threshold"
                    type="number"
                    min={0}
                    max={isRateMetric(form.metric) ? 100 : undefined}
                    step="any"
                    autoComplete="off"
                    placeholder={METRIC_META[form.metric].placeholder}
                    aria-invalid={!!errors.threshold}
                    value={form.threshold}
                    onChange={(e) => setField("threshold", e.target.value)}
                  />
                  <FieldError>{errors.threshold}</FieldError>
                </Field>
              </div>
              {isEvalMetric(form.metric) && (
                <Field data-invalid={!!errors.evalId}>
                  <FieldLabel htmlFor="new-alert-eval">Eval</FieldLabel>
                  <Select
                    value={form.evalId}
                    onValueChange={(v) => setField("evalId", v as string)}
                  >
                    <SelectTrigger id="new-alert-eval" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {(evals.data ?? []).map((ev) => (
                          <SelectItem key={ev.id} value={ev.id}>
                            {ev.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError>{errors.evalId}</FieldError>
                </Field>
              )}
              <div className="flex items-start gap-3">
                <Field className="w-40">
                  <FieldLabel htmlFor="new-alert-window">
                    Over the last
                  </FieldLabel>
                  <Select
                    value={form.windowSeconds}
                    onValueChange={(v) =>
                      setField("windowSeconds", v as string)
                    }
                  >
                    <SelectTrigger id="new-alert-window" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {WINDOW_PRESETS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field className="flex-1" data-invalid={!!errors.email}>
                  <FieldLabel htmlFor="new-alert-email">Email</FieldLabel>
                  <Input
                    id="new-alert-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    spellCheck={false}
                    placeholder="you@example.com"
                    aria-invalid={!!errors.email}
                    value={form.email}
                    onChange={(e) => setField("email", e.target.value)}
                  />
                  <FieldError>{errors.email}</FieldError>
                </Field>
              </div>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                Create alert
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {noAlerts ? (
        <div className="mt-2 px-8">
          <EmptyState
            icon={IconAlertTriangleFilled}
            title="No alerts yet"
            description="Create a rule to get notified when a metric crosses a threshold."
            className={cn(entrance && !skeletonShown && "page-fade-in")}
          >
            <Button className="mt-2" onClick={() => setOpen(true)}>
              <IconPlus strokeWidth={2.5} />
              New alert
            </Button>
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-4 mt-1">
          <Toolbar>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search alerts…"
            />
            <ToggleChip
              active={firingOnly}
              onClick={() => setFiringOnly((v) => !v)}
            >
              <IconAlertTriangle className="size-3.5" />
              Firing only
            </ToggleChip>
            <ClearFiltersButton
              show={!!(search || firingOnly)}
              onClick={() => {
                setSearch("");
                setFiringOnly(false);
              }}
            />
            <div className="ml-auto flex items-center gap-3">
              <Button onClick={() => setOpen(true)}>
                <IconPlus />
                New alert
              </Button>
            </div>
          </Toolbar>

          {!alerts.isLoading && sorted.length === 0 ? (
            <div className="mt-2 px-8">
              <EmptyState
                icon={IconAlertTriangleFilled}
                title="No matching alerts"
                description="Try a different search or clearing filters."
              />
            </div>
          ) : (
            <div
              className={cn(
                "flex flex-col -mt-2",
                entrance && !skeletonShown && "page-fade-in"
              )}
            >
              <Table className="table-fixed min-w-5xl" stickyHeader>
                <TableHeader>
                  <TableRow>
                    <SortableHead
                      sortKey="name"
                      sort={sort}
                      onSort={toggle}
                      className="w-92"
                    >
                      Alert
                    </SortableHead>
                    <TableHead className="w-48">Condition</TableHead>
                    <SortableHead
                      sortKey="window"
                      sort={sort}
                      onSort={toggle}
                      align="right"
                      className="w-32 text-right"
                    >
                      Over the last
                    </SortableHead>
                    <TableHead className="w-28 text-right">Current</TableHead>
                    <TableHead className="w-28 text-right">
                      Last fired
                    </TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.isLoading ? (
                    showSkeleton ? (
                      <TableRowsSkeleton cols={SKELETON_COLS} />
                    ) : null
                  ) : (
                    paged.map((r) => {
                      const metric = METRIC_META[r.metric];
                      const MetricIcon = metric.icon;
                      const firing = r.enabled && r.status === "firing";
                      return (
                        <TableRow
                          key={r.id}
                          className={cn(
                            // Dim paused rules so the active set reads first.
                            !r.enabled && "opacity-60"
                          )}
                        >
                          <TableCell className="h-12">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate font-medium">
                                {r.name}
                              </span>
                              {firing && (
                                <span
                                  title="Firing"
                                  aria-label="Firing"
                                  className="flex shrink-0 items-center text-destructive"
                                >
                                  <IconAlertTriangle className="size-3.5 fill-current/20" />
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex min-w-0 items-center gap-2">
                              <Badge
                                variant={metric.badgeVariant}
                                className="min-w-0 max-w-full"
                              >
                                <MetricIcon />
                                <span className="min-w-0 truncate">
                                  {metric.label}
                                </span>
                              </Badge>
                              <span className="shrink-0 tabular-nums">
                                <span className="text-muted-foreground mr-1.5 ml-1">
                                  {ALERT_COMPARISON_SYMBOLS[r.comparison]}{" "}
                                </span>
                                {formatAlertMetricValue(r.metric, r.threshold)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatDuration(r.windowSeconds * 1000)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.lastValue === null
                              ? "—"
                              : formatAlertMetricValue(r.metric, r.lastValue)}
                          </TableCell>
                          <TableCell
                            align="right"
                            className="text-muted-foreground"
                            title={formatDateTime(r.lastFiredAt)}
                          >
                            {r.lastFiredAt
                              ? formatRelative(r.lastFiredAt)
                              : "Never"}
                          </TableCell>
                          <TableCell align="center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="size-7"
                                aria-label={`Edit ${r.name}`}
                                title="Edit alert"
                                onClick={() => {
                                  setSelectedRuleId(r.id);
                                  setDetailsOpen(true);
                                }}
                              >
                                <IconPencilFilled />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost-destructive"
                                className="size-7"
                                aria-label={`Delete ${r.name}`}
                                title="Delete alert"
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

              {!alerts.isLoading && (
                <PaginationFooter
                  page={safePage}
                  pageSize={pageSize}
                  total={sorted.length}
                  shown={paged.length}
                  noun={["alert", "alerts"]}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
              )}
            </div>
          )}
        </div>
      )}
      {selectedAlert && (
        <AlertDetailsDialog
          key={selectedAlert.id}
          alert={selectedAlert}
          evals={evals.data ?? []}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          onOpenChangeComplete={(nextOpen) => {
            if (!nextOpen) setSelectedRuleId(null);
          }}
        />
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

const SKELETON_COLS = [
  { w: "w-32" },
  { icon: true, w: "w-32" },
  { align: "right", w: "w-14" },
  { align: "right", w: "w-14" },
  { align: "right", w: "w-16" },
  {},
] as const;
