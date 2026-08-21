import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { errorResponse, notFoundResponse } from "./httpErrors";

function makeApp() {
  const app = new Hono();
  app.get("/ok", (c) => c.text("ok"));
  app.get("/boom", () => {
    throw new Error("kaboom");
  });
  app.get("/teapot", () => {
    throw new HTTPException(418, { message: "short and stout" });
  });
  app.notFound(notFoundResponse);
  app.onError(errorResponse);
  return app;
}

describe("notFoundResponse", () => {
  test("unmatched routes return structured JSON with a 404", async () => {
    const res = await makeApp().request("/nope/nothing-here");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { error: string; code: string; hint?: string };
    expect(body.code).toBe("not_found");
    expect(body.error).toContain("GET /nope/nothing-here");
    expect(body.hint).toContain("docs.foglamp.dev");
  });

  test("matched routes are untouched", async () => {
    const res = await makeApp().request("/ok");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});

describe("errorResponse", () => {
  test("uncaught errors become a JSON 500 without leaking the message", async () => {
    const res = await makeApp().request("/boom");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; code: string; hint?: string };
    expect(body.code).toBe("internal_error");
    expect(JSON.stringify(body)).not.toContain("kaboom");
    expect(body.hint).toBeString();
  });

  test("HTTPException keeps its status and message as JSON", async () => {
    const res = await makeApp().request("/teapot");
    expect(res.status).toBe(418);
    const body = (await res.json()) as { error: string; code: string; hint?: string };
    expect(body.error).toBe("short and stout");
    expect(body.code).toBe("http_error");
  });
});
