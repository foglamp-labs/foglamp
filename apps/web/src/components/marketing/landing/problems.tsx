import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { CostSchematic, QualitySchematic, TraceSchematic } from "./schematics";

const BENEFITS: {
  id: string;
  title: string;
  body: string;
  link: { label: string; href: Route };
  figure: ReactNode;
}[] = [
  {
    id: "costs",
    title: "Know where your money goes",
    body: "Track spending by model, agent, and customer. Get alerted when costs rise.",
    link: { label: "Explore costs", href: "/features/cost-intelligence" },
    figure: <CostSchematic />,
  },
  {
    id: "traces",
    title: "See what happened",
    body: "Follow every model call and tool call, with the prompts and responses in one place.",
    link: { label: "Explore traces", href: "/features/distributed-traces" },
    figure: <TraceSchematic />,
  },
  {
    id: "quality",
    title: "Catch bad answers",
    body: "Check your agents’ responses and get alerted when quality drops.",
    link: { label: "Explore evals", href: "/features/evals" },
    figure: <QualitySchematic />,
  },
];

const TEXT_LINK =
  "inline-flex items-center gap-2 rounded-sm text-sm text-foreground underline decoration-foreground/25 underline-offset-4 transition-colors duration-150 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";

export function Problems() {
  return (
    <div className="mx-auto mt-12 w-full max-w-7xl px-5 sm:mt-20 sm:px-8">
      {BENEFITS.map((benefit) => (
        <section
          key={benefit.id}
          aria-labelledby={`${benefit.id}-heading`}
          className="grid items-center gap-10 border-t border-border/60 py-12 sm:py-16 lg:grid-cols-[1fr_2fr] lg:gap-16"
        >
          <div className="max-w-sm">
            <h2
              id={`${benefit.id}-heading`}
              className="font-display text-3xl font-[450] leading-[1.12] tracking-tight text-balance sm:text-4xl"
            >
              {benefit.title}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground text-pretty">
              {benefit.body}
            </p>
            <Link href={benefit.link.href} className={`mt-6 ${TEXT_LINK}`}>
              {benefit.link.label}
              <span aria-hidden="true">↗</span>
            </Link>
          </div>
          {benefit.figure}
        </section>
      ))}
    </div>
  );
}
