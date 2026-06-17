"use client";

import { useState } from "react";

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
// from the landing page since the charts inside are SSR-fragile.

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

export function DashboardDemo() {
  const [tab, setTabState] = useState<DemoTab>("overview");
  const [detail, setDetail] = useState<DetailView>(null);

  // Switching tabs always drops any open detail view — you land on the list.
  const setTab = (next: DemoTab) => {
    setDetail(null);
    setTabState(next);
  };

  return (
    <DemoProvider
      value={{
        tab,
        setTab,
        detail,
        openDetail: (d) => setDetail(d),
        closeDetail: () => setDetail(null),
      }}
    >
      <DemoShell sidebar={<DemoSidebar />}>
        {detail ? <DetailViewSwitch detail={detail} /> : <TabView tab={tab} />}
      </DemoShell>
    </DemoProvider>
  );
}

export default DashboardDemo;
