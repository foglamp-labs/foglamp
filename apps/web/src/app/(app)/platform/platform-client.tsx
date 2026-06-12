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
import { Button } from "@foglamp/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { Input } from "@foglamp/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@foglamp/ui/components/native-select";
import {
  IconBuilding,
  IconCoinFilled,
  IconCreditCard,
  IconFolderFilled,
  IconStack2Filled,
  IconUserFilled,
  IconUserPlus,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, StatCard } from "@/components/app/page-parts";
import { formatCount } from "@/lib/format";
import { trpc } from "@/utils/trpc";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = "B";
  for (const u of units) {
    value /= 1024;
    unit = u;
    if (value < 1024) break;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${unit}`;
}

function formatMrr(cents: number | null): string {
  if (cents === null) return "—";
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: dollars % 1 === 0 ? 0 : 2,
  })}/mo`;
}

// Comp an org to enterprise limits for a chosen window. Grants are enforced at
// plan-resolution time (getOrgPlan), so revocations/expiries apply within ~60s
// (the ingest plan cache TTL).
function AccessGrantsCard() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [days, setDays] = useState("30");
  // Target kept set while the dialog animates closed so its name doesn't
  // blank out mid-animation; `revokeOpen` alone drives visibility.
  const [revokeTarget, setRevokeTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const search = useQuery({
    ...trpc.platform.searchOrgs.queryOptions({ query }),
    enabled: query.trim().length > 0,
  });
  const grants = useQuery(trpc.platform.accessGrants.queryOptions());

  const refresh = () => {
    void qc.invalidateQueries({
      queryKey: trpc.platform.accessGrants.queryKey(),
    });
    void qc.invalidateQueries({
      queryKey: trpc.platform.searchOrgs.queryKey(),
    });
  };

  const grant = useMutation(
    trpc.platform.grantAccess.mutationOptions({
      onSuccess: () => {
        toast.success("Unlimited access granted.");
        refresh();
      },
      onError: (e) => toast.error(e.message),
    })
  );
  const revoke = useMutation(
    trpc.platform.revokeAccess.mutationOptions({
      onSuccess: () => {
        toast.success("Access grant revoked.");
        setRevokeOpen(false);
        refresh();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const grantLabel = (expiresAt: Date | string | null) => {
    if (!expiresAt) return "no expiry";
    const d = new Date(expiresAt);
    return d.getTime() < Date.now()
      ? `expired ${d.toLocaleDateString()}`
      : `until ${d.toLocaleDateString()}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Access grants</CardTitle>
        <CardDescription>
          Comp an org to enterprise limits (unlimited spans, 90-day retention)
          for a period. Takes effect within a minute.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Input
            placeholder="Search orgs by name, slug, or owner email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <NativeSelect
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-32 shrink-0"
          >
            <NativeSelectOption value="7">7 days</NativeSelectOption>
            <NativeSelectOption value="30">30 days</NativeSelectOption>
            <NativeSelectOption value="90">90 days</NativeSelectOption>
            <NativeSelectOption value="365">1 year</NativeSelectOption>
            <NativeSelectOption value="forever">No expiry</NativeSelectOption>
          </NativeSelect>
        </div>

        {query.trim().length > 0 && (
          <div className="flex flex-col">
            {(search.data ?? []).map((org) => (
              <div
                key={org.id}
                className="flex items-center justify-between border-t border-border/50 py-1.5 text-sm"
              >
                <div className="min-w-0">
                  <span className="truncate">{org.name}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {org.ownerEmail ?? "no owner"}
                    {org.planOverride
                      ? ` · comped (${grantLabel(org.overrideExpiresAt)})`
                      : ""}
                  </span>
                </div>
                <Button
                  size="sm"
                  disabled={grant.isPending}
                  onClick={() =>
                    grant.mutate({
                      orgId: org.id,
                      days: days === "forever" ? null : Number(days),
                    })
                  }
                >
                  Grant
                </Button>
              </div>
            ))}
            {search.isSuccess && search.data.length === 0 && (
              <p className="py-2 text-sm text-muted-foreground">
                No orgs match.
              </p>
            )}
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Active grants
          </p>
          {(grants.data ?? []).map((org) => (
            <div
              key={org.id}
              className="flex items-center justify-between border-t border-border/50 py-1.5 text-sm"
            >
              <div className="min-w-0">
                <span className="truncate">{org.name}</span>{" "}
                <span className="text-xs text-muted-foreground">
                  {org.ownerEmail ?? "no owner"} ·{" "}
                  {grantLabel(org.overrideExpiresAt)}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={revoke.isPending}
                onClick={() => {
                  setRevokeTarget({ id: org.id, name: org.name });
                  setRevokeOpen(true);
                }}
              >
                Revoke
              </Button>
            </div>
          ))}
          {grants.isSuccess && grants.data.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              No orgs are comped right now.
            </p>
          )}
        </div>
      </CardContent>

      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Revoke access for {revokeTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The org drops back to its paid or free plan limits within a
              minute.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revoke.isPending}
              onClick={() =>
                revokeTarget && revoke.mutate({ orgId: revokeTarget.id })
              }
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// Operator-only platform overview (gated server-side by PLATFORM_ADMIN_EMAILS;
// the stats query 403s for anyone else, so this page renders nothing useful
// even if reached directly).
export function PlatformClient() {
  const stats = useQuery({
    ...trpc.platform.stats.queryOptions(),
    refetchInterval: 60_000,
  });

  if (stats.error) {
    return (
      <>
        <PageHeader title="Platform" />
        <p className="text-sm text-muted-foreground">
          You don&apos;t have access to platform stats.
        </p>
      </>
    );
  }

  const d = stats.data;
  if (!d) {
    return (
      <>
        <PageHeader title="Platform" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </>
    );
  }

  const funnelSteps = [
    {
      label: "Signed up",
      value: d.funnel.users,
      icon: IconUserFilled,
      iconClassName: "text-sky-500",
    },
    {
      label: "Org with a project",
      value: d.funnel.orgsWithProjects,
      icon: IconFolderFilled,
      iconClassName: "text-emerald-500",
    },
    {
      label: "Sent spans (30d)",
      value: d.funnel.orgsActive30d,
      icon: IconStack2Filled,
      iconClassName: "text-fuchsia-500",
    },
    {
      label: "Paying",
      value: d.funnel.paidOrgs,
      icon: IconCoinFilled,
      iconClassName: "text-amber-500",
    },
  ];
  const funnelMax = Math.max(1, ...funnelSteps.map((s) => s.value));

  return (
    <>
      <PageHeader
        title="Platform"
        description="Cross-org numbers for the hosted deployment. Refreshes every minute."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        <StatCard
          label="MRR"
          size="sm"
          value={formatMrr(d.mrrCents)}
          icon={IconCoinFilled}
          iconClassName="text-amber-500"
        />
        <StatCard
          label="Users"
          size="sm"
          value={formatCount(d.totals.users)}
          icon={IconUserFilled}
          iconClassName="text-sky-500"
        />
        <StatCard
          label="New users (7d)"
          size="sm"
          value={formatCount(d.totals.usersLast7d)}
          icon={IconUserPlus}
          iconClassName="text-emerald-500"
        />
        <StatCard
          label="Organizations"
          size="sm"
          value={formatCount(d.totals.orgs)}
          icon={IconBuilding}
          iconClassName="text-violet-500"
        />
        <StatCard
          label="Projects"
          size="sm"
          value={formatCount(d.totals.projects)}
          icon={IconFolderFilled}
          iconClassName="text-teal-500"
        />
        <StatCard
          label="Paid subs"
          size="sm"
          value={formatCount(d.totals.activeSubscriptions)}
          icon={IconCreditCard}
          iconClassName="text-rose-500"
        />
        <StatCard
          label="Spans (24h)"
          size="sm"
          value={formatCount(d.spans.last24h)}
          icon={IconStack2Filled}
          iconClassName="text-fuchsia-500"
        />
      </div>

      <AccessGrantsCard />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Signup funnel</CardTitle>
            <CardDescription>Signup → project → usage → paid</CardDescription>
          </CardHeader>
          <CardContent className="mt-2 flex flex-col gap-6">
            {funnelSteps.map((step) => (
              <div key={step.label} className="flex flex-col gap-3.5">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <step.icon className={`size-4 ${step.iconClassName}`} />
                    {step.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatCount(step.value)}
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.min(100, (step.value / funnelMax) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plans</CardTitle>
            <CardDescription>Organizations by plan</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {d.plans.map((p) => (
                  <tr key={p.plan} className="border-t border-border/50">
                    <td className="py-1 capitalize">{p.plan}</td>
                    <td className="py-1 text-right tabular-nums">
                      {formatCount(p.orgs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Signups, last 30 days</CardTitle>
            <CardDescription>New users per day</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {[...d.signupsByDay].reverse().map((row) => (
                  <tr key={row.day} className="border-t border-border/50">
                    <td className="py-1 tabular-nums">{row.day}</td>
                    <td className="py-1 text-right tabular-nums">
                      {formatCount(row.users)}
                    </td>
                  </tr>
                ))}
                {d.signupsByDay.length === 0 && (
                  <tr>
                    <td className="py-3 text-center text-muted-foreground">
                      No signups in the last 30 days.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ingestion, last 30 days</CardTitle>
            <CardDescription>
              {formatCount(d.spans.last30d)} spans total
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 font-medium">Day</th>
                  <th className="py-1 text-right font-medium">Spans</th>
                  <th className="py-1 text-right font-medium">Errors</th>
                  <th className="py-1 text-right font-medium">Error rate</th>
                  <th className="py-1 text-right font-medium">Active orgs</th>
                </tr>
              </thead>
              <tbody>
                {[...d.usageByDay].reverse().map((row) => (
                  <tr key={row.day} className="border-t border-border/50">
                    <td className="py-1 tabular-nums">{row.day}</td>
                    <td className="py-1 text-right tabular-nums">
                      {formatCount(row.spans)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {formatCount(row.errors)}
                    </td>
                    <td
                      className={`py-1 text-right tabular-nums ${
                        row.errorRate > 0.05 ? "text-destructive" : ""
                      }`}
                    >
                      {(row.errorRate * 100).toFixed(1)}%
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {row.activeOrgs}
                    </td>
                  </tr>
                ))}
                {d.usageByDay.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-3 text-center text-muted-foreground"
                    >
                      No usage yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top organizations, last 30 days</CardTitle>
            <CardDescription>By span volume</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {d.topOrgs.map((org) => (
                  <tr key={org.orgId} className="border-t border-border/50">
                    <td className="max-w-0 truncate py-1 pr-4">{org.name}</td>
                    <td className="py-1 text-right tabular-nums">
                      {formatCount(org.spans)}
                    </td>
                  </tr>
                ))}
                {d.topOrgs.length === 0 && (
                  <tr>
                    <td className="py-3 text-center text-muted-foreground">
                      No usage yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>ClickHouse storage</CardTitle>
            <CardDescription>Active parts per table</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 font-medium">Table</th>
                  <th className="py-1 text-right font-medium">Rows</th>
                  <th className="py-1 text-right font-medium">On disk</th>
                </tr>
              </thead>
              <tbody>
                {d.clickhouse.tables.map((t) => (
                  <tr key={t.table} className="border-t border-border/50">
                    <td className="py-1 font-mono text-xs">{t.table}</td>
                    <td className="py-1 text-right tabular-nums">
                      {formatCount(t.rows)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {formatBytes(t.bytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Postgres storage</CardTitle>
            <CardDescription>
              {formatBytes(d.postgres.totalBytes)} total · heaviest tables
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 font-medium">Table</th>
                  <th className="py-1 text-right font-medium">Size</th>
                </tr>
              </thead>
              <tbody>
                {d.postgres.tables.map((t) => (
                  <tr key={t.table} className="border-t border-border/50">
                    <td className="py-1 font-mono text-xs">{t.table}</td>
                    <td className="py-1 text-right tabular-nums">
                      {formatBytes(t.bytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ClickHouse disks</CardTitle>
            <CardDescription>
              Watch free space — the VM disk fills before anything else breaks.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {d.clickhouse.disks.map((disk) => {
              const used = disk.totalBytes - disk.freeBytes;
              const pct = disk.totalBytes ? used / disk.totalBytes : 0;
              return (
                <div key={disk.name} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-mono text-xs">{disk.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatBytes(used)} / {formatBytes(disk.totalBytes)} (
                      {Math.round(pct * 100)}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded bg-muted">
                    <div
                      className={`h-1.5 rounded ${pct > 0.85 ? "bg-destructive" : "bg-primary"}`}
                      style={{ width: `${Math.min(100, pct * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
