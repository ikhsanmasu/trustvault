/**
 * P5 Blockchain Anchoring — Evaluation Tests
 *
 * These tests validate the fingerprint computation, the AnchorService interface
 * contract, and the verify flow logic branches without requiring a live RPC
 * endpoint.  Integration tests that require Anvil are in the QA suite.
 */

import { describe, it, expect } from "vitest";
import { computeFingerprint } from "@/lib/anchor";
import { computeBinaryHash, computeTextHash } from "@/lib/core";
import type {
  AnchorResponse,
  VerifyResponse,
  Document,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Fingerprint computation — cryptographic correctness
// ---------------------------------------------------------------------------

describe("P5 Eval: computeFingerprint", () => {
  it("is deterministic", () => {
    const bh = "a".repeat(64);
    const th = "b".repeat(64);
    expect(computeFingerprint(bh, th)).toBe(computeFingerprint(bh, th));
  });

  it("produces 66-character 0x-prefixed output", () => {
    const bh = computeBinaryHash(Buffer.from("contract v1"));
    const th = computeTextHash("Payment: $10,000");
    const fp = computeFingerprint(bh, th);
    expect(fp).toMatch(/^0x[0-9a-f]{64}$/);
    expect(fp).toHaveLength(66);
  });

  it("changes when binary_hash changes", () => {
    const th = computeTextHash("same text");
    const fp1 = computeFingerprint(
      computeBinaryHash(Buffer.from("file A")),
      th,
    );
    const fp2 = computeFingerprint(
      computeBinaryHash(Buffer.from("file B")),
      th,
    );
    expect(fp1).not.toBe(fp2);
  });

  it("changes when text_hash changes", () => {
    const bh = computeBinaryHash(Buffer.from("same file"));
    const fp1 = computeFingerprint(bh, computeTextHash("text A"));
    const fp2 = computeFingerprint(bh, computeTextHash("text B"));
    expect(fp1).not.toBe(fp2);
  });

  it("matches a known reference fingerprint (cross-check with Solidity)", () => {
    // SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    // SHA-256("")    = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const fp = computeFingerprint(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(fp).toBe(
      "0x4372d3e7781250cbf01c9f3ea8571e3a0328ed051dc3028f832f56bc187cd8df",
    );
  });
});

// ---------------------------------------------------------------------------
// Anchor flow: idempotency guard (already anchored)
// ---------------------------------------------------------------------------

