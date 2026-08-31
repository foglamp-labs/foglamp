import { env } from "@foglamp/env/server";
import { createLogger } from "evlog";
import { Resend } from "resend";

import {
	EMAIL_COLORS as C,
	EMAIL_FONT as FONT,
	emailLayout,
	esc,
	projectFaviconUrl,
	projectPlaceholderIcon,
} from "./email";

const log = createLogger();

// --- Data shape (computed by the API service, rendered here) -----------------

export type DigestMetricIcon =
	| "spans"
	| "cost"
	| "errors"
	| "p95"
	| "alerts"
	| "eval";

export type DigestMetric = {
	label: string;
	/** Which PNG from apps/web/public/email to show before the label. */
	icon: DigestMetricIcon;
	/** Already formatted for display, e.g. "12.4k", "$3.20", "1.8%", "940 ms". */
	value: string;
	/** Week-over-week change in percent; null when last week had no baseline. */
	deltaPct: number | null;
	/** Whether a rise is bad (errors, latency, cost) or good (traffic). */
	higherIsWorse: boolean;
};

export type DigestProject = {
	name: string;
	/** Deep link into the dashboard. */
	url: string;
	/** The project's own website, used for its favicon (same as the app). */
	siteUrl: string | null;
	metrics: DigestMetric[];
};

export type WeeklyDigestEmailData = {
	orgName: string;
	/** "Aug 24 to Aug 30" */
	rangeLabel: string;
	/** Paid-tier AI paragraph; omitted for the deterministic email. */
	summary?: string;
	projects: DigestProject[];
	/** Projects beyond the ones listed. */
	moreProjects: number;
	moreProjectsUrl: string;
	unsubscribeUrl: string;
};

// --- Rendering ---------------------------------------------------------------

// Email clients do not render inline SVG, so icons are PNGs rasterized from
// the same Tabler icons the app uses, served from the web app's public dir.
const assetBase = () =>
	`${env.CORS_ORIGIN.replace(/\/$/, "")}/email`;

const img = (name: string, size: number, alt = "") =>
	`<img src="${esc(`${assetBase()}/${name}.png`)}" alt="${esc(alt)}" width="${size}" height="${size}" style="display:inline-block; width:${size}px; height:${size}px; border:0; vertical-align:middle;" />`;

