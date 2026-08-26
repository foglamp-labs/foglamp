import { describe, expect, test } from "bun:test";

import { formatAlertMetricValue, generateAlertName } from "./alerts";

describe("alert display formatting", () => {
  test("formats values in user-facing units", () => {
    expect(formatAlertMetricValue("cost", 500)).toBe("$500");
    expect(formatAlertMetricValue("latency_p95", 2_000)).toBe("2s");
    expect(formatAlertMetricValue("error_rate", 0.05)).toBe("5%");
    expect(formatAlertMetricValue("eval_pass_rate", 0.925)).toBe("92.5%");
  });

  test("generates a useful name for each supported condition", () => {
    expect(
      generateAlertName({ metric: "cost", comparison: "gt", threshold: 500 }),
    ).toBe("Cost above $500");
    expect(
      generateAlertName({
        metric: "latency_p95",
        comparison: "gte",
        threshold: 2_000,
      }),
    ).toBe("Latency p95 at least 2s");
    expect(
      generateAlertName({
        metric: "error_rate",
        comparison: "lt",
        threshold: 0.05,
      }),
    ).toBe("Error rate below 5%");
    expect(
      generateAlertName({
        metric: "eval_pass_rate",
        comparison: "lte",
        threshold: 0.9,
      }),
    ).toBe("Eval pass rate at most 90%");
  });
});
