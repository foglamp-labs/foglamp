import type { Metadata } from "next";

import { LegalList, LegalPage } from "@/components/marketing/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Foglamp collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      effectiveDate="June 10, 2026"
      intro={
        <p>
          This policy describes how Foglamp (&quot;we&quot;, &quot;us&quot;)
          handles personal data when you use the hosted Foglamp service at
          foglamp.dev. If you self-host Foglamp on your own infrastructure, we
          don&apos;t receive your data and this policy doesn&apos;t apply to
          that deployment — your organization is the data controller.
        </p>
      }
      sections={[
        {
          heading: "What we collect",
          body: (
            <>
              <p>
                <strong>Account information.</strong> Your name and email
                address when you sign up. If you sign in with Google, we
                receive your name, email, and profile picture from your Google
                account — nothing else.
              </p>
              <p>
                <strong>Telemetry you send us.</strong> Foglamp is an
                observability product: your applications send us traces, spans,
                and metadata via the SDK, which can include LLM prompts,
                completions, tool calls, token counts, and costs. You control
                what your instrumentation sends; treat this data as yours — we
                process it only to provide the service.
              </p>
              <p>
                <strong>Billing information.</strong> Payments are processed by
                Stripe. We never see or store your full card details — we keep
                only your subscription status and billing history.
              </p>
              <p>
                <strong>Usage data.</strong> Basic product analytics (pages
                visited, features used) to understand how Foglamp is used and
                improve it, plus standard server logs (IP address, browser
                type) for security and debugging.
              </p>
            </>
          ),
        },
        {
          heading: "How we use it",
          body: (
            <LegalList
              items={[
                "To provide, maintain, and improve the service.",
                "To authenticate you and secure your account.",
                "To send transactional email: sign-in links, team invitations, alert notifications, and quota warnings.",
                "To bill you for paid plans.",
                "To respond to support requests.",
              ]}
            />
          ),
        },
        {
          heading: "What we don't do",
          body: (
            <LegalList
              items={[
                "We don't sell your personal data or your telemetry data.",
                "We don't use your telemetry data (prompts, completions, traces) to train AI models.",
                "We don't send you marketing email without your consent.",
              ]}
            />
          ),
        },
        {
          heading: "Who we share data with",
          body: (
            <>
              <p>
                We share data only with the service providers we need to run
                Foglamp, and only what each one needs:
              </p>
              <LegalList
                items={[
                  <>
                    <strong>Cloud hosting providers</strong> — run our servers
                    and databases where your data is stored.
                  </>,
                  <>
                    <strong>Stripe</strong> — payment processing.
                  </>,
                  <>
                    <strong>Resend</strong> — transactional email delivery.
                  </>,
                  <>
                    <strong>PostHog</strong> — product analytics.
                  </>,
                  <>
                    <strong>Google</strong> — only if you choose to sign in
                    with Google.
                  </>,
                ]}
              />
              <p>
                We may also disclose data if required by law, or as part of a
                merger or acquisition (in which case this policy continues to
                apply to data collected before the change).
              </p>
            </>
          ),
        },
        {
          heading: "Data retention",
          body: (
            <>
              <p>
                Telemetry data is retained according to your plan&apos;s
                retention period, after which it is automatically deleted.
                Account information is kept while your account is active.
              </p>
              <p>
                When you delete your account or workspace, we delete the
                associated data within 30 days, except where we&apos;re legally
                required to keep it (e.g. billing records).
              </p>
            </>
          ),
        },
        {
          heading: "Security",
          body: (
            <p>
              Data is encrypted in transit (TLS) and at rest. Access to
              production data is limited to the people who need it to operate
              the service. Any provider API keys you store for evals are
              encrypted with AES-256-GCM before they touch the database. No
              system is perfectly secure, but if we learn of a breach affecting
              your data we will notify you without undue delay.
            </p>
          ),
        },
        {
          heading: "Cookies",
          body: (
            <p>
              We use cookies only to keep you signed in and to remember
              preferences like your theme. We don&apos;t use third-party
              advertising cookies.
            </p>
          ),
        },
        {
          heading: "Your rights",
          body: (
            <p>
              You can access and update your account information in Settings.
              You can ask us to export or delete your personal data at any time
              by emailing{" "}
              <a href="mailto:support@foglamp.dev">support@foglamp.dev</a>.
              Depending on where you live (e.g. the EU/EEA under GDPR or
              California under CCPA), you may have additional rights to access,
              correct, delete, or port your data — email us and we&apos;ll
              honor them.
            </p>
          ),
        },
        {
          heading: "Children",
          body: (
            <p>
              Foglamp is not directed at children under 16, and we don&apos;t
              knowingly collect their data.
            </p>
          ),
        },
        {
          heading: "Changes to this policy",
          body: (
            <p>
              If we make material changes, we&apos;ll update the effective date
              above and notify you by email or in the app before the changes
              take effect.
            </p>
          ),
        },
        {
          heading: "Contact",
          body: (
            <p>
              Questions about privacy? Email{" "}
              <a href="mailto:support@foglamp.dev">support@foglamp.dev</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
