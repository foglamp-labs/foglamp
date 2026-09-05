import { Button } from "@foglamp/ui/components/button";
import Link from "next/link";

import { CopyPromptButton } from "./copy-prompt-button";

export function CompactCtaSection() {
  return (
    <section className="mx-auto mb-12 w-full max-w-7xl px-5 sm:mb-20 sm:px-8">
      <div className="flex flex-col gap-8 border-t border-border/60 py-14 sm:py-20 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
        <div>
          <h2 className="font-display text-3xl font-[450] tracking-tight text-balance sm:text-4xl">
            See your first trace.
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Give your coding agent the setup prompt.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <CopyPromptButton />
          <Button
            render={<Link href="/login" />}
            size="lg"
            className="text-base"
            variant="secondary"
          >
            Start free
          </Button>
        </div>
      </div>
    </section>
  );
}
