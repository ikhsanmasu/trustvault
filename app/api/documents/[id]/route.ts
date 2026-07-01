import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/client";
import type {
  GetDocumentResponse,
  ErrorResponse,
  Document,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validates that a string is a properly formatted UUID (v4/hex). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// GET /api/documents/:id (P2: auth required, RLS enforces access)
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<GetDocumentResponse | ErrorResponse>> {
  // ── 1. requireAuth ─────────────────────────────────────────────────────
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { id } = await params;

  // ── 2. Validate UUID format ────────────────────────────────────────────
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Invalid document ID format", code: "INVALID_ID" },
      { status: 400 },
    );
  }

  // ── 3. Fetch from database (user-scoped client, RLS-enforced) ──────────
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: `Document not found: ${id}`, code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    document: data as unknown as Document,
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/documents/:id — Soft-delete or restore a document
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<GetDocumentResponse | ErrorResponse>> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid document ID", code: "INVALID_ID" }, { status: 400 });
  }

  let body: { action?: string; project_id?: string; description?: string; notes?: string };
  try { body = (await request.json()) as { action?: string; project_id?: string; description?: string; notes?: string }; } catch {
    return NextResponse.json({ error: "Invalid body", code: "INVALID_REQUEST" }, { status: 400 });
  }

  const action = body.action === "restore" ? "restore" : body.action === "move" ? "move" : body.action === "edit" ? "edit" : "delete";

  // Verify membership via project
  const { data: doc } = await supabase.from("documents").select("project_id, tenant_id").eq("id", id).single();
  if (!doc) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  const { data: member } = await supabase.from("project_members").select("role").eq("project_id", doc.project_id).eq("user_id", user.id).single();
  if (!member || !["admin", "editor"].includes(member.role)) {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  // ---- Edit: update description, notes, and/or project ----
  if (action === "edit") {
    const updates: Record<string, unknown> = {};
    if (body.description !== undefined) updates.description = body.description.slice(0, 1000);
    if (body.notes !== undefined) updates.notes = body.notes.slice(0, 5000);
    if (body.project_id) {
      if (!UUID_RE.test(body.project_id)) {
        return NextResponse.json({ error: "Invalid project_id", code: "INVALID_PROJECT_ID" }, { status: 400 });
      }
      const { data: tp } = await supabase.from("projects").select("id, tenant_id").eq("id", body.project_id).single();
      if (!tp || tp.tenant_id !== doc.tenant_id) {
        return NextResponse.json({ error: "Target project not found", code: "INVALID_TARGET" }, { status: 400 });
      }
      updates.project_id = body.project_id;
      await supabase.from("document_chunks").update({ project_id: body.project_id }).eq("document_id", id);
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update", code: "NO_FIELDS" }, { status: 400 });
    }
    const { data: updated, error: updErr } = await supabase.from("documents").update(updates).eq("id", id).select("*").single();
    if (updErr || !updated) return NextResponse.json({ error: "Update failed", code: "DB_ERROR" }, { status: 500 });
    return NextResponse.json({ document: updated as unknown as Document });
  }

  // ---- Move: change document's project ----
  if (action === "move") {
    const targetProjectId = body.project_id;
    if (!targetProjectId || !UUID_RE.test(targetProjectId)) {
      return NextResponse.json({ error: "Invalid project_id", code: "INVALID_PROJECT_ID" }, { status: 400 });
    }
    // Verify target project exists in same tenant
    const { data: targetProject } = await supabase.from("projects").select("id, tenant_id").eq("id", targetProjectId).single();
    if (!targetProject || targetProject.tenant_id !== doc.tenant_id) {
      return NextResponse.json({ error: "Target project not found or different tenant", code: "INVALID_TARGET" }, { status: 400 });
    }
    // Move chunks too
    await supabase.from("document_chunks").update({ project_id: targetProjectId }).eq("document_id", id);
    const { data: updated, error: updErr } = await supabase.from("documents").update({ project_id: targetProjectId }).eq("id", id).select("*").single();
    if (updErr || !updated) return NextResponse.json({ error: "Update failed", code: "DB_ERROR" }, { status: 500 });
    return NextResponse.json({ document: updated as unknown as Document });
  }

  if (action === "delete") {
    // Delete the actual file from storage, keep the DB row with hashes
    const { data: docFull } = await supabase.from("documents").select("storage_path").eq("id", id).single();
    if (docFull?.storage_path) {
      // Use service client to bypass RLS on storage
      await createServiceClient().storage.from("pdf-uploads").remove([docFull.storage_path]);
    }
    const deletedAt = new Date().toISOString();
    const { data: updated, error: updErr } = await supabase.from("documents").update({ deleted_at: deletedAt, deleted_by: user.id, extracted_text: "", file_size_bytes: 0 }).eq("id", id).select("*").single();
    if (updErr || !updated) return NextResponse.json({ error: "Update failed", code: "DB_ERROR" }, { status: 500 });
    return NextResponse.json({ document: updated as unknown as Document });
  }

  // Restore: can't recover file, just mark as active
  const { data: updated, error: updErr } = await supabase.from("documents").update({ deleted_at: null, deleted_by: null }).eq("id", id).select("*").single();
  if (updErr || !updated) return NextResponse.json({ error: "Update failed", code: "DB_ERROR" }, { status: 500 });
  return NextResponse.json({ document: updated as unknown as Document });
}
