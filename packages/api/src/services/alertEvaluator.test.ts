import { describe, expect, test } from "bun:test";

import {
  computeAlertTransition,
  FIRE_STREAK,
  MIN_SAMPLE_COUNT,
  RESOLVE_STREAK,
  type AlertTransitionInput,
} from "./alertEvaluator";

const ok = { status: "ok", breachStreak: 0, okStreak: 0 } as const;
const firing = { status: "firing", breachStreak: 0, okStreak: 0 } as const;

function step(
  prev: AlertTransitionInput["prev"],
  value: number,
  overrides: Partial<Omit<AlertTransitionInput, "prev" | "value">> = {},
) {
  return computeAlertTransition({
    prev,
    value,
    threshold: 100,
    comparison: "gt",
    metric: "cost",
    sampleCount: 1000,
    ...overrides,
  });
}

describe("fire debounce", () => {
  test("a breach must hold FIRE_STREAK consecutive sweeps before firing", () => {
    let prev: AlertTransitionInput["prev"] = ok;
    for (let i = 1; i < FIRE_STREAK; i++) {
      const t = step(prev, 150);
      expect(t.status).toBe("ok");
      expect(t.transitioned).toBe(false);
      expect(t.breachStreak).toBe(i);
      prev = t;
    }
    const fired = step(prev, 150);
    expect(fired.status).toBe("firing");
    expect(fired.transitioned).toBe(true);
  });

  test("a single clear sweep resets the fire streak (no flap fire)", () => {
    const one = step(ok, 150);
    const two = step(one, 150);
    const clear = step(two, 50); // dips back under before the 3rd breach
    expect(clear.breachStreak).toBe(0);
    const again = step(clear, 150);
    expect(again.status).toBe("ok");
    expect(again.breachStreak).toBe(1);
  });
});

describe("resolve hysteresis", () => {
  test("value inside the 10% margin holds firing and resets the ok streak", () => {
    // threshold 100 gt → must reach ≤ 90 to count toward resolving.
    const inside = step({ ...firing, okStreak: 2 }, 95);
    expect(inside.status).toBe("firing");
    expect(inside.okStreak).toBe(0);
    expect(inside.transitioned).toBe(false);
  });

  test("resolves only after RESOLVE_STREAK margin-clear sweeps", () => {
    let prev: AlertTransitionInput["prev"] = firing;
    for (let i = 1; i < RESOLVE_STREAK; i++) {
      const t = step(prev, 80);
      expect(t.status).toBe("firing");
      expect(t.okStreak).toBe(i);
      prev = t;
    }
    const resolved = step(prev, 80);
    expect(resolved.status).toBe("ok");
    expect(resolved.transitioned).toBe(true);
  });

  test("a re-breach while resolving resets the ok streak and stays firing", () => {
    const clearing = step(firing, 80);
    expect(clearing.okStreak).toBe(1);
    const rebreach = step(clearing, 150);
    expect(rebreach.status).toBe("firing");
    expect(rebreach.okStreak).toBe(0);
    expect(rebreach.transitioned).toBe(false);
  });

  test("lt comparison clears upward: value must exceed threshold + margin", () => {
    // threshold 100 lt (breach when below) → resolving needs ≥ 110.
    const inside = step(firing, 105, { comparison: "lt" });
    expect(inside.okStreak).toBe(0);
    const cleared = step(firing, 115, { comparison: "lt" });
    expect(cleared.okStreak).toBe(1);
  });
});

describe("sample floor", () => {
  test("percentile metrics skip evaluation under MIN_SAMPLE_COUNT", () => {
    const t = step(ok, 5000, {
      metric: "latency_p95",
      sampleCount: MIN_SAMPLE_COUNT - 1,
    });
    expect(t.skipped).toBe(true);
    expect(t.status).toBe("ok");
    expect(t.breachStreak).toBe(0);
  });

  test("a skip holds firing state instead of resolving it", () => {
    const t = step({ ...firing, okStreak: 2 }, 0, {
      metric: "error_rate",
      sampleCount: 3,
    });
    expect(t.skipped).toBe(true);
    expect(t.status).toBe("firing");
    expect(t.okStreak).toBe(2);
  });

  test("volume metrics always evaluate, even with zero spans", () => {
    const t = step(ok, 150, { metric: "cost", sampleCount: 0 });
    expect(t.skipped).toBe(false);
    expect(t.breachStreak).toBe(1);
  });
});
