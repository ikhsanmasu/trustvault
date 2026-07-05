import type { Metadata } from "next";
import Link from "next/link";
import { LegalHeader, LegalSection, LegalList } from "@/components/legal";

export const metadata: Metadata = {
  title: "Security — InTrustVault",
  description:
    "How InTrustVault protects your documents: encryption, tenant isolation, upload validation, data minimization for AI, and hash-only on-chain anchoring.",
};

export default function SecurityPage() {
  return (
    <>
      <LegalHeader
        eyebrow="Security"
        title="Security at InTrustVault"
        intro="A document-integrity product has to hold itself to the standard it sells. This page describes the concrete measures protecting your documents — not marketing language, but how the system is actually built."
      />

      <LegalSection title="Encryption">
        <LegalList
          items={[
            "All traffic is encrypted in transit with TLS.",
            "Documents and database contents are encrypted at rest.",
            "Passwords are handled by our authentication provider and stored only as salted hashes.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Tenant isolation">
        <p>
          Every workspace is isolated at the database level using Postgres
          row-level security (RLS). Isolation is enforced by the database
          itself on every query — not just by application code — so a bug in
          an API route cannot leak another workspace&apos;s data.
        </p>
      </LegalSection>

      <LegalSection title="Upload validation">
        <p>
          Files are validated against their declared type using magic-byte
          inspection before they are accepted. A file renamed to disguise its
          real format is rejected at the door, and per-plan size limits are
          enforced server-side.
        </p>
      </LegalSection>

      <LegalSection title="Data minimization for AI">
        <p>
          The pipeline is deterministic first: exact hash comparisons run
          before any AI call, and identical files never leave our
          infrastructure. When AI is required, we send only the extracted text
          the specific operation needs — never your original files — and only
          when you trigger the operation. Details are in our{" "}
          <Link href="/privacy" className="text-primary underline underline-offset-2 hover:text-primary/80">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="On-chain anchoring: hashes only">
        <p>
          Anchoring writes a cryptographic fingerprint to a public blockchain.
          A fingerprint cannot be reversed into document content. Your
          documents themselves never touch a blockchain, and anchoring is
          always an explicit action — never automatic.
        </p>
      </LegalSection>

      <LegalSection title="Access control and sharing">
        <LegalList
          items={[
            "Role-based access control within each workspace.",
            "Share links are revocable at any time and carry granular permissions — view, download, or ask questions.",
            "Public endpoints are rate-limited to prevent abuse.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Infrastructure">
        <p>
          InTrustVault runs on Supabase (database, authentication, storage)
          and Vercel (application hosting) — providers that maintain SOC 2
          Type II attestations for their platforms. Errors are monitored with
          Sentry, with reports scrubbed of document content.
        </p>
      </LegalSection>

      <LegalSection title="Responsible disclosure">
        <p>
          If you believe you have found a vulnerability, we want to hear about
          it. Email{" "}
          <a href="mailto:security@trustvault.app" className="text-primary underline underline-offset-2 hover:text-primary/80">
            security@trustvault.app
          </a>{" "}
          with details and steps to reproduce. We commit to acknowledging
          reports within 72 hours, and we will not pursue action against
          good-faith research that respects user data and service availability.
        </p>
      </LegalSection>
    </>
  );
}