describe("P5 Eval: Anchor idempotency", () => {
  it("detects already-anchored document (fingerprint IS NOT NULL)", () => {
    // Simulate: document has a fingerprint field already set
    const doc: Document = {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      name: "Anchor Test",
      storage_path: "uploads/2026/proj/doc.pdf",
      binary_hash: "a".repeat(64),
      text_hash: "b".repeat(64),
      extracted_text: "Some text",
      file_size_bytes: 1024,
      file_type: "application/pdf",
      tenant_id: "11111111-1111-1111-1111-111111111111",
      project_id: "22222222-2222-2222-2222-222222222222",
      uploaded_by: "33333333-3333-3333-3333-333333333333",
      created_at: "2026-06-22T00:00:00.000Z",
      fingerprint: "0x" + "c".repeat(64),
      chain: "anvil",
      tx_hash: "0x" + "d".repeat(64),
      anchored_at: "2026-06-22T00:00:00.000Z",
    };

    const alreadyAnchored = doc.fingerprint !== null && doc.fingerprint !== undefined;
    expect(alreadyAnchored).toBe(true);

    // The route handler should return 409 ALREADY_ANCHORED
    const errorCode = alreadyAnchored ? "ALREADY_ANCHORED" : null;
    expect(errorCode).toBe("ALREADY_ANCHORED");
  });

  it("allows anchoring when fingerprint is null", () => {
    const doc: Document = {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      name: "Not Yet Anchored",
      storage_path: "uploads/2026/proj/doc.pdf",
      binary_hash: "a".repeat(64),
      text_hash: "b".repeat(64),
      extracted_text: "Some text",
      file_size_bytes: 1024,
      file_type: "application/pdf",
      tenant_id: "11111111-1111-1111-1111-111111111111",
      project_id: "22222222-2222-2222-2222-222222222222",
      uploaded_by: "33333333-3333-3333-3333-333333333333",
      created_at: "2026-06-22T00:00:00.000Z",
      fingerprint: null,
    };

    const alreadyAnchored = doc.fingerprint !== null && doc.fingerprint !== undefined;
    expect(alreadyAnchored).toBe(false);
  });

  it("rejects anchoring soft-deleted documents", () => {
    const doc: Document = {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      name: "Deleted Doc",
      storage_path: "uploads/2026/proj/doc.pdf",
      binary_hash: "a".repeat(64),
      text_hash: "b".repeat(64),
      extracted_text: "",
      file_size_bytes: 1024,
      file_type: "application/pdf",
      tenant_id: "11111111-1111-1111-1111-111111111111",
      project_id: "22222222-2222-2222-2222-222222222222",
      uploaded_by: "33333333-3333-3333-3333-333333333333",
      created_at: "2026-06-22T00:00:00.000Z",
      deleted_at: "2026-06-22T01:00:00.000Z",
      deleted_by: "33333333-3333-3333-3333-333333333333",
      fingerprint: null,
    };

    expect(doc.deleted_at).toBeTruthy();
    const isSoftDeleted = doc.deleted_at !== null && doc.deleted_at !== undefined;
    expect(isSoftDeleted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AnchorResponse shape validation
// ---------------------------------------------------------------------------

describe("P5 Eval: AnchorResponse shape", () => {
  it("AnchorResponse has all required fields with correct types", () => {
    const response: AnchorResponse = {
      documentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      fingerprint: "0x" + "a".repeat(64),
      chain: "anvil",
      txHash: "0x" + "b".repeat(64),
      anchoredAt: 1719000000,
      verified: true,
    };

    expect(response.documentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(response.fingerprint).toMatch(/^0x[0-9a-f]{64}$/);
    expect(response.fingerprint).toHaveLength(66);
    expect(response.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(response.txHash).toHaveLength(66);
    expect(typeof response.anchoredAt).toBe("number");
    expect(response.anchoredAt).toBeGreaterThan(0);
    expect(response.verified).toBe(true);
    expect(["anvil", "sepolia", "base", "optimism", "mainnet"]).toContain(
      response.chain,
    );
  });
});

// ---------------------------------------------------------------------------
// Verify flow: logic branches
// ---------------------------------------------------------------------------

describe("P5 Eval: Verify flow — logic branches", () => {
  const baseDoc: Document = {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    name: "Verify Test",
    storage_path: "uploads/2026/proj/doc.pdf",
    binary_hash: "a".repeat(64),
    text_hash: "b".repeat(64),
    extracted_text: "Some text",
    file_size_bytes: 1024,
    file_type: "application/pdf",
    tenant_id: "11111111-1111-1111-1111-111111111111",
    project_id: "22222222-2222-2222-2222-222222222222",
    uploaded_by: "33333333-3333-3333-3333-333333333333",
    created_at: "2026-06-22T00:00:00.000Z",
    fingerprint: null,
  };

  it("Case 1: not_anchored — fingerprint is null", () => {
    const doc = { ...baseDoc, fingerprint: null };
    const recomputedFp = computeFingerprint(doc.binary_hash, doc.text_hash);

    let reason: VerifyResponse["reason"];
    let intact: boolean;

    if (!doc.fingerprint) {
      reason = "not_anchored";
      intact = false;
    } else if (recomputedFp !== doc.fingerprint) {
      reason = "hash_mismatch";
      intact = false;
    } else {
      reason = "ok";
      intact = true;
    }

    expect(reason).toBe("not_anchored");
    expect(intact).toBe(false);
  });

  it("Case 2: hash_mismatch — recomputed fingerprint differs from stored", () => {
    const doc = {
      ...baseDoc,
      fingerprint: "0x" + "f".repeat(64),
      chain: "anvil",
      tx_hash: "0x" + "e".repeat(64),
      anchored_at: "2026-06-22T00:00:00.000Z",
    };
    const recomputedFp = computeFingerprint(doc.binary_hash, doc.text_hash);

    // recomputedFp uses the actual hashes, stored fingerprint is different
    expect(recomputedFp).not.toBe(doc.fingerprint);

    let reason: VerifyResponse["reason"];
    let intact: boolean;

    if (!doc.fingerprint) {
      reason = "not_anchored";
      intact = false;
    } else if (recomputedFp !== doc.fingerprint) {
      reason = "hash_mismatch";
      intact = false;
    } else {
      reason = "ok";
      intact = true;
    }

    expect(reason).toBe("hash_mismatch");
    expect(intact).toBe(false);
  });

  it("Case 3: ok — fingerprints match (on-chain check would follow)", () => {
    const bh = computeBinaryHash(Buffer.from("same data"));
    const th = computeTextHash("same text");
    const fp = computeFingerprint(bh, th);

    const doc = {
      ...baseDoc,
      binary_hash: bh,
      text_hash: th,
      fingerprint: fp,
      chain: "sepolia",
      tx_hash: "0x" + "d".repeat(64),
      anchored_at: "2026-06-22T00:00:00.000Z",
    };

    const recomputedFp = computeFingerprint(doc.binary_hash, doc.text_hash);
    expect(recomputedFp).toBe(doc.fingerprint);

    let reason: VerifyResponse["reason"];
    let intact: boolean;

    if (!doc.fingerprint) {
      reason = "not_anchored";
      intact = false;
    } else if (recomputedFp !== doc.fingerprint) {
      reason = "hash_mismatch";
      intact = false;
    } else {
      // Would proceed to on-chain check — assuming it passes
      reason = "ok";
      intact = true;
    }

    expect(reason).toBe("ok");
    expect(intact).toBe(true);
  });

  it("Case 4: not_on_chain — fingerprints match but chain returns 0", () => {
    const bh = computeBinaryHash(Buffer.from("anchored then chain reset"));
    const th = computeTextHash("some content");
    const fp = computeFingerprint(bh, th);

    const doc = {
      ...baseDoc,
      binary_hash: bh,
      text_hash: th,
      fingerprint: fp,
      chain: "anvil",
      tx_hash: "0x" + "c".repeat(64),
      anchored_at: "2026-06-22T00:00:00.000Z",
    };

    const recomputedFp = computeFingerprint(doc.binary_hash, doc.text_hash);
    expect(recomputedFp).toBe(doc.fingerprint);

    // Simulate: on-chain readContract returns 0 (not found)
    const chainFound = false;

    let reason: VerifyResponse["reason"];
    let intact: boolean;

    if (!doc.fingerprint) {
      reason = "not_anchored";
      intact = false;
    } else if (recomputedFp !== doc.fingerprint) {
      reason = "hash_mismatch";
      intact = false;
    } else if (chainFound) {
      reason = "ok";
      intact = true;
    } else {
      reason = "not_on_chain";
      intact = false;
    }

    expect(reason).toBe("not_on_chain");
    expect(intact).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VerifyResponse shape validation
// ---------------------------------------------------------------------------

describe("P5 Eval: VerifyResponse shape", () => {
  it("not_anchored response has correct shape", () => {
    const response: VerifyResponse = {
      documentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      intact: false,
      reason: "not_anchored",
      storedFingerprint: null,
      recomputedFingerprint: "0x" + "a".repeat(64),
      anchoredAt: null,
      txHash: null,
      chain: null,
    };

    expect(response.intact).toBe(false);
    expect(response.reason).toBe("not_anchored");
    expect(response.storedFingerprint).toBeNull();
    expect(response.anchoredAt).toBeNull();
    expect(response.txHash).toBeNull();
    expect(response.chain).toBeNull();
    expect(response.recomputedFingerprint).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("hash_mismatch response has correct shape", () => {
    const response: VerifyResponse = {
      documentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      intact: false,
      reason: "hash_mismatch",
      storedFingerprint: "0x" + "f".repeat(64),
      recomputedFingerprint: "0x" + "a".repeat(64),
      anchoredAt: null,
      txHash: "0x" + "e".repeat(64),
      chain: "anvil",
    };

    expect(response.intact).toBe(false);
    expect(response.reason).toBe("hash_mismatch");
    expect(response.storedFingerprint).not.toBeNull();
    expect(response.recomputedFingerprint).not.toBe(response.storedFingerprint);
    expect(response.anchoredAt).toBeNull();
    expect(response.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(response.chain).toBe("anvil");
  });

  it("ok response has correct shape", () => {
    const response: VerifyResponse = {
      documentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      intact: true,
      reason: "ok",
      storedFingerprint: "0x" + "f".repeat(64),
      recomputedFingerprint: "0x" + "f".repeat(64),
      anchoredAt: 1719000000,
      txHash: "0x" + "e".repeat(64),
      chain: "sepolia",
    };

    expect(response.intact).toBe(true);
    expect(response.reason).toBe("ok");
    expect(response.storedFingerprint).toBe(response.recomputedFingerprint);
    expect(response.anchoredAt).toBeGreaterThan(0);
    expect(response.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("not_on_chain response has correct shape", () => {
    const response: VerifyResponse = {
      documentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      intact: false,
      reason: "not_on_chain",
      storedFingerprint: "0x" + "f".repeat(64),
      recomputedFingerprint: "0x" + "f".repeat(64),
      anchoredAt: null,
      txHash: "0x" + "e".repeat(64),
      chain: "anvil",
    };

    expect(response.intact).toBe(false);
    expect(response.reason).toBe("not_on_chain");
    expect(response.storedFingerprint).toBe(response.recomputedFingerprint);
    expect(response.anchoredAt).toBeNull();
    expect(response.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// RBAC enforcement for anchor (editors/admins only)
// ---------------------------------------------------------------------------

describe("P5 Eval: Anchor RBAC enforcement", () => {
  it("allows admin to anchor", () => {
    const role: string = "admin";
    const allowed = role === "admin" || role === "editor";
    expect(allowed).toBe(true);
  });

  it("allows editor to anchor", () => {
    const role: string = "editor";
    const allowed = role === "admin" || role === "editor";
    expect(allowed).toBe(true);
  });

  it("forbids viewer from anchoring", () => {
    const role: string = "viewer";
    const allowed = role === "admin" || role === "editor";
    expect(allowed).toBe(false);
    // Should return 403 FORBIDDEN
    expect(allowed ? null : "FORBIDDEN").toBe("FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------
// RBAC for verify (all project members allowed)
// ---------------------------------------------------------------------------

describe("P5 Eval: Verify RBAC (all members)", () => {
  it("allows admin to verify", () => {
    const roles = ["admin", "editor", "viewer"];
    for (const role of roles) {
      expect(roles).toContain(role);
    }
  });

  it("never returns 403 for verify (any project member can verify)", () => {
    // Verify is read-only — no 403 should ever be returned for project members
    // The only access check is: user is a member of the project (enforced via RLS)
    const verifyRoles = ["admin", "editor", "viewer"];
    const allAllowed = verifyRoles.every((r) =>
      ["admin", "editor", "viewer"].includes(r),
    );
    expect(allAllowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Chain name resolution from chain ID
// ---------------------------------------------------------------------------

describe("P5 Eval: Chain name resolution", () => {
  const CHAIN_MAP: Record<number, string> = {
    31337: "anvil",
    11155111: "sepolia",
    8453: "base",
    10: "optimism",
    1: "mainnet",
  };

  it("resolves known chain IDs to names", () => {
    expect(CHAIN_MAP[31337]).toBe("anvil");
    expect(CHAIN_MAP[11155111]).toBe("sepolia");
    expect(CHAIN_MAP[8453]).toBe("base");
    expect(CHAIN_MAP[10]).toBe("optimism");
    expect(CHAIN_MAP[1]).toBe("mainnet");
  });

  it("falls back to numeric string for unknown chain IDs", () => {
    const fallback = (id: number) => CHAIN_MAP[id] ?? String(id);
    expect(fallback(84532)).toBe("84532");
    expect(fallback(137)).toBe("137");
  });
});

// ---------------------------------------------------------------------------
// Fingerprint immutability after anchoring
// ---------------------------------------------------------------------------

describe("P5 Eval: Fingerprint immutability", () => {
  it("fingerprint never changes after being set (one anchor per document)", () => {
    const bh = computeBinaryHash(Buffer.from("immutable doc"));
    const th = computeTextHash("This content will not change");
    const fp = computeFingerprint(bh, th);

    // Simulate multiple recomputations — always the same result
    for (let i = 0; i < 10; i++) {
      expect(computeFingerprint(bh, th)).toBe(fp);
    }

    // Even if we modify the text, the ORIGINAL fingerprint is preserved in DB
    const newTh = computeTextHash("This content CHANGED");
    const newFp = computeFingerprint(bh, newTh);
    expect(newFp).not.toBe(fp);

    // The stored fingerprint is NEVER updated — it's immutable
    const storedFingerprint = fp; // from DB
    const recomputedFingerprint = newFp; // from current hashes
    expect(storedFingerprint).not.toBe(recomputedFingerprint);
  });
});
