// Shared marketing copy for the install command, AI SDK v7's global telemetry
// registration, and the "copy the prompt" payload. Kept in one place so the
// marketing surfaces cannot drift from the published `foglamp` package.

export const INSTALL_CMD = "npm i foglamp";

// AI SDK v7's native, global telemetry path. The version-aware setup prompt and
// docs route v4-v6 apps through `wrap()` from `foglamp/wrap` instead.
export const INSTALL_CODE = `import { registerTelemetry } from "ai";
import { foglamp } from "foglamp";

registerTelemetry(foglamp());`;

// Dropped into an AI coding assistant (Cursor, Claude Code, …) to wire Foglamp
// into an existing Vercel AI SDK app in one shot.
export const SETUP_PROMPT = `Add Foglamp observability to this Vercel AI SDK app.

1. Install the \`foglamp\` package with this repository's package manager.
2. Read https://docs.foglamp.dev/ai-instrument.md and use the path for the installed Vercel AI SDK version: \`wrap()\` from \`foglamp/wrap\` for v4-v6, or the native telemetry integration from \`foglamp\` for v7.
3. Read FOGLAMP_API_KEY from the environment; add the variable name, never its value, to .env.example.
4. Don't change prompts, tools, or business logic. Make the smallest safe instrumentation change.`;
