import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * P2 middleware — refreshes the Supabase auth session cookie on every request.
 *
 * This middleware does NOT:
 * - Redirect unauthenticated users (route handlers return 401, UI handles auth)
 * - Check roles or permissions (route handlers enforce RBAC)
 * - Protect routes
 *
 * It ONLY refreshes the session cookie so that subsequent calls to
 * supabase.auth.getUser() in route handlers receive a valid session.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          cookiesToSet.forEach(
            ({
              name,
              value,
              options,
            }: {
              name: string;
              value: string;
              options: CookieOptions;
            }) => response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session if a valid refresh token is in the cookie.
  // Expired/invalid cookies are simply not refreshed — no redirect.
  await supabase.auth.getSession();

  return response;
}

/**
 * Run on all paths except static assets and Next.js internals.
 * This ensures the session is refreshed for API routes and pages.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
