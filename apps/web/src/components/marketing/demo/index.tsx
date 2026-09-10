"use client";

import { useEffect, useRef, useState } from "react";

import { registerDemo } from "@/components/marketing/landing/demo-link";
import { DemoProvider, type DetailView } from "./demo-context";
import { DemoShell } from "./demo-shell";
import { DemoSidebar } from "./demo-sidebar";
import type { DemoTab } from "./mock-data";

import { AgentDetail } from "./detail/agent-detail";
import { EvalDetail } from "./detail/eval-detail";
import { SessionDetail } from "./detail/session-detail";
import { TraceDetail } from "./detail/trace-detail";
import { WorkflowDetail } from "./detail/workflow-detail";

import { AgentsTab } from "./tabs/agents-tab";
import { AlertsTab } from "./tabs/alerts-tab";
import { EvalsTab } from "./tabs/evals-tab";
import { OverviewTab } from "./tabs/overview-tab";
import { SessionsTab } from "./tabs/sessions-tab";
import { TracesTab } from "./tabs/traces-tab";
import { WorkflowsTab } from "./tabs/workflows-tab";

// The self-contained, faithful dashboard replica that anchors the landing page.
// Owns the only two pieces of state the demo needs — which tab is active and
// which (if any) detail row is open — and hands them to every child through
// DemoProvider. No tRPC, no routing, no auth: tabs read static mock data and
// rows open detail views via openDetail/closeDetail. Lazy-loaded (ssr:false)
// from the landing page since the charts inside are SSR-fragile. The benefit
// sections further down can also ask it to show a tab, through demo-link.

// Room above the demo when scrolling to it: the fixed navbar plus a margin.
const SCROLL_OFFSET = 96;

function TabView({ tab }: { tab: DemoTab }) {
	switch (tab) {
		case "overview":
			return <OverviewTab />;
		case "workflows":
			return <WorkflowsTab />;
		case "agents":
			return <AgentsTab />;
		case "sessions":
			return <SessionsTab />;
		case "traces":
			return <TracesTab />;
		case "evals":
			return <EvalsTab />;
		case "alerts":
			return <AlertsTab />;
	}
}

function DetailViewSwitch({ detail }: { detail: NonNullable<DetailView> }) {
	switch (detail.type) {
		case "trace":
			return <TraceDetail traceId={detail.id} />;
		case "eval":
			return <EvalDetail evalId={detail.id} />;
		case "agent":
			return <AgentDetail agentName={detail.id} />;
		case "workflow":
			return <WorkflowDetail workflowName={detail.id} />;
		case "session":
			return <SessionDetail sessionId={detail.id} />;
	}
}

export function DashboardDemo({
	interactive = true,
	onSettled,
}: {
	// False while the hero's entrance (the drops, then the swing flat) is
	// still running. Until it flips, tab switches are ignored and the
	// content takes no clicks: a switch or a detail view remounts the
	// content's pieces, which would land out of step with the entrance.
	interactive?: boolean;
	// Fires once the last surface has dropped into place (see DemoShell).
	onSettled?: () => void;
} = {}) {
	const [tab, setTabState] = useState<DemoTab>("traces");
	const [detail, setDetail] = useState<DetailView>(null);
	// Sits at the top of the inset surface, the page's scroll target when a
	// section asks the demo to show a tab.
	const anchorRef = useRef<HTMLSpanElement>(null);

	// Switching tabs always drops any open detail view — you land on the list.
	// Not while the entrance runs, though.
	const setTab = (next: DemoTab) => {
		if (!interactive) return;
		setDetail(null);
		setTabState(next);
	};
	// The registered handler below outlives a render, so it reads the
	// latest value through a ref rather than a stale closure.
	const setTabRef = useRef(setTab);
	setTabRef.current = setTab;

	useEffect(
		() =>
			registerDemo((next) => {
				const anchor = anchorRef.current;
				// No box means the frame is display:none (small screens).
				if (!anchor || anchor.getClientRects().length === 0) return false;
				setTabRef.current(next);
				window.scrollTo({
					top: window.scrollY + anchor.getBoundingClientRect().top - SCROLL_OFFSET,
					behavior: "smooth",
				});
				return true;
			}),
		[],
	);

	return (
		<DemoProvider
			value={{
				tab,
				setTab,
				interactive,
				detail,
				openDetail: (d) => setDetail(d),
				closeDetail: () => setDetail(null),
			}}
		>
			<DemoShell
				sidebar={<DemoSidebar />}
				interactive={interactive}
				onSettled={onSettled}
			>
				<span
					ref={anchorRef}
					aria-hidden
					className="pointer-events-none absolute inset-x-0 top-0 h-px"
				/>
				{detail ? <DetailViewSwitch detail={detail} /> : <TabView tab={tab} />}
			</DemoShell>
		</DemoProvider>
	);
}

export default DashboardDemo;
