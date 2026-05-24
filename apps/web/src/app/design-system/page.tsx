"use client";

import * as React from "react";

import { cn } from "@watchtower/ui/lib/utils";

import { ComponentsShowcase } from "./components-showcase";
import { DashboardShowcase } from "./dashboard-showcase";
import { ExamplesShowcase } from "./examples-showcase";
import Header from "@/components/header";

type Tab = "components" | "examples" | "dashboard";

export default function DesignSystemPage() {
  const [tab, setTab] = React.useState<Tab>("components");

  return (
    <div className="relative h-full overflow-hidden">
      <div className="h-full overflow-y-auto">
        {tab !== "dashboard" && (
          <>
            <div className="bg-background mx-auto px-8 mb-8">
              <Header />
            </div>
            <h1 className="text-xl font-medium tracking-tight px-8 border-b border-border/60 pb-8">
              Design system
            </h1>
          </>
        )}
        {tab === "components" ? (
          <ComponentsShowcase />
        ) : tab === "examples" ? (
          <ExamplesShowcase />
        ) : (
          <DashboardShowcase />
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
        <div className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-border bg-background/90 p-1 shadow-lg backdrop-blur supports-backdrop-filter:bg-background/70">
          <TabButton
            active={tab === "components"}
            onClick={() => setTab("components")}
          >
            Components
          </TabButton>
          <TabButton
            active={tab === "examples"}
            onClick={() => setTab("examples")}
          >
            Examples
          </TabButton>
          <TabButton
            active={tab === "dashboard"}
            onClick={() => setTab("dashboard")}
          >
            Dashboard
          </TabButton>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer",
        active
          ? "bg-secondary text-primary"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
