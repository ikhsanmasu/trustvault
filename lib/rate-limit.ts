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
// consumeUsage / releaseUsage — atomic quota enforcement (P21)
// ---------------------------------------------------------------------------

/** Usage amounts to consume or release in a single atomic operation. */
export interface UsageDelta {
  documents?: number;
  llmCalls?: number;
  storageBytes?: number;
}

/**
 * Atomically checks plan limits AND increments usage counters in a single
 * UPDATE (DB function `try_consume_tenant_usage`). Unlike the
 * check-then-increment pattern (`checkUploadLimit` + `incrementUsage`),
 * concurrent requests cannot race past a plan limit.
 *
 * `checkUploadLimit`/`checkLLMLimit` remain useful as pre-checks for friendly
 * error messages; this function is the enforcement point.
 *
 * If the RPC is unavailable (migration not applied), falls back to the legacy
 * non-atomic increment and logs — availability is preferred over strictness
 * for a missing-migration misconfiguration.
 */
export async function consumeUsage(
  supabase: SupabaseClient,
  tenantId: string,
  delta: UsageDelta,
  opts?: { endpoint?: string; tokens?: number },
): Promise<LimitCheckResult> {
  const tenant = await getTenant(supabase, tenantId);
  if (!tenant) {
    return { allowed: false, reason: "Tenant not found", plan: "free", current: 0, limit: 0 };
  }

  const limits = PLAN_LIMITS[tenant.plan] ?? PLAN_LIMITS.free;
  const toParam = (limit: number): number | null =>
    isUnlimited(limit) ? null : limit;

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient.rpc("try_consume_tenant_usage", {
    p_tenant_id: tenantId,
    p_documents: delta.documents ?? 0,
    p_llm_calls: delta.llmCalls ?? 0,
    p_storage_bytes: delta.storageBytes ?? 0,
    p_max_documents: toParam(limits.maxDocs),
    p_max_llm_calls: toParam(limits.maxLlmCalls),
    p_max_storage_bytes: toParam(limits.maxStorage),
  });

  if (error) {
    console.error(
      `[consumeUsage] RPC try_consume_tenant_usage failed for tenant=${tenantId} — falling back to non-atomic increment:`,
      error,
    );
    if (delta.documents) {
      await incrementUsage(supabase, tenantId, "documents", { amount: delta.documents });
    }
    if (delta.storageBytes) {
      await incrementUsage(supabase, tenantId, "storage_bytes", { amount: delta.storageBytes });
    }
    if (delta.llmCalls) {
      await incrementUsage(supabase, tenantId, "llm_calls", {
        amount: delta.llmCalls,
        endpoint: opts?.endpoint,
        tokens: opts?.tokens,
      });
    }
    return { allowed: true, plan: tenant.plan, current: 0, limit: null };
  }

  if (data !== true) {
    return {
      allowed: false,
      reason: "Plan limit reached",
      plan: tenant.plan,
      current: tenant.usage_documents,
      limit: isUnlimited(limits.maxDocs) ? null : limits.maxDocs,
    };
  }

  if (delta.llmCalls) {
    await serviceClient.from("llm_usage_log").insert({
      tenant_id: tenantId,
      endpoint: opts?.endpoint ?? "unknown",
      tokens_used: opts?.tokens ?? 0,
    });
  }

  return { allowed: true, plan: tenant.plan, current: tenant.usage_documents, limit: null };
}

/**
 * Releases previously consumed usage (compensation when the work that the
 * quota was reserved for fails, e.g. a storage upload error after
 * `consumeUsage` succeeded). Unconditional negative increment.
 */
export async function releaseUsage(
  tenantId: string,
  delta: UsageDelta,
): Promise<void> {
  const serviceClient = createServiceClient();
  const { error } = await serviceClient.rpc("increment_tenant_usage", {
    p_tenant_id: tenantId,
    p_documents: -(delta.documents ?? 0),
    p_llm_calls: -(delta.llmCalls ?? 0),
    p_storage_bytes: -(delta.storageBytes ?? 0),
  });

  if (error) {
    console.error(`[releaseUsage] Failed to release usage for tenant=${tenantId}:`, error);
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
// P21: Fixed-window rate limiter for public endpoints
// ---------------------------------------------------------------------------

interface RateWindow {
  count: number;
  resetAt: number;
}

const rateLimitWindows = new Map<string, RateWindow>();

/** Result of a rate limit check, including data for response headers. */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // unix timestamp (seconds)
}

/**
 * Fixed-window rate limiter enforced in Postgres so it holds across
 * serverless instances and cold starts.
 *
 * Intended for public, unauthenticated endpoints that trigger paid work
 * (e.g. the shared-link chat, which calls the LLM without a session).
 * `key` should identify the resource being protected, e.g. `share-chat:{token}`.
 *
 * Falls back to the in-memory limiter if the RPC is unavailable (e.g. the
 * P21 migration has not been applied) — weaker than the DB limiter but
 * better than letting requests through unmetered.
 */
export async function checkRateLimit(
  key: string,
  maxRequests = 30,
  windowMs = 60_000,
): Promise<RateLimitResult> {
  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient.rpc("check_rate_limit", {
    p_key: key,
    p_max: maxRequests,
    p_window_seconds: Math.ceil(windowMs / 1000),
  });

  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    console.error(
      `[checkRateLimit] RPC check_rate_limit failed for key=${key} — falling back to in-memory limiter:`,
      error,
    );
    return checkRateLimitInMemory(key, maxRequests, windowMs);
  }

  const r = row as { allowed: boolean; remaining: number; reset_at: string };
  return {
    allowed: r.allowed,
    remaining: r.remaining,
    resetAt: Math.ceil(new Date(r.reset_at).getTime() / 1000),
  };
}

/** How often the in-memory limiter sweeps expired windows. */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanupAt = 0;

/**
 * In-memory fixed-window rate limiter. Per-instance only — use
 * `checkRateLimit` in route handlers; this remains as its fallback
 * and for unit tests.
 */
export function checkRateLimitInMemory(
  key: string,
  maxRequests = 30,
  windowMs = 60_000,
): RateLimitResult {
  const now = Date.now();

  // Opportunistic cleanup — a module-scope timer would leak in serverless
  // runtimes, so stale windows are swept lazily on access instead.
  if (now - lastCleanupAt >= CLEANUP_INTERVAL_MS) {
    lastCleanupAt = now;
    cleanupRateLimitWindows();
  }

  const entry = rateLimitWindows.get(key);

  if (!entry || now >= entry.resetAt) {
    // No entry or window expired — start a new window
    rateLimitWindows.set(key, { count: 1, resetAt: now + windowMs });
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
 * Sweeps expired in-memory rate-limit windows to prevent unbounded growth
 * from stale keys. Invoked lazily from `checkRateLimitInMemory`.
 */
export function cleanupRateLimitWindows(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitWindows) {
    if (now >= entry.resetAt) {
      rateLimitWindows.delete(key);
    }
  }
}
