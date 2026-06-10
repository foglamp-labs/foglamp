import type { Metadata } from "next";

import { LegalList, LegalPage } from "@/components/marketing/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Foglamp.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      effectiveDate="June 10, 2026"
      intro={
        <p>
          These terms govern your use of the hosted Foglamp service at
          foglamp.dev (&quot;the service&quot;), operated by Foglamp
          (&quot;we&quot;, &quot;us&quot;). By creating an account or using the
          service, you agree to them. The self-hosted version of Foglamp is
          distributed under its own open-source license in the repository and
          is not covered by these terms.
        </p>
      }
      sections={[
        {
          heading: "The service",
          body: (
            <p>
              Foglamp is an observability platform for AI applications: you
              instrument your apps with our SDK and we collect, store, and
              visualize traces, costs, evals, and alerts. We may add, change,
              or remove features over time; we&apos;ll give reasonable notice
              of changes that materially reduce core functionality.
            </p>
          ),
        },
        {
          heading: "Your account",
          body: (
            <>
              <p>
                You must provide accurate information and keep your sign-in
                method secure. You&apos;re responsible for activity under your
                account and API keys — tell us promptly at{" "}
                <a href="mailto:support@foglamp.dev">support@foglamp.dev</a> if
                you suspect unauthorized access. You must be at least 16 years
                old to use the service.
              </p>
              <p>
                If you use Foglamp on behalf of an organization, you confirm
                you have authority to bind that organization to these terms.
              </p>
            </>
          ),
        },
        {
          heading: "Your data",
          body: (
            <>
              <p>
                <strong>You own your data.</strong> The telemetry you send us —
                traces, spans, prompts, completions, metadata — remains yours.
                You grant us a limited license to host, process, and display it
                solely to provide the service. We don&apos;t use it to train AI
                models and we don&apos;t sell it. Our{" "}
                <a href="/privacy">Privacy Policy</a> describes how we handle
                personal data.
              </p>
              <p>
                <strong>You&apos;re responsible for what you send.</strong>{" "}
                Ensure you have the right to send us the data your
                instrumentation collects, including any personal data inside
                prompts and completions, and that doing so complies with the
                laws that apply to you.
              </p>
            </>
          ),
        },
        {
          heading: "Acceptable use",
          body: (
            <>
              <p>You agree not to:</p>
              <LegalList
                items={[
                  "Break the law or violate others' rights using the service.",
                  "Probe, breach, or circumvent security or rate limits, or access other customers' data.",
                  "Resell or white-label the hosted service without our written agreement.",
                  "Interfere with the service's operation, e.g. by sending malformed or abusive traffic.",
                ]}
              />
            </>
          ),
        },
        {
          heading: "Plans, billing, and limits",
          body: (
            <>
              <p>
                Paid plans are billed by Stripe, monthly or annually in
                advance, and renew automatically until cancelled. You can
                cancel anytime from Settings; cancellation takes effect at the
                end of the current billing period, and except where required by
                law, payments are non-refundable.
              </p>
              <p>
                Each plan has usage limits (e.g. spans per month, retention,
                projects). If you exceed them we may throttle ingestion or ask
                you to upgrade. We may change pricing with at least 30
                days&apos; notice; changes apply from your next billing period.
              </p>
            </>
          ),
        },
        {
          heading: "Termination",
          body: (
            <p>
              You can delete your account at any time. We may suspend or
              terminate accounts that violate these terms, create risk for the
              service or other customers, or remain unpaid after notice. After
              termination we delete your data in accordance with our{" "}
              <a href="/privacy">Privacy Policy</a>; you can export your data
              before deleting your account, and we&apos;ll reasonably assist if
              you ask.
            </p>
          ),
        },
        {
          heading: "Disclaimers",
          body: (
            <p>
              The service is provided <strong>&quot;as is&quot;</strong>{" "}
              without warranties of any kind, express or implied, including
              fitness for a particular purpose and non-infringement. We
              don&apos;t warrant that the service will be uninterrupted or
              error-free. Foglamp is an observability tool — it does not make
              decisions for you, and you remain responsible for your own
              applications and their outputs.
            </p>
          ),
        },
        {
          heading: "Limitation of liability",
          body: (
            <p>
              To the maximum extent permitted by law, neither party is liable
              for indirect, incidental, special, or consequential damages, or
              lost profits, revenue, or data. Our total liability under these
              terms is capped at the amounts you paid us in the 12 months
              before the claim (or $100 if you&apos;re on the free plan).
              Nothing in these terms limits liability that cannot be limited by
              law.
            </p>
          ),
        },
        {
          heading: "Changes to these terms",
          body: (
            <p>
              We may update these terms from time to time. For material
              changes we&apos;ll notify you by email or in the app at least 14
              days before they take effect. Continuing to use the service after
              that means you accept the updated terms.
            </p>
          ),
        },
        {
          heading: "Contact",
          body: (
            <p>
              Questions about these terms? Email{" "}
              <a href="mailto:support@foglamp.dev">support@foglamp.dev</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