// Mirrors apps/web ProjectIcon: favicon of the project's site, else one of a
// fixed set of placeholder icons picked from the first letter of the name
// (helpers shared with the alert email in ./email).
function projectIcon(p: DigestProject): string {
	const box =
		"display:block; width:16px; height:16px; border-radius:4px; border:0;";
	if (p.siteUrl) {
		return `<img src="${esc(projectFaviconUrl(p.siteUrl))}" alt="" width="16" height="16" style="${box}" />`;
	}
	return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td align="center" valign="middle" style="width:16px; height:16px; border-radius:4px; background:#ededed; line-height:0; font-size:0;">${img(`project-${projectPlaceholderIcon(p.name)}`, 10)}</td></tr></table>`;
}

function fmtDelta(m: DigestMetric): {
	text: string;
	color: string;
	icon: string | null;
} {
	if (m.deltaPct === null) return { text: "new", color: C.muted, icon: null };
	// No change: render nothing rather than a "flat" label.
	if (Math.abs(m.deltaPct) < 0.5)
		return { text: "", color: C.muted, icon: null };
	const up = m.deltaPct > 0;
	const bad = up === m.higherIsWorse;
	const pct =
		Math.abs(m.deltaPct) >= 1000 ? ">999" : Math.abs(m.deltaPct).toFixed(0);
	return {
		text: `${pct}%`,
		color: bad ? "#dc2626" : "#16a34a",
		icon: `${up ? "up" : "down"}-${bad ? "bad" : "good"}`,
	};
}

// Plain-text delta for the text/plain part.
function fmtDeltaText(m: DigestMetric): string {
	const d = fmtDelta(m);
	if (!d.icon) return d.text;
	return `${d.icon.startsWith("up") ? "up" : "down"} ${d.text}`;
}

function metricCell(m: DigestMetric): string {
	const d = fmtDelta(m);
	const deltaHtml = d.icon
		? `${img(d.icon, 14)}<span style="vertical-align:middle;">&nbsp;${esc(d.text)}</span>`
		: esc(d.text);
	return `<td width="25%" valign="top" style="padding:14px 8px 0 0;">
        <div style="font-family:${FONT}; font-size:11px; line-height:14px; text-transform:uppercase; letter-spacing:0.04em; color:${C.muted}; white-space:nowrap;">${img(m.icon, 12)}<span style="vertical-align:middle;">&nbsp;${esc(m.label)}</span></div>
        <div style="font-family:${FONT}; font-size:17px; line-height:22px; font-weight:600; color:${C.text}; margin-top:6px;">${esc(m.value)}</div>
        <div style="font-family:${FONT}; font-size:12px; line-height:16px; color:${d.color}; margin-top:2px; white-space:nowrap;">${deltaHtml}</div>
      </td>`;
}

function projectBlock(p: DigestProject): string {
	// Four metrics per row so every row is a full-width, evenly spaced grid.
	const rows: string[] = [];
	for (let i = 0; i < p.metrics.length; i += 4) {
		const cells = p.metrics.slice(i, i + 4).map(metricCell);
		while (cells.length < 4) cells.push('<td width="25%"></td>');
		rows.push(`<tr>${cells.join("")}</tr>`);
	}
	return `<tr>
    <td style="padding:20px 0; border-top:1px solid ${C.border};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
        <td valign="middle" width="16" style="padding-right:8px; line-height:0; font-size:0;">${projectIcon(p)}</td>
        <td valign="middle" style="line-height:16px;"><a href="${esc(p.url)}" style="display:inline-block; font-family:${FONT}; font-size:15px; line-height:16px; font-weight:600; color:${C.text}; text-decoration:none;">${esc(p.name)}</a></td>
      </tr></table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; table-layout:fixed;">${rows.join("")}</table>
    </td>
  </tr>`;
}

export function renderWeeklyDigestEmail(data: WeeklyDigestEmailData): {
	subject: string;
	html: string;
	text: string;
} {
	const subject = `${data.orgName}: your week on Foglamp`;
	const summaryHtml = data.summary
		? `<p style="margin:0 0 18px; font-family:${FONT}; font-size:14px; line-height:1.6; color:${C.text};">${esc(data.summary)}</p>`
		: "";
	const projectsHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${data.projects
		.map(projectBlock)
		.join("")}</table>`;
	const moreHtml =
		data.moreProjects > 0
			? `<p style="margin:12px 0 0; font-family:${FONT}; font-size:13px; color:${C.muted};"><a href="${esc(data.moreProjectsUrl)}" style="color:${C.muted};">and ${data.moreProjects} more ${data.moreProjects === 1 ? "project" : "projects"}</a></p>`
			: "";

	const html = emailLayout({
		previewText:
			data.summary ?? `Weekly numbers for ${data.orgName}, ${data.rangeLabel}.`,
		eyebrow: { label: esc(data.rangeLabel) },
		title: esc(data.orgName),
		body: `${summaryHtml}${projectsHtml}${moreHtml}`,
		footnote: `You receive this every Monday because you are a member of ${esc(data.orgName)}. <a href="${esc(data.unsubscribeUrl)}" style="color:${C.muted};">Unsubscribe</a>`,
	});

	const textProjects = data.projects
		.map(
			(p) =>
				`${p.name}\n${p.metrics
					.map((m) => {
						const d = fmtDeltaText(m);
						return `  ${m.label}: ${m.value}${d ? ` (${d})` : ""}`;
					})
					.join("\n")}\n  ${p.url}`,
		)
		.join("\n\n");
	const text = [
		`${data.orgName}, weekly digest, ${data.rangeLabel}`,
		data.summary ?? "",
		textProjects,
		data.moreProjects > 0
			? `and ${data.moreProjects} more: ${data.moreProjectsUrl}`
			: "",
		`Unsubscribe: ${data.unsubscribeUrl}`,
	]
		.filter(Boolean)
		.join("\n\n");

	return { subject, html, text };
}

export function renderQuietWeekEmail(data: {
	orgName: string;
	setupUrl: string;
	unsubscribeUrl: string;
}): { subject: string; html: string; text: string } {
	const subject = `${data.orgName} sent no traces this week`;
	const html = emailLayout({
		previewText: `No traces arrived for ${data.orgName} this week.`,
		eyebrow: { label: "Weekly digest" },
		title: "A quiet week",
		body: `<p style="margin:0;">${esc(data.orgName)} sent no traces in the last seven days, so there is nothing to summarize. Once your agents report again the weekly digest picks back up on its own.</p>`,
		cta: { label: "Instrument your app", url: data.setupUrl },
		footnote: `We will stay quiet until traffic returns. <a href="${esc(data.unsubscribeUrl)}" style="color:${C.muted};">Unsubscribe</a>`,
	});
	const text = `${data.orgName} sent no traces in the last seven days. Instrument your app: ${data.setupUrl}\n\nUnsubscribe: ${data.unsubscribeUrl}`;
	return { subject, html, text };
}

// --- Sending -----------------------------------------------------------------

export async function sendDigestEmail(params: {
	to: string;
	subject: string;
	html: string;
	text: string;
	unsubscribeUrl: string;
	idempotencyKey: string;
}): Promise<void> {
	const apiKey = env.RESEND_API_KEY;
	if (!apiKey) {
		log.info("digest.email.skipped_no_api_key", { to: params.to });
		return;
	}
	const resend = new Resend(apiKey);
	const { error } = await resend.emails.send(
		{
			from: env.WEEKLY_DIGEST_FROM,
			to: [params.to],
			subject: params.subject,
			html: params.html,
			text: params.text,
			headers: {
				// One-click unsubscribe (RFC 8058), required by Gmail/Yahoo bulk rules.
				"List-Unsubscribe": `<${params.unsubscribeUrl}>`,
				"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
			},
		},
		{ idempotencyKey: params.idempotencyKey },
	);
	if (error) {
		throw new Error(`Resend request failed: ${error.name}: ${error.message}`);
	}
}
