"use client";

import { IconCopy, IconKey, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@watchtower/ui/components/badge";
import { Button } from "@watchtower/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@watchtower/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@watchtower/ui/components/dialog";
import { Field, FieldLabel } from "@watchtower/ui/components/field";
import { Input } from "@watchtower/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@watchtower/ui/components/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@watchtower/ui/components/table";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader, TableSkeleton } from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { formatRelative } from "@/lib/format";
import { trpc } from "@/utils/trpc";

export function SettingsClient() {
  const { projectId, project, projects, setProjectId } = useProject();
  const qc = useQueryClient();

  // Projects dialog state
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState("");

  // API keys dialog state
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const keys = useQuery({
    ...trpc.projects.keys.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const createProject = useMutation(
    trpc.projects.create.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.projects.list.queryKey() });
        setProjectDialogOpen(false);
        setProjectName("");
        toast.success("Project created");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const createKey = useMutation(
    trpc.projects.keys.create.mutationOptions({
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: trpc.projects.keys.list.queryKey() });
        setKeyDialogOpen(false);
        setKeyName("");
        setRevealedKey(data.key);
        toast.success("API key created");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const revoke = useMutation(
    trpc.projects.keys.revoke.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.projects.keys.list.queryKey() });
        toast.success("API key revoked");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const keyRows = keys.data ?? [];

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage projects and API keys."
      />

      {/* Projects card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Projects</CardTitle>
          <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <IconPlus /> New project
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New project</DialogTitle>
              </DialogHeader>
              <Field>
                <FieldLabel>Name</FieldLabel>
                <Input
                  autoFocus
                  placeholder="My project"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (!projectName.trim() || !project?.orgId) return;
                      createProject.mutate({
                        orgId: project.orgId,
                        name: projectName.trim(),
                      });
                    }
                  }}
                />
              </Field>
              <DialogFooter>
                <Button
                  disabled={
                    !projectName.trim() ||
                    !project?.orgId ||
                    createProject.isPending
                  }
                  onClick={() => {
                    if (!projectName.trim() || !project?.orgId) return;
                    createProject.mutate({
                      orgId: project.orgId,
                      name: projectName.trim(),
                    });
                  }}
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Org</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => setProjectId(p.id)}
                >
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.orgName}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono">
                      {p.slug}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {p.id === projectId && (
                      <Badge variant="emerald">active</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* API keys card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>API keys</CardTitle>
          {projectId && (
            <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
              <DialogTrigger render={<Button size="sm" />}>
                <IconPlus /> Create key
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create API key</DialogTitle>
                </DialogHeader>
                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <Input
                    autoFocus
                    placeholder="Production key"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (!keyName.trim()) return;
                        createKey.mutate({ projectId, name: keyName.trim() });
                      }
                    }}
                  />
                </Field>
                <DialogFooter>
                  <Button
                    disabled={!keyName.trim() || createKey.isPending}
                    onClick={() => {
                      if (!keyName.trim()) return;
                      createKey.mutate({ projectId, name: keyName.trim() });
                    }}
                  >
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!projectId ? (
            <p className="text-sm text-muted-foreground">
              Select a project first.
            </p>
          ) : (
            <>
              {revealedKey && (
                <div className="flex flex-col gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    Copy your key now — it won't be shown again.
                  </p>
                  <InputGroup>
                    <InputGroupInput
                      readOnly
                      value={revealedKey}
                      className="font-mono text-xs"
                    />
                    <InputGroupAddon>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => {
                          void navigator.clipboard.writeText(revealedKey);
                          toast.success("Copied");
                        }}
                      >
                        <IconCopy />
                      </Button>
                    </InputGroupAddon>
                  </InputGroup>
                </div>
              )}
              {keys.isLoading ? (
                <TableSkeleton />
              ) : keyRows.length === 0 ? (
                <EmptyState
                  icon={IconKey}
                  title="No API keys"
                  description="Create a key to authenticate SDK requests."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Prefix</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keyRows.map((k) => (
                      <TableRow key={k.id}>
                        <TableCell className="font-medium">{k.name}</TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-muted-foreground">
                            {k.keyPrefix}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatRelative(k.createdAt)}
                        </TableCell>
                        <TableCell>
                          {k.revokedAt ? (
                            <Badge variant="rose">revoked</Badge>
                          ) : (
                            <Badge variant="emerald">active</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!k.revokedAt && (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              disabled={revoke.isPending}
                              onClick={() =>
                                revoke.mutate({ projectId, keyId: k.id })
                              }
                            >
                              <IconTrash />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
