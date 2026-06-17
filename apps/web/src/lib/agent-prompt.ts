// Single source of truth for the "paste this into your coding agent" prompts.
//
// The instrumentation half is identical whether the user is signed in (key
// minted server-side and inlined) or on the landing page (key obtained via
// `npx foglamp login`); only the preamble — how the agent gets a key — differs.
// Keeping the shared body here means the two prompts can't drift.

export const DOCS_URL = "https://docs.foglamp.dev/quickstart";
// Markdown page written for coding agents — the canonical instrumentation
// instructions: version-aware (wrap() for AI SDK v4–v6, fog.integration() for
// v7), plus mapping rules, serverless flush, and verification.
export const AGENT_DOCS_URL = "https://docs.foglamp.dev/ai-instrument.md";
export const LLMS_INDEX_URL = "https://docs.foglamp.dev/llms.txt";

// Steps after the key is in place (docs + mapping rules, then the verification
// hand-off), plus the closing notes. `startStep` numbers them continuously
// after the caller's own preamble steps.
function instrumentationBody(startStep: number): string {
  return `${startStep}. Fetch ${AGENT_DOCS_URL} (written for coding agents) and follow it. First
   check which Vercel AI SDK major this repo uses and take the matching path:
   on v4–v6 wrap the \`ai\` module with \`wrap()\` from \`foglamp/wrap\`; on v7
   attach \`fog.integration(...)\` to my generateText / streamText calls. Either
   way, read my codebase and map each agent to \`agentName\`, any multi-step
   pipeline to a shared \`workflowName\` + \`workflowRunId\`, and any conversation
   thread to a \`sessionId\` — real user conversations only; a batch/cron/pipeline
   run is a workflow, not a session (one-off calls get a \`traceName\`). Don't
   just label everything with one name. Names (\`agentName\`/\`workflowName\`/\`traceName\`)
   must be static string literals — anything dynamic (an id, slug, URL, date)
   goes in \`metadata\`, \`workflowRunId\`, or \`sessionId\`, never in a name.
${startStep + 1}. Do NOT write smoke tests, scripts, or demo endpoints to produce a first
   trace. When you're done, just tell me how to trigger my app's real AI flows
   (which command to run, which page to hit) — I'll run them and watch the
   traces land in Foglamp.

Notes: don't upgrade my AI SDK version to instrument — Foglamp supports v4
through v7, and the docs cover both paths. The SDK is a no-op until
FOGLAMP_API_KEY is set, so it is safe to add in every environment. Full docs
index: ${LLMS_INDEX_URL}`;
}

// Signed-in onboarding: the key is minted server-side and inlined so the prompt
// is truly paste-and-go.
export function buildKeyedPrompt(apiKey: string): string {
  return `Instrument this app with Foglamp tracing (observability for Vercel AI SDK apps).

1. Install the \`foglamp\` package with this repo's package manager (npm/pnpm/yarn/bun).
2. Add to .env:      FOGLAMP_API_KEY=${apiKey}
${instrumentationBody(3)}`;
}

// Pre-signup (landing page): no account yet, so the agent runs the CLI, which
// opens a browser to sign up / sign in and writes FOGLAMP_API_KEY to .env.
export function buildLandingPrompt(): string {
  return `Instrument this app with Foglamp tracing (observability for Vercel AI SDK apps).

1. Run \`npx foglamp login\`. It prints a URL and a code, then waits — show me the
   URL so I can open it, sign up for Foglamp, and approve. On approval it writes
   FOGLAMP_API_KEY to my .env automatically. Don't continue until it succeeds.
2. Install the \`foglamp\` package with this repo's package manager (npm/pnpm/yarn/bun).
${instrumentationBody(3)}`;
}
