"use client";

import { useEffect, useState } from "react";

interface SiteStats {
  users: number;
  documents: number;
  anchored: number;
  active_shares: number;
  projects: number;
}

const STATS_CONFIG = [
  { key: "users" as const, label: "Teams", desc: "Trusted by professionals" },
  { key: "documents" as const, label: "Documents", desc: "Securely stored" },
  { key: "anchored" as const, label: "On-Chain", desc: "Blockchain verified" },
  { key: "active_shares" as const, label: "Shared", desc: "Active secure links" },
];

function AnimatedCounter({
  target,
  duration = 1200,
}: {
  target: number;
  duration?: number;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (target <= 0) return;
    const start = performance.now();
    let raf: number;

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return <span className="tabular-nums">{count.toLocaleString()}</span>;
}

export function Stats() {
  const [stats, setStats] = useState<SiteStats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats) return null;

  return (
    <section id="current-usage" className="relative bg-background py-20 sm:py-28">
      {/* Subtle top border decoration */}
      <div
        className="absolute inset-x-0 top-0 mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-border/50 to-transparent"
        aria-hidden="true"
      />

      <div className="mx-auto max-w-6xl px-6">
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-base font-bold text-secondary uppercase tracking-widest">
            Growing Every Day
          </span>
          <h2 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            inTrustVault by the numbers
          </h2>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            Teams are securing documents, anchoring them on-chain, and sharing
            with confidence -- right now.
          </p>
        </div>

        {/* Stats cards */}
        <div className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STATS_CONFIG.map(({ key, label, desc }) => (
            <div
              key={key}
              className="flex flex-col items-center gap-1 rounded-2xl bg-card px-4 py-6 text-center shadow-sm border border-border/50 transition-shadow hover:shadow-md"
            >
              <span className="text-4xl font-bold text-foreground">
                <AnimatedCounter target={stats[key]} />
              </span>
              <span className="text-sm font-semibold text-foreground">
                {label}
              </span>
              <span className="text-xs text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
