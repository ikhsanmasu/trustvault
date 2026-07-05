const principles = [
  {
    title: "Deterministic first, AI second",
    description:
      "Exact cryptographic checks always run before any AI call. Identical files resolve with certainty — instantly and at zero AI cost. The model is only consulted for the judgment hashes cannot make.",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        />
      </svg>
    ),
  },
  {
    title: "Always a verified baseline",
    description:
      "Comparisons are never made against an arbitrary copy. Every verdict is anchored to a previously stored, verified version — so the chain of custody never drifts.",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
        />
      </svg>
    ),
  },
  {
    title: "Evidence, not vibes",
    description:
      "Every material verdict cites the exact clause that changed and states its confidence. Cosmetic changes are listed too — nothing is hidden behind a score you cannot inspect.",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
    ),
  },
];

export function Trust() {
  return (
    <section className="relative bg-primary py-20 sm:py-28 overflow-hidden">
      {/* Decorative glows */}
      <div
        className="absolute -top-32 right-0 h-96 w-96 rounded-full bg-secondary/10 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/[0.04] blur-3xl"
        aria-hidden="true"
      />

      <div className="relative section-container">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-sm font-bold text-secondary uppercase tracking-widest">
            Why trust the verdict
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-primary-foreground text-balance">
            An AI opinion is only useful if you can audit it
          </h2>
          <p className="mt-4 text-lg text-primary-foreground/65 leading-relaxed">
            InTrustVault is built on three rules that keep every verdict
            explainable — to you, your reviewers, and your auditors.
          </p>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {principles.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-primary-foreground/10 bg-primary-foreground/[0.04] p-7 backdrop-blur-sm"
            >
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/15 text-secondary">
                {p.icon}
              </div>
              <h3 className="mt-5 text-lg font-semibold text-primary-foreground">
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-primary-foreground/60">
                {p.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
