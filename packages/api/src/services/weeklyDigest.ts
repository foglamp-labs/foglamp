import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
	type DigestMetric,
	type DigestProject,
	renderQuietWeekEmail,
	renderWeeklyDigestEmail,
	sendDigestEmail,
} from "@foglamp/auth/weeklyDigestEmail";
import { getOrgPlan } from "@foglamp/billing";
import { evalListSummary, queryProjectSummary } from "@foglamp/clickhouse";
import { alertEvent, alertRule } from "@foglamp/db/schema/alert";
import { user } from "@foglamp/db/schema/auth";
import { member, organization } from "@foglamp/db/schema/organization";
import { project } from "@foglamp/db/schema/project";
import {
	notificationPreference,
	weeklyDigest,
} from "@foglamp/db/schema/weeklyDigest";
import { env } from "@foglamp/env/server";
import { generateText } from "ai";
import { and, count, eq, gte, lt, lte, or, sql } from "drizzle-orm";
import { foglamp } from "foglamp";
import { uuidv7 } from "uuidv7";

import { unsubscribeUrl } from "../lib/unsubscribe";
import { mapLimit, num, toClickHouseDateTime, ymd } from "../lib/util";
import type { Ch, Db, Log } from "../types";
import { ADMIN } from "./access";
import { evalPassThresholds } from "./evals";

// --- Schedule ----------------------------------------------------------------

const SEND_HOUR_UTC = 8;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PROJECTS = 3;
const CONCURRENCY = 4;
const CLAIM_LEASE_MS = 15 * 60 * 1000;
const SUMMARY_TIMEOUT_MS = 10_000;

