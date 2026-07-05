// ---------------------------------------------------------------------------
// TrustVault — Monitoring Unit Tests
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach } from "vitest";
import {
  setMonitoringUser,
  captureError,
  captureMessage,
  getMetrics,
  getHealthStatus,
} from "@/lib/monitoring";

describe("Monitoring — getHealthStatus", () => {
  it("returns ok status", () => {
    const status = getHealthStatus();
    expect(status.status).toBe("ok");
    expect(status.service).toBe("trustvault");
    expect(typeof status.uptime).toBe("number");
    expect(status.uptime).toBeGreaterThan(0);
  });
});

describe("Monitoring — getMetrics", () => {
  it("returns all required fields", () => {
    const metrics = getMetrics();
    expect(metrics.status).toBe("ok");
    expect(metrics.uptime).toBeGreaterThan(0);
    expect(metrics.counts.errors).toBeGreaterThanOrEqual(0);
    expect(metrics.counts.warnings).toBeGreaterThanOrEqual(0);
    expect(metrics.counts.slowOps).toBeGreaterThanOrEqual(0);
    expect(metrics.memory.heapUsedMB).toBeGreaterThan(0);
    expect(metrics.memory.rssMB).toBeGreaterThan(0);
    expect(Array.isArray(metrics.events)).toBe(true);
    expect(typeof metrics.eventsTotal).toBe("number");
  });
});

describe("Monitoring — captureError", () => {
  beforeEach(() => {
    setMonitoringUser(null);
  });

  it("increments error counter", () => {
    const before = getMetrics().counts.errors;
    captureError(new Error("test"));
    expect(getMetrics().counts.errors).toBeGreaterThanOrEqual(before + 1);
  });

  it("pushes event to ring buffer", () => {
    const before = getMetrics().eventsTotal;
    captureError(new Error("ring buffer test"), { operation: "test/op" });
    const metrics = getMetrics();
    expect(metrics.eventsTotal).toBeGreaterThanOrEqual(before + 1);
    const last = metrics.events.at(-1);
    expect(last?.level).toBe("error");
    expect(last?.operation).toBe("test/op");
  });

  it("handles non-Error throwables", () => {
    captureError("string error");
    captureError(42);
    captureError(null);
    // Should not throw
    expect(getMetrics().counts.errors).toBeGreaterThanOrEqual(0);
  });

  it("includes user context when set", () => {
    setMonitoringUser({ id: "user-1", tenantId: "tenant-a" });
    captureError(new Error("user error"), { operation: "auth" });
    const metrics = getMetrics();
    const last = metrics.events.at(-1);
    expect(last?.user?.userId).toBe("user-1");
    expect(last?.user?.tenantId).toBe("tenant-a");
  });

  it("clears user context when set to null", () => {
    setMonitoringUser({ id: "u1" });
    captureError(new Error("with user"));
    setMonitoringUser(null);
    captureError(new Error("without user"));
    const metrics = getMetrics();
    const last = metrics.events.at(-1);
    expect(last?.user?.userId).toBeUndefined();
  });
});

describe("Monitoring — captureMessage", () => {
  it("increments warning counter for warnings", () => {
    const before = getMetrics().counts.warnings;
    captureMessage("test warning", "warning");
    expect(getMetrics().counts.warnings).toBeGreaterThanOrEqual(before + 1);
  });

  it("does NOT increment error counter for info messages", () => {
    const before = getMetrics().counts.errors;
    captureMessage("info msg", "info");
    expect(getMetrics().counts.errors).toBe(before);
  });

  it("pushes to ring buffer", () => {
    const before = getMetrics().eventsTotal;
    captureMessage("info event", "info", { key: "value" });
    expect(getMetrics().eventsTotal).toBeGreaterThanOrEqual(before + 1);
  });
});
