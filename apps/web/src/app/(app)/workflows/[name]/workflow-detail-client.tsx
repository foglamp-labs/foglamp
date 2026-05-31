"use client";

import {
  IconArrowLeft,
  IconCheck,
  IconPencil,
  IconRobot,
  IconTimeline,
  IconX,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { Input } from "@foglamp/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { NodeFlow, type FlowNode } from "@/components/app/node-flow";
import {
  EmptyState,
  NoProject,
  PageHeader,
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import {
  formatCost,
  formatCount,
  formatDuration,
  formatRelative,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

import { UNGROUPED } from "../workflows-client";

export function WorkflowDetailClient({ nameParam }: { nameParam: string }) {
  const { projectId } = useProject();
  const router = useRouter();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const ungrouped = nameParam === UNGROUPED;
  const workflowName = ungrouped ? "" : nameParam;
  const label = ungrouped ? "Ungrouped" : nameParam;

  const runs = useQuery({
    ...trpc.workflowRuns.list.queryOptions({
      projectId: projectId!,
      workflowName,
      limit: 100,
    }),
    enabled: !!projectId,
  });

  const rename = useMutation(
    trpc.workflowRuns.rename.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.workflowRuns.list.queryKey() });
        setEditing(null);
        toast.success("Run renamed");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const runRows = runs.data ?? [];
  // Default the flow to the most recent run (the list is ordered newest-first).
  const activeRunId = selected ?? runRows[0]?.workflowRunId ?? null;

  const runDetail = useQuery({
    ...trpc.workflowRuns.get.queryOptions({
      projectId: projectId!,
      workflowRunId: activeRunId!,
    }),
    enabled: !!projectId && !!activeRunId,
  });

  const back = (
    <Button variant="outline" size="sm" render={<Link href="/workflows" />}>
      <IconArrowLeft />
      Workflows
    </Button>
  );

  if (!projectId) {
    return (
      <>
        <PageHeader title={label} actions={back} />
        <NoProject />
      </>
    );
  }

  const nodes: FlowNode[] = (runDetail.data?.traces ?? []).map((t) => ({
    id: t.traceId,
    icon: <IconRobot className="size-5 text-muted-foreground" />,
    label: t.traceName ?? t.agentName ?? "trace",
    status: t.errorCount > 0 ? "error" : "ok",
    timestamp: t.startTime,
    durationMs: t.durationMs,
  }));

  const submit = (workflowRunId: string) => {
    const name = draft.trim();
    if (!name) return;
    rename.mutate({ projectId, workflowRunId, name });
  };

  return (
    <>
      <PageHeader
        title={label}
        description={`${formatCount(runRows.length)} run${
          runRows.length === 1 ? "" : "s"
        }`}
        actions={back}
      />

      {runs.isLoading ? (
        <TableSkeleton />
      ) : runRows.length === 0 ? (
        <EmptyState
          icon={IconTimeline}
          title="No runs for this workflow"
          description="It may have aged out of retention, or the name has no runs."
        />
      ) : (
        <>
          {/* Step flow for the selected run. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Run flow
                {activeRunId && (
                  <span className="font-mono text-xs font-normal text-muted-foreground">
                    {runRows.find((r) => r.workflowRunId === activeRunId)
                      ?.displayName ?? `${activeRunId.slice(0, 16)}…`}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {runDetail.isLoading ? (
                <TableSkeleton rows={2} />
              ) : nodes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No traces in this run.
                </p>
              ) : (
                <NodeFlow
                  nodes={nodes}
                  onNodeClick={(id) =>
                    router.push(`/traces/${encodeURIComponent(id)}`)
                  }
                  onNodeReplay={(id) =>
                    router.push(`/traces/${encodeURIComponent(id)}?replay=1`)
                  }
                />
              )}
            </CardContent>
          </Card>

          {/* Runs table — click a row to drive the flow above. */}
          <Card>
            <CardHeader>
              <CardTitle>Runs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run</TableHead>
                    <TableHead className="text-right">Traces</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runRows.map((r) => (
                    <TableRow
                      key={r.workflowRunId}
                      className={cn(
                        "cursor-pointer",
                        r.workflowRunId === activeRunId && "bg-accent",
                      )}
                      onClick={() => setSelected(r.workflowRunId)}
                    >
                      <TableCell>
                        {editing === r.workflowRunId ? (
                          <div
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Input
                              autoFocus
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") submit(r.workflowRunId);
                                if (e.key === "Escape") setEditing(null);
                              }}
                              className="h-8 w-56"
                            />
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              disabled={rename.isPending}
                              onClick={() => submit(r.workflowRunId)}
                            >
                              <IconCheck />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => setEditing(null)}
                            >
                              <IconX />
                            </Button>
                          </div>
                        ) : (
                          <div className="group flex items-center gap-2">
                            <span className="font-medium">
                              {r.displayName ?? (
                                <span className="font-mono text-xs text-muted-foreground">
                                  {r.workflowRunId.slice(0, 16)}…
                                </span>
                              )}
                            </span>
                            {r.errorCount > 0 && (
                              <Badge variant="rose">
                                {formatCount(r.errorCount)} err
                              </Badge>
                            )}
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="opacity-0 group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditing(r.workflowRunId);
                                setDraft(r.displayName ?? "");
                              }}
                            >
                              <IconPencil />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCount(r.traceCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDuration(r.durationMs)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatCost(r.totalCost)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatRelative(r.startTime)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
