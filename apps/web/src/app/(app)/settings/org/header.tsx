"use client";

import { RouteHeader } from "@/components/app/route-header";

/** Shared between loading.tsx and org-settings-client.tsx — see RouteHeader. */
export function OrgSettingsHeader() {
	return <RouteHeader href="/settings/org" noIcon title="Settings" />;
}
