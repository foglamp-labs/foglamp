import { stripe as stripePlugin } from "@better-auth/stripe";
import { getOrgPlan, isBillingEnabled, PLAN_LIMITS } from "@foglamp/billing";
import { createClickHouseClient, updateOrgRetention } from "@foglamp/clickhouse";
import { createDb } from "@foglamp/db";
import * as schema from "@foglamp/db/schema/index";
import { invitation, member, organization } from "@foglamp/db/schema/organization";
import { project } from "@foglamp/db/schema/project";
import { env, getTrustedAppOrigins } from "@foglamp/env/server";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  bearer,
  deviceAuthorization,
  magicLink,
  organization as organizationPlugin,
} from "better-auth/plugins";
import { and, eq, gt } from "drizzle-orm";
import Stripe from "stripe";
import { uuidv7 } from "uuidv7";
import { sendInvitationEmail, sendMagicLinkEmail, sendResetPasswordEmail } from "./email";

// Tiny local slugify — we can't import from @foglamp/api (it depends on auth).
function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "workspace";
}

function getSharedCookieDomain(appUrl: string) {
  const hostname = new URL(appUrl).hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  ) {
    return null;
  }

  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

// Which sign-in methods this deployment offers, derived from configuration.
// Single source of truth for both the better-auth config below and the public
// /api/auth-methods endpoint the login page reads to decide what to render.
// Self-host default: email+password (no third-party setup needed) + magic link
// when email is configured. Hosted: sets AUTH_DISABLE_EMAIL_PASSWORD and the
// Google envs, yielding Google + magic link.
export function getAuthMethods() {
  return {
    emailPassword: !env.AUTH_DISABLE_EMAIL_PASSWORD,
    magicLink: Boolean(env.RESEND_API_KEY),
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  };
}

