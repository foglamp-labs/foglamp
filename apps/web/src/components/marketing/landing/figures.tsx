"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

// The figures for the three benefit sections: a few real product cards laid
// out on the page. They render the app's charts and timeline and depend on
// browser measurement, so each one loads client-only, like the hero demo,
// behind a gap that reserves its space.

export type Section = "costs" | "traces" | "quality";

export type Variant = {
  id: string;
  label: string;
  component: ComponentType;
};

type Scenes = typeof import("./figures-scenes");
type Costs = typeof import("./figures-costs");
type Traces = typeof import("./figures-traces");

const gap = () => <div className="h-112 w-full" />;

const scene = (pick: (m: Scenes) => ComponentType) =>
  dynamic(() => import("./figures-scenes").then(pick), {
    ssr: false,
    loading: gap,
  });
const costs = (pick: (m: Costs) => ComponentType) =>
  dynamic(() => import("./figures-costs").then(pick), {
    ssr: false,
    loading: gap,
  });
const traces = (pick: (m: Traces) => ComponentType) =>
  dynamic(() => import("./figures-traces").then(pick), {
    ssr: false,
    loading: gap,
  });

export const FIGURES: Record<Section, Variant[]> = {
  costs: [
    { id: "cards", label: "Cards", component: scene((m) => m.CostCards) },
    { id: "stair", label: "Stair", component: costs((m) => m.CostStair) },
    { id: "fan", label: "Fan", component: costs((m) => m.CostFan) },
    { id: "shelf", label: "Shelf", component: costs((m) => m.CostShelf) },
    { id: "total", label: "Total", component: costs((m) => m.CostTotal) },
    { id: "chart", label: "Chart", component: costs((m) => m.CostChart) },
    { id: "alert", label: "Alert", component: costs((m) => m.CostAlert) },
    { id: "table", label: "Table", component: costs((m) => m.CostTable) },
    { id: "tabs", label: "Tabs", component: costs((m) => m.CostTabs) },
    { id: "shares", label: "Shares", component: costs((m) => m.CostShares) },
    { id: "backdrop", label: "Backdrop", component: costs((m) => m.CostBackdrop) },
    { id: "donut", label: "Donut", component: costs((m) => m.CostDonut) },
    { id: "area", label: "Area", component: costs((m) => m.CostArea) },
    { id: "small", label: "Small", component: costs((m) => m.CostSmall) },
    { id: "flow", label: "Flow", component: costs((m) => m.CostFlow) },
  ],
  traces: [
    { id: "story", label: "Story", component: scene((m) => m.TraceStory) },
    { id: "chat", label: "Chat", component: traces((m) => m.TraceChat) },
    { id: "xray", label: "X-ray", component: traces((m) => m.TraceXray) },
    { id: "steps", label: "Steps", component: traces((m) => m.TraceSteps) },
    { id: "inspector", label: "Inspector", component: traces((m) => m.TraceInspector) },
    { id: "graph", label: "Graph", component: traces((m) => m.TraceGraph) },
  ],
  quality: [
    { id: "review", label: "Review", component: scene((m) => m.QualityReview) },
  ],
};
