// ---------------------------------------------------------------------------
// TrustVault P6 — AI API Client tests
// Tests type exports, function signatures, and fetch behavior.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ingestDocuments,
  listSessions,
  getSession,
  deleteSession,
  ApiClientError,
} from "./ai-api-client";
import type {
  Citation,
  ChatSession,
  ChatMessage,
  IngestRequest,
  IngestResponse,
  ChatRequest,
  ListSessionsResponse,
  GetSessionResponse,
  SSETokenPayload,
  SSECitationsPayload,
  SSEDonePayload,
  SSEErrorPayload,
} from "./ai-api-client";

// ---------------------------------------------------------------------------
// Type contract tests — validate shapes at compile time via runtime checks
// These guard against accidental type changes.
// ---------------------------------------------------------------------------

describe("ai-api-client type contracts", () => {
  it("Citation type has required fields", () => {
    const c: Citation = {
      document_id: "550e8400-e29b-41d4-a716-446655440000",
      document_name: "contract.pdf",
      chunk_index: 0,
      snippet: "Payment terms...",
    };
    expect(c.document_id).toBeTypeOf("string");
    expect(c.document_name).toBeTypeOf("string");
    expect(c.chunk_index).toBeTypeOf("number");
    expect(c.snippet).toBeTypeOf("string");
  });

  it("ChatSession type has required fields", () => {
    const s: ChatSession = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      user_id: "550e8400-e29b-41d4-a716-446655440002",
      title: "New Chat",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    };
    expect(s.id).toBeTypeOf("string");
    expect(s.user_id).toBeTypeOf("string");
    expect(s.title).toBeTypeOf("string");
    expect(s.created_at).toBeTypeOf("string");
    expect(s.updated_at).toBeTypeOf("string");
  });

  it("ChatMessage type has required fields", () => {
    const m: ChatMessage = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      session_id: "550e8400-e29b-41d4-a716-446655440001",
      role: "user",
      content: "Hello",
      citations: null,
      created_at: "2026-07-01T00:00:00.000Z",
    };
    expect(m.role).toBe("user");
    expect(m.content).toBeTypeOf("string");
    expect(m.citations).toBeNull();
  });

  it("ChatMessage with citations has correctly shaped Citation array", () => {
    const m: ChatMessage = {
      id: "msg-1",
      session_id: "sess-1",
      role: "assistant",
      content: "Based on the documents...",
      citations: [
        {
          document_id: "d1",
          document_name: "Contract A",
          chunk_index: 2,
          snippet: "Payment terms: Net 30",
        },
      ],
      created_at: "2026-07-01T00:00:00.000Z",
    };
    expect(m.role).toBe("assistant");
    expect(m.citations).toHaveLength(1);
    expect(m.citations![0].document_name).toBe("Contract A");
  });

  it("IngestRequest type accepts array of document IDs", () => {
    const req: IngestRequest = {
      documentIds: [
        "550e8400-e29b-41d4-a716-446655440000",
        "550e8400-e29b-41d4-a716-446655440001",
      ],
    };
    expect(req.documentIds).toHaveLength(2);
  });

  it("IngestResponse type has summary fields", () => {
    const resp: IngestResponse = {
      ingested: 3,
      failed: 1,
      totalChunks: 45,
      errors: ["doc-2: EMPTY_TEXT"],
    };
    expect(resp.ingested).toBe(3);
    expect(resp.failed).toBe(1);
    expect(resp.totalChunks).toBe(45);
    expect(resp.errors).toHaveLength(1);
  });

  it("ChatRequest type accepts optional sessionId", () => {
    const withSession: ChatRequest = {
      sessionId: "550e8400-0000-0000-0000-000000000000",
      message: "Hello",
    };
    expect(withSession.sessionId).toBeDefined();

    const withoutSession: ChatRequest = {
      message: "Hello",
    };
    expect(withoutSession.sessionId).toBeUndefined();
  });

  it("ListSessionsResponse type wraps sessions array", () => {
    const resp: ListSessionsResponse = {
      sessions: [
        {
          id: "s1",
          user_id: "u1",
          title: "Chat 1",
          created_at: "2026-07-01T00:00:00.000Z",
          updated_at: "2026-07-01T00:00:00.000Z",
        },
      ],
    };
    expect(resp.sessions).toHaveLength(1);
  });

  it("GetSessionResponse type wraps session + messages", () => {
    const resp: GetSessionResponse = {
      session: {
        id: "s1",
        user_id: "u1",
        title: "Chat",
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
      },
      messages: [
        {
          id: "m1",
          session_id: "s1",
          role: "user",
          content: "Hello",
          citations: null,
          created_at: "2026-07-01T00:00:00.000Z",
        },
      ],
    };
    expect(resp.messages).toHaveLength(1);
    expect(resp.session.id).toBe("s1");
  });

  it("SSE payload types have correct shapes", () => {
    const token: SSETokenPayload = { token: "Hello" };
    const citations: SSECitationsPayload = {
      citations: [
        {
          document_id: "d1",
          document_name: "Doc",
          chunk_index: 0,
          snippet: "Text...",
        },
      ],
    };
    const done: SSEDonePayload = {
      sessionId: "s1",
      messageId: "m1",
    };
    const error: SSEErrorPayload = {
      error: "Something went wrong",
      code: "INTERNAL_ERROR",
    };

    expect(token.token).toBe("Hello");
    expect(citations.citations).toHaveLength(1);
    expect(done.sessionId).toBe("s1");
    expect(error.code).toBe("INTERNAL_ERROR");
  });
});

