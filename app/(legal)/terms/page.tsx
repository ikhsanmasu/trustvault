import type { Metadata } from "next";
import Link from "next/link";
import { LegalHeader, LegalSection, LegalList } from "@/components/legal";

export const metadata: Metadata = {
  title: "Terms of Service — InTrustVault",
  description:
    "The terms that govern your use of InTrustVault, including what our AI verdicts are — and are not.",
};

export default function TermsPage() {
  return (
    <>
      <LegalHeader
        eyebrow="Legal"
        title="Terms of Service"
        updated="July 5, 2026"
        intro="These terms govern your use of InTrustVault. They are written to be read: short sections, plain language, and an honest description of what the service does and does not promise."
      />

      <LegalSection title="1. Acceptance">
        <p>
          By creating an account or using InTrustVault, you agree to these
          terms and to our{" "}
          <Link href="/privacy" className="text-primary underline underline-offset-2 hover:text-primary/80">
            Privacy Policy
          </Link>
          . If you use the service on behalf of an organization, you represent
          that you have authority to bind it.
        </p>
      </LegalSection>

      <LegalSection title="2. The service">
        <p>
          InTrustVault is a document-integrity platform: it stores documents,
          computes cryptographic fingerprints over them, compares versions
          against a verified baseline, and — when content genuinely differs —
          produces an AI assessment of whether the change is material or
          cosmetic. Optionally, fingerprints can be anchored to a public
          blockchain as a tamper-evident proof.
        </p>
        <p>For clarity, InTrustVault is not:</p>
        <LegalList
          items={[
            "A legal, audit, or compliance advisor. Verdicts are decision support, not professional advice.",
            "An e-signature service.",
            "A forgery-detection tool. We assess the significance of changes between versions you store; we do not authenticate the origin of a document.",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Accounts and workspaces">
        <LegalList
          items={[
            "You must provide accurate account information and keep your credentials secure. Actions taken with your credentials are yours.",
            "Workspace administrators control membership and roles. Members act on behalf of the workspace.",
            "You must be legally able to enter this agreement in your jurisdiction.",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Acceptable use">
        <p>You agree not to:</p>
        <LegalList
          items={[
            "Upload content that is unlawful, infringing, or that you have no right to store or share.",
            "Upload malware or use the service to distribute harmful content.",
            "Probe, disrupt, or overload the service, or attempt to access other tenants' data.",
            "Abuse AI features, including attempts to extract other users' data through the assistant.",
            "Resell or white-label the service without a written agreement.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Your content">
        <p>
          You retain full ownership of everything you upload. You grant us a
          limited license to store, process, and transmit your content solely
          to provide the service — computing hashes, extracting text, running
          the comparisons and AI features you request, and serving files back
          to you and to people you share them with. This license ends when you
          delete the content, except for hashes already anchored on-chain,
          which are permanent by design and contain no content.
        </p>
      </LegalSection>

      <LegalSection title="6. AI verdicts — an honest disclaimer">
        <p>
          The deterministic layers of our pipeline (binary and text hashing)
          are exact: when we report that two versions are identical, that is a
          mathematical fact. AI materiality verdicts are different — they are
          probabilistic assessments, delivered with a confidence score and
          cited evidence precisely so that a human can review them.
        </p>
        <p>
          You agree not to treat an AI verdict as the sole basis for a
          consequential decision (signing a contract, certifying an audit,
          filing a report). We designed the product to make your review
          faster, not to replace it.
        </p>
      </LegalSection>

      <LegalSection title="7. On-chain anchoring">
        <p>
          Anchoring writes a document fingerprint to a public blockchain. It is
          optional, triggered explicitly by you, public, and irreversible.
          Blockchain networks are operated by third parties; confirmation
          times and network fees are outside our control.
        </p>
      </LegalSection>

      <LegalSection title="8. Plans and billing">
        <LegalList
          items={[
            "The Starter plan is free within its published limits (documents, storage, file size, and monthly AI verdicts).",
            "Paid plans are billed per workspace, monthly, in USD. Quotas reset at the start of each billing month.",
            "You may cancel at any time; access continues until the end of the paid period. Fees already paid are non-refundable except where required by law.",
            "We may change prices with at least 30 days' notice; changes apply from your next billing cycle.",
          ]}
        />
      </LegalSection>

      <LegalSection title="9. Availability">
        <p>
          We aim for high availability but the service is provided without an
          uptime guarantee on Starter and Pro plans. Service-level agreements
          are available on Enterprise plans. We may perform maintenance with
          reasonable notice where practical.
        </p>
      </LegalSection>

      <LegalSection title="10. Termination">
        <p>
          You may close your account at any time, which deletes your stored
          documents per our Privacy Policy. We may suspend or terminate
          accounts that violate these terms, with notice where reasonable.
          Upon termination we will, on request made within 30 days, provide an
          export of your documents.
        </p>
      </LegalSection>

      <LegalSection title="11. Disclaimers and liability">
        <p>
          The service is provided &quot;as is&quot; without warranties of any
          kind, express or implied, including fitness for a particular
          purpose. To the maximum extent permitted by law, our total liability
          arising out of the service is limited to the amounts you paid us in
          the 12 months preceding the claim, and neither party is liable for
          indirect or consequential damages. Nothing in these terms limits
          liability that cannot be limited by law.
        </p>
      </LegalSection>

      <LegalSection title="12. Changes to these terms">
        <p>
          We may update these terms. For material changes we will notify
          account holders by email at least 14 days before they take effect.
          Continued use after the effective date constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection title="13. Governing law and contact">
        <p>
          These terms are governed by the laws of the Republic of Indonesia,
          without regard to conflict-of-law rules. Questions about these terms:
          {" "}
          <a href="mailto:legal@trustvault.app" className="text-primary underline underline-offset-2 hover:text-primary/80">
            legal@trustvault.app
          </a>
          .
        </p>
      </LegalSection>
    </>
  );
}
