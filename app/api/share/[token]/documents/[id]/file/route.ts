import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { isValidUUID } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidToken(token: string): boolean {
  return /^[0-9a-f]{32}$/i.test(token);
}

async function getShareByToken(
  token: string,
): Promise<{
  document_ids: string[];
  is_active: boolean;
  allow_download: boolean;
  expires_at: string | null;
} | null> {
  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("shared_links")
    .select("document_ids, is_active, allow_download, expires_at")
    .eq("token", token)
    .single();

  if (error || !data) return null;
  return data as unknown as {
    document_ids: string[];
    is_active: boolean;
    allow_download: boolean;
    expires_at: string | null;
  };
}

// ---------------------------------------------------------------------------
// GET /api/share/[token]/documents/[id]/file — PUBLIC download
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
): Promise<NextResponse> {
  const { token, id } = await params;

  // Validate token format
  if (!isValidToken(token)) {
    return NextResponse.json(
      { error: "Invalid share token", code: "INVALID_TOKEN" },
      { status: 400 },
    );
  }

  // Validate document ID format
  if (!isValidUUID(id)) {
    return NextResponse.json(
      { error: "Invalid document ID", code: "INVALID_ID" },
      { status: 400 },
    );
  }

  const rateLimit = await checkRateLimit(`share-download:${token}`, 10, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many download requests", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(Math.max(rateLimit.resetAt - Math.ceil(Date.now() / 1000), 1)) } });
  }

  // Validate share
  const share = await getShareByToken(token);
  if (!share) {
    return NextResponse.json(
      { error: "Share link not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  if (!share.is_active) {
    return NextResponse.json(
      { error: "This share link has been revoked", code: "GONE" },
      { status: 410 },
    );
  }

  if (share.expires_at) {
    const expiresAt = new Date(share.expires_at);
    if (expiresAt <= new Date()) {
      return NextResponse.json(
        { error: "This share link has expired", code: "GONE" },
        { status: 410 },
      );
    }
  }

  // Check download permission
  if (!share.allow_download) {
    return NextResponse.json(
      { error: "Download is not permitted for this share", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  // Check document is in the share's documentIds
  if (!share.document_ids.includes(id)) {
    return NextResponse.json(
      { error: "Document not found in this share", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // Fetch the document record
  const serviceClient = createServiceClient();
  const { data: doc, error: docError } = await serviceClient
    .from("documents")
    .select("storage_path, file_type, name, original_filename, deleted_at")
    .eq("id", id)
    .single();

  if (docError || !doc) {
    return NextResponse.json(
      { error: "Document not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  if (doc.deleted_at) {
    return NextResponse.json(
      { error: "This document has been deleted", code: "GONE" },
      { status: 410 },
    );
  }

  // Download file from storage (service client bypasses RLS)
  const { data: blob, error: dlErr } = await serviceClient
    .storage
    .from("pdf-uploads")
    .download(doc.storage_path);

  if (dlErr || !blob) {
    return NextResponse.json(
      { error: "Failed to download file", code: "STORAGE_ERROR" },
      { status: 500 },
    );
  }

  // Use original_filename for download if available (preserves extension)
  const downloadName = (doc.original_filename as string) || doc.name || "document";
  const isDownload = _request.nextUrl.searchParams.get("dl") === "1";

  return new NextResponse(blob, {
    headers: {
      "Content-Type": doc.file_type || "application/octet-stream",
      "Content-Disposition": isDownload
        ? `attachment; filename="${downloadName}"`
        : `inline; filename="${downloadName}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
