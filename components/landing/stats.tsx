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
  { key: "users" as const, label: "Teams", desc: "Active users" },
  { key: "documents" as const, label: "Documents", desc: "Verified files" },
  { key: "anchored" as const, label: "On-Chain", desc: "Blockchain anchored" },
  { key: "active_shares" as const, label: "Shared", desc: "Active links" },
  { key: "projects" as const, label: "Projects", desc: "Workspaces" },
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
    <section className="bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-16">
        {/* Section heading */}
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            Platform
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Trusted document integrity at scale
          </h2>
          <p className="mt-3 text-muted-foreground">
            Real-time stats from the TrustVault network.
          </p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
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
