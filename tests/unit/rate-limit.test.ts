// ---------------------------------------------------------------------------
// TrustVault — Rate Limiting Logic Unit Tests
// ---------------------------------------------------------------------------
import { describe, it, expect } from "vitest";
import {
  PLAN_LIMITS,
  checkRateLimitInMemory,
  type PlanType,
} from "@/lib/rate-limit";

describe("Rate Limiting — Plan Limits", () => {
  it("all plans are defined", () => {
    const plans: PlanType[] = ["free", "pro", "enterprise"];
    for (const plan of plans) {
      expect(PLAN_LIMITS[plan]).toBeDefined();
    }
  });

  it("free plan has 50 LLM calls", () => {
    expect(PLAN_LIMITS.free.maxLlmCalls).toBe(50);
  });

  it("free plan has 10 max docs", () => {
    expect(PLAN_LIMITS.free.maxDocs).toBe(10);
  });

  it("free plan has 50 MB max file size", () => {
    expect(PLAN_LIMITS.free.maxFileSize).toBe(50 * 1024 * 1024);
  });

  it("free plan has 100 MB max storage", () => {
    expect(PLAN_LIMITS.free.maxStorage).toBe(100 * 1024 * 1024);
  });

  it("pro plan has 500 LLM calls", () => {
    expect(PLAN_LIMITS.pro.maxLlmCalls).toBe(500);
  });

  it("pro plan is unlimited for docs", () => {
    expect(PLAN_LIMITS.pro.maxDocs).toBe(Infinity);
  });

  it("enterprise plan is fully unlimited", () => {
    expect(PLAN_LIMITS.enterprise.maxDocs).toBe(Infinity);
    expect(PLAN_LIMITS.enterprise.maxLlmCalls).toBe(Infinity);
    expect(PLAN_LIMITS.enterprise.maxFileSize).toBe(Infinity);
    expect(PLAN_LIMITS.enterprise.maxStorage).toBe(Infinity);
  });

  it("plan limits are monotonic: free < pro < enterprise", () => {
    expect(PLAN_LIMITS.free.maxLlmCalls).toBeLessThan(PLAN_LIMITS.pro.maxLlmCalls);
    expect(PLAN_LIMITS.free.maxDocs).toBeLessThan(PLAN_LIMITS.pro.maxDocs);
    expect(PLAN_LIMITS.free.maxFileSize).toBeLessThan(PLAN_LIMITS.pro.maxFileSize);
  });
});

describe("Rate Limiting — checkRateLimitInMemory (fixed window)", () => {
  it("allows first request", () => {
    const r = checkRateLimitInMemory("fresh-" + Date.now());
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(29);
    expect(r.resetAt).toBeGreaterThan(Date.now() / 1000);
  });

  it("remaining decreases with each request", () => {
    const id = "countdown-" + Date.now();
    const r1 = checkRateLimitInMemory(id);
    expect(r1.remaining).toBe(29);
    const r2 = checkRateLimitInMemory(id);
    expect(r2.remaining).toBe(28);
    const r3 = checkRateLimitInMemory(id);
    expect(r3.remaining).toBe(27);
  });

  it("blocks after 30 requests and returns 0 remaining", () => {
    const id = "blocktest-" + Date.now();
    for (let i = 0; i < 30; i++) {
      const r = checkRateLimitInMemory(id);
      expect(r.allowed).toBe(true);
    }
    const blocked = checkRateLimitInMemory(id);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("resetAt is a valid future timestamp", () => {
    const r = checkRateLimitInMemory("timestamp-" + Date.now());
    expect(r.resetAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(r.resetAt).toBeLessThan(Math.floor(Date.now() / 1000) + 120);
  });

  it("different keys have separate limits", () => {
    const a = checkRateLimitInMemory("agent-a-" + Date.now());
    const b = checkRateLimitInMemory("agent-b-" + Date.now());
    expect(a.remaining).toBe(29);
    expect(b.remaining).toBe(29);
  });
});
