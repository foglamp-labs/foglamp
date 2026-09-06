"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

// The candidate figures for the three benefit sections: product-styled mock
// components, each a small piece of the app rebuilt for the page. They render
// charts and depend on browser measurement, so each one loads client-only,
// like the hero demo. The frame reserves space while the chunk loads.

export type Section = "costs" | "traces" | "quality";

export type Variant = {
  id: string;
  label: string;
  component: ComponentType;
};

function Placeholder() {
  return (
    <div className="h-80 w-full rounded-xl bg-sidebar p-2 ring-1 ring-border dark:bg-neutral-900/70">
      <div className="size-full rounded-md squircle:rounded-xl corner-squircle bg-background" />
    </div>
  );
}

type Scenes = typeof import("./figures-scenes");
type Costs = typeof import("./figures-costs");
type Traces = typeof import("./figures-traces");
type Quality = typeof import("./figures-quality");

// Scenes sit on the page with no surface, so they load behind a plain gap.
const scene = (pick: (m: Scenes) => ComponentType) =>
  dynamic(() => import("./figures-scenes").then(pick), {
    ssr: false,
    loading: () => <div className="h-104 w-full" />,
  });
const costs = (pick: (m: Costs) => ComponentType) =>
  dynamic(() => import("./figures-costs").then(pick), {
    ssr: false,
    loading: Placeholder,
  });
const traces = (pick: (m: Traces) => ComponentType) =>
  dynamic(() => import("./figures-traces").then(pick), {
    ssr: false,
    loading: Placeholder,
  });
const quality = (pick: (m: Quality) => ComponentType) =>
  dynamic(() => import("./figures-quality").then(pick), {
    ssr: false,
    loading: Placeholder,
  });

export const FIGURES: Record<Section, Variant[]> = {
  costs: [
    { id: "cards", label: "Cards", component: scene((m) => m.CostCards) },
    { id: "breakdown", label: "Breakdown", component: costs((m) => m.CostBreakdown) },
    { id: "kpis", label: "KPIs", component: costs((m) => m.CostKpis) },
    { id: "dimensions", label: "Dimensions", component: costs((m) => m.CostDimensions) },
    { id: "models", label: "Models", component: costs((m) => m.CostModels) },
    { id: "agents", label: "Agents", component: costs((m) => m.CostAgents) },
    { id: "treemap", label: "Treemap", component: costs((m) => m.CostTreemap) },
    { id: "alert", label: "Alert", component: costs((m) => m.CostAlert) },
    { id: "customers", label: "Customers", component: costs((m) => m.CostCustomers) },
  ],
  traces: [
    { id: "story", label: "Story", component: scene((m) => m.TraceStory) },
    { id: "waterfall", label: "Waterfall", component: traces((m) => m.TraceWaterfall) },
    { id: "timeline", label: "Timeline", component: traces((m) => m.TraceRealTimeline) },
    { id: "list", label: "List", component: traces((m) => m.TraceList) },
    { id: "exchange", label: "Exchange", component: traces((m) => m.TraceExchange) },
    { id: "tool", label: "Tool", component: traces((m) => m.TraceTool) },
    { id: "inspector", label: "Inspector", component: traces((m) => m.TraceInspector) },
    { id: "flow", label: "Flow", component: traces((m) => m.TraceFlow) },
    { id: "session", label: "Session", component: traces((m) => m.TraceSession) },
  ],
  quality: [
    { id: "review", label: "Review", component: scene((m) => m.QualityReview) },
    { id: "scores", label: "Scores", component: quality((m) => m.QualityScores) },
    { id: "evals", label: "Evals", component: quality((m) => m.QualityEvals) },
    { id: "runs", label: "Runs", component: quality((m) => m.QualityRuns) },
    { id: "stats", label: "Stats", component: quality((m) => m.QualityStats) },
    { id: "passrate", label: "Pass rate", component: quality((m) => m.QualityPassRate) },
    { id: "distribution", label: "Distribution", component: quality((m) => m.QualityDistribution) },
    { id: "judge", label: "Judge", component: quality((m) => m.QualityJudge) },
    { id: "versions", label: "Versions", component: quality((m) => m.QualityVersions) },
  ],
};
