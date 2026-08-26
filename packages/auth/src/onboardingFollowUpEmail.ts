export const GUSTAVO_CAL_URL = "https://cal.com/gustavo-fior/30min";

export type OnboardingEmailMilestone = 1 | 3 | 7;

/** First name only. Falls back to a nameless greeting rather than guessing a
 * name from the email address. */
export function personalGreeting(name?: string | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first ? `Hey ${first}!` : "Hey!";
}

const FOLLOW_UPS: Record<
  OnboardingEmailMilestone,
  { subject: string; body: (hello: string) => string }
> = {
  1: {
    subject: "Need help getting started with Foglamp?",
    body: (hello) => `${hello}

Just checking in. It looks like you have not sent any spans to Foglamp yet.

The easiest way to get started is to copy the prompt from your dashboard and paste it into your coding agent.

If you want help setting it up, grab 30 minutes with me:
${GUSTAVO_CAL_URL}

Happy to help!

Gustavo`,
  },
  3: {
    subject: "Want a hand setting up Foglamp?",
    body: (hello) => `${hello}

I noticed you have not connected an app to Foglamp yet.

If anything is unclear or you ran into a problem, reply to this email and tell me what happened. I am happy to help.

You can also grab 30 minutes with me here:
${GUSTAVO_CAL_URL}

Gustavo`,
  },
  7: {
    subject: "Still want to try Foglamp?",
    body: (hello) => `${hello}

One last note from me. It looks like you have not sent any spans to Foglamp yet.

If you still want to try it, the prompt on your dashboard can set everything up through your coding agent.

If you would rather do it together, grab 30 minutes with me:
${GUSTAVO_CAL_URL}

Either way, I would be glad to hear what you think.

Gustavo`,
  },
};

export function renderOnboardingFollowUpEmail(
  milestoneDays: OnboardingEmailMilestone,
  name?: string | null,
): { subject: string; text: string } {
  const followUp = FOLLOW_UPS[milestoneDays];
  return {
    subject: followUp.subject,
    text: followUp.body(personalGreeting(name)),
  };
}