/** Monday 00:00 UTC of the week containing `d`. */
function mondayOf(d: Date): Date {
	const day = new Date(
		Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
	);
	const offset = (day.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
	day.setUTCDate(day.getUTCDate() - offset);
	return day;
}

/**
 * The week a digest sent at `now` should cover: the most recent Monday..Sunday
 * whose send time (Monday 08:00 UTC after the week ends) has already passed.
 * Returns null before the very first eligible send time.
 */
export function dueWeek(now: Date): { weekStart: Date; weekEnd: Date } | null {
	const thisMonday = mondayOf(now);
	const sendAt = new Date(
		thisMonday.getTime() + SEND_HOUR_UTC * 60 * 60 * 1000,
	);
	// Before 08:00 on Monday, last week's digest is not due yet; cover the week
	// before it (which is already sent, so the unique row makes this a no-op).
	const weekEnd =
		now >= sendAt ? thisMonday : new Date(thisMonday.getTime() - WEEK_MS);
	return { weekStart: new Date(weekEnd.getTime() - WEEK_MS), weekEnd };
}

// --- Metrics -----------------------------------------------------------------

type ProjectStats = {
	spans: number;
	cost: number;
	errorRate: number;
	p95: number;
	alerts: number;
	evalScore: number | null;
};

async function projectStats(
	db: Db,
	ch: Ch,
	projectId: string,
	from: Date,
	to: Date,
): Promise<ProjectStats> {
	const range = {
		from: toClickHouseDateTime(from),
		to: toClickHouseDateTime(to),
	};
	const thresholds = await evalPassThresholds(db, projectId);
	const [summary, evals, alerts] = await Promise.all([
		queryProjectSummary(ch, { projectId, ...range }),
		Object.keys(thresholds).length
			? evalListSummary(ch, { projectId, ...range, thresholds })
			: Promise.resolve([]),
		db
			.select({ n: count() })
			.from(alertEvent)
			.innerJoin(alertRule, eq(alertRule.id, alertEvent.ruleId))
			.where(
				and(
					eq(alertRule.projectId, projectId),
					eq(alertEvent.type, "fired"),
					gte(alertEvent.createdAt, from),
					lt(alertEvent.createdAt, to),
				),
			),
	]);
	const spans = num(summary.span_count);
	const scoreSum = evals.reduce((s, r) => s + num(r.score_sum), 0);
	const scored = evals.reduce((s, r) => s + num(r.scored_count), 0);
	return {
		spans,
		cost: num(summary.total_cost),
		errorRate: spans ? num(summary.error_count) / spans : 0,
		p95: summary.duration_quantiles[1] ?? 0,
		alerts: alerts[0]?.n ?? 0,
		evalScore: scored ? scoreSum / scored : null,
	};
}

function delta(now: number, before: number): number | null {
	if (before === 0) return now === 0 ? 0 : null;
	return ((now - before) / before) * 100;
}

const fmtInt = (n: number) =>
	n >= 1_000_000
		? `${(n / 1_000_000).toFixed(1)}M`
		: n >= 10_000
			? `${(n / 1_000).toFixed(1)}K`
			: n.toLocaleString("en-US");
const fmtCost = (n: number) =>
	n < 0.01 && n > 0 ? "<$0.01" : `$${n.toFixed(2)}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtMs = (n: number) =>
	n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`;

function toMetrics(now: ProjectStats, before: ProjectStats): DigestMetric[] {
	const m: DigestMetric[] = [
		{
			label: "Spans",
			icon: "spans",
			value: fmtInt(now.spans),
			deltaPct: delta(now.spans, before.spans),
			higherIsWorse: false,
		},
		{
			label: "Cost",
			icon: "cost",
			value: fmtCost(now.cost),
			deltaPct: delta(now.cost, before.cost),
			higherIsWorse: true,
		},
		{
			label: "Errors",
			icon: "errors",
			value: fmtPct(now.errorRate),
			deltaPct: delta(now.errorRate, before.errorRate),
			higherIsWorse: true,
		},
		{
			label: "p95",
			icon: "p95",
			value: fmtMs(now.p95),
			deltaPct: delta(now.p95, before.p95),
			higherIsWorse: true,
		},
	];
	if (now.alerts > 0) {
		m.push({
			label: "Alerts",
			icon: "alerts",
			value: String(now.alerts),
			deltaPct: delta(now.alerts, before.alerts),
			higherIsWorse: true,
		});
	}
	if (now.evalScore !== null) {
		m.push({
			label: "Eval score",
			icon: "eval",
			value: now.evalScore.toFixed(2),
			deltaPct:
				before.evalScore === null
					? null
					: delta(now.evalScore, before.evalScore),
			higherIsWorse: false,
		});
	}
	return m;
}

export type OrgDigest = {
	orgName: string;
	rangeLabel: string;
	projects: (DigestProject & { stats: ProjectStats; previous: ProjectStats })[];
	moreProjects: number;
	totalSpans: number;
};

const MONTH_DAY = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});

export async function computeOrgDigest(
	db: Db,
	ch: Ch,
	orgId: string,
	weekStart: Date,
	weekEnd: Date,
): Promise<OrgDigest | null> {
	const [org] = await db
		.select({ name: organization.name })
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);
	if (!org) return null;

	const projects = await db
		.select({ id: project.id, name: project.name, url: project.url })
		.from(project)
		.where(eq(project.orgId, orgId));
	const prevStart = new Date(weekStart.getTime() - WEEK_MS);
	const base = env.CORS_ORIGIN.replace(/\/$/, "");

	const rows = await mapLimit(projects, CONCURRENCY, async (p) => {
		const [stats, previous] = await Promise.all([
			projectStats(db, ch, p.id, weekStart, weekEnd),
			projectStats(db, ch, p.id, prevStart, weekStart),
		]);
		return {
			name: p.name,
			url: `${base}/?project=${encodeURIComponent(p.id)}`,
			siteUrl: p.url ?? null,
			metrics: toMetrics(stats, previous),
			stats,
			previous,
		};
	});
	rows.sort((a, b) => b.stats.spans - a.stats.spans);
	const lastDay = new Date(weekEnd.getTime() - 1);
	return {
		orgName: org.name,
		rangeLabel: `${MONTH_DAY.format(weekStart)} to ${MONTH_DAY.format(lastDay)}`,
		projects: rows.slice(0, MAX_PROJECTS),
		moreProjects: Math.max(0, rows.length - MAX_PROJECTS),
		totalSpans: rows.reduce((s, r) => s + r.stats.spans, 0),
	};
}

