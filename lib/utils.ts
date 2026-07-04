import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function truncateHash(hash: string, chars = 12): string {
  if (hash.length <= chars * 2) return hash;
  return `${hash.slice(0, chars)}…${hash.slice(-chars)}`;
}

// ---------------------------------------------------------------------------
// Shared validation helpers
// ---------------------------------------------------------------------------

/** Validates that a string is a properly formatted UUID v4. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns true if `id` looks like a UUID v4. */
export function isValidUUID(id: string): boolean {
  return UUID_RE.test(id);
}

// ---------------------------------------------------------------------------
// Security: error message sanitization
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Input sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitizes user-provided string input for safe storage/display.
 * - Strips null bytes (prevent null-byte injection)
 * - Strips control characters except newlines and tabs
 * - Normalizes excessive whitespace (collapses 3+ spaces)
 * - Trims leading/trailing whitespace
 * - Truncates to maxLength (default 10,000)
 */
export function sanitizeString(input: string, maxLength = 10_000): string {
  let cleaned = input;
  // Strip null bytes
  cleaned = cleaned.replace(/\x00/g, "");
  // Strip control characters (keep \n, \r, \t)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  // Collapse excessive whitespace (3+ spaces → 2 spaces)
  cleaned = cleaned.replace(/ {3,}/g, "  ");
  // Trim
  cleaned = cleaned.trim();
  // Truncate
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength);
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Security: error message sanitization
// ---------------------------------------------------------------------------

/**
 * Returns a safe error message for API responses.
 *
 * In development, returns the actual error detail for debugging.
 * In production, returns a generic message to avoid leaking internal
 * implementation details (DB errors, file paths, stack traces, etc.).
 *
 * @param fallback - Generic message used in production (default: "Internal server error")
 * @param detail   - The actual error detail (only exposed in development)
 */
export function safeError(fallback = "Internal server error", detail?: unknown): string {
  if (process.env.NODE_ENV === "development") {
    const msg = detail instanceof Error ? detail.message : String(detail ?? fallback);
    return msg;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Consistent API error response helper
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";

/**
 * Returns a typed JSON error response.
 *
 * Usage:
 *   return apiError("Document not found", "NOT_FOUND", 404);
 *   return apiError("Invalid input", "INVALID_REQUEST", 400);
 *
 * This eliminates the repetitive `NextResponse.json({ error, code }, { status })` pattern.
 */
export function apiError(
  error: string,
  code: string,
  status: number,
): ReturnType<typeof NextResponse.json> {
  return NextResponse.json({ error, code }, { status });
}
