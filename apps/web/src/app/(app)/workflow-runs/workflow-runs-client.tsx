"use client";

import { IconCheck, IconPencil, IconTimeline, IconX } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@watchtower/ui/components/badge";
import { Button } from "@watchtower/ui/components/button";
import { Input } from "@watchtower/ui/components/input";
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
import { trpc } from "@/utils/trpc";

export function WorkflowRunsClient() {
  const { projectId } = useProject();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const runs = useQuery({
    ...trpc.workflowRuns.list.queryOptions({ projectId: projectId!, limit: 100 }),
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

  if (!projectId) {
    return (
      <>
        <PageHeader title="Workflow runs" />
        <NoProject />
      </>
    );
  }

  const rows = runs.data ?? [];

  const submit = (workflowRunId: string) => {
    const name = draft.trim();
    if (!name) return;
    rename.mutate({ projectId, workflowRunId, name });
  };

  return (
    <>
      <PageHeader
        title="Workflow runs"
        description="Grouped executions across traces. Give a run a friendly name."
      />
      {runs.isLoading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={IconTimeline}
          title="No workflow runs yet"
          description="Pass a workflowRunId via the SDK integration to group traces."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run</TableHead>
              <TableHead>Workflow</TableHead>
              <TableHead className="text-right">Traces</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.workflowRunId}>
                <TableCell>
                  {editing === r.workflowRunId ? (
                    <div className="flex items-center gap-1">
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
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() => {
                          setEditing(r.workflowRunId);
                          setDraft(r.displayName ?? "");
                        }}
                      >
                        <IconPencil />
                      </Button>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {r.workflowName ? (
                    <Badge variant="secondary">{r.workflowName}</Badge>
                  ) : (
                    "—"
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
      )}
    </>
  );
}
