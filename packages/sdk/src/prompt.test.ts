import { describe, expect, test } from "bun:test";

import {
  instructionsText,
  leadingSystemText,
  outputSchemaJson,
  settingsMetadata,
  stepExtras,
  warningsJson,
} from "./prompt";

describe("instructionsText", () => {
  test("string passes through; empty is undefined", () => {
    expect(instructionsText("You are helpful.")).toBe("You are helpful.");
    expect(instructionsText("")).toBeUndefined();
    expect(instructionsText(undefined)).toBeUndefined();
  });

  test("system message and message arrays are joined", () => {
    expect(instructionsText({ role: "system", content: "A" })).toBe("A");
    expect(
      instructionsText([
        { role: "system", content: "A" },
        { role: "system", content: [{ type: "text", text: "B" }] },
      ]),
    ).toBe("A\n\nB");
  });
});

describe("leadingSystemText", () => {
  test("reads only the leading system messages", () => {
    expect(
      leadingSystemText([
        { role: "system", content: "S1" },
        { role: "user", content: "hi" },
        { role: "system", content: "late" },
      ]),
    ).toBe("S1");
    expect(leadingSystemText([{ role: "user", content: "hi" }])).toBeUndefined();
    expect(leadingSystemText("prompt")).toBeUndefined();
  });
});

describe("settingsMetadata", () => {
  test("keeps only known scalar settings, folding maxTokens", () => {
    expect(
      settingsMetadata({
        temperature: 0.2,
        maxTokens: 500,
        topP: 1,
        prompt: "ignored",
        stopSequences: ["END"],
        seed: undefined,
      }),
    ).toEqual({
      temperature: "0.2",
      maxOutputTokens: "500",
      topP: "1",
      stopSequences: '["END"]',
    });
    expect(settingsMetadata(undefined)).toEqual({});
  });
});

describe("outputSchemaJson / warningsJson / stepExtras", () => {
  test("plain JSON schema is serialized", () => {
    const json = outputSchemaJson({ type: "object", properties: { a: { type: "string" } } });
    expect(json).toContain('"type":"object"');
    expect(outputSchemaJson(undefined)).toBeUndefined();
  });

  test("warnings are compacted", () => {
    expect(warningsJson([])).toBeUndefined();
    expect(
      warningsJson([{ type: "unsupported", feature: "topK", details: "ignored", extra: 1 }]),
    ).toBe('[{"type":"unsupported","feature":"topK","details":"ignored"}]');
  });

  test("served model id only when it differs from the requested id", () => {
    expect(stepExtras({ response: { modelId: "gpt-4o" } }, "gpt-4o")).toEqual({});
    expect(stepExtras({ response: { modelId: "gpt-4o-2024-08-06" } }, "gpt-4o")).toEqual({
      servedModelId: "gpt-4o-2024-08-06",
    });
    expect(stepExtras({ warnings: [{ type: "other", message: "x" }] }, "m")).toEqual({
      warnings: '[{"type":"other","message":"x"}]',
    });
  });
});
