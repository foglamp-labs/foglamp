import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@foglamp/ui/components/accordion";

import { JsonLd } from "@/components/marketing/json-ld";
import { DOCS_ORIGIN, GITHUB_URL } from "@/lib/links";

import { AskFoggy } from "./ask-foggy";
import { Button } from "@foglamp/ui/components/button";

// Six questions, hairline rows, and under them a public Foggy that answers
// everything else from the docs. Answers are also emitted as FAQPage JSON-LD
// so search engines can lift them.

type Faq = { q: string; a: string; links?: { label: string; href: string }[] };

const FAQS: Faq[] = [
  {
    q: "What is Foglamp?",
    a: "Observability for AI agents built on the Vercel AI SDK. Every generateText and streamText call becomes a trace with its cost, latency, tokens, prompt, and response. Evals score what your agents say, and alerts watch cost, errors, and pass rates. It is open source and you can run it yourself.",
    links: [{ label: "Read the docs", href: DOCS_ORIGIN }],
  },
  {
    q: "Which AI SDK versions are supported?",
    a: "Versions 4 through 6 use wrap() from foglamp/wrap around your model calls. Version 7 uses the native telemetry integration: registerTelemetry(foglamp()) once at startup. The setup prompt reads your installed version and picks the right path.",
    links: [
      { label: "Instrumentation guide", href: `${DOCS_ORIGIN}/ai-instrument` },
    ],
  },
  {
    q: "Can I self-host it?",
    a: "Yes. Foglamp is Apache 2.0 and ships with a docker compose file that brings up the app, Postgres, and ClickHouse. Nothing in the self-hosted version phones home.",
    links: [
      { label: "Self-hosting guide", href: `${DOCS_ORIGIN}/self-hosting` },
      { label: "GitHub", href: GITHUB_URL },
    ],
  },
  {
    q: "Where are my prompts and responses stored?",
    a: "In ClickHouse, scoped to your project, for as long as your plan retains data: 3 days on Free and 14 days on Pro. If you self-host, all of it stays on your own infrastructure. PII redaction in the SDK is on the roadmap.",
    links: [{ label: "Privacy policy", href: "/privacy" }],
  },
  {
    q: "What does the SDK add to my request latency?",
    a: "Nothing on the request path. Spans are batched in memory and flushed in the background every five seconds. On serverless, call flush() before the function returns. If Foglamp is unreachable, your agent keeps running and the batch is dropped.",
    links: [{ label: "SDK reference", href: `${DOCS_ORIGIN}/sdk` }],
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export function Faq() {
  return (
    <section
      id="faq"
      className="mx-auto mt-32 w-full max-w-7xl px-5 sm:mt-40 sm:px-8"
    >
      <JsonLd data={faqJsonLd} />
      <div className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-20">
        <header>
          <h2 className="font-display text-3xl font-[450] tracking-tight text-balance sm:text-4xl">
            Questions
          </h2>
          <p className="mt-3 max-w-xs text-muted-foreground text-pretty">
            The short ones are here. For anything else, ask Foggy below.
          </p>
        </header>

        <div className="-mt-4">
          <Accordion>
            {FAQS.map((f) => (
              <AccordionItem
                key={f.q}
                value={f.q}
                className="border-b border-border/70 last:border-b"
              >
                <AccordionTrigger className="rounded-none border-0 py-5 text-base cursor-pointer hover:opacity-70 font-normal hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="pb-6 text-[15px] leading-relaxed text-muted-foreground">
                  <p>{f.a}</p>
                  {f.links && (
                    <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-sm mt-5">
                      {f.links.map((l) => (
                        <a
                          key={l.href}
                          href={l.href}
                          {...(l.href.startsWith("http")
                            ? { target: "_blank", rel: "noreferrer" }
                            : {})}
                        >
                          <Button variant="secondary">{l.label}</Button>
                        </a>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <AskFoggy />
        </div>
      </div>
    </section>
  );
}
