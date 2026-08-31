import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  sendAlertEmail,
  sendInvitationEmail,
  sendMagicLinkEmail,
  sendOnboardingFollowUpEmail,
  sendQuotaWarningEmail,
  sendResetPasswordEmail,
  sendStorageAlertEmail,
  sendWelcomeEmail,
  type AlertEmailParams,
} from "@foglamp/auth/email";
import {
  renderQuietWeekEmail,
  renderWeeklyDigestEmail,
  sendDigestEmail,
} from "@foglamp/auth/weeklyDigestEmail";
import { env } from "@foglamp/env/server";

import { protectedProcedure, router } from "../index";
import { isPlatformAdmin } from "../services/platform";

// Every email the product sends, rendered with representative sample data so
// templates can be eyeballed in a real inbox (the dev-toolbar Emails menu).
// All sends go to TEST_EMAIL_TO — never to a caller-chosen address.
export const TEST_EMAIL_VARIANTS = [
  "alert_fired",
  "alert_diagnosis",
  "weekly_digest",
  "quiet_week",
  "welcome",
  "onboarding_day_1",
  "onboarding_day_3",
  "onboarding_day_7",
  "magic_link",
  "reset_password",
  "invitation",
  "quota_warning",
  "storage_alert",
] as const;

export type TestEmailVariant = (typeof TEST_EMAIL_VARIANTS)[number];

function sampleAlert(
  appBase: string,
  withDiagnosis: boolean,
): Omit<AlertEmailParams, "to"> {
  const base = {
    ruleName: "Cost above $500",
    projectName: "checkout",
    projectSiteUrl: "https://stripe.com",
    metricLabel: "Cost",
    conditionLabel: "> $500.00",
    value: "$612.10",
    url: `${appBase}/alerts`,
  };
  return !withDiagnosis
    ? base
    : {
        ...base,
        diagnosis: {
          summary:
            "Spend jumped 410% versus the previous hour, driven almost entirely by gpt-4o at $498.30, 81% of window spend. The batch-import agent accounts for $455.12 of that, and its top trace alone cost $121.40. The remaining models and agents are in line with the previous window, so this looks like a batch-import runaway rather than a broad increase.",
          rows: [
            ["This window", "$612.10"],
            ["Previous window", "$120.02"],
            ["Change", "+410%"],
            ["Model gpt-4o", "$498.30 (81% of spend)"],
            ["Model gpt-4o-mini", "$86.55 (14% of spend)"],
            ["Agent batch-import", "$455.12"],
            ["Agent support-chat", "$98.70"],
          ],
          traces: [
            {
              name: "batch-import",
              detail: "$121.40",
              url: `${appBase}/traces/test-trace-1`,
            },
            {
              name: "batch-import",
              detail: "$98.12",
              url: `${appBase}/traces/test-trace-2`,
            },
            {
              name: "support-chat",
              detail: "$44.05",
              url: `${appBase}/traces/test-trace-3`,
            },
          ],
        },
      };
}

function sampleDigest(appBase: string) {
  return renderWeeklyDigestEmail({
    orgName: "Acme Inc",
    rangeLabel: "Aug 24 to Aug 30",
    summary:
      "A strong week for checkout: traffic grew 18% to 12.4k spans while cost held nearly flat at $3.20, thanks to the gpt-4o-mini migration. Errors ticked up to 1.8%, all from the payment-retry agent on Thursday, and p95 latency improved to 940 ms. The support project stayed quiet with 890 spans and no notable changes.",
    projects: [
      {
        name: "checkout",
        url: `${appBase}/`,
        siteUrl: "https://stripe.com",
        metrics: [
          { label: "Spans", icon: "spans", value: "12.4k", deltaPct: 18, higherIsWorse: false },
          { label: "Cost", icon: "cost", value: "$3.20", deltaPct: 2, higherIsWorse: true },
          { label: "Errors", icon: "errors", value: "1.8%", deltaPct: 32, higherIsWorse: true },
          { label: "p95", icon: "p95", value: "940 ms", deltaPct: -11, higherIsWorse: true },
        ],
      },
      {
        name: "support",
        url: `${appBase}/`,
        siteUrl: null,
        metrics: [
          { label: "Spans", icon: "spans", value: "890", deltaPct: null, higherIsWorse: false },
          { label: "Cost", icon: "cost", value: "$0.41", deltaPct: -5, higherIsWorse: true },
          { label: "Errors", icon: "errors", value: "0.2%", deltaPct: 0, higherIsWorse: true },
          { label: "p95", icon: "p95", value: "1.2 s", deltaPct: 4, higherIsWorse: true },
        ],
      },
    ],
    moreProjects: 1,
    moreProjectsUrl: `${appBase}/settings/org?tab=projects`,
    unsubscribeUrl: `${appBase}/settings/org?tab=notifications`,
  });
}

