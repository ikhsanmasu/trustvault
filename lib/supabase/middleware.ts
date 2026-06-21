import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Creates a Supabase client for use in Next.js middleware.
 *
 * This mirrors the pattern used by the root `middleware.ts`. It accepts the
 * middleware's `request` and a mutable `response` object so that session
 * cookies can be read from the request and updated cookies set on the response.
 *
 * Exported for consistency and for use by tests or other middleware-like
 * contexts.
 */
export function createMiddlewareClient(
  request: NextRequest,
  response: NextResponse,
) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
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
}
