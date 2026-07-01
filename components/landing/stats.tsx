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
  { key: "users" as const, label: "Users", icon: "👥" },
  { key: "documents" as const, label: "Documents", icon: "📄" },
  { key: "anchored" as const, label: "Anchored", icon: "🔒" },
  { key: "active_shares" as const, label: "Active Shares", icon: "🔗" },
  { key: "projects" as const, label: "Projects", icon: "📁" },
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
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
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
    <section className="border-y bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
          {STATS_CONFIG.map(({ key, label, icon }) => (
            <div
              key={key}
              className="flex flex-col items-center gap-2 rounded-xl bg-card px-4 py-6 text-center shadow-sm transition-shadow hover:shadow-md"
            >
              <span className="text-3xl">{icon}</span>
              <span className="text-3xl font-bold text-foreground">
                <AnimatedCounter target={stats[key]} />
              </span>
              <span className="text-sm text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
