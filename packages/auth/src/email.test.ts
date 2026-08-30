import { describe, expect, test } from "bun:test";

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
