const useCases = [
  {
    title: "Financial Audits",
    description:
      "Maintain an immutable chain of financial statements, audit reports, and compliance documents. Every revision is hashed and tracked — auditors get cryptographic proof that nothing was altered.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Tender & Procurement",
    description:
      "Track every version of RFPs, bid submissions, and contract awards. Know exactly what changed between revisions — and whether the change is material to the outcome.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: "Aviation & Traffic Logs",
    description:
      "Airlines and transport operators generate millions of data logs. TrustVault verifies that operational records, maintenance logs, and incident reports have not been tampered with.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    ),
  },
  {
    title: "Smart Vehicle Data",
    description:
      "On-board units and telematics systems produce continuous data streams. Validate firmware updates, configuration changes, and sensor logs with deterministic integrity checks.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    ),
  },
  {
    title: "Legal & Regulatory",
    description:
      "Contracts, NDAs, settlement agreements — every version is cryptographically sealed. Demonstrate chain of custody and prove exactly what changed, when, and by whom.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
      </svg>
    ),
  },
  {
    title: "Healthcare Records",
    description:
      "Patient records, clinical trial data, and medical device logs require absolute integrity. TrustVault provides verifiable audit trails for sensitive healthcare documentation.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
  },
];

export function UseCases() {
  return (
    <section id="use-cases" className="relative bg-background py-20 sm:py-28">
      <div className="section-container">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-base font-bold text-secondary uppercase tracking-widest">
            Use Cases
          </span>
          <h2 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            Built for high-integrity environments
          </h2>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            Any industry where document integrity matters — from finance to aviation, legal to healthcare.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map((uc) => (
            <div
              key={uc.title}
              className="group relative rounded-2xl border border-border bg-card p-8 transition-all duration-300 hover:shadow-elevation-3 hover:-translate-y-1 hover:border-secondary/25"
            >
              <div className="absolute top-0 left-6 right-6 h-0.5 rounded-full bg-gradient-to-r from-transparent via-secondary/0 to-transparent transition-all duration-300 group-hover:via-secondary/60" />
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/5 text-primary group-hover:bg-secondary/10 group-hover:text-secondary transition-colors duration-300">
                {uc.icon}
              </div>
              <h3 className="mt-5 text-lg font-semibold text-foreground">{uc.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{uc.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
