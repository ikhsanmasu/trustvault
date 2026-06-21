const features = [
  {
    title: "Multi-Format Support",
    description:
      "Upload PDF, DOCX, XLSX, CSV, JSON, images, and plain text files. One platform for all your document types.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 9h1M9 13h6M9 17h6M14 3v4a1 1 0 001 1h4"
        />
      </svg>
    ),
  },
  {
    title: "Smart Change Detection",
    description:
      "Intelligent analysis classifies document changes as MATERIAL or NOT MATERIAL, with clear, human-readable reasoning for every verdict.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 8v4M12 12l2-2"
        />
      </svg>
    ),
  },
  {
    title: "Deterministic Integrity",
    description:
      "Every file is fingerprinted with SHA-256 binary and text hashing. Intelligent analysis only runs when content actually changes — zero wasted resources.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 13h.01M15 13h.01"
        />
      </svg>
    ),
  },
  {
    title: "Version Tracking",
    description:
      "Every upload creates a traceable version. Compare any two versions side-by-side to see exactly what changed over time.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4.5 4.5L8 6M19.5 4.5L16 6"
        />
      </svg>
    ),
  },
  {
    title: "Secure Storage",
    description:
      "All files are stored encrypted in Supabase with row-level security. Your documents stay private and isolated by tenant.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    title: "Team Ready",
    description:
      "Built for teams with project-level organization, role-based access control, and full member management. Multi-tenant from day one.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      {/* Subtle top border decoration */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-1 rounded-full bg-gradient-to-r from-transparent via-secondary/50 to-transparent"
        aria-hidden="true"
      />

      <div className="section-container">
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-base font-bold text-secondary uppercase tracking-widest">
            Features
          </span>
          <h2 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            Everything you need to trust your documents
          </h2>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            From upload to verdict, TrustVault gives you deterministic proof
            and intelligent analysis in one clean workflow.
          </p>
        </div>

        {/* Feature cards grid */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group relative rounded-2xl border border-border bg-card p-8 transition-all duration-300 hover:shadow-elevation-3 hover:-translate-y-1 hover:border-secondary/25"
            >
              {/* Gold accent line on hover */}
              <div className="absolute top-0 left-6 right-6 h-0.5 rounded-full bg-gradient-to-r from-transparent via-secondary/0 to-transparent transition-all duration-300 group-hover:via-secondary/60" />

              {/* Icon */}
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/5 text-primary group-hover:bg-secondary/10 group-hover:text-secondary transition-colors duration-300">
                {feature.icon}
              </div>

              {/* Title */}
              <h3 className="mt-5 text-lg font-semibold text-foreground">
                {feature.title}
              </h3>

              {/* Description */}
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
