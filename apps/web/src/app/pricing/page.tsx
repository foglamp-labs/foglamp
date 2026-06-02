import { Badge } from "@foglamp/ui/components/badge";
import { Button, buttonVariants } from "@foglamp/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import {
  type Icon,
  IconAdjustmentsFilled,
  IconAffiliateFilled,
  IconBellFilled,
  IconBinocularsFilled,
  IconClipboardCheckFilled,
  IconCoinFilled,
  IconHeadphonesFilled,
  IconMessageCircleFilled,
  IconShieldLockFilled,
  IconSitemapFilled,
  IconSparklesFilled,
  IconStack2Filled,
  IconStarFilled,
  IconTimelineEventFilled,
  IconUserFilled,
} from "@tabler/icons-react";
import type { Metadata, Route } from "next";
import Link from "next/link";

import Header from "@/components/header";

export const metadata: Metadata = {
  title: "Pricing · Foglamp",
  description: "Simple, usage-based pricing for AI observability.",
};

// Marketing pricing. The per-plan limits here mirror PLAN_LIMITS in
// @foglamp/billing — keep them in sync when limits change. (Not imported
// directly: that package is server-only and would pull DB/env into the bundle.)
type Plan = {
  name: string;
  price: string;
  cadence?: string;
  blurb: string;
  // `external` CTAs (e.g. mailto:) render a plain anchor; internal routes use
  // next/link for client-side navigation.
  cta: { label: string; href: string; external?: boolean };
  featured?: boolean;
  badge?: string;
  // Headline metered limits.
  limits: { label: string; value: string }[];
  // Everything that's included at this tier, each with its own filled icon.
  features: { label: string; icon: Icon }[];
};

const PLANS: Plan[] = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    blurb: "Everything you need to instrument your first agent.",
    cta: { label: "Get started", href: "/login" },
    limits: [
      { label: "Spans / month", value: "10,000" },
      { label: "Data retention", value: "3 days" },
      { label: "Projects", value: "1" },
      { label: "Alerts", value: "1" },
      { label: "Evals", value: "5" },
    ],
    features: [
      { label: "Unlimited agents", icon: IconAffiliateFilled },
      { label: "Unlimited workflows", icon: IconSitemapFilled },
      { label: "Unlimited traces & sessions", icon: IconTimelineEventFilled },
      { label: "Unlimited team members", icon: IconUserFilled },
      { label: "Live trace explorer", icon: IconBinocularsFilled },
      { label: "Community support", icon: IconMessageCircleFilled },
    ],
  },
  {
    name: "Pro",
    price: "$49",
    cadence: "per month",
    blurb: "Production-grade observability for growing teams.",
    cta: { label: "Start free trial", href: "/login" },
    featured: true,
    badge: "Most popular",
    limits: [
      { label: "Spans / month", value: "1,000,000" },
      { label: "Data retention", value: "14 days" },
      { label: "Projects", value: "5" },
      { label: "Alerts", value: "10" },
      { label: "Evals", value: "20" },
    ],
    features: [
      { label: "Everything in Free", icon: IconSparklesFilled },
      { label: "Unlimited agents", icon: IconAffiliateFilled },
      { label: "Unlimited workflows", icon: IconSitemapFilled },
      { label: "Unlimited traces & sessions", icon: IconTimelineEventFilled },
      { label: "Custom model pricing", icon: IconCoinFilled },
      { label: "Email & Slack alerting", icon: IconBellFilled },
      { label: "Priority support", icon: IconStarFilled },
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    blurb: "Custom limits and controls for scale and compliance.",
    cta: { label: "Contact sales", href: "mailto:sales@foglamp.dev", external: true },
    limits: [
      { label: "Spans / month", value: "Custom" },
      { label: "Data retention", value: "90+ days" },
      { label: "Projects", value: "Custom" },
      { label: "Alerts", value: "Custom" },
      { label: "Evals", value: "Custom" },
    ],
    features: [
      { label: "Everything in Pro", icon: IconSparklesFilled },
      { label: "Custom per-org limits", icon: IconAdjustmentsFilled },
      { label: "Custom evals, alerts & projects", icon: IconStack2Filled },
      { label: "SSO / SAML", icon: IconShieldLockFilled },
      { label: "Audit logs", icon: IconClipboardCheckFilled },
      { label: "Dedicated support & SLA", icon: IconHeadphonesFilled },
    ],
  },
];

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <Card
      className={cn(
        "flex flex-col",
        plan.featured && "border-primary/60 shadow-lg ring-1 ring-primary/20",
      )}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{plan.name}</CardTitle>
          {plan.badge && <Badge variant="emerald">{plan.badge}</Badge>}
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold tracking-tight">
            {plan.price}
          </span>
          {plan.cadence && (
            <span className="text-sm text-muted-foreground">{plan.cadence}</span>
          )}
        </div>
        <CardDescription className="mt-1">{plan.blurb}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-6">
        {plan.cta.external ? (
          <a
            href={plan.cta.href}
            className={cn(
              buttonVariants({ variant: plan.featured ? "default" : "outline" }),
              "w-full",
            )}
          >
            {plan.cta.label}
          </a>
        ) : (
          <Button
            render={<Link href={plan.cta.href as Route} />}
            className="w-full"
            variant={plan.featured ? "default" : "outline"}
          >
            {plan.cta.label}
          </Button>
        )}

        <div className="flex flex-col gap-2.5">
          {plan.limits.map((l) => (
            <div
              key={l.label}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted-foreground">{l.label}</span>
              <span className="font-medium tabular-nums">{l.value}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2.5 border-t border-border/60 pt-5">
          {plan.features.map((f) => {
            const rollup = f.label.startsWith("Everything in");
            return (
              <div key={f.label} className="flex items-center gap-2.5 text-sm">
                <f.icon
                  className={cn(
                    "size-4 shrink-0",
                    rollup ? "text-muted-foreground" : "text-emerald-500",
                  )}
                />
                <span className={cn(rollup && "font-medium text-muted-foreground")}>
                  {f.label}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PricingPage() {
  return (
    <div className="overflow-y-auto px-8">
      <Header />
      <div className="mx-auto max-w-5xl pb-24">
        <div className="mx-auto mt-20 max-w-2xl text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Pricing that scales with you
          </h1>
          <p className="mt-3 text-muted-foreground">
            Start free, upgrade when you need more. Agents, workflows, traces,
            and teammates are always unlimited — you only meter what you store.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          All plans include unlimited agents, workflows, and traces. Need
          something custom?{" "}
          <a
            href="mailto:sales@foglamp.dev"
            className="font-medium text-foreground underline"
          >
            Talk to us
          </a>
          .
        </p>
      </div>
    </div>
  );
}
