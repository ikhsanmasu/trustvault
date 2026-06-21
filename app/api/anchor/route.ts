import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireProjectRole } from "@/lib/supabase/auth";
import { computeFingerprint, getAnchorService } from "@/lib/anchor";
import type {
  AnchorRequest,
  AnchorResponse,
  ErrorResponse,
  Document,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // -- 6. Role check: must be admin or editor of the document's project -----
  const roleCheck = await requireProjectRole(
    supabase,
    user.id,
    doc.project_id,
    ["admin", "editor"],
  );
  if (!roleCheck.ok) return roleCheck.response;

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
    const message =
      err instanceof Error ? err.message : "Anchor transaction failed";
    return NextResponse.json(
      { error: message, code: "ANCHOR_ERROR" },
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
        error: `Failed to update document with anchoring metadata: ${updateError.message}`,
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
