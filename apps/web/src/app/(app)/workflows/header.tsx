"use client";

import { RouteHeader } from "@/components/app/route-header";

/** Shared between loading.tsx and workflows-client.tsx — see RouteHeader. */
export function WorkflowsHeader() {
	return <RouteHeader href="/workflows" title="Workflows" />;
}
