import { Button } from "@foglamp/ui/components/button";
import Link from "next/link";

import { CopyPromptButton } from "./copy-prompt-button";

export function CompactCtaSection() {
  return (
    <section className="mx-auto mb-24 w-full max-w-7xl px-5 sm:mb-52 sm:px-8">
      <div className="flex flex-col items-center gap-12 py-14 text-center sm:py-20 sm:pt-0">
        <h2 className="font-display text-5xl font-[450] tracking-tight text-balance sm:text-6xl">
          Your first trace <br />
          is one prompt away.
        </h2>
        {/* Full-size buttons everywhere: stacked on phones, side by side
            from sm up. */}
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <CopyPromptButton className="text-base h-11 px-5" />
          <Button
            render={<Link href="/login" />}
            size="lg"
            className="text-base h-11 px-5"
            variant="secondary"
          >
            Start free
          </Button>
        </div>
      </div>
    </section>
  );
}
