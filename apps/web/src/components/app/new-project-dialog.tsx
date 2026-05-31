"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@foglamp/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@foglamp/ui/components/dialog";
import { Field, FieldLabel } from "@foglamp/ui/components/field";
import { Input } from "@foglamp/ui/components/input";
import { toast } from "sonner";

import { useProject } from "@/components/app/project-context";
import { trpc } from "@/utils/trpc";

export function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { project, setProjectId } = useProject();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const createProject = useMutation(
    trpc.projects.create.mutationOptions({
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: trpc.projects.list.queryKey() });
        setProjectId(data.id);
        onOpenChange(false);
        setName("");
        setUrl("");
        toast.success("Project created");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input
            autoFocus
            placeholder="My project"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel className="gap-1.5">
            URL
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </FieldLabel>
          <Input
            placeholder="example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button
            disabled={
              !name.trim() || !project?.orgId || createProject.isPending
            }
            onClick={() => {
              if (!name.trim() || !project?.orgId) return;
              createProject.mutate({
                orgId: project.orgId,
                name: name.trim(),
                url: url.trim() || undefined,
              });
            }}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
