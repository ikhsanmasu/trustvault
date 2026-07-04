import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  computeBinaryHash,
  extractFileText,
  computeTextHash,
  isAllowedMimeType,
  getFileExtension,
} from "@/lib/core";
import { ingestDocument } from "@/lib/ai-assistant";
import { checkUploadLimit, incrementUsage } from "@/lib/rate-limit";
import {
  requireAuth,
  requireTenantRole,
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

  // -- 3. Get user's tenant_id ----------------------------------------------
  const tenantId = await getUserTenantId(supabase, user.id);
  if (!tenantId) {
    return NextResponse.json(
      { error: "User profile not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // -- 4. Role check: require editor+ (P14 tenant-level RBAC) ----------------
  const roleCheck = await requireTenantRole(supabase, user.id, [
    "owner",
    "admin",
    "editor",
  ]);
  if (!roleCheck.ok) return roleCheck.response;

  // -- 5. Collect files from form data --------------------------------------
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

  // -- 8. Parse description (optional, shared across all files) ----------------
  const descriptionRaw = formData.get("description");
  const sharedDescription: string | undefined =
    typeof descriptionRaw === "string" && descriptionRaw.trim().length > 0
      ? descriptionRaw.trim().slice(0, 1000)
      : undefined;

  // -- 9. Parse names (JSON array, optional) --------------------------------
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

  // -- 9. P17: Check plan limits (doc count + per-file size) -----------------
  const { data: planCheck } = await supabase
    .from("tenants")
    .select("plan, usage_documents")
    .eq("id", tenantId)
    .single();
  const usageDocs = Number(planCheck?.usage_documents ?? 0);

  // Individual file size checks are done per-file below (against plan max).
  // For doc count: check if adding all files would exceed the limit.
  const docLimitResult = await checkUploadLimit(supabase, tenantId, files[0]?.size ?? 0);
  if (!docLimitResult.allowed) {
    return NextResponse.json(
      { error: docLimitResult.reason ?? "Plan limit reached", code: "PLAN_LIMIT_REACHED" },
      { status: 403 },
    );
  }
  if (docLimitResult.limit !== null && usageDocs + files.length > docLimitResult.limit) {
    return NextResponse.json(
      { error: `Uploading ${files.length} files would exceed plan limit (${usageDocs}/${docLimitResult.limit})`, code: "PLAN_LIMIT_REACHED" },
      { status: 403 },
    );
  }

  // -- 10. Sequential processing of each file --------------------------------
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

      // ---- P17: Plan-level file size check ----
      const planFileCheck = await checkUploadLimit(supabase, tenantId, file.size);
      if (!planFileCheck.allowed) {
        results.push({
          status: "error",
          error: planFileCheck.reason ?? "Plan limit reached",
          code: "PLAN_LIMIT_REACHED",
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

      // ---- Generate storage path (P3: correct extension, P11: no project in path) ----
      const fileUuid = randomUUID();
      const storagePath = `uploads/${year}/${fileUuid}${ext}`;

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
          original_filename: file.name,
          storage_path: storagePath,
          binary_hash: binaryHash,
          text_hash: textHash,
          extracted_text: extractedText,
          file_size_bytes: buffer.length,
          file_type: mimeType,
          tenant_id: tenantId,
          uploaded_by: user.id,
          ...(sharedDescription ? { description: sharedDescription } : {}),
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

      // ---- P17: Increment usage counters ----
      await incrementUsage(supabase, tenantId, "documents", { amount: 1 });
      await incrementUsage(supabase, tenantId, "storage_bytes", { amount: buffer.length });

      // ---- Auto-ingest: await chunk + embed ----
      const docId = (document as Record<string, unknown>).id as string;
      let ingestion: { status: string; chunks?: number; error?: string } = { status: "skipped" };

      try {
        if (!extractedText || extractedText.trim().length === 0) {
          ingestion = { status: "empty_text", chunks: 0 };
        } else {
          const records = await ingestDocument(docId, extractedText);
          ingestion = { status: records.length > 0 ? "ok" : "no_chunks", chunks: records.length };
          if (records.length > 0) {
            const { error: insErr } = await supabase.from("document_chunks").insert(
              records.map((r) => ({
                document_id: r.document_id,
                chunk_index: r.chunk_index,
                content: r.content,
                embedding: r.embedding ? `[${r.embedding.join(",")}]` : null,
                token_count: r.token_count,
              })),
            );
            if (insErr) {
              ingestion = { status: "insert_error", error: JSON.stringify(insErr) };
            }
          }
        }
      } catch (err) {
        ingestion = { status: "error", error: String(err) };
      }

      // ---- Success ----
      results.push({
        status: "ok",
        document: document as unknown as Document,
        name: file.name,
        ingestion,
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
    results,
    succeeded,
    failed,
  });
}
