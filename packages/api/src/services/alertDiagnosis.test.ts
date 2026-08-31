import { describe, expect, test } from "bun:test";

import {
  describeForDiagnosis,
  DIAGNOSIS_DAILY_CAP,
  relativeDelta,
  shouldRegenerateDiagnosis,
} from "./alertDiagnosis";

describe("shouldRegenerateDiagnosis", () => {
  test("fresh fires regenerate while under the daily cap", () => {
    expect(
      shouldRegenerateDiagnosis({
        freshFire: true,
        value: 100,
        lastDiagnosisValue: 100,
        diagnosisCount: DIAGNOSIS_DAILY_CAP - 1,
      }),
    ).toBe(true);
  });

  test("the daily cap wins over everything", () => {
    expect(
      shouldRegenerateDiagnosis({
        freshFire: true,
        value: 1_000_000,
        lastDiagnosisValue: 1,
        diagnosisCount: DIAGNOSIS_DAILY_CAP,
      }),
    ).toBe(false);
  });

  test("renotifies reuse when the value moved 25% or less", () => {
    expect(
      shouldRegenerateDiagnosis({
        freshFire: false,
        value: 120,
        lastDiagnosisValue: 100,
        diagnosisCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldRegenerateDiagnosis({
        freshFire: false,
        value: 126,
        lastDiagnosisValue: 100,
        diagnosisCount: 0,
      }),
    ).toBe(true);
  });

  test("a renotify with no prior diagnosis value regenerates", () => {
    expect(
      shouldRegenerateDiagnosis({
        freshFire: false,
        value: 100,
        lastDiagnosisValue: null,
        diagnosisCount: 0,
      }),
    ).toBe(true);
  });
});

describe("relativeDelta", () => {
  test("returns the signed relative change", () => {
    expect(relativeDelta(150, 100)).toBe(0.5);
    expect(relativeDelta(50, 100)).toBe(-0.5);
  });

  test("returns null without a usable baseline", () => {
    expect(relativeDelta(150, null)).toBeNull();
    expect(relativeDelta(150, 0)).toBeNull();
  });
});

describe("describeForDiagnosis", () => {
  test("renders the alert condition and context rows as prompt lines", () => {
    const prompt = describeForDiagnosis(
      {
        ruleName: "Cost above $500",
        projectName: "checkout",
        metric: "cost",
        conditionLabel: "> $500",
        windowSeconds: 3600,
      },
      [
        ["This window", "$612.10"],
        ["Model gpt-4o", "$400.00 (65% of spend)"],
      ],
      [{ traceId: "t1", name: "batch-import", detail: "$120.00" }],
    );
    expect(prompt).toContain("Alert: Cost above $500 (project checkout)");
    expect(prompt).toContain("Metric: Cost, condition > $500, window 1h");
    expect(prompt).toContain("Model gpt-4o: $400.00 (65% of spend)");
    expect(prompt).toContain("Top traces: batch-import ($120.00)");
  });
});
