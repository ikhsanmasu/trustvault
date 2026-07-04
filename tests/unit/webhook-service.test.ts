// ---------------------------------------------------------------------------
// TrustVault — Webhook Service Unit Tests
// ---------------------------------------------------------------------------
import { describe, it, expect } from "vitest";
import {
  enforceWebhookRateLimit,
  validateWebhookMessage,
} from "@/lib/services/webhook-service";

describe("Webhook Service — enforceWebhookRateLimit", () => {
  it("allows first request", () => {
    const result = enforceWebhookRateLimit("agent-test-1");
    expect(result.allowed).toBe(true);
  });

  it("allows up to 30 requests", () => {
    const id = "agent-test-burst-" + Date.now();
    for (let i = 0; i < 30; i++) {
      const result = enforceWebhookRateLimit(id);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks 31st request in 60s window", () => {
    const id = "agent-test-block-" + Date.now();
    for (let i = 0; i < 30; i++) {
      enforceWebhookRateLimit(id);
    }
    const result = enforceWebhookRateLimit(id);
    expect(result.allowed).toBe(false);
    expect(result.headers).toBeDefined();
    expect(result.headers!["X-RateLimit-Remaining"]).toBe("0");
  });

  it("returns headers with correct format on block", () => {
    const id = "agent-test-headers-" + Date.now();
    for (let i = 0; i < 30; i++) enforceWebhookRateLimit(id);

    const result = enforceWebhookRateLimit(id);
    expect(result.allowed).toBe(false);
    expect(result.headers).toBeDefined();
    expect(result.headers!["Retry-After"]).toBeDefined();
    expect(Number(result.headers!["Retry-After"])).toBeGreaterThan(0);
  });
});

describe("Webhook Service — validateWebhookMessage", () => {
  it("accepts valid text message", () => {
    const result = validateWebhookMessage("What does clause 7 say?");
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.text).toBe("What does clause 7 say?");
  });

  it("rejects empty string", () => {
    expect(validateWebhookMessage("").valid).toBe(false);
  });

  it("rejects whitespace-only", () => {
    expect(validateWebhookMessage("   \n   ").valid).toBe(false);
  });

  it("rejects undefined", () => {
    expect(validateWebhookMessage(undefined).valid).toBe(false);
  });

  it("trims whitespace", () => {
    const result = validateWebhookMessage("  hello  ");
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.text).toBe("hello");
  });

  it("rejects messages over 4000 chars", () => {
    const long = "x".repeat(4001);
    expect(validateWebhookMessage(long).valid).toBe(false);
  });

  it("accepts exactly 4000 chars", () => {
    const max = "x".repeat(4000);
    const result = validateWebhookMessage(max);
    expect(result.valid).toBe(true);
  });
});
