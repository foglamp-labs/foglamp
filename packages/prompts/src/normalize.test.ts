import { describe, expect, test } from "bun:test";

import { normalizePrompt, promptHash } from "./normalize";

describe("normalizePrompt", () => {
  test("replaces dates, times, ids, emails, urls and numbers with placeholders", () => {
    const n = normalizePrompt(
      [
        "Today is 2026-09-02T10:11:12.345Z (September 2, 2026). The time is 3:05 pm.",
        "User 018f6c2a-1c2b-7d3e-9f4a-0b1c2d3e4f5a <jane@example.com> has 12 open tickets (5.5% churn).",
        "Docs: https://docs.example.com/guide?x=1. Key: sk_live_a1b2c3d4e5f6a7b8c9d0.",
      ].join("\n"),
    );
    expect(n).toBe(
      [
        "Today is {date} ({date}). The time is {time}.",
        "User {id} <{email}> has {n} open tickets ({n} churn).",
        "Docs: {url}. Key: {id}.",
      ].join("\n"),
    );
  });

  test("collapses whitespace so reflowed templates match", () => {
    const a = normalizePrompt("You are   helpful.\n\n\n\n  Be brief.  \n");
    const b = normalizePrompt("You are helpful.\n\nBe brief.");
    expect(a).toBe(b);
  });

  test("leaves ordinary words and short numbers-in-words alone", () => {
    expect(normalizePrompt("Answer in GPT-4 style with markdown.")).toBe(
      "Answer in GPT-{n} style with markdown.",
    );
  });
});

describe("promptHash", () => {
  test("is stable across run-varying values", () => {
    const h1 = promptHash("Today is 2026-09-02. Help user 1234.");
    const h2 = promptHash("Today is 2026-09-03. Help user 99.");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(32);
  });

  test("changes when the wording changes; empty prompt hashes to empty", () => {
    expect(promptHash("Be terse.")).not.toBe(promptHash("Be verbose."));
    expect(promptHash("   ")).toBe("");
  });
});
