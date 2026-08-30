import { verifyUnsubscribeToken } from "@foglamp/api/lib/unsubscribe";
import { setDigestPreference } from "@foglamp/api/services/weeklyDigest";
import { db } from "@foglamp/db";
import { env } from "@foglamp/env/server";
import type { Context } from "hono";

import type { AppEnv } from "./evlog";

function page(title: string, body: string, status: 200 | 400) {
	const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;background:#f4f4f5;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717}
main{max-width:420px;margin:15vh auto;background:#fff;border:1px solid #ebebeb;border-radius:14px;padding:32px}h1{font-size:20px;margin:0 0 10px}p{font-size:14px;line-height:1.6;color:#525252;margin:0}a{color:#171717}</style></head>
<body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;
	return { html, status };
}

/**
 * One-click unsubscribe from the weekly digest. GET is what a human clicks in
 * the email footer; POST is what mail clients send for the List-Unsubscribe
 * header (RFC 8058). Both flip the (user, org) preference off and render a
 * tiny confirmation. No session required: the token is the authorization.
 */
export async function handleUnsubscribe(c: Context<AppEnv>) {
	const token = c.req.query("token") ?? "";
	const parsed = verifyUnsubscribeToken(token);
	if (!parsed) {
		const { html, status } = page(
			"This link is not valid",
			"The unsubscribe link is malformed. You can manage email preferences from your account settings.",
			400,
		);
		return c.html(html, status);
	}
	const ok = await setDigestPreference(db, parsed.userId, parsed.orgId, false);
	const settings = `${env.CORS_ORIGIN.replace(/\/$/, "")}/settings/org?tab=notifications`;
	const { html, status } = ok
		? page(
				"You are unsubscribed",
				`You will no longer receive the weekly digest for this organization. Changed your mind? <a href="${settings}">Turn it back on in settings</a>.`,
				200,
			)
		: page(
				"Nothing to change",
				"You are no longer a member of that organization, so no digest is being sent.",
				200,
			);
	return c.html(html, status);
}
