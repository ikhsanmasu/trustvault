import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireAuth, requireTenantRole } from "@/lib/supabase/auth";
import type {
  CreateShareResponse,
  ListSharesResponse,
  ErrorResponse,
  SharedLink,
  CreateShareRequest,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generates a cryptographically random hex token (32 characters).
 */
function generateToken(): string {
  return randomBytes(16).toString("hex");
}

// ---------------------------------------------------------------------------
// POST /api/share -- Create a share link
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<CreateShareResponse | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. Parse body --------------------------------------------------------
  let body: CreateShareRequest;
  try {
    body = (await request.json()) as CreateShareRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  const { projectId, documentIds, allowDownload, allowChat, allowAnchor, allowCompare, title } = body;

  // Validate projectId (P11: optional, allow null)
  const resolvedProjectId: string | null =
    projectId && typeof projectId === "string" && UUID_RE.test(projectId)
      ? projectId
      : null;

  if (projectId && typeof projectId === "string" && !UUID_RE.test(projectId)) {
    return NextResponse.json(
      { error: "Invalid projectId format (must be a UUID)", code: "INVALID_PROJECT_ID" },
      { status: 400 },
    );
  }

  // Validate documentIds
  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return NextResponse.json(
      { error: "documentIds must be a non-empty array of UUIDs", code: "INVALID_DOCUMENT_IDS" },
      { status: 400 },
    );
  }

  for (const docId of documentIds) {
    if (typeof docId !== "string" || !UUID_RE.test(docId)) {
      return NextResponse.json(
        {
          error: `Invalid document ID: ${docId}. Must be a valid UUID.`,
          code: "INVALID_DOCUMENT_ID",
        },
        { status: 400 },
      );
    }
  }

  // Validate allowDownload / allowChat
  if (typeof allowDownload !== "boolean") {
    return NextResponse.json(
      { error: "allowDownload must be a boolean", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  if (typeof allowChat !== "boolean") {
    return NextResponse.json(
      { error: "allowChat must be a boolean", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  // -- 3. Role check: require editor+ (P14 tenant-level RBAC) ----------------
  const roleCheck = await requireTenantRole(supabase, user.id, [
    "owner",
    "admin",
    "editor",
  ]);
  if (!roleCheck.ok) return roleCheck.response;

  // -- 4. Verify all documentIds are accessible (P11: project-scoped or tenant-scoped)
  let docsQuery = supabase.from("documents").select("id").in("id", documentIds);
  if (resolvedProjectId) {
    docsQuery = docsQuery.eq("project_id", resolvedProjectId);
  }
  // When no projectId, RLS ensures tenant-scoped access

  const { data: docs, error: docsError } = await docsQuery;

  if (docsError || !docs) {
    return NextResponse.json(
      { error: "Failed to verify documents", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  const foundIds = new Set((docs as { id: string }[]).map((d) => d.id));
  const missing = documentIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Documents not found: ${missing.join(", ")}`,
        code: "DOCUMENT_NOT_FOUND",
      },
      { status: 400 },
    );
  }

  // -- 5. Generate token and insert -----------------------------------------
  const token = generateToken();
  const shareTitle = title?.trim() || "Shared Documents";

  const { data: share, error: insertError } = await supabase
    .from("shared_links")
    .insert({
      project_id: resolvedProjectId,
      document_ids: documentIds,
      token,
      created_by: user.id,
      allow_download: allowDownload ?? true,
      allow_chat: allowChat ?? true,
      allow_anchor: allowAnchor ?? false,
      allow_compare: allowCompare ?? false,
      title: shareTitle,
    })
    .select("*")
    .single();

  if (insertError || !share) {
    console.error("[share] Insert error:", insertError);
    return NextResponse.json(
      { error: "Failed to create share link", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  // -- 6. Build response ----------------------------------------------------
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    `https://${request.headers.get("host") ?? "localhost:3000"}`;
  const url = `${appUrl}/share/${token}`;

  return NextResponse.json(
    {
      share: share as unknown as SharedLink,
      url,
    },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// GET /api/share -- List share links for a project
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ListSharesResponse | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  // -- 2. Parse projectId query param ---------------------------------------
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get("projectId")?.trim();

  // -- 3. Query shares — all projects if no projectId given (P14: tenant-scoped)
  let query = supabase.from("shared_links").select("*");

  if (projectId && UUID_RE.test(projectId)) {
    // Filter by project_id if provided (RLS handles access)
    query = query.eq("project_id", projectId);
  }
  // P14: RLS on shared_links enforces creator-or-admin ownership.
  // No project_members query needed — tenant-level RLS handles it.

  const { data: shares, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch shares", code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({
    shares: (shares ?? []) as unknown as SharedLink[],
  });
}
