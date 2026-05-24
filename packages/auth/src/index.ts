import { createDb } from "@watchtower/db";
import * as schema from "@watchtower/db/schema/auth";
import { env, getTrustedAppOrigins } from "@watchtower/env/server";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, organization } from "better-auth/plugins";
import { sendMagicLinkEmail } from "./email";

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
  const plugins: BetterAuthPlugin[] = [organization()];
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
