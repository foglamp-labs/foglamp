import type { Metadata } from "next";

import { Logo } from "@/components/marketing/logo";
import { POSTER_PROMPT } from "@/lib/poster-prompt";
import { CopyButton } from "./CopyButton";

export const metadata: Metadata = {
  title: "Codebase Poster · Foglamp",
  description:
    "Generate a beautiful, shareable map of how your codebase works and how it uses AI — from your own coding agent.",
};

const STEPS = [
  {
    n: 1,
    title: "Paste the prompt into your coding agent",
    body: "Claude Code, Cursor, or anything that can run shell commands. Copy it below, or have your agent fetch it from foglamp.dev/poster/prompt.",
  },
  {
    n: 2,
    title: "It analyzes your repo",
    body: "Your agent maps the AI in your codebase — models, tools, integrations, agents, crons, and the main flows — and asks before uploading a high-level summary (no code or secrets).",
  },
  {
    n: 3,
    title: "Share the link",
    body: "You get a foglamp.dev/poster link that unfurls on socials, plus a downloadable image. Re-run anytime to refresh the same URL.",
  },
];

export default function PosterLandingPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col gap-16 px-6 py-16 sm:py-24">
      <header className="flex flex-col gap-6">
        <Logo />
        <div className="flex flex-col gap-4">
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Map your codebase.{" "}
            <span className="text-orange-500">Share it.</span>
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Generate a beautiful, shareable poster of how your codebase works and how it
            uses AI — straight from your own coding agent. No install, no account.
          </p>
        </div>
      </header>

      <ol className="flex flex-col gap-6">
        {STEPS.map((s) => (
          <li key={s.n} className="flex gap-4">
            <span className="flex size-8 flex-none items-center justify-center rounded-full bg-secondary font-display text-sm font-semibold text-orange-500">
              {s.n}
            </span>
            <div className="flex flex-col gap-1 pt-0.5">
              <h2 className="font-medium">{s.title}</h2>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-lg font-semibold tracking-tight">The prompt</h2>
          <CopyButton text={POSTER_PROMPT} />
        </div>
        <pre className="max-h-80 overflow-auto rounded-xl border bg-muted/40 p-5 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {POSTER_PROMPT}
        </pre>
        <p className="text-sm text-muted-foreground">
          Prefer the terminal? Your agent can grab it directly:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
            curl foglamp.dev/poster/prompt
          </code>
        </p>
      </section>

      <footer className="mt-auto border-t pt-6 text-sm text-muted-foreground">
        Built by Foglamp — observability for the Vercel AI SDK.
      </footer>
    </main>
  );
}
