// ---------------------------------------------------------------------------
// TrustVault P17: Rate limiting and usage tracking helpers
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Plan types + limits
// ---------------------------------------------------------------------------

export type PlanType = "free" | "pro" | "enterprise";

export interface PlanLimits {
  maxDocs: number;
  maxFileSize: number;   // bytes, per-file
  maxStorage: number;    // bytes, total storage
  maxLlmCalls: number;
}

/** Per-plan limits. `Infinity` means unlimited. */
export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free: {
    maxDocs: 10,
    maxFileSize: 50 * 1024 * 1024,      // 50 MB per file
    maxStorage: 100 * 1024 * 1024,       // 100 MB total
    maxLlmCalls: 50,
  },
  pro: {
    maxDocs: Infinity,
    maxFileSize: 100 * 1024 * 1024,     // 100 MB per file
    maxStorage: 5 * 1024 * 1024 * 1024, // 5 GB total
    maxLlmCalls: 500,
  },
  enterprise: {
    maxDocs: Infinity,
    maxFileSize: Infinity,
    maxStorage: Infinity,
    maxLlmCalls: Infinity,
  },
};

// ---------------------------------------------------------------------------
// Tenant row shape (usage columns added by P17 migration)
// ---------------------------------------------------------------------------

interface TenantRow {
  id: string;
  plan: PlanType;
  usage_documents: number;
  usage_llm_calls: number;
  usage_storage_bytes: number;
  usage_reset_at: string | null;
}

// ---------------------------------------------------------------------------
// Usage check result
// ---------------------------------------------------------------------------

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  plan: PlanType;
  current: number;
  limit: number | null; // null = unlimited
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getTenant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantRow | null> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, plan, usage_documents, usage_llm_calls, usage_storage_bytes, usage_reset_at")
    .eq("id", tenantId)
    .single();

  if (error || !data) return null;
  return data as unknown as TenantRow;
}

function isUnlimited(limit: number): boolean {
  return !isFinite(limit);
}

// ---------------------------------------------------------------------------
// checkUploadLimit
// ---------------------------------------------------------------------------

/**
 * Checks whether a tenant can upload another document.
 *
 * The file size is compared against the plan's maxFileSize, and the current
 * document count is compared against the plan's maxDocs.
 *
 * Uses the user-scoped client so RLS is enforced (only the tenant's own
 * members can see usage data).
 */
export async function checkUploadLimit(
  supabase: SupabaseClient,
  tenantId: string,
  fileSize: number,
): Promise<LimitCheckResult> {
  const tenant = await getTenant(supabase, tenantId);
  if (!tenant) {
    return { allowed: false, reason: "Tenant not found", plan: "free", current: 0, limit: 0 };
  }

  const limits = PLAN_LIMITS[tenant.plan] ?? PLAN_LIMITS.free;

  // Check file size against plan limit
  if (!isUnlimited(limits.maxFileSize) && fileSize > limits.maxFileSize) {
    return {
      allowed: false,
      reason: `File size (${(fileSize / (1024 * 1024)).toFixed(1)} MB) exceeds plan limit (${(limits.maxFileSize / (1024 * 1024)).toFixed(1)} MB)`,
      plan: tenant.plan,
      current: tenant.usage_documents,
      limit: limits.maxDocs,
    };
  }

  // Check document count against plan limit
  if (!isUnlimited(limits.maxDocs) && tenant.usage_documents >= limits.maxDocs) {
    return {
      allowed: false,
      reason: `Document limit reached (${tenant.usage_documents}/${limits.maxDocs})`,
      plan: tenant.plan,
      current: tenant.usage_documents,
      limit: limits.maxDocs,
    };
  }

  return {
    allowed: true,
    plan: tenant.plan,
    current: tenant.usage_documents,
    limit: isUnlimited(limits.maxDocs) ? null : limits.maxDocs,
  };
}

// ---------------------------------------------------------------------------
// checkLLMLimit
// ---------------------------------------------------------------------------

/**
 * Checks whether a tenant can make another LLM call.
 */
