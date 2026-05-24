import { env } from "@watchtower/env/server";
import { createLogger } from "evlog";
import { Resend } from "resend";

const DEFAULT_FROM = "Watchtower <onboarding@watchtower.dev>";

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
    subject: "Your Watchtower sign-in link",
    html: renderHtml(url),
    text: renderText(url),
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
        Open in Watchtower
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

Open in Watchtower: ${p.url}`;
}

function renderHtml(url: string) {
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #111;">
    <h1 style="font-size: 18px; margin-bottom: 16px;">Sign in to Watchtower</h1>
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
  return `Sign in to Watchtower

Click the link below to access your account. This link expires in 15 minutes.

${url}

If you didn't request this email, you can safely ignore it.`;
}
