import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client initialised with the service-role key.
 *
 * This client has full database and storage access.  It must **never** be
 * exposed to the browser — use it only inside Next.js API route handlers
 * (server-side code).
 *
 * Environment variables required:
 * - `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
 * - `SUPABASE_SERVICE_ROLE_KEY` — service-role (secret) key
 */
export const supabase: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
