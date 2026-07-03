import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTenantRole } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/client";
import type {
  PublicShareResponse,
  ErrorResponse,
  SharedLink,
  Document,
  RevokeShareResponse,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates that the token is a 32-character hex string. */
function isValidToken(token: string): boolean {
  return /^[0-9a-f]{32}$/i.test(token);
}

/**
 * Fetches a share row by token from the DB (uses service client for public access).
 * Returns null if not found.
 */
async function getShareByToken(
  token: string,
): Promise<SharedLink | null> {
  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("shared_links")
    .select("*")
    .eq("token", token)
    .single();

  if (error || !data) return null;
  return data as unknown as SharedLink;
}

/**
 * Fetches a share row by UUID id from the DB.
 * Returns null if not found.
 */
async function getShareById(
  id: string,
): Promise<SharedLink | null> {
  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("shared_links")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as unknown as SharedLink;
}

/**
 * Fetches full document records for the given IDs.
 */
async function getDocumentsByIds(
  documentIds: string[],
): Promise<Document[]> {
  if (documentIds.length === 0) return [];
  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("documents")
    .select("*")
    .in("id", documentIds);

  if (error || !data) return [];
  return data as unknown as Document[];
}

// ---------------------------------------------------------------------------
// GET /api/share/[token] -- PUBLIC (no auth) — get share details + documents
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse<PublicShareResponse | ErrorResponse>> {
  const { token } = await params;

  // Validate token format
  if (!isValidToken(token)) {
    return NextResponse.json(
      { error: "Invalid share token format", code: "INVALID_TOKEN" },
      { status: 400 },
    );
  }

  // Look up the share
  const share = await getShareByToken(token);
  if (!share) {
    return NextResponse.json(
      { error: "Share link not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // Check if active
  if (!share.is_active) {
    return NextResponse.json(
      { error: "This share link has been revoked", code: "GONE" },
      { status: 410 },
    );
  }

  // Check if expired
  if (share.expires_at) {
    const expiresAt = new Date(share.expires_at);
    if (expiresAt <= new Date()) {
      return NextResponse.json(
        { error: "This share link has expired", code: "GONE" },
        { status: 410 },
      );
    }
  }

  // Fetch the shared documents
  const documents = await getDocumentsByIds(share.document_ids);

  return NextResponse.json({
    share,
    documents,
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/share/[token] -- Revoke a share link (auth required)
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse<RevokeShareResponse | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const { token } = await params;

  // Accept both UUID (share id) and hex token formats
  const isUuid = UUID_RE.test(token);
  const isToken = isValidToken(token);

  if (!isUuid && !isToken) {
    return NextResponse.json(
      { error: "Invalid share identifier format (must be a UUID or 32-char hex token)", code: "INVALID_TOKEN" },
      { status: 400 },
    );
  }

  // -- 2. Look up share (by id if UUID, by token otherwise) -----------------
  const share = isUuid ? await getShareById(token) : await getShareByToken(token);
  if (!share) {
    return NextResponse.json(
      { error: "Share link not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 3. Role check: require editor+ (P14 tenant-level RBAC) ----------------
  // RLS on shared_links further enforces creator or admin/owner access.
  const roleCheck = await requireTenantRole(supabase, user.id, [
    "owner",
    "admin",
    "editor",
  ]);
  if (!roleCheck.ok) return roleCheck.response;

  // -- 4. Set is_active = false (by id to be unambiguous) -------------------
  const { error: updateError } = await supabase
    .from("shared_links")
    .update({ is_active: false })
    .eq("id", share.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to revoke share link", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ revoked: true });
}
