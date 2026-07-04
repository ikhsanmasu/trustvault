import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * P2 middleware — refreshes the Supabase auth session cookie on every request.
 *
 * Security hardening (P19):
 * - Blocks path traversal attempts (../ etc.)
 * - Blocks requests with suspicious patterns
 * - Restricts HTTP methods on API routes to known safe verbs
 * - Adds security headers on every response
 *
 * This middleware does NOT:
 * - Redirect unauthenticated users (route handlers return 401, UI handles auth)
 * - Check roles or permissions (route handlers enforce RBAC)
 * - Protect routes
 */

// ── Blocked patterns ──────────────────────────────────────────────────────

/** Patterns that indicate path traversal or reconnaissance attempts. */
const BLOCKED_PATH_PATTERNS = [
  /\.\./,                    // path traversal: ../ or ..\
  /%2e%2e/i,                 // URL-encoded ..
  /\/\./,                     // hidden files: /.env, /.git
  /\/wp-admin/i,              // WordPress scanning
  /\/wp-login/i,
  /\/\.env/i,                 // env file probing
  /\/\.git/i,                 // git repo probing
  /\/phpmyadmin/i,            // phpMyAdmin scanning
  /\/adminer/i,
  /\b(select|union|insert|drop|exec)\b.*\b(from|into|table|sp_)\b/i, // SQLi probes
  /<script\b/i,               // XSS probes
  /javascript:\b/i,           // XSS probes
];

/** API routes only accept these HTTP methods. */
const ALLOWED_API_METHODS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD"]);

// ── Middleware ─────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Block suspicious paths ─────────────────────────────────────────
  for (const pattern of BLOCKED_PATH_PATTERNS) {
    if (pattern.test(pathname) || pattern.test(request.url)) {
      return new NextResponse("Not Found", { status: 404 });
    }
  }

  // ── 2. Block suspicious user-agent (common bot/scanner patterns) ──────
  const ua = request.headers.get("user-agent") ?? "";
  if (
    ua.includes("nikto") ||
    ua.includes("sqlmap") ||
    ua.includes("nmap") ||
    ua.includes("masscan")
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // ── 3. Restrict HTTP methods on API routes ────────────────────────────
  if (pathname.startsWith("/api/")) {
    if (!ALLOWED_API_METHODS.has(request.method)) {
      return new NextResponse("Method Not Allowed", {
        status: 405,
        headers: { Allow: [...ALLOWED_API_METHODS].join(", ") },
      });
    }
  }

  // ── 4. Session refresh ────────────────────────────────────────────────
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
  await supabase.auth.getSession();

  // ── 5. Security headers on every response ─────────────────────────────
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // CORS: allow the app's own origin (for API calls from browser)
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL ?? "",
    process.env.APP_URL ?? "",
    "http://localhost:3000",
  ].filter(Boolean);

  if (allowedOrigins.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", [...ALLOWED_API_METHODS].join(", "));
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With",
    );

    // Handle preflight requests
    if (request.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 204,
        headers: response.headers,
      });
    }
  }

  return response;
}

/**
 * Run on all paths except static assets and Next.js internals.
 */
export const config = {
  matcher: [
    // Exclude static assets and Next.js internals
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
