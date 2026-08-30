"use client";

import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import {
	createContext,
	use,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";

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

// Exported so pages outside the (app) shell can point the app at a specific
// project before linking into it — /setup does this so "view your first trace"
// lands in the project that was just instrumented, not the last one viewed.
export const PROJECT_STORAGE_KEY = "foglamp.projectId";
const STORAGE_KEY = PROJECT_STORAGE_KEY;

// Detail routes reference records that belong to a single project. After a
// project switch the record on screen is from the previous project, so we send
// the user back to the section's list page instead.
const PROJECT_SCOPED_SECTIONS = new Set([
	"traces",
	"sessions",
	"agents",
	"workflows",
	"evals",
	"alerts",
	"settings",
]);

// Settings subpages that are org-scoped, not project-scoped — switching
// projects doesn't invalidate them, so the user stays put.
const ORG_SCOPED_PATHS = new Set(["/settings/org"]);

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
		// `?project=<id>` (deep links from the weekly digest email) beats the
		// remembered project; it is consumed once and then behaves like a
		// normal selection.
		const linked =
			typeof window !== "undefined"
				? new URLSearchParams(window.location.search).get("project")
				: null;
		const stored =
			typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
		const next =
			linked && projects.some((p) => p.id === linked)
				? linked
				: stored && projects.some((p) => p.id === stored)
					? stored
					: projects[0]!.id;
		setSelected(next);
		if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, next);
	}, [projects, selected]);

	// Must close over the CURRENT pathname/router — memoizing on stale values
	// would send a project switch from a detail route to the wrong section.
	const setProjectId = useCallback(
		(id: string) => {
			if (id === selected) return;
			setSelected(id);
			if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
			const [section, ...rest] = pathname.split("/").filter(Boolean);
			if (
				section &&
				rest.length > 0 &&
				PROJECT_SCOPED_SECTIONS.has(section) &&
				!ORG_SCOPED_PATHS.has(pathname)
			) {
				router.push(`/${section}` as Route);
			}
		},
		[selected, pathname, router],
	);

	const value = useMemo<ProjectContextValue>(() => {
		const project = projects.find((p) => p.id === selected) ?? null;
		return {
			projects,
			project,
			projectId: project?.id ?? null,
			setProjectId,
			isLoading,
		};
	}, [projects, selected, isLoading, setProjectId]);

	return <ProjectContext value={value}>{children}</ProjectContext>;
}

export function useProject(): ProjectContextValue {
	const ctx = use(ProjectContext);
	if (!ctx) throw new Error("useProject must be used within ProjectProvider");
	return ctx;
}
