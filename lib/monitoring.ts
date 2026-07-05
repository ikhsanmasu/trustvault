// ---------------------------------------------------------------------------
// TrustVault — Structured Error & Performance Monitoring
// ---------------------------------------------------------------------------
// Lightweight abstraction over error tracking. Currently logs structured JSON
// to stderr (consumable by Vercel Log Drains / Datadog / Better Stack).
// Swap the `capture*` internals to integrate Sentry, PostHog, etc.
// ---------------------------------------------------------------------------

// ---- Configuration --------------------------------------------------------

const SERVICE_NAME = "trustvault";
const ENVIRONMENT = process.env.NODE_ENV ?? "development";
const IS_PROD = ENVIRONMENT === "production";
const RING_BUFFER_SIZE = 500;

// ---- Sentry integration (lazy-loaded to avoid import-time side effects) ----

let _sentryReady = false;
async function getSentry(): Promise<typeof import("@sentry/nextjs") | null> {
  if (_sentryReady) {
    try { return await import("@sentry/nextjs"); } catch { return null; }
  }
  try {
    const sentry = await import("@sentry/nextjs");
    _sentryReady = true;
    return sentry;
  } catch {
    return null;
  }
}

// ---- Ring Buffer (in-memory event store) -----------------------------------

export interface MonitoringEvent {
  id: number;
  level: ErrorSeverity;
  timestamp: string;
  operation: string;
  message: string;
  stack?: string[];
  user?: { userId?: string; tenantId?: string };
  extra?: Record<string, unknown>;
}

let _eventId = 0;
const _ringBuffer: MonitoringEvent[] = [];

function pushEvent(event: Omit<MonitoringEvent, "id">): void {
  _eventId++;
  const evt: MonitoringEvent = { id: _eventId, ...event };
  _ringBuffer.push(evt);
  if (_ringBuffer.length > RING_BUFFER_SIZE) {
    _ringBuffer.shift();
  }
}

// ---- Error counters --------------------------------------------------------

const _counters = {
  errors: 0,
  warnings: 0,
  slowOps: 0,
  requests: 0,
};

export function incrementCounter(key: keyof typeof _counters): void {
  _counters[key]++;
}

// ---- Shared context (set once per request) ---------------------------------

let _currentUser: { id: string; tenantId?: string; email?: string } | null = null;

/** Attach user context for the current request. Call early in route handlers. */
export function setMonitoringUser(user: { id: string; tenantId?: string; email?: string } | null): void {
  _currentUser = user;
}

function getUserContext(): Record<string, unknown> {
  if (!_currentUser) return {};
  return {
    userId: _currentUser.id,
    tenantId: _currentUser.tenantId ?? undefined,
    email: _currentUser.email ?? undefined,
  };
}

// ---- Core capture functions -----------------------------------------------

export type ErrorSeverity = "fatal" | "error" | "warning" | "info";

export interface ErrorContext {
  severity?: ErrorSeverity;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  /** Route or operation that triggered the error */
  operation?: string;
}

/**
 * Captures an error with structured context.
 * In production, sends to Sentry. In dev, logs to console.
 */
export function captureError(
  error: Error | unknown,
  context: ErrorContext = {},
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const level = context.severity ?? "error";
  const operation = context.operation ?? "unknown";

  _counters.errors++;

  // ── Ring buffer ───────────────────────────────────────────────────────
  pushEvent({
    level,
    timestamp: new Date().toISOString(),
    operation,
    message: IS_PROD ? "Internal error" : err.message,
    stack: IS_PROD ? undefined : err.stack?.split("\n").slice(0, 6),
    user: {
      userId: _currentUser?.id,
      tenantId: _currentUser?.tenantId,
    },
    extra: { ...context.extra, ...(context.tags ?? {}) },
  });

  // ── Send to Sentry (production) or console (dev) ──────────────────────
  if (IS_PROD) {
    getSentry().then((Sentry) => {
      if (Sentry) {
        Sentry.captureException(err, {
          level,
          tags: {
            operation,
            service: SERVICE_NAME,
            environment: ENVIRONMENT,
            ...(context.tags ?? {}),
          },
          extra: {
            ...(context.extra ?? {}),
            ...getUserContext(),
          },
        });
      }
    }).catch(() => { /* Sentry unavailable */ });
  }

  // Always log to console (structured JSON for log drains, human-readable for dev)
  const payload = {
    level,
    timestamp: new Date().toISOString(),
    service: SERVICE_NAME,
    environment: ENVIRONMENT,
    operation,
    error: { name: err.name, message: IS_PROD ? "Internal error" : err.message },
    user: getUserContext(),
  };

  if (IS_PROD) {
    console.error(JSON.stringify(payload));
  } else {
    console.error(`[${level.toUpperCase()}] ${operation}: ${err.message}`);
    if (err.stack) console.error(err.stack.split("\n").slice(0, 6).join("\n"));
  }
}

/** Captures a non-error event (info, warning). */
export function captureMessage(
  message: string,
  severity: ErrorSeverity = "info",
  extra?: Record<string, unknown>,
): void {
  if (severity === "warning") _counters.warnings++;

  // ── Ring buffer ───────────────────────────────────────────────────────
  pushEvent({
    level: severity,
    timestamp: new Date().toISOString(),
    operation: "message",
    message,
    extra,
  });

  // ── Console output ────────────────────────────────────────────────────
  const payload = {
    level: severity,
    timestamp: new Date().toISOString(),
    service: SERVICE_NAME,
    environment: ENVIRONMENT,
    message,
    user: getUserContext(),
    extra: extra ?? {},
  };

  if (severity === "error" || severity === "fatal") {
    console.error(JSON.stringify(payload));
  } else if (severity === "warning") {
    console.warn(IS_PROD ? JSON.stringify(payload) : `[WARN] ${message}`);
  } else {
    if (!IS_PROD) console.log(`[INFO] ${message}`);
  }
}

// ---- Performance monitoring -----------------------------------------------

/**
 * Wraps an async operation with timing instrumentation.
 * Logs duration on completion.
 */
export async function instrument<T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const durationMs = Math.round(performance.now() - start);
    if (durationMs > 1000) {
      _counters.slowOps++;
      captureMessage(
        `Slow operation: ${operation} took ${durationMs}ms`,
        "warning",
        { durationMs },
      );
    }
    return result;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    captureError(err, {
      operation,
      extra: { durationMs },
    });
    throw err;
  }
}

// ---- Dashboard data --------------------------------------------------------

export interface MonitoringMetrics {
  status: string;
  service: string;
  environment: string;
  timestamp: string;
  uptime: number;
  counts: typeof _counters;
  memory: { heapUsedMB: number; heapTotalMB: number; rssMB: number };
  events: MonitoringEvent[];
  eventsTotal: number;
}

/**
 * Returns all monitoring data for the dashboard.
 * Called by the admin monitoring API endpoint.
 */
export function getMetrics(): MonitoringMetrics {
  const mem = process.memoryUsage();
  return {
    status: "ok",
    service: SERVICE_NAME,
    environment: ENVIRONMENT,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    counts: { ..._counters },
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
    },
    events: _ringBuffer.slice(-100), // last 100 events
    eventsTotal: _eventId,
  };
}

// ---- Health check endpoint helper -----------------------------------------

export function getHealthStatus(): Record<string, unknown> {
  return {
    status: "ok",
    service: SERVICE_NAME,
    environment: ENVIRONMENT,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  };
}
