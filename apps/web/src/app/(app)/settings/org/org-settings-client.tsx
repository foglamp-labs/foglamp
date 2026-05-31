"use client";

import { IconTrash } from "@tabler/icons-react";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { Field, FieldLabel } from "@foglamp/ui/components/field";
import { Input } from "@foglamp/ui/components/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@foglamp/ui/components/native-select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@foglamp/ui/components/tabs";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { NoProject, PageHeader } from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { authClient } from "@/lib/auth-client";
import { formatCount } from "@/lib/format";
import { trpc } from "@/utils/trpc";

type Member = { id: string; role: string; user: { email: string; name?: string } };
type Invite = { id: string; email: string; role: string | null; status: string };
type Role = "admin" | "member";

export function OrgSettingsClient() {
  const { project } = useProject();
  const orgId = project?.orgId;
  const orgName = project?.orgName ?? "";

  if (!orgId) {
    return (
      <>
        <PageHeader title="Organization" />
        <NoProject />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Organization" description={orgName} />
      <Tabs defaultValue="members">
        <TabsList variant="line">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="invitations">Invitations</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>
        <TabsContent value="general"><GeneralTab orgId={orgId} orgName={orgName} /></TabsContent>
        <TabsContent value="members"><MembersTab orgId={orgId} /></TabsContent>
        <TabsContent value="invitations"><InvitationsTab orgId={orgId} /></TabsContent>
        <TabsContent value="projects"><ProjectsTab orgId={orgId} /></TabsContent>
        <TabsContent value="billing"><BillingTab orgId={orgId} /></TabsContent>
        <TabsContent value="usage"><UsageTab orgId={orgId} /></TabsContent>
      </Tabs>
    </>
  );
}

// --- Members + invitations share a fetch (explicit org id; no active-org dance) ---
function useOrgPeople(orgId: string) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const refresh = useCallback(async () => {
    const m = await authClient.organization.listMembers({ query: { organizationId: orgId } });
    const data = m.data as { members?: Member[] } | Member[] | undefined;
    setMembers(Array.isArray(data) ? data : (data?.members ?? []));
    const inv = await authClient.organization.listInvitations({ query: { organizationId: orgId } });
    const list = (inv.data as Invite[] | undefined) ?? [];
    setInvites(list.filter((i) => i.status === "pending"));
  }, [orgId]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { members, invites, refresh };
}

function GeneralTab({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [name, setName] = useState(orgName);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const save = async () => {
    const res = await authClient.organization.update({ data: { name }, organizationId: orgId });
    if (res.error) return toast.error(res.error.message ?? "Failed to update");
    toast.success("Organization updated");
  };
  const del = async () => {
    const res = await authClient.organization.delete({ organizationId: orgId });
    if (res.error) return toast.error(res.error.message ?? "Failed to delete");
    toast.success("Organization deleted");
    window.location.href = "/overview";
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-sm" />
          </Field>
          <div>
            <Button size="sm" disabled={!name.trim() || name === orgName} onClick={save}>
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Deleting the organization removes all its projects and data. This can't be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            Delete organization
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {orgName}?</AlertDialogTitle>
            <AlertDialogDescription>
              All projects, traces, and settings in this organization will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={del}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MembersTab({ orgId }: { orgId: string }) {
  const { members, refresh } = useOrgPeople(orgId);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  const changeRole = async (memberId: string, role: Role) => {
    const res = await authClient.organization.updateMemberRole({ memberId, role, organizationId: orgId });
    if (res.error) return toast.error(res.error.message ?? "Failed");
    void refresh();
  };
  const remove = async () => {
    if (!removeTarget) return;
    const res = await authClient.organization.removeMember({
      memberIdOrEmail: removeTarget.id,
      organizationId: orgId,
    });
    setRemoveTarget(null);
    if (res.error) return toast.error(res.error.message ?? "Failed");
    toast.success("Member removed");
    void refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-md border px-4 py-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium">{m.user.name || m.user.email}</span>
              <span className="text-xs text-muted-foreground">{m.user.email}</span>
            </div>
            <div className="flex items-center gap-2">
              {m.role === "owner" ? (
                <Badge variant="amber">owner</Badge>
              ) : (
                <NativeSelect
                  value={m.role}
                  onChange={(e) => changeRole(m.id, e.target.value as Role)}
                >
                  <NativeSelectOption value="admin">admin</NativeSelectOption>
                  <NativeSelectOption value="member">member</NativeSelectOption>
                </NativeSelect>
              )}
              {m.role !== "owner" && (
                <Button size="icon-sm" variant="ghost" onClick={() => setRemoveTarget(m)}>
                  <IconTrash />
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>

      <AlertDialog open={removeTarget !== null} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.user.email} will lose access to this organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function InvitationsTab({ orgId }: { orgId: string }) {
  const { invites, refresh } = useOrgPeople(orgId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");

  const invite = async () => {
    if (!email.trim()) return;
    const res = await authClient.organization.inviteMember({
      email: email.trim(),
      role,
      organizationId: orgId,
    });
    if (res.error) return toast.error(res.error.message ?? "Failed to invite");
    setEmail("");
    toast.success("Invitation sent");
    void refresh();
  };
  const cancel = async (invitationId: string) => {
    const res = await authClient.organization.cancelInvitation({ invitationId });
    if (res.error) return toast.error(res.error.message ?? "Failed");
    void refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitations</CardTitle>
        <CardDescription>Invite teammates by email. Admins+ can manage members.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-end gap-2">
          <Field className="flex-1">
            <FieldLabel>Email</FieldLabel>
            <Input
              type="email"
              placeholder="teammate@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>Role</FieldLabel>
            <NativeSelect value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <NativeSelectOption value="member">member</NativeSelectOption>
              <NativeSelectOption value="admin">admin</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Button onClick={invite} disabled={!email.trim()}>Invite</Button>
        </div>

        {invites.length > 0 && (
          <div className="flex flex-col gap-2">
            {invites.map((i) => (
              <div key={i.id} className="flex items-center justify-between rounded-md border px-4 py-2">
                <span className="text-sm">{i.email}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{i.role ?? "member"}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => cancel(i.id)}>Revoke</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectsTab({ orgId }: { orgId: string }) {
  const { projects } = useProject();
  const qc = useQueryClient();
  const orgProjects = projects.filter((p) => p.orgId === orgId);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const del = useMutation(
    trpc.projects.delete.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: trpc.projects.list.queryKey() });
        setDeleteTarget(null);
        toast.success("Project deleted");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
        <CardDescription>Delete is permanent — it removes the project's traces and data.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {orgProjects.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-md border px-4 py-3">
            <span className="text-sm font-medium">{p.name}</span>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
            >
              <IconTrash />
            </Button>
          </div>
        ))}
      </CardContent>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the project and all of its traces, spans, and scores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={del.isPending}
              onClick={() => deleteTarget && del.mutate({ projectId: deleteTarget.id })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function BillingTab({ orgId }: { orgId: string }) {
  const usage = useQuery({
    ...trpc.orgs.usage.queryOptions({ orgId }),
    enabled: !!orgId,
  });
  const plan = usage.data?.plan ?? "free";

  const upgrade = async () => {
    const origin = window.location.origin;
    await authClient.subscription.upgrade({
      plan: "pro",
      referenceId: orgId,
      successUrl: `${origin}/settings/org`,
      cancelUrl: `${origin}/settings/org`,
    });
  };
  const manage = async () => {
    await authClient.subscription.billingPortal({
      referenceId: orgId,
      returnUrl: `${window.location.origin}/settings/org`,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
        <CardDescription>
          Current plan: <Badge variant={plan === "free" ? "secondary" : "emerald"}>{plan}</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {plan === "free" && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Upgrade to Pro for 1M spans/mo, 14-day retention, 10 alerts, and 5 projects.
            </p>
            <Button size="sm" onClick={upgrade}>Upgrade to Pro · $49/mo</Button>
          </div>
        )}
        {plan === "pro" && (
          <Button size="sm" variant="outline" onClick={manage}>Manage billing</Button>
        )}
        {plan === "enterprise" && (
          <p className="text-sm text-muted-foreground">
            You're on an Enterprise plan. Contact us to change your limits.
          </p>
        )}
        {plan === "unmetered" && (
          <p className="text-sm text-muted-foreground">
            Billing isn't enabled on this instance — usage is unlimited.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit === null ? 0 : Math.min((used / limit) * 100, 100);
  const over = limit !== null && used / limit >= 0.9;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {formatCount(used)} / {limit === null ? "∞" : formatCount(limit)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${over ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${limit === null ? 2 : pct}%` }}
        />
      </div>
    </div>
  );
}

function UsageTab({ orgId }: { orgId: string }) {
  const usage = useQuery({
    ...trpc.orgs.usage.queryOptions({ orgId }),
    enabled: !!orgId,
  });
  const d = usage.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage</CardTitle>
        <CardDescription>
          {d ? `Resets ${new Date(d.periodEnd).toLocaleDateString()}` : "Current billing period"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {d ? (
          <>
            <UsageBar label="Spans this period" used={d.spans.used} limit={d.spans.limit} />
            <UsageBar label="Projects" used={d.projects.used} limit={d.projects.limit} />
            <UsageBar label="Alerts" used={d.alerts.used} limit={d.alerts.limit} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Loading usage…</p>
        )}
      </CardContent>
    </Card>
  );
}
