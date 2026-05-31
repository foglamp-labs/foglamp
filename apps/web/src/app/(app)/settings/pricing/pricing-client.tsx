"use client";

import {
  IconCoin,
  IconCoinFilled,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@foglamp/ui/components/dialog";
import { Field, FieldLabel } from "@foglamp/ui/components/field";
import { Input } from "@foglamp/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foglamp/ui/components/table";
import { useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  NoProject,
  PageHeader,
  TableSkeleton,
} from "@/components/app/page-parts";
import { useProject } from "@/components/app/project-context";
import { formatCost, formatDateTime } from "@/lib/format";
import { trpc } from "@/utils/trpc";

export function PricingClient() {
  const { projectId } = useProject();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [modelPattern, setModelPattern] = useState("");
  const [promptPrice, setPromptPrice] = useState("");
  const [completionPrice, setCompletionPrice] = useState("");

  const pricing = useQuery({
    ...trpc.pricing.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const create = useMutation(
    trpc.pricing.create.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.pricing.list.queryKey() });
        setDialogOpen(false);
        setModelPattern("");
        setPromptPrice("");
        setCompletionPrice("");
        toast.success("Pricing override added");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const del = useMutation(
    trpc.pricing.delete.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.pricing.list.queryKey() });
        toast.success("Pricing override removed");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  if (!projectId) {
    return (
      <>
        <PageHeader
          title="Custom pricing"
          description="Override per-model prices for this project. Unset dimensions fall back to OpenRouter."
        />
        <NoProject />
      </>
    );
  }

  const rows = pricing.data ?? [];

  const handleSubmit = () => {
    if (!modelPattern.trim()) return;
    create.mutate({
      projectId,
      modelPattern: modelPattern.trim(),
      promptPrice: promptPrice === "" ? undefined : Number(promptPrice),
      completionPrice:
        completionPrice === "" ? undefined : Number(completionPrice),
    });
  };

  return (
    <>
      <PageHeader
        title="Custom pricing"
        description="Override per-model prices for this project. Unset dimensions fall back to OpenRouter."
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <IconPlus /> Add override
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add pricing override</DialogTitle>
              </DialogHeader>
              <Field>
                <FieldLabel>Model pattern</FieldLabel>
                <Input
                  autoFocus
                  placeholder="openai/gpt-4o-mini"
                  value={modelPattern}
                  onChange={(e) => setModelPattern(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>Prompt price (per token)</FieldLabel>
                <Input
                  type="number"
                  placeholder="0.00000015"
                  value={promptPrice}
                  onChange={(e) => setPromptPrice(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>Completion price (per token)</FieldLabel>
                <Input
                  type="number"
                  placeholder="0.0000006"
                  value={completionPrice}
                  onChange={(e) => setCompletionPrice(e.target.value)}
                />
              </Field>
              <DialogFooter>
                <Button
                  disabled={!modelPattern.trim() || create.isPending}
                  onClick={handleSubmit}
                >
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {pricing.isLoading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={IconCoinFilled}
          title="No custom pricing"
          description="Add an override to price models OpenRouter doesn't cover."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model pattern</TableHead>
              <TableHead>Prompt</TableHead>
              <TableHead>Completion</TableHead>
              <TableHead>Effective</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Badge variant="secondary" className="font-mono">
                    {r.modelPattern}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {formatCost(r.promptPrice)}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {formatCost(r.completionPrice)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(r.effectiveFrom)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={del.isPending}
                    onClick={() => del.mutate({ id: r.id, projectId })}
                  >
                    <IconTrash />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
