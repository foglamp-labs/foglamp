import { Button } from "@foglamp/ui/components/button";
import { IconArrowRight } from "@tabler/icons-react";
import Link from "next/link";

import { CodeBlock } from "../code-block";
import { CopyButton } from "../copy-button";
import { INSTALL_CODE, SETUP_PROMPT } from "../snippets";

// Closing pitch: the whole sell is "two lines." Show the snippet, then the two
// ways in — start free, or hand the prompt to your AI assistant.
export function CtaSection() {
  return (
    <section className="mx-auto w-full max-w-5xl px-5 sm:px-8">
      <div className="relative overflow-hidden rounded-3xl corner-squircle bg-card px-6 py-16 text-center shadow-(--custom-shadow) sm:px-12">
        <h2 className="font-display mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          Two lines to never ship a junk agent again.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-muted-foreground text-pretty">
          Wrap your model. Foglamp traces, costs, and scores every call — no
          prompt changes, no new infra.
        </p>

        <div className="mx-auto mt-8 max-w-xl text-left">
          <CodeBlock code={INSTALL_CODE} filename="model.ts" />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" render={<Link href="/login" />}>
            Start monitoring free
            <IconArrowRight className="size-4" />
          </Button>
          <CopyButton
            value={SETUP_PROMPT}
            idleLabel="Copy the prompt"
            copiedLabel="Prompt copied"
            size="lg"
            variant="outline"
          />
        </div>
      </div>
    </section>
  );
}
