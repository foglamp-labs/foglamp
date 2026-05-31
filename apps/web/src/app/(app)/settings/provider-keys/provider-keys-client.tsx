"use client";

import { IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useState } from "react";
import { toast } from "sonner";

import { NoProject, PageHeader, TableSkeleton } from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { trpc } from "@/utils/trpc";

type Provider = "google" | "openai" | "anthropic";
const PROVIDER_LABELS: Record<Provider, string> = {
  google: "Google (Gemini)",
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
};

export function ProviderKeysClient() {
  const { projectId } = useProject();
  const qc = useQueryClient();
  const [provider, setProvider] = useState<Provider>("google");
  const [key, setKey] = useState("");

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
    }),
  );
  const remove = useMutation(
    trpc.providerKeys.delete.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.providerKeys.list.queryKey() });
        toast.success("Provider key removed");
      },
      onError: (e) => toast.error(e.message),
    }),
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
      <PageHeader
        title="Provider Keys"
        description="Bring-your-own-key for LLM judges. Keys are encrypted at rest and never shown again."
      />

      {!configured && (
        <Card>
          <CardHeader>
            <CardTitle>Encryption not configured</CardTitle>
            <CardDescription>
              Set <code>FOGLAMP_SECRETS_KEY</code> (32+ chars) on the server to
              enable saving provider keys.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add or replace a key</CardTitle>
          <CardDescription>
            Saved per provider — reused by every judge eval that uses that
            provider's models.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel>Provider</FieldLabel>
            <NativeSelect
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
            >
              <NativeSelectOption value="google">Google (Gemini)</NativeSelectOption>
              <NativeSelectOption value="openai">OpenAI</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>API key</FieldLabel>
            <Input
              type="password"
              placeholder="Paste the provider API key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={!configured}
            />
          </Field>
          <div>
            <Button
              disabled={!configured || !key.trim() || upsert.isPending}
              onClick={() =>
                upsert.mutate({ projectId, provider, key: key.trim() })
              }
            >
              Save key
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved keys</CardTitle>
        </CardHeader>
        <CardContent>
          {keys.isLoading ? (
            <TableSkeleton rows={3} />
          ) : (
            <div className="flex flex-col gap-2">
              {(["google", "openai", "anthropic"] as Provider[]).map((p) => {
                const has = saved.has(p);
                return (
                  <div
                    key={p}
                    className="flex items-center justify-between rounded-md border px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
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
                        onClick={() => remove.mutate({ projectId, provider: p })}
                      >
                        <IconTrash />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
