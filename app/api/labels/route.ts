import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getUserTenantId } from "@/lib/supabase/auth";

// GET /api/labels — list labels for current tenant
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const tenantId = await getUserTenantId(supabase, user.id);
  if (!tenantId) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  const { data, error } = await supabase
    .from("labels")
    .select("id, name, color, created_at")
    .eq("tenant_id", tenantId)
    .order("name");

  if (error) return NextResponse.json({ error: "DB error", code: "DB_ERROR" }, { status: 500 });
  return NextResponse.json({ labels: data });
}

// POST /api/labels — create a new label
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const tenantId = await getUserTenantId(supabase, user.id);
  if (!tenantId) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  let body: { name?: string; color?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid body", code: "INVALID_REQUEST" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name || name.length > 50) {
    return NextResponse.json({ error: "Label name required (max 50)", code: "INVALID_NAME" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("labels")
    .insert({ tenant_id: tenantId, name, color: body.color ?? "#6366f1" })
    .select("id, name, color, created_at")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Label already exists", code: "DUPLICATE" }, { status: 409 });
    return NextResponse.json({ error: "DB error", code: "DB_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ label: data }, { status: 201 });
}

// DELETE /api/labels?id=xxx — delete a label
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const tenantId = await getUserTenantId(supabase, user.id);
  if (!tenantId) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required", code: "INVALID_ID" }, { status: 400 });

  // Verify label belongs to tenant
  const { data: label } = await supabase.from("labels").select("id").eq("id", id).eq("tenant_id", tenantId).single();
  if (!label) return NextResponse.json({ error: "Label not found", code: "NOT_FOUND" }, { status: 404 });

  await supabase.from("labels").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
