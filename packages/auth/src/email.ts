import { env } from "@foglamp/env/server";
import { createLogger } from "evlog";
import { Resend } from "resend";

import {
	GUSTAVO_CAL_URL,
	personalGreeting,
	renderOnboardingFollowUpEmail,
	type OnboardingEmailMilestone,
} from "./onboardingFollowUpEmail";

export {
	renderOnboardingFollowUpEmail,
	type OnboardingEmailMilestone,
} from "./onboardingFollowUpEmail";

const DEFAULT_FROM = "Foglamp <onboarding@foglamp.dev>";

const log = createLogger();

// --- Shared email chrome -----------------------------------------------------
// All templates render onto one layout so they read like the product: Inter
// type, the near-black/neutral palette and 10–14px radii from the UI theme, a
// white card on a soft gray canvas, with the Foglamp logo at the top of the card.

// Mirrors the UI theme tokens (globals.css): --foreground, --muted-foreground,
// --border, a soft canvas, and the near-black primary button.
export const EMAIL_COLORS = {
	canvas: "#f4f4f5",
	card: "#ffffff",
	border: "#ebebeb",
	text: "#171717",
	muted: "#737373",
	buttonBg: "#171717",
	buttonText: "#fafafa",
};

// Inter first (matches the app), then the usual cross-client system fallbacks.
export const EMAIL_FONT =
	"'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const C = EMAIL_COLORS;
const FONT = EMAIL_FONT;

