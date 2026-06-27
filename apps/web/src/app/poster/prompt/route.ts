import { POSTER_PROMPT } from "@/lib/poster-prompt";

// GET /poster/prompt — the extractor prompt as plain text, so any agent can
// `curl https://foglamp.dev/poster/prompt` and paste it. ("prompt" can never
// collide with a real poster slug — slugs always carry a random suffix.)
export function GET(): Response {
  return new Response(POSTER_PROMPT, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
