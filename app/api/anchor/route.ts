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

  // -- 6. Role check: admin/editor of document's project, or tenant member if no project (P11)
  if (doc.project_id) {
    const roleCheck = await requireProjectRole(
      supabase,
      user.id,
      doc.project_id,
      ["admin", "editor"],
    );
    if (!roleCheck.ok) return roleCheck.response;
  } else {
    // No project — verify tenant access
    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
    if (!profile || profile.tenant_id !== doc.tenant_id) {
      return NextResponse.json(
        { error: "Access denied", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
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

// ---------------------------------------------------------------------------
// POST /api/anchor/batch — Anchor all eligible documents
// ---------------------------------------------------------------------------

export async function PATCH(
  _request: NextRequest,
): Promise<NextResponse<{ anchored: number; skipped: number; failed: number; errors: string[] } | ErrorResponse>> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // Fetch all active (non-deleted) documents the user has editor/admin access to
  const { data: memberships } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("user_id", user.id)
    .in("role", ["admin", "editor"]);

  if (!memberships?.length) {
    return NextResponse.json({ anchored: 0, skipped: 0, failed: 0, errors: [] });
  }

  const projectIds = memberships.map((m: { project_id: string }) => m.project_id);
  const { data: docs } = await supabase
    .from("documents")
    .select("id, name, binary_hash, text_hash, fingerprint, deleted_at")
    .in("project_id", projectIds)
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