function sampleQuietWeek(appBase: string) {
  return renderQuietWeekEmail({
    orgName: "Acme Inc",
    setupUrl: `${appBase}/`,
    unsubscribeUrl: `${appBase}/settings/org?tab=notifications`,
  });
}

async function sendTestEmail(variant: TestEmailVariant, to: string) {
  const appBase = env.CORS_ORIGIN.replace(/\/$/, "");
  const stamp = Date.now(); // unique idempotency keys so repeat clicks deliver

  switch (variant) {
    case "alert_fired":
    case "alert_diagnosis":
      await sendAlertEmail({
        to,
        ...sampleAlert(appBase, variant === "alert_diagnosis"),
      });
      return;

    case "weekly_digest": {
      const mail = sampleDigest(appBase);
      await sendDigestEmail({
        to,
        ...mail,
        unsubscribeUrl: `${appBase}/settings/org?tab=notifications`,
        idempotencyKey: `test-digest-${stamp}`,
      });
      return;
    }

    case "quiet_week": {
      const mail = sampleQuietWeek(appBase);
      await sendDigestEmail({
        to,
        ...mail,
        unsubscribeUrl: `${appBase}/settings/org?tab=notifications`,
        idempotencyKey: `test-quiet-${stamp}`,
      });
      return;
    }

    case "welcome":
      await sendWelcomeEmail({ to, name: "Gustavo Fior" });
      return;

    case "onboarding_day_1":
    case "onboarding_day_3":
    case "onboarding_day_7": {
      const milestoneDays = Number(
        variant.replace("onboarding_day_", ""),
      ) as 1 | 3 | 7;
      await sendOnboardingFollowUpEmail({
        to,
        name: "Gustavo Fior",
        milestoneDays,
        idempotencyKey: `test-onboarding-${milestoneDays}-${stamp}`,
      });
      return;
    }

    case "magic_link":
      await sendMagicLinkEmail({
        to,
        url: `${appBase}/api/auth/magic-link/verify?token=test-token`,
      });
      return;

    case "reset_password":
      await sendResetPasswordEmail({
        to,
        url: `${appBase}/reset-password?token=test-token`,
      });
      return;

    case "invitation":
      await sendInvitationEmail({
        to,
        inviterName: "Gustavo Fior",
        orgName: "Acme Inc",
        url: `${appBase}/accept-invitation/test-invite`,
      });
      return;

    case "quota_warning":
      await sendQuotaWarningEmail({
        to,
        orgName: "Acme Inc",
        pct: 92,
        url: `${appBase}/settings/org?tab=billing`,
      });
      return;

    case "storage_alert":
      await sendStorageAlertEmail({
        to,
        usedLabel: "21.4 GiB",
        thresholdLabel: "20 GiB",
        url: `${appBase}/platform`,
      });
      return;
  }
}


export const testEmailsRouter = router({
  send: protectedProcedure
    .input(z.object({ variant: z.enum(TEST_EMAIL_VARIANTS) }))
    .mutation(async ({ ctx, input }) => {
      const to = env.TEST_EMAIL_TO;
      if (!to) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Set TEST_EMAIL_TO to enable test emails",
        });
      }
      // The recipient is pinned by env, so the blast radius is one inbox — but
      // in production only platform operators get to fill it.
      if (
        env.NODE_ENV === "production" &&
        !isPlatformAdmin(ctx.session.user.email)
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await sendTestEmail(input.variant, to);
      return { sent: true, to };
    }),
});
