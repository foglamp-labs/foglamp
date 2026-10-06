"use client";

import { IconAlertTriangleFilled } from "@tabler/icons-react";

// Shutdown notice for the hosted deployment only. Self-hosts point
// NEXT_PUBLIC_SERVER_URL elsewhere and never see it.
const HOSTED_SERVER_URL = "https://api.foglamp.dev";
const SHUTDOWN_DATE = "October 18, 2026";

export function SunsetCard() {
  if (process.env.NEXT_PUBLIC_SERVER_URL !== HOSTED_SERVER_URL) return null;

  return (
    <div className="mb-1 flex flex-col gap-1.5 rounded-3xl squircle:rounded-[40px] corner-squircle border border-amber-500/10 bg-amber-500/10 p-3 px-3.5 text-xs text-amber-700 dark:text-amber-400">
      <div className="flex items-center gap-1.5">
        <IconAlertTriangleFilled className="size-3" />
        <span className="font-medium text-[13px]">Foglamp is shutting down</span>
      </div>
      <p>
        The hosted service stops on {SHUTDOWN_DATE} and all data will be
        deleted. Want an export?{" "}
        <a href="mailto:gustavo@foglamp.dev" className="underline">
          Email us
        </a>
        .
      </p>
    </div>
  );
}
