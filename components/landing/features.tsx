const features = [
  {
    title: "Secure Vault",
    description:
      "Your documents, encrypted and protected. Upload PDFs, contracts, spreadsheets, images, and more -- all stored safely in one place with end-to-end encryption.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    title: "Blockchain Integrity",
    description:
      "Every document is cryptographically sealed on the blockchain. Immutable fingerprints create a tamper-evident record you can verify anytime -- proof that your files have never been altered.",
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
    title: "AI Intelligence",
    description:
      "Ask questions directly to your documents. Our AI assistant reads, understands, and answers -- pulling insights, summaries, and answers from your entire vault in seconds.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    title: "Smart Sharing",
    description:
      "Share documents securely with public links. Set granular permissions -- allow viewing, downloading, or asking questions. You stay in control of who sees what.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="18" cy="5" r="3" strokeWidth={1.5} />
        <circle cx="6" cy="12" r="3" strokeWidth={1.5} />
        <circle cx="18" cy="19" r="3" strokeWidth={1.5} />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" strokeWidth={1.5} />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" strokeWidth={1.5} />
      </svg>
    ),
  },
  {
    title: "Version Tracking",
    description:
      "Track every version of every document over time. Compare any two versions side-by-side, and let AI assess which changes are significant -- so you focus on what matters.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    title: "Team Ready",
    description:
      "Built for teams of any size. Role-based access control, multi-user collaboration, and tenant-level isolation keep everyone working securely -- together.",
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
  {
    title: "AI Agent Channels",
    description:
      "Deploy intelligent chatbots trained on your documents. Connect via WhatsApp and Telegram so your team and customers get instant answers -- right where they already work.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
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
            Everything your documents deserve
          </h2>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            Secure storage, blockchain proof, and AI-powered insights -- all in
            one intelligent vault.
          </p>
        </div>

        {/* Feature cards carousel */}
        <div className="mt-16 carousel-wrapper">
          <div className="carousel-track">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group relative shrink-0 rounded-2xl border border-border bg-card p-8 transition-all duration-300 hover:shadow-elevation-3 hover:-translate-y-1 hover:border-secondary/25"
                style={{ minWidth: 280, maxWidth: 380, width: 380 }}
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
            {/* Duplicate for seamless infinite loop */}
            {features.map((feature) => (
              <div
                key={`dup-${feature.title}`}
                className="group relative shrink-0 rounded-2xl border border-border bg-card p-8 transition-all duration-300 hover:shadow-elevation-3 hover:-translate-y-1 hover:border-secondary/25"
                style={{ minWidth: 280, maxWidth: 380, width: 380 }}
              >
                <div className="absolute top-0 left-6 right-6 h-0.5 rounded-full bg-gradient-to-r from-transparent via-secondary/0 to-transparent transition-all duration-300 group-hover:via-secondary/60" />
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/5 text-primary group-hover:bg-secondary/10 group-hover:text-secondary transition-colors duration-300">
                  {feature.icon}
                </div>
                <h3 className="mt-5 text-lg font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .carousel-track {
          display: flex;
          gap: 1.5rem;
          width: max-content;
          animation: scroll 30s linear infinite;
        }
        .carousel-track:hover {
          animation-play-state: paused;
        }
        .carousel-wrapper {
          overflow: hidden;
          mask-image: linear-gradient(
            to right,
            transparent,
            black 5%,
            black 95%,
            transparent
          );
        }
      `}</style>
    </section>
  );
}
