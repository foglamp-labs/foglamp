"use client";

import { RouteHeader } from "@/components/app/route-header";

/** Shared between loading.tsx and notifications-client.tsx — see RouteHeader. */
export function NotificationsHeader() {
	return (
		<RouteHeader href="/settings/notifications" noIcon title="Notifications" />
	);
}
