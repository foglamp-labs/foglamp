"use client";

import { RouteHeader } from "@/components/app/route-header";

/** Shared between loading.tsx and settings-client.tsx — see RouteHeader. */
export function ApiKeysHeader({ actions }: { actions?: React.ReactNode }) {
  return (
    <RouteHeader href="/settings" noIcon title="API Keys" actions={actions} />
  );
}
