import { SectionHeader } from "@/components/landing/section-header";
import { Reveal } from "@/components/landing/reveal";

const features = [
  {
    title: "AI materiality verdicts",
    highlight: true,
    description:
      "When content changes, AI classifies every difference as material or cosmetic — with a confidence score and the exact clause cited. A changed payment amount gets flagged; a re-saved file does not.",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9.937 15.5A2 2 0 008.5 14.063l-6.135-1.582a.5.5 0 010-.962L8.5 9.936A2 2 0 009.937 8.5l1.582-6.135a.5.5 0 01.963 0L14.063 8.5A2 2 0 0015.5 9.937l6.135 1.581a.5.5 0 010 .964L15.5 14.063a2 2 0 00-1.437 1.437l-1.582 6.135a.5.5 0 01-.963 0z"
        />
      </svg>
    ),
  },
  {
    title: "Version history & compare",
    description:
      "Every upload becomes a tracked version. Compare any two side-by-side against the verified baseline and see precisely what changed — bytes, text, and meaning.",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    title: "On-chain anchoring",
    description:
      "Anchor a document fingerprint to a public blockchain and verify it independently on any block explorer. Only the hash goes on-chain — never your content. No wallet required.",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
    ),
  },
  {
    title: "Encrypted vault",
    description:
      "Documents are encrypted in transit and at rest, validated on upload against forged file types, and isolated per tenant. 14 formats supported — PDFs, Word, spreadsheets, images, and more.",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
    ),
  },
  {
    title: "Vault assistant with citations",
    description:
      "Ask questions across your vault in plain language. Answers are grounded in your own documents and come with citations to the source passage — so you can check every claim.",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    ),
  },
  {
    title: "Teams, roles & secure sharing",
    description:
      "Multi-tenant workspaces with role-based access control. Share documents through revocable links with granular permissions — view, download, or ask questions.",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>
    ),
  },
];

export function Features() {
  return (
    <section id="features" className="relative bg-background py-20 sm:py-28">
      <div className="section-container">
        <Reveal>
          <SectionHeader
            eyebrow="Features"
            title="Integrity you can prove. Judgment you can check."
            description="One vault that stores, fingerprints, and understands your critical documents — built for teams where a missed change is expensive."
          />
        </Reveal>

        {/* Feature grid */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <Reveal key={feature.title} delay={(index % 3) * 90} className="h-full">
              <div
                className={
                  feature.highlight
                    ? "group relative h-full rounded-2xl border border-secondary/40 bg-accent p-7 transition-all duration-300 hover:shadow-elevation-3 hover:-translate-y-0.5"
                    : "group relative h-full rounded-2xl border border-border bg-card p-7 transition-all duration-300 hover:shadow-elevation-3 hover:-translate-y-0.5 hover:border-secondary/25"
                }
              >
                <div
                  className={
                    feature.highlight
                      ? "inline-flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"
                      : "inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/5 text-primary transition-colors duration-300 group-hover:bg-secondary/10 group-hover:text-secondary"
                  }
                >
                  {feature.icon}
                </div>

                <h3 className="mt-5 text-lg font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
