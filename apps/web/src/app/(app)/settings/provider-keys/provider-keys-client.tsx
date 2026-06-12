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
import { Field, FieldLabel } from "@foglamp/ui/components/field";
import { Input } from "@foglamp/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@foglamp/ui/components/select";
import { IconTrash, IconTrashFilled } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import {
  NoProject,
  PageHeader,
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { ModelLogo } from "@/components/model-logo";
import { trpc } from "@/utils/trpc";
import { ProviderKeysHeader } from "./header";

type Provider = "google" | "openai" | "anthropic";
const PROVIDER_LABELS: Record<Provider, string> = {
  google: "Google (Gemini)",
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
};
// Providers a key can be added for (judge-capable). The saved list shows all.
const ADDABLE: Provider[] = ["google", "openai", "anthropic"];
const ALL_PROVIDERS: Provider[] = ["google", "openai", "anthropic"];

export function ProviderKeysClient() {
  const { projectId } = useProject();
  const qc = useQueryClient();
  const [provider, setProvider] = useState<Provider>("google");
  const [key, setKey] = useState("");
  const [removeTarget, setRemoveTarget] = useState<Provider | null>(null);

  const keys = useQuery({
    ...trpc.providerKeys.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const upsert = useMutation(
    trpc.providerKeys.upsert.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.providerKeys.list.queryKey() });
        setKey("");
        toast.success("Provider key saved");
      },
      onError: (e) => toast.error(e.message),
    })
  );
  const remove = useMutation(
    trpc.providerKeys.delete.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.providerKeys.list.queryKey() });
        setRemoveTarget(null);
        toast.success("Provider key removed");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  if (!projectId) {
    return (
      <>
        <PageHeader title="Provider Keys" />
        <NoProject />
      </>
    );
  }

  const configured = keys.data?.secretsConfigured ?? false;
  const saved = new Map((keys.data?.keys ?? []).map((k) => [k.provider, k]));

  return (
    <>
      <ProviderKeysHeader />

      <Card>
        <CardHeader>
          <CardTitle>Add or replace a key</CardTitle>
          <CardDescription>
            Used by every judge eval that uses that provider's models.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {!keys.isLoading && !configured && (
            <div className="rounded-xl corner-squircle border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-muted-foreground">
              <span className="font-medium text-destructive">
                Encryption not configured.
              </span>{" "}
              Set <code>FOGLAMP_SECRETS_KEY</code> (32+ chars) on the server to
              enable saving provider keys.
            </div>
          )}

          <div className="flex items-end gap-2 mt-2">
            <Field className="w-52">
              <FieldLabel>Provider</FieldLabel>
              <Select
                value={provider}
                onValueChange={(v) => setProvider(v as Provider)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value) => (
                      <span className="flex items-center gap-2">
                        <ModelLogo provider={value as string} />
                        {PROVIDER_LABELS[value as Provider]}
                      </span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ADDABLE.map((p) => (
                    <SelectItem key={p} value={p} label={PROVIDER_LABELS[p]}>
                      <ModelLogo provider={p} />
                      {PROVIDER_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field className="flex-1">
              <FieldLabel>API key</FieldLabel>
              <Input
                type="password"
                placeholder="Paste the provider API key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                disabled={!configured}
              />
            </Field>
            <Button
              disabled={!configured || !key.trim() || upsert.isPending}
              onClick={() =>
                upsert.mutate({ projectId, provider, key: key.trim() })
              }
            >
              Save key
            </Button>
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <p className="text-sm font-medium text-muted-foreground">
              Saved keys
            </p>
            {keys.isLoading ? (
              <TableSkeleton rows={3} />
            ) : (
              <div className="flex flex-col">
                {ALL_PROVIDERS.map((p) => {
                  const has = saved.has(p);
                  return (
                    <div
                      key={p}
                      className="flex items-center justify-between gap-4 border-b border-border/50 py-3 min-h-15 last:border-b-0 px-1.5"
                    >
                      <div className="flex items-center gap-3">
                        <ModelLogo provider={p} className="size-4" />
                        <span className="text-sm font-medium">
                          {PROVIDER_LABELS[p]}
                        </span>
                        <Badge variant={has ? "emerald" : "secondary"}>
                          {has ? "configured" : "not set"}
                        </Badge>
                      </div>
                      {has && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={remove.isPending}
                          onClick={() => setRemoveTarget(p)}
                        >
                          <IconTrashFilled />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove the {removeTarget ? PROVIDER_LABELS[removeTarget] : ""}{" "}
              key?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every judge eval that uses this provider's models will stop
              scoring until a new key is saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                removeTarget &&
                remove.mutate({ projectId, provider: removeTarget })
              }
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
