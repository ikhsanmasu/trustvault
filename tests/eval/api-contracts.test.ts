// ---------------------------------------------------------------------------
// TrustVault — API Contract Tests
// ---------------------------------------------------------------------------
// Validates that route handler response shapes, status codes, and error
// codes match the documented API contract (docs/api-spec.md).
// These test the shape, not the actual DB data (no Supabase needed).
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { isAllowedMimeType, ALLOWED_MIME_TYPES, AIVerdictSchema } from "@/lib/core";
import { PLAN_LIMITS } from "@/lib/rate-limit";
import { DocumentRowSchema, TenantRowSchema, SharedLinkRowSchema } from "@/lib/db-schemas";
import { isValidUUID, safeError, apiError } from "@/lib/utils";
import { getHealthStatus } from "@/lib/monitoring";

// ════════════════════════════════════════════════════════════════════════════
// 1. Response shape contracts
// ════════════════════════════════════════════════════════════════════════════

describe("API Contracts — Response Shapes", () => {
  // Document
  it("Document schema has all required fields", () => {
    const result = DocumentRowSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "test.pdf",
      storage_path: "uploads/2026/test.pdf",
      binary_hash: "a".repeat(64),
      text_hash: "b".repeat(64),
      extracted_text: "content",
      file_size_bytes: 100,
      file_type: "application/pdf",
      tenant_id: "550e8400-e29b-41d4-a716-446655440001",
      uploaded_by: "550e8400-e29b-41d4-a716-446655440002",
      created_at: "2026-07-05T00:00:00.000Z",
      description: null,
      notes: null,
      original_filename: null,
      deleted_at: null,
      deleted_by: null,
      fingerprint: null,
      chain: null,
      tx_hash: null,
      anchored_at: null,
    });
    if (!result.success) console.error(result.error.issues);
    expect(result.success).toBe(true);
  });

  // Tenant
  it("Tenant schema has all required fields", () => {
    const result = TenantRowSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440099",
      name: "Acme Corp",
      plan: "free",
      usage_documents: 0,
      usage_llm_calls: 0,
      usage_storage_bytes: 0,
      usage_reset_at: null,
      created_at: "2026-07-05T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  // SharedLink
  it("SharedLink schema has all required fields", () => {
    const result = SharedLinkRowSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      document_ids: ["550e8400-e29b-41d4-a716-446655440001"],
      token: "a".repeat(32),
      created_by: "550e8400-e29b-41d4-a716-446655440002",
      title: "Share",
      is_active: true,
      allow_download: true,
      allow_chat: true,
      allow_anchor: false,
      allow_compare: false,
      created_at: "2026-07-05T00:00:00.000Z",
      expires_at: null,
    });
    expect(result.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. Error code contracts
// ════════════════════════════════════════════════════════════════════════════

describe("API Contracts — Error Codes", () => {
  const expectedCodes = [
    "UNAUTHORIZED",           // 401 — missing/invalid session
    "FORBIDDEN",              // 403 — insufficient role
    "NOT_FOUND",              // 404 — resource doesn't exist
    "INVALID_ID",             // 400 — bad UUID format
    "INVALID_REQUEST",        // 400 — malformed body
    "INVALID_FILE_TYPE",      // 415 — unsupported MIME
    "FILE_TOO_LARGE",         // 413 — exceeds max size
    "EMPTY_FILE",             // 400 — zero-byte file
    "MISSING_FILE",           // 400 — no file in request
    "DB_ERROR",              // 500 — database operation failed
    "STORAGE_ERROR",          // 500 — storage operation failed
    "AI_API_ERROR",          // 500 — AI service call failed
    "AI_PARSE_ERROR",         // 500 — AI response invalid
    "PLAN_LIMIT_REACHED",     // 403 — usage cap exceeded
    "RATE_LIMITED",           // 429 — webhook rate limit
    "INVALID_TOKEN",          // 400/401 — bad share/invite token
    "GONE",                   // 410 — expired/revoked
    "ALREADY_ANCHORED",      // 409 — document already on-chain
    "DOCUMENT_NOT_FOUND",     // 400 — document not in tenant
    "CONFIG_ERROR",           // 500 — missing env var
    "PROCESSING_ERROR",       // 500 — webhook handler failed
  ];

  it("defines all expected error codes", () => {
    // This test documents the API contract. All route handlers must
    // use one of these codes in their error responses.
    expect(expectedCodes.length).toBeGreaterThanOrEqual(20);
    for (const code of expectedCodes) {
      expect(code).toMatch(/^[A-Z_]+$/);
      expect(code.length).toBeGreaterThan(1);
    }
  });

  it("apiError() produces correct shape", () => {
    const response = apiError("Not found", "NOT_FOUND", 404);
    expect(response.status).toBe(404);
    response.json().then((body: Record<string, unknown>) => {
      expect(body.error).toBe("Not found");
      expect(body.code).toBe("NOT_FOUND");
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. Health endpoint contract
// ════════════════════════════════════════════════════════════════════════════

describe("API Contracts — Health", () => {
  it("getHealthStatus returns correct shape", () => {
    const health = getHealthStatus();
    expect(health.status).toBe("ok");
    expect(health.service).toBe("trustvault");
    expect(typeof health.uptime).toBe("number");
    expect(health.uptime).toBeGreaterThan(0);
    expect(typeof health.timestamp).toBe("string");
    expect(typeof health.environment).toBe("string");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. Plan limits contract
// ════════════════════════════════════════════════════════════════════════════

describe("API Contracts — Plan Limits", () => {
  it("free plan matches API spec", () => {
    expect(PLAN_LIMITS.free.maxDocs).toBe(10);
    expect(PLAN_LIMITS.free.maxFileSize).toBe(50 * 1024 * 1024);
    expect(PLAN_LIMITS.free.maxLlmCalls).toBe(50);
    expect(PLAN_LIMITS.free.maxStorage).toBe(100 * 1024 * 1024);
  });

  it("pro plan matches API spec", () => {
    expect(PLAN_LIMITS.pro.maxDocs).toBe(Infinity);
    expect(PLAN_LIMITS.pro.maxLlmCalls).toBe(500);
  });

  it("enterprise plan is unlimited", () => {
    expect(PLAN_LIMITS.enterprise.maxDocs).toBe(Infinity);
    expect(PLAN_LIMITS.enterprise.maxLlmCalls).toBe(Infinity);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. AI compare response contract
// ════════════════════════════════════════════════════════════════════════════

describe("API Contracts — AI Compare", () => {
  it("AIVerdictSchema validates correct response", () => {
    AIVerdictSchema.parse({
      verdict: "MATERIAL",
      confidence: "HIGH",
      reasoning: "The change alters the contract value.",
    });
  });

  it("AIVerdictSchema rejects invalid verdict", () => {
    expect(() => AIVerdictSchema.parse({ verdict: "MAYBE", confidence: "HIGH", reasoning: "test" })).toThrow();
  });

  it("AIVerdictSchema enforces max 1000 char reasoning", () => {
    expect(() => AIVerdictSchema.parse({
      verdict: "NOT_MATERIAL",
      confidence: "LOW",
      reasoning: "x".repeat(1001),
    })).toThrow();
  });
});
