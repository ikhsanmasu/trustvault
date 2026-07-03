const useCases = [
  {
    title: "Legal",
    description:
      "Contracts, NDAs, and settlement agreements demand absolute trust. Track every revision with cryptographic certainty and prove exactly what changed -- and when.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
      </svg>
    ),
  },
  {
    title: "Finance",
    description:
      "Audit reports, financial statements, and compliance records need an unbreakable chain of custody. Provide auditors with verifiable proof that nothing has been altered.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Healthcare",
    description:
      "Patient records, clinical trial data, and regulatory submissions require absolute integrity. Protect sensitive documentation with blockchain-verified audit trails.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
  },
  {
    title: "Real Estate",
    description:
      "Lease agreements, title deeds, and inspection reports -- keep every property document secure and track every amendment across the entire transaction lifecycle.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    title: "Education",
    description:
      "Academic records, research papers, and accreditation documents deserve permanent integrity. Protect institutional credibility with verifiable, time-stamped credentials.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M12 14l9-5-9-5-9 5 9 5z" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "AI Agent",
    description:
      "Deploy intelligent chatbots trained on your product docs, FAQs, and knowledge base. Connect via WhatsApp and Telegram -- give your customers instant, accurate answers 24/7.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    title: "Enterprise",
    description:
      "Board resolutions, HR policies, vendor contracts, and internal memos -- enterprise-grade document management with AI-powered insights and team-wide access control.",
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
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
            Trusted across every industry
          </h2>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            From legal contracts to healthcare records, inTrustVault delivers
            integrity and intelligence wherever documents matter.
          </p>
        </div>

        {/* Use case cards carousel */}
        <div className="mt-16 carousel-wrapper">
          <div className="carousel-track">
            {useCases.map((uc) => (
              <div
                key={uc.title}
                className="group relative shrink-0 rounded-2xl border border-border bg-card p-8 transition-all duration-300 hover:shadow-elevation-3 hover:-translate-y-1 hover:border-secondary/25"
                style={{ minWidth: 280, maxWidth: 380, width: 380 }}
              >
                <div className="absolute top-0 left-6 right-6 h-0.5 rounded-full bg-gradient-to-r from-transparent via-secondary/0 to-transparent transition-all duration-300 group-hover:via-secondary/60" />
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/5 text-primary group-hover:bg-secondary/10 group-hover:text-secondary transition-colors duration-300">
                  {uc.icon}
                </div>
                <h3 className="mt-5 text-lg font-semibold text-foreground">{uc.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{uc.description}</p>
              </div>
            ))}
            {/* Duplicate for seamless infinite loop */}
            {useCases.map((uc) => (
              <div
                key={`dup-${uc.title}`}
                className="group relative shrink-0 rounded-2xl border border-border bg-card p-8 transition-all duration-300 hover:shadow-elevation-3 hover:-translate-y-1 hover:border-secondary/25"
                style={{ minWidth: 280, maxWidth: 380, width: 380 }}
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
