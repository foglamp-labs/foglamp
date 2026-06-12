import { env } from "@foglamp/env/server";
import { createLogger } from "evlog";
import { Resend } from "resend";

const DEFAULT_FROM = "Foglamp <onboarding@foglamp.dev>";

const log = createLogger();

// --- Shared email chrome -----------------------------------------------------
// All templates render onto one layout so they read like the product: Inter
// type, the near-black/neutral palette and 10–14px radii from the UI theme, a
// white card on a soft gray canvas, and the Foglamp logo lockup in the header.

// Mirrors the UI theme tokens (globals.css): --foreground, --muted-foreground,
// --border, a soft canvas, and the near-black primary button.
const C = {
	canvas: "#f4f4f5",
	card: "#ffffff",
	border: "#ebebeb",
	text: "#171717",
	muted: "#737373",
	buttonBg: "#171717",
	buttonText: "#fafafa",
};

// Inter first (matches the app), then the usual cross-client system fallbacks.
const FONT =
	"'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Escape interpolated, user-influenced values (org/rule names, links) so they
// can't break out of the surrounding HTML. `&` first, then the rest.
function esc(value: string): string {
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
	return `<img src="${esc(`${base}/wordmark-light.png`)}" alt="Foglamp" width="132" style="display:block; width:132px; height:auto; border:0; outline:none; text-decoration:none;" />`;
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
function emailLayout(opts: {
	previewText: string;
	title: string;
	body: string;
	eyebrow?: { label: string; color?: string };
	cta?: { label: string; url: string };
	footnote?: string;
}): string {
	const { previewText, title, body, eyebrow, cta, footnote } = opts;
	const eyebrowHtml = eyebrow
		? `<p style="margin:0 0 10px; font-family:${FONT}; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:${eyebrow.color ?? C.muted};">${eyebrow.label}</p>`
		: "";
	const ctaHtml = cta
		? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;">
                  <tr>
                    <td style="border-radius:9px; background:${C.buttonBg};">
                      <a href="${esc(cta.url)}" style="display:inline-block; padding:11px 20px; font-family:${FONT}; font-size:14px; font-weight:500; line-height:1; color:${C.buttonText}; text-decoration:none; border-radius:9px;">${cta.label}</a>
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
              <td style="padding:0 4px 20px;">${logo()}</td>
            </tr>
            <tr>
              <td style="background:${C.card}; border:1px solid ${C.border}; border-radius:14px; padding:32px;">
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
		html: renderHtml(url),
		text: renderText(url),
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
		html: emailLayout({
			previewText: "Reset your Foglamp password — expires in 1 hour.",
			title: "Reset your password",
			body: `<p style="margin:0;">Click the button below to choose a new password.</p>`,
			cta: { label: "Reset password", url },
			footnote:
				"This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email — your password is unchanged.",
		}),
		text: `Reset your Foglamp password

Open the link below to choose a new password. This link expires in 1 hour.

${url}

If you didn't request a reset, you can safely ignore this email — your password is unchanged.`,
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

function renderInviteHtml(p: {
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

function renderInviteText(p: {
	inviterName: string;
	orgName: string;
	url: string;
}) {
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
	const html = emailLayout({
		previewText: `${orgName} has used ${pct}% of its monthly span quota.`,
		eyebrow: { label: "Span quota", color: "#d97706" },
		title: `${esc(orgName)} has used ${pct}% of its monthly span quota`,
		body: `<p style="margin:0;">New spans are rejected once you exceed the quota. Upgrade to keep ingesting without interruption.</p>`,
		cta: { label: "Review billing", url },
	});
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
	return emailLayout({
		previewText: `Alert ${p.verb}: ${p.ruleName}`,
		eyebrow: { label: `Alert ${p.verb}`, color: accent },
		title: esc(p.ruleName),
		body: detailRows([
			["Project", esc(p.projectName)],
			["Metric", esc(p.metricLabel)],
			["Condition", esc(p.conditionLabel)],
			[
				"Current value",
				`<strong style="font-weight:600;">${esc(p.value)}</strong>`,
			],
			["Window", esc(p.windowLabel)],
		]),
		cta: { label: "Open in Foglamp", url: p.url },
	});
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
	return emailLayout({
		previewText: "Your Foglamp sign-in link — expires in 15 minutes.",
		title: "Sign in to Foglamp",
		body: `<p style="margin:0;">Click the button below to access your account.</p>`,
		cta: { label: "Sign in", url },
		footnote:
			"This link expires in 15 minutes. If you didn't request it, you can safely ignore this email.",
	});
}

function renderText(url: string) {
	return `Sign in to Foglamp

Click the link below to access your account. This link expires in 15 minutes.

${url}

If you didn't request this email, you can safely ignore it.`;
}
