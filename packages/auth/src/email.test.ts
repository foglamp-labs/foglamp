import { describe, expect, test } from "bun:test";

import { renderAlertHtml, renderAlertText } from "./email";
import { renderOnboardingFollowUpEmail } from "./onboardingFollowUpEmail";

const expectedSubjects = {
  1: "Need help getting started with Foglamp?",
  3: "Want a hand setting up Foglamp?",
  7: "Still want to try Foglamp?",
} as const;

describe("onboarding follow-up emails", () => {
  test("renders the approved subject, calendar link, and personal greeting", () => {
    for (const milestoneDays of [1, 3, 7] as const) {
      const email = renderOnboardingFollowUpEmail(
        milestoneDays,
        "Gustavo Fior",
      );

      expect(email.subject).toBe(expectedSubjects[milestoneDays]);
      expect(email.text).toStartWith("Hey Gustavo!\n\n");
      expect(email.text).toContain("https://cal.com/gustavo-fior/30min");
      expect(email.text).toEndWith("\n\nGustavo");
      expect(email.text).not.toContain("—");
    }
  });

  test("uses a nameless greeting when no name is available", () => {
    expect(renderOnboardingFollowUpEmail(1).text).toStartWith("Hey!\n\n");
  });
});

const alertParams = {
  ruleName: "Cost above $500",
  projectName: "checkout",
  metricLabel: "Cost",
  conditionLabel: "> $500.00",
  value: "$612.10",
  url: "https://app.foglamp.dev/alerts",
};

describe("alert emails", () => {
  test("renders the fired alert without a diagnosis", () => {
    const html = renderAlertHtml(alertParams);
    expect(html).toContain("Alert firing");
    expect(html).toContain("Cost above $500");
    expect(html).toContain("$612.10");
    expect(html).not.toContain("Diagnosis");
    expect(html).not.toContain("What changed");

    const text = renderAlertText(alertParams);
    expect(text).toStartWith("Alert firing: Cost above $500");
    expect(text).toContain("Open in Foglamp: https://app.foglamp.dev/alerts");
  });

  test("renders diagnosis summary, context rows, and trace links", () => {
    const diagnosis = {
      summary: "Spend concentrated in gpt-4o via the batch-import agent.",
      rows: [
        ["This window", "$612.10"],
        ["Previous window", "$120.00"],
      ] as [string, string][],
      traces: [
        {
          name: "batch-import",
          detail: "$120.00",
          url: "https://app.foglamp.dev/traces/t1",
        },
      ],
    };
    const html = renderAlertHtml({ ...alertParams, diagnosis });
    expect(html).toContain("Diagnosis");
    expect(html).toContain(
      "Spend concentrated in gpt-4o via the batch-import agent.",
    );
    expect(html).toContain("What changed");
    expect(html).toContain("Previous window");
    expect(html).toContain("Top traces");
    expect(html).toContain('href="https://app.foglamp.dev/traces/t1"');

    const text = renderAlertText({ ...alertParams, diagnosis });
    expect(text).toContain("Diagnosis:");
    expect(text).toContain("What changed:\nThis window: $612.10");
    expect(text).toContain(
      "batch-import ($120.00): https://app.foglamp.dev/traces/t1",
    );
  });

  test("escapes user-influenced values in the html", () => {
    const html = renderAlertHtml({
      ...alertParams,
      ruleName: `<script>alert("x")</script>`,
      diagnosis: { summary: `<img src=x onerror=1>` },
    });
    expect(html).not.toContain(`<script>`);
    expect(html).not.toContain(`<img src=x`);
  });
});
