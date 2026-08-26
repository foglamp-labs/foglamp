import { describe, expect, test } from "bun:test";
import type { ClickHouseClient } from "@clickhouse/client";

import { hasOrgSpanUsage } from "./queries";

function clientWithRows(result: unknown[]): ClickHouseClient {
  return {
    query: async () => ({ json: async () => result }),
  } as unknown as ClickHouseClient;
}

describe("hasOrgSpanUsage", () => {
  test("returns true when the durable usage rollup has an org row", async () => {
    expect(await hasOrgSpanUsage(clientWithRows([{ active: 1 }]), "org-1")).toBe(
      true,
    );
  });

  test("returns false when the org has never ingested spans", async () => {
    expect(await hasOrgSpanUsage(clientWithRows([]), "org-1")).toBe(false);
  });
});
