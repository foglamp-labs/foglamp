import { describe, expect, test } from "bun:test";

import { splitTemplate, truncateExtracted } from "./judge";
import type { ExtractedContext } from "./types";

const MARKER = "characters truncated";

describe("truncateExtracted", () => {
  test("is a no-op under budget and returns the same object", () => {
    const e: ExtractedContext = { input: "a".repeat(100), output: "b".repeat(100) };
    const r = truncateExtracted(e, 200_000);
    expect(r.truncated).toBe(false);
    expect(r.extracted).toBe(e); // same reference, not a rebuilt copy
  });

  test("trims the graded output first, leaving criteria intact", () => {
    const e: ExtractedContext = {
      input: "i".repeat(1_000),
      output: "o".repeat(50_000),
      context: "c".repeat(1_000),
      reference: "r".repeat(1_000),
    };
    const r = truncateExtracted(e, 40_000); // overflow 13k < output's cuttable

    expect(r.truncated).toBe(true);
    // Output absorbed the whole cut: shorter, head+tail, with a visible marker.
    expect(r.extracted.output).toContain(MARKER);
    expect(r.extracted.output.length).toBeLessThan(50_000);
    expect(r.extracted.output.startsWith("o")).toBe(true);
    expect(r.extracted.output.endsWith("o")).toBe(true);
    // Everything higher-priority is byte-for-byte untouched.
    expect(r.extracted.input).toBe("i".repeat(1_000));
    expect(r.extracted.context).toBe("c".repeat(1_000));
    expect(r.extracted.reference).toBe("r".repeat(1_000));
  });

  test("spills into input only once output bottoms out at the floor", () => {
    const e: ExtractedContext = {
      input: "i".repeat(50_000),
      output: "o".repeat(2_000),
    };
    const r = truncateExtracted(e, 5_000); // overflow far exceeds output's cuttable

    expect(r.truncated).toBe(true);
    // Output was cut to its ~800-char floor (plus the short marker)…
    expect(r.extracted.output).toContain(MARKER);
    expect(r.extracted.output.length).toBeLessThan(900);
    // …then the remaining overflow came out of input.
    expect(r.extracted.input).toContain(MARKER);
    expect(r.extracted.input.length).toBeLessThan(50_000);
  });

  test("never reports truncation it didn't perform", () => {
    // Exactly at budget is not over budget.
    const e: ExtractedContext = { input: "a".repeat(500), output: "b".repeat(500) };
    expect(truncateExtracted(e, 1_000).truncated).toBe(false);
  });
});

describe("splitTemplate", () => {
	test("separates rubric, dropped captions, and fields", () => {
		expect(
			splitTemplate(
				"Rate how helpful the RESPONSE is.\n\nREQUEST:\n{input}\n\nRESPONSE:\n{output}",
			),
		).toEqual([
			{ kind: "text", text: "Rate how helpful the RESPONSE is." },
			{ kind: "field", field: "input" },
			{ kind: "field", field: "output" },
		]);
	});
	test("keeps instruction text between and after fields", () => {
		expect(
			splitTemplate("Compare.\n\nREFERENCE:\n{reference}\nANSWER:\n{output}\n\nBe strict."),
		).toEqual([
			{ kind: "text", text: "Compare." },
			{ kind: "field", field: "reference" },
			{ kind: "field", field: "output" },
			{ kind: "text", text: "Be strict." },
		]);
	});
	test("a bare {output} template has no rubric", () => {
		expect(splitTemplate("{output}")).toEqual([{ kind: "field", field: "output" }]);
	});
});
