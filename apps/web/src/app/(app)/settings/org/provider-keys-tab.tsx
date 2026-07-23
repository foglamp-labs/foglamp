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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@foglamp/ui/components/input-group";
import { IconTrashFilled } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { NoProject } from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { ModelLogo } from "@/components/model-logo";
import { trpc } from "@/utils/trpc";

type Provider = "google" | "openai" | "anthropic";
const PROVIDER_LABELS: Record<Provider, string> = {
  google: "Google",
  openai: "OpenAI",
  anthropic: "Anthropic",
};
const ALL_PROVIDERS: Provider[] = ["google", "openai", "anthropic"];

/** Provider keys management, rendered as a tab of the Settings page. */
export function ProviderKeysTab() {
  const { projectId } = useProject();

  const keys = useQuery({
    ...trpc.providerKeys.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  if (!projectId) {
    return <NoProject />;
  }

  const configured = keys.data?.secretsConfigured ?? false;
  const saved = new Set((keys.data?.keys ?? []).map((k) => k.provider));

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Provider Keys</CardTitle>
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

        <div className="gap-x-8 mt-3 pb-3 grid grid-cols-3">
          {ALL_PROVIDERS.map((p) => (
            <ProviderKeyColumn
              key={p}
              projectId={projectId}
              provider={p}
              configured={configured}
              hasKey={saved.has(p)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// One provider's column: logo + status header, key input, save/delete actions.
function ProviderKeyColumn({
  projectId,
  provider,
  configured,
  hasKey,
}: {
  projectId: string;
  provider: Provider;
  configured: boolean;
  hasKey: boolean;
}) {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [removeOpen, setRemoveOpen] = useState(false);

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
        setRemoveOpen(false);
        toast.success("Provider key removed");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.75 text-sm font-medium">
        <ModelLogo provider={provider} className="size-3.5" />
        {PROVIDER_LABELS[provider]}
      </div>
      {/* A real form so Enter in the key field saves it. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!key.trim()) return;
          upsert.mutate({ projectId, provider, key: key.trim() });
        }}
        className="flex items-center gap-2"
      >
        <InputGroup>
          <InputGroupInput
            type="password"
            placeholder={hasKey ? "••••••••••••" : "Paste the API key"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={!configured}
          />
          <InputGroupAddon align="inline-end" className="pr-1.25">
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              className="mr-1 h-6.5 rounded-sm dark:hover:bg-muted"
              disabled={!configured || !key.trim() || upsert.isPending}
            >
              Save
            </Button>
          </InputGroupAddon>
        </InputGroup>
        {hasKey && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost-destructive"
            disabled={remove.isPending}
            onClick={() => setRemoveOpen(true)}
          >
            <IconTrashFilled />
          </Button>
        )}
      </form>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove the {PROVIDER_LABELS[provider]} key?
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
              onClick={() => remove.mutate({ projectId, provider })}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
