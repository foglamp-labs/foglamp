"use client";

import { RouteHeader } from "@/components/app/route-header";

/** Shared between loading.tsx and evals-client.tsx — see RouteHeader. */
export function EvalsHeader({ actions }: { actions?: React.ReactNode }) {
	return <RouteHeader href="/evals" title="Evals" actions={actions} />;
}
