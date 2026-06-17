import { Badge } from "@foglamp/ui/components/badge";
import { Button, buttonVariants } from "@foglamp/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import {
  type Icon,
  IconAdjustmentsFilled,
  IconAffiliateFilled,
  IconAlertTriangleFilled,
  IconBellFilled,
  IconBinocularsFilled,
  IconBoltFilled,
  IconBriefcaseFilled,
  IconClipboardCheckFilled,
  IconClockFilled,
  IconFlameFilled,
  IconFolderFilled,
  IconGaugeFilled,
  IconGhostFilled,
  IconHeadphonesFilled,
  IconMessageCircleFilled,
  IconSeedlingFilled,
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

import { CtaSection } from "@/components/marketing/landing/cta";
import { FeaturedBeam } from "./featured-beam";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple, usage-based pricing for AI observability.",
};

// Marketing pricing. The per-plan limits here mirror PLAN_LIMITS in
// @foglamp/billing — keep them in sync when limits change. (Not imported
// directly: that package is server-only and would pull DB/env into the bundle.)
type Plan = {
  name: string;
  // Filled icon shown next to the plan name in the card header.
  icon: Icon;
  // Icon color, drawn from the brand mark's three circles (lead → blue →
  // orange). Written as a literal class so Tailwind's scanner emits it.
  accent: string;
  price: string;
  cadence?: string;
  blurb: string;
  // `external` CTAs (e.g. mailto:) render a plain anchor; internal routes use
  // next/link for client-side navigation.
  cta: { label: string; href: string; external?: boolean };
  featured?: boolean;
  badge?: string;
  // Headline metered limits. Their icon + color come from LIMIT_META below.
  limits: { label: string; value: string }[];
  // Everything that's included at this tier, each with its own filled icon.
  features: { label: string; icon?: Icon }[];
};

// Icon + color for each metered limit row, keyed by label. Colors mirror the
// Usage tab palette in org settings (see org-settings-client.tsx); retention has
// no Usage-tab equivalent, so it gets its own violet.
const LIMIT_META: Record<string, { icon: Icon; iconClassName: string }> = {
  "Spans / month": {
    icon: IconTimelineEventFilled,
    iconClassName: "text-sky-500",
  },
  "Data retention": { icon: IconClockFilled, iconClassName: "text-violet-500" },
  Projects: { icon: IconFolderFilled, iconClassName: "text-emerald-500" },
  Alerts: { icon: IconAlertTriangleFilled, iconClassName: "text-yellow-500" },
  Evals: { icon: IconGaugeFilled, iconClassName: "text-fuchsia-500" },
};

const PLANS: Plan[] = [
  {
    name: "Free",
    icon: IconSeedlingFilled,
    // Brand blue circle.
    accent: "text-[#0090FD]",
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
      { label: "Unlimited agents", icon: IconGhostFilled },
      { label: "Unlimited workflows", icon: IconSitemapFilled },
      { label: "Unlimited traces & sessions", icon: IconTimelineEventFilled },
      { label: "Unlimited team members", icon: IconUserFilled },
    ],
  },
  {
    name: "Pro",
    icon: IconBoltFilled,
    // Brand orange circle.
    accent: "text-[#FF5513]",
    price: "$49",
    cadence: "per month",
    blurb: "Production-grade observability for growing teams.",
    cta: { label: "Start free trial", href: "/login" },
    featured: true,
    badge: "Popular",
    limits: [
      { label: "Spans / month", value: "1,000,000" },
      { label: "Data retention", value: "14 days" },
      { label: "Projects", value: "5" },
      { label: "Alerts", value: "10" },
      { label: "Evals", value: "20" },
    ],
    features: [
      { label: "Everything in Free +" },
      { label: "Foggy AI assistant", icon: IconSparklesFilled },
      { label: "Email & Slack alerting", icon: IconBellFilled },
      { label: "Priority support", icon: IconStarFilled },
    ],
  },
  {
    name: "Enterprise",
    icon: IconBriefcaseFilled,
    // Brand lead circle (theme-aware #1e1e1e / #EEE).
    accent: "text-[#1e1e1e] dark:text-[#EEE]",
    price: "Custom",
    blurb: "Custom limits and controls for scale.",
    cta: {
      label: "Contact sales",
      href: "mailto:sales@foglamp.dev",
      external: true,
    },
    limits: [
      { label: "Spans / month", value: "Custom" },
      { label: "Data retention", value: "90+ days" },
      { label: "Projects", value: "Custom" },
      { label: "Alerts", value: "Custom" },
      { label: "Evals", value: "Custom" },
    ],
    features: [
      { label: "Everything in Pro +" },
      { label: "SSO / SAML", icon: IconShieldLockFilled },
      { label: "Audit logs", icon: IconClipboardCheckFilled },
      { label: "Dedicated support & SLA", icon: IconHeadphonesFilled },
    ],
  },
];

