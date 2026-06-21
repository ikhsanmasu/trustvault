const steps = [
  {
    number: "01",
    title: "Upload",
    description:
      "Drag and drop documents in any supported format — PDF, DOCX, XLSX, CSV, JSON, and more. Each file is automatically hashed and its text is extracted server-side.",
    illustration: (
      <svg
        className="h-full w-full"
        viewBox="0 0 200 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="30"
          y="15"
          width="110"
          height="130"
          rx="8"
          className="fill-muted stroke-primary"
          strokeWidth="1.5"
          opacity="0.25"
        />
        <rect x="48" y="40" width="74" height="6" rx="3" className="fill-primary" opacity="0.15" />
        <rect x="48" y="55" width="60" height="6" rx="3" className="fill-primary" opacity="0.1" />
        <rect x="48" y="70" width="68" height="6" rx="3" className="fill-primary" opacity="0.1" />
        <rect x="48" y="85" width="50" height="6" rx="3" className="fill-primary" opacity="0.07" />
        <path
          d="M160 110L170 95L180 110"
          className="stroke-secondary"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M170 95V140"
          className="stroke-secondary"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="170" cy="145" r="12" className="fill-secondary" opacity="0.9" />
        <path
          d="M164 145L168 149L176 141"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    number: "02",
    title: "Track",
    description:
      "Every version is stored with a binary hash and a text hash. The hash chain proves integrity. See your full document history in a clean, sortable table.",
    illustration: (
      <svg
        className="h-full w-full"
        viewBox="0 0 200 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Row 1 */}
        <rect x="25" y="15" width="150" height="28" rx="6" className="fill-muted stroke-primary" strokeWidth="1.5" opacity="0.3" />
        <rect x="40" y="24" width="60" height="10" rx="3" className="fill-primary" opacity="0.2" />
        <text x="140" y="32" textAnchor="end" className="fill-primary" opacity="0.3" fontSize="9" fontFamily="monospace">
          v3
        </text>
        {/* Row 2 */}
        <rect x="25" y="50" width="150" height="28" rx="6" className="fill-muted stroke-primary" strokeWidth="1.5" opacity="0.3" />
        <rect x="40" y="59" width="60" height="10" rx="3" className="fill-primary" opacity="0.2" />
        <text x="140" y="67" textAnchor="end" className="fill-primary" opacity="0.3" fontSize="9" fontFamily="monospace">
          v2
        </text>
        {/* Row 3 (active) */}
        <rect x="25" y="85" width="150" height="28" rx="6" className="fill-secondary stroke-secondary" strokeWidth="1.5" opacity="0.12" />
        <rect x="40" y="94" width="60" height="10" rx="3" className="fill-primary" opacity="0.3" />
        <text x="140" y="102" textAnchor="end" className="fill-secondary" opacity="0.8" fontSize="9" fontFamily="monospace" fontWeight="600">
          v1
        </text>
        {/* Hash chain connectors */}
        <path
          d="M100 43V50M100 78V85"
          className="stroke-primary"
          strokeWidth="1.5"
          opacity="0.12"
          strokeDasharray="4 3"
        />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Compare",
    description:
      "Select any two versions and TrustVault runs the comparison. If content differs, intelligent analysis determines whether the change is MATERIAL or NOT MATERIAL — with transparent reasoning you can review.",
    illustration: (
      <svg
        className="h-full w-full"
        viewBox="0 0 200 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Left document */}
        <rect x="15" y="25" width="75" height="100" rx="6" className="fill-muted stroke-primary" strokeWidth="1.5" opacity="0.3" />
        <rect x="28" y="48" width="50" height="6" rx="3" className="fill-primary" opacity="0.15" />
        <rect x="28" y="60" width="40" height="6" rx="3" className="fill-primary" opacity="0.1" />
        <rect x="28" y="72" width="46" height="6" rx="3" className="fill-destructive" opacity="0.2" />
        <text x="35" y="25" className="fill-primary" opacity="0.4" fontSize="9" fontFamily="monospace">
          Original
        </text>

        {/* Right document */}
        <rect x="110" y="25" width="75" height="100" rx="6" className="fill-muted stroke-primary" strokeWidth="1.5" opacity="0.3" />
        <rect x="123" y="48" width="50" height="6" rx="3" className="fill-primary" opacity="0.15" />
        <rect x="123" y="60" width="40" height="6" rx="3" className="fill-primary" opacity="0.1" />
        <rect x="123" y="72" width="46" height="6" rx="3" className="fill-success" opacity="0.2" />
        <text x="130" y="25" className="fill-primary" opacity="0.4" fontSize="9" fontFamily="monospace">
          New
        </text>

        {/* Verdict badge */}
        <rect x="55" y="115" width="90" height="28" rx="14" className="fill-primary" />
        <text
          x="100"
          y="133"
          textAnchor="middle"
          className="fill-secondary"
          fontSize="8"
          fontFamily="monospace"
          fontWeight="600"
        >
          MATERIAL CHANGE
        </text>

        {/* Connectors */}
        <path d="M97.5 75H102.5" className="stroke-primary" strokeWidth="1.5" opacity="0.15" strokeDasharray="3 2" />
        <path d="M100 105V115" className="stroke-primary" strokeWidth="1.5" opacity="0.12" />
      </svg>
    ),
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
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-base font-bold text-secondary uppercase tracking-widest">
            How It Works
          </span>
          <h2 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            Three steps to document confidence
          </h2>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            No complex setup. No manual hashing. Upload, track, and compare in
            minutes.
          </p>
        </div>

        {/* Steps */}
        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.number} className="relative">
              {/* Connecting line between steps (desktop only) */}
              {index < steps.length - 1 && (
                <div
                  className="hidden lg:block absolute top-16 left-[calc(50%+4rem)] w-[calc(100%-8rem)] h-0.5 bg-gradient-to-r from-secondary/30 to-transparent"
                  aria-hidden="true"
                />
              )}

              <div className="flex flex-col items-center text-center">
                {/* Step number */}
                <span className="text-sm font-bold text-secondary tracking-widest">
                  {step.number}
                </span>

                {/* Illustration */}
                <div className="mt-4 w-48 h-32 sm:w-52 sm:h-36 flex items-center justify-center">
                  {step.illustration}
                </div>

                {/* Title */}
                <h3 className="mt-4 text-xl font-semibold text-foreground">
                  {step.title}
                </h3>

                {/* Description */}
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-xs">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
