import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTenantRole } from "@/lib/supabase/auth";
import { computeFingerprint, getAnchorService } from "@/lib/anchor";
import { safeError } from "@/lib/utils";
import { parseDocument } from "@/lib/db-schemas";
import type {
  AnchorRequest,
  AnchorResponse,
  ErrorResponse,
} from "@/lib/types";
import { isValidUUID } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// POST /api/anchor
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<AnchorResponse | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. Parse and validate request body -----------------------------------
  let body: AnchorRequest;
  try {
    body = (await request.json()) as AnchorRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  const { documentId } = body;

  if (!documentId || typeof documentId !== "string" || !isValidUUID(documentId)) {
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
  const doc = parseDocument(row);

  // -- 4. Check not soft-deleted --------------------------------------------
  if (doc.deleted_at) {
    return NextResponse.json(
      {
        error: "Soft-deleted documents cannot be anchored",
        code: "DOCUMENT_DELETED",
      },
      { status: 410 },
    );
  }

  // -- 5. Check not already anchored ----------------------------------------
  if (doc.fingerprint) {
    return NextResponse.json(
      {
        error: "Document has already been anchored",
        code: "ALREADY_ANCHORED",
      },
      { status: 409 },
    );
  }

  // -- 6. Role check: require editor+ (P14 tenant-level RBAC) ----------------
  const roleCheck = await requireTenantRole(supabase, user.id, [
    "owner",
    "admin",
    "editor",
  ]);
  if (!roleCheck.ok) return roleCheck.response;

  // Verify user belongs to same tenant as the document
  if (roleCheck.tenantId !== doc.tenant_id) {
    return NextResponse.json(
      { error: "Access denied", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  // -- 7. Compute fingerprint -----------------------------------------------
  const fingerprint = computeFingerprint(doc.binary_hash, doc.text_hash);

  // -- 8. Get anchor service and anchor -------------------------------------
  let serviceResult: { txHash: `0x${string}`; anchoredAt: number };
  let chainName: string;
  try {
    const { service, chainName: name } = getAnchorService();
    chainName = name;
    serviceResult = await service.anchor(fingerprint);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: safeError("Anchor transaction failed", err), code: "ANCHOR_ERROR" },
      { status: 500 },
    );
  }

  // -- 9. Update the document with anchoring metadata -----------------------
  const anchoredAtIso = new Date(serviceResult.anchoredAt * 1000).toISOString();
  const { error: updateError } = await supabase
    .from("documents")
    .update({
      fingerprint,
      chain: chainName,
      tx_hash: serviceResult.txHash,
      anchored_at: anchoredAtIso,
    })
    .eq("id", documentId);

  if (updateError) {
    return NextResponse.json(
      {
        error: safeError("Failed to update document record"),
        code: "DB_ERROR",
      },
      { status: 500 },
    );
  }

  // -- 10. Return 201 -------------------------------------------------------
  return NextResponse.json(
    {
      documentId,
      fingerprint,
      chain: chainName,
      txHash: serviceResult.txHash,
      anchoredAt: serviceResult.anchoredAt,
      verified: true,
    } satisfies AnchorResponse,
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// POST /api/anchor/batch — Anchor all eligible documents
// ---------------------------------------------------------------------------

export async function PATCH(
  _request: NextRequest,
): Promise<NextResponse<{ anchored: number; skipped: number; failed: number; errors: string[] } | ErrorResponse>> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- P14: Verify tenant-level RBAC (editor+) ------------------------------
  const roleCheck = await requireTenantRole(supabase, user.id, [
    "owner",
    "admin",
    "editor",
  ]);
  if (!roleCheck.ok) return roleCheck.response;
  const { tenantId } = roleCheck;

  // Fetch all active (non-deleted) documents in the user's tenant
  const { data: docs } = await supabase
    .from("documents")
    .select("id, name, binary_hash, text_hash, fingerprint, deleted_at")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .is("fingerprint", null); // Only un-anchored

  if (!docs?.length) {
    return NextResponse.json({ anchored: 0, skipped: 0, failed: 0, errors: [] });
  }

  let anchoredCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  try {
    const { service, chainName } = getAnchorService();

    for (const doc of docs) {
      try {
        const fingerprint = computeFingerprint(doc.binary_hash, doc.text_hash);
        const { txHash, anchoredAt } = await service.anchor(fingerprint);
        const dt = new Date(anchoredAt * 1000).toISOString();
        await supabase.from("documents").update({
          fingerprint, chain: chainName, tx_hash: txHash, anchored_at: dt,
        }).eq("id", doc.id);
        anchoredCount++;
      } catch (err: unknown) {
        failedCount++;
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`${doc.name}: ${msg}`);
      }
    }
  } catch {
    return NextResponse.json({ error: "Anchor service unavailable", code: "ANCHOR_RPC_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ anchored: anchoredCount, skipped: 0, failed: failedCount, errors });
}
