import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@foglamp/env/server";

// Unsubscribe links must work without a session (one click from the mail
// client), so they carry an HMAC over the (user, org) pair instead. Tokens do
// not expire: the worst an old link can do is opt someone out again.

function sign(payload: string): string {
	return createHmac("sha256", env.BETTER_AUTH_SECRET)
		.update(payload)
		.digest("base64url");
}

export function unsubscribeToken(userId: string, orgId: string): string {
	const payload = Buffer.from(`${userId}:${orgId}`).toString("base64url");
	return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(
	token: string,
): { userId: string; orgId: string } | null {
	const [payload, sig] = token.split(".");
	if (!payload || !sig) return null;
	const expected = sign(payload);
	const a = Buffer.from(sig);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
	const decoded = Buffer.from(payload, "base64url").toString();
	const idx = decoded.indexOf(":");
	if (idx <= 0) return null;
	return { userId: decoded.slice(0, idx), orgId: decoded.slice(idx + 1) };
}

export function unsubscribeUrl(userId: string, orgId: string): string {
	const base = env.BETTER_AUTH_URL.replace(/\/$/, "");
	return `${base}/unsubscribe?token=${encodeURIComponent(unsubscribeToken(userId, orgId))}`;
}
