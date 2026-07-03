import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HUD",
  description:
    "A live heads-up display for your AI agents while you build. See every call as it happens, right in your app.",
};

// Placeholder page so /hud exists for the navbar and footer. Replaced by the
// full marketing page + live playground in the follow-up PR.
export default function HudPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-28 sm:px-8">
      <h1 className="font-display text-4xl font-semibold tracking-tight">
        The Foglamp HUD
      </h1>
      <p className="max-w-md text-lg text-muted-foreground">
        A live heads-up display for your agents while you build. The full page,
        with a playground you can try in the browser, is landing here shortly.
      </p>
      <p className="text-muted-foreground">
        In the meantime, try the live demo at{" "}
        <a
          href="https://hud.foglamp.dev"
          className="text-foreground underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground"
        >
          hud.foglamp.dev
        </a>
        .
      </p>
    </div>
  );
}
