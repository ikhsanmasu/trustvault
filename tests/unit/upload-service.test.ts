// ---------------------------------------------------------------------------
// TrustVault — Upload Service Unit Tests
// ---------------------------------------------------------------------------
import { describe, it, expect } from "vitest";
import {
  validateUpload,
  generateStoragePath,
} from "@/lib/services/upload-service";
import { computeBinaryHash, computeTextHash } from "@/lib/core";

describe("Upload Service — validateUpload", () => {
  function makeFile(name: string, type: string, size: number): File {
    return new File([new Uint8Array(size)], name, { type });
  }

  it("rejects unsupported MIME type", () => {
    const result = validateUpload({ file: makeFile("test.exe", "application/x-msdownload", 100), name: "test" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_FILE_TYPE");
      expect(result.status).toBe(415);
    }
  });

  it("rejects file exceeding 20 MB", () => {
    const result = validateUpload({ file: makeFile("big.pdf", "application/pdf", 21_000_000), name: "big" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FILE_TOO_LARGE");
  });

  it("rejects empty file", () => {
    const result = validateUpload({ file: makeFile("empty.txt", "text/plain", 0), name: "empty" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("EMPTY_FILE");
  });

  it("accepts valid PDF", () => {
    const result = validateUpload({ file: makeFile("doc.pdf", "application/pdf", 1024), name: "My Doc" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mimeType).toBe("application/pdf");
      expect(result.name).toBe("My Doc");
      expect(result.originalFilename).toBe("doc.pdf");
    }
  });

  it("accepts all 14 allowed MIME types", () => {
    const types = [
      "text/plain", "text/csv", "text/html", "text/markdown",
      "text/xml", "application/json", "application/xml", "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel", "application/msword",
      "application/rtf", "application/vnd.oasis.opendocument.text",
    ];
    for (const t of types) {
      const result = validateUpload({ file: makeFile("test", t, 100), name: null });
      expect(result.ok).toBe(true);
    }
  });

  it("falls back to original filename when name is not provided", () => {
    const result = validateUpload({ file: makeFile("contract-draft.pdf", "application/pdf", 500), name: null });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.name).toBe("contract-draft");
  });

  it("truncates names > 255 chars", () => {
    const longName = "x".repeat(300);
    const result = validateUpload({ file: makeFile("f", "text/plain", 1), name: longName });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.name.length).toBeLessThanOrEqual(255);
  });

  it("rejects when neither name nor filename yields a non-empty name", () => {
    const result = validateUpload({ file: makeFile("", "text/plain", 1), name: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MISSING_NAME");
  });
});

describe("Upload Service — generateStoragePath", () => {
  it("includes year and UUID pattern", () => {
    const path = generateStoragePath("application/pdf");
    expect(path).toMatch(/^uploads\/\d{4}\/[0-9a-f-]+\.pdf$/);
  });

  it("prefixes the tenant ID when provided (P21)", () => {
    const tenantId = "3f9c33aa-2e5b-4a31-9a63-0f6a5b1c2d3e";
    const path = generateStoragePath("application/pdf", tenantId);
    expect(path).toMatch(
      new RegExp(`^uploads/${tenantId}/\\d{4}/[0-9a-f-]+\\.pdf$`),
    );
  });

  it("uses correct extension for each MIME type", () => {
    expect(generateStoragePath("application/pdf")).toContain(".pdf");
    expect(generateStoragePath("text/plain")).toContain(".txt");
    expect(generateStoragePath("application/json")).toContain(".json");
    expect(generateStoragePath("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toContain(".docx");
  });

  it("produces unique paths on successive calls", () => {
    const paths = new Set(Array.from({ length: 10 }, () => generateStoragePath("text/plain")));
    expect(paths.size).toBe(10);
  });
});

describe("Upload Service — hashing consistency", () => {
  it("computeBinaryHash is deterministic", () => {
    const buf = Buffer.from("consistency check");
    expect(computeBinaryHash(buf)).toBe(computeBinaryHash(buf));
  });

  it("computeTextHash is deterministic", () => {
    expect(computeTextHash("hello")).toBe(computeTextHash("hello"));
  });

  it("binary and text hashes are both valid SHA-256 hex", () => {
    const buf = Buffer.from("binary content");
    const text = "text content";
    const bh = computeBinaryHash(buf);
    const th = computeTextHash(text);
    expect(bh).toMatch(/^[0-9a-f]{64}$/);
    expect(th).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different buffers produce different binary hashes", () => {
    expect(computeBinaryHash(Buffer.from("a"))).not.toBe(computeBinaryHash(Buffer.from("b")));
  });

  it("different text produces different text hashes", () => {
    expect(computeTextHash("hello")).not.toBe(computeTextHash("world"));
  });
});
