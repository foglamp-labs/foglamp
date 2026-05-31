import { stripe as stripePlugin } from "@better-auth/stripe";
import { getOrgPlan, PLAN_LIMITS } from "@foglamp/billing";
import { createClickHouseClient, updateOrgRetention } from "@foglamp/clickhouse";
import { createDb } from "@foglamp/db";
import * as schema from "@foglamp/db/schema/index";
import { member, organization } from "@foglamp/db/schema/organization";
import { project } from "@foglamp/db/schema/project";
import { env, getTrustedAppOrigins } from "@foglamp/env/server";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, organization as organizationPlugin } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import { uuidv7 } from "uuidv7";
import { sendInvitationEmail, sendMagicLinkEmail } from "./email";

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

export function createAuth() {
  const db = createDb();

  // Email+password is the always-on floor so a self-host works without any
  // third-party setup. Magic-link and Google layer on only when configured.
  const emailEnabled = Boolean(env.RESEND_API_KEY);
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

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
  // the referenced org may manage its subscription.
  if (env.STRIPE_SECRET_KEY) {
    const stripeClient = new Stripe(env.STRIPE_SECRET_KEY);
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
        stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? "",
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
      enabled: true,
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
              const orgId = uuidv7();
              const local = user.name || user.email.split("@")[0] || "workspace";
              const slug = `${slugify(local)}-${orgId.replace(/-/g, "").slice(0, 12)}`;
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
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins,
  });
}

export const auth = createAuth();
