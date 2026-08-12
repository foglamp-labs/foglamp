"use client";

import { RouteHeader } from "@/components/app/route-header";

/** Shared between loading.tsx and overview-client.tsx — see RouteHeader. */
export function OverviewHeader() {
  return <RouteHeader href="/overview" title="Overview" withRange />;
}
