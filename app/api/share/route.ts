import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireAuth, requireProjectRole } from "@/lib/supabase/auth";
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

  const { projectId, documentIds, allowDownload, allowChat, title } = body;

  // Validate projectId
  if (!projectId || typeof projectId !== "string" || !UUID_RE.test(projectId)) {
    return NextResponse.json(
      { error: "Valid projectId (UUID) is required", code: "INVALID_PROJECT_ID" },
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

  // -- 3. Check project role (editor or admin) ------------------------------
  const roleCheck = await requireProjectRole(supabase, user.id, projectId, [
    "admin",
    "editor",
  ]);
  if (!roleCheck.ok) return roleCheck.response;

  // -- 4. Verify all documentIds belong to projectId ------------------------
  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select("id")
    .eq("project_id", projectId)
    .in("id", documentIds);

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
        error: `Documents not found in project: ${missing.join(", ")}`,
        code: "DOCUMENT_NOT_IN_PROJECT",
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
      project_id: projectId,
      document_ids: documentIds,
      token,
      created_by: user.id,
      allow_download: allowDownload,
      allow_chat: allowChat,
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
  const { user, supabase } = auth;

  // -- 2. Parse projectId query param ---------------------------------------
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get("projectId")?.trim();

  if (!projectId || !UUID_RE.test(projectId)) {
    return NextResponse.json(
      { error: "Valid projectId query parameter (UUID) is required", code: "INVALID_PROJECT_ID" },
      { status: 400 },
    );
  }

  // -- 3. Verify project membership -----------------------------------------
  const roleCheck = await requireProjectRole(supabase, user.id, projectId, [
    "admin",
    "editor",
    "viewer",
  ]);
  if (!roleCheck.ok) return roleCheck.response;

  // -- 4. List shares -------------------------------------------------------
  const { data: shares, error } = await supabase
    .from("shared_links")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch shares", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    shares: (shares ?? []) as unknown as SharedLink[],
  });
}
