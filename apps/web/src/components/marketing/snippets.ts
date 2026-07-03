// Shared marketing copy for the install command, the wrap-the-model snippet, and
// the "copy the prompt" payload. Kept in one place so the hero, the CTA, and the
// SDK product page stay in sync.

export const INSTALL_CMD = "npm i @foglamp/ai-sdk";

// Two meaningful lines: import the wrapper, wrap your model. Every
// generateText / streamText call through it is then traced automatically.
export const INSTALL_CODE = `import { foglamp } from "@foglamp/ai-sdk";
import { openai } from "@ai-sdk/openai";

// Wrap any model — every call is now traced, costed, and scored.
const model = foglamp(openai("gpt-4o"));`;

// Dropped into an AI coding assistant (Cursor, Claude Code, …) to wire Foglamp
// into an existing Vercel AI SDK app in one shot.
export const SETUP_PROMPT = `Add Foglamp observability to this Vercel AI SDK app.

1. Install the SDK: \`npm i @foglamp/ai-sdk\`.
2. Import { foglamp } from "@foglamp/ai-sdk".
3. Wrap every model passed to generateText / streamText with foglamp(...), e.g. foglamp(openai("gpt-4o")).
4. Read FOGLAMP_API_KEY from the environment; add it to .env.example.
5. Don't change any prompts, tools, or business logic. Only instrument the model.`;
