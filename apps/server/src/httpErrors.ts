import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

// Fallback error surface for the API. Every route already returns flat
// `{ error: string }` bodies on failure; unmatched paths and uncaught throws
// used to fall through to Hono's plain-text defaults ("404 Not Found"), which
// coding agents can't parse. These handlers keep the same `error` key and add
// `code` + `hint` so an agent that lands here knows what happened and where to
// go next.

const DOCS_URL = "https://docs.foglamp.dev";

export function notFoundResponse(c: Context): Response {
  return c.json(
    {
      error: `No route for ${c.req.method} ${c.req.path}`,
      code: "not_found",
      hint: `Check the API reference at ${DOCS_URL}/api-reference/introduction or the docs index at ${DOCS_URL}/llms.txt.`,
    },
    404,
  );
}

export function errorResponse(err: Error, c: Context): Response {
  // Routes that throw HTTPException chose their status (and sometimes a
  // Response) deliberately — pass their body through untouched when it's
  // already JSON, otherwise wrap the message in the standard shape.
  if (err instanceof HTTPException) {
    const res = err.getResponse();
    if (res.headers.get("content-type")?.includes("json")) return res;
    return c.json(
      { error: err.message || "Request failed", code: "http_error" },
      err.status,
    );
  }
  return c.json(
    {
      error: "Internal server error",
      code: "internal_error",
      hint: "Retry the request; if it keeps failing, report it at https://github.com/foglamp-labs/foglamp/issues.",
    },
    500,
  );
}
