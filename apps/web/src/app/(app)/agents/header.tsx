"use client";

import { RouteHeader } from "@/components/app/route-header";

/** Shared between loading.tsx and agents-client.tsx — see RouteHeader. */
export function AgentsHeader() {
	return <RouteHeader href="/agents" title="Agents" />;
}
