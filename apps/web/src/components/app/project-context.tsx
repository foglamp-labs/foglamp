"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, use, useEffect, useMemo, useState } from "react";

import { trpc } from "@/utils/trpc";

export type Project = {
  id: string;
  name: string;
  slug: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
};

type ProjectContextValue = {
  projects: Project[];
  project: Project | null;
  projectId: string | null;
  setProjectId: (id: string) => void;
  isLoading: boolean;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

const STORAGE_KEY = "watchtower.projectId";

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useQuery(trpc.projects.list.queryOptions());
  const projects = (data ?? []) as Project[];
  const [selected, setSelected] = useState<string | null>(null);

  // Restore last-used project once the list arrives; fall back to the first.
  useEffect(() => {
    if (selected || projects.length === 0) return;
    const stored =
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const exists = stored && projects.some((p) => p.id === stored);
    setSelected(exists ? stored : projects[0]!.id);
  }, [projects, selected]);

  const setProjectId = (id: string) => {
    setSelected(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  };

  const value = useMemo<ProjectContextValue>(() => {
    const project = projects.find((p) => p.id === selected) ?? null;
    return {
      projects,
      project,
      projectId: project?.id ?? null,
      setProjectId,
      isLoading,
    };
  }, [projects, selected, isLoading]);

  return <ProjectContext value={value}>{children}</ProjectContext>;
}

export function useProject(): ProjectContextValue {
  const ctx = use(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}
