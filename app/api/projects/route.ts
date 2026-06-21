import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getUserTenantId } from "@/lib/supabase/auth";
import type {
  CreateProjectResponse,
  ListProjectsResponse,
  ErrorResponse,
  Project,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_NAME_LENGTH = 255;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// ---------------------------------------------------------------------------
// POST /api/projects — Create a new project
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
): Promise<NextResponse<CreateProjectResponse | ErrorResponse>> {
  // ── 1. requireAuth ─────────────────────────────────────────────────────
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // ── 2. Parse request body ──────────────────────────────────────────────
  let body: { name?: string; description?: string };
  try {
    body = (await request.json()) as { name?: string; description?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid request body", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  // ── 3. Validate name ───────────────────────────────────────────────────
  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json(
      { error: "Project name is required", code: "MISSING_NAME" },
      { status: 400 },
    );
  }

  const trimmedName = body.name.trim();
  if (trimmedName.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      {
        error: `Project name must be ${MAX_NAME_LENGTH} characters or fewer`,
        code: "NAME_TOO_LONG",
      },
      { status: 400 },
    );
  }

  const description = (body.description ?? "").trim();

  // ── 4. Get user's tenant_id ────────────────────────────────────────────
  const tenantId = await getUserTenantId(supabase);
  if (!tenantId) {
    return NextResponse.json(
      { error: "User profile not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // ── 5. Insert project ──────────────────────────────────────────────────
  const { data: project, error: insertError } = await supabase
    .from("projects")
    .insert({
      tenant_id: tenantId,
      name: trimmedName,
      description,
    })
    .select("*")
    .single();

  if (insertError || !project) {
    if (process.env.NODE_ENV === "development") {
      console.error("[projects:create] DB error:", JSON.stringify(insertError));
    }
    return NextResponse.json(
      { error: "Failed to create project", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  // ── 6. Insert creator as admin member ──────────────────────────────────
  const { error: memberError } = await supabase
    .from("project_members")
    .insert({
      project_id: project.id,
      user_id: user.id,
      role: "admin",
    });

  if (memberError) {
    // Project was created but membership failed — best-effort rollback:
    // delete the project so we don't leave an orphan.
    await supabase.from("projects").delete().eq("id", project.id);

    if (process.env.NODE_ENV === "development") {
      console.error("[projects:create] Member insert error:", JSON.stringify(memberError));
    }
    return NextResponse.json(
      { error: "Failed to set project membership", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { project: project as unknown as Project },
    { status: 201 },
  );
}

// ---------------------------------------------------------------------------
// GET /api/projects — List user's projects
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ListProjectsResponse | ErrorResponse>> {
  // ── 1. requireAuth ─────────────────────────────────────────────────────
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const searchParams = request.nextUrl.searchParams;

  // ── 2. Parse & validate query parameters ───────────────────────────────
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

  // ── 3. Get project IDs the user is a member of ─────────────────────────
  const { data: memberships, error: memberError } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("user_id", user.id);

  if (memberError) {
    return NextResponse.json(
      { error: "Failed to fetch project memberships", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  const projectIds = (memberships ?? []).map((m: { project_id: string }) => m.project_id);

  if (projectIds.length === 0) {
    return NextResponse.json({ projects: [], total: 0 });
  }

  // ── 4. Query projects ──────────────────────────────────────────────────
  let query = supabase
    .from("projects")
    .select("*", { count: "exact" })
    .in("id", projectIds);

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data: projects, error: projError, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (projError) {
    return NextResponse.json(
      { error: "Failed to fetch projects", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    projects: (projects ?? []) as unknown as Project[],
    total: count ?? 0,
  });
}
