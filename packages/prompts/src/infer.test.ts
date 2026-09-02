import { describe, expect, test } from "bun:test";

import { lineDiff } from "./diff";
import { inferVersions, type PromptSample, SLOT_LINE } from "./infer";

const T0 = Date.UTC(2026, 0, 1);
const MIN = 60_000;
const HOUR = 60 * MIN;

function sample(
  hash: string,
  text: string,
  first: number,
  last: number,
  runs = 1,
): PromptSample {
  return {
    hash,
    text,
    firstSeen: new Date(T0 + first),
    lastSeen: new Date(T0 + last),
    runs,
  };
}

const BASE = "You are a support agent.\nAnswer briefly.\nNever guess.";
const EDITED = "You are a support agent.\nAnswer in one paragraph.\nNever guess.";

describe("lineDiff", () => {
  test("marks changed lines", () => {
    expect(lineDiff(BASE, EDITED)).toEqual([
      { type: "same", line: "You are a support agent." },
      { type: "del", line: "Answer briefly." },
      { type: "add", line: "Answer in one paragraph." },
      { type: "same", line: "Never guess." },
    ]);
  });
});

describe("inferVersions", () => {
  test("a single prompt is one version", () => {
    const v = inferVersions([sample("a", BASE, 0, HOUR, 10)]);
    expect(v).toHaveLength(1);
    expect(v[0]?.template).toBe(BASE);
    expect(v[0]?.hashes).toEqual(["a"]);
    expect(v[0]?.slotCount).toBe(0);
  });

  test("a clean edit with enough runs opens a new version", () => {
    const v = inferVersions([
      sample("a", BASE, 0, 5 * HOUR, 100),
      sample("b", EDITED, 6 * HOUR, 7 * HOUR, 3),
    ]);
    expect(v.map((x) => x.hashes)).toEqual([["a"], ["b"]]);
    expect(v[1]?.template).toBe(EDITED);
  });

  test("a clean edit without enough runs is held with the current version", () => {
    const v = inferVersions([
      sample("a", BASE, 0, 5 * HOUR, 100),
      sample("b", EDITED, 6 * HOUR, 6 * HOUR, 1),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0]?.hashes).toEqual(["a", "b"]);
    // The most-run text is the template; the held edit shows as a slot.
    expect(v[0]?.template).toBe(`You are a support agent.\n${SLOT_LINE}\nNever guess.`);
  });

  test("interleaved variation is a slot, not a version", () => {
    const v = inferVersions([
      sample("a", "Hello Ann.\nBe kind.", 0, 10 * HOUR, 50),
      sample("b", "Hello Bob.\nBe kind.", HOUR, 9 * HOUR, 40),
      sample("c", "Hello Cid.\nBe kind.", 2 * HOUR, 8 * HOUR, 5),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0]?.template).toBe(`${SLOT_LINE}\nBe kind.`);
    expect(v[0]?.slotCount).toBe(1);
    expect(v[0]?.runs).toBe(95);
  });

  test("single-use slot values do not become versions", () => {
    const samples: PromptSample[] = [];
    for (let i = 0; i < 40; i++) {
      samples.push(sample(`u${i}`, `User: person${i}\nHelp them.\nBe brief.`, i * MIN, i * MIN, 1));
    }
    // One value recurs a few times — still not an edit.
    samples.push(sample("u40", "User: person40\nHelp them.\nBe brief.", 50 * MIN, 90 * MIN, 4));
    const v = inferVersions(samples);
    expect(v).toHaveLength(1);
    expect(v[0]?.hashes).toHaveLength(41);
    expect(v[0]?.template).toBe(`${SLOT_LINE}\nHelp them.\nBe brief.`);
  });

  test("an edit to a templated prompt is a new version with the slot kept", () => {
    const samples: PromptSample[] = [];
    for (let i = 0; i < 20; i++) {
      samples.push(sample(`u${i}`, `User: person${i}\nHelp them.`, i * MIN, i * MIN, 1));
    }
    for (let i = 0; i < 3; i++) {
      samples.push(
        sample(`v${i}`, `User: other${i}\nHelp them.\nAlways cite sources.`, HOUR + i * MIN, HOUR + i * MIN, 1),
      );
    }
    const v = inferVersions(samples);
    expect(v).toHaveLength(2);
    expect(v[0]?.hashes).toHaveLength(20);
    expect(v[1]?.hashes).toEqual(["v0", "v1", "v2"]);
    expect(v[1]?.template).toBe(`${SLOT_LINE}\nHelp them.\nAlways cite sources.`);
  });

  test("consecutive edits of the same line each open a version", () => {
    const v = inferVersions([
      sample("a", "Be concise.\nHelp.", 0, HOUR, 20),
      sample("b", "Be brief.\nHelp.", 2 * HOUR, 3 * HOUR, 20),
      sample("c", "Be very brief.\nHelp.", 4 * HOUR, 5 * HOUR, 20),
    ]);
    expect(v.map((x) => x.hashes)).toEqual([["a"], ["b"], ["c"]]);
  });

  test("unrelated prompts under one agent are separate versions", () => {
    const v = inferVersions([
      sample("a", "You translate English to French.\nKeep the tone.", 0, 5 * HOUR, 30),
      sample("b", "Summarize the document in three bullets.\nNo preamble.", 0, 5 * HOUR, 30),
    ]);
    expect(v).toHaveLength(2);
  });

  test("a rolling deploy overlap within the grace window still cuts", () => {
    const v = inferVersions([
      sample("a", BASE, 0, 5 * HOUR + 2 * MIN, 100),
      sample("b", EDITED, 5 * HOUR, 7 * HOUR, 30),
    ]);
    expect(v.map((x) => x.hashes)).toEqual([["a"], ["b"]]);
  });
});
