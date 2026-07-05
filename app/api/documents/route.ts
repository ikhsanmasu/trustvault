import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_MIME_TYPES } from "@/lib/core";
import {
  requireAuth,
  requireTenantRole,
  getUserTenantId,
} from "@/lib/supabase/auth";
import { uploadDocument } from "@/lib/services/upload-service";
import { parseDocument } from "@/lib/db-schemas";
import type {
  UploadResponse,
  ListDocumentsResponse,
  ErrorResponse,
  Document,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// ---------------------------------------------------------------------------
// POST /api/documents -- Upload a document (P3: all 14 MIME types accepted)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<UploadResponse | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // -- 2. Parse multipart form data -----------------------------------------
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data", code: "MISSING_FILE" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  const name = formData.get("name");

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No file provided", code: "MISSING_FILE" },
      { status: 400 },
    );
  }

  // -- 3. Tenant + role checks (editor+ may upload, P14 RBAC) -----------------
  const tenantId = await getUserTenantId(supabase, user.id);
  if (!tenantId) {
    return NextResponse.json(
      { error: "User profile not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const roleCheck = await requireTenantRole(supabase, user.id, [
    "owner",
    "admin",
    "editor",
  ]);
  if (!roleCheck.ok) return roleCheck.response;

  // -- 4. Run the upload pipeline ---------------------------------------------
  const result = await uploadDocument({
    supabase,
    file,
    name: typeof name === "string" ? name : null,
    tenantId,
    userId: user.id,
  });

  if (!result.ok) {
    const error =
      result.code === "INVALID_FILE_TYPE"
        ? `${result.error}. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`
        : result.error;
    return NextResponse.json(
      { error, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json(
    {
      document: result.document as unknown as UploadResponse["document"],
      ingestion: result.ingestion,
    },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// GET /api/documents -- List documents for the user's tenant
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ListDocumentsResponse | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const searchParams = request.nextUrl.searchParams;

  // -- 2. Get user's tenant_id -----------------------------------------------
  const tenantId = await getUserTenantId(supabase, user.id);
  if (!tenantId) {
    return NextResponse.json(
      { error: "User profile not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 3. Parse & validate query parameters ---------------------------------
  const search = searchParams.get("search")?.trim() || undefined;

  const limitRaw = searchParams.get("limit") ?? String(DEFAULT_LIMIT);
  const limit = parseInt(limitRaw, 10);
  if (isNaN(limit) || !Number.isInteger(limit) || limit < 1) {
    return NextResponse.json(
      { error: "limit must be a positive integer", code: "INVALID_LIMIT" },
      { status: 400 },
    );
  }
  if (limit > MAX_LIMIT) {
    return NextResponse.json(
      { error: `limit must not exceed ${MAX_LIMIT}`, code: "INVALID_LIMIT" },
      { status: 400 },
    );
  }

  const offsetRaw = searchParams.get("offset") ?? "0";
  const offset = parseInt(offsetRaw, 10);
  if (isNaN(offset) || !Number.isInteger(offset) || offset < 0) {
    return NextResponse.json(
      {
        error: "offset must be a non-negative integer",
        code: "INVALID_OFFSET",
      },
      { status: 400 },
    );
  }

  // -- 4. Build query -- filter by tenant_id
  const includeDeleted = searchParams.get("include_deleted") === "true";
  let query = supabase
    .from("documents")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId);

  // Default: exclude soft-deleted documents unless explicitly requested
  if (!includeDeleted) {
    query = query.is("deleted_at", null);
  }
  // When includeDeleted=true, show all (both active and deleted)

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch documents", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    documents: (data ?? []).map(d => parseDocument(d)) as unknown as Document[],
    total: count ?? 0,
  });
}
