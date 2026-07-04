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
  requireTenantRole,
  getUserTenantId,
} from "@/lib/supabase/auth";
import { ingestDocument } from "@/lib/ai-assistant";
import { checkUploadLimit, incrementUsage } from "@/lib/rate-limit";
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

  // -- 6. Resolve name (optional — fallback to original filename) ------------
  const originalFilename = file.name;
  const providedName = name && typeof name === "string" ? name.trim() : "";
  let trimmedName: string;
  if (providedName.length > 0) {
    trimmedName = providedName;
  } else {
    // Fallback: strip extension from original filename
    const dotIndex = originalFilename.lastIndexOf(".");
    trimmedName = dotIndex > 0 ? originalFilename.slice(0, dotIndex) : originalFilename;
  }
  if (trimmedName.length > MAX_NAME_LENGTH) {
    trimmedName = trimmedName.slice(0, MAX_NAME_LENGTH);
  }

  // -- 7. Get user's tenant_id ----------------------------------------------
  const tenantId = await getUserTenantId(supabase, user.id);
  if (!tenantId) {
    return NextResponse.json(
      { error: "User profile not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 8. Role check: require editor+ (P14 tenant-level RBAC) ----------------
  const roleCheck = await requireTenantRole(supabase, user.id, [
    "owner",
    "admin",
    "editor",
  ]);
  if (!roleCheck.ok) return roleCheck.response;

  // -- 9. P17: Check plan upload limits ---------------------------------------
  const uploadLimit = await checkUploadLimit(supabase, tenantId, file.size);
  if (!uploadLimit.allowed) {
    return NextResponse.json(
      { error: uploadLimit.reason ?? "Upload limit reached", code: "PLAN_LIMIT_REACHED" },
      { status: 403 },
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

  // -- 12. Generate storage path (P3: correct extension for file type, P11: no project in path) --
  const year = new Date().getUTCFullYear().toString();
  const fileUuid = randomUUID();
  const ext = getFileExtension(mimeType);
  const storagePath = `uploads/${year}/${fileUuid}${ext}`;

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
      original_filename: originalFilename,
      storage_path: storagePath,
      binary_hash: binaryHash,
      text_hash: textHash,
      extracted_text: extractedText,
      file_size_bytes: buffer.length,
      file_type: mimeType,
      tenant_id: tenantId,
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

  // -- 15. P17: Increment usage counters ------------------------------------
  await incrementUsage(supabase, tenantId, "documents", { amount: 1 });
  await incrementUsage(supabase, tenantId, "storage_bytes", { amount: buffer.length });

  // -- 16. Auto-ingest: await chunk + embed
  const doc = document as Record<string, unknown>;
  const docId = doc.id as string;
  const docText = (extractedText ?? "") as string;

  let ingestion: { status: string; chunks?: number; error?: string } = { status: "skipped" };

  try {
    if (docText.trim().length === 0) {
      ingestion = { status: "empty_text", chunks: 0 };
    } else {
      const records = await ingestDocument(docId, docText);
      ingestion = {
        status: records.length > 0 ? "ok" : "no_chunks",
        chunks: records.length,
      };

      if (records.length > 0) {
        const { error: insertError } = await supabase
          .from("document_chunks")
          .insert(
            records.map((r) => ({
              document_id: r.document_id,
              chunk_index: r.chunk_index,
              content: r.content,
              embedding: r.embedding ? `[${r.embedding.join(",")}]` : null,
              token_count: r.token_count,
            })),
          );
        if (insertError) {
          ingestion = { status: "insert_error", error: JSON.stringify(insertError) };
        }
      }
    }
  } catch (err) {
    ingestion = { status: "error", error: String(err) };
  }

  return NextResponse.json(
    { document: document as unknown as Document, ingestion },
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
    documents: (data ?? []) as unknown as Document[],
    total: count ?? 0,
  });
}
