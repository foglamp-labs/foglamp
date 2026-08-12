"use client";

import { RouteHeader } from "@/components/app/route-header";

/** Shared between loading.tsx and alerts-client.tsx — see RouteHeader. */
export function AlertsHeader({ actions }: { actions?: React.ReactNode }) {
	return <RouteHeader href="/alerts" title="Alerts" actions={actions} />;
}
