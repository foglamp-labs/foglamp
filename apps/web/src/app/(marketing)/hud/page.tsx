import type { Metadata } from "next";

import { HudPlayground } from "@/components/marketing/hud/hud-playground";
import { FilmGrain } from "@/components/marketing/noise-overlay";

export const metadata: Metadata = {
  title: "HUD",
  description:
    "A live heads-up display for your AI agents while you build. Every call, tool step and retry, right in your app. Try it in the browser.",
  alternates: { canonical: "/hud" },
};

const DOCS_URL = "https://docs.foglamp.dev/sdk/hud";

// The HUD page IS the playground: the real FoglampHUD component floats in the
// corner of this page, streaming live mock agents from the always-on demo
// service. The copy explains what you're looking at.
export default function HudPage() {
  return (
    <div className="flex flex-col gap-24 pb-32">
      <section className="relative isolate w-full overflow-x-clip pt-28">
        <FilmGrain id="hud-noise" className="-z-10 opacity-10 mix-blend-screen" />
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
          <p className="text-sm font-medium tracking-wide text-orange-500">
            Foglamp HUD
          </p>
          <h1 className="font-display mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            See your agents while you build.
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted-foreground text-pretty">
            The dashboard watches production. The HUD watches your dev loop:
            every call, tool step and retry, live in the corner of your app.
          </p>

          <div className="mt-10 flex flex-col gap-3">
            <p className="max-w-md text-sm text-muted-foreground text-pretty">
              It is already running on this page, streaming a handful of demo
              agents. Open the pill in the corner, then hit the button:
            </p>
            <HudPlayground />
          </div>

          <div className="mt-20 grid max-w-4xl gap-12 md:grid-cols-3 md:gap-8">
            <div>
              <h3 className="font-display text-lg font-semibold tracking-tight">
                Zero setup
              </h3>
              <p className="mt-2 text-sm text-muted-foreground text-pretty">
                It ships inside the SDK. When your agent wires Foglamp up, the
                HUD comes with it. Nothing to install, nothing to deploy.
              </p>
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold tracking-tight">
                Local by default
              </h3>
              <p className="mt-2 text-sm text-muted-foreground text-pretty">
                Traces stream to the overlay on your machine. No API key, no
                data leaves your laptop. It turns itself off in production.
              </p>
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold tracking-tight">
                The full story
              </h3>
              <p className="mt-2 text-sm text-muted-foreground text-pretty">
                Timeline, tool calls, retries, cost per run. When something
                fails you watch it fail, instead of digging through logs.
              </p>
            </div>
          </div>

          <p className="mt-16 text-sm text-muted-foreground">
            Want the details?{" "}
            <a
              href={DOCS_URL}
              className="text-foreground underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground"
            >
              Read the HUD docs
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
