import { SectionHeader } from "@/components/landing/section-header";
import { Reveal } from "@/components/landing/reveal";

const steps = [
  {
    number: "01",
    title: "Upload & set the baseline",
    description:
      "Drop in contracts, reports, or records — 14 formats supported. Files are validated, encrypted in transit and at rest, and become the verified baseline every future version is judged against.",
    annotation: "baseline: v1 · verified",
  },
  {
    number: "02",
    title: "Layered fingerprinting",
    description:
      "Each version gets two cryptographic fingerprints: one for the raw bytes, one for the extracted text. The fingerprint can be anchored on-chain for an independently verifiable, tamper-evident record.",
    annotation: "sha256: 9f2c…41a7",
  },
  {
    number: "03",
    title: "Deterministic comparison",
    description:
      "New versions are compared hash-first. Identical bytes or identical text resolve instantly with an exact answer — no AI involved, no cost, no ambiguity.",
    annotation: "text delta detected",
  },
  {
    number: "04",
    title: "AI materiality verdict",
    description:
      "Only when the text genuinely differs does AI weigh in: each change is classified as material or cosmetic, with a confidence score and the exact clause cited as evidence.",
    annotation: "verdict: MATERIAL · 0.94",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative bg-muted/40 py-20 sm:py-28">
      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
        aria-hidden="true"
      />

      <div className="relative section-container">
        <Reveal>
          <SectionHeader
            eyebrow="How it works"
            title="Deterministic first. AI second."
            description="Cheap, exact checks run before any AI call — so the expensive judgment is reserved for the one question hashes cannot answer: does this change matter?"
          />
        </Reveal>

        {/* Pipeline steps */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <Reveal key={step.number} delay={index * 90} className="relative h-full">
              {/* Connector line (desktop) */}
              {index < steps.length - 1 && (
                <div
                  className="hidden lg:block absolute top-6 left-[calc(100%-1rem)] w-8 h-px bg-gradient-to-r from-secondary/50 to-transparent z-10"
                  aria-hidden="true"
                />
              )}

              <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:shadow-elevation-3 hover:border-secondary/25">
                <div className="flex items-center justify-between">
                  <span className="font-display flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground">
                    {step.number}
                  </span>
                  <span className="font-hash rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                    {step.annotation}
                  </span>
                </div>

                <h3 className="mt-5 text-base font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Pipeline invariant callout */}
        <Reveal delay={120}>
          <div className="mt-10 mx-auto max-w-3xl rounded-2xl border border-secondary/25 bg-accent px-6 py-5 text-center">
            <p className="text-sm leading-relaxed text-accent-foreground">
              <span className="font-semibold">The core guarantee:</span> the AI
              never runs before the hash check, and every comparison is made
              against a previously verified baseline — never against an
              unverified copy.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
