import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getUserTenantId } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // Fetch document — RLS enforces tenant-scoped access (P11)
  const { data: doc, error } = await supabase
    .from("documents")
    .select("storage_path, tenant_id, file_type, name, deleted_at")
    .eq("id", id)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (doc.deleted_at) {
    return NextResponse.json({ error: "This document has been deleted", code: "GONE" }, { status: 410 });
  }

  // P11: verify tenant access (handle null project_id gracefully)
  const tenantId = await getUserTenantId(supabase, user.id);
  if (!tenantId || doc.tenant_id !== tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Download file via service client
  const { data: blob, error: dlErr } = await createServiceClient()
    .storage.from("pdf-uploads")
    .download(doc.storage_path);

  if (dlErr || !blob) {
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
  }

  return new NextResponse(blob, {
    headers: {
      "Content-Type": doc.file_type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${doc.name}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
