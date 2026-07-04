"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────

interface MonitoringEvent {
  id: number;
  level: "fatal" | "error" | "warning" | "info";
  timestamp: string;
  operation: string;
  message: string;
  stack?: string[];
  user?: { userId?: string; tenantId?: string };
}

interface MonitoringMetrics {
  status: string;
  service: string;
  environment: string;
  timestamp: string;
  uptime: number;
  counts: { errors: number; warnings: number; slowOps: number; requests: number };
  memory: { heapUsedMB: number; heapTotalMB: number; rssMB: number };
  events: MonitoringEvent[];
  eventsTotal: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const levelColors: Record<string, string> = {
  fatal: "bg-red-900 text-red-100 border-red-700",
  error: "bg-red-100 text-red-800 border-red-300",
  warning: "bg-yellow-100 text-yellow-800 border-yellow-300",
  info: "bg-blue-100 text-blue-800 border-blue-300",
};

// ── Page Component ─────────────────────────────────────────────────────────

function MonitoringPageInner() {
  const searchParams = useSearchParams();
  const secret = searchParams.get("secret") ?? "";
  const apiUrl = secret ? `/api/admin/monitoring?secret=${encodeURIComponent(secret)}` : "/api/admin/monitoring";

  const [data, setData] = useState<MonitoringMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error("Access denied. Login as tenant owner or add ?secret=ADMIN_MONITORING_SECRET");
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as MonitoringMetrics;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchMetrics]);

  const toggleExpand = (id: number) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
        <div className="text-lg animate-pulse">Loading monitoring data…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
        <div className="text-red-400 text-lg">Error: {error ?? "No data"}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-indigo-400">TrustVault Monitor</h1>
          <p className="text-gray-500 text-sm mt-1">
            {data.service} · {data.environment} · updated {formatTime(data.timestamp)}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-indigo-500"
            />
            Auto-refresh (5s)
          </label>
          <button
            onClick={fetchMetrics}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-sm font-semibold transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-8">
        <StatCard label="Status" value={data.status} color="text-green-400" />
        <StatCard label="Uptime" value={formatUptime(data.uptime)} color="text-gray-300" />
        <StatCard label="Errors" value={String(data.counts.errors)} color="text-red-400" />
        <StatCard label="Warnings" value={String(data.counts.warnings)} color="text-yellow-400" />
        <StatCard label="Slow Ops" value={String(data.counts.slowOps)} color="text-orange-400" />
        <StatCard
          label="Heap"
          value={`${data.memory.heapUsedMB}MB`}
          color="text-blue-400"
          sub={`/ ${data.memory.heapTotalMB}MB`}
        />
        <StatCard label="RSS" value={`${data.memory.rssMB}MB`} color="text-purple-400" />
        <StatCard label="Events" value={String(data.eventsTotal)} color="text-gray-400" />
      </div>

      {/* Event Log */}
      <div>
        <h2 className="text-lg font-semibold text-gray-300 mb-3">
          Event Log <span className="text-gray-600 text-sm">(last 100 of {data.eventsTotal} total)</span>
        </h2>
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[80px_1fr_1fr_2fr] gap-2 px-4 py-2 bg-gray-800 text-xs text-gray-400 uppercase tracking-wider">
            <div>Level</div>
            <div>Time</div>
            <div>Operation</div>
            <div>Message</div>
          </div>

          {/* Table Body */}
          {data.events.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-600">No events recorded yet.</div>
          ) : (
            data.events
              .slice()
              .reverse()
              .map((event) => (
                <div key={event.id}>
                  <div
                    onClick={() => toggleExpand(event.id)}
                    className={`grid grid-cols-[80px_1fr_1fr_2fr] gap-2 px-4 py-2 border-t border-gray-800 text-xs cursor-pointer hover:bg-gray-800/50 transition-colors ${
                      expanded.has(event.id) ? "bg-gray-800/30" : ""
                    }`}
                  >
                    <div>
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                          levelColors[event.level] ?? levelColors.info
                        }`}
                      >
                        {event.level}
                      </span>
                    </div>
                    <div className="text-gray-400">{formatTime(event.timestamp)}</div>
                    <div className="text-gray-300 truncate">{event.operation}</div>
                    <div className="text-gray-400 truncate">{event.message}</div>
                  </div>

                  {/* Expanded detail */}
                  {expanded.has(event.id) && (
                    <div className="px-4 py-3 border-t border-gray-800 bg-gray-900/50 text-xs">
                      {event.user && (event.user.userId || event.user.tenantId) && (
                        <div className="mb-2 text-gray-500">
                          User: {event.user.userId ?? "?"} · Tenant: {event.user.tenantId ?? "?"}
                        </div>
                      )}
                      {event.stack && event.stack.length > 0 && (
                        <pre className="text-gray-500 overflow-x-auto bg-gray-950 p-2 rounded max-h-40 overflow-y-auto">
                          {event.stack.join("\n")}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-gray-700 text-xs mt-8 space-y-1">
        <p>In-memory monitoring · Data resets on server restart · For production, integrate Sentry or Datadog</p>
        {secret && <p className="text-green-700">Access via admin secret · <code className="bg-gray-800 px-1 rounded">ADMIN_MONITORING_SECRET</code></p>}
        <p className="text-gray-600">
          {secret
            ? `API: curl ${typeof window !== "undefined" ? window.location.origin : ""}/api/admin/monitoring?secret=...`
            : "Production: set ADMIN_MONITORING_SECRET in Vercel env → access with ?secret=<value>"}
        </p>
      </div>
    </div>
  );
}

export default function MonitoringPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center"><div className="text-lg animate-pulse">Loading…</div></div>}>
      <MonitoringPageInner />
    </Suspense>
  );
}

// ── Stat Card Component ────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
      <div className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-lg font-bold ${color}`}>
        {value}
        {sub && <span className="text-gray-600 text-xs ml-1 font-normal">{sub}</span>}
      </div>
    </div>
  );
}
