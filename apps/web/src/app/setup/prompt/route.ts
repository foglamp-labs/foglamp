import { SETUP_PROMPT } from "@/lib/setup-prompt";

// GET /setup/prompt — the instrumentation contract as plain text, so the short
// prompt a user pastes can just fetch it. Static route segments win over dynamic
// ones in the App Router, so this never collides with /setup/[planId] (and plan
// ids are uuidv7 anyway).
export function GET(): Response {
	return new Response(SETUP_PROMPT, {
		headers: {
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "public, max-age=0, s-maxage=3600",
		},
	});
}
