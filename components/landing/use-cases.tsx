import { SectionHeader } from "@/components/landing/section-header";
import { Reveal } from "@/components/landing/reveal";

const useCases = [
  {
    label: "Audit teams",
    headline: "Approve the version you actually reviewed",
    description:
      "Confirmations, schedules, and supporting documents pass through many hands between fieldwork and sign-off. InTrustVault proves the file on the signature page is byte-for-byte the file you reviewed — and flags it immediately when it is not.",
    example: {
      verdict: "Material",
      tone: "destructive" as const,
      text: "Revenue figure in Schedule B changed after review: 4,120,500 → 4,210,500.",
    },
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        />
      </svg>
    ),
  },
  {
    label: "Legal & contracts",
    headline: "Catch the clause that moved between redlines",
    description:
      "Across ten rounds of negotiation, a silently edited liability cap or payment term is easy to miss. Every draft is fingerprinted and compared against the last verified version, so a material edit can never slip through unannounced.",
    example: {
      verdict: "Material",
      tone: "destructive" as const,
      text: "Clause 11.3: liability cap reduced from 24 months of fees to 6 months.",
    },
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
        />
      </svg>
    ),
  },
  {
    label: "Finance & compliance ops",
    headline: "Stop re-reading documents that did not change",
    description:
      "Policies, invoices, and reports circulate constantly — and most updates are cosmetic. Hash-first comparison clears identical files instantly, so your team only spends attention on changes the AI judges material.",
    example: {
      verdict: "Cosmetic",
      tone: "success" as const,
      text: "Policy v7: reformatted headers and updated footer date. No obligations changed.",
    },
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
    ),
  },
];

export function UseCases() {
  return (
    <section id="use-cases" className="relative bg-muted/40 py-20 sm:py-28">
      <div className="section-container">
        <Reveal>
          <SectionHeader
            eyebrow="Who it's for"
            title="Built for work where a missed change is expensive"
            description="Audit, legal, and compliance teams do not need another alert that something changed. They need to know whether it matters."
          />
        </Reveal>

        {/* Persona cards */}
        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {useCases.map((uc, index) => (
            <Reveal key={uc.label} delay={index * 90} className="h-full">
              <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-7 transition-all duration-300 hover:shadow-elevation-3 hover:border-secondary/25">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary">
                    {uc.icon}
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-secondary">
                    {uc.label}
                  </span>
                </div>

                <h3 className="font-display mt-5 text-xl font-semibold text-foreground leading-snug">
                  {uc.headline}
                </h3>
                <p className="mt-3 flex-1 text-sm text-muted-foreground leading-relaxed">
                  {uc.description}
                </p>

                {/* Example verdict */}
                <div className="mt-6 rounded-xl border border-border bg-muted/50 p-4">
                  <span
                    className={
                      uc.example.tone === "destructive"
                        ? "inline-block rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-destructive"
                        : "inline-block rounded-md bg-success/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-success"
                    }
                  >
                    {uc.example.verdict}
                  </span>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {uc.example.text}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
