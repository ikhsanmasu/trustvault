import { SectionHeader } from "@/components/landing/section-header";
import { Reveal } from "@/components/landing/reveal";

const faqs = [
  {
    q: "What does InTrustVault actually verify?",
    a: "Three layers. First, an exact cryptographic hash of the raw file — proof the bytes are identical or not. Second, a hash of the extracted text — proof the content is identical even if the file was re-saved. Third, when the text genuinely differs, an AI assessment of whether the change is material or cosmetic, with the evidence cited.",
  },
  {
    q: "When does the AI run — and when does it not?",
    a: "The AI never runs before the deterministic checks. If two versions have identical bytes or identical text, you get an exact answer instantly and no AI is involved. The model is only consulted when content genuinely changed and someone has to judge whether it matters.",
  },
  {
    q: "What counts as a material change?",
    a: "A change that alters meaning, value, or obligation — a payment amount, a deadline, a liability cap, a deleted clause. Reformatting, re-saved metadata, page numbering, and line-wrap differences are classified as cosmetic. Every verdict includes a confidence score and the exact passage, so you can always overrule it.",
  },
  {
    q: "Is my document content stored on the blockchain?",
    a: "No. Only a cryptographic fingerprint (hash) of the document is anchored on-chain — a fingerprint cannot be reversed into content. Anchoring gives you an independently verifiable, tamper-evident timestamp without exposing anything. You do not need a wallet or any crypto knowledge.",
  },
  {
    q: "How are my documents protected?",
    a: "Documents are encrypted in transit and at rest, validated on upload against forged file types, and isolated per workspace with database-level row security. Text is extracted only to power the verification and assistant features you use.",
  },
  {
    q: "Which file formats are supported?",
    a: "14 formats, including PDF, Word, Excel and other spreadsheets, plain text, and common image types. Text-based documents get the full pipeline including AI comparison; all formats get binary integrity verification.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="relative bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-6">
        <Reveal>
          <SectionHeader
            eyebrow="FAQ"
            title="Questions worth asking a trust product"
          />
        </Reveal>

        <Reveal delay={100}>
          <div className="mt-12 divide-y divide-border rounded-2xl border border-border bg-card">
            {faqs.map((faq) => (
              <details key={faq.q} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <svg
                    className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
