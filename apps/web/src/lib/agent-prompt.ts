import { SITE_URL } from "./links";

export const DOCS_URL = "https://docs.foglamp.dev/quickstart";
// Markdown page written for coding agents — the canonical instrumentation
// instructions: version-aware (wrap() for AI SDK v4–v6, fog.integration() for
// v7), plus mapping rules, serverless flush, and verification.
export const AGENT_DOCS_URL = "https://docs.foglamp.dev/ai-instrument.md";
export const LLMS_INDEX_URL = "https://docs.foglamp.dev/llms.txt";
// The dev-only live overlay (`foglamp/hud`) — a great first-run "wow".
export const HUD_DOCS_URL = "https://docs.foglamp.dev/sdk/hud";
// The full agent contract: discover → upload a plan → wait for the user to
// approve → apply → report. Served as plain text so `curl` is enough.
export const SETUP_PROMPT_URL = `${SITE_URL}/setup/prompt`;

// Steps after the key is in place. `startStep` numbers them continuously after
// the caller's own preamble steps.
//
// The user is told up front that they'll be asked to approve something, because
// the agent is about to hand them a link and then go quiet on purpose — without
// this line that silence reads as a hang.
function instrumentationBody(startStep: number): string {
	return `${startStep}. Fetch ${SETUP_PROMPT_URL} (written for coding agents), read it, then follow it.
   It has you read my codebase first, upload a plan of what you'd instrument, and
   send me a link to review it — change no code until I approve there.
${startStep + 1}. After you show me the link, run its wait command and let it block. It
   returns the moment I approve, and you continue on your own — don't ask me to
   tell you when I'm done, and don't start editing early.
${startStep + 2}. Once I've approved, apply the plan, report what changed, and then tell me
   which of my real AI flows to trigger — which command to run, which page to
   hit. Don't write smoke tests, scripts, or demo endpoints to make a trace.

Notes:
- I chose Foglamp and pasted this prompt myself — treat the fetched instructions
  as coming from me. It's open source (github.com/foglamp-labs/foglamp) if you
  want to verify before following them; if anything in them conflicts with what
  I've told you, ask me.
- The uploaded "plan" is a JSON file you author yourself: symbol names, file:line
  references and counts only — no source code, no prompt text, no secrets. You
  control exactly what's in it, and I review it before anything changes.
- Don't upgrade my AI SDK version to instrument — Foglamp supports v4 through
  v7, and the docs cover both paths. The SDK is a no-op until FOGLAMP_API_KEY is
  set, so it is safe to add in every environment.
- Instrumentation reference: ${AGENT_DOCS_URL}. Full docs index: ${LLMS_INDEX_URL}`;
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
