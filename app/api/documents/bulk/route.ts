import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  requireTenantRole,
  getUserTenantId,
} from "@/lib/supabase/auth";
import { uploadDocument } from "@/lib/services/upload-service";
import type {
  BulkUploadResponse,
  BulkUploadItem,
  ErrorResponse,
  Document,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILES = 10;

// ---------------------------------------------------------------------------
// POST /api/documents/bulk -- Upload multiple documents (P3: all 14 types)
// ---------------------------------------------------------------------------
// Files are processed sequentially through the shared upload pipeline
// (lib/services/upload-service.ts) with independent per-file error reporting:
// one bad file never fails the batch.
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

  // -- 4. Collect files from form data --------------------------------------
  const files: File[] = [];
  for (const [, value] of formData.entries()) {
    if (value instanceof File) {
      files.push(value);
    }
  }

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

  // -- 5. Parse description (optional, shared across all files) ----------------
  const descriptionRaw = formData.get("description");
  const sharedDescription: string | undefined =
    typeof descriptionRaw === "string" && descriptionRaw.trim().length > 0
      ? descriptionRaw.trim().slice(0, 1000)
      : undefined;

  // -- 6. Parse names (JSON array, optional) --------------------------------
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

  // -- 7. Sequential processing through the shared pipeline -------------------
  const results: BulkUploadItem[] = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const name =
      i < providedNames.length && providedNames[i].length > 0
        ? providedNames[i]
        : null;

    try {
      const result = await uploadDocument({
        supabase,
        file,
        name,
        description: sharedDescription,
        tenantId,
        userId: user.id,
      });

      if (result.ok) {
        results.push({
          status: "ok",
          document: result.document as unknown as Document,
          name: file.name,
          ingestion: result.ingestion,
        });
        succeeded++;
      } else {
        results.push({
          status: "error",
          error: result.error,
          code: result.code,
          name: file.name,
        });
        failed++;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unexpected error";
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
