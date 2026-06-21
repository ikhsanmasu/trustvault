import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Creates a user-scoped Supabase client for use in route handlers.
 *
 * The client uses the session cookie (set by the browser after sign-in) to
 * authenticate as the current user. All database and storage operations made
 * with this client are scoped by Supabase RLS policies to the user's tenant
 * and projects.
 *
 * This client uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the anon key), NOT the
 * service-role key. The user's JWT, extracted from the session cookie,
 * provides the identity for RLS enforcement.
 */
export async function createRouteHandlerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: Record<string, unknown>;
          }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component context
            // where cookies cannot be set. This is safe to ignore because
            // middleware.ts already refreshes the session cookie on every
            // request.
          }
        },
      },
    },
  );
}
