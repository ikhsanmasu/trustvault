import type { Metadata } from "next";
import Link from "next/link";
import { LegalHeader, LegalSection, LegalList } from "@/components/legal";

export const metadata: Metadata = {
  title: "Privacy Policy — InTrustVault",
  description:
    "How InTrustVault collects, uses, and protects your data — including exactly what is shared with AI providers and what goes on-chain.",
};

const SUBPROCESSORS = [
  {
    name: "Supabase",
    purpose: "Database, authentication, and encrypted file storage",
    data: "Account data, documents, extracted text, usage records",
  },
  {
    name: "Vercel",
    purpose: "Application hosting and content delivery",
    data: "Request metadata (IP address, user agent)",
  },
  {
    name: "DeepSeek",
    purpose: "AI materiality analysis of document changes",
    data: "Extracted text of compared versions, only when a comparison you trigger requires AI",
  },
  {
    name: "OpenAI",
    purpose: "Text embeddings for the vault assistant",
    data: "Extracted text passages, only for documents you enable for the assistant",
  },
  {
    name: "Resend",
    purpose: "Transactional email (invitations, notifications)",
    data: "Email address and message content",
  },
  {
    name: "Sentry",
    purpose: "Error monitoring",
    data: "Technical error reports; scrubbed of document content",
  },
];

export default function PrivacyPage() {
  return (
    <>
      <LegalHeader
        eyebrow="Legal"
        title="Privacy Policy"
        updated="July 5, 2026"
        intro="InTrustVault exists to prove the integrity of your documents — a job that only works if you can trust us with them. This policy explains, in plain language, what we collect, exactly what leaves our infrastructure, and what never does."
      />

      <LegalSection title="1. Who we are">
        <p>
          InTrustVault (&quot;we&quot;, &quot;us&quot;) operates the
          document-integrity platform available at this website. For any
          privacy question or request, contact us at{" "}
          <a href="mailto:privacy@trustvault.app" className="text-primary underline underline-offset-2 hover:text-primary/80">
            privacy@trustvault.app
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. What we collect">
        <LegalList
          items={[
            <span key="account"><strong className="text-foreground">Account data</strong> — your name, email address, and workspace membership. Passwords are handled by our authentication provider and stored only as salted hashes; we never see them.</span>,
            <span key="docs"><strong className="text-foreground">Documents</strong> — the files you upload, the text we extract from them, and the cryptographic hashes we compute over both.</span>,
            <span key="usage"><strong className="text-foreground">Usage records</strong> — document counts, storage used, and AI analysis counts, used to enforce plan quotas.</span>,
            <span key="tech"><strong className="text-foreground">Technical data</strong> — logs and error reports needed to keep the service secure and working.</span>,
          ]}
        />
        <p>
          We do not collect browsing behavior for advertising, and we do not
          buy or enrich data about you from third parties.
        </p>
      </LegalSection>

      <LegalSection title="3. How we use your data">
        <LegalList
          items={[
            "To provide the service: storing documents, computing fingerprints, running comparisons, and producing AI materiality assessments you request.",
            "To enforce plan limits and, on paid plans, to bill you.",
            "To secure the service: detecting abuse, debugging errors, and maintaining audit trails.",
            "To communicate with you about your account (invitations, security notices).",
          ]}
        />
        <p>
          We never sell your data, and we never use your documents to advertise
          to you or anyone else.
        </p>
      </LegalSection>

      <LegalSection title="4. AI processing — what leaves and what does not">
        <p>
          Our pipeline is deterministic first: exact hash checks run before any
          AI is involved, and identical files are resolved without any data
          leaving our infrastructure.
        </p>
        <p>
          When content genuinely differs and you have requested an assessment,
          we send the <strong className="text-foreground">extracted text</strong> of
          the compared versions to our AI provider to produce the materiality
          verdict. For the vault assistant, relevant text passages are sent to
          generate embeddings and answers. In all cases:
        </p>
        <LegalList
          items={[
            "We send extracted text only — never your original files.",
            "We send only what the specific operation requires, only when you trigger it.",
            "AI providers process this data under their API terms to return a result; we do not grant them rights to use your content for their own purposes.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. On-chain anchoring">
        <p>
          If you anchor a document, only its cryptographic fingerprint (a hash)
          is written to a public blockchain. A hash cannot be reversed into
          your document or reveal anything about its contents. Anchored hashes
          are public and permanent by design — this is what makes the proof
          tamper-evident — so anchoring is always an explicit action you take,
          never automatic.
        </p>
      </LegalSection>

      <LegalSection title="6. Cookies">
        <p>
          We use essential cookies only, for keeping you signed in. There are
          no tracking, analytics, or advertising cookies. Your cookie-banner
          choice is stored locally in your browser.
        </p>
      </LegalSection>

      <LegalSection title="7. Subprocessors">
        <p>
          We rely on a small set of infrastructure providers. Each processes
          data only to deliver its function:
        </p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th className="px-4 py-3 font-semibold text-foreground">Provider</th>
                <th className="px-4 py-3 font-semibold text-foreground">Purpose</th>
                <th className="px-4 py-3 font-semibold text-foreground">Data involved</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((s) => (
                <tr key={s.name} className="border-b border-border/50 last:border-0 align-top">
                  <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{s.name}</td>
                  <td className="px-4 py-3">{s.purpose}</td>
                  <td className="px-4 py-3">{s.data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection title="8. Retention and deletion">
        <p>
          Your documents and their derived data (extracted text, hashes,
          verdicts) are retained until you delete them or close your account.
          Deleting a document removes the file and its extracted text from our
          storage. One exception is inherent to the product: hashes already
          anchored on a public blockchain cannot be deleted by anyone —
          including us — but they contain no document content.
        </p>
      </LegalSection>

      <LegalSection title="9. Security">
        <p>
          Documents are encrypted in transit and at rest, workspaces are
          isolated at the database level with row-level security, and uploads
          are validated against forged file types. See our{" "}
          <Link href="/security" className="text-primary underline underline-offset-2 hover:text-primary/80">
            Security page
          </Link>{" "}
          for the full picture.
        </p>
      </LegalSection>

      <LegalSection title="10. Your rights">
        <p>
          Depending on your jurisdiction (including under the GDPR), you have
          the right to access, correct, export, and delete your personal data,
          and to object to or restrict certain processing. You can exercise
          most of these directly in the app — export or delete documents,
          update your profile, close your account. For anything else, email{" "}
          <a href="mailto:privacy@trustvault.app" className="text-primary underline underline-offset-2 hover:text-primary/80">
            privacy@trustvault.app
          </a>{" "}
          and we will respond within 30 days.
        </p>
      </LegalSection>

      <LegalSection title="11. Changes to this policy">
        <p>
          If we make material changes, we will notify account holders by email
          and update the effective date above. Continued use after the
          effective date constitutes acceptance.
        </p>
      </LegalSection>
    </>
  );
}
