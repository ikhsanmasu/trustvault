import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireTenantRole } from "@/lib/supabase/auth";
import { isValidUUID } from '@/lib/utils';

// GET /api/documents/:id/labels — list labels for a document
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;
  const { id } = await params;
  if (!isValidUUID(id)) return NextResponse.json({ error: "Invalid ID", code: "INVALID_ID" }, { status: 400 });

  const { data, error } = await supabase
    .from("document_labels")
    .select("label_id, labels(id, name, color)")
    .eq("document_id", id);

  if (error) return NextResponse.json({ error: "DB error", code: "DB_ERROR" }, { status: 500 });

  const labels = ((data ?? []) as unknown as { labels: { id: string; name: string; color: string }[] | { id: string; name: string; color: string } | null }[])
    .flatMap((r) => {
      if (!r.labels) return [];
      return Array.isArray(r.labels) ? r.labels : [r.labels];
    });

  return NextResponse.json({ labels });
}

// POST /api/documents/:id/labels — attach labels to a document
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;
  const { id } = await params;
  if (!isValidUUID(id)) return NextResponse.json({ error: "Invalid ID", code: "INVALID_ID" }, { status: 400 });

  const roleCheck = await requireTenantRole(supabase, user.id, ["owner", "admin", "editor"]);
  if (!roleCheck.ok) return roleCheck.response;

  let body: { labelIds?: string[] };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid body", code: "INVALID_REQUEST" }, { status: 400 });
  }

  if (!body.labelIds?.length) {
    return NextResponse.json({ error: "labelIds required", code: "MISSING_LABELS" }, { status: 400 });
  }

  const rows = body.labelIds.map((lid) => ({ document_id: id, label_id: lid }));
  const { error } = await supabase.from("document_labels").upsert(rows, { onConflict: "document_id,label_id" });

  if (error) return NextResponse.json({ error: "DB error", code: "DB_ERROR" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/documents/:id/labels — remove labels from a document
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;
  const { id } = await params;
  if (!isValidUUID(id)) return NextResponse.json({ error: "Invalid ID", code: "INVALID_ID" }, { status: 400 });

  const url = new URL(request.url);
  const labelId = url.searchParams.get("labelId");
  if (!labelId || !isValidUUID(labelId)) return NextResponse.json({ error: "labelId required", code: "INVALID_LABEL_ID" }, { status: 400 });

  const roleCheck = await requireTenantRole(supabase, user.id, ["owner", "admin", "editor"]);
  if (!roleCheck.ok) return roleCheck.response;

  await supabase.from("document_labels").delete().eq("document_id", id).eq("label_id", labelId);
  return NextResponse.json({ ok: true });
}
