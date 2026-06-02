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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@foglamp/ui/components/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";
import {
  IconCheckFilled,
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconCopyFilled,
  IconKeyFilled,
  IconPlusFilled,
  IconTrashFilled,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useDelayedLoading } from "@/components/app/data-table";
import {
  EmptyState,
  PageHeader,
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { trpc } from "@/utils/trpc";

export function SettingsClient() {
  const { projectId } = useProject();
  const qc = useQueryClient();

  // API keys dialog state
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Key pending revocation (drives the confirm dialog).
  const [revokeTarget, setRevokeTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // Remembers the name while the confirm dialog animates closed, so the
  // description doesn't flicker to empty before the exit animation finishes.
  const lastRevokeName = useRef("");

  const keys = useQuery({
    ...trpc.projects.keys.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });
  // Delay the skeleton so fast loads don't flash it (see useDelayedLoading).
  const showSkeleton = useDelayedLoading(keys.isLoading);

  const createKey = useMutation(
    trpc.projects.keys.create.mutationOptions({
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: trpc.projects.keys.list.queryKey() });
        setKeyName("");
        setRevealedKey(data.key);
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const revoke = useMutation(
    trpc.projects.keys.revoke.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.projects.keys.list.queryKey() });
        setRevokeTarget(null);
        toast.success("API key revoked");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  // Active keys first, then newest-created first within each group.
  const keyRows = useMemo(
    () =>
      [...(keys.data ?? [])].sort((a, b) => {
        const aRevoked = a.revokedAt ? 1 : 0;
        const bRevoked = b.revokedAt ? 1 : 0;
        if (aRevoked !== bRevoked) return aRevoked - bRevoked;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }),
    [keys.data]
  );

  return (
    <>
      <PageHeader
        title="API Keys"
        description="Manage your keys."
        actions={
          projectId && (
            <Dialog
              open={keyDialogOpen}
              onOpenChange={(open) => {
                setKeyDialogOpen(open);
                if (!open) {
                  setKeyName("");
                  setRevealedKey(null);
                  setCopied(false);
                }
              }}
            >
              <DialogTrigger render={<Button size="sm" />}>
                <IconPlusFilled /> Create key
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {revealedKey ? "API key created" : "Create API key"}
                  </DialogTitle>

                  <DialogDescription>
                    {revealedKey
                      ? "Copy your key now, it won't be shown again."
                      : "Give it a cool name."}
                  </DialogDescription>
                </DialogHeader>
                {revealedKey ? (
                  <>
                    <Field>
                      <FieldLabel>API Key:</FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          readOnly
                          value={revealedKey}
                          className="font-mono text-xs"
                        />
                        <InputGroupAddon align="inline-end">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => {
                              void navigator.clipboard.writeText(revealedKey);
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                            }}
                          >
                            {copied ? (
                              <IconCircleCheckFilled />
                            ) : (
                              <IconCopyFilled />
                            )}
                          </Button>
                        </InputGroupAddon>
                      </InputGroup>
                    </Field>
                    <DialogFooter>
                      <Button
                        onClick={() => {
                          setKeyDialogOpen(false);
                          setRevealedKey(null);
                          setKeyName("");
                          setCopied(false);
                        }}
                      >
                        Done
                      </Button>
                    </DialogFooter>
                  </>
                ) : (
                  <>
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
                            createKey.mutate({
                              projectId,
                              name: keyName.trim(),
                            });
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
                  </>
                )}
              </DialogContent>
            </Dialog>
          )
        }
      />
      {!projectId ? (
        <p className="text-sm text-muted-foreground">Select a project first.</p>
      ) : (
        <>
          {keys.isLoading ? (
            showSkeleton ? <TableSkeleton /> : null
          ) : keyRows.length === 0 ? (
            <EmptyState
              icon={IconKeyFilled}
              title="No API keys"
              description="Create a key to authenticate SDK requests."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keyRows.map((k) => (
                  <TableRow key={k.id} className="h-13">
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {k.keyPrefix}
                      </span>
                    </TableCell>
                    <TableCell>
                      {k.revokedAt ? (
                        <Badge variant="rose">
                          <IconCircleXFilled className="mb-px" />
                          revoked
                        </Badge>
                      ) : (
                        <Badge variant="emerald">
                          <IconCircleCheckFilled className="mb-px" />
                          active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground border-r-0">
                      {formatDistanceToNow(new Date(k.createdAt), {
                        addSuffix: true,
                      })}
                    </TableCell>
                    <TableCell align="center">
                      {!k.revokedAt && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => {
                            lastRevokeName.current = k.name;
                            setRevokeTarget({ id: k.id, name: k.name });
                          }}
                        >
                          <IconTrashFilled />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <AlertDialog
            open={revokeTarget !== null}
            onOpenChange={(open) => !open && setRevokeTarget(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
                <AlertDialogDescription>
                  {`"${revokeTarget?.name ?? lastRevokeName.current}" will stop working immediately. This can't be undone.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={revoke.isPending}
                  onClick={() => {
                    if (!revokeTarget) return;
                    revoke.mutate({ projectId, keyId: revokeTarget.id });
                  }}
                >
                  Revoke
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  );
}