export async function checkLLMLimit(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<LimitCheckResult> {
  const tenant = await getTenant(supabase, tenantId);
  if (!tenant) {
    return { allowed: false, reason: "Tenant not found", plan: "free", current: 0, limit: 0 };
  }

  const limits = PLAN_LIMITS[tenant.plan] ?? PLAN_LIMITS.free;

  if (!isUnlimited(limits.maxLlmCalls) && tenant.usage_llm_calls >= limits.maxLlmCalls) {
    return {
      allowed: false,
      reason: `LLM call limit reached (${tenant.usage_llm_calls}/${limits.maxLlmCalls})`,
      plan: tenant.plan,
      current: tenant.usage_llm_calls,
      limit: limits.maxLlmCalls,
    };
  }

  return {
    allowed: true,
    plan: tenant.plan,
    current: tenant.usage_llm_calls,
    limit: isUnlimited(limits.maxLlmCalls) ? null : limits.maxLlmCalls,
  };
}

// ---------------------------------------------------------------------------
// incrementUsage
// ---------------------------------------------------------------------------

/**
 * Increments a usage counter on the tenant row.
 *
 * Uses the service-role client to bypass RLS (usage counters must be
 * writable regardless of the caller's role — only the plan check gates
 * access). Also logs LLM calls to `llm_usage_log`.
 *
 * @param supabase  User-scoped client (used for reading tenant row)
 * @param tenantId  The tenant UUID
 * @param type      Which counter to increment
 * @param amount    How much to increment (default 1)
 * @param endpoint  For LLM calls: which endpoint was called (logged to llm_usage_log)
 * @param tokens    For LLM calls: approximate tokens used (logged to llm_usage_log)
 */
export async function incrementUsage(
  supabase: SupabaseClient,
  tenantId: string,
  type: "documents" | "llm_calls" | "storage_bytes",
  opts?: { amount?: number; endpoint?: string; tokens?: number },
): Promise<void> {
  const amount = opts?.amount ?? 1;
  const serviceClient = createServiceClient();

  const column =
    type === "documents"
      ? "usage_documents"
      : type === "llm_calls"
        ? "usage_llm_calls"
        : "usage_storage_bytes";

  // ── Atomic increment via RPC ──────────────────────────────────────────
  // The DB function increment_tenant_usage(p_tenant_id, p_documents, p_llm_calls, p_storage_bytes)
  // atomically increments usage counters in a single UPDATE.
  const rpcParams = {
    p_tenant_id: tenantId,
    p_documents: type === "documents" ? amount : 0,
    p_llm_calls: type === "llm_calls" ? amount : 0,
    p_storage_bytes: type === "storage_bytes" ? amount : 0,
  };

  let rpcError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await serviceClient.rpc("increment_tenant_usage", rpcParams);
    if (!error) {
      rpcError = null;
      break;
    }
    rpcError = error;
  }

  if (rpcError) {
    // RPC unavailable after retries — log and skip.
    console.error(
      `[incrementUsage] RPC increment_tenant_usage failed after retries for tenant=${tenantId}:`,
      rpcError,
    );
  }

  // ── LLM audit log ────────────────────────────────────────────────────
  if (type === "llm_calls") {
    await serviceClient.from("llm_usage_log").insert({
      tenant_id: tenantId,
      endpoint: opts?.endpoint ?? "unknown",
      tokens_used: opts?.tokens ?? 0,
    });
  }
}

// ---------------------------------------------------------------------------
// resetMonthlyUsage
// ---------------------------------------------------------------------------

/**
 * Resets monthly usage counters for all tenants whose `usage_reset_at` has
 * passed. Intended to be called by a cron job (e.g. Vercel cron or pg_cron).
 *
 * Only resets tenants with `usage_reset_at < now()` or NULL usage_reset_at
 * where it's the beginning of a new month.
 */
export async function resetMonthlyUsage(
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase
    .from("tenants")
    .update({
      usage_documents: 0,
      usage_llm_calls: 0,
      usage_storage_bytes: 0,
      usage_reset_at: new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        1,
      ).toISOString(),
    })
    .or(
      `usage_reset_at.is.null,usage_reset_at.lt.${new Date().toISOString()}`,
    )
    .select("id");

  if (error) {
    console.error("[resetMonthlyUsage] Error:", error);
    return 0;
  }

  return data?.length ?? 0;
}

// ---------------------------------------------------------------------------
// P17: Webhook rate limiter (in-memory, per-agent)
// ---------------------------------------------------------------------------

interface RateWindow {
  count: number;
  resetAt: number;
}

const webhookRateMap = new Map<string, RateWindow>();

/**
 * Result of a webhook rate limit check, including headers for the client.
 */
export interface WebhookRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // unix timestamp (seconds)
}

/**
 * Simple sliding-window rate limiter for webhook endpoints.
 *
 * Webhooks (Telegram, WhatsApp) are public endpoints called by third-party
 * servers. To protect tenants from LLM cost explosion via webhook abuse, we
 * enforce a per-agent rate limit:
 *
 * - `maxRequests`: max webhook requests allowed in the window (default 30)
 * - `windowMs`: time window in milliseconds (default 60_000 = 1 minute)
 *
 * Returns a WebhookRateLimitResult with `allowed`, `remaining`, and `resetAt`.
 */
export function checkWebhookRateLimit(
  agentId: string,
  maxRequests = 30,
  windowMs = 60_000,
): WebhookRateLimitResult {
  const now = Date.now();
  const entry = webhookRateMap.get(agentId);

  if (!entry || now >= entry.resetAt) {
    // No entry or window expired — start a new window
    webhookRateMap.set(agentId, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: Math.ceil((now + windowMs) / 1000) };
  }

  const remaining = maxRequests - entry.count;

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: Math.ceil(entry.resetAt / 1000) };
  }

  entry.count++;
  return { allowed: true, remaining: remaining - 1, resetAt: Math.ceil(entry.resetAt / 1000) };
}

/**
 * Cleans up expired rate-limit windows. Call periodically (e.g. every 5 min)
 * to prevent unbounded memory growth from stale agent IDs.
 */
export function cleanupWebhookRateLimits(): void {
  const now = Date.now();
  for (const [key, entry] of webhookRateMap) {
    if (now >= entry.resetAt) {
      webhookRateMap.delete(key);
    }
  }
}

// Periodic cleanup every 5 minutes (only in server context)
if (typeof setInterval !== "undefined") {
  setInterval(cleanupWebhookRateLimits, 5 * 60 * 1000);
}

/**
 * Creates the `increment_tenant_usage` RPC function in the database.
 * Call this once during setup (or include in a migration).
 */
export const INCREMENT_USAGE_RPC_SQL = `
CREATE OR REPLACE FUNCTION public.increment_tenant_usage(
  p_tenant_id uuid,
  p_documents int DEFAULT 0,
  p_llm_calls int DEFAULT 0,
  p_storage_bytes bigint DEFAULT 0
)
RETURNS void AS $$
BEGIN
  UPDATE public.tenants
  SET
    usage_documents = usage_documents + p_documents,
    usage_llm_calls = usage_llm_calls + p_llm_calls,
    usage_storage_bytes = usage_storage_bytes + p_storage_bytes,
    usage_reset_at = COALESCE(usage_reset_at, date_trunc('month', now()) + interval '1 month')
  WHERE id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;
