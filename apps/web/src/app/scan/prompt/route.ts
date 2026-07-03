import { SCAN_PROMPT } from "@/lib/scan-prompt";

// GET /scan/prompt — the extractor prompt as plain text, so any agent can
// `curl https://foglamp.dev/scan/prompt` and paste it. ("prompt" can never
// collide with a real scan slug — slugs always carry a random suffix.)
export function GET(): Response {
  return new Response(SCAN_PROMPT, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
