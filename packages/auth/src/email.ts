import { env } from "@foglamp/env/server";
import { createLogger } from "evlog";
import { Resend } from "resend";

const DEFAULT_FROM = "Foglamp <onboarding@foglamp.dev>";

const log = createLogger();

export async function sendMagicLinkEmail({
  to,
  url,
}: {
  to: string;
  url: string;
}) {
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL ?? DEFAULT_FROM;

  if (!apiKey) {
    log.info("auth.magic_link.skipped_no_api_key", { to, url });
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: "Your Foglamp sign-in link",
    html: renderHtml(url),
    text: renderText(url),
  });

  if (error) {
    throw new Error(`Resend request failed: ${error.name} — ${error.message}`);
  }
}

export async function sendInvitationEmail({
  to,
  inviterName,
  orgName,
  url,
}: {
  to: string;
  inviterName: string;
  orgName: string;
  url: string;
}) {
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL ?? DEFAULT_FROM;

  if (!apiKey) {
    // No email configured (self-host) — the invite still exists; it can be
    // accepted via the link surfaced in the dashboard.
    log.info("auth.invitation.skipped_no_api_key", { to, org: orgName, url });
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: `${inviterName} invited you to ${orgName} on Foglamp`,
    html: renderInviteHtml({ inviterName, orgName, url }),
    text: renderInviteText({ inviterName, orgName, url }),
  });

  if (error) {
    throw new Error(`Resend request failed: ${error.name} — ${error.message}`);
  }
}

function renderInviteHtml(p: { inviterName: string; orgName: string; url: string }) {
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #111;">
    <h1 style="font-size: 18px; margin-bottom: 16px;">Join ${p.orgName} on Foglamp</h1>
    <p style="font-size: 14px; line-height: 1.5;">
      ${p.inviterName} invited you to the <strong>${p.orgName}</strong> organization.
    </p>
    <p style="margin: 24px 0;">
      <a href="${p.url}" style="background: #111; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-size: 14px;">
        Accept invitation
      </a>
    </p>
    <p style="font-size: 12px; color: #666;">
      If you weren't expecting this, you can safely ignore it.
    </p>
  </body>
</html>`;
}

function renderInviteText(p: { inviterName: string; orgName: string; url: string }) {
  return `Join ${p.orgName} on Foglamp

${p.inviterName} invited you to the ${p.orgName} organization.

Accept the invitation: ${p.url}

If you weren't expecting this, you can safely ignore it.`;
}

export async function sendQuotaWarningEmail({
  to,
  orgName,
  pct,
  url,
}: {
  to: string;
  orgName: string;
  pct: number;
  url: string;
}) {
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL ?? DEFAULT_FROM;
  if (!apiKey) {
    log.info("quota.email.skipped_no_api_key", { to, org: orgName, pct });
    return;
  }
  const resend = new Resend(apiKey);
  const html = `<!doctype html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #111;">
    <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #d97706; margin: 0 0 8px;">Span quota</p>
    <h1 style="font-size: 18px; margin: 0 0 16px;">${orgName} has used ${pct}% of its monthly span quota</h1>
    <p style="font-size: 14px; line-height: 1.5;">New spans are rejected once you exceed the quota. Upgrade to keep ingesting without interruption.</p>
    <p style="margin: 24px 0;"><a href="${url}" style="background: #111; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-size: 14px;">Review billing</a></p>
  </body></html>`;
  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: `${orgName} is at ${pct}% of its span quota`,
    html,
    text: `${orgName} has used ${pct}% of its monthly span quota. New spans are rejected once over quota. Review billing: ${url}`,
  });
  if (error) {
    throw new Error(`Resend request failed: ${error.name} — ${error.message}`);
  }
}

export type AlertEmailKind = "fired" | "resolved";

export async function sendAlertEmail(params: {
  to: string;
  kind: AlertEmailKind;
  ruleName: string;
  projectName: string;
  metricLabel: string;
  conditionLabel: string;
  value: string;
  windowLabel: string;
  url: string;
}) {
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL ?? DEFAULT_FROM;

  if (!apiKey) {
    log.info("alert.email.skipped_no_api_key", {
      to: params.to,
      kind: params.kind,
      rule: params.ruleName,
    });
    return;
  }

  const verb = params.kind === "fired" ? "firing" : "resolved";
  const subject =
    params.kind === "fired"
      ? `🔴 Alert firing: ${params.ruleName}`
      : `✅ Alert resolved: ${params.ruleName}`;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: [params.to],
    subject,
    html: renderAlertHtml({ ...params, verb }),
    text: renderAlertText({ ...params, verb }),
  });

  if (error) {
    throw new Error(`Resend request failed: ${error.name} — ${error.message}`);
  }
}

function renderAlertHtml(p: {
  kind: AlertEmailKind;
  verb: string;
  ruleName: string;
  projectName: string;
  metricLabel: string;
  conditionLabel: string;
  value: string;
  windowLabel: string;
  url: string;
}) {
  const accent = p.kind === "fired" ? "#dc2626" : "#16a34a";
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #111;">
    <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: ${accent}; margin: 0 0 8px;">
      Alert ${p.verb}
    </p>
    <h1 style="font-size: 18px; margin: 0 0 16px;">${p.ruleName}</h1>
    <table style="font-size: 14px; line-height: 1.6; border-collapse: collapse;">
      <tr><td style="color:#666; padding-right:16px;">Project</td><td>${p.projectName}</td></tr>
      <tr><td style="color:#666; padding-right:16px;">Metric</td><td>${p.metricLabel}</td></tr>
      <tr><td style="color:#666; padding-right:16px;">Condition</td><td>${p.conditionLabel}</td></tr>
      <tr><td style="color:#666; padding-right:16px;">Current value</td><td><strong>${p.value}</strong></td></tr>
      <tr><td style="color:#666; padding-right:16px;">Window</td><td>${p.windowLabel}</td></tr>
    </table>
    <p style="margin: 24px 0;">
      <a href="${p.url}" style="background: #111; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-size: 14px;">
        Open in Foglamp
      </a>
    </p>
  </body>
</html>`;
}

function renderAlertText(p: {
  verb: string;
  ruleName: string;
  projectName: string;
  metricLabel: string;
  conditionLabel: string;
  value: string;
  windowLabel: string;
  url: string;
}) {
  return `Alert ${p.verb}: ${p.ruleName}

Project:   ${p.projectName}
Metric:    ${p.metricLabel}
Condition: ${p.conditionLabel}
Value:     ${p.value}
Window:    ${p.windowLabel}

Open in Foglamp: ${p.url}`;
}

function renderHtml(url: string) {
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #111;">
    <h1 style="font-size: 18px; margin-bottom: 16px;">Sign in to Foglamp</h1>
    <p style="font-size: 14px; line-height: 1.5;">
      Click the button below to access your account. This link expires in 15 minutes.
    </p>
    <p style="margin: 24px 0;">
      <a href="${url}" style="background: #111; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-size: 14px;">
        Sign in
      </a>
    </p>
    <p style="font-size: 12px; color: #666;">
      If you didn't request this email, you can safely ignore it.
    </p>
  </body>
</html>`;
}

function renderText(url: string) {
  return `Sign in to Foglamp

Click the link below to access your account. This link expires in 15 minutes.

${url}

If you didn't request this email, you can safely ignore it.`;
}
