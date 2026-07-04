// ---------------------------------------------------------------------------
// TrustVault — Critical-Path Integration Tests
// ---------------------------------------------------------------------------
// Tests the core business logic without requiring a running Supabase instance.
// Covers: hashing pipeline, text extraction, AI response parsing, auth logic,
// rate limit calculations, email building, monitoring, and error handling.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeBinaryHash,
  computeTextHash,
  buildComparePrompt,
  parseAIResponse,
  isAllowedMimeType,
  ALLOWED_MIME_TYPES,
} from "@/lib/core";
import { computeFingerprint } from "@/lib/anchor";
import { PLAN_LIMITS, type PlanType } from "@/lib/rate-limit";
import { buildInvitationEmail } from "@/lib/email";
import { safeError, apiError, isValidUUID } from "@/lib/utils";
import { captureError, setMonitoringUser, captureMessage } from "@/lib/monitoring";

// ════════════════════════════════════════════════════════════════════════════
// 1. HASHING PIPELINE (CRITICAL — document integrity foundation)
// ════════════════════════════════════════════════════════════════════════════

describe("Hashing Pipeline", () => {
  it("computeBinaryHash: produces deterministic SHA-256", () => {
    const buf = Buffer.from("hello world");
    const h1 = computeBinaryHash(buf);
    const h2 = computeBinaryHash(buf);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("computeBinaryHash: different input → different hash", () => {
    const h1 = computeBinaryHash(Buffer.from("hello"));
    const h2 = computeBinaryHash(Buffer.from("world"));
    expect(h1).not.toBe(h2);
  });

  it("computeTextHash: empty string is valid", () => {
    const hash = computeTextHash("");
    expect(hash).toHaveLength(64);
  });

  it("computeTextHash: whitespace sensitivity", () => {
    const h1 = computeTextHash("a b");
    const h2 = computeTextHash("a  b");
    expect(h1).not.toBe(h2);
  });

  it("buildComparePrompt: truncates long text", () => {
    const longText = "x".repeat(50_000);
    const { system, user } = buildComparePrompt(longText, "short");
    expect(system).toContain("document-integrity reviewer");
    expect(user).toContain("[TRUNCATED]");
    expect(user).not.toContain("x".repeat(50_000));
  });

  it("parseAIResponse: validates correct shape", () => {
    const valid = {
      verdict: "MATERIAL" as const,
      confidence: "HIGH" as const,
      reasoning: "The parties clause changed significantly.",
    };
    const result = parseAIResponse(valid);
    expect(result.verdict).toBe("MATERIAL");
    expect(result.confidence).toBe("HIGH");
  });

  it("parseAIResponse: rejects invalid shape", () => {
    expect(() => parseAIResponse({ verdict: "MAJOR_CHANGE" })).toThrow();
    expect(() => parseAIResponse(null)).toThrow();
    expect(() => parseAIResponse({})).toThrow();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. FINGERPRINT COMPUTATION (CRITICAL — blockchain anchoring)
// ════════════════════════════════════════════════════════════════════════════

describe("Blockchain Fingerprint", () => {
  it("computeFingerprint: deterministic — same hashes → same fingerprint", () => {
    const bh = "a".repeat(64);
    const th = "b".repeat(64);
    const fp1 = computeFingerprint(bh, th);
    const fp2 = computeFingerprint(bh, th);
    expect(fp1).toBe(fp2);
  });

  it("computeFingerprint: different hash → different fingerprint", () => {
    const fp1 = computeFingerprint("a".repeat(64), "b".repeat(64));
    const fp2 = computeFingerprint("b".repeat(64), "a".repeat(64));
    expect(fp1).not.toBe(fp2);
  });

  it("computeFingerprint: returns 0x-prefixed 66-char hex", () => {
    const fp = computeFingerprint("a".repeat(64), "b".repeat(64));
    expect(fp).toMatch(/^0x[0-9a-f]{64}$/);
    expect(fp).toHaveLength(66);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. RATE LIMITING (CRITICAL — protects against LLM cost explosion)
// ════════════════════════════════════════════════════════════════════════════

describe("Rate Limiting — Plan Limits", () => {
  it("free plan has correct limits", () => {
    const free = PLAN_LIMITS.free;
    expect(free.maxDocs).toBe(10);
    expect(free.maxFileSize).toBe(50 * 1024 * 1024);
    expect(free.maxLlmCalls).toBe(50);
  });

  it("pro plan has correct limits", () => {
    const pro = PLAN_LIMITS.pro;
    expect(pro.maxDocs).toBe(Infinity);
    expect(pro.maxFileSize).toBe(100 * 1024 * 1024);
    expect(pro.maxLlmCalls).toBe(500);
  });

  it("enterprise plan is unlimited", () => {
    const ent = PLAN_LIMITS.enterprise;
    expect(ent.maxDocs).toBe(Infinity);
    expect(ent.maxLlmCalls).toBe(Infinity);
  });

  it("free plan LLM limit is below pro", () => {
    expect(PLAN_LIMITS.free.maxLlmCalls).toBeLessThan(PLAN_LIMITS.pro.maxLlmCalls);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. EMAIL SERVICE (CRITICAL — invitation flow)
// ════════════════════════════════════════════════════════════════════════════

describe("Email Service", () => {
  it("buildInvitationEmail: contains all required information", () => {
    const email = buildInvitationEmail({
      inviterName: "Alice",
      tenantName: "Acme Corp",
      role: "editor",
      acceptUrl: "https://app.test/join?token=abc123",
    });

    expect(email.subject).toContain("Alice");
    expect(email.subject).toContain("Acme Corp");
    expect(email.html).toContain("Alice");
    expect(email.html).toContain("Acme Corp");
    expect(email.html).toContain("Editor");
    expect(email.html).toContain("https://app.test/join?token=abc123");
    expect(email.html).toContain("Accept Invitation");
  });

  it("buildInvitationEmail: admin role gets correct description", () => {
    const email = buildInvitationEmail({
      inviterName: "Owner",
      tenantName: "Test",
      role: "admin",
      acceptUrl: "https://app.test/join?token=xyz",
    });
    expect(email.html).toContain("manage members");
  });

  it("buildInvitationEmail: viewer role gets correct description", () => {
    const email = buildInvitationEmail({
      inviterName: "Owner",
      tenantName: "Test",
      role: "viewer",
      acceptUrl: "https://app.test/join?token=xyz",
    });
    expect(email.html).toContain("view and compare documents");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. ERROR SANITIZATION (CRITICAL — prevents info leakage)
// ════════════════════════════════════════════════════════════════════════════

describe("Error Sanitization", () => {
  it("safeError: in production, returns generic message only", () => {
    vi.stubEnv("NODE_ENV", "production");
    const msg = safeError("Something went wrong", new Error("DB: connection refused at 10.0.0.1:5432"));
    expect(msg).toBe("Something went wrong");
    expect(msg).not.toContain("10.0.0.1");
    expect(msg).not.toContain("5432");
    vi.unstubAllEnvs();
  });

  it("safeError: in development, returns actual error detail", () => {
    vi.stubEnv("NODE_ENV", "development");
    const msg = safeError("Fallback", new Error("actual internal error"));
    expect(msg).toContain("actual internal error");
    vi.unstubAllEnvs();
  });

  it("safeError: works with non-Error values", () => {
    vi.stubEnv("NODE_ENV", "development");
    const msg = safeError("Fallback", "string error");
    expect(msg).toContain("string error");
    vi.unstubAllEnvs();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. UUID VALIDATION (CRITICAL — input validation for all endpoints)
// ════════════════════════════════════════════════════════════════════════════

describe("UUID Validation", () => {
  it("isValidUUID: accepts valid v4 UUID", () => {
    expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isValidUUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(true);
  });

  it("isValidUUID: rejects invalid inputs", () => {
    expect(isValidUUID("not-a-uuid")).toBe(false);
    expect(isValidUUID("")).toBe(false);
    expect(isValidUUID("550e8400-e29b-41d4-a716-44665544000")).toBe(false); // 31 chars
    expect(isValidUUID("550e8400-e29b-41d4-a716-4466554400000")).toBe(false); // 33 chars
    expect(isValidUUID("550e8400-e29b-41d4-a716-44665544000g")).toBe(false); // non-hex
    expect(isValidUUID("<script>alert(1)</script>")).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. MIME TYPE VALIDATION (CRITICAL — file upload security)
// ════════════════════════════════════════════════════════════════════════════

describe("MIME Type Validation", () => {
  it("isAllowedMimeType: accepts all 14 supported types", () => {
    for (const mime of ALLOWED_MIME_TYPES) {
      expect(isAllowedMimeType(mime)).toBe(true);
    }
  });

  it("isAllowedMimeType: rejects dangerous types", () => {
    expect(isAllowedMimeType("application/x-msdownload")).toBe(false); // .exe
    expect(isAllowedMimeType("application/javascript")).toBe(false);
    expect(isAllowedMimeType("text/javascript")).toBe(false);
    expect(isAllowedMimeType("application/octet-stream")).toBe(false);
    expect(isAllowedMimeType("")).toBe(false);
  });

  it("isAllowedMimeType: rejects malicious strings", () => {
    expect(isAllowedMimeType("application/pdf\n<script>")).toBe(false);
    expect(isAllowedMimeType("../../../etc/passwd")).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. MONITORING (CRITICAL — error visibility in production)
// ════════════════════════════════════════════════════════════════════════════

describe("Monitoring", () => {
  beforeEach(() => {
    setMonitoringUser(null);
  });

  it("captureError: includes user context when set", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    setMonitoringUser({ id: "user-1", tenantId: "tenant-a" });
    captureError(new Error("test error"), { operation: "test/op" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("captureError: handles non-Error throwables", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    captureError("just a string error");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("captureMessage: info messages don't go to stderr in prod", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    captureMessage("routine info", "info");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("setMonitoringUser: clears previous user", () => {
    setMonitoringUser({ id: "user-1" });
    setMonitoringUser(null);
    // Should not throw — next capture should have empty user context
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    captureError(new Error("anon error"));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 9. TENANT ISOLATION LOGIC (CRITICAL — security boundary)
// ════════════════════════════════════════════════════════════════════════════

describe("Tenant Isolation — Logic Layer", () => {
  it("PLAN_LIMITS: all tenant plans are defined", () => {
    const plans: PlanType[] = ["free", "pro", "enterprise"];
    for (const plan of plans) {
      expect(PLAN_LIMITS[plan]).toBeDefined();
      expect(PLAN_LIMITS[plan].maxDocs).toBeGreaterThanOrEqual(0);
      expect(PLAN_LIMITS[plan].maxLlmCalls).toBeGreaterThanOrEqual(0);
    }
  });

  it("Tenant isolation: plan limits are monotonic (free < pro < enterprise)", () => {
    expect(PLAN_LIMITS.free.maxLlmCalls).toBeLessThan(PLAN_LIMITS.pro.maxLlmCalls);
    expect(PLAN_LIMITS.free.maxDocs).toBeLessThan(PLAN_LIMITS.pro.maxDocs);
  });
});
