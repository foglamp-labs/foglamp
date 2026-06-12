"use client";

import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { createContext, use, useEffect, useMemo, useState } from "react";

import { trpc } from "@/utils/trpc";

export type Project = {
  id: string;
  name: string;
  slug: string;
  url: string | null;
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

const STORAGE_KEY = "foglamp.projectId";

// Detail routes reference records that belong to a single project. After a
// project switch the record on screen is from the previous project, so we send
// the user back to the section's list page instead.
const PROJECT_SCOPED_SECTIONS = new Set([
  "traces",
  "sessions",
  "agents",
  "workflows",
  "evals",
]);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data, isLoading } = useQuery(trpc.projects.list.queryOptions());
  const projects = (data ?? []) as Project[];
  const [selected, setSelected] = useState<string | null>(null);

  // Restore last-used project once the list arrives; fall back to the first.
  // Also re-runs when the selection goes stale (e.g. the active project was
  // just deleted and dropped out of the refetched list) so the user lands on
  // another project instead of a blank app.
  useEffect(() => {
    if (projects.length === 0) return;
    if (selected && projects.some((p) => p.id === selected)) return;
    const stored =
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const next =
      stored && projects.some((p) => p.id === stored)
        ? stored
        : projects[0]!.id;
    setSelected(next);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, next);
  }, [projects, selected]);

  const setProjectId = (id: string) => {
    if (id === selected) return;
    setSelected(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
    const [section, ...rest] = pathname.split("/").filter(Boolean);
    if (section && rest.length > 0 && PROJECT_SCOPED_SECTIONS.has(section)) {
      router.push(`/${section}` as Route);
    }
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