export function createAuth() {
  const db = createDb();

  const methods = getAuthMethods();
  const emailEnabled = methods.magicLink;
  const googleEnabled = methods.google;

  // The organization plugin owns organization/member/invitation (roles +
  // invites). Magic-link is added only when email is configured.
  const appOrigin = env.CORS_ORIGIN.replace(/\/$/, "");
  const plugins: BetterAuthPlugin[] = [
    organizationPlugin({
      sendInvitationEmail: async (data) => {
        await sendInvitationEmail({
          to: data.email,
          inviterName: data.inviter.user.name || "Someone",
          orgName: data.organization.name,
          url: `${appOrigin}/accept-invitation/${data.id}`,
        });
      },
    }),
    // OAuth device authorization grant (RFC 8628) — powers `npx foglamp login`:
    // the CLI gets a code, the user approves it at the web app's /device page,
    // and the CLI exchanges it for a session token. verificationUri points at
    // the web app (not BETTER_AUTH_URL, which is the API origin) so the user
    // lands on our themed approval page. Generous expiry — a first-time visitor
    // may sign up (magic-link email round-trip) before approving.
    deviceAuthorization({
      expiresIn: "15m",
      interval: "5s",
      verificationUri: `${appOrigin}/device`,
    }),
    // Lets the CLI authenticate follow-up calls (e.g. /api/cli/provision-key)
    // with `Authorization: Bearer <device-flow access_token>` instead of a
    // cookie — the plugin maps the token to a session for getSession.
    bearer(),
  ];
  if (emailEnabled) {
    plugins.push(
      magicLink({
        expiresIn: 60 * 15,
        sendMagicLink: async ({ email, url }) => {
          await sendMagicLinkEmail({ to: email, url });
        },
      }),
    );
  }

  // Billing — org-scoped Stripe subscriptions. Enabled only when configured
  // (self-host without billing simply omits the plugin). Only owner/admins of
  // the referenced org may manage its subscription. isBillingEnabled() owns
  // the definition of "configured" (secret key + webhook secret).
  if (isBillingEnabled()) {
    const stripeClient = new Stripe(env.STRIPE_SECRET_KEY!);
    const ch = createClickHouseClient({
      url: env.CLICKHOUSE_URL,
      username: env.CLICKHOUSE_USER,
      password: env.CLICKHOUSE_PASSWORD,
      database: env.CLICKHOUSE_DATABASE,
    });
    // On a plan change, extend the org's still-alive spans to the new plan's
    // retention. greatest() never shortens, so a downgrade leaves existing data
    // intact (new spans just get the lower value at ingest). Best-effort.
    const syncRetention = async (referenceId: string) => {
      try {
        const plan = await getOrgPlan(referenceId);
        const days = Math.min(plan.limits.retentionDays ?? 3650, 65535);
        await updateOrgRetention(ch, referenceId, days);
      } catch {
        /* a retention bump must never fail the webhook */
      }
    };
    plugins.push(
      stripePlugin({
        stripeClient,
        stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET!,
        createCustomerOnSignUp: false,
        subscription: {
          enabled: true,
          plans: [
            {
              name: "pro",
              priceId: env.STRIPE_PRICE_ID_PRO_MONTHLY ?? "",
              annualDiscountPriceId: env.STRIPE_PRICE_ID_PRO_ANNUAL,
              limits: PLAN_LIMITS.pro as unknown as Record<string, number>,
            },
          ],
          onSubscriptionComplete: async ({ subscription }) => {
            await syncRetention(subscription.referenceId);
          },
          onSubscriptionUpdate: async ({ subscription }) => {
            await syncRetention(subscription.referenceId);
          },
          authorizeReference: async ({ user, referenceId }) => {
            const rows = await db
              .select({ role: member.role })
              .from(member)
              .where(
                and(
                  eq(member.organizationId, referenceId),
                  eq(member.userId, user.id),
                ),
              )
              .limit(1);
            const role = rows[0]?.role;
            return role === "owner" || role === "admin";
          },
        },
      }),
    );
  }

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: schema,
    }),
    trustedOrigins: getTrustedAppOrigins(
      env.CORS_ORIGIN,
      env.CORS_EXTRA_ORIGINS
    ),
    emailAndPassword: {
      enabled: methods.emailPassword,
      // Without RESEND_API_KEY the sender logs the reset URL instead of
      // emailing it, which is the local-dev / self-host path.
      sendResetPassword: async ({ user, url }) => {
        await sendResetPasswordEmail({ to: user.email, url });
      },
      resetPasswordTokenExpiresIn: 60 * 60,
    },
    socialProviders: googleEnabled
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID as string,
            clientSecret: env.GOOGLE_CLIENT_SECRET as string,
          },
        }
      : undefined,
    session: {
      // Signed short-lived cookie so getSession avoids a DB round-trip on
      // most requests. Revocation lags by at most maxAge.
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // On signup, bootstrap a workspace so the user lands ready: an org, an
    // owner membership, and a default project. (No API key — its plaintext is
    // unrecoverable after creation, so the onboarding panel mints that itself.)
    // Wrapped so a bootstrap failure never blocks account creation.
    databaseHooks: {
      user: {
        create: {
          after: async (user: { id: string; email: string; name?: string }) => {
            try {
              // An invited user is joining an existing org via the invitation —
              // don't also create them a throwaway personal workspace. Only a
              // live invite counts: expired rows keep status='pending', and an
              // independent signup after expiry must still get a workspace.
              const pending = await db
                .select({ id: invitation.id })
                .from(invitation)
                .where(
                  and(
                    eq(invitation.email, user.email),
                    eq(invitation.status, "pending"),
                    gt(invitation.expiresAt, new Date()),
                  ),
                )
                .limit(1);
              if (pending[0]) return;

              const orgId = uuidv7();
              const local = user.name || user.email.split("@")[0] || "workspace";
              // Full uuid hex suffix → globally unique slug (no collision window).
              const slug = `${slugify(local)}-${orgId.replace(/-/g, "")}`;
              await db
                .insert(organization)
                .values({ id: orgId, name: "My Workspace", slug });
              await db.insert(member).values({
                id: uuidv7(),
                organizationId: orgId,
                userId: user.id,
                role: "owner",
              });
              await db.insert(project).values({
                id: uuidv7(),
                orgId,
                name: "Default",
                slug: "default",
              });
            } catch (err) {
              console.error("[auth] signup workspace bootstrap failed", err);
            }
          },
        },
      },
    },
    advanced: {
      crossSubDomainCookies: (() => {
        const domain = getSharedCookieDomain(env.CORS_ORIGIN);

        return domain
          ? {
              enabled: true,
              domain,
            }
          : undefined;
      })(),
      // SameSite=None requires Secure, and Secure cookies are never sent over
      // plain HTTP — so on an http:// origin (local dev, bare self-host) we
      // must fall back to Lax/insecure or login silently fails.
      defaultCookieAttributes: env.CORS_ORIGIN.startsWith("https://")
        ? { sameSite: "none" as const, secure: true, httpOnly: true }
        : { sameSite: "lax" as const, secure: false, httpOnly: true },
    },
    plugins,
  });
}

export const auth = createAuth();
