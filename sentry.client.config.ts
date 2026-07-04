import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Replay samples only errors by default — no PII recording
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0.1,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 1.0,

  // Never send PII
  sendDefaultPii: false,
});
