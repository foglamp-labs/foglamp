import {
  type Icon,
  IconAffiliate,
  IconAffiliateFilled,
  IconAlertTriangle,
  IconAlertTriangleFilled,
  IconCode,
  IconCoin,
  IconCoinFilled,
  IconGauge,
  IconGaugeFilled,
  IconGhost,
  IconGhostFilled,
  IconReportMoney,
} from "@tabler/icons-react";
import type { Route } from "next";

export type Product = {
  slug: string;
  href: Route;
  label: string;
  /** One-liner used in the navbar dropdown + bento card. */
  tagline: string;
  /** Outline icon (rest) + filled icon (active/emphasis). */
  icon: Icon;
  activeIcon: Icon;
  /** Colored squircle chip classes, mirroring the dashboard sidebar (nav.ts). */
  chipClassName: string;
  /** Tailwind color family used for accents on the product page. */
  accent: string;
};

// Note: Cost intelligence and SDK have no dashboard sidebar entry, so they get
// fresh Tabler glyphs (IconReportMoney / IconCode). The other four reuse the
// exact icons + chip treatment from components/app/nav.ts so the marketing site
// and the product feel like one system.
export const products: Product[] = [
  {
    slug: "cost-intelligence",
    href: "/features/cost-intelligence",
    label: "Cost intelligence",
    tagline: "Know exactly what every call costs — by model, agent, customer.",
    icon: IconCoin,
    activeIcon: IconCoinFilled,
    chipClassName:
      "bg-emerald-100 dark:bg-emerald-950 rounded-xl p-0.5 corner-squircle text-emerald-500 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.14),0_2px_6px_-2px_rgba(16,185,129,0.25)] dark:shadow-(--custom-shadow)",
    accent: "emerald",
  },
  {
    slug: "evals",
    href: "/features/evals",
    label: "Evals",
    tagline: "Score production traffic with code checks and LLM judges.",
    icon: IconGauge,
    activeIcon: IconGaugeFilled,
    chipClassName:
      "bg-fuchsia-100 dark:bg-fuchsia-950 rounded-xl p-0.5 corner-squircle text-fuchsia-500 shadow-[inset_0_0_0_1px_rgba(217,70,239,0.14),0_2px_6px_-2px_rgba(217,70,239,0.25)] dark:shadow-(--custom-shadow)",
    accent: "fuchsia",
  },
  {
    slug: "alerts",
    href: "/features/alerts",
    label: "Alerts",
    tagline: "Threshold rules on cost, latency, and error rate.",
    icon: IconAlertTriangle,
    activeIcon: IconAlertTriangleFilled,
    chipClassName:
      "bg-yellow-100 dark:bg-yellow-950 rounded-xl p-0.5 corner-squircle text-yellow-500 shadow-[inset_0_0_0_1px_rgba(234,179,8,0.14),0_2px_6px_-2px_rgba(234,179,8,0.25)] dark:shadow-(--custom-shadow)",
    accent: "yellow",
  },
  {
    slug: "agents",
    href: "/features/agents",
    label: "Agents",
    tagline: "Per-agent spans, latency, and spend - with the full call flow.",
    icon: IconGhost,
    activeIcon: IconGhostFilled,
    chipClassName:
      "bg-orange-100 dark:bg-orange-950 rounded-xl p-0.5 corner-squircle text-orange-500 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.14),0_2px_6px_-2px_rgba(249,115,22,0.25)] dark:shadow-(--custom-shadow)",
    accent: "orange",
  },
  {
    slug: "distributed-traces",
    href: "/features/distributed-traces",
    label: "Distributed traces",
    tagline:
      "Waterfall every run, with the exact prompt and response per span.",
    icon: IconAffiliate,
    activeIcon: IconAffiliateFilled,
    chipClassName:
      "bg-[#ede0d4] dark:bg-[#2e211b] rounded-xl p-0.5 corner-squircle text-[#8b5e34] dark:text-[#c9a888] shadow-[inset_0_0_0_1px_rgba(139,94,52,0.14),0_2px_6px_-2px_rgba(139,94,52,0.25)] dark:shadow-(--custom-shadow)",
    accent: "stone",
  },
  {
    slug: "sdk",
    href: "/features/sdk",
    label: "SDK",
    tagline: "Two lines instruments every generateText / streamText call.",
    icon: IconCode,
    activeIcon: IconCode,
    chipClassName:
      "bg-sky-100 dark:bg-sky-950 rounded-xl p-0.5 corner-squircle text-sky-500 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.14),0_2px_6px_-2px_rgba(14,165,233,0.25)] dark:shadow-(--custom-shadow)",
    accent: "sky",
  },
];

export function productBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}