// --- AI summary (paid tiers) -------------------------------------------------

const google = env.GOOGLE_GENERATIVE_AI_API_KEY
	? createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })
	: null;
const fog = foglamp();

const SUMMARY_SYSTEM = `You write the opening paragraph of a weekly engineering digest email about LLM agent observability.
Rules:
- One paragraph, 2 to 4 short sentences, at most 80 words.
- Plain text only. No markdown, no bullet points, no headings, no emoji.
- Never use em dashes or en dashes. Use commas or periods instead.
- Lead with the most important change (a big move in errors, latency, cost, or traffic). Mention concrete numbers with their direction.
- Only use the numbers given, and copy them exactly as they are written. They are already formatted for reading: compact counts like "36.9K spans" or "1.2M spans", costs like "$23.36", rates like "1.8%", latency like "940 ms" or "2.1 s". Never expand them into long digits like 36,934.
- Only use the numbers given. Do not speculate about causes.
- Refer to projects by name. Do not greet the reader or sign off.`;

function describeForModel(digest: OrgDigest): string {
	const lines = digest.projects.map((p) => {
		const s = p.stats;
		const b = p.previous;
		return `${p.name}: ${fmtInt(s.spans)} spans (last week ${fmtInt(b.spans)}); cost ${fmtCost(s.cost)} (last week ${fmtCost(b.cost)}); error rate ${fmtPct(s.errorRate)} (last week ${fmtPct(b.errorRate)}); p95 latency ${fmtMs(s.p95)} (last week ${fmtMs(b.p95)}); alerts fired ${s.alerts} (last week ${b.alerts})${
			s.evalScore !== null
				? `; eval score ${s.evalScore.toFixed(2)} (last week ${b.evalScore?.toFixed(2) ?? "none"})`
				: ""
		}`;
	});
	return `Organization: ${digest.orgName}\nWeek: ${digest.rangeLabel}\n${lines.join("\n")}${
		digest.moreProjects
			? `\n(${digest.moreProjects} smaller projects not shown)`
			: ""
	}`;
}