function PlanCard({ plan }: { plan: Plan }) {
  const card = (
    <Card
      className={cn(
        // Plain round corners (override the Card's default squircle): the
        // featured card's BorderBeam can only draw circular-arc corners, so all
        // three cards round off to match it and keep the comparison row uniform.
        "flex flex-col corner-round! bg-card/90"
      )}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <plan.icon className={cn("size-4", plan.accent)} />
            <CardTitle className="text-base">{plan.name}</CardTitle>
          </div>
          {plan.badge && (
            <Badge variant="orange">
              <IconFlameFilled />
              {plan.badge}
            </Badge>
          )}
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold tracking-tight">
            {plan.price}
          </span>
          {plan.cadence && (
            <span className="text-sm text-muted-foreground">
              {plan.cadence}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-6">
        <div className="flex flex-col gap-2.5">
          {plan.limits.map((l) => {
            const meta = LIMIT_META[l.label];
            return (
              <div
                key={l.label}
                className="flex items-center justify-between text-sm"
              >
                <span className="flex items-center gap-2.5 text-muted-foreground">
                  {meta && (
                    <meta.icon
                      className={cn("size-4 shrink-0", meta.iconClassName)}
                    />
                  )}
                  {l.label}
                </span>
                <span className="font-medium tabular-nums">{l.value}</span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2.5 border-t border-border/60 pt-5">
          {plan.features.map((f) => {
            const rollup = f.label.startsWith("Everything in");
            return (
              <div key={f.label} className="flex items-center gap-2.5 text-sm">
                {f.icon && (
                  <f.icon className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span
                  className={cn(rollup && "font-medium text-muted-foreground")}
                >
                  {f.label}
                </span>
              </div>
            );
          })}
        </div>

        {plan.cta.external ? (
          <a
            href={plan.cta.href}
            className={cn(
              buttonVariants({
                variant: plan.featured ? "default" : "secondary",
              }),
              "w-full"
            )}
          >
            {plan.cta.label}
          </a>
        ) : (
          <Button
            render={<Link href={plan.cta.href as Route} />}
            className="w-full"
            variant={plan.featured ? "default" : "secondary"}
          >
            {plan.cta.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );

  // Only the featured (Pro) card gets the animated beam. BorderBeam auto-detects
  // the Card's border-radius and overlays the effect without affecting layout.
  if (!plan.featured) return card;
  return <FeaturedBeam>{card}</FeaturedBeam>;
}

export default function PricingPage() {
  return (
    <div className="flex flex-col gap-36 pb-42">
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
        <div className="mt-32 max-w-2xl">
          <h1 className="font-display text-4xl font-semibold tracking-tight">
            Pricing
          </h1>
          <p className="mt-3 text-muted-foreground text-pretty">
            Start free, upgrade when you need more.
          </p>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => (
            <PlanCard key={plan.name} plan={plan} />
          ))}
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          All plans include unlimited{" "}
          <span className="font-medium text-foreground">
            <IconGhostFilled className="mr-1 inline-block size-4 align-[-0.2em] text-foreground" />
            agents
          </span>
          ,{" "}
          <span className="font-medium text-foreground">
            <IconSitemapFilled className="mr-1 inline-block size-4 align-[-0.2em] text-foreground" />
            workflows
          </span>
          , and{" "}
          <span className="font-medium text-foreground">
            <IconAffiliateFilled className="mr-1 inline-block size-4 align-[-0.2em] text-foreground" />
            traces
          </span>
          . Need something custom?{" "}
          <a href="mailto:sales@foglamp.dev">
            <Button variant="link" className="px-0">
              Talk to us
            </Button>
          </a>
          .
        </p>
      </div>

      <CtaSection />
    </div>
  );
}
