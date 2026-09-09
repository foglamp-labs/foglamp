"use client";

import { Button } from "@foglamp/ui/components/button";
import type { Route } from "next";
import Link from "next/link";
import type { MouseEvent } from "react";

import { type DemoTab, showInDemo } from "./demo-link";
import { type FeatureId, FeatureList } from "./features";
import { Figure } from "./figure-picker";
import type { Section } from "./figures";

// Each explore button opens its tab in the hero demo. The feature page is
// the fallback, for small screens where the demo is a still.
const BENEFITS: {
  id: Section;
  title: string;
  body: string;
  link: { label: string; tab: DemoTab; href: Route };
  features: FeatureId[];
}[] = [
  {
    id: "costs",
    title: "Know where your money goes",
    body: "Track spending by model, agent, and customer. Get alerted when costs rise.",
    link: {
      label: "Explore costs",
      tab: "overview",
      href: "/features/cost-intelligence",
    },
    features: ["agents", "workflows", "customers", "alerts"],
  },
  {
    id: "traces",
    title: "See what happened",
    body: "Follow every model call and tool call, with the prompts and responses in one place.",
    link: {
      label: "Explore traces",
      tab: "traces",
      href: "/features/distributed-traces",
    },
    features: ["traces", "sessions", "agents"],
  },
  {
    id: "quality",
    title: "Catch bad answers",
    body: "Check your agents’ responses and get alerted when quality drops.",
    link: { label: "Explore evals", tab: "evals", href: "/features/evals" },
    features: ["evals", "alerts"],
  },
];

function explore(tab: DemoTab) {
  return (event: MouseEvent) => {
    if (showInDemo(tab)) event.preventDefault();
  };
}

export function Problems() {
  return (
    <div className="mx-auto mt-12 w-full max-w-7xl px-5 sm:mt-20 sm:px-8">
      {BENEFITS.map((benefit) => (
        <section
          key={benefit.id}
          aria-labelledby={`${benefit.id}-heading`}
          className="grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-[1fr_2fr] lg:gap-16"
        >
          <div className="max-w-sm">
            <FeatureList features={benefit.features} className="mb-5" />
            <h2
              id={`${benefit.id}-heading`}
              className="font-display text-3xl font-[450] leading-[1.12] tracking-tight text-balance sm:text-4xl"
            >
              {benefit.title}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground text-pretty">
              {benefit.body}
            </p>
            <Button
              render={
                <Link
                  href={benefit.link.href}
                  onClick={explore(benefit.link.tab)}
                />
              }
              variant="default"
              size="lg"
              className="mt-6 h-10 px-5 text-[15px] bg-foreground/95 dark:bg-foreground/95"
            >
              {benefit.link.label}
            </Button>
          </div>
          <Figure section={benefit.id} />
        </section>
      ))}
    </div>
  );
}
