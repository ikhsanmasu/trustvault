import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { computeFingerprint, getPublicVerifier } from "@/lib/anchor";
import type {
  VerifyRequest,
  VerifyResponse,
  ErrorResponse,
  Document,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// POST /api/verify
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<VerifyResponse | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  // -- 2. Parse and validate request body -----------------------------------
  let body: VerifyRequest;
  try {
    body = (await request.json()) as VerifyRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  const { documentId } = body;

  if (!documentId || typeof documentId !== "string" || !UUID_RE.test(documentId)) {
    return NextResponse.json(
      { error: "documentId must be a valid UUID", code: "INVALID_DOCUMENT_ID" },
      { status: 400 },
    );
  }

  // -- 3. Fetch document (user-scoped, RLS-enforced) ------------------------
  const { data: row, error: fetchError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (fetchError || !row) {
    return NextResponse.json(
      { error: `Document not found: ${documentId}`, code: "NOT_FOUND" },
      { status: 404 },
    );
  }
  const doc = row as unknown as Document;

  // -- 4. Recompute fingerprint from current DB hashes ----------------------
  const recomputedFingerprint = computeFingerprint(
    doc.binary_hash,
    doc.text_hash,
  );

  // -- 5. Case 1: Never anchored --------------------------------------------
  if (!doc.fingerprint) {
    return NextResponse.json({
      documentId,
      intact: false,
      reason: "not_anchored",
      storedFingerprint: null,
      recomputedFingerprint,
      anchoredAt: null,
      txHash: null,
      chain: null,
    } satisfies VerifyResponse);
  }

  // -- 6. Case 2: Hash mismatch — document hashes changed after anchoring ---
  if (recomputedFingerprint !== doc.fingerprint) {
    return NextResponse.json({
      documentId,
      intact: false,
      reason: "hash_mismatch",
      storedFingerprint: doc.fingerprint,
      recomputedFingerprint,
      anchoredAt: null,
      txHash: doc.tx_hash ?? null,
      chain: doc.chain ?? null,
    } satisfies VerifyResponse);
  }

  // -- 7. Case 3: Fingerprints match — verify on-chain ----------------------
  let verifier: { verify: (fp: `0x${string}`) => Promise<{ found: boolean; anchoredAt: number | null }> };
  try {
    verifier = getPublicVerifier();
  } catch {
    return NextResponse.json({ error: "Anchor service not configured", code: "ANCHOR_RPC_ERROR" }, { status: 500 });
  }

  let verifyResult: { found: boolean; anchoredAt: number | null };
  try {
    verifyResult = await verifier.verify(recomputedFingerprint);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Anchor RPC unreachable";
    return NextResponse.json({ error: message, code: "ANCHOR_RPC_ERROR" }, { status: 500 });
  }

  // -- 7a. Sub-case: Found on-chain -----------------------------------------
  if (verifyResult.found) {
    return NextResponse.json({
      documentId,
      intact: true,
      reason: "ok",
      storedFingerprint: doc.fingerprint,
      recomputedFingerprint,
      anchoredAt: verifyResult.anchoredAt,
      txHash: doc.tx_hash ?? null,
      chain: doc.chain ?? null,
    } satisfies VerifyResponse);
  }

  // -- 7b. Sub-case: Not found on-chain -------------------------------------
  return NextResponse.json({
    documentId,
    intact: false,
    reason: "not_on_chain",
    storedFingerprint: doc.fingerprint,
    recomputedFingerprint,
    anchoredAt: null,
    txHash: doc.tx_hash ?? null,
    chain: doc.chain ?? null,
  } satisfies VerifyResponse);
}
