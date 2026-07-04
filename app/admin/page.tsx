"use client";

import { useEffect, useState } from "react";

interface AdminData {
  counts: {
    tenants: number;
    users: number;
    documents: number;
    anchoredDocuments: number;
    activeShares: number;
    activeAgents: number;
    totalChunks: number;
  };
  tenants: Array<{
    id: string;
    name: string;
    plan: string;
    usageDocs: number;
    usageLlmCalls: number;
    createdAt: string;
  }>;
  health: {
    uptime: number;
    counts: { errors: number; warnings: number };
    memory: { heapUsedMB: number; rssMB: number };
  };
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSecret(params.get("secret") ?? "");
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const url = secret
        ? `/api/admin/dashboard?secret=${encodeURIComponent(secret)}`
        : "/api/admin/dashboard";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [secret]);

  if (loading) return <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center text-lg animate-pulse">Loading…</div>;
  if (error) return <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center text-red-400">{error}</div>;
  if (!data) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8 font-mono">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-indigo-400">TrustVault — Platform Admin</h1>
        <button onClick={fetchData} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-sm">Refresh</button>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
        <Card label="Tenants" value={formatNumber(data.counts.tenants)} color="text-indigo-400" />
        <Card label="Users" value={formatNumber(data.counts.users)} color="text-blue-400" />
        <Card label="Documents" value={formatNumber(data.counts.documents)} color="text-green-400" />
        <Card label="Anchored" value={formatNumber(data.counts.anchoredDocuments)} color="text-yellow-400" />
        <Card label="Shares" value={formatNumber(data.counts.activeShares)} color="text-orange-400" />
        <Card label="Agents" value={formatNumber(data.counts.activeAgents)} color="text-purple-400" />
        <Card label="Chunks" value={formatNumber(data.counts.totalChunks)} color="text-gray-400" />
      </div>

      {/* System */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Card label="Uptime" value={Math.floor(data.health.uptime / 3600) + "h"} color="text-gray-300" />
        <Card label="Errors" value={String(data.health.counts.errors)} color="text-red-400" />
        <Card label="Heap" value={data.health.memory.heapUsedMB + "MB"} color="text-blue-400" />
        <Card label="RSS" value={data.health.memory.rssMB + "MB"} color="text-purple-400" />
      </div>

      {/* Tenant Table */}
      <h2 className="text-lg font-semibold text-gray-300 mb-3">Recent Tenants</h2>
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 bg-gray-800 text-xs text-gray-400 uppercase">
          <div>Name</div><div>Plan</div><div>Docs</div><div>LLM Calls</div><div>Created</div>
        </div>
        {data.tenants.map(t => (
          <div key={t.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 border-t border-gray-800 text-xs hover:bg-gray-800/30">
            <div className="truncate">{t.name}</div>
            <div><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.plan === "enterprise" ? "bg-purple-900 text-purple-200" : t.plan === "pro" ? "bg-blue-900 text-blue-200" : "bg-gray-700 text-gray-300"}`}>{t.plan}</span></div>
            <div className="text-gray-400">{t.usageDocs}</div>
            <div className="text-gray-400">{t.usageLlmCalls}</div>
            <div className="text-gray-500">{new Date(t.createdAt).toLocaleDateString()}</div>
          </div>
        ))}
      </div>

      <p className="text-gray-700 text-xs text-center mt-8">
        Access via ?secret=ADMIN_MONITORING_SECRET · <a href="/admin/monitoring" className="text-indigo-500 hover:underline">Monitoring Dashboard →</a>
      </p>
    </div>
  );
}

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
      <div className="text-gray-500 text-[10px] uppercase mb-1">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}
