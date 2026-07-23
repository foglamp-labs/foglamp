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
import { Avatar, AvatarFallback } from "@foglamp/ui/components/avatar";
import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { Field, FieldLabel } from "@foglamp/ui/components/field";
import { Input } from "@foglamp/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@foglamp/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@foglamp/ui/components/select";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconAlertTriangleFilled,
  IconChartPieFilled,
  IconClockFilled,
  IconCreditCardFilled,
  IconCrownFilled,
  IconFolderFilled,
  IconGaugeFilled,
  IconLockFilled,
  IconMailFilled,
  IconSettingsFilled,
  IconShieldFilled,
  IconStack2Filled,
  IconTimelineEventFilled,
  IconTrash,
  IconTrashFilled,
  IconUserFilled,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { type ComponentType, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { NoProject, PageHeader } from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { ProjectIcon } from "@/components/app/project-icon";
import { authClient } from "@/lib/auth-client";
import { formatCount } from "@/lib/format";
import { trpc } from "@/utils/trpc";
import { OrgSettingsHeader } from "./header";
import { ProviderKeysTab } from "./provider-keys-tab";

type Member = {
  id: string;
  role: string;
  user: { email: string; name?: string };
};
type Invite = {
  id: string;
  email: string;
  role: string | null;
  status: string;
};
type Role = "admin" | "member";

function initials(value: string) {
  return value.slice(0, 2).toUpperCase();
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Tab ids double as the `?tab=` deep-link values (e.g. the New Eval dialog
// links straight to provider-keys).
const TAB_IDS = [
  "general",
  "members",
  "provider-keys",
  "projects",
  "billing",
  "usage",
] as const;
type TabId = (typeof TAB_IDS)[number];

function isTabId(v: string | null): v is TabId {
  return !!v && (TAB_IDS as readonly string[]).includes(v);
}

// Invitations used to be their own tab; keep old links landing on Members.
function fromParam(v: string | null): TabId | null {
  if (v === "invitations") return "members";
  return isTabId(v) ? v : null;
}

const TABS: {
  id: TabId;
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { id: "general", label: "General", icon: IconSettingsFilled },
  { id: "members", label: "Members", icon: IconUserFilled },
  { id: "provider-keys", label: "Provider Keys", icon: IconLockFilled },
  { id: "projects", label: "Projects", icon: IconFolderFilled },
  { id: "billing", label: "Billing", icon: IconCreditCardFilled },
  { id: "usage", label: "Usage", icon: IconChartPieFilled },
];

// Button-row tab bar with one shared background pill: the active button hosts
// a layoutId span, so selecting another tab slides the pill over to it instead
// of it popping in and out.
function TabBar({
  tab,
  onChange,
}: {
  tab: TabId;
  onChange: (t: TabId) => void;
}) {
  return (
    <div role="tablist" className="flex w-fit flex-wrap items-center gap-1">
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = id === tab;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={cn(
              // No transition-colors: the pill leaves a deselected button
              // instantly (its layoutId node remounts on the new button), so a
              // trailing color fade reads as a flick — snap the text with it.
              // Hover still eases via its own scoped transition below.
              "relative h-8 cursor-pointer rounded-xl corner-squircle px-2.5 text-sm font-medium",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground hover:transition-colors"
            )}
          >
            {active && (
              <motion.span
                layoutId="settings-tab-bg"
                initial={false}
                transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                className="absolute inset-0 z-0 rounded-xl corner-squircle bg-muted dark:bg-muted/50"
              />
            )}
            {/* z-10: the sliding pill lives in the *destination* button and its
                transform stacks it above sibling buttons' content — without a
                z-index it paints over the outgoing tab's label mid-flight,
                blanking the text for a couple of frames. */}
            <span className="relative z-10 flex items-center gap-1.5">
              <Icon className="size-3.5" />
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function OrgSettingsClient() {
  const { project } = useProject();
  const orgId = project?.orgId;
  const orgName = project?.orgName ?? "";

  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<TabId>(fromParam(tabParam) ?? "general");
  // Follow later URL changes too (e.g. an in-app link while already here).
  useEffect(() => {
    const next = fromParam(tabParam);
    if (next) setTab(next);
  }, [tabParam]);

  function onTabChange(value: string) {
    const next = fromParam(value) ?? "general";
    setTab(next);
    // Keep the URL shareable/refreshable without adding history entries.
    router.replace(`/settings/org?tab=${next}` as Route, { scroll: false });
  }

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
      <OrgSettingsHeader />
      <div className="flex flex-col gap-6">
        <TabBar tab={tab} onChange={onTabChange} />
        {tab === "general" && <GeneralTab orgId={orgId} orgName={orgName} />}
        {tab === "members" && <MembersTab orgId={orgId} />}
        {tab === "projects" && <ProjectsTab orgId={orgId} />}
        {tab === "billing" && <BillingTab orgId={orgId} />}
        {tab === "usage" && <UsageTab orgId={orgId} />}
        {tab === "provider-keys" && <ProviderKeysTab />}
      </div>
    </>
  );
}

// --- Members + pending invitations in one fetch (explicit org id; no active-org dance) ---
function useOrgPeople(orgId: string) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const refresh = useCallback(async () => {
    const m = await authClient.organization.listMembers({
      query: { organizationId: orgId },
    });
    const data = m.data as { members?: Member[] } | Member[] | undefined;
    setMembers(Array.isArray(data) ? data : (data?.members ?? []));
    const inv = await authClient.organization.listInvitations({
      query: { organizationId: orgId },
    });
    const list = (inv.data as Invite[] | undefined) ?? [];
    setInvites(list.filter((i) => i.status === "pending"));
  }, [orgId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { members, invites, refresh };
}

function GeneralTab({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { project } = useProject();
  const qc = useQueryClient();
  const [name, setName] = useState(orgName);
  const [projectName, setProjectName] = useState(project?.name ?? "");
  const [url, setUrl] = useState(project?.url ?? "");
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Require typing the org name to confirm deletion.
  const [confirm, setConfirm] = useState("");
  const canDelete = confirm.trim() === orgName;

  // Resync the editable project fields when the active project changes (e.g.
  // via the switcher) so we never save the previous project's values.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on project switch only
  useEffect(() => {
    setProjectName(project?.name ?? "");
    setUrl(project?.url ?? "");
  }, [project?.id]);

  const save = async () => {
    const res = await authClient.organization.update({
      data: { name },
      organizationId: orgId,
    });
    if (res.error) return toast.error(res.error.message ?? "Failed to update");
    toast.success("Organization updated");
  };

  // Project URL drives the favicon/identicon shown in the switcher; "" clears it.
  const updateProject = useMutation(
    trpc.projects.update.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: trpc.projects.list.queryKey() });
        toast.success("Project updated");
      },
      onError: (e) => toast.error(e.message ?? "Failed to update project"),
    })
  );
  const saveName = () => {
    if (!project) return;
    updateProject.mutate({ projectId: project.id, name: projectName.trim() });
  };
  const saveUrl = () => {
    if (!project) return;
    updateProject.mutate({ projectId: project.id, url: url.trim() });
  };

  const [deleting, setDeleting] = useState(false);
  const del = async () => {
    if (!canDelete || deleting) return;
    setDeleting(true);
    try {
      const res = await authClient.organization.delete({
        organizationId: orgId,
      });
      if (res.error)
        return toast.error(res.error.message ?? "Failed to delete");
      toast.success("Organization deleted");
      window.location.href = "/overview";
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 mt-2">
          <Field>
            <FieldLabel>Name</FieldLabel>
            <InputGroup className="max-w-sm">
              <InputGroupInput
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <InputGroupAddon align="inline-end" className="pr-1.25">
                <Button
                  size="sm"
                  variant="ghost"
                  className="mr-1 h-6.5 rounded-sm dark:hover:bg-muted"
                  disabled={!name.trim() || name === orgName}
                  onClick={save}
                >
                  Save
                </Button>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </CardContent>
      </Card>

      {project && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Project</CardTitle>
            {/* Same favicon the sidebar's project switcher shows, inlined
                before the name. Only when the project has a URL — the
                placeholder variant renders a div, invalid inside this <p>. */}
            <CardDescription>
              Settings for{" "}
              {project.url && (
                <span className="inline-flex items-center align-middle ml-0.75 mb-0.75 mr-0.5">
                  <ProjectIcon
                    url={project.url}
                    name={project.name}
                    size="xs"
                  />
                </span>
              )}{" "}
              <span className="text-foreground">{project.name}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row mt-2">
            <Field className="flex-1">
              <FieldLabel>Name</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
                <InputGroupAddon align="inline-end" className="pr-1.25">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mr-1 h-6.5 rounded-sm dark:hover:bg-muted"
                    disabled={
                      updateProject.isPending ||
                      !projectName.trim() ||
                      projectName.trim() === project.name
                    }
                    onClick={saveName}
                  >
                    Save
                  </Button>
                </InputGroupAddon>
              </InputGroup>
            </Field>

            <Field className="flex-1">
              <FieldLabel>Project URL</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  placeholder="example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <InputGroupAddon align="inline-end" className="pr-1.25">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mr-1 h-6.5 rounded-sm dark:hover:bg-muted"
                    disabled={
                      updateProject.isPending ||
                      url.trim() === (project.url ?? "")
                    }
                    onClick={saveUrl}
                  >
                    Save
                  </Button>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </CardContent>
        </Card>
      )}

      <Card className="border-destructive/40" size="sm">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Deleting the organization removes all its projects and data. This
            can't be undone.
          </CardDescription>
          <CardAction className="self-center">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
            >
              <IconTrashFilled className="mb-px" />
              Delete organization
            </Button>
          </CardAction>
        </CardHeader>
      </Card>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setConfirm("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {orgName}?</AlertDialogTitle>
            <AlertDialogDescription>
              All projects, traces, and settings in this organization will be
              permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel>
              Type{" "}
              <span className="font-medium text-foreground">{orgName}</span> to
              confirm
            </FieldLabel>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={orgName}
              autoComplete="off"
              autoFocus
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!canDelete || deleting}
              onClick={del}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MembersTab({ orgId }: { orgId: string }) {
  const { members, invites, refresh } = useOrgPeople(orgId);
  // Targets kept set while their dialogs animate closed (see ProjectsTab).
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [inviting, setInviting] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Invite | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const invite = async () => {
    if (!email.trim() || inviting) return;
    setInviting(true);
    try {
      const res = await authClient.organization.inviteMember({
        email: email.trim(),
        role: inviteRole,
        organizationId: orgId,
      });
      if (res.error)
        return toast.error(res.error.message ?? "Failed to invite");
      setEmail("");
      toast.success("Invitation sent");
      void refresh();
    } finally {
      setInviting(false);
    }
  };

  const cancelInvite = async () => {
    if (!revokeTarget || revoking) return;
    setRevoking(true);
    try {
      const res = await authClient.organization.cancelInvitation({
        invitationId: revokeTarget.id,
      });
      setRevokeOpen(false);
      if (res.error) return toast.error(res.error.message ?? "Failed");
      void refresh();
    } finally {
      setRevoking(false);
    }
  };

  const changeRole = async (memberId: string, role: Role) => {
    if (roleUpdating === memberId) return;
    setRoleUpdating(memberId);
    try {
      const res = await authClient.organization.updateMemberRole({
        memberId,
        role,
        organizationId: orgId,
      });
      if (res.error) return toast.error(res.error.message ?? "Failed");
      void refresh();
    } finally {
      setRoleUpdating(null);
    }
  };
  const remove = async () => {
    if (!removeTarget || removing) return;
    setRemoving(true);
    try {
      const res = await authClient.organization.removeMember({
        memberIdOrEmail: removeTarget.id,
        organizationId: orgId,
      });
      setRemoveOpen(false);
      if (res.error) return toast.error(res.error.message ?? "Failed");
      toast.success("Member removed");
      void refresh();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>
          Invite teammates by email. Admins+ can manage members.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 mt-2">
        {/* A real form so Enter in the email field submits the invite. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void invite();
          }}
          className="flex items-end gap-4"
        >
          <Field className="flex-1">
            <FieldLabel>Email</FieldLabel>
            <Input
              type="email"
              placeholder="steve@jobs.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field className="w-46">
            <FieldLabel>Role</FieldLabel>
            <Select
              value={inviteRole}
              onValueChange={(v) => setInviteRole(v as Role)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">
                  <IconUserFilled className="size-3.5 shrink-0 text-muted-foreground" />
                  Member
                </SelectItem>
                <SelectItem value="admin">
                  <IconShieldFilled className="size-3.5 shrink-0 text-muted-foreground" />
                  Admin
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Button
            type="submit"
            disabled={!email.trim() || inviting}
            className="mb-0.5"
          >
            <IconMailFilled />
            Invite
          </Button>
        </form>

        <div className="flex flex-col">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 border-b border-border/50 py-3 px-1 pr-1.5 last:border-b-0 last:pb-1"
            >
              <div className="flex items-center gap-3">
                <Avatar size="xs">
                  <AvatarFallback>
                    {initials(m.user.name || m.user.email)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">
                  {m.user.name || m.user.email}
                  <span className="text-xs text-muted-foreground font-normal ml-2.5">
                    {m.user.email}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                {m.role === "owner" ? (
                  <Badge variant="orange">
                    <IconCrownFilled />
                    Owner
                  </Badge>
                ) : (
                  <Select
                    value={m.role}
                    // Lock only the row being updated; the rest stay usable.
                    disabled={roleUpdating === m.id}
                    onValueChange={(v) => changeRole(m.id, v as Role)}
                  >
                    <SelectTrigger size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">
                        <IconShieldFilled className="size-3.5 shrink-0 text-muted-foreground" />
                        Admin
                      </SelectItem>
                      <SelectItem value="member">
                        <IconUserFilled className="size-3.5 shrink-0 text-muted-foreground" />
                        Member
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {m.role !== "owner" && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => {
                      setRemoveTarget(m);
                      setRemoveOpen(true);
                    }}
                  >
                    <IconTrashFilled />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {invites.length > 0 && (
          <div className="mt-4 flex flex-col">
            <p className="text-sm font-medium text-muted-foreground">
              Invitations sent
            </p>
            <div className="flex flex-col">
              {invites.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between gap-3 border-b border-border/50 py-3 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <Avatar size="sm">
                      <AvatarFallback>{initials(i.email)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{i.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {capitalize(i.role ?? "member")}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRevokeTarget(i);
                        setRevokeOpen(true);
                      }}
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.user.email} will lose access to this organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removing}
              onClick={remove}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.email} will no longer be able to join with this
              invitation. You can always send a new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revoking}
              onClick={cancelInvite}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ProjectsTab({ orgId }: { orgId: string }) {
  const { projects } = useProject();
  const qc = useQueryClient();
  const orgProjects = projects.filter((p) => p.orgId === orgId);
  // The target is kept set while the dialog animates closed (open is a
  // separate flag) so its name doesn't blank out mid-animation.
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Require typing the project name to confirm deletion (same as org delete).
  const [confirm, setConfirm] = useState("");
  const canDelete =
    deleteTarget !== null && confirm.trim() === deleteTarget.name;

  const del = useMutation(
    trpc.projects.delete.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: trpc.projects.list.queryKey() });
        setDeleteOpen(false);
        toast.success("Project deleted");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  return (
    <Card className="data-[size=sm]:pb-3" size="sm">
      <CardHeader>
        <CardTitle>Projects</CardTitle>
        <CardDescription>
          Delete is permanent and removes the project's traces and data.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col">
        {orgProjects.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 border-b border-border/50 py-3 last:border-b-0 px-0.5 pr-2"
          >
            <div className="flex items-center gap-3">
              <ProjectIcon url={p.url} name={p.name} />
              <span className="text-sm font-medium">{p.name}</span>
            </div>
            <Button
              size="icon-sm"
              variant="ghost-destructive"
              onClick={() => {
                setDeleteTarget({ id: p.id, name: p.name });
                setConfirm("");
                setDeleteOpen(true);
              }}
            >
              <IconTrashFilled />
            </Button>
          </div>
        ))}
      </CardContent>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the project and all of its traces, spans,
              and scores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel>
              Type{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.name}
              </span>{" "}
              to confirm
            </FieldLabel>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={deleteTarget?.name}
              autoComplete="off"
              autoFocus
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!canDelete || del.isPending}
              onClick={() =>
                deleteTarget && del.mutate({ projectId: deleteTarget.id })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// Pro plan headline limits, icons matched to the marketing pricing page
// (apps/web/src/app/(marketing)/pricing/page.tsx). Keep both in sync.
const PRO_LIMITS: {
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { label: "1M spans / month", icon: IconTimelineEventFilled },
  { label: "14-day retention", icon: IconClockFilled },
  { label: "5 projects", icon: IconFolderFilled },
  { label: "10 alerts", icon: IconAlertTriangleFilled },
  { label: "20 evals", icon: IconGaugeFilled },
];

function BillingTab({ orgId }: { orgId: string }) {
  const usage = useQuery({
    ...trpc.orgs.usage.queryOptions({ orgId }),
    enabled: !!orgId,
  });
  const [redirecting, setRedirecting] = useState(false);

  const upgrade = async () => {
    if (redirecting) return;
    setRedirecting(true);
    try {
      const origin = window.location.origin;
      await authClient.subscription.upgrade({
        plan: "pro",
        referenceId: orgId,
        successUrl: `${origin}/settings/org`,
        cancelUrl: `${origin}/settings/org`,
      });
    } finally {
      setRedirecting(false);
    }
  };
  const manage = async () => {
    if (redirecting) return;
    setRedirecting(true);
    try {
      await authClient.subscription.billingPortal({
        referenceId: orgId,
        returnUrl: `${window.location.origin}/settings/org`,
      });
    } finally {
      setRedirecting(false);
    }
  };

  // Don't guess the plan while it loads — a Pro org would otherwise see the
  // free-plan upgrade pitch flash on every cold load.
  if (!usage.data) return null;
  const plan = usage.data.plan;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Billing</CardTitle>
        <CardDescription>
          Current plan:{" "}
          <Badge variant={plan === "free" ? "secondary" : "emerald"}>
            {plan}
          </Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {plan === "free" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Upgrade to Pro for more headroom:
            </p>
            <div className="flex flex-col gap-2.5">
              {PRO_LIMITS.map((l) => (
                <div
                  key={l.label}
                  className="flex items-center gap-2.5 text-sm"
                >
                  <l.icon className="size-4 shrink-0 text-muted-foreground/70" />
                  {l.label}
                </div>
              ))}
            </div>
            <Button
              size="sm"
              className="self-start"
              disabled={redirecting}
              onClick={upgrade}
            >
              Upgrade to Pro · $49/mo
            </Button>
          </div>
        )}
        {plan === "pro" && (
          <Button
            size="sm"
            variant="outline"
            disabled={redirecting}
            onClick={manage}
          >
            Manage billing
          </Button>
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

function UsageBar({
  label,
  icon: Icon,
  iconClassName,
  used,
  limit,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  // Tailwind text color matching the nav palette (see app-shell.tsx / nav.ts).
  iconClassName?: string;
  used: number;
  limit: number | null;
}) {
  const pct = limit === null ? 0 : Math.min((used / limit) * 100, 100);
  const over = limit !== null && used / limit >= 0.9;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex justify-between text-sm">
        <span className="flex items-center gap-2">
          <Icon
            className={cn("size-4", iconClassName ?? "text-muted-foreground")}
          />
          {label}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {formatCount(used)} / {limit === null ? "∞" : formatCount(limit)}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
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
    <Card size="sm">
      <CardHeader>
        <CardTitle>Usage</CardTitle>
        <CardDescription>
          {d
            ? `Resets ${new Date(d.periodEnd).toLocaleDateString()}`
            : "Current billing period"}
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-x-8 mt-3 pb-3 grid grid-cols-4">
        {d ? (
          <>
            <UsageBar
              label="Spans this period"
              icon={IconStack2Filled}
              iconClassName="text-sky-500"
              used={d.spans.used}
              limit={d.spans.limit}
            />
            <UsageBar
              label="Projects"
              icon={IconFolderFilled}
              iconClassName="text-emerald-500"
              used={d.projects.used}
              limit={d.projects.limit}
            />
            <UsageBar
              label="Evals"
              icon={IconGaugeFilled}
              iconClassName="text-fuchsia-500"
              used={d.evals.used}
              limit={d.evals.limit}
            />
            <UsageBar
              label="Alerts"
              icon={IconAlertTriangleFilled}
              iconClassName="text-yellow-500"
              used={d.alerts.used}
              limit={d.alerts.limit}
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground my-1.5">Loading usage…</p>
        )}
      </CardContent>
    </Card>
  );
}
