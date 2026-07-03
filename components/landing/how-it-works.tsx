const steps = [
  {
    number: "01",
    title: "Upload",
    description:
      "Drop your documents into your secure vault. We support 14 formats -- PDFs, Word files, spreadsheets, images, and more. Every file is encrypted at rest the moment it arrives.",
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
    title: "Verify",
    description:
      "Every file receives a unique cryptographic fingerprint, permanently anchored to the blockchain. An immutable, tamper-proof record you can verify at any time.",
    illustration: (
      <svg
        className="h-full w-full"
        viewBox="0 0 200 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Document */}
        <rect x="25" y="15" width="60" height="80" rx="6" className="fill-muted stroke-primary" strokeWidth="1.5" opacity="0.3" />
        <rect x="38" y="35" width="35" height="5" rx="2.5" className="fill-primary" opacity="0.15" />
        <rect x="38" y="47" width="28" height="5" rx="2.5" className="fill-primary" opacity="0.1" />
        <rect x="38" y="59" width="32" height="5" rx="2.5" className="fill-primary" opacity="0.1" />
        {/* Fingerprint icon */}
        <path
          d="M120 30C120 30 130 20 140 30C150 40 145 55 140 55M125 45C125 45 128 35 135 38M118 55C118 55 122 48 128 50"
          className="stroke-secondary"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Chain links */}
        <rect x="140" y="70" width="18" height="10" rx="3" className="fill-none stroke-primary" strokeWidth="1.5" opacity="0.4" />
        <rect x="155" y="80" width="18" height="10" rx="3" className="fill-none stroke-primary" strokeWidth="1.5" opacity="0.4" />
        <rect x="140" y="90" width="18" height="10" rx="3" className="fill-none stroke-primary" strokeWidth="1.5" opacity="0.4" />
        {/* Shield checkmark */}
        <path
          d="M120 110L115 105L110 110L120 120L135 105L130 100L120 110Z"
          className="fill-secondary"
          opacity="0.9"
        />
        <text x="100" y="145" className="fill-primary" opacity="0.4" fontSize="8" fontFamily="monospace" textAnchor="middle">
          TAMPER-PROOF
        </text>
      </svg>
    ),
  },
  {
    number: "03",
    title: "Understand",
    description:
      "Ask your AI assistant anything about your documents. Get instant answers, summaries, and insights -- no reading required. Your vault becomes a knowledge base that talks back.",
    illustration: (
      <svg
        className="h-full w-full"
        viewBox="0 0 200 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Chat bubble left (user) */}
        <rect x="15" y="30" width="70" height="30" rx="12" className="fill-muted stroke-primary" strokeWidth="1.2" opacity="0.25" />
        <text x="50" y="49" className="fill-primary" opacity="0.4" fontSize="8" fontFamily="monospace" textAnchor="middle">
          What changed?
        </text>
        {/* Chat bubble right (AI) */}
        <rect x="115" y="55" width="70" height="45" rx="12" className="fill-secondary stroke-secondary" strokeWidth="1.2" opacity="0.1" />
        <text x="150" y="74" className="fill-secondary" opacity="0.7" fontSize="7" fontFamily="monospace" textAnchor="middle">
          The payment
        </text>
        <text x="150" y="84" className="fill-secondary" opacity="0.7" fontSize="7" fontFamily="monospace" textAnchor="middle">
          amount changed
        </text>
        {/* Sparkles */}
        <path d="M40 85L42 90L47 92L42 94L40 99L38 94L33 92L38 90L40 85Z" className="fill-secondary" opacity="0.4" />
        <path d="M175 25L176 28L179 29L176 30L175 33L174 30L171 29L174 28L175 25Z" className="fill-secondary" opacity="0.3" />
        {/* Document stack bottom */}
        <rect x="55" y="110" width="40" height="35" rx="5" className="fill-muted stroke-primary" strokeWidth="1" opacity="0.2" />
        <rect x="65" y="115" width="40" height="35" rx="5" className="fill-muted stroke-primary" strokeWidth="1" opacity="0.15" />
        <rect x="75" y="120" width="40" height="35" rx="5" className="fill-muted stroke-primary" strokeWidth="1" opacity="0.2" />
        {/* Arrow from docs to chat */}
        <path d="M95 130C105 130 110 100 115 85" className="stroke-secondary" strokeWidth="1.2" opacity="0.3" strokeDasharray="3 2" />
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
            Simple, powerful, and transparent
          </h2>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            Three steps to turn your document collection into an intelligent,
            verifiable vault.
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
