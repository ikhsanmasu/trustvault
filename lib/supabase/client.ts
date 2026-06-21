import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a service-role Supabase client that **bypasses all RLS**.
 *
 * This client must ONLY be used for admin-only operations:
 * - Creating profiles/tenants on sign-up
 * - Database migrations and backfills
 * - Any cross-tenant admin operations
 *
 * It MUST NOT be used for user-facing queries — using the service-role client
 * for user operations silently breaks tenant isolation because RLS is skipped.
 *
 * For user-facing operations, use `requireAuth()` from `@/lib/supabase/auth`
 * which provides a user-scoped client that enforces RLS.
 *
 * Environment variables required:
 * - `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
 * - `SUPABASE_SERVICE_ROLE_KEY` — service-role (secret) key
 */
export function createServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Pre-created service-role client singleton.
 *
 * @deprecated This singleton is a footgun — importing it accidentally in a
 * route handler silently bypasses RLS and tenant isolation.  Prefer
 * `createServiceClient()` in new code, and route handlers must use
 * `requireAuth()` from `@/lib/supabase/auth` for user-scoped operations.
 *
 * Kept only for backward compatibility. Do NOT add new imports of this symbol.
 */
export const supabase: SupabaseClient = createServiceClient();
