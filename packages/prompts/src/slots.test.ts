import { describe, expect, test } from "bun:test";

import { SLOT_LINE } from "./infer";
import { slotValues } from "./slots";

describe("slotValues", () => {
  test("reads each slot's text from a member prompt", () => {
    const template = `You help:\n${SLOT_LINE}\nRules:\n- be kind\n${SLOT_LINE}\nNever guess.`;
    const text =
      "You help:\nAda\nRules:\n- be kind\nContext: order 12 is late\nSecond line\nNever guess.";
    expect(slotValues(template, text)).toEqual(["Ada", "Context: order 12 is late\nSecond line"]);
  });

  test("an empty slot reads as an empty string", () => {
    const template = `Intro\n${SLOT_LINE}\nOutro`;
    expect(slotValues(template, "Intro\nOutro")).toEqual([""]);
  });

  test("no slots, no values", () => {
    expect(slotValues("Plain prompt", "Plain prompt")).toEqual([]);
  });

  test("adjacent slots that collapse into one change are unattributable", () => {
    const template = `A\n${SLOT_LINE}\nB\n${SLOT_LINE}\nC`;
    // "B" is gone from this prompt, so both slots and B become one hunk.
    expect(slotValues(template, "A\nx\ny\nC")).toEqual([null, null]);
  });

  test("a slot whose neighbour also changed is unattributable", () => {
    const template = `Hello\n${SLOT_LINE}\nBye`;
    expect(slotValues(template, "Hello\nworld\nBye")).toEqual(["world"]);
    // "Bye" changed too, so the hunk's added lines can't be split.
    expect(slotValues(template, "Hello\nworld\nFarewell")).toEqual([null]);
  });
});