/** Strips the dashes the prompt forbids in case the model ignores it. */
export function sanitizeSummary(text: string): string {
	return text
		.replace(/\s*[—–]\s*/g, ", ")
		.replace(/[*_#`>]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

async function writeSummary(
	digest: OrgDigest,
	orgId: string,
	log: Log,
): Promise<string | undefined> {
	if (!google) return undefined;
	try {
		const { text } = await generateText({
			model: google(env.WEEKLY_DIGEST_MODEL ?? env.FOGGY_MODEL),
			system: SUMMARY_SYSTEM,
			prompt: describeForModel(digest),
			maxOutputTokens: 200,
			abortSignal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
			telemetry: {
				integrations: [
					fog.integration({
						agentName: "weekly-digest",
						customer: { id: orgId, name: digest.orgName },
						metadata: { week: digest.rangeLabel },
					}),
				],
			},
		});
		const clean = sanitizeSummary(text);
		return clean.length > 20 ? clean : undefined;
	} catch (err) {
		log.warn("digest.summary_failed", {
			orgId,
			error: err instanceof Error ? err.message : String(err),
		});
		return undefined;
	}
}

// --- Recipients --------------------------------------------------------------

export function digestDefaultForRole(role: string): boolean {
	return (ADMIN as readonly string[]).includes(role);
}

async function resolveRecipients(db: Db, orgId: string) {
	const rows = await db
		.select({
			userId: user.id,
			email: user.email,
			role: member.role,
			pref: notificationPreference.weeklyDigest,
		})
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.leftJoin(
			notificationPreference,
			and(
				eq(notificationPreference.userId, member.userId),
				eq(notificationPreference.orgId, member.organizationId),
			),
		)
		.where(eq(member.organizationId, orgId));
	return rows.filter((r) => r.pref ?? digestDefaultForRole(r.role));
}

// --- Sweep -------------------------------------------------------------------

export type WeeklyDigestResult = {
	enqueued: number;
	considered: number;
	sent: number;
	nudged: number;
	skipped: number;
	failed: number;
};

function claimable(now: Date) {
	const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS);
	return or(
		eq(weeklyDigest.status, "pending"),
		and(
			eq(weeklyDigest.status, "claimed"),
			lt(weeklyDigest.claimedAt, staleBefore),
		),
	);
}

/**
 * Enqueue one row per org for the week that is due, then process claimable
 * rows: compute the digest, write the optional AI paragraph, and email every
 * opted-in member. A week with zero spans org-wide sends a single nudge (once
 * per silent stretch) and otherwise stays quiet.
 */
export async function evaluateWeeklyDigests(
	db: Db,
	ch: Ch,
	log: Log,
	now = new Date(),
): Promise<WeeklyDigestResult> {
	const result: WeeklyDigestResult = {
		enqueued: 0,
		considered: 0,
		sent: 0,
		nudged: 0,
		skipped: 0,
		failed: 0,
	};
	const due = dueWeek(now);
	if (!due) return result;
	const weekStartYmd = ymd(due.weekStart);

	// Idempotent enqueue: the (org, week) unique key makes re-runs no-ops.
	const orgs = await db.select({ id: organization.id }).from(organization);
	if (orgs.length) {
		const inserted = await db
			.insert(weeklyDigest)
			.values(orgs.map((o) => ({ orgId: o.id, weekStart: weekStartYmd })))
			.onConflictDoNothing()
			.returning({ id: weeklyDigest.id });
		result.enqueued = inserted.length;
	}

	const candidates = await db
		.select({
			id: weeklyDigest.id,
			orgId: weeklyDigest.orgId,
			weekStart: weeklyDigest.weekStart,
		})
		.from(weeklyDigest)
		.where(and(lte(weeklyDigest.weekStart, weekStartYmd), claimable(now)))
		.limit(200);
	result.considered = candidates.length;

	const base = env.CORS_ORIGIN.replace(/\/$/, "");

	await mapLimit(candidates, CONCURRENCY, async (candidate) => {
		const claimToken = uuidv7();
		const claimed = await db
			.update(weeklyDigest)
			.set({ status: "claimed", claimToken, claimedAt: now })
			.where(and(eq(weeklyDigest.id, candidate.id), claimable(now)))
			.returning({ id: weeklyDigest.id });
		if (!claimed[0]) return;
		const owned = eq(weeklyDigest.claimToken, claimToken);

		const finish = (outcome: string, recipients: number) =>
			db
				.update(weeklyDigest)
				.set({
					status: outcome === "skipped" ? "skipped" : "sent",
					outcome,
					recipients,
					sentAt: new Date(),
					claimToken: null,
					claimedAt: null,
				})
				.where(and(eq(weeklyDigest.id, candidate.id), owned));

		try {
			const weekStart = new Date(`${candidate.weekStart}T00:00:00Z`);
			const weekEnd = new Date(weekStart.getTime() + WEEK_MS);
			const recipients = await resolveRecipients(db, candidate.orgId);
			if (recipients.length === 0) {
				await finish("no_recipients", 0);
				result.skipped += 1;
				return;
			}

			const digest = await computeOrgDigest(
				db,
				ch,
				candidate.orgId,
				weekStart,
				weekEnd,
			);
			if (!digest) {
				await finish("skipped", 0);
				result.skipped += 1;
				return;
			}

			if (digest.totalSpans === 0) {
				const [org] = await db
					.select({ nudgedAt: organization.digestNudgedAt })
					.from(organization)
					.where(eq(organization.id, candidate.orgId))
					.limit(1);
				if (org?.nudgedAt) {
					await finish("quiet", 0);
					result.skipped += 1;
					return;
				}
				await Promise.all(
					recipients.map((r) => {
						const unsub = unsubscribeUrl(r.userId, candidate.orgId);
						const mail = renderQuietWeekEmail({
							orgName: digest.orgName,
							setupUrl: `${base}/settings`,
							unsubscribeUrl: unsub,
						});
						return sendDigestEmail({
							to: r.email,
							...mail,
							unsubscribeUrl: unsub,
							idempotencyKey: `digest-${candidate.id}-${r.userId}`,
						});
					}),
				);
				await db
					.update(organization)
					.set({ digestNudgedAt: new Date() })
					.where(eq(organization.id, candidate.orgId));
				await finish("nudge", recipients.length);
				result.nudged += 1;
				return;
			}

			const plan = await getOrgPlan(candidate.orgId);
			const summary =
				plan.plan === "free"
					? undefined
					: await writeSummary(digest, candidate.orgId, log);

			await Promise.all(
				recipients.map((r) => {
					const unsub = unsubscribeUrl(r.userId, candidate.orgId);
					const mail = renderWeeklyDigestEmail({
						orgName: digest.orgName,
						rangeLabel: digest.rangeLabel,
						summary,
						projects: digest.projects.map(
							({ name, url, siteUrl, metrics }) => ({
								name,
								url,
								siteUrl,
								metrics,
							}),
						),
						moreProjects: digest.moreProjects,
						moreProjectsUrl: `${base}/settings/org?tab=projects`,
						unsubscribeUrl: unsub,
					});
					return sendDigestEmail({
						to: r.email,
						...mail,
						unsubscribeUrl: unsub,
						idempotencyKey: `digest-${candidate.id}-${r.userId}`,
					});
				}),
			);
			// Traffic is back: a future quiet week should nudge again.
			await db
				.update(organization)
				.set({ digestNudgedAt: null })
				.where(eq(organization.id, candidate.orgId));
			await finish("digest", recipients.length);
			result.sent += 1;
		} catch (err) {
			result.failed += 1;
			await db
				.update(weeklyDigest)
				.set({ status: "pending", claimToken: null, claimedAt: null })
				.where(and(eq(weeklyDigest.id, candidate.id), owned));
			log.error("digest.failed", {
				digestId: candidate.id,
				orgId: candidate.orgId,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	});

	log.info("digest.sweep", result);
	return result;
}

// --- Preferences (settings UI + unsubscribe) ---------------------------------

export async function listDigestPreferences(db: Db, userId: string) {
	const rows = await db
		.select({
			orgId: organization.id,
			orgName: organization.name,
			role: member.role,
			pref: notificationPreference.weeklyDigest,
		})
		.from(member)
		.innerJoin(organization, eq(organization.id, member.organizationId))
		.leftJoin(
			notificationPreference,
			and(
				eq(notificationPreference.userId, member.userId),
				eq(notificationPreference.orgId, member.organizationId),
			),
		)
		.where(eq(member.userId, userId))
		.orderBy(organization.name);
	return rows.map((r) => ({
		orgId: r.orgId,
		orgName: r.orgName,
		role: r.role,
		weeklyDigest: r.pref ?? digestDefaultForRole(r.role),
	}));
}

export async function setDigestPreference(
	db: Db,
	userId: string,
	orgId: string,
	enabled: boolean,
): Promise<boolean> {
	const [membership] = await db
		.select({ id: member.id })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
		.limit(1);
	if (!membership) return false;
	await db
		.insert(notificationPreference)
		.values({ userId, orgId, weeklyDigest: enabled })
		.onConflictDoUpdate({
			target: [notificationPreference.userId, notificationPreference.orgId],
			set: { weeklyDigest: enabled, updatedAt: sql`now()` },
		});
	return true;
}