// ---------------------------------------------------------------------------
// ApiClientError — error class behavior
// ---------------------------------------------------------------------------

describe("ApiClientError", () => {
  it("stores message, status, and code", () => {
    const err = new ApiClientError("Not Found", 404, "NOT_FOUND");
    expect(err.message).toBe("Not Found");
    expect(err.status).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("is an instance of Error", () => {
    const err = new ApiClientError("Oops", 500, "DB_ERROR");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiClientError);
  });

  it("allows undefined code", () => {
    const err = new ApiClientError("Generic error", 400);
    expect(err.code).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// API function behavior — mocked fetch
// ---------------------------------------------------------------------------

describe("ai-api-client fetch behavior", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- ingestDocuments ----

  describe("ingestDocuments", () => {
    it("calls POST /api/assistant/ingest with documentIds array", async () => {
      const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          ingested: 2,
          failed: 0,
          totalChunks: 30,
          errors: [],
        } as IngestResponse),
      } as unknown as Response);

      const result = await ingestDocuments([
        "550e8400-e29b-41d4-a716-446655440000",
        "550e8400-e29b-41d4-a716-446655440001",
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith("/api/assistant/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentIds: [
            "550e8400-e29b-41d4-a716-446655440000",
            "550e8400-e29b-41d4-a716-446655440001",
          ],
        }),
      });
      expect(result.ingested).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.totalChunks).toBe(30);
    });

    it("handles empty documentIds array", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          ingested: 0,
          failed: 0,
          totalChunks: 0,
          errors: [],
        } as IngestResponse),
      } as unknown as Response);

      const result = await ingestDocuments([]);
      expect(result.ingested).toBe(0);
    });

    it("throws ApiClientError on non-OK response", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({
          error: "documentIds must be a non-empty array",
          code: "INVALID_DOCUMENT_IDS",
        }),
      } as unknown as Response);

      await expect(ingestDocuments([])).rejects.toThrow(ApiClientError);
      await expect(ingestDocuments([])).rejects.toMatchObject({
        message: "documentIds must be a non-empty array",
        status: 400,
        code: "INVALID_DOCUMENT_IDS",
      });
    });
  });

  // ---- listSessions ----

  describe("listSessions", () => {
    it("calls GET /api/assistant/sessions ", async () => {
      const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          sessions: [
            {
              id: "s1",
                  user_id: "u1",
              title: "Chat",
              created_at: "2026-07-01T00:00:00.000Z",
              updated_at: "2026-07-01T00:00:00.000Z",
            },
          ],
        } as ListSessionsResponse),
      } as unknown as Response);

      const result = await listSessions();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith("/api/assistant/sessions");
      expect(result.sessions).toHaveLength(1);
    });

    it("lists sessions", async () => {
      const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ sessions: [] }),
      } as unknown as Response);

      await listSessions();
      expect(mockFetch).toHaveBeenCalledWith("/api/assistant/sessions");
    });

    it("throws ApiClientError on non-OK response", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({
          error: "session not found",
          code: "MISSING_PROJECT_ID",
        }),
      } as unknown as Response);

      await expect(listSessions()).rejects.toThrow(ApiClientError);
    });
  });

  // ---- getSession ----

  describe("getSession", () => {
    it("calls GET /api/assistant/sessions/:id", async () => {
      const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          session: {
            id: "s1",
              user_id: "u1",
            title: "Chat",
            created_at: "2026-07-01T00:00:00.000Z",
            updated_at: "2026-07-01T00:00:00.000Z",
          },
          messages: [
            {
              id: "m1",
              session_id: "s1",
              role: "user",
              content: "Hello",
              citations: null,
              created_at: "2026-07-01T00:00:00.000Z",
            },
          ],
        } as GetSessionResponse),
      } as unknown as Response);

      const result = await getSession(
        "550e8400-e29b-41d4-a716-446655440000",
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/assistant/sessions/550e8400-e29b-41d4-a716-446655440000",
      );
      expect(result.session.id).toBe("s1");
      expect(result.messages).toHaveLength(1);
    });

    it("throws ApiClientError on 404", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 404,
        json: vi.fn().mockResolvedValue({
          error: "Session not found",
          code: "NOT_FOUND",
        }),
      } as unknown as Response);

      await expect(getSession("nonexistent")).rejects.toThrow(ApiClientError);
    });
  });

  // ---- deleteSession ----

  describe("deleteSession", () => {
    it("calls DELETE /api/assistant/sessions/:id", async () => {
      const mockFetch = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ deleted: true }),
      } as unknown as Response);

      const result = await deleteSession(
        "550e8400-e29b-41d4-a716-446655440000",
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/assistant/sessions/550e8400-e29b-41d4-a716-446655440000",
        { method: "DELETE" },
      );
      expect(result.deleted).toBe(true);
    });

    it("throws ApiClientError on non-OK response", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({
          error: "Failed to delete session",
          code: "DB_ERROR",
        }),
      } as unknown as Response);

      await expect(deleteSession("uuid")).rejects.toThrow(ApiClientError);
    });
  });

  // ---- Error propagation when body is not JSON ----

  describe("error handling when body is not JSON", () => {
    it("throws ApiClientError with HTTP status message for non-JSON error body", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValue(new Error("Not JSON")),
      } as unknown as Response);

      await expect(getSession("uuid")).rejects.toMatchObject({
        message: "HTTP 500",
        status: 500,
      });
    });
  });
});
