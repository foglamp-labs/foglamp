"use client";

import {
  IconDatabase,
  IconFlask,
  IconRefresh,
  IconRobot,
  IconSparkles,
  IconTimeline,
  IconTool,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@foglamp/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { Input } from "@foglamp/ui/components/input";
import { ScrollArea } from "@foglamp/ui/components/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { NoProject, PageHeader, TableSkeleton } from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { ModelLogo } from "@/components/model-logo";
import { trpc } from "@/utils/trpc";

const isDev = process.env.NODE_ENV !== "production";

type Kind = "bare" | "agent" | "workflow" | "tool" | "full";

const TESTS: {
  kind: Kind;
  label: string;
  description: string;
  icon: typeof IconFlask;
}[] = [
  {
    kind: "bare",
    label: "Named call",
    description:
      "A one-off call named via traceName (no agent) — a single LLM step.",
    icon: IconSparkles,
  },
  {
    kind: "agent",
    label: "Agent (RAG)",
    description: "A named agent: retrieval embedding → 2 LLM steps with a tool.",
    icon: IconRobot,
  },
  {
    kind: "workflow",
    label: "Workflow run",
    description:
      "One run grouping 3 agents (one errors) + 2 named one-off traces.",
    icon: IconTimeline,
  },
  {
    kind: "tool",
    label: "Tool-heavy agent",
    description: "An agentic loop: an embedding + 6 tool calls across 3 steps.",
    icon: IconTool,
  },
  {
    kind: "full",
    label: "Full dataset",
    description:
      "~42 traces over 60 min — agents, one-offs, tool loops, embeddings, errors, multiple runs.",
    icon: IconDatabase,
  },
];

// Per-token Decimal string → "$/1M tokens"; null prices show as an em dash.
function per1M(p: string | null): string {
  if (p == null) return "—";
  const v = Number(p) * 1_000_000;
  if (!Number.isFinite(v)) return "—";
  return `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`;
}

function perReq(p: string | null): string {
  if (p == null || Number(p) === 0) return "—";
  return `$${Number(p).toFixed(4)}`;
}

export function AdminClient() {
  const { projectId } = useProject();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [running, setRunning] = useState<Kind | null>(null);

  const pricing = useQuery({
    ...trpc.admin.pricing.queryOptions(),
    staleTime: 60_000,
  });

  const ingestTest = useMutation(
    trpc.admin.ingestTest.mutationOptions({
      onMutate: (vars) => setRunning(vars.kind),
      onSuccess: (res) => {
        // Refresh every dashboard query so the new spans show up immediately.
        void qc.invalidateQueries();
        toast.success(
          `Inserted ${res.spans} spans across ${res.traces} trace${res.traces === 1 ? "" : "s"} (${res.kind}).`,
        );
      },
      onError: (e) => toast.error(e.message),
      onSettled: () => setRunning(null),
    }),
  );

  const models = useMemo(() => {
    const all = pricing.data?.models ?? [];
    const q = filter.trim().toLowerCase();
    return q ? all.filter((m) => m.id.toLowerCase().includes(q)) : all;
  }, [pricing.data, filter]);

  if (!isDev) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Admin tools</CardTitle>
          <CardDescription>
            These developer tools are only available in development builds.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Admin"
        description="Developer tools — synthetic ingestion and the live pricing table. Dev-only."
      />

      <Card>
        <CardHeader>
          <CardTitle>Generate test data</CardTitle>
          <CardDescription>
            Synthesizes spans and inserts them straight into ClickHouse for the
            selected project — the same path the rollups see from real traffic.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!projectId ? (
            <NoProject />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TESTS.map((t) => (
                <div
                  key={t.kind}
                  className="flex flex-col gap-3 rounded-lg border p-4"
                >
                  <div className="flex items-center gap-2">
                    <t.icon className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{t.label}</span>
                  </div>
                  <p className="flex-1 text-xs text-muted-foreground">
                    {t.description}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ingestTest.isPending}
                    onClick={() =>
                      ingestTest.mutate({ projectId, kind: t.kind })
                    }
                  >
                    {running === t.kind ? "Running…" : "Run"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>Models &amp; pricing</CardTitle>
            <CardDescription>
              OpenRouter pricing currently cached in the server (per 1M tokens;
              request priced per call). {pricing.data?.count ?? 0} models.
            </CardDescription>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={pricing.isFetching}
            onClick={() =>
              qc.invalidateQueries({ queryKey: trpc.admin.pricing.queryKey() })
            }
          >
            <IconRefresh />
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            placeholder="Filter models… (e.g. gpt-4o, claude, gemini)"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-sm"
          />
          {pricing.isLoading ? (
            <TableSkeleton />
          ) : (
            <ScrollArea className="h-[480px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Input</TableHead>
                    <TableHead className="text-right">Output</TableHead>
                    <TableHead className="text-right">Cache read</TableHead>
                    <TableHead className="text-right">Cache write</TableHead>
                    <TableHead className="text-right">Request</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          <ModelLogo modelId={m.id} className="size-4 shrink-0" />
                          <span className="font-mono text-xs">{m.id}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {per1M(m.prompt)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {per1M(m.completion)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {per1M(m.cacheRead)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {per1M(m.cacheWrite)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {perReq(m.request)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {models.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-sm text-muted-foreground"
                      >
                        {pricing.data?.count
                          ? "No models match your filter."
                          : "No pricing loaded. Set OPENROUTER_MODELS_URL or a pricing file."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </>
  );
}
