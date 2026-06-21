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
  BulkUploadResponse,
  BulkUploadItem,
  ErrorResponse,
  Document,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 20_971_520; // 20 MB in bytes
const MAX_FILES = 10;
const MAX_NAME_LENGTH = 255;

/** Loosely validates that a string looks like a UUID. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// POST /api/documents/bulk -- Upload multiple documents (P3: all 14 types)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<BulkUploadResponse | ErrorResponse>> {
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
      { error: "Invalid form data", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  // -- 3. Validate project_id -----------------------------------------------
  const projectIdRaw = formData.get("project_id");
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

  // -- 4. Role check: user must be admin or editor --------------------------
  const roleCheck = await requireProjectRole(supabase, user.id, projectId, [
    "admin",
    "editor",
  ]);
  if (!roleCheck.ok) return roleCheck.response;

  // -- 5. Get user's tenant_id ----------------------------------------------
  const tenantId = await getUserTenantId(supabase);
  if (!tenantId) {
    return NextResponse.json(
      { error: "User profile not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 6. Collect files from form data --------------------------------------
  const files: File[] = [];
  for (const [, value] of formData.entries()) {
    if (value instanceof File && value !== null) {
      files.push(value);
    }
  }

  // -- 7. Validate file count -----------------------------------------------
  if (files.length === 0) {
    return NextResponse.json(
      { error: "No files provided", code: "NO_FILES" },
      { status: 400 },
    );
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      {
        error: `Maximum ${MAX_FILES} files per bulk upload`,
        code: "TOO_MANY_FILES",
      },
      { status: 400 },
    );
  }

  // -- 8. Parse names (JSON array, optional) --------------------------------
  let providedNames: string[] = [];
  const namesRaw = formData.get("names");
  if (namesRaw && typeof namesRaw === "string" && namesRaw.trim().length > 0) {
    try {
      const parsed = JSON.parse(namesRaw) as unknown;
      if (!Array.isArray(parsed)) {
        return NextResponse.json(
          { error: "names must be a JSON array", code: "INVALID_NAMES" },
          { status: 400 },
        );
      }
      providedNames = parsed.map((n: unknown) =>
        typeof n === "string" ? n.trim() : String(n ?? "").trim(),
      );
    } catch {
      return NextResponse.json(
        { error: "names field is not valid JSON", code: "INVALID_NAMES" },
        { status: 400 },
      );
    }
  }

  // -- 9. Sequential processing of each file --------------------------------
  const results: BulkUploadItem[] = [];
  let succeeded = 0;
  let failed = 0;

  const year = new Date().getUTCFullYear().toString();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // Determine display name
    let displayName: string;
    if (i < providedNames.length && providedNames[i].length > 0) {
      displayName = providedNames[i];
    } else {
      const dotIndex = file.name.lastIndexOf(".");
      displayName = dotIndex > 0 ? file.name.slice(0, dotIndex) : file.name;
    }

    try {
      // ---- Validate file type (P3: 14 MIME types) ----
      if (!isAllowedMimeType(file.type)) {
        results.push({
          status: "error",
          error: `Unsupported file type: ${file.type}`,
          code: "INVALID_FILE_TYPE",
          name: file.name,
        });
        failed++;
        continue;
      }

      const mimeType = file.type;
      const ext = getFileExtension(mimeType);

      // ---- Validate file size ----
      if (file.size > MAX_FILE_SIZE) {
        results.push({
          status: "error",
          error: "File exceeds 20 MB limit",
          code: "FILE_TOO_LARGE",
          name: file.name,
        });
        failed++;
        continue;
      }

      if (file.size === 0) {
        results.push({
          status: "error",
          error: "File is empty",
          code: "EMPTY_FILE",
          name: file.name,
        });
        failed++;
        continue;
      }

      // ---- Validate name ----
      const trimmedName = displayName.trim();
      if (trimmedName.length === 0) {
        results.push({
          status: "error",
          error: "Document name is empty",
          code: "MISSING_NAME",
          name: file.name,
        });
        failed++;
        continue;
      }

      const finalName =
        trimmedName.length > MAX_NAME_LENGTH
          ? trimmedName.slice(0, MAX_NAME_LENGTH)
          : trimmedName;

      // ---- Read file ----
      const raw = await file.arrayBuffer();
      const fileCopy1 = raw.slice(0);
      const fileCopy2 = raw.slice(0);
      const buffer = Buffer.from(fileCopy1 as ArrayBuffer);

      // ---- Compute hashes and extract text (P3: format-aware) ----
      const binaryHash = computeBinaryHash(buffer);
      const extractedText = await extractFileText(buffer, mimeType);
      const textHash = computeTextHash(extractedText);

      // ---- Generate storage path (P3: correct extension) ----
      const fileUuid = randomUUID();
      const storagePath = `uploads/${year}/${projectId}/${fileUuid}${ext}`;

      // ---- Upload to Storage ----
      const uploadData = fileCopy2 as ArrayBuffer;
      const { error: storageError } = await supabase.storage
        .from("pdf-uploads")
        .upload(storagePath, uploadData, {
          contentType: mimeType,
          upsert: false,
        });

      if (storageError) {
        results.push({
          status: "error",
          error: "Failed to store file",
          code: "STORAGE_ERROR",
          name: file.name,
        });
        failed++;
        continue;
      }

      // ---- Insert database row ----
      const { data: document, error: dbError } = await supabase
        .from("documents")
        .insert({
          name: finalName,
          storage_path: storagePath,
          binary_hash: binaryHash,
          text_hash: textHash,
          extracted_text: extractedText,
          file_size_bytes: buffer.length,
          mime_type: mimeType,
          tenant_id: tenantId,
          project_id: projectId,
          uploaded_by: user.id,
        })
        .select("*")
        .single();

      if (dbError || !document) {
        results.push({
          status: "error",
          error: "Failed to save document record",
          code: "DB_ERROR",
          name: file.name,
        });
        failed++;
        continue;
      }

      // ---- Success ----
      results.push({
        status: "ok",
        document: document as unknown as Document,
        name: file.name,
      });
      succeeded++;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unexpected error";
      results.push({
        status: "error",
        error: message,
        code: "INTERNAL_ERROR",
        name: file.name,
      });
      failed++;
    }
  }

  return NextResponse.json({
    project_id: projectId,
    results,
    succeeded,
    failed,
  });
}
