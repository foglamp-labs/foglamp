"use client";

import { Button } from "@foglamp/ui/components/button";
import { IconBoltFilled } from "@tabler/icons-react";
import dynamic from "next/dynamic";
import { useState } from "react";

// The real HUD component from the published SDK, pointed at the always-on
// mock-agent demo (Cloud Run). It portals itself to the corner of THIS page,
// so visitors see the actual product overlaying the marketing copy. Client
// only: it opens an EventSource and has no server render.
const FoglampHUD = dynamic(
  () => import("foglamp/hud").then((m) => m.FoglampHUD),
  { ssr: false, loading: () => null }
);

const DEMO_ORIGIN = "https://hud.foglamp.dev";

export function HudPlayground() {
  const [state, setState] = useState<"idle" | "running" | "down">("idle");

  async function runStorm() {
    setState("running");
    try {
      const res = await fetch(`${DEMO_ORIGIN}/api/storm`, {
        method: "POST",
        mode: "cors",
      });
      if (!res.ok) throw new Error(String(res.status));
      setTimeout(() => setState("idle"), 8000);
    } catch {
      setState("down");
    }
  }

  return (
    <>
      <FoglampHUD url={`${DEMO_ORIGIN}/hud/events`} defaultOpen />
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" className="text-base" onClick={runStorm}>
          <IconBoltFilled className="size-4" />
          Run an agent storm
        </Button>
        {state === "running" ? (
          <span className="text-sm text-muted-foreground">
            Storm incoming. Watch the HUD in the corner.
          </span>
        ) : null}
        {state === "down" ? (
          <span className="text-sm text-muted-foreground">
            The live demo is taking a nap. Try again in a minute.
          </span>
        ) : null}
      </div>
    </>
  );
}
