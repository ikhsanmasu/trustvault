import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  computeBinaryHash,
  extractFileText,
  computeTextHash,
  isAllowedMimeType,
  getFileExtension,
} from "@/lib/core";
import {
  requireAuth,
  requireProjectRole,
  getUserTenantId,
} from "@/lib/supabase/auth";
import type {
  UploadResponse,
  ListDocumentsResponse,
  ErrorResponse,
  Document,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 20_971_520; // 20 MB in bytes
const MAX_NAME_LENGTH = 255;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Loosely validates that a string looks like a UUID. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const projectIdRaw = formData.get("project_id");

  // -- 3. Validate file presence --------------------------------------------
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No file provided", code: "MISSING_FILE" },
      { status: 400 },
    );
  }

  // -- 4. Validate file type (P3: 14 MIME types accepted) -------------------
  if (!isAllowedMimeType(file.type)) {
    return NextResponse.json(
      {
        error: `Unsupported file type: ${file.type}. Allowed types: text/plain, text/csv, text/html, text/markdown, text/xml, application/json, application/xml, application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, application/msword, application/rtf, application/vnd.oasis.opendocument.text`,
        code: "INVALID_FILE_TYPE",
      },
      { status: 415 },
    );
  }

  const mimeType = file.type;

  // -- 5. Validate file size ------------------------------------------------
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File exceeds 20 MB limit", code: "FILE_TOO_LARGE" },
      { status: 413 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json(
      { error: "File is empty", code: "EMPTY_FILE" },
      { status: 400 },
    );
  }

  // -- 6. Validate name -----------------------------------------------------
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Document name is required", code: "MISSING_NAME" },
      { status: 400 },
    );
  }

  const trimmedName = name.trim();
  if (trimmedName.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      {
        error: `Document name must be ${MAX_NAME_LENGTH} characters or fewer`,
        code: "NAME_TOO_LONG",
      },
      { status: 400 },
    );
  }

  // -- 7. Validate project_id (P2: required) --------------------------------
  if (
    !projectIdRaw ||
    typeof projectIdRaw !== "string" ||
    projectIdRaw.trim().length === 0
  ) {
    return NextResponse.json(
      { error: "project_id is required", code: "MISSING_PROJECT_ID" },
      { status: 400 },
    );
  }

  const projectId = projectIdRaw.trim();
  if (!UUID_RE.test(projectId)) {
    return NextResponse.json(
      {
        error: "project_id must be a valid UUID",
        code: "INVALID_PROJECT_ID",
      },
      { status: 400 },
    );
  }

  // -- 8. Role check: user must be admin or editor --------------------------
  const roleCheck = await requireProjectRole(supabase, user.id, projectId, [
    "admin",
    "editor",
  ]);
  if (!roleCheck.ok) return roleCheck.response;

  // -- 9. Get user's tenant_id ----------------------------------------------
  const tenantId = await getUserTenantId(supabase, user.id);
  if (!tenantId) {
    return NextResponse.json(
      { error: "User profile not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 10. Read file into buffer (two copies: one for extraction, one for upload) --
  const raw = await file.arrayBuffer();
  const fileCopy1 = raw.slice(0);
  const fileCopy2 = raw.slice(0);
  const buffer = Buffer.from(fileCopy1 as ArrayBuffer);

  // -- 11. Compute hashes and extract text (P3: format-aware) ---------------
  const binaryHash = computeBinaryHash(buffer);
  const extractedText = await extractFileText(buffer, mimeType);
  const textHash = computeTextHash(extractedText);

  // -- 12. Generate storage path (P3: correct extension for file type) ------
  const year = new Date().getUTCFullYear().toString();
  const fileUuid = randomUUID();
  const ext = getFileExtension(mimeType);
  const storagePath = `uploads/${year}/${projectId}/${fileUuid}${ext}`;

  // -- 13. Upload to Supabase Storage (user-scoped client) ------------------
  const uploadData = fileCopy2 as ArrayBuffer;
  const { error: storageError } = await supabase.storage
    .from("pdf-uploads")
    .upload(storagePath, uploadData, {
      contentType: mimeType,
      upsert: false,
    });

  if (storageError) {
    if (process.env.NODE_ENV === "development") {
      console.error(
        "[upload] Storage error:",
        JSON.stringify(storageError),
      );
    }
    return NextResponse.json(
      { error: "Failed to store file", code: "STORAGE_ERROR" },
      { status: 500 },
    );
  }

  // -- 14. Insert database row (P3: now includes file_type) -----------------
  const { data: document, error: dbError } = await supabase
    .from("documents")
    .insert({
      name: trimmedName,
      storage_path: storagePath,
      binary_hash: binaryHash,
      text_hash: textHash,
      extracted_text: extractedText,
      file_size_bytes: buffer.length,
      file_type: mimeType,
      tenant_id: tenantId,
      project_id: projectId,
      uploaded_by: user.id,
    })
    .select("*")
    .single();

  if (dbError || !document) {
    if (process.env.NODE_ENV === "development") {
      console.error(
        "[upload] DB error:",
        JSON.stringify(dbError),
        "document:",
        document,
      );
    }
    return NextResponse.json(
      { error: "Failed to save document record", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { document: document as unknown as Document },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// GET /api/documents -- List documents (P2: auth + required project_id filter)
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ListDocumentsResponse | ErrorResponse>> {
  // -- 1. requireAuth -------------------------------------------------------
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const searchParams = request.nextUrl.searchParams;

  // -- 2. Parse optional project_id (P3: optional for cross-project vault) ----
  const projectIdRaw = searchParams.get("project_id");
  const projectId = projectIdRaw?.trim();
  if (projectId !== undefined && projectId.length > 0 && !UUID_RE.test(projectId)) {
    return NextResponse.json(
      { error: "project_id must be a valid UUID", code: "INVALID_PROJECT_ID" },
      { status: 400 },
    );
  }

  // -- 3. Resolve which projects to query --------------------------------------
  let queryProjectIds: string[];
  if (projectId) {
    // Scoped to a single project -- verify membership first
    const roleCheck = await requireProjectRole(supabase, user.id, projectId, [
      "admin", "editor", "viewer",
    ]);
    if (!roleCheck.ok) {
      return NextResponse.json(
        { error: "Access denied", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    queryProjectIds = [projectId];
  } else {
    // No project_id — fetch all user's projects
    const { data: memberships } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id);
    queryProjectIds = (memberships ?? []).map((m: { project_id: string }) => m.project_id);
    if (queryProjectIds.length === 0) {
      return NextResponse.json({ documents: [], total: 0 });
    }
  }

  // -- 4. Parse & validate query parameters ---------------------------------
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

  // -- 5. Build query -- filter by resolved project IDs (P3: cross-project) ----
  const includeDeleted = searchParams.get("include_deleted") === "true";
  let query = supabase
    .from("documents")
    .select("*", { count: "exact" })
    .in("project_id", queryProjectIds);

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
    documents: (data ?? []) as unknown as Document[],
    total: count ?? 0,
  });
}
