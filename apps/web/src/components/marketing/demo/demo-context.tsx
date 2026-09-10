"use client";

import { createContext, useContext } from "react";

import type { DemoTab } from "./mock-data";

export type DetailView =
	| { type: "trace"; id: string }
	| { type: "eval"; id: string }
	| { type: "agent"; id: string }
	| { type: "workflow"; id: string }
	| { type: "session"; id: string }
	| null;

type DemoContextValue = {
	tab: DemoTab;
	// Ignored until the demo is interactive (see DashboardDemo).
	setTab: (tab: DemoTab) => void;
	// False while the hero's entrance is still running: the nav shows its
	// links but does not take a click.
	interactive: boolean;
	detail: DetailView;
	openDetail: (detail: NonNullable<DetailView>) => void;
	closeDetail: () => void;
};

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({
	value,
	children,
}: {
	value: DemoContextValue;
	children: React.ReactNode;
}) {
	return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
	const ctx = useContext(DemoContext);
	if (!ctx) throw new Error("useDemo must be used within <DemoProvider>");
	return ctx;
}