// Escape interpolated, user-influenced values (org/rule names, links) so they
// can't break out of the surrounding HTML. `&` first, then the rest.
export function esc(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

// The Foglamp wordmark, served from the web app's public dir (CORS_ORIGIN).
// The alt text keeps the brand legible if a client blocks images.
function logo(): string {
	const base = env.CORS_ORIGIN.replace(/\/$/, "");
	return `<img src="${esc(`${base}/wordmark-light.png`)}" alt="Foglamp" width="72" style="display:block; width:72px; height:auto; border:0; outline:none; text-decoration:none;" />`;
}

// A small PNG icon from the web app's public /email dir, rendered inline with
// the surrounding text (email clients don't render inline SVG).
function emailIcon(name: string, size: number, gapRight = 0): string {
	const base = env.CORS_ORIGIN.replace(/\/$/, "");
	return `<img src="${esc(`${base}/email/${name}.png`)}" alt="" width="${size}" height="${size}" style="display:inline-block; width:${size}px; height:${size}px; border:0; vertical-align:-1px; margin-right:${gapRight}px;" />`;
}

// Mirrors apps/web ProjectIcon: favicon of the project's site, else one of a
// fixed set of placeholder icons picked from the first letter of the name.
export const PROJECT_PLACEHOLDER_ICONS = [
	"cloud",
	"flask-2",
	"flower",
	"cherry",
	"meteor",
	"flame",
	"droplet",
	"chef-hat",
	"triangle",
];

export function projectPlaceholderIcon(name: string): string {
	const code = name.trim().charAt(0).toLowerCase().charCodeAt(0);
	const idx = Number.isNaN(code) ? 0 : code % PROJECT_PLACEHOLDER_ICONS.length;
	return PROJECT_PLACEHOLDER_ICONS[idx] as string;
}

export function projectFaviconUrl(siteUrl: string): string {
	const site = /^https?:\/\//.test(siteUrl) ? siteUrl : `https://${siteUrl}`;
	return `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(site)}&size=64`;
}

// Inline (text-flow) project icon used before the project name in the alert
// email. The digest renders its own block-level variant.
function projectIconInline(name: string, siteUrl?: string | null): string {
	const style =
		"display:inline-block; width:14px; height:14px; border-radius:3px; border:0; vertical-align:-2px; margin-right:6px;";
	if (siteUrl) {
		return `<img src="${esc(projectFaviconUrl(siteUrl))}" alt="" width="14" height="14" style="${style}" />`;
	}
	const base = env.CORS_ORIGIN.replace(/\/$/, "");
	return `<img src="${esc(`${base}/email/project-${projectPlaceholderIcon(name)}.png`)}" alt="" width="14" height="14" style="${style}" />`;
}

// A definition-list-style block of label/value rows (used by the alert email).
function detailRows(rows: [label: string, value: string][]): string {
	const body = rows
		.map(
			([k, v]) => `<tr>
            <td style="padding:5px 16px 5px 0; font-family:${FONT}; font-size:13px; color:${C.muted}; white-space:nowrap; vertical-align:top;">${k}</td>
            <td style="padding:5px 0; font-family:${FONT}; font-size:13px; color:${C.text}; vertical-align:top;">${v}</td>
          </tr>`,
		)
		.join("");
	return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0; border-collapse:collapse;">${body}</table>`;
}

/**
 * The single email shell. Callers pass already-safe HTML for `title`/`body`
 * (escape any dynamic value with `esc`); the layout escapes the link + preview
 * text itself. `eyebrow` is a small uppercased kicker, optionally tinted to a
 * semantic accent (amber for quota, red/green for alerts).
 */
export function emailLayout(opts: {
	previewText: string;
	title: string;
	body: string;
	eyebrow?: { label: string; color?: string };
	cta?: { label: string; url: string };
	footnote?: string;
}): string {
	const { previewText, title, body, eyebrow, cta, footnote } = opts;
	const eyebrowHtml = eyebrow
		? `<p style="margin:0 0 10px; font-family:${FONT}; font-size:14px; font-weight:600; color:${eyebrow.color ?? C.muted};">${eyebrow.label}</p>`
		: "";
	const ctaHtml = cta
		? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;">
                  <tr>
                    <td style="border-radius:999px; background:${C.buttonBg};">
                      <a href="${esc(cta.url)}" style="display:inline-block; padding:11px 20px; font-family:${FONT}; font-size:14px; font-weight:500; line-height:1; color:${C.buttonText}; text-decoration:none; border-radius:999px;">${cta.label}</a>
                    </td>
                  </tr>
                </table>`
		: "";
	const footnoteHtml = footnote
		? `<p style="margin:24px 0 0; padding-top:20px; border-top:1px solid ${C.border}; font-family:${FONT}; font-size:12px; line-height:1.5; color:${C.muted};">${footnote}</p>`
		: "";

	return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
  </head>
  <body style="margin:0; padding:0; background:${C.canvas};">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">${esc(previewText)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.canvas};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;">
            <tr>
              <td style="background:${C.card}; border:1px solid ${C.border}; border-radius:14px; padding:32px;">
                <div style="padding-bottom:24px;">${logo()}</div>
                ${eyebrowHtml}
                <h1 style="margin:0 0 14px; font-family:${FONT}; font-size:20px; font-weight:600; letter-spacing:-0.3px; color:${C.text};">${title}</h1>
                <div style="font-family:${FONT}; font-size:14px; line-height:1.6; color:${C.text};">${body}</div>
                ${ctaHtml}
                ${footnoteHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

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
		html: renderMagicLinkHtml(url),
		text: renderMagicLinkText(url),
	});

	if (error) {
		throw new Error(`Resend request failed: ${error.name} — ${error.message}`);
	}
}

export async function sendResetPasswordEmail({
	to,
	url,
}: {
	to: string;
	url: string;
}) {
	const apiKey = env.RESEND_API_KEY;
	const from = env.RESEND_FROM_EMAIL ?? DEFAULT_FROM;

	if (!apiKey) {
		// No email configured (local dev / self-host) — the reset link is still
		// usable; grab it from the server logs.
		log.info("auth.reset_password.skipped_no_api_key", { to, url });
		return;
	}

	const resend = new Resend(apiKey);
	const { error } = await resend.emails.send({
		from,
		to: [to],
		subject: "Reset your Foglamp password",
		html: renderResetPasswordHtml(url),
		text: renderResetPasswordText(url),
	});

	if (error) {
		throw new Error(`Resend request failed: ${error.name} — ${error.message}`);
	}
}

export function renderResetPasswordHtml(url: string) {
	return emailLayout({
		previewText: "Reset your Foglamp password — expires in 1 hour.",
		title: "Reset your password",
		body: `<p style="margin:0;">Click the button below to choose a new password.</p>`,
		cta: { label: "Reset password", url },
		footnote:
			"This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email — your password is unchanged.",
	});
}

export function renderResetPasswordText(url: string) {
	return `Reset your Foglamp password

Open the link below to choose a new password. This link expires in 1 hour.

${url}

If you didn't request a reset, you can safely ignore this email — your password is unchanged.`;
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

export function renderInviteHtml(p: {
	inviterName: string;
	orgName: string;
	url: string;
}) {
	return emailLayout({
		previewText: `${p.inviterName} invited you to ${p.orgName} on Foglamp.`,
		eyebrow: { label: "Invitation" },
		title: `Join ${esc(p.orgName)} on Foglamp`,
		body: `<p style="margin:0;"><strong style="font-weight:600;">${esc(p.inviterName)}</strong> invited you to the <strong style="font-weight:600;">${esc(p.orgName)}</strong> organization.</p>`,
		cta: { label: "Accept invitation", url: p.url },
		footnote: "If you weren't expecting this, you can safely ignore it.",
	});
}

export function renderInviteText(p: {
	inviterName: string;
	orgName: string;
	url: string;
}) {
	return `Join ${p.orgName} on Foglamp

${p.inviterName} invited you to the ${p.orgName} organization.

Accept the invitation: ${p.url}

If you weren't expecting this, you can safely ignore it.`;
}

export function renderQuotaWarningHtml(p: {
	orgName: string;
	pct: number;
	url: string;
}) {
	return emailLayout({
		previewText: `${p.orgName} has used ${p.pct}% of its monthly span quota.`,
		eyebrow: {
			label: `${emailIcon("alert-triangle-amber", 12, 6)}Span quota`,
			color: "#d97706",
		},
		title: `${esc(p.orgName)} has used ${p.pct}% of its monthly span quota`,
		body: `<p style="margin:0;">New spans are rejected once you exceed the quota. Upgrade to keep ingesting without interruption.</p>`,
		cta: { label: "Review billing", url: p.url },
	});
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
	const html = renderQuotaWarningHtml({ orgName, pct, url });
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

export function renderStorageAlertHtml(p: {
	usedLabel: string;
	thresholdLabel: string;
	url: string;
}) {
	return emailLayout({
		previewText: `ClickHouse storage is at ${p.usedLabel}.`,
		eyebrow: { label: "Storage", color: "#d97706" },
		title: `ClickHouse storage has passed ${esc(p.thresholdLabel)}`,
		body: `<p style="margin:0;">The ClickHouse database is now using <strong style="font-weight:600;">${esc(p.usedLabel)}</strong> on disk, above the ${esc(p.thresholdLabel)} alert threshold. Review retention and disk headroom before the VM fills.</p>`,
		cta: { label: "Open platform dashboard", url: p.url },
	});
}

export async function sendStorageAlertEmail({
	to,
	usedLabel,
	thresholdLabel,
	url,
}: {
	to: string;
	usedLabel: string;
	thresholdLabel: string;
	url: string;
}) {
	const apiKey = env.RESEND_API_KEY;
	const from = env.RESEND_FROM_EMAIL ?? DEFAULT_FROM;
	if (!apiKey) {
		log.info("storage.email.skipped_no_api_key", { to, usedLabel });
		return;
	}
	const resend = new Resend(apiKey);
	const html = renderStorageAlertHtml({ usedLabel, thresholdLabel, url });
	const { error } = await resend.emails.send({
		from,
		to: [to],
		subject: `ClickHouse storage at ${usedLabel} (over ${thresholdLabel})`,
		html,
		text: `ClickHouse storage is at ${usedLabel}, above the ${thresholdLabel} alert threshold. Open the platform dashboard: ${url}`,
	});
	if (error) {
		throw new Error(`Resend request failed: ${error.name} — ${error.message}`);
	}
}

// Auto-diagnosis payload attached to a fired-alert email. Everything here is
// pre-formatted display text (the api package builds it); this module only
// escapes and lays it out.
export type AlertEmailDiagnosis = {
	/** LLM root-cause narrative (plain text; paid tiers only). */
	summary?: string;
	/** Deterministic label/value context rows (window delta, top contributors). */
	rows?: [label: string, value: string][];
	/** Top offending traces, deep-linked into the app. */
	traces?: { name: string; detail: string; url: string }[];
};

export type AlertEmailParams = {
	to: string;
	ruleName: string;
	projectName: string;
	// Project site URL for the favicon shown before the name (null → placeholder).
	projectSiteUrl?: string | null;
	metricLabel: string;
	conditionLabel: string;
	value: string;
	url: string;
	diagnosis?: AlertEmailDiagnosis;
};

// Fired-only by design: resolved transitions are recorded in the alert history
// but never emailed (they doubled notification volume for no action).
export async function sendAlertEmail(params: AlertEmailParams) {
	const apiKey = env.RESEND_API_KEY;
	const from = env.RESEND_FROM_EMAIL ?? DEFAULT_FROM;

	if (!apiKey) {
		log.info("alert.email.skipped_no_api_key", {
			to: params.to,
			rule: params.ruleName,
		});
		return;
	}

	const resend = new Resend(apiKey);
	const { error } = await resend.emails.send({
		from,
		to: [params.to],
		subject: `🔴 Alert firing: ${params.ruleName}`,
		html: renderAlertHtml(params),
		text: renderAlertText(params),
	});

	if (error) {
		throw new Error(`Resend request failed: ${error.name} — ${error.message}`);
	}
}

// Small section kicker used between diagnosis blocks.
function sectionTitle(label: string): string {
	return `<p style="margin:24px 0 0; font-family:${FONT}; font-size:13px; font-weight:600; color:${C.muted};">${label}</p>`;
}

export function renderAlertHtml(p: Omit<AlertEmailParams, "to">) {
	const d = p.diagnosis;
	const sections: string[] = [
		detailRows([
			[
				"Project",
				`${projectIconInline(p.projectName, p.projectSiteUrl)}${esc(p.projectName)}`,
			],
			["Condition", `${esc(p.metricLabel)} ${esc(p.conditionLabel)}`],
			[
				"Current value",
				`<strong style="font-weight:600;">${esc(p.value)}</strong>`,
			],
		]),
	];
	if (d?.summary) {
		sections.push(
			sectionTitle("Diagnosis"),
			`<p style="margin:8px 0 0; font-family:${FONT}; font-size:13px; line-height:1.6; color:${C.text};">${esc(d.summary)}</p>`,
		);
	}
	if (d?.rows?.length) {
		sections.push(
			sectionTitle("What changed"),
			detailRows(d.rows.map(([k, v]): [string, string] => [esc(k), esc(v)])),
		);
	}
	if (d?.traces?.length) {
		sections.push(
			sectionTitle("Top traces"),
			detailRows(
				d.traces.map((t): [string, string] => [
					`<a href="${esc(t.url)}" style="color:${C.text}; text-decoration:underline;">${esc(t.name)}</a>`,
					esc(t.detail),
				]),
			),
		);
	}
	return emailLayout({
		previewText: `Alert firing: ${p.ruleName}`,
		eyebrow: {
			label: `${emailIcon("alert-triangle", 12, 6)}Alert firing`,
			color: "#dc2626",
		},
		title: esc(p.ruleName),
		body: sections.join(""),
		cta: { label: "Open in Foglamp", url: p.url },
	});
}

export function renderAlertText(p: Omit<AlertEmailParams, "to">) {
	const d = p.diagnosis;
	const parts = [
		`Alert firing: ${p.ruleName}

Project:   ${p.projectName}
Condition: ${p.metricLabel} ${p.conditionLabel}
Value:     ${p.value}`,
	];
	if (d?.summary) {
		parts.push(`Diagnosis:\n${d.summary}`);
	}
	if (d?.rows?.length) {
		parts.push(
			`What changed:\n${d.rows.map(([k, v]) => `${k}: ${v}`).join("\n")}`,
		);
	}
	if (d?.traces?.length) {
		parts.push(
			`Top traces:\n${d.traces.map((t) => `${t.name} (${t.detail}): ${t.url}`).join("\n")}`,
		);
	}
	parts.push(`Open in Foglamp: ${p.url}`);
	return parts.join("\n\n");
}

export function renderMagicLinkHtml(url: string) {
	return emailLayout({
		previewText: "Your Foglamp sign-in link — expires in 15 minutes.",
		title: "Sign in to Foglamp",
		body: `<p style="margin:0;">Click the button below to access your account.</p>`,
		cta: { label: "Sign in", url },
		footnote:
			"This link expires in 15 minutes. If you didn't request it, you can safely ignore this email.",
	});
}

export function renderMagicLinkText(url: string) {
	return `Sign in to Foglamp

Click the link below to access your account. This link expires in 15 minutes.

${url}

If you didn't request this email, you can safely ignore it.`;
}

// --- Welcome email -----------------------------------------------------------
// Deliberately outside the shared HTML chrome above: this one is a plain-text
// note from a person, and the branded layout would undercut that. It's sent
// from Gustavo directly so replies land in a human inbox, not a no-reply void.

const WELCOME_FROM = "Gustavo from Foglamp <gustavo@foglamp.dev>";
const WELCOME_REPLY_TO = "gustavo@foglamp.dev";

export function renderWelcomeText(name?: string | null) {
	return `${personalGreeting(name)}

I'm Gustavo, I build Foglamp.

Thanks for signing up.

The fastest way in is the prompt on your dashboard: paste it into your coding
agent and it instruments your app for you.

If you'd rather talk it through or have ideas for the project, grab 30 minutes with me:
${GUSTAVO_CAL_URL}

Either way, would be a pleasure to talk to you!

Gustavo`;
}

export async function sendWelcomeEmail({
	to,
	name,
}: {
	to: string;
	name?: string | null;
}) {
	const apiKey = env.RESEND_API_KEY;

	if (!apiKey) {
		log.info("auth.welcome.skipped_no_api_key", { to });
		return;
	}

	const resend = new Resend(apiKey);
	const { error } = await resend.emails.send({
		from: WELCOME_FROM,
		replyTo: WELCOME_REPLY_TO,
		to: [to],
		subject: "Welcome to Foglamp",
		text: renderWelcomeText(name),
	});

	if (error) {
		throw new Error(`Resend request failed: ${error.name} — ${error.message}`);
	}
}

export async function sendOnboardingFollowUpEmail({
	to,
	name,
	milestoneDays,
	idempotencyKey,
}: {
	to: string;
	name?: string | null;
	milestoneDays: OnboardingEmailMilestone;
	idempotencyKey: string;
}) {
	const apiKey = env.RESEND_API_KEY;

	if (!apiKey) {
		log.info("auth.onboarding_follow_up.skipped_no_api_key", {
			to,
			milestoneDays,
		});
		return;
	}

	const resend = new Resend(apiKey);
	const email = renderOnboardingFollowUpEmail(milestoneDays, name);
	const { error } = await resend.emails.send(
		{
			from: WELCOME_FROM,
			replyTo: WELCOME_REPLY_TO,
			to: [to],
			subject: email.subject,
			text: email.text,
		},
		{ idempotencyKey },
	);

	if (error) {
		throw new Error(`Resend request failed: ${error.name}: ${error.message}`);
	}
}
