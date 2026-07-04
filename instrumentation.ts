// ---------------------------------------------------------------------------
// Next.js Instrumentation Hook — runs once at server startup.
// 1. Registers Sentry for error tracking
// 2. Validates environment variables
// ---------------------------------------------------------------------------

import * as Sentry from "@sentry/nextjs";

export async function register() {
  // ── Sentry initialization ──────────────────────────────────────────────
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    // Validate environment on server startup (after Sentry is ready)
    const { validateEnvironment } = await import("@/lib/env-check");
    validateEnvironment();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Capture unhandled errors in route handlers
export const onRequestError = Sentry.captureRequestError;
