import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust sampling in production. 1.0 = 100% (good for low-traffic beta, reduce for scale)
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Enable logs
  enableLogs: true,

  // Never send PII in production
  sendDefaultPii: false,

  dataCollection: {
    userInfo: false,
    httpBodies: [],
  },
});
