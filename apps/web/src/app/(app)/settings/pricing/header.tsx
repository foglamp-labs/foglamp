"use client";

import { RouteHeader } from "@/components/app/route-header";

/** Shared between loading.tsx and pricing-client.tsx — see RouteHeader. */
export function PricingHeader({ actions }: { actions?: React.ReactNode }) {
  return (
    <RouteHeader
      href="/settings/pricing"
      noIcon
      title="Custom pricing"
      description="Override per-model prices for this project. Unset dimensions fall back to OpenRouter."
      actions={actions}
    />
  );
}
